import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { app } from "../src/server.js";
import {
  getSessionTurns,
  calculateCumulativeTokens,
  extractTurnContent,
  classifyBlock,
} from "../src/services/session-turns.js";
import type { SessionEntry, Turn, ContentBlock } from "../src/types.js";

const validSessionId = "00000000-0000-0000-0000-000000000002";
const unknownSessionId = "00000000-0000-0000-0000-00000000ffff";

let baseUrl: string;
let server: ReturnType<typeof app.listen>;

beforeAll(() => {
  // Point CLAUDE_DIR to test fixtures for session-turns
  process.env.CLAUDE_DIR = path.join(process.cwd(), "test/fixtures/session-turns");

  server = app.listen(0);
  const address = server.address();
  if (address && typeof address !== "string") {
    baseUrl = `http://127.0.0.1:${address.port}`;
  } else {
    throw new Error("Failed to start test server");
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server?.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
});

describe("classifyBlock", () => {
  it('returns "text" for text blocks', () => {
    expect(classifyBlock({ type: "text", text: "hello" } as ContentBlock)).toBe("text");
  });

  it('returns "thinking" for thinking blocks', () => {
    expect(classifyBlock({ type: "thinking", thinking: "reasoning..." } as ContentBlock)).toBe(
      "thinking"
    );
  });

  it('returns "tool" for tool_use blocks', () => {
    expect(
      classifyBlock({ type: "tool_use", id: "1", name: "read_file", input: {} } as ContentBlock)
    ).toBe("tool");
  });

  it('returns "tool" for tool_result blocks', () => {
    expect(
      classifyBlock({ type: "tool_result", tool_use_id: "1", content: "result" } as ContentBlock)
    ).toBe("tool");
  });
});

describe("calculateCumulativeTokens", () => {
  it("returns zero counts for empty entries", () => {
    const result = calculateCumulativeTokens([], [], 0);
    expect(result).toEqual({ user: 0, assistant: 0, thinking: 0, tool: 0, total: 0 });
  });

  it("counts user message tokens", () => {
    const entries: SessionEntry[] = [{ type: "user", message: { role: "user", content: "hello world" } }];
    const turns: Turn[] = [{ startIndex: 0, endIndex: 0 }];
    const result = calculateCumulativeTokens(entries, turns, 0);
    expect(result.user).toBeGreaterThan(0);
    expect(result.assistant).toBe(0);
    expect(result.total).toBe(result.user);
  });

  it("counts assistant message tokens", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "hi" } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hello back" }] } },
    ];
    const turns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
    const result = calculateCumulativeTokens(entries, turns, 0);
    expect(result.user).toBeGreaterThan(0);
    expect(result.assistant).toBeGreaterThan(0);
  });

  it("counts thinking tokens separately", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "hi" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "let me think about this" },
            { type: "text", text: "response" },
          ],
        },
      },
    ];
    const turns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
    const result = calculateCumulativeTokens(entries, turns, 0);
    expect(result.thinking).toBeGreaterThan(0);
    expect(result.assistant).toBeGreaterThan(0);
  });

  it("counts tool tokens separately", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "read file" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "1", name: "read_file", input: { path: "/test.txt" } }],
        },
      },
      {
        type: "user",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "1", content: "file contents here" }],
        },
      },
    ];
    const turns: Turn[] = [{ startIndex: 0, endIndex: 2 }];
    const result = calculateCumulativeTokens(entries, turns, 0);
    expect(result.tool).toBeGreaterThan(0);
  });

  it("accumulates tokens across multiple turns", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "first message" } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "first response" }] } },
      { type: "user", message: { role: "user", content: "second message" } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "second response" }] } },
    ];
    const turns: Turn[] = [
      { startIndex: 0, endIndex: 1 },
      { startIndex: 2, endIndex: 3 },
    ];
    const turn0 = calculateCumulativeTokens(entries, turns, 0);
    const turn1 = calculateCumulativeTokens(entries, turns, 1);
    expect(turn1.total).toBeGreaterThan(turn0.total);
    expect(turn1.user).toBeGreaterThan(turn0.user);
    expect(turn1.assistant).toBeGreaterThan(turn0.assistant);
  });

  it("total equals sum of all types", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "hello" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "thinking" },
            { type: "text", text: "response" },
            { type: "tool_use", id: "1", name: "test", input: {} },
          ],
        },
      },
    ];
    const turns: Turn[] = [{ startIndex: 0, endIndex: 1 }];
    const result = calculateCumulativeTokens(entries, turns, 0);
    expect(result.total).toBe(result.user + result.assistant + result.thinking + result.tool);
  });
});

describe("extractTurnContent", () => {
  it("extracts user prompt from string content", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "hello world" } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } },
    ];
    const turn: Turn = { startIndex: 0, endIndex: 1 };
    const result = extractTurnContent(entries, turn);
    expect(result.userPrompt).toBe("hello world");
  });

  it("extracts user prompt from text block array", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: [{ type: "text", text: "hello world" }] } },
      { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } },
    ];
    const turn: Turn = { startIndex: 0, endIndex: 1 };
    const result = extractTurnContent(entries, turn);
    expect(result.userPrompt).toBe("hello world");
  });

  it("extracts assistant response text", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "hi" } },
      {
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "hello back to you" }] },
      },
    ];
    const turn: Turn = { startIndex: 0, endIndex: 1 };
    const result = extractTurnContent(entries, turn);
    expect(result.assistantResponse).toBe("hello back to you");
  });

  it("excludes thinking blocks from assistant response", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "hi" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "internal thought" },
            { type: "text", text: "visible response" },
          ],
        },
      },
    ];
    const turn: Turn = { startIndex: 0, endIndex: 1 };
    const result = extractTurnContent(entries, turn);
    expect(result.assistantResponse).toBe("visible response");
    expect(result.assistantResponse).not.toContain("internal thought");
  });

  it("extracts tool blocks with name and content", () => {
    const entries: SessionEntry[] = [
      { type: "user", message: { role: "user", content: "read file" } },
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "1", name: "read_file", input: { path: "/test.txt" } }],
        },
      },
    ];
    const turn: Turn = { startIndex: 0, endIndex: 1 };
    const result = extractTurnContent(entries, turn);
    expect(result.toolBlocks).toHaveLength(1);
    expect(result.toolBlocks[0].name).toBe("read_file");
    expect(result.toolBlocks[0].content).toContain("/test.txt");
  });

  it("returns empty arrays/strings for minimal turn", () => {
    const entries: SessionEntry[] = [{ type: "user", message: { role: "user", content: "" } }];
    const turn: Turn = { startIndex: 0, endIndex: 0 };
    const result = extractTurnContent(entries, turn);
    expect(result.userPrompt).toBe("");
    expect(result.toolBlocks).toEqual([]);
    expect(result.assistantResponse).toBe("");
  });
});

describe("getSessionTurns", () => {
  it("returns session data with correct structure", async () => {
    const result = await getSessionTurns(validSessionId);
    expect(result.sessionId).toBe(validSessionId);
    expect(typeof result.totalTurns).toBe("number");
    expect(Array.isArray(result.turns)).toBe(true);
  });

  it("returns correct number of turns", async () => {
    const result = await getSessionTurns(validSessionId);
    expect(result.totalTurns).toBe(result.turns.length);
  });

  it("each turn has required structure", async () => {
    const result = await getSessionTurns(validSessionId);
    for (const turn of result.turns) {
      expect(typeof turn.turnIndex).toBe("number");
      expect(turn.cumulative).toHaveProperty("user");
      expect(turn.cumulative).toHaveProperty("assistant");
      expect(turn.cumulative).toHaveProperty("thinking");
      expect(turn.cumulative).toHaveProperty("tool");
      expect(turn.cumulative).toHaveProperty("total");
      expect(turn.content).toHaveProperty("userPrompt");
      expect(turn.content).toHaveProperty("toolBlocks");
      expect(turn.content).toHaveProperty("assistantResponse");
    }
  });

  it("cumulative tokens increase across turns", async () => {
    const result = await getSessionTurns(validSessionId);
    if (result.turns.length >= 2) {
      expect(result.turns[1].cumulative.total).toBeGreaterThanOrEqual(
        result.turns[0].cumulative.total
      );
    }
  });

  it("throws SessionNotFoundError for unknown session", async () => {
    await expect(getSessionTurns(unknownSessionId)).rejects.toThrow("Session not found");
  });
});

describe("GET /api/session/:id/turns", () => {
  it("returns 400 for invalid UUID format", async () => {
    const res = await fetch(`${baseUrl}/api/session/not-a-uuid/turns`);
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown session", async () => {
    const res = await fetch(`${baseUrl}/api/session/${unknownSessionId}/turns`);
    expect(res.status).toBe(404);
  });

  it("returns 200 with turn data for valid session", async () => {
    const res = await fetch(`${baseUrl}/api/session/${validSessionId}/turns`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBe(validSessionId);
    expect(Array.isArray(data.turns)).toBe(true);
  });

  it("response matches SessionTurnsResponse schema", async () => {
    const res = await fetch(`${baseUrl}/api/session/${validSessionId}/turns`);
    const data = await res.json();
    expect(data).toHaveProperty("sessionId");
    expect(data).toHaveProperty("totalTurns");
    expect(data).toHaveProperty("turns");
    expect(data.totalTurns).toBe(data.turns.length);
  });
});

describe("edge cases", () => {
  const fixtures = {
    empty: "00000000-0000-0000-0000-000000000001",
    single: "00000000-0000-0000-0000-000000000002",
    onlyUser: "00000000-0000-0000-0000-000000000003",
    heavyThinking: "00000000-0000-0000-0000-000000000004",
    heavyTools: "00000000-0000-0000-0000-000000000005",
    large: "00000000-0000-0000-0000-000000000006",
    mixed: "00000000-0000-0000-0000-000000000007",
    toolResultUser: "00000000-0000-0000-0000-000000000008",
    metaOnly: "00000000-0000-0000-0000-000000000009",
  };

  it("empty session returns zero turns", async () => {
    const res = await getSessionTurns(fixtures.empty);
    expect(res.totalTurns).toBe(0);
    expect(res.turns).toEqual([]);
  });

  it("single turn matches token totals", async () => {
    const res = await getSessionTurns(fixtures.single);
    expect(res.totalTurns).toBe(1);
    expect(res.turns[0].cumulative.total).toBeGreaterThan(0);
    expect(res.turns[0].cumulative.total).toBe(
      res.turns[0].cumulative.user +
        res.turns[0].cumulative.assistant +
        res.turns[0].cumulative.thinking +
        res.turns[0].cumulative.tool
    );
  });

  it("only-user session handles missing assistant response", async () => {
    const res = await getSessionTurns(fixtures.onlyUser);
    expect(res.totalTurns).toBe(1);
    expect(res.turns[0].content.assistantResponse).toBe("");
  });

  it("heavy thinking buckets tokens into thinking", async () => {
    const res = await getSessionTurns(fixtures.heavyThinking);
    const last = res.turns.at(-1)!;
    expect(last.cumulative.thinking).toBeGreaterThan(0);
    expect(last.cumulative.assistant).toBeGreaterThan(0);
  });

  it("heavy tools buckets tokens into tool", async () => {
    const res = await getSessionTurns(fixtures.heavyTools);
    const last = res.turns.at(-1)!;
    expect(last.cumulative.tool).toBeGreaterThan(0);
  });

  it("large session grows cumulatively", async () => {
    const res = await getSessionTurns(fixtures.large);
    expect(res.totalTurns).toBeGreaterThanOrEqual(100);
    if (res.totalTurns >= 2) {
      const t0 = res.turns[0].cumulative.total;
      const t1 = res.turns[1].cumulative.total;
      expect(t1).toBeGreaterThanOrEqual(t0);
    }
  });

  it("mixed content supports string and array content", async () => {
    const res = await getSessionTurns(fixtures.mixed);
    expect(res.totalTurns).toBeGreaterThan(0);
    const anyAssistant = res.turns.some((t) => t.content.assistantResponse.length > 0);
    expect(anyAssistant).toBe(true);
  });

  it("tool_result in user message counts as tool tokens", async () => {
    const res = await getSessionTurns(fixtures.toolResultUser);
    const last = res.turns.at(-1)!;
    expect(last.cumulative.tool).toBeGreaterThan(0);
  });

  it("meta entries are ignored in token counts", async () => {
    const res = await getSessionTurns(fixtures.metaOnly);
    expect(res.totalTurns).toBe(0);
    expect(res.turns).toEqual([]);
  });
});

