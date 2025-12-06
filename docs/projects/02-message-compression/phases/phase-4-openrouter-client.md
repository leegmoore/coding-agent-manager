# Phase 4: OpenRouter Client (TDD)

## Goal

Implement OpenRouter API client with prompt building and Zod validation.

## Context

**Project:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/`

Phase 3 implemented batch processing. Now implement the OpenRouter client that makes actual API calls.

## Test File

Create `test/openrouter-client.test.ts`

## Test Setup

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterClient } from "../src/services/openrouter-client.js";
import { ConfigMissingError } from "../src/errors.js";

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});
```

---

## TDD Red: Write Tests

### TC-09: Thinking Mode Threshold

**Setup:**
- Mock fetch returns valid JSON response
- Test with `useThinking: true` and `useThinking: false`

**Input (thinking mode):**
```typescript
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: '{"text": "compressed"}' } }]
  })
});
global.fetch = mockFetch;

const client = new OpenRouterClient({
  apiKey: "test-key",
  model: "google/gemini-2.5-flash",
  modelThinking: "google/gemini-2.5-flash:thinking"
});

await client.compress("long text...", "compress", true);
```

**Expected:**
- API called with model `"google/gemini-2.5-flash:thinking"`

**Assertions:**
```typescript
it("TC-09: uses thinking model for messages over 1000 tokens", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"text": "compressed"}' } }] })
  });
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  await client.compress("text", "compress", true);

  const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(callBody.model).toBe("google/gemini-2.5-flash:thinking");
});

it("uses regular model for messages under 1000 tokens", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"text": "compressed"}' } }] })
  });
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  await client.compress("text", "compress", false);

  const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
  expect(callBody.model).toBe("google/gemini-2.5-flash");
});
```

### TC-14: API Key Missing

**Input:**
```typescript
new OpenRouterClient({
  apiKey: "",
  model: "google/gemini-2.5-flash",
  modelThinking: "google/gemini-2.5-flash:thinking"
});
```

**Expected:**
- Throws `ConfigMissingError` with message about OPENROUTER_API_KEY

**Assertions:**
```typescript
it("TC-14: throws ConfigMissingError when API key missing", () => {
  expect(() => {
    new OpenRouterClient({ apiKey: "", model: "test", modelThinking: "test" });
  }).toThrow(ConfigMissingError);

  expect(() => {
    new OpenRouterClient({ apiKey: undefined as any, model: "test", modelThinking: "test" });
  }).toThrow(ConfigMissingError);
});
```

### TC-15: Malformed Compression Response

**Test Case 1: Invalid JSON structure**

**Input:**
```typescript
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: '{"wrong": "format"}' } }]
  })
});
```

**Expected:**
- Throws error (Zod validation fails)
- Error message indicates validation failure

**Assertions:**
```typescript
it("TC-15: throws on malformed JSON structure", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"wrong": "format"}' } }] })
  });
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  await expect(client.compress("test", "compress", false)).rejects.toThrow();
});
```

**Test Case 2: Not valid JSON**

**Input:**
```typescript
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: "not json at all" } }]
  })
});
```

**Expected:**
- Throws JSON parse error

**Assertions:**
```typescript
it("throws on non-JSON response", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: "not json" } }] })
  });
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  await expect(client.compress("test", "compress", false)).rejects.toThrow();
});
```

**Test Case 3: JSON in markdown code blocks**

**Input:**
```typescript
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: '```json\n{"text": "compressed"}\n```' } }]
  })
});
```

**Expected:**
- Successfully extracts JSON from code block
- Returns `"compressed"`

**Assertions:**
```typescript
it("handles JSON in markdown code blocks", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '```json\n{"text": "compressed"}\n```' } }] })
  });
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  const result = await client.compress("test", "compress", false);
  expect(result).toBe("compressed");
});
```

### Prompt Construction Tests

**Test Case 1: Compress level (35%)**

**Expected:**
- Prompt contains "35%"
- Prompt contains the input text

**Assertions:**
```typescript
it("includes 35% target for compress level", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"text": "compressed"}' } }] })
  });
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  await client.compress("test text", "compress", false);

  const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
  const prompt = callBody.messages[0].content;

  expect(prompt).toContain("35%");
  expect(prompt).toContain("test text");
});
```

**Test Case 2: Heavy-compress level (10%)**

**Expected:**
- Prompt contains "10%"

**Assertions:**
```typescript
it("includes 10% target for heavy-compress level", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"text": "compressed"}' } }] })
  });
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  await client.compress("test text", "heavy-compress", false);

  const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
  const prompt = callBody.messages[0].content;

  expect(prompt).toContain("10%");
});
```

### HTTP Error Handling Tests

**Test Case 1: Non-OK response (500)**

**Input:**
```typescript
const mockFetch = vi.fn().mockResolvedValue({
  ok: false,
  status: 500,
  statusText: "Internal Server Error",
  text: async () => "Server error details"
});
```

**Expected:**
- Throws error with status and message

**Assertions:**
```typescript
it("throws on HTTP error responses", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    statusText: "Internal Server Error",
    text: async () => "Server error"
  });
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  await expect(client.compress("test", "compress", false))
    .rejects.toThrow("OpenRouter API error 500");
});
```

**Test Case 2: Network error**

**Input:**
```typescript
const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
```

**Expected:**
- Throws network error

**Assertions:**
```typescript
it("throws on network error", async () => {
  const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
  global.fetch = mockFetch;

  const client = new OpenRouterClient({
    apiKey: "test-key",
    model: "google/gemini-2.5-flash",
    modelThinking: "google/gemini-2.5-flash:thinking"
  });

  await expect(client.compress("test", "compress", false))
    .rejects.toThrow("Network error");
});
```

---

## TDD Green: Implement Class

### Model Selection

The client uses two pre-configured models:
- `model`: Normal compression (messages ≤ 1000 tokens)
- `modelThinking`: Thinking mode (messages > 1000 tokens)

Configuration:
```env
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_MODEL_THINKING=google/gemini-2.5-flash:thinking
```

### `OpenRouterClient` Implementation

**File:** `src/services/openrouter-client.ts`

**Key methods:**

#### `constructor(config: OpenRouterConfig)`

```typescript
constructor(config: OpenRouterConfig) {
  if (!config.apiKey) {
    throw new ConfigMissingError("OPENROUTER_API_KEY");
  }
  this.apiKey = config.apiKey;
  this.model = config.model;
  this.modelThinking = config.modelThinking;
}
```

#### `compress(text, level, useThinking): Promise<string>`

```typescript
async compress(
  text: string,
  level: CompressionLevel,
  useThinking: boolean
): Promise<string> {
  const targetPercent = level === "compress" ? 35 : 10;
  const prompt = this.buildPrompt(text, targetPercent);
  const model = useThinking ? this.modelThinking : this.model;

  const response = await this.callAPI(prompt, model);
  return this.validateResponse(response);
}
```

#### `buildPrompt(text, targetPercent): string`

**Prompt template** (adapted from team-bruce):

```typescript
private buildPrompt(text: string, targetPercent: number): string {
  return `You are TextCompressor. Rewrite the text below to approximately ${targetPercent}% of its original length while preserving intent and factual meaning.

Token estimation: tokens ≈ ceil(characters / 4)

Rules:
- Preserve key entities, claims, and relationships
- Remove redundancy, filler, and hedging
- Keep fluent English
- If unsure about length, err shorter
- Do not include explanations or commentary outside the JSON
- Do not reference "I", "we", "user", "assistant", or conversation roles

Return exactly one JSON object: {"text": "your compressed text"}

Input text:
<<<CONTENT
${text}
CONTENT`;
}
```

#### `callAPI(prompt, model): Promise<unknown>`

**HTTP error handling:**

```typescript
private async callAPI(prompt: string, model: string): Promise<unknown> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "",
      "X-Title": process.env.OPENROUTER_SITE_NAME || "coding-agent-manager"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Invalid response format from OpenRouter");
  }

  return content;
}
```

**Error mapping:**
- 401 → `"OpenRouter API error 401: Invalid API key"`
- 429 → `"OpenRouter API error 429: Rate limited"` (triggers retry)
- 500 → `"OpenRouter API error 500: Internal error"` (triggers retry)

#### `validateResponse(response): string`

**JSON extraction algorithm:**

```typescript
private extractJSON(raw: string): string {
  // 1. Try markdown code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 2. Try to find raw JSON object
  const jsonMatch = raw.match(/\{[\s\S]*"text"[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // 3. Return as-is (will fail parsing, triggering retry)
  return raw;
}

private validateResponse(raw: string): string {
  // Extract JSON from possible markdown/preamble
  const jsonStr = this.extractJSON(raw);

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    throw new Error(`Failed to parse compression response as JSON: ${jsonStr.substring(0, 100)}`);
  }

  // Validate with Zod
  const validated = CompressionResponseSchema.parse(parsed);

  return validated.text;
}
```

**Handles:**
- Clean JSON: `{"text": "compressed"}`
- Markdown: ` ```json\n{"text": "compressed"}\n``` `
- Preamble: `Here is the result:\n{"text": "compressed"}`

---

## Verification

- [ ] All TC tests pass (TC-09, TC-14, TC-15)
- [ ] Prompt construction tests pass
- [ ] HTTP error handling tests pass
- [ ] Markdown code block extraction works
- [ ] Zod validation rejects invalid responses
- [ ] Existing tests still pass
- [ ] TypeScript compiles

## Notes

- Mock `global.fetch` for all API tests
- Restore original fetch in `afterEach`
- Thinking mode uses separate configured model
- JSON extraction uses regex to handle markdown/preamble
- All errors thrown will trigger retry in batch processor
