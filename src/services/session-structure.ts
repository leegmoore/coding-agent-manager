import { findSessionFile, parseSession } from "./session-clone.js";
import { estimateTokens } from "./compression.js";
import type { SessionEntry, ContentBlock } from "../types.js";

/**
 * Structure entry types for visualization
 */
export type StructureEntryType = "user" | "assistant" | "tool" | "thinking";

/**
 * A single entry in the session structure for visualization
 */
export interface StructureEntry {
  index: number;
  type: StructureEntryType;
  tokens: number;
}

/**
 * Full session structure response for visualization
 */
export interface SessionStructure {
  sessionId: string;
  totalTokens: number;
  maxEntryTokens: number;
  entries: StructureEntry[];
}

/**
 * Classify a content block into a visualization type.
 * Returns the block type category for grouping purposes.
 */
function classifyBlock(block: ContentBlock): "text" | "tool" | "thinking" {
  if (block.type === "thinking") {
    return "thinking";
  }
  if (block.type === "tool_use" || block.type === "tool_result") {
    return "tool";
  }
  // text, image, and other block types map to text
  return "text";
}

/**
 * Get the text content from a block for token estimation.
 */
function getBlockText(block: ContentBlock): string {
  if (block.type === "text" && typeof block.text === "string") {
    return block.text;
  }
  if (block.type === "thinking" && typeof block.thinking === "string") {
    return block.thinking;
  }
  if (block.type === "tool_use") {
    // Estimate based on tool name and input
    const name = block.name ?? "";
    const input = block.input ? JSON.stringify(block.input) : "";
    return `${name}\n${input}`;
  }
  if (block.type === "tool_result") {
    // Tool result content can be string or array
    const content = block.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((c) => {
          if (typeof c === "string") return c;
          if (c.type === "text" && typeof c.text === "string") return c.text;
          return "";
        })
        .join("\n");
    }
    return "";
  }
  return "";
}

/**
 * Map internal block type to visualization entry type based on parent entry type.
 */
function mapToEntryType(
  blockType: "text" | "tool" | "thinking",
  parentType: "user" | "assistant"
): StructureEntryType {
  if (blockType === "thinking") return "thinking";
  if (blockType === "tool") return "tool";
  // "text" maps to parent type (user or assistant)
  return parentType;
}

/**
 * Process an entry with array content, splitting into separate structure entries
 * when content types change (consecutive same-type blocks are merged).
 */
function processArrayContent(
  content: ContentBlock[],
  parentType: "user" | "assistant",
  indexRef: { current: number }
): StructureEntry[] {
  const entries: StructureEntry[] = [];

  let currentBlockType: "text" | "tool" | "thinking" | null = null;
  let currentTokens = 0;

  for (const block of content) {
    const blockType = classifyBlock(block);
    const blockText = getBlockText(block);
    const blockTokens = estimateTokens(blockText);

    if (blockType !== currentBlockType && currentBlockType !== null) {
      // Emit previous group
      if (currentTokens > 0) {
        entries.push({
          index: indexRef.current++,
          type: mapToEntryType(currentBlockType, parentType),
          tokens: currentTokens,
        });
      }
      currentTokens = 0;
    }

    currentBlockType = blockType;
    currentTokens += blockTokens;
  }

  // Emit final group
  if (currentBlockType !== null && currentTokens > 0) {
    entries.push({
      index: indexRef.current++,
      type: mapToEntryType(currentBlockType, parentType),
      tokens: currentTokens,
    });
  }

  return entries;
}

/**
 * Process a single session entry into structure entries.
 * Handles mixed-content splitting for array content.
 */
function processEntry(
  entry: SessionEntry,
  indexRef: { current: number }
): StructureEntry[] {
  // Skip non-message types
  if (entry.type === "summary" || entry.type === "file-history-snapshot") {
    return [];
  }

  // Skip meta messages
  if (entry.isMeta === true) {
    return [];
  }

  // Only process user and assistant messages
  if (entry.type !== "user" && entry.type !== "assistant") {
    return [];
  }

  const content = entry.message?.content;

  // Handle string content
  if (typeof content === "string") {
    const tokens = estimateTokens(content);
    if (tokens > 0) {
      return [
        {
          index: indexRef.current++,
          type: entry.type,
          tokens,
        },
      ];
    }
    return [];
  }

  // Handle array content with mixed-content splitting
  if (Array.isArray(content)) {
    return processArrayContent(content, entry.type, indexRef);
  }

  return [];
}

/**
 * Get session structure for visualization.
 * Parses session entries and produces a flattened list of structure entries
 * with type classification and token estimates.
 *
 * @param sessionId - UUID of the session to analyze
 * @returns Session structure with entries suitable for visualization
 * @throws SessionNotFoundError if session file not found
 */
export async function getSessionStructure(
  sessionId: string
): Promise<SessionStructure> {
  // Find and load session file
  const sessionPath = await findSessionFile(sessionId);
  const { readFile } = await import("fs/promises");
  const content = await readFile(sessionPath, "utf-8");
  const sessionEntries = parseSession(content);

  // Process all entries
  const indexRef = { current: 0 };
  const structureEntries: StructureEntry[] = [];

  for (const entry of sessionEntries) {
    const processed = processEntry(entry, indexRef);
    structureEntries.push(...processed);
  }

  // Calculate totals
  const totalTokens = structureEntries.reduce((sum, e) => sum + e.tokens, 0);
  const maxEntryTokens =
    structureEntries.length > 0
      ? Math.max(...structureEntries.map((e) => e.tokens))
      : 0;

  return {
    sessionId,
    totalTokens,
    maxEntryTokens,
    entries: structureEntries,
  };
}
