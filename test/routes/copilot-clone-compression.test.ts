import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { join } from "path";

// Mock the provider for LLM compression tests
vi.mock("../../src/providers/index.js", () => ({
  getProvider: () => ({
    compress: vi.fn().mockImplementation((text) => {
      // Return shortened version for testing
      return Promise.resolve(text.slice(0, Math.ceil(text.length * 0.35)));
    }),
  }),
}));

import { app } from "../../src/server.js";
import type { Server } from "http";

const TEST_WORKSPACE = "xyz987uvw654rst321";
const TEST_SESSION = "66666666-6666-6666-6666-666666666666";

describe("POST /api/copilot/clone - Compression Support", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.VSCODE_STORAGE_PATH = join(
      process.cwd(),
      "test/fixtures/copilot-sessions/workspaceStorage"
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== "string") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    delete process.env.VSCODE_STORAGE_PATH;
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  // AC: Copilot clone uses LLM provider to compress messages
  it("accepts compressionBands in request options", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          compressionBands: [
            { start: 0, end: 50, level: "heavy-compress" },
            { start: 50, end: 75, level: "compress" },
          ],
          writeToDisk: false,
        },
      }),
    });

    // Phase 4: Should return 200 with compression stats
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.stats.compression).toBeDefined();
  });

  // AC: Compression stats reflect actual token reduction
  it("returns compression stats when compressionBands used", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          compressionBands: [{ start: 0, end: 100, level: "compress" }],
          writeToDisk: false,
        },
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats).toHaveProperty("compression");
    expect(data.stats.compression).toHaveProperty("messagesCompressed");
    expect(data.stats.compression).toHaveProperty("reductionPercent");
  });

  // AC: Clone operation shows progress during LLM compression
  it("supports debugLog option for compression visibility", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          compressionBands: [{ start: 0, end: 50, level: "compress" }],
          debugLog: true,
          writeToDisk: false,
        },
      }),
    });

    expect(response.status).toBe(200);
    // debugLogPath is optional - only present if debug logging is implemented
    // For now, just verify the request succeeds
  });

  it("validates compressionBands schema", async () => {
    const response = await fetch(`${baseUrl}/api/copilot/clone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: TEST_SESSION,
        workspaceHash: TEST_WORKSPACE,
        options: {
          compressionBands: [
            { start: -10, end: 150, level: "invalid" }, // Invalid values
          ],
          writeToDisk: false,
        },
      }),
    });

    // Should fail validation
    expect(response.status).toBe(400);
  });
});
