import fs from "fs/promises";
import { SessionNotFoundError } from "../errors.js";
import {
  TokensByType,
  TurnContent,
  TurnData,
  SessionTurnsResponse,
  SessionEntry,
  Turn,
  ContentBlock,
} from "../types.js";
import { findSessionFile, parseSession, identifyTurns } from "./session-clone.js";
import { estimateTokens } from "./compression.js";

export function classifyBlock(block: ContentBlock): "text" | "thinking" | "tool" {
  if (block.type === "thinking") return "thinking";
  if (block.type === "tool_use" || block.type === "tool_result") return "tool";
  return "text";
}

export function calculateCumulativeTokens(
  entries: SessionEntry[],
  turns: Turn[],
  upToTurnIndex: number
): TokensByType {
  const result: TokensByType = { user: 0, assistant: 0, thinking: 0, tool: 0, total: 0 };

  const maxTurnIndex = Math.min(upToTurnIndex, turns.length - 1);
  if (maxTurnIndex < 0) {
    return result;
  }

  for (let t = 0; t <= maxTurnIndex; t++) {
    const turn = turns[t];
    for (let idx = turn.startIndex; idx <= turn.endIndex; idx++) {
      const entry = entries[idx];

      // Skip meta or non-message entries
      if (!entry || entry.isMeta) continue;
      if (entry.type === "summary" || entry.type === "file-history-snapshot") continue;
      if (!entry.message) continue;

      const content = entry.message.content;

      // String content
      if (typeof content === "string") {
        const tokens = estimateTokens(content);
        if (entry.type === "assistant") {
          result.assistant += tokens;
        } else {
          result.user += tokens;
        }
        continue;
      }

      // Array content
      if (Array.isArray(content)) {
        for (const block of content) {
          const bucket = classifyBlock(block as ContentBlock);

          const text =
            typeof (block as any).text === "string"
              ? (block as any).text
              : typeof (block as any).thinking === "string"
                ? (block as any).thinking
                : typeof (block as any).content === "string"
                  ? (block as any).content
                  : JSON.stringify(block);

          const tokens = estimateTokens(text);

          if (bucket === "thinking") {
            result.thinking += tokens;
          } else if (bucket === "tool") {
            result.tool += tokens;
          } else {
            if (entry.type === "assistant") {
              result.assistant += tokens;
            } else {
              result.user += tokens;
            }
          }
        }
      }
    }
  }

  result.total = result.user + result.assistant + result.thinking + result.tool;
  return result;
}

export function extractTurnContent(entries: SessionEntry[], turn: Turn): TurnContent {
  let userPrompt = "";
  let assistantResponse = "";
  const toolBlocks: TurnContent["toolBlocks"] = [];

  for (let idx = turn.startIndex; idx <= turn.endIndex; idx++) {
    const entry = entries[idx];
    if (!entry || entry.isMeta || !entry.message) continue;

    const content = entry.message.content;

    if (entry.type === "user") {
      if (typeof content === "string") {
        if (!userPrompt) {
          userPrompt = content;
        }
      } else if (Array.isArray(content)) {
        const texts = content
          .filter((b) => b.type === "text" && typeof (b as any).text === "string")
          .map((b) => (b as any).text as string);
        if (texts.length > 0 && !userPrompt) {
          userPrompt = texts.join("\n");
        }
      }
      continue;
    }

    if (entry.type === "assistant") {
      if (typeof content === "string") {
        assistantResponse = content;
        continue;
      }

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_use") {
            toolBlocks.push({
              name: (block as any).name ?? "tool",
              content: JSON.stringify((block as any).input ?? {}),
            });
          } else if (block.type === "text" && typeof (block as any).text === "string") {
            assistantResponse = assistantResponse
              ? `${assistantResponse}\n${(block as any).text}`
              : (block as any).text;
          }
        }
      }
    }
  }

  return { userPrompt, toolBlocks, assistantResponse };
}

export async function getSessionTurns(sessionId: string): Promise<SessionTurnsResponse> {
  let sessionPath: string;
  try {
    sessionPath = await findSessionFile(sessionId);
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      throw err;
    }
    throw new SessionNotFoundError(sessionId);
  }

  const content = await fs.readFile(sessionPath, "utf-8");
  const entries = parseSession(content);
  const turns = identifyTurns(entries);

  const turnsData: TurnData[] = turns.map((turn, idx) => ({
    turnIndex: idx,
    cumulative: calculateCumulativeTokens(entries, turns, idx),
    content: extractTurnContent(entries, turn),
  }));

  return {
    sessionId,
    totalTurns: turns.length,
    turns: turnsData,
  };
}

