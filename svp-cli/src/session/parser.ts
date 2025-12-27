/**
 * Session parsing utilities
 */

import type { SessionEntry, Turn, ContentBlock } from './types.js';

/**
 * Parse JSONL content into SessionEntry array
 */
export function parseSession(content: string): SessionEntry[] {
  const lines = content.trim().split('\n').filter(Boolean);
  return lines.map(line => JSON.parse(line) as SessionEntry);
}

/**
 * Serialize entries back to JSONL
 */
export function serializeSession(entries: SessionEntry[]): string {
  return entries.map(e => JSON.stringify(e)).join('\n') + '\n';
}

/**
 * Determines if an entry represents the start of a new turn.
 * A new turn starts when a user sends text content (not a tool result).
 */
function isNewTurn(entry: SessionEntry): boolean {
  if (entry.type !== 'user') return false;
  if (entry.isMeta === true) return false;

  const content = entry.message?.content;

  // String content = human input (new turn)
  if (typeof content === 'string') return true;

  // Array content - check block types
  if (Array.isArray(content)) {
    const hasText = content.some((b) => b.type === 'text');
    const hasToolResult = content.some((b) => b.type === 'tool_result');
    return hasText && !hasToolResult;
  }

  return false;
}

/**
 * Identifies turn boundaries in a session.
 */
export function identifyTurns(entries: SessionEntry[]): Turn[] {
  const turns: Turn[] = [];
  let currentTurnStart: number | null = null;

  for (let i = 0; i < entries.length; i++) {
    if (isNewTurn(entries[i])) {
      if (currentTurnStart !== null) {
        turns.push({ startIndex: currentTurnStart, endIndex: i - 1 });
      }
      currentTurnStart = i;
    }
  }

  if (currentTurnStart !== null) {
    turns.push({ startIndex: currentTurnStart, endIndex: entries.length - 1 });
  }

  return turns;
}

/**
 * Count tool calls in entries
 */
export function countToolCalls(entries: SessionEntry[]): { total: number; failed: number } {
  let total = 0;
  let failed = 0;

  for (const entry of entries) {
    if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content as ContentBlock[]) {
        if (block.type === 'tool_use') {
          total++;
        }
      }
    }
    if (entry.type === 'user' && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content as ContentBlock[]) {
        if (block.type === 'tool_result' && block.is_error) {
          failed++;
        }
      }
    }
  }

  return { total, failed };
}

/**
 * Count thinking blocks
 */
export function countThinkingBlocks(entries: SessionEntry[]): number {
  let count = 0;

  for (const entry of entries) {
    if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content as ContentBlock[]) {
        if (block.type === 'thinking') {
          count++;
        }
      }
    }
  }

  return count;
}

/**
 * Extract file paths mentioned in session
 */
export function extractFiles(entries: SessionEntry[]): string[] {
  const files = new Set<string>();

  for (const entry of entries) {
    if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content as ContentBlock[]) {
        if (block.type === 'tool_use' && block.input) {
          const input = block.input as Record<string, unknown>;
          if (typeof input.file_path === 'string') {
            files.add(input.file_path);
          }
          if (typeof input.path === 'string') {
            files.add(input.path);
          }
        }
      }
    }
  }

  return Array.from(files).sort();
}

/**
 * Estimate token count (rough approximation: chars / 4)
 */
export function estimateTokens(entries: SessionEntry[]): number {
  let charCount = 0;

  for (const entry of entries) {
    charCount += JSON.stringify(entry).length;
  }

  return Math.round(charCount / 4);
}
