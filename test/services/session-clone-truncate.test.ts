import { describe, it, expect } from "vitest";
import { truncateToolContent } from "../../src/services/session-clone.js";

describe("truncateToolContent", () => {
  it("returns original content when under limits", () => {
    const content = "short content";
    expect(truncateToolContent(content)).toBe("short content");
  });

  it("returns original when exactly 3 lines and under 250 chars", () => {
    const content = "line1\nline2\nline3";
    expect(truncateToolContent(content)).toBe("line1\nline2\nline3");
  });

  it("truncates to 3 lines when more than 3 lines", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    const result = truncateToolContent(content);
    expect(result).toBe("line1\nline2\nline3...");
  });

  it("truncates to 250 chars when content is too long", () => {
    const content = "x".repeat(300);
    const result = truncateToolContent(content);
    expect(result.length).toBeLessThanOrEqual(253); // 250 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("adds ellipsis when truncated by lines", () => {
    const content = "a\nb\nc\nd";
    const result = truncateToolContent(content);
    expect(result).toBe("a\nb\nc...");
  });

  it("adds ellipsis when truncated by chars", () => {
    const longLine = "x".repeat(300);
    const result = truncateToolContent(longLine);
    expect(result).toBe("x".repeat(250) + "...");
  });

  it("handles empty string", () => {
    expect(truncateToolContent("")).toBe("");
  });

  it("handles null/undefined gracefully", () => {
    expect(truncateToolContent(null as any)).toBe(null);
    expect(truncateToolContent(undefined as any)).toBe(undefined);
  });

  it("prefers shorter limit (chars over lines)", () => {
    // 3 lines but first line is 300 chars
    const content = "x".repeat(300) + "\nshort\nshort";
    const result = truncateToolContent(content);
    expect(result.length).toBeLessThanOrEqual(253);
  });

  it("trims trailing whitespace before adding ellipsis", () => {
    const content = "line1   \nline2\nline3   \nline4";
    const result = truncateToolContent(content);
    expect(result).toBe("line1   \nline2\nline3...");
  });
});
