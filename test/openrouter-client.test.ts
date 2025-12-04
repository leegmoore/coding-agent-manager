import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterClient } from "../src/services/openrouter-client.js";
import { ConfigMissingError } from "../src/errors.js";

/**
 * Phase 4 TDD Tests: OpenRouter Client
 *
 * These tests verify the OpenRouterClient:
 * - Constructor validation (API key required)
 * - Model selection (thinking vs regular)
 * - Prompt construction (compression levels)
 * - JSON extraction (markdown code blocks, raw JSON)
 * - Zod validation (malformed responses)
 * - HTTP error handling (status codes, network errors)
 *
 * Test coverage:
 * - TC-09: Thinking mode threshold (model selection)
 * - TC-14: Missing API key (ConfigMissingError)
 * - TC-15: Malformed compression response (Zod validation)
 * - Prompt construction tests
 * - HTTP error handling tests
 */

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe("OpenRouterClient constructor", () => {
  it("TC-14: throws ConfigMissingError when API key missing", () => {
    expect(() => {
      new OpenRouterClient({ apiKey: "", model: "test", modelLarge: "test" });
    }).toThrow(ConfigMissingError);

    expect(() => {
      new OpenRouterClient({
        apiKey: undefined as unknown as string,
        model: "test",
        modelLarge: "test",
      });
    }).toThrow(ConfigMissingError);
  });

  it("creates client successfully with valid API key", () => {
    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });
    expect(client).toBeInstanceOf(OpenRouterClient);
  });
});

describe("OpenRouterClient.compress - model selection", () => {
  it("TC-09: uses large model when useLargeModel is true", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await client.compress("text", "compress", true);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.model).toBe("anthropic/claude-opus-4.5");
  });

  it("uses regular model when useLargeModel is false", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await client.compress("text", "compress", false);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.model).toBe("google/gemini-2.5-flash");
  });
});

describe("OpenRouterClient.compress - prompt construction", () => {
  it("includes 35% target for compress level", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await client.compress("test text", "compress", false);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const prompt = callBody.messages[0].content as string;

    expect(prompt).toContain("35%");
    expect(prompt).toContain("test text");
  });

  it("includes 10% target for heavy-compress level", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await client.compress("test text", "heavy-compress", false);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const prompt = callBody.messages[0].content as string;

    expect(prompt).toContain("10%");
  });

  it("includes input text in prompt", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    const inputText = "This is the specific text to compress";
    await client.compress(inputText, "compress", false);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const prompt = callBody.messages[0].content as string;

    expect(prompt).toContain(inputText);
  });

  it("sends correct headers including Authorization", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "my-secret-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await client.compress("text", "compress", false);

    const callHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(callHeaders["Authorization"]).toBe("Bearer my-secret-key");
    expect(callHeaders["Content-Type"]).toBe("application/json");
  });

  it("calls correct OpenRouter API endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await client.compress("text", "compress", false);

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
  });
});

describe("OpenRouterClient.compress - response parsing", () => {
  it("TC-15: throws on malformed JSON structure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"wrong": "format"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow();
  });

  it("throws on non-JSON response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not json at all" } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow();
  });

  it("handles JSON in markdown code blocks", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '```json\n{"text": "compressed"}\n```' } },
        ],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    const result = await client.compress("test", "compress", false);
    expect(result).toBe("compressed");
  });

  it("handles JSON in markdown code blocks without json specifier", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```\n{"text": "compressed"}\n```' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    const result = await client.compress("test", "compress", false);
    expect(result).toBe("compressed");
  });

  it("handles raw JSON without markdown", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"text": "compressed"}' } }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    const result = await client.compress("test", "compress", false);
    expect(result).toBe("compressed");
  });

  it("handles JSON with preamble text", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Here is the compressed result:\n{"text": "compressed"}',
            },
          },
        ],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    const result = await client.compress("test", "compress", false);
    expect(result).toBe("compressed");
  });

  it("throws when content is missing from response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: {} }],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow(
      "Invalid response format from OpenRouter"
    );
  });

  it("throws when choices array is empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [] }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow(
      "Invalid response format from OpenRouter"
    );
  });

  it("returns the text field from valid response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"text": "This is the compressed output text"}',
            },
          },
        ],
      }),
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    const result = await client.compress("test", "compress", false);
    expect(result).toBe("This is the compressed output text");
  });
});

describe("OpenRouterClient.compress - HTTP errors", () => {
  it("throws on HTTP error responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server error",
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow(
      "OpenRouter API error 500"
    );
  });

  it("throws on 401 unauthorized", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid API key",
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "invalid-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow(
      "OpenRouter API error 401"
    );
  });

  it("throws on 429 rate limited", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "Rate limited",
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow(
      "OpenRouter API error 429"
    );
  });

  it("throws on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow(
      "Network error"
    );
  });

  it("includes error body in error message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "Detailed error message from API",
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow(
      /Detailed error message/
    );
  });

  it("handles error when response.text() fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => {
        throw new Error("Failed to read response");
      },
    });
    global.fetch = mockFetch;

    const client = new OpenRouterClient({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      modelLarge: "anthropic/claude-opus-4.5",
    });

    await expect(client.compress("test", "compress", false)).rejects.toThrow(
      "OpenRouter API error 500"
    );
  });
});
