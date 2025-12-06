# Phase 1: Provider Abstraction

## Goal

Create a provider abstraction layer and refactor existing OpenRouter code to use it. All existing functionality preserved.

## Scope

- Create `src/providers/` directory structure
- Define `LlmProvider` interface
- Extract `OpenRouterProvider` from existing `openrouter-client.ts`
- Create `getProvider()` factory with env var selection
- Update `compression.ts` to use provider abstraction
- All existing tests must pass (no regressions)

---

## Implementation

### Step 1: Create Provider Types

**File:** `src/providers/types.ts`

```typescript
import type { CompressionLevel } from "../types.js";

/**
 * LLM Provider interface for compression tasks.
 *
 * This interface matches the existing OpenRouterClient.compress() signature
 * so providers can be passed directly to processBatches() in compression-batch.ts.
 */
export interface LlmProvider {
  /**
   * Compress text using the provider's LLM.
   *
   * @param text - The text to compress
   * @param level - Compression level: "compress" (35%) or "heavy-compress" (10%)
   * @param useLargeModel - Whether to use the large model for messages >1000 tokens
   * @returns The compressed text
   */
  compress(
    text: string,
    level: CompressionLevel,
    useLargeModel: boolean
  ): Promise<string>;
}

export type ProviderType = "openrouter" | "cc-cli";
```

**Note:** This interface matches the existing `OpenRouterClient.compress()` signature exactly. The `compression-batch.ts` file already accepts `{ compress: (text, level, useLargeModel) => Promise<string> }` so providers can be used directly with `processBatches()`.

---

### Step 2: Create OpenRouter Provider (TDD)

**File:** `test/providers/openrouter-provider.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterProvider } from "../../src/providers/openrouter-provider.js";

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

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
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

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
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

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
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

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
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
      await expect(provider.compress("test", "compress", false)).rejects.toThrow("OpenRouter API error 401");
    });
  });
});
```

**File:** `src/providers/openrouter-provider.ts`

```typescript
import { z } from "zod";
import type { LlmProvider } from "./types.js";
import type { CompressionLevel } from "../types.js";
import { ConfigMissingError } from "../errors.js";

const CompressionResponseSchema = z.object({
  text: z.string(),
});

export class OpenRouterProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly modelLarge: string;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new ConfigMissingError("OPENROUTER_API_KEY");
    }
    this.apiKey = apiKey;
    this.model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
    this.modelLarge = process.env.OPENROUTER_MODEL_LARGE || "anthropic/claude-opus-4.5";
  }

  private buildPrompt(text: string, level: CompressionLevel): string {
    const targetPercent = level === "compress" ? 35 : 10;
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

  async compress(
    text: string,
    level: CompressionLevel,
    useLargeModel: boolean
  ): Promise<string> {
    const model = useLargeModel ? this.modelLarge : this.model;
    const prompt = this.buildPrompt(text, level);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "",
        "X-Title": process.env.OPENROUTER_SITE_NAME || "coding-agent-manager",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "");
      throw new Error(`OpenRouter API error ${response.status}: ${error}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("Invalid response format from OpenRouter");
    }

    return this.validateResponse(content);
  }

  private validateResponse(raw: string): string {
    // Try markdown code block first
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return CompressionResponseSchema.parse(parsed).text;
    }

    // Try raw JSON object
    const jsonMatch = raw.match(/\{[\s\S]*"text"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return CompressionResponseSchema.parse(parsed).text;
    }

    // Try parsing as-is
    const parsed = JSON.parse(raw);
    return CompressionResponseSchema.parse(parsed).text;
  }
}
```

---

### Step 3: Create Provider Factory (TDD)

**File:** `test/providers/provider-factory.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getProvider, resetProvider } from "../../src/providers/index.js";
import { OpenRouterProvider } from "../../src/providers/openrouter-provider.js";

describe("getProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetProvider();
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: "test-openrouter-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetProvider();
  });

  it("returns OpenRouterProvider by default", () => {
    delete process.env.LLM_PROVIDER;
    const provider = getProvider();
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it("returns OpenRouterProvider when LLM_PROVIDER=openrouter", () => {
    process.env.LLM_PROVIDER = "openrouter";
    const provider = getProvider();
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it("throws for invalid provider", () => {
    process.env.LLM_PROVIDER = "invalid";
    expect(() => getProvider()).toThrow("Invalid LLM_PROVIDER");
  });

  it("caches provider instance", () => {
    const provider1 = getProvider();
    const provider2 = getProvider();
    expect(provider1).toBe(provider2);
  });

  it("creates new instance after reset", () => {
    const provider1 = getProvider();
    resetProvider();
    const provider2 = getProvider();
    expect(provider1).not.toBe(provider2);
  });
});
```

**File:** `src/providers/index.ts`

```typescript
import { LlmProvider, ProviderType } from "./types.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { ConfigMissingError } from "../errors.js";

let cachedProvider: LlmProvider | null = null;
let cachedProviderType: ProviderType | null = null;

export function getProvider(): LlmProvider {
  const providerType = (process.env.LLM_PROVIDER || "openrouter") as ProviderType;

  // Return cached provider if type matches
  if (cachedProvider && cachedProviderType === providerType) {
    return cachedProvider;
  }

  switch (providerType) {
    case "openrouter":
      cachedProvider = new OpenRouterProvider();
      break;
    case "cc-cli":
      // Will be implemented in Phase 2
      throw new ConfigMissingError("cc-cli provider not yet implemented");
    default:
      throw new ConfigMissingError(`Invalid LLM_PROVIDER: ${providerType}`);
  }

  cachedProviderType = providerType;
  return cachedProvider;
}

export function resetProvider(): void {
  cachedProvider = null;
  cachedProviderType = null;
}

export { LlmProvider, ProviderType } from "./types.js";
```

---

### Step 4: Update Compression to Use Provider

**Modify:** `src/services/compression.ts`

Replace direct `OpenRouterClient` instantiation with provider abstraction:

```typescript
// Before: Direct OpenRouterClient instantiation
import { OpenRouterClient } from "./openrouter-client.js";

// In compressMessages():
const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
  modelLarge: process.env.OPENROUTER_MODEL_LARGE || "anthropic/claude-opus-4.5",
});

const completedTasks = await processBatches(pendingTasks, client, batchConfig, config);
```

```typescript
// After: Use provider abstraction
import { getProvider } from "../providers/index.js";

// In compressMessages():
const provider = getProvider();

const completedTasks = await processBatches(pendingTasks, provider, batchConfig, config);
```

**Note:** The `processBatches()` function already accepts `{ compress: (text, level, useLargeModel) => Promise<string> }` as its second parameter, so the `LlmProvider` interface works directly. No changes needed to `compression-batch.ts`.

---

### Step 5: Update Config

**Modify:** `.env.example`

```bash
# LLM Provider Selection
# Options: openrouter (default), cc-cli (Phase 2)
LLM_PROVIDER=openrouter

# OpenRouter (required if LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_MODEL_LARGE=anthropic/claude-opus-4.5

# Claude CLI (no additional env vars needed - uses OAuth from `claude` login)
# Requires: claude CLI installed, user logged in
```

---

## Verification Checklist

- [ ] `src/providers/types.ts` created with `LlmProvider` interface
- [ ] `src/providers/openrouter-provider.ts` created
- [ ] `src/providers/index.ts` created with `getProvider()` factory
- [ ] `test/providers/openrouter-provider.test.ts` - all tests pass
- [ ] `test/providers/provider-factory.test.ts` - all tests pass
- [ ] `compression.ts` updated to use provider
- [ ] All existing tests pass (no regressions)
- [ ] `.env.example` updated

## Test Commands

```bash
# Run new provider tests
npm test -- test/providers/

# Run all tests to verify no regressions
npm test
```

## Next Phase

Phase 2: Claude Provider - Implement `ClaudeProvider` using Anthropic SDK.
