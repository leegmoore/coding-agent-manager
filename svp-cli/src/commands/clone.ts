/**
 * svp clone command
 */

import { dirname } from 'path';
import type { ParsedArgs } from '../cli.js';
import type { CommandResult } from './index.js';
import { isValidUUID } from '../utils/validation.js';
import { getProfile, type CloneProfile } from '../config/profiles.js';
import {
  loadSession,
  writeSession,
  identifyTurns,
  applyRemovals,
  repairParentUuidChain,
  createSummaryEntry,
  type RemovalOptions,
} from '../session/index.js';

export async function clone(args: ParsedArgs): Promise<CommandResult> {
  const sessionId = args.positional[0];

  if (!sessionId) {
    throw new Error('Session ID is required\n\nUsage: svp clone <session-id> [options]');
  }

  if (!isValidUUID(sessionId)) {
    throw new Error(`Invalid session ID format: ${sessionId}`);
  }

  // Load profile or build options from flags
  let profile: CloneProfile;

  if (args.profile) {
    const loadedProfile = getProfile(args.profile);
    if (!loadedProfile) {
      throw new Error(`Unknown profile: ${args.profile}\n\nRun 'svp profiles' to list available profiles.`);
    }
    profile = loadedProfile;
  } else {
    // Build from flags or use defaults
    const toolRemoval = args.flags['tool-removal']
      ? parseInt(args.flags['tool-removal'] as string, 10)
      : 100;
    const toolMode = (args.flags['tool-mode'] as 'remove' | 'truncate') || 'remove';
    const thinkingRemoval = args.flags['thinking-removal']
      ? parseInt(args.flags['thinking-removal'] as string, 10)
      : 100;

    profile = {
      toolRemoval,
      toolHandlingMode: toolMode,
      thinkingRemoval,
    };
  }

  // Load session
  const { entries, path: sourcePath } = await loadSession(sessionId);
  const originalTurns = identifyTurns(entries);
  const originalTurnCount = originalTurns.length;

  // Apply removals
  const removalOptions: RemovalOptions = {
    toolRemoval: profile.toolRemoval,
    toolHandlingMode: profile.toolHandlingMode,
    thinkingRemoval: profile.thinkingRemoval,
  };

  const {
    entries: modifiedEntries,
    toolCallsRemoved,
    toolCallsTruncated,
    thinkingBlocksRemoved,
  } = applyRemovals(entries, removalOptions);

  // Repair UUID chain
  const repairedEntries = repairParentUuidChain(modifiedEntries);

  // Generate new session ID
  const newSessionId = crypto.randomUUID();

  // Update sessionId in entries that had one
  const finalEntries = repairedEntries.map(entry => ({
    ...entry,
    ...(entry.sessionId != null ? { sessionId: newSessionId } : {}),
  }));

  // Create summary entry
  const summaryEntry = createSummaryEntry(entries);

  // Write output
  const sourceDir = dirname(sourcePath);
  const allEntries = [summaryEntry, ...finalEntries];
  const outputPath = await writeSession(allEntries, sourceDir, newSessionId);

  // Count output turns
  const outputTurns = identifyTurns(finalEntries);
  const outputTurnCount = outputTurns.length;

  const command = `claude --dangerously-skip-permissions --resume ${newSessionId}`;

  if (!args.json && !args.quiet) {
    console.log(`
Session cloned successfully!

New Session: ${newSessionId}

Stats:
  Original turns:      ${originalTurnCount}
  Output turns:        ${outputTurnCount}
  Tool calls removed:  ${toolCallsRemoved}${toolCallsTruncated > 0 ? `\n  Tool calls truncated: ${toolCallsTruncated}` : ''}
  Thinking removed:    ${thinkingBlocksRemoved}

Resume command:
  ${command}
`);
  }

  return {
    success: true,
    sessionId: newSessionId,
    outputPath,
    command,
    stats: {
      originalTurnCount,
      outputTurnCount,
      toolCallsRemoved,
      toolCallsTruncated: toolCallsTruncated > 0 ? toolCallsTruncated : undefined,
      thinkingBlocksRemoved,
    },
  };
}
