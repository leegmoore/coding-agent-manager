/**
 * Session cloning with removals
 */

import type { SessionEntry, Turn, RemovalOptions, RemovalResult, ContentBlock } from './types.js';
import { identifyTurns } from './parser.js';

/**
 * Truncate a string to 2 lines or 120 characters, whichever comes first.
 */
export function truncateToolContent(content: string): string {
  if (!content) return content;

  const maxLines = 2;
  const maxChars = 120;

  const lines = content.split('\n');
  let truncated = lines.slice(0, maxLines).join('\n');
  let wasTruncated = lines.length > maxLines;

  if (truncated.length > maxChars) {
    truncated = truncated.slice(0, maxChars);
    wasTruncated = true;
  }

  if (wasTruncated) {
    truncated = truncated.trimEnd() + '...';
  }

  return truncated;
}

/**
 * Truncate string values within an object, preserving structure.
 */
export function truncateObjectValues(obj: unknown): { result: unknown; wasTruncated: boolean } {
  if (obj === null || obj === undefined) {
    return { result: obj, wasTruncated: false };
  }

  if (typeof obj === 'string') {
    const truncated = truncateToolContent(obj);
    return { result: truncated, wasTruncated: truncated !== obj };
  }

  if (Array.isArray(obj)) {
    let anyTruncated = false;
    const result = obj.map(item => {
      const { result: truncatedItem, wasTruncated } = truncateObjectValues(item);
      if (wasTruncated) anyTruncated = true;
      return truncatedItem;
    });
    return { result, wasTruncated: anyTruncated };
  }

  if (typeof obj === 'object') {
    let anyTruncated = false;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const { result: truncatedValue, wasTruncated } = truncateObjectValues(value);
      if (wasTruncated) anyTruncated = true;
      result[key] = truncatedValue;
    }
    return { result, wasTruncated: anyTruncated };
  }

  return { result: obj, wasTruncated: false };
}

/**
 * Apply removals based on options
 */
export function applyRemovals(entries: SessionEntry[], options: RemovalOptions): RemovalResult {
  const turns = identifyTurns(entries);
  const turnCount = turns.length;

  // Calculate removal boundaries
  const toolBoundary = options.toolRemoval === 0 ? 0 :
    options.toolRemoval >= 100 ? turnCount :
    Math.floor(turnCount * options.toolRemoval / 100);

  const thinkingBoundary = options.thinkingRemoval === 0 ? 0 :
    options.thinkingRemoval >= 100 ? turnCount :
    Math.floor(turnCount * options.thinkingRemoval / 100);

  const toolMode = options.toolHandlingMode || 'remove';

  let toolCallsRemoved = 0;
  let toolCallsTruncated = 0;
  let thinkingBlocksRemoved = 0;
  const entriesToDelete = new Set<number>();
  const modifiedEntries: SessionEntry[] = entries.map(entry => ({ ...entry }));

  // Collect tool_use IDs to remove
  const toolUseIdsToRemove = new Set<string>();
  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx];
    const isInToolRemovalZone = turnIdx < toolBoundary;

    if (isInToolRemovalZone && toolMode === 'remove') {
      for (let i = turn.startIndex; i <= turn.endIndex; i++) {
        const entry = modifiedEntries[i];
        if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content as ContentBlock[]) {
            if (block.type === 'tool_use' && block.id) {
              toolUseIdsToRemove.add(block.id);
            }
          }
        }
      }
    }
  }

  // Process each turn
  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx];
    const isInToolRemovalZone = turnIdx < toolBoundary;
    const isInThinkingRemovalZone = turnIdx < thinkingBoundary;

    for (let i = turn.startIndex; i <= turn.endIndex; i++) {
      if (entriesToDelete.has(i)) continue;

      const entry = modifiedEntries[i];
      let content = (entry.type === 'assistant' || entry.type === 'user') &&
        Array.isArray(entry.message?.content)
        ? [...(entry.message.content as ContentBlock[])]
        : null;

      if (!content) continue;

      let contentModified = false;

      // Handle tool_use blocks (assistant messages)
      if (isInToolRemovalZone && entry.type === 'assistant') {
        if (toolMode === 'remove') {
          const beforeLength = content.length;
          content = content.filter(block => {
            if (block.type === 'tool_use') {
              toolCallsRemoved++;
              return false;
            }
            return true;
          });
          if (content.length !== beforeLength) contentModified = true;
        } else if (toolMode === 'truncate') {
          content = content.map(block => {
            if (block.type === 'tool_use' && block.input) {
              const { result: truncatedInput, wasTruncated } = truncateObjectValues(block.input);
              if (wasTruncated) {
                toolCallsTruncated++;
                contentModified = true;
                return { ...block, input: truncatedInput };
              }
            }
            return block;
          });
        }
      }

      // Handle tool_result blocks (user messages)
      if (entry.type === 'user') {
        if (toolMode === 'remove') {
          const beforeLength = content.length;
          content = content.filter(block => {
            if (block.type === 'tool_result' && block.tool_use_id && toolUseIdsToRemove.has(block.tool_use_id)) {
              return false;
            }
            return true;
          });
          if (content.length !== beforeLength) contentModified = true;
        } else if (toolMode === 'truncate' && isInToolRemovalZone) {
          content = content.map(block => {
            if (block.type === 'tool_result' && typeof block.content === 'string') {
              const truncatedContent = truncateToolContent(block.content);
              if (truncatedContent !== block.content) {
                toolCallsTruncated++;
                contentModified = true;
                return { ...block, content: truncatedContent };
              }
            }
            return block;
          });
        }
      }

      // Remove thinking blocks
      if (isInThinkingRemovalZone && entry.type === 'assistant') {
        const beforeLength = content.length;
        content = content.filter(block => {
          if (block.type === 'thinking') {
            thinkingBlocksRemoved++;
            return false;
          }
          return true;
        });
        if (content.length !== beforeLength) contentModified = true;
      }

      // Update or delete entry
      if (content.length === 0) {
        entriesToDelete.add(i);
      } else if (contentModified) {
        modifiedEntries[i] = {
          ...entry,
          message: {
            ...entry.message!,
            content: content,
          },
        };
      }
    }
  }

  const finalEntries = modifiedEntries.filter((_, index) => !entriesToDelete.has(index));

  return {
    entries: finalEntries,
    toolCallsRemoved,
    toolCallsTruncated,
    thinkingBlocksRemoved,
  };
}

/**
 * Repair parentUuid chain after deletions
 */
export function repairParentUuidChain(entries: SessionEntry[]): SessionEntry[] {
  const repaired = entries.map(entry => ({ ...entry }));

  for (let i = 0; i < repaired.length; i++) {
    const entry = repaired[i];

    if (entry.parentUuid !== null && entry.parentUuid !== undefined) {
      const parentExists = repaired.some(e => e.uuid === entry.parentUuid);

      if (!parentExists) {
        let lastValidUuid: string | null = null;
        for (let j = i - 1; j >= 0; j--) {
          if (repaired[j].uuid !== null && repaired[j].uuid !== undefined) {
            lastValidUuid = repaired[j].uuid!;
            break;
          }
        }

        repaired[i] = {
          ...entry,
          parentUuid: lastValidUuid,
        };
      }
    }
  }

  return repaired;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${month} ${day} ${hours}:${minutes}${ampm}`;
}

/**
 * Extract first user message content
 */
function extractFirstUserMessage(entries: SessionEntry[]): string {
  const firstUser = entries.find(e => e.type === 'user' && e.message?.content);
  if (!firstUser || !firstUser.message) return '';

  const content = firstUser.message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = content.find(b => b.type === 'text');
    return textBlock?.text || '';
  }
  return '';
}

/**
 * Create summary entry for cloned session
 */
export function createSummaryEntry(entries: SessionEntry[], maxLength: number = 50): SessionEntry {
  const firstUserMessage = extractFirstUserMessage(entries);
  const trimmed = firstUserMessage.trim();
  const preview = trimmed.length === 0
    ? '(No message)'
    : trimmed.length <= maxLength
      ? trimmed
      : trimmed.slice(0, maxLength) + '...';

  const timestamp = formatTimestamp(new Date());
  const summary = `Clone: ${preview} (${timestamp})`;

  const firstWithUuid = entries.find(e => e.uuid);
  const leafUuid = firstWithUuid?.uuid || crypto.randomUUID();

  return {
    type: 'summary',
    summary,
    leafUuid,
  };
}
