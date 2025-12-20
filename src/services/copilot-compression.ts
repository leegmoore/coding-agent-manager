import type {
  CompressionBand,
  CompressionTask,
  CompressionStats,
  CompressionConfig,
} from "../types.js";
import type { CopilotRequest, CopilotResponseItem } from "../sources/copilot-types.js";
import { processBatches } from "./compression-batch.js";
import { getProvider } from "../providers/index.js";

export interface CopilotTurnBandMapping {
  turnIndex: number;
  band: CompressionBand | null;
}

export interface CopilotCompressionResult {
  requests: CopilotRequest[];
  stats: CompressionStats;
  tasks: CompressionTask[];
}

export function estimateCopilotTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function mapCopilotTurnsToBands(
  requests: CopilotRequest[],
  bands: CompressionBand[]
): CopilotTurnBandMapping[] {
  if (requests.length === 0) return [];

  const totalTurns = requests.length;

  return requests.map((_, turnIndex) => {
    const position = (turnIndex / totalTurns) * 100;
    const matchingBand = bands.find(
      (band) => band.start <= position && position < band.end
    );
    return { turnIndex, band: matchingBand ?? null };
  });
}

export function extractCopilotTextContent(request: CopilotRequest): {
  userText: string;
  assistantText: string;
} {
  const userText = request.message.text;
  const textParts: string[] = [];

  for (const item of request.response) {
    if (typeof item === "object" && item !== null) {
      if ((item.kind === "markdownContent" || !item.kind) && typeof item.value === "string") {
        textParts.push(item.value);
      }
    }
  }

  return { userText, assistantText: textParts.join("\n\n") };
}

function calculateInitialTimeout(estimatedTokens: number): number {
  if (estimatedTokens >= 4000) return 90000;
  if (estimatedTokens >= 1000) return 30000;
  return 20000;
}

export function createCopilotCompressionTasks(
  requests: CopilotRequest[],
  mapping: CopilotTurnBandMapping[],
  minTokens: number = 30
): CompressionTask[] {
  const tasks: CompressionTask[] = [];

  for (const turnMapping of mapping) {
    if (turnMapping.band === null) continue;

    const request = requests[turnMapping.turnIndex];
    const { userText, assistantText } = extractCopilotTextContent(request);

    const userTokens = estimateCopilotTokens(userText);
    tasks.push({
      messageIndex: turnMapping.turnIndex * 2,
      entryType: "user",
      originalContent: userText,
      level: turnMapping.band.level,
      estimatedTokens: userTokens,
      attempt: 0,
      timeoutMs: calculateInitialTimeout(userTokens),
      status: userTokens < minTokens ? "skipped" : "pending",
    });

    const assistantTokens = estimateCopilotTokens(assistantText);
    tasks.push({
      messageIndex: turnMapping.turnIndex * 2 + 1,
      entryType: "assistant",
      originalContent: assistantText,
      level: turnMapping.band.level,
      estimatedTokens: assistantTokens,
      attempt: 0,
      timeoutMs: calculateInitialTimeout(assistantTokens),
      status: assistantTokens < minTokens ? "skipped" : "pending",
    });
  }

  return tasks;
}

export function applyCopilotCompressionResults(
  requests: CopilotRequest[],
  tasks: CompressionTask[]
): CopilotRequest[] {
  const userResults = new Map<number, string>();
  const assistantResults = new Map<number, string>();

  for (const task of tasks) {
    if (task.status !== "success" || task.result === undefined) continue;
    const turnIndex = Math.floor(task.messageIndex / 2);
    if (task.entryType === "user") {
      userResults.set(turnIndex, task.result);
    } else {
      assistantResults.set(turnIndex, task.result);
    }
  }

  return requests.map((request, turnIndex) => {
    let updatedRequest = { ...request };

    const compressedUser = userResults.get(turnIndex);
    if (compressedUser !== undefined) {
      updatedRequest = {
        ...updatedRequest,
        message: { ...updatedRequest.message, text: compressedUser },
      };
    }

    const compressedAssistant = assistantResults.get(turnIndex);
    if (compressedAssistant !== undefined) {
      const newResponse: CopilotResponseItem[] = [];
      let textReplaced = false;

      for (const item of request.response) {
        if (typeof item === "object" && item !== null) {
          if (item.kind === "toolInvocationSerialized" || item.kind === "prepareToolInvocation" || item.kind === "mcpServersStarting") {
            newResponse.push(item);
          } else if ((item.kind === "markdownContent" || !item.kind) && typeof item.value === "string") {
            if (!textReplaced) {
              newResponse.push({ ...item, value: compressedAssistant });
              textReplaced = true;
            }
          } else {
            newResponse.push(item);
          }
        } else {
          newResponse.push(item);
        }
      }

      if (!textReplaced && compressedAssistant) {
        newResponse.unshift({ kind: "markdownContent", value: compressedAssistant });
      }

      updatedRequest = { ...updatedRequest, response: newResponse };
    }

    return updatedRequest;
  });
}

function calculateCopilotStats(
  allTasks: CompressionTask[],
  completedTasks: CompressionTask[],
  totalRequests: number
): CompressionStats {
  const successful = completedTasks.filter((t) => t.status === "success");
  const failed = completedTasks.filter((t) => t.status === "failed");

  const originalTokens = allTasks
    .filter((t) => t.status !== "skipped")
    .reduce((sum, t) => sum + t.estimatedTokens, 0);

  const compressedTokens = successful.reduce(
    (sum, t) => sum + estimateCopilotTokens(t.result ?? ""),
    0
  );

  const tokensRemoved = originalTokens - compressedTokens;
  const reductionPercent = originalTokens > 0 ? Math.round((tokensRemoved / originalTokens) * 100) : 0;
  const skippedCount = allTasks.filter((t) => t.status === "skipped").length;

  return {
    messagesCompressed: successful.length,
    messagesSkipped: skippedCount,
    messagesFailed: failed.length,
    originalTokens,
    compressedTokens,
    tokensRemoved,
    reductionPercent,
  };
}

export async function compressCopilotMessages(
  requests: CopilotRequest[],
  bands: CompressionBand[],
  config: CompressionConfig
): Promise<CopilotCompressionResult> {
  if (bands.length === 0) {
    return {
      requests,
      stats: { messagesCompressed: 0, messagesSkipped: 0, messagesFailed: 0, originalTokens: 0, compressedTokens: 0, tokensRemoved: 0, reductionPercent: 0 },
      tasks: [],
    };
  }

  const mapping = mapCopilotTurnsToBands(requests, bands);
  const allTasks = createCopilotCompressionTasks(requests, mapping, config.minTokens);

  const pendingTasks = allTasks.filter((t) => t.status === "pending");
  const skippedTasks = allTasks.filter((t) => t.status === "skipped");

  if (pendingTasks.length === 0) {
    return {
      requests,
      stats: { messagesCompressed: 0, messagesSkipped: skippedTasks.length, messagesFailed: 0, originalTokens: 0, compressedTokens: 0, tokensRemoved: 0, reductionPercent: 0 },
      tasks: skippedTasks,
    };
  }

  const provider = getProvider();
  const batchConfig = { concurrency: config.concurrency, maxAttempts: config.maxAttempts };

  console.log(`[copilot-compression] Processing ${pendingTasks.length} tasks with ${config.concurrency} concurrency`);

  const completedTasks = await processBatches(pendingTasks, provider, batchConfig);
  const allCompletedTasks = [...completedTasks, ...skippedTasks];
  const compressedRequests = applyCopilotCompressionResults(requests, completedTasks);
  const stats = calculateCopilotStats(allTasks, completedTasks, requests.length);

  console.log(`[copilot-compression] Complete: ${stats.messagesCompressed} compressed, ${stats.reductionPercent}% reduction`);

  return { requests: compressedRequests, stats, tasks: allCompletedTasks };
}
