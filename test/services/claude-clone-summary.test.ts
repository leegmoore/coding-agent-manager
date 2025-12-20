import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { readFile, unlink } from "fs/promises";
import path from "path";
import { cloneSession } from "../../src/services/session-clone.js";

describe("Claude Clone Summary Entry", () => {
  const claudeFixtures = path.join(process.cwd(), "test/fixtures/session-browser");
  const createdFiles: string[] = [];

  beforeAll(() => {
    process.env.CLAUDE_DIR = claudeFixtures;
  });

  afterAll(() => {
    delete process.env.CLAUDE_DIR;
  });

  afterEach(async () => {
    // Clean up any cloned session files created during tests
    for (const filePath of createdFiles) {
      try {
        await unlink(filePath);
      } catch {
        // Ignore errors if file doesn't exist
      }
    }
    createdFiles.length = 0;
  });

  it("prepends summary entry to cloned session output", async () => {
    // AC-6.1: Clone output begins with summary entry
    const result = await cloneSession({
      sessionId: "11111111-1111-1111-1111-111111111111",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });
    createdFiles.push(result.outputPath);

    // Read the cloned session file
    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim());
    expect(lines.length).toBeGreaterThan(0);

    const firstEntry = JSON.parse(lines[0]);
    expect(firstEntry.type).toBe("summary");
    expect(firstEntry.summary).toMatch(/^Clone: .+ \(.+\)$/);
  });

  it("includes first user message in summary", async () => {
    // AC-6.2: Summary contains preview of first user message
    const result = await cloneSession({
      sessionId: "11111111-1111-1111-1111-111111111111",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });
    createdFiles.push(result.outputPath);

    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim());
    const firstEntry = JSON.parse(lines[0]);

    // Summary should contain preview of first user message
    expect(firstEntry.summary).toContain("Clone:");
    // Should NOT be "(No message)" if session has user messages
    expect(firstEntry.summary).not.toContain("(No message)");
  });

  it("includes timestamp in summary", async () => {
    // AC-6.3: Summary includes formatted timestamp
    const result = await cloneSession({
      sessionId: "11111111-1111-1111-1111-111111111111",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });
    createdFiles.push(result.outputPath);

    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim());
    const firstEntry = JSON.parse(lines[0]);

    // Should have timestamp like "(Dec 12 2:30pm)"
    expect(firstEntry.summary).toMatch(/\([A-Z][a-z]{2} \d{1,2} \d{1,2}:\d{2}(am|pm)\)$/i);
  });

  it("sets leafUuid to first entry with uuid", async () => {
    // AC-6.4: Summary leafUuid points to first entry that has a uuid
    const result = await cloneSession({
      sessionId: "11111111-1111-1111-1111-111111111111",
      toolRemoval: "none",
      thinkingRemoval: "none"
    });
    createdFiles.push(result.outputPath);

    const content = await readFile(result.outputPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim());
    const summaryEntry = JSON.parse(lines[0]);

    // Find first entry with uuid in the output (skipping the new summary itself)
    let firstEntryWithUuid = null;
    for (let i = 1; i < lines.length; i++) {
      const entry = JSON.parse(lines[i]);
      if (entry.uuid) {
        firstEntryWithUuid = entry;
        break;
      }
    }

    // The clone summary entry must have leafUuid defined and point to first entry with uuid
    expect(summaryEntry.leafUuid).toBeDefined();
    expect(typeof summaryEntry.leafUuid).toBe("string");
    expect(firstEntryWithUuid).not.toBeNull();
    expect(summaryEntry.leafUuid).toBe(firstEntryWithUuid.uuid);
  });
});
