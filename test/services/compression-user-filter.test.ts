import { describe, it, expect } from "vitest";
import { createCompressionTasks } from "../../src/services/compression.js";
import type { SessionEntry, Turn, TurnBandMapping } from "../../src/types.js";

describe("createCompressionTasks with includeUserMessages", () => {
  const createTestEntries = (): SessionEntry[] => [
    {
      type: "user",
      uuid: "u1",
      message: { content: "x".repeat(400) }, // 100 tokens
    },
    {
      type: "assistant",
      uuid: "a1",
      message: { content: [{ type: "text", text: "x".repeat(400) }] },
    },
  ];

  const turns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
  const mapping: TurnBandMapping[] = [
    { turnIndex: 0, band: { start: 0, end: 100, level: "compress" } },
  ];

  it("excludes user messages when includeUserMessages is false (default)", () => {
    const entries = createTestEntries();
    const tasks = createCompressionTasks(entries, turns, mapping, 50, false);

    expect(tasks.length).toBe(1);
    expect(tasks[0].entryType).toBe("assistant");
    expect(tasks[0].messageIndex).toBe(1);
  });

  it("includes user messages when includeUserMessages is true", () => {
    const entries = createTestEntries();
    const tasks = createCompressionTasks(entries, turns, mapping, 50, true);

    expect(tasks.length).toBe(2);

    const userTask = tasks.find((t) => t.entryType === "user");
    const assistantTask = tasks.find((t) => t.entryType === "assistant");

    expect(userTask).toBeDefined();
    expect(userTask?.messageIndex).toBe(0);
    expect(assistantTask).toBeDefined();
    expect(assistantTask?.messageIndex).toBe(1);
  });

  it("defaults to excluding user messages when parameter omitted", () => {
    const entries = createTestEntries();
    // Calling without the includeUserMessages parameter
    const tasks = createCompressionTasks(entries, turns, mapping, 50);

    expect(tasks.length).toBe(1);
    expect(tasks[0].entryType).toBe("assistant");
  });

  it("still skips non-user/assistant types regardless of flag", () => {
    const entries: SessionEntry[] = [
      { type: "summary", summary: "test" },
      {
        type: "assistant",
        uuid: "a1",
        message: { content: [{ type: "text", text: "x".repeat(400) }] },
      },
    ];

    const customTurns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
    const customMapping: TurnBandMapping[] = [
      { turnIndex: 0, band: { start: 0, end: 100, level: "compress" } },
    ];

    const tasks = createCompressionTasks(
      entries,
      customTurns,
      customMapping,
      50,
      true
    );

    // Should only have assistant, not summary
    expect(tasks.length).toBe(1);
    expect(tasks[0].entryType).toBe("assistant");
  });
});
