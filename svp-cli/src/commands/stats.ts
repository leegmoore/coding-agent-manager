/**
 * svp stats command
 */

import type { ParsedArgs } from '../cli.js';
import type { CommandResult } from './index.js';
import { isValidUUID } from '../utils/validation.js';
import {
  loadSession,
  identifyTurns,
  countToolCalls,
  countThinkingBlocks,
  extractFiles,
  estimateTokens,
} from '../session/index.js';

export async function stats(args: ParsedArgs): Promise<CommandResult> {
  const sessionId = args.positional[0];

  if (!sessionId) {
    throw new Error('Session ID is required\n\nUsage: svp stats <session-id>');
  }

  if (!isValidUUID(sessionId)) {
    throw new Error(`Invalid session ID format: ${sessionId}`);
  }

  // Load session
  const { entries, lastModified } = await loadSession(sessionId);

  // Calculate stats
  const turns = identifyTurns(entries);
  const toolCalls = countToolCalls(entries);
  const thinkingBlocks = countThinkingBlocks(entries);
  const tokens = estimateTokens(entries);
  const files = extractFiles(entries);

  // Format last activity
  const lastDate = new Date(lastModified);
  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let lastActivity: string;
  if (diffMins < 1) {
    lastActivity = 'just now';
  } else if (diffMins < 60) {
    lastActivity = `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    lastActivity = `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else {
    lastActivity = `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  // Calculate context percentage (rough estimate)
  // Assume 200k token context window
  const contextPercent = Math.min(100, Math.round((tokens / 200000) * 100));

  const result = {
    success: true,
    sessionId,
    turns: turns.length,
    toolCalls,
    thinkingBlocks,
    tokens,
    contextPercent,
    files,
    lastModified,
    lastActivity,
  };

  if (!args.json && !args.quiet) {
    console.log(`
Session: ${sessionId}

Turns:           ${result.turns}
Tool calls:      ${toolCalls.total} (${toolCalls.failed} failed)
Thinking blocks: ${thinkingBlocks}
Tokens (est):    ${tokens.toLocaleString()} (~${contextPercent}% of 200k)
Files touched:   ${files.length}
Last activity:   ${lastActivity}
`);
  }

  return result;
}
