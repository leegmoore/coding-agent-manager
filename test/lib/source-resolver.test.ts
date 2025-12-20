import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { resolveSession, isValidUuid } from "../../src/lib/source-resolver.js";

describe("Source Resolver", () => {
  const copilotFixtures = path.join(process.cwd(), "test/fixtures/copilot-sessions/workspaceStorage");
  const claudeFixtures = path.join(process.cwd(), "test/fixtures/session-browser");

  beforeAll(() => {
    process.env.VSCODE_STORAGE_PATH = copilotFixtures;
    process.env.CLAUDE_DIR = claudeFixtures;
  });

  afterAll(() => {
    delete process.env.VSCODE_STORAGE_PATH;
    delete process.env.CLAUDE_DIR;
  });

  // AC-21/AC-23: Session ID validation for source resolution
  describe("isValidUuid", () => {
    it("returns true for valid UUID", () => {
      expect(isValidUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    });

    it("returns true for UUID with uppercase", () => {
      expect(isValidUuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")).toBe(true);
    });

    it("returns false for invalid format", () => {
      expect(isValidUuid("not-a-uuid")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isValidUuid("")).toBe(false);
    });

    it("returns false for UUID without dashes", () => {
      expect(isValidUuid("11111111111111111111111111111111")).toBe(false);
    });
  });

  describe("resolveSession", () => {
    // AC-21: System searches Claude first, then Copilot
    it("finds Claude-only session", async () => {
      // aaaaaaaa... only exists in Claude fixtures (test/fixtures/session-browser/projects/-Users-test-edgecases/)
      const result = await resolveSession("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

      expect(result).not.toBeNull();
      expect(result!.source).toBe("claude");
      expect(result!.location).toBe("-Users-test-edgecases");
    });

    // AC-21: System searches Claude first, then Copilot
    it("finds Copilot-only session", async () => {
      // 44444444... only exists in Copilot fixtures
      const result = await resolveSession("44444444-4444-4444-4444-444444444444");

      expect(result).not.toBeNull();
      expect(result!.source).toBe("copilot");
      expect(result!.location).toBe("abc123def456ghi789");
    });

    // AC-24: Display "Session not found" for non-existent IDs
    it("returns null for non-existent session", async () => {
      const result = await resolveSession("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });

    // AC-24: Display "Session not found" for invalid input
    it("returns null for invalid UUID format", async () => {
      const result = await resolveSession("not-a-uuid");
      expect(result).toBeNull();
    });

    // AC-24: Display "Session not found" for empty input
    it("returns null for empty string", async () => {
      const result = await resolveSession("");
      expect(result).toBeNull();
    });

    // AC-21: Claude searched first (priority)
    it("searches Claude before Copilot when session exists in both", async () => {
      // 11111111... exists in BOTH Claude and Copilot fixtures
      // Claude should be returned first due to search priority
      const result = await resolveSession("11111111-1111-1111-1111-111111111111");

      expect(result).not.toBeNull();
      expect(result!.source).toBe("claude");
      expect(result!.location).toBe("-Users-test-projectalpha");
    });
  });
});
