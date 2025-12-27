import { describe, it, expect } from "vitest";
import { truncateToolContent, truncateObjectValues } from "../../src/services/session-clone.js";

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

describe("truncateObjectValues", () => {
  it("preserves object structure while truncating string values", () => {
    const input = {
      command: "x".repeat(300),
      description: "short",
    };
    const { result, wasTruncated } = truncateObjectValues(input);

    expect(wasTruncated).toBe(true);
    expect(typeof result).toBe("object");
    expect((result as any).command).toBe("x".repeat(250) + "...");
    expect((result as any).description).toBe("short");
  });

  it("returns wasTruncated=false when nothing needs truncation", () => {
    const input = { command: "short", description: "also short" };
    const { result, wasTruncated } = truncateObjectValues(input);

    expect(wasTruncated).toBe(false);
    expect(result).toEqual(input);
  });

  it("handles nested objects", () => {
    const input = {
      outer: {
        inner: "x".repeat(300),
      },
    };
    const { result, wasTruncated } = truncateObjectValues(input);

    expect(wasTruncated).toBe(true);
    expect((result as any).outer.inner).toBe("x".repeat(250) + "...");
  });

  it("handles arrays of strings", () => {
    const input = {
      items: ["short", "x".repeat(300)],
    };
    const { result, wasTruncated } = truncateObjectValues(input);

    expect(wasTruncated).toBe(true);
    expect((result as any).items[0]).toBe("short");
    expect((result as any).items[1]).toBe("x".repeat(250) + "...");
  });

  it("preserves numbers and booleans unchanged", () => {
    const input = {
      count: 42,
      enabled: true,
      name: "x".repeat(300),
    };
    const { result, wasTruncated } = truncateObjectValues(input);

    expect(wasTruncated).toBe(true);
    expect((result as any).count).toBe(42);
    expect((result as any).enabled).toBe(true);
  });

  it("handles null and undefined", () => {
    expect(truncateObjectValues(null).result).toBe(null);
    expect(truncateObjectValues(undefined).result).toBe(undefined);
  });

  it("handles plain string input", () => {
    const { result, wasTruncated } = truncateObjectValues("x".repeat(300));

    expect(wasTruncated).toBe(true);
    expect(result).toBe("x".repeat(250) + "...");
  });

  it("handles tool_use input structure correctly", () => {
    // Real-world example: Bash tool input
    const input = {
      command: "git log --oneline | head -50 && git status && git diff HEAD~10",
      description: "Check git history and status",
    };
    const { result, wasTruncated } = truncateObjectValues(input);

    expect(wasTruncated).toBe(false); // Both strings are short
    expect(result).toEqual(input);
  });

  it("handles tool_use input with long command", () => {
    const input = {
      command: "cat " + "/very/long/path/".repeat(20) + "file.txt",
      description: "Read file",
    };
    const { result, wasTruncated } = truncateObjectValues(input);

    expect(wasTruncated).toBe(true);
    expect(typeof (result as any).command).toBe("string");
    expect((result as any).command.endsWith("...")).toBe(true);
    expect((result as any).description).toBe("Read file");
  });
});
