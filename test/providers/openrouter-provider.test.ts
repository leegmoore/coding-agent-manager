import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterProvider } from "../../src/providers/openrouter-provider.js";

/**
 * OpenRouterProvider Tests
 *
 * Tests the OpenRouter provider implementation:
 * - Constructor validation (API key from env)
 * - Model selection (standard vs large)
 * - Prompt construction (compression levels)
 * - Response parsing (JSON, markdown code blocks)
 * - Error handling (API errors)
 */

describe("OpenRouterProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODEL: "google/gemini-2.5-flash",
      OPENROUTER_MODEL_LARGE: "anthropic/claude-opus-4.5",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("throws ConfigMissingError if API key not set", () => {
      delete process.env.OPENROUTER_API_KEY;
      expect(() => new OpenRouterProvider()).toThrow("OPENROUTER_API_KEY");
    });

    it("creates provider with valid API key", () => {
      const provider = new OpenRouterProvider();
      expect(provider).toBeDefined();
    });
  });

  describe("compress", () => {
    it("sends request with correct format", async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new OpenRouterProvider();
      const result = await provider.compress("compress this", "compress", false);

      expect(result).toBe("compressed");
      expect(fetch).toHaveBeenCalledWith(
        "https://openrouter.ai/api/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        })
      );
    });

    it("uses standard model when useLargeModel is false", async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"text": "result"}' } }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new OpenRouterProvider();
      await provider.compress("test", "compress", false);

      const body = JSON.parse(
        (fetch as unknown as { mock: { calls: [unknown, { body: string }][] } }).mock.calls[0][1].body
      );
      expect(body.model).toBe("google/gemini-2.5-flash");
    });

    it("uses large model when useLargeModel is true", async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"text": "result"}' } }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new OpenRouterProvider();
      await provider.compress("test", "compress", true);

      const body = JSON.parse(
        (fetch as unknown as { mock: { calls: [unknown, { body: string }][] } }).mock.calls[0][1].body
      );
      expect(body.model).toBe("anthropic/claude-opus-4.5");
    });

    it("uses correct target percent for compress level", async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"text": "result"}' } }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new OpenRouterProvider();
      await provider.compress("test", "compress", false);

      const body = JSON.parse(
        (fetch as unknown as { mock: { calls: [unknown, { body: string }][] } }).mock.calls[0][1].body
      );
      expect(body.messages[0].content).toContain("35%");
    });

    it("uses correct target percent for heavy-compress level", async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"text": "result"}' } }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new OpenRouterProvider();
      await provider.compress("test", "heavy-compress", false);

      const body = JSON.parse(
        (fetch as unknown as { mock: { calls: [unknown, { body: string }][] } }).mock.calls[0][1].body
      );
      expect(body.messages[0].content).toContain("10%");
    });

    it("parses JSON from markdown code block", async () => {
      const mockResponse = {
        choices: [{ message: { content: '```json\n{"text": "result"}\n```' } }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const provider = new OpenRouterProvider();
      const result = await provider.compress("test", "compress", false);

      expect(result).toBe("result");
    });

    it("throws on API error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      const provider = new OpenRouterProvider();
      await expect(provider.compress("test", "compress", false)).rejects.toThrow(
        "OpenRouter API error 401"
      );
    });
  });
});
