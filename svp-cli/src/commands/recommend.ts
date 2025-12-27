/**
 * svp recommend command
 * Analyzes a session and recommends a clone profile
 */

import type { ParsedArgs } from '../cli.js';
import type { CommandResult } from './index.js';
import { isValidUUID } from '../utils/validation.js';
import {
  loadSession,
  identifyTurns,
  countToolCalls,
  countThinkingBlocks,
  estimateTokens,
} from '../session/index.js';

interface Recommendation {
  profile: string;
  reason: string;
  contextPercent: number;
  action: 'clone' | 'continue' | 'start-fresh';
}

function getRecommendation(contextPercent: number, toolCalls: number, turns: number): Recommendation {
  // Critical: >85% context
  if (contextPercent > 85) {
    return {
      profile: 'emergency',
      reason: `Context at ${contextPercent}% - critical. Remove all tool calls to maximize space.`,
      contextPercent,
      action: 'clone',
    };
  }

  // High: >70% context
  if (contextPercent > 70) {
    return {
      profile: 'routine',
      reason: `Context at ${contextPercent}% - high. Truncate tool calls to reduce while preserving some context.`,
      contextPercent,
      action: 'clone',
    };
  }

  // Medium: >50% context
  if (contextPercent > 50) {
    // Only recommend if there are significant tool calls to remove
    if (toolCalls > 50) {
      return {
        profile: 'preserve',
        reason: `Context at ${contextPercent}% with ${toolCalls} tool calls. Light cleanup recommended.`,
        contextPercent,
        action: 'clone',
      };
    }
    return {
      profile: 'none',
      reason: `Context at ${contextPercent}% - healthy. No action needed.`,
      contextPercent,
      action: 'continue',
    };
  }

  // Low: <50% context
  if (contextPercent < 20 && turns < 5) {
    return {
      profile: 'none',
      reason: `Context at ${contextPercent}% with only ${turns} turns. Consider starting fresh for a clean slate.`,
      contextPercent,
      action: 'start-fresh',
    };
  }

  return {
    profile: 'none',
    reason: `Context at ${contextPercent}% - healthy. No action needed.`,
    contextPercent,
    action: 'continue',
  };
}

export async function recommend(args: ParsedArgs): Promise<CommandResult> {
  const sessionId = args.positional[0];

  if (!sessionId) {
    throw new Error('Session ID is required\n\nUsage: svp recommend <session-id>');
  }

  if (!isValidUUID(sessionId)) {
    throw new Error(`Invalid session ID format: ${sessionId}`);
  }

  // Load session and calculate stats
  const { entries } = await loadSession(sessionId);
  const turns = identifyTurns(entries);
  const toolCalls = countToolCalls(entries);
  const thinkingBlocks = countThinkingBlocks(entries);
  const tokens = estimateTokens(entries);
  const contextPercent = Math.min(100, Math.round((tokens / 200000) * 100));

  const recommendation = getRecommendation(contextPercent, toolCalls.total, turns.length);

  if (!args.json && !args.quiet) {
    console.log(`
Session: ${sessionId}

Analysis:
  Context:    ${contextPercent}% of 200k
  Turns:      ${turns.length}
  Tool calls: ${toolCalls.total}
  Thinking:   ${thinkingBlocks}

Recommendation: ${recommendation.action.toUpperCase()}
${recommendation.reason}
${recommendation.action === 'clone' ? `\nCommand:\n  svp clone ${sessionId} --profile=${recommendation.profile}` : ''}
`);
  }

  return {
    success: true,
    sessionId,
    stats: {
      contextPercent,
      turns: turns.length,
      toolCalls: toolCalls.total,
      thinkingBlocks,
      tokens,
    },
    recommendation,
  };
}
