import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";
import type { CopilotSession, CopilotRequest, CopilotResponseItem } from "../sources/copilot-types.js";
import { estimateTokens } from "../lib/token-estimator.js";

/**
 * Tool call information extracted from Copilot response.
 * Now includes result content from toolCallResults.
 */
export interface CopilotToolCall {
  toolId: string;
  toolName: string;
  invocationMessage: string;
  /** Tool result content (from result.metadata.toolCallResults) */
  resultContent?: string;
}

/**
 * Cumulative token counts by type.
 */
export interface CopilotTokensByType {
  user: number;
  assistant: number;
  thinking: number;  // Always 0 for Copilot sessions
  tool: number;
  total: number;
}

/**
 * Tool block format matching Claude's TurnContent for frontend compatibility.
 */
export interface ToolBlock {
  name: string;
  content: string;
}

/**
 * Turn data with cumulative token statistics.
 */
export interface CopilotTurnData {
  turnIndex: number;
  cumulative: CopilotTokensByType;
  content: {
    userPrompt: string;
    assistantResponse: string;
    toolBlocks: ToolBlock[];
    toolResults?: ToolBlock[];
    thinking?: string;
  };
}

/**
 * Full session structure for visualization.
 */
export interface CopilotSessionStructure {
  sessionId: string;
  source: "copilot";
  title: string;
  turnCount: number;
  totalTokens: number;
  createdAt: number;
  lastModifiedAt: number;
}

/**
 * Response payload for session turns endpoint.
 */
export interface CopilotSessionTurnsResponse {
  sessionId: string;
  source: "copilot";
  totalTurns: number;
  turns: CopilotTurnData[];
}

export class CopilotStructureService {
  async getStructure(sessionId: string, workspaceHash: string): Promise<CopilotSessionStructure> {
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const session = await source.loadSession(sessionId, workspaceHash);

    const nonCanceledRequests = session.requests.filter(r => !r.isCanceled);
    const totalTokens = this.calculateTotalTokens(nonCanceledRequests);

    return {
      sessionId: session.sessionId,
      source: "copilot",
      title: session.customTitle || "Untitled Session",
      turnCount: nonCanceledRequests.length,
      totalTokens,
      createdAt: session.creationDate,
      lastModifiedAt: session.lastMessageDate,
    };
  }

  async getTurns(sessionId: string, workspaceHash: string): Promise<CopilotSessionTurnsResponse> {
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const session = await source.loadSession(sessionId, workspaceHash);

    const nonCanceledRequests = session.requests.filter(r => !r.isCanceled);
    const turns = this.extractTurnsWithCumulative(nonCanceledRequests);

    return {
      sessionId: session.sessionId,
      source: "copilot",
      totalTurns: turns.length,
      turns,
    };
  }

  async getTurn(sessionId: string, workspaceHash: string, turnIndex: number): Promise<CopilotTurnData | null> {
    if (turnIndex < 0) return null;
    const response = await this.getTurns(sessionId, workspaceHash);
    if (turnIndex >= response.turns.length) return null;
    return response.turns[turnIndex];
  }

  private extractTurnsWithCumulative(requests: CopilotRequest[]): CopilotTurnData[] {
    let cumulativeUser = 0;
    let cumulativeAssistant = 0;
    let cumulativeTool = 0;

    return requests.map((request, index) => {
      const userPrompt = request.message.text;
      const assistantResponse = this.extractAssistantText(request.response);
      const toolCalls = this.extractToolCalls(request);

      const toolBlocks: ToolBlock[] = toolCalls.map(tc => ({
        name: tc.toolName,
        content: tc.invocationMessage,
      }));

      const toolResults: ToolBlock[] = toolCalls
        .filter(tc => tc.resultContent)
        .map(tc => ({
          name: tc.toolName,
          content: tc.resultContent!,
        }));

      const userTokens = estimateTokens(userPrompt);
      const assistantTokens = estimateTokens(assistantResponse);
      const toolTokens = this.calculateToolTokens(request);

      cumulativeUser += userTokens;
      cumulativeAssistant += assistantTokens;
      cumulativeTool += toolTokens;

      return {
        turnIndex: index,
        cumulative: {
          user: cumulativeUser,
          assistant: cumulativeAssistant,
          thinking: 0,
          tool: cumulativeTool,
          total: cumulativeUser + cumulativeAssistant + cumulativeTool,
        },
        content: {
          userPrompt,
          assistantResponse,
          toolBlocks,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
          thinking: undefined,
        },
      };
    });
  }

  private calculateTotalTokens(requests: CopilotRequest[]): number {
    return requests.reduce((total, request) => {
      const userTokens = estimateTokens(request.message.text);
      const assistantTokens = estimateTokens(this.extractAssistantText(request.response));
      const toolTokens = this.calculateToolTokens(request);
      return total + userTokens + assistantTokens + toolTokens;
    }, 0);
  }

  private calculateToolTokens(request: CopilotRequest): number {
    let toolTokens = 0;

    for (const item of request.response) {
      if (typeof item === "object" && item !== null && item.kind === "toolInvocationSerialized") {
        const invMsg = this.extractInvocationMessage(item);
        toolTokens += estimateTokens(invMsg);
      }
    }

    const results = request.result?.metadata?.toolCallResults;
    if (results) {
      for (const result of Object.values(results)) {
        if (result.content && Array.isArray(result.content)) {
          for (const contentItem of result.content) {
            if (typeof contentItem.value === "string") {
              toolTokens += estimateTokens(contentItem.value);
            } else if (typeof contentItem.value === "object" && contentItem.value !== null) {
              toolTokens += estimateTokens(JSON.stringify(contentItem.value));
            }
          }
        }
      }
    }

    return toolTokens;
  }

  private extractAssistantText(response: CopilotResponseItem[]): string {
    const textParts: string[] = [];

    for (const item of response) {
      if (typeof item === "object" && item !== null) {
        if ("value" in item && typeof item.value === "string") {
          if (!item.kind || item.kind === "markdownContent") {
            textParts.push(item.value);
          }
        }
      }
    }

    return textParts.join("\n\n");
  }

  private extractToolCalls(request: CopilotRequest): CopilotToolCall[] {
    const toolCalls: CopilotToolCall[] = [];
    const toolResults = request.result?.metadata?.toolCallResults || {};
    const rounds = request.result?.metadata?.toolCallRounds || [];

    const resultsById: Record<string, string> = {};
    for (const [toolCallId, result] of Object.entries(toolResults)) {
      if (result.content && Array.isArray(result.content)) {
        const content = result.content
          .map(c => typeof c.value === "string" ? c.value : JSON.stringify(c.value))
          .join("\n");
        resultsById[toolCallId] = content;
      }
    }

    const toolNameToResultId: Record<string, string> = {};
    for (const round of rounds) {
      for (const call of round.toolCalls) {
        toolNameToResultId[call.name] = call.id;
      }
    }

    for (const item of request.response) {
      if (typeof item === "object" && item !== null && item.kind === "toolInvocationSerialized") {
        const toolId = (item as { toolId?: string }).toolId || "unknown";
        const toolName = toolId.replace("copilot_", "");

        let resultContent: string | undefined;
        const resultId = toolNameToResultId[toolName] || toolNameToResultId[toolId];
        if (resultId && resultsById[resultId]) {
          resultContent = resultsById[resultId];
        }

        toolCalls.push({
          toolId,
          toolName,
          invocationMessage: this.extractInvocationMessage(item),
          resultContent,
        });
      }
    }

    return toolCalls;
  }

  private extractInvocationMessage(item: CopilotResponseItem): string {
    const invMsg = (item as { invocationMessage?: unknown }).invocationMessage;
    if (typeof invMsg === "string") return invMsg;
    if (typeof invMsg === "object" && invMsg !== null && "value" in invMsg) {
      return String((invMsg as { value: unknown }).value);
    }
    return "Tool invocation";
  }
}

export const copilotStructureService = new CopilotStructureService();
