import { describe, it, expect } from "vitest";
import { formatRelativeTime, formatFileSize, escapeHtml } from "../../../public/js/lib/format.js";

describe("formatRelativeTime", () => {
  it("returns 'just now' for times < 60 seconds ago", () => {
    const date = new Date(Date.now() - 30 * 1000); // 30 seconds ago
    expect(formatRelativeTime(date)).toBe("just now");
  });

  it("returns minutes for times < 60 minutes ago", () => {
    const date = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    expect(formatRelativeTime(date)).toBe("15m ago");
  });

  it("returns hours for times < 24 hours ago", () => {
    const date = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
    expect(formatRelativeTime(date)).toBe("5h ago");
  });

  it("returns days for times < 7 days ago", () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    expect(formatRelativeTime(date)).toBe("3d ago");
  });

  it("returns month/day format for older dates", () => {
    const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const result = formatRelativeTime(date);
    // Should be like "Nov 10" or "Dec 8"
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("returns '1m ago' at exactly 60 seconds", () => {
    const date = new Date(Date.now() - 60 * 1000); // exactly 60 seconds
    expect(formatRelativeTime(date)).toBe("1m ago");
  });

  it("returns '1h ago' at exactly 60 minutes", () => {
    const date = new Date(Date.now() - 60 * 60 * 1000); // exactly 60 minutes
    expect(formatRelativeTime(date)).toBe("1h ago");
  });
});

describe("formatFileSize", () => {
  it("formats bytes correctly", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes correctly", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes correctly", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });

  it("handles zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});

describe("escapeHtml", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"test"')).toBe("&quot;test&quot;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
