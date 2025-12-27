import { describe, it, expect } from 'vitest';
import { extractSessionId, formatStats, formatCompressionStats } from '../../../public/js/lib/transforms.js';

describe('extractSessionId', () => {
  it('extracts UUID from full path', () => {
    const path = '/Users/leemoore/.claude/projects/-Users-leemoore/00a61603-c2ea-4d4c-aee8-4a292ab7b3f4.jsonl';
    expect(extractSessionId(path)).toBe('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4');
  });

  it('returns empty string for empty input', () => {
    expect(extractSessionId('')).toBe('');
  });

  it('returns input unchanged if no .jsonl extension', () => {
    expect(extractSessionId('no-extension')).toBe('no-extension');
  });

  it('handles path with only separator', () => {
    expect(extractSessionId('/')).toBe('');
  });

  it('handles path with different project directory', () => {
    const path = '/home/user/.claude/projects/-home-user-code/abc12345-1234-5678-9abc-def012345678.jsonl';
    expect(extractSessionId(path)).toBe('abc12345-1234-5678-9abc-def012345678');
  });

  // Note: In JS strings, \\ represents a single backslash. This test verifies
  // the splitting logic handles backslash separators, not actual Windows path handling.
  // At runtime, paths would contain single backslashes.
  it('handles Windows-style paths', () => {
    const path = 'C:\\Users\\user\\.claude\\projects\\-C-Users-user\\abc12345-1234-5678-9abc-def012345678.jsonl';
    expect(extractSessionId(path)).toBe('abc12345-1234-5678-9abc-def012345678');
  });

  it('handles filename only', () => {
    const path = '00a61603-c2ea-4d4c-aee8-4a292ab7b3f4.jsonl';
    expect(extractSessionId(path)).toBe('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4');
  });
});

describe('formatStats', () => {
  it('formats stats object to array of label/value pairs', () => {
    const stats = {
      originalTurnCount: 18,
      outputTurnCount: 15,
      toolCallsRemoved: 5,
      thinkingBlocksRemoved: 3,
    };

    const result = formatStats(stats);

    expect(result).toEqual([
      { label: 'Original turns', value: 18 },
      { label: 'Output turns', value: 15 },
      { label: 'Tool calls removed', value: 5 },
      { label: 'Thinking blocks removed', value: 3 },
    ]);
  });

  it('handles zero values', () => {
    const stats = {
      originalTurnCount: 10,
      outputTurnCount: 10,
      toolCallsRemoved: 0,
      thinkingBlocksRemoved: 0,
    };

    const result = formatStats(stats);

    expect(result[2]).toEqual({ label: 'Tool calls removed', value: 0 });
    expect(result[3]).toEqual({ label: 'Thinking blocks removed', value: 0 });
  });

  it('includes tool calls truncated when present', () => {
    const stats = {
      originalTurnCount: 18,
      outputTurnCount: 15,
      toolCallsRemoved: 0,
      toolCallsTruncated: 42,
      thinkingBlocksRemoved: 3,
    };

    const result = formatStats(stats);

    expect(result).toContainEqual({ label: 'Tool calls truncated', value: 42 });
  });

  it('omits tool calls truncated when zero or undefined', () => {
    const stats = {
      originalTurnCount: 18,
      outputTurnCount: 15,
      toolCallsRemoved: 5,
      thinkingBlocksRemoved: 3,
    };

    const result = formatStats(stats);

    expect(result.find(s => s.label === 'Tool calls truncated')).toBeUndefined();
  });
});

describe('formatCompressionStats', () => {
  it('formats compression stats', () => {
    const stats = {
      messagesCompressed: 24,
      messagesSkipped: 100,
      messagesFailed: 1,
      originalTokens: 50000,
      compressedTokens: 10000,
      tokensRemoved: 40000,
      reductionPercent: 80,
    };
    const result = formatCompressionStats(stats);
    expect(result).toEqual([
      { label: 'Messages compressed', value: 24 },
      { label: 'Messages skipped', value: 100 },
      { label: 'Compressions failed', value: 1 },
      { label: 'Original tokens', value: 50000 },
      { label: 'Compressed tokens', value: 10000 },
      { label: 'Tokens removed', value: 40000 },
      { label: 'Token reduction', value: '80%' },
    ]);
  });

  it('handles zero compression', () => {
    const stats = {
      messagesCompressed: 0,
      messagesSkipped: 50,
      messagesFailed: 0,
      originalTokens: 0,
      compressedTokens: 0,
      tokensRemoved: 0,
      reductionPercent: 0,
    };
    const result = formatCompressionStats(stats);
    expect(result[6]).toEqual({ label: 'Token reduction', value: '0%' });
  });

  it('returns empty array for null stats', () => {
    expect(formatCompressionStats(null)).toEqual([]);
  });
});
