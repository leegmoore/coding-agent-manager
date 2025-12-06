import { describe, it, expect } from "vitest";
import {
  mapTurnsToBands,
  createCompressionTasks,
  estimateTokens,
  extractTextContent,
  applyCompressedContent,
  applyCompressionResults,
  compressMessages,
} from "../src/services/compression.js";
import type {
  Turn,
  CompressionBand,
  SessionEntry,
  TurnBandMapping,
  CompressionConfig,
  CompressionTask,
} from "../src/types.js";

/**
 * Phase 2 TDD Tests: Core Compression Logic
 *
 * These tests verify the core compression utility functions:
 * - estimateTokens: Token estimation using chars/4 formula
 * - extractTextContent: Extract text from various content formats
 * - applyCompressedContent: Apply compressed text back to entries
 * - mapTurnsToBands: Map turns to compression bands by position
 * - createCompressionTasks: Generate tasks for messages needing compression
 * - applyCompressionResults: Apply completed task results to entries
 * - compressMessages: High-level orchestration (empty bands case only)
 */

// Default config for tests
const defaultConfig: CompressionConfig = {
  concurrency: 3,
  timeoutInitial: 5000,
  timeoutIncrement: 2000,
  maxAttempts: 3,
  minTokens: 20,
  thinkingThreshold: 1000,
  targetHeavy: 70,
  targetStandard: 50,
};

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns 1 for single character", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  it("returns 1 for 4 characters (ceil(4/4) = 1)", () => {
    expect(estimateTokens("abcd")).toBe(1);
  });

  it("returns 2 for 5 characters (ceil(5/4) = 2)", () => {
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("returns 20 for 80 characters", () => {
    expect(estimateTokens("a".repeat(80))).toBe(20);
  });

  it("returns 1000 for 4000 characters", () => {
    expect(estimateTokens("a".repeat(4000))).toBe(1000);
  });
});

describe("extractTextContent", () => {
  it("extracts string content directly", () => {
    const entry: SessionEntry = {
      type: "user",
      message: { content: "Hello world" },
    };
    expect(extractTextContent(entry)).toBe("Hello world");
  });

  it("extracts and joins text blocks from array content", () => {
    const entry: SessionEntry = {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Line 1" },
          { type: "image", data: "..." },
          { type: "text", text: "Line 2" },
        ],
      },
    };
    expect(extractTextContent(entry)).toBe("Line 1\nLine 2");
  });

  it("returns empty string for non-text content only", () => {
    const entry: SessionEntry = {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "123" }] },
    };
    expect(extractTextContent(entry)).toBe("");
  });
});

describe("applyCompressedContent", () => {
  it("replaces string content", () => {
    const entry: SessionEntry = {
      type: "user",
      uuid: "u1",
      message: { content: "Original" },
    };
    const result = applyCompressedContent(entry, "Compressed");
    expect(result.message?.content).toBe("Compressed");
    // Verify original entry is not mutated
    expect(entry.message?.content).toBe("Original");
  });

  it("replaces text blocks in array content while preserving non-text blocks", () => {
    const entry: SessionEntry = {
      type: "assistant",
      uuid: "a1",
      message: {
        content: [
          { type: "text", text: "Old text 1" },
          { type: "image", data: "imagedata" },
          { type: "text", text: "Old text 2" },
        ],
      },
    };
    const result = applyCompressedContent(entry, "New compressed text");

    // Content should be an array
    expect(Array.isArray(result.message?.content)).toBe(true);
    const content = result.message?.content as Array<{ type: string; [key: string]: unknown }>;

    // Should have 2 items: new text block + preserved image
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "text", text: "New compressed text" });
    expect(content[1].type).toBe("image");

    // Verify original entry is not mutated
    const originalContent = entry.message?.content as Array<{ type: string }>;
    expect(originalContent).toHaveLength(3);
  });
});

describe("mapTurnsToBands", () => {
  it("TC-03: maps turns to multiple non-contiguous bands", () => {
    // 10 turns (indices 0-9), each turn spans 2 entries
    const turns: Turn[] = Array.from({ length: 10 }, (_, i) => ({
      startIndex: i * 2,
      endIndex: i * 2 + 1,
    }));

    const bands: CompressionBand[] = [
      { start: 0, end: 30, level: "heavy-compress" },
      { start: 50, end: 80, level: "compress" },
    ];

    const mapping = mapTurnsToBands(turns, bands);

    // Turn 0 (0%): heavy-compress
    expect(mapping[0].turnIndex).toBe(0);
    expect(mapping[0].band?.level).toBe("heavy-compress");

    // Turn 1 (10%): heavy-compress
    expect(mapping[1].band?.level).toBe("heavy-compress");

    // Turn 2 (20%): heavy-compress
    expect(mapping[2].band?.level).toBe("heavy-compress");

    // Turn 3 (30%): null (30 is not < 30)
    expect(mapping[3].band).toBeNull();

    // Turn 4 (40%): null
    expect(mapping[4].band).toBeNull();

    // Turn 5 (50%): compress
    expect(mapping[5].band?.level).toBe("compress");

    // Turn 6 (60%): compress
    expect(mapping[6].band?.level).toBe("compress");

    // Turn 7 (70%): compress
    expect(mapping[7].band?.level).toBe("compress");

    // Turn 8 (80%): null (80 is not < 80)
    expect(mapping[8].band).toBeNull();

    // Turn 9 (90%): null
    expect(mapping[9].band).toBeNull();
  });

  it("TC-04: keeps entire turn in same band (boundary test)", () => {
    const turns: Turn[] = Array.from({ length: 10 }, (_, i) => ({
      startIndex: i * 2,
      endIndex: i * 2 + 1,
    }));

    const bands: CompressionBand[] = [{ start: 0, end: 45, level: "compress" }];

    const mapping = mapTurnsToBands(turns, bands);

    // Turn 4 (40%): in band [0, 45)
    expect(mapping[4].band).not.toBeNull();
    expect(mapping[4].band?.level).toBe("compress");

    // Turn 5 (50%): NOT in band (50 >= 45)
    expect(mapping[5].band).toBeNull();
  });

  it("returns empty array for empty turns", () => {
    const mapping = mapTurnsToBands([], [{ start: 0, end: 100, level: "compress" }]);
    expect(mapping).toEqual([]);
  });

  it("returns all null bands when no bands provided", () => {
    const turns: Turn[] = [
      { startIndex: 0, endIndex: 1 },
      { startIndex: 2, endIndex: 3 },
    ];
    const mapping = mapTurnsToBands(turns, []);

    expect(mapping[0].band).toBeNull();
    expect(mapping[1].band).toBeNull();
  });

  it("handles single turn correctly (position 0%)", () => {
    const turns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
    const bands: CompressionBand[] = [{ start: 0, end: 50, level: "compress" }];

    const mapping = mapTurnsToBands(turns, bands);

    // Single turn at position 0% should be in band [0, 50)
    expect(mapping[0].band?.level).toBe("compress");
  });
});

describe("createCompressionTasks", () => {
  it("TC-05: marks messages below 20 token threshold as skipped", () => {
    const entries: SessionEntry[] = [
      {
        type: "user",
        uuid: "u1",
        parentUuid: null,
        message: { content: "Short" }, // ~2 tokens (5 chars / 4 = 1.25 -> 2)
      },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        message: {
          content: [{ type: "text", text: "x".repeat(100) }], // 25 tokens (100 / 4)
        },
      },
    ];

    const turns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
    const mapping: TurnBandMapping[] = [
      { turnIndex: 0, band: { start: 0, end: 100, level: "compress" } },
    ];

    const tasks = createCompressionTasks(entries, turns, mapping);

    expect(tasks.length).toBe(2);

    const userTask = tasks.find((t) => t.messageIndex === 0);
    const assistantTask = tasks.find((t) => t.messageIndex === 1);

    expect(userTask).toBeDefined();
    expect(userTask?.status).toBe("skipped");
    expect(userTask?.estimatedTokens).toBeLessThan(30);

    expect(assistantTask).toBeDefined();
    expect(assistantTask?.status).toBe("skipped");
    expect(assistantTask?.estimatedTokens).toBeLessThan(30);
    expect(assistantTask?.level).toBe("compress");
    expect(assistantTask?.attempt).toBe(0);
  });

  it("creates tasks only for turns with non-null bands", () => {
    const entries: SessionEntry[] = [
      {
        type: "user",
        uuid: "u1",
        parentUuid: null,
        message: { content: "x".repeat(100) }, // 25 tokens
      },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        message: { content: [{ type: "text", text: "x".repeat(100) }] },
      },
      {
        type: "user",
        uuid: "u2",
        parentUuid: "a1",
        message: { content: "x".repeat(100) },
      },
      {
        type: "assistant",
        uuid: "a2",
        parentUuid: "u2",
        message: { content: [{ type: "text", text: "x".repeat(100) }] },
      },
    ];

    const turns: Turn[] = [
      { startIndex: 0, endIndex: 1 },
      { startIndex: 2, endIndex: 3 },
    ];
    const mapping: TurnBandMapping[] = [
      { turnIndex: 0, band: { start: 0, end: 50, level: "compress" } },
      { turnIndex: 1, band: null }, // No band for turn 1
    ];

    const tasks = createCompressionTasks(entries, turns, mapping);

    // Only messages from turn 0 should have tasks (indices 0, 1)
    expect(tasks.length).toBe(2);
    expect(tasks.every((t) => t.messageIndex <= 1)).toBe(true);
  });

  it("sets correct entry type for user and assistant messages", () => {
    const entries: SessionEntry[] = [
      {
        type: "user",
        uuid: "u1",
        message: { content: "x".repeat(100) },
      },
      {
        type: "assistant",
        uuid: "a1",
        message: { content: [{ type: "text", text: "x".repeat(100) }] },
      },
    ];

    const turns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
    const mapping: TurnBandMapping[] = [
      { turnIndex: 0, band: { start: 0, end: 100, level: "heavy-compress" } },
    ];

    const tasks = createCompressionTasks(entries, turns, mapping);

    const userTask = tasks.find((t) => t.messageIndex === 0);
    const assistantTask = tasks.find((t) => t.messageIndex === 1);

    expect(userTask?.entryType).toBe("user");
    expect(assistantTask?.entryType).toBe("assistant");
  });

  it("skips non-user/assistant entry types", () => {
    const entries: SessionEntry[] = [
      {
        type: "queue-operation",
        operation: "enqueue",
      },
      {
        type: "user",
        uuid: "u1",
        message: { content: "x".repeat(100) },
      },
      {
        type: "assistant",
        uuid: "a1",
        message: { content: [{ type: "text", text: "x".repeat(100) }] },
      },
    ];

    const turns: Turn[] = [{ startIndex: 1, endIndex: 2 }]; // Turn only includes user/assistant
    const mapping: TurnBandMapping[] = [
      { turnIndex: 0, band: { start: 0, end: 100, level: "compress" } },
    ];

    const tasks = createCompressionTasks(entries, turns, mapping);

    // No task for queue-operation
    expect(tasks.every((t) => t.messageIndex >= 1)).toBe(true);
  });
});

describe("applyCompressionResults", () => {
  it("applies successful compression results to entries", () => {
    const entries: SessionEntry[] = [
      {
        type: "user",
        uuid: "u1",
        message: { content: "Original user message" },
      },
      {
        type: "assistant",
        uuid: "a1",
        message: { content: [{ type: "text", text: "Original assistant message" }] },
      },
    ];

    const results: CompressionTask[] = [
      {
        messageIndex: 0,
        entryType: "user",
        originalContent: "Original user message",
        level: "compress",
        estimatedTokens: 100,
        attempt: 1,
        timeoutMs: 5000,
        status: "success",
        result: "Compressed user",
      },
      {
        messageIndex: 1,
        entryType: "assistant",
        originalContent: "Original assistant message",
        level: "compress",
        estimatedTokens: 100,
        attempt: 1,
        timeoutMs: 5000,
        status: "success",
        result: "Compressed assistant",
      },
    ];

    const updatedEntries = applyCompressionResults(entries, results);

    expect(updatedEntries[0].message?.content).toBe("Compressed user");
    // Assistant message should have text block replaced
    const assistantContent = updatedEntries[1].message?.content as Array<{
      type: string;
      text?: string;
    }>;
    expect(assistantContent[0].text).toBe("Compressed assistant");
  });

  it("preserves entries for failed compression tasks", () => {
    const entries: SessionEntry[] = [
      {
        type: "user",
        uuid: "u1",
        message: { content: "Original user message" },
      },
      {
        type: "assistant",
        uuid: "a1",
        message: { content: [{ type: "text", text: "Original assistant message" }] },
      },
    ];

    const results: CompressionTask[] = [
      {
        messageIndex: 0,
        entryType: "user",
        originalContent: "Original user message",
        level: "compress",
        estimatedTokens: 100,
        attempt: 3,
        timeoutMs: 5000,
        status: "failed",
        error: "Timeout",
      },
      {
        messageIndex: 1,
        entryType: "assistant",
        originalContent: "Original assistant message",
        level: "compress",
        estimatedTokens: 100,
        attempt: 1,
        timeoutMs: 5000,
        status: "success",
        result: "Compressed assistant",
      },
    ];

    const updatedEntries = applyCompressionResults(entries, results);

    // User message unchanged (failed)
    expect(updatedEntries[0].message?.content).toBe("Original user message");
    // Assistant message compressed (success)
    const assistantContent = updatedEntries[1].message?.content as Array<{
      type: string;
      text?: string;
    }>;
    expect(assistantContent[0].text).toBe("Compressed assistant");
  });
});

describe("compressMessages", () => {
  it("TC-10: returns unchanged entries when no compression bands", async () => {
    const entries: SessionEntry[] = [
      {
        type: "queue-operation",
        operation: "enqueue",
      },
      {
        type: "user",
        uuid: "u1",
        parentUuid: null,
        message: { content: "User message content here" },
      },
      {
        type: "assistant",
        uuid: "a1",
        parentUuid: "u1",
        message: {
          content: [{ type: "text", text: "Assistant response content" }],
        },
      },
    ];

    const turns: Turn[] = [{ startIndex: 1, endIndex: 2 }];
    const bands: CompressionBand[] = []; // Empty bands

    const result = await compressMessages(entries, turns, bands, defaultConfig);

    // Entries should be unchanged
    expect(result.entries).toEqual(entries);
    // Stats should show 0 compression
    expect(result.stats.messagesCompressed).toBe(0);
    expect(result.stats.messagesSkipped).toBe(0);
    expect(result.stats.messagesFailed).toBe(0);
    expect(result.stats.originalTokens).toBe(0);
    expect(result.stats.compressedTokens).toBe(0);
    expect(result.stats.tokensRemoved).toBe(0);
    expect(result.stats.reductionPercent).toBe(0);
    // Tasks should be empty array for empty bands
    expect(result.tasks).toEqual([]);
  });
});
