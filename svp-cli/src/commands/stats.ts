/**
 * svp stats command
 */

import type { ParsedArgs } from '../cli.js';
import type { CommandResult } from './index.js';
import { isValidUUID } from '../utils/validation.js';

export async function stats(args: ParsedArgs): Promise<CommandResult> {
  const sessionId = args.positional[0];

  if (!sessionId) {
    throw new Error('Session ID is required\n\nUsage: svp stats <session-id>');
  }

  if (!isValidUUID(sessionId)) {
    throw new Error(`Invalid session ID format: ${sessionId}`);
  }

  // TODO: Implement actual stats gathering
  // For now, return placeholder

  const result = {
    success: true,
    sessionId,
    turns: 0,
    toolCalls: { total: 0, failed: 0 },
    tokens: 0,
    files: [] as string[],
    lastActivity: new Date().toISOString(),
  };

  if (!args.json && !args.quiet) {
    console.log(`
Session: ${sessionId}

Turns:          ${result.turns}
Tool calls:     ${result.toolCalls.total} (${result.toolCalls.failed} failed)
Tokens (est):   ${result.tokens}
Files touched:  ${result.files.length}
Last activity:  ${result.lastActivity}
`);
  }

  return result;
}
