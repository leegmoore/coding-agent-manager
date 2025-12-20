import { describe, it, expect } from "vitest";
import { estimateTokens, estimateContentTokens } from "../../src/lib/token-estimator.js";

describe("Token Estimator", () => {
  // AC-30: All token displays use estimateTokens(text) function: Math.ceil(wordCount * 0.75)
  describe("estimateTokens", () => {
    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("returns 0 for whitespace only", () => {
      expect(estimateTokens("   ")).toBe(0);
    });

    it("returns 0 for null/undefined", () => {
      expect(estimateTokens(null as unknown as string)).toBe(0);
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });

    // AC-30: wordCount * 0.75 rounded up
    it("counts single word", () => {
      // 1 word * 0.75 = 0.75, ceil = 1
      expect(estimateTokens("hello")).toBe(1);
    });

    // AC-30: wordCount * 0.75 rounded up
    it("calculates words * 0.75 rounded up", () => {
      // 4 words * 0.75 = 3.0, ceil = 3
      expect(estimateTokens("one two three four")).toBe(3);
    });

    // AC-30: wordCount * 0.75 rounded up
    it("rounds up fractional results", () => {
      // 2 words * 0.75 = 1.5, ceil = 2
      expect(estimateTokens("one two")).toBe(2);
    });

    it("handles multiple spaces", () => {
      // Still 3 words: 3 * 0.75 = 2.25, ceil = 3
      expect(estimateTokens("one   two   three")).toBe(3);
    });

    it("handles leading/trailing whitespace", () => {
      // 2 words * 0.75 = 1.5, ceil = 2
      expect(estimateTokens("  hello world  ")).toBe(2);
    });

    it("handles newlines", () => {
      // 4 words * 0.75 = 3.0, ceil = 3
      expect(estimateTokens("line one\nline two")).toBe(3);
    });

    it("handles tabs", () => {
      // 3 words * 0.75 = 2.25, ceil = 3
      expect(estimateTokens("one\ttwo\tthree")).toBe(3);
    });

    // AC-30: Consistent estimation for large content
    it("handles 100 words", () => {
      const text = Array(100).fill("word").join(" ");
      // 100 * 0.75 = 75.0, ceil = 75
      expect(estimateTokens(text)).toBe(75);
    });

    it("handles 1000 words", () => {
      const text = Array(1000).fill("word").join(" ");
      // 1000 * 0.75 = 750.0, ceil = 750
      expect(estimateTokens(text)).toBe(750);
    });

    it("handles mixed whitespace", () => {
      // 3 words * 0.75 = 2.25, ceil = 3
      expect(estimateTokens("one  \n  two  \t  three")).toBe(3);
    });
  });

  // AC-30, AC-31: Token estimation for structured content blocks
  describe("estimateContentTokens", () => {
    it("handles string content", () => {
      // 2 words * 0.75 = 1.5, ceil = 2
      expect(estimateContentTokens("hello world")).toBe(2);
    });

    it("handles empty string", () => {
      expect(estimateContentTokens("")).toBe(0);
    });

    it("handles text block", () => {
      const blocks = [{ type: "text", text: "hello world" }];
      // 2 words * 0.75 = 1.5, ceil = 2
      expect(estimateContentTokens(blocks)).toBe(2);
    });

    it("handles multiple text blocks", () => {
      const blocks = [
        { type: "text", text: "hello world" },
        { type: "text", text: "foo bar baz" }
      ];
      // Each block calculated separately with ceil:
      // Block 1: 2 words * 0.75 = 1.5, ceil = 2 tokens
      // Block 2: 3 words * 0.75 = 2.25, ceil = 3 tokens
      // Total: 2 + 3 = 5 tokens
      expect(estimateContentTokens(blocks)).toBe(5);
    });

    it("handles tool_use block", () => {
      const blocks = [{ type: "tool_use", input: { command: "ls -la" } }];
      expect(estimateContentTokens(blocks)).toBeGreaterThan(0);
    });

    it("handles tool_result block with string", () => {
      const blocks = [{ type: "tool_result", content: "file1 file2 file3" }];
      // 3 words * 0.75 = 2.25, ceil = 3
      expect(estimateContentTokens(blocks)).toBe(3);
    });

    it("handles thinking block", () => {
      const blocks = [{ type: "thinking", thinking: "Let me think about this problem" }];
      // 6 words * 0.75 = 4.5, ceil = 5
      expect(estimateContentTokens(blocks)).toBe(5);
    });

    it("handles empty array", () => {
      expect(estimateContentTokens([])).toBe(0);
    });

    it("handles unknown block types", () => {
      const blocks = [{ type: "unknown", data: "something" }];
      expect(estimateContentTokens(blocks)).toBe(0);
    });

    it("handles mixed block types", () => {
      const blocks = [
        { type: "text", text: "hello world" },
        { type: "thinking", thinking: "let me think" },
        { type: "unknown", data: "ignored" }
      ];
      // Each block calculated separately with ceil:
      // text: 2 words * 0.75 = 1.5, ceil = 2 tokens
      // thinking: 3 words * 0.75 = 2.25, ceil = 3 tokens
      // unknown: 0 tokens
      // Total: 2 + 3 + 0 = 5 tokens
      expect(estimateContentTokens(blocks)).toBe(5);
    });

    it("handles null/undefined", () => {
      expect(estimateContentTokens(null as unknown as string)).toBe(0);
      expect(estimateContentTokens(undefined as unknown as string)).toBe(0);
    });
  });
});
