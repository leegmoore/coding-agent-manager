# Claude CLI Provider - Technical Design

## 1. Overview

Refactor compression to use a provider abstraction, then add Claude CLI as an alternative provider to OpenRouter.

### Current State

```
compression.ts
└── OpenRouterClient (hardcoded)
    └── fetch() to OpenRouter API
```

### Target State

```
compression.ts
└── getProvider()
    ├── OpenRouterProvider
    │   └── fetch() to OpenRouter API
    └── ClaudeCliProvider
        └── spawn() claude CLI subprocess
```

---

## 2. Provider Interface

### `src/providers/types.ts`

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

**Note:** This interface matches the existing `OpenRouterClient.compress()` signature exactly. The `compression-batch.ts` file already accepts `{ compress: (text, level, useLargeModel) => Promise<string> }` so providers can be used directly.

---

## 3. Claude CLI Provider

### `src/providers/claude-cli-provider.ts`

```typescript
import { spawn } from "child_process";
import type { LlmProvider } from "./types.js";
import type { CompressionLevel } from "../types.js";

/**
 * Claude CLI Provider for compression tasks.
 *
 * Uses `claude -p` (pipe/one-shot mode) with --model flag.
 * Leverages existing OAuth authentication from `claude` login.
 */
export class ClaudeCliProvider implements LlmProvider {
  /**
   * Build compression prompt using team-bruce template.
   */
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

  /**
   * Compress text using Claude CLI.
   *
   * @param text - The text to compress
   * @param level - Compression level for target percentage
   * @param useLargeModel - If true, use opus; otherwise use haiku
   * @returns The compressed text
   */
  async compress(
    text: string,
    level: CompressionLevel,
    useLargeModel: boolean
  ): Promise<string> {
    const model = useLargeModel ? "opus" : "haiku";
    const prompt = this.buildPrompt(text, level);

    return new Promise((resolve, reject) => {
      const child = spawn("claude", [
        "-p",
        "--model", model,
        "--output-format", "json",
      ], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => { stdout += data; });
      child.stderr.on("data", (data) => { stderr += data; });

      child.stdin.write(prompt);
      child.stdin.end();

      child.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error("Claude CLI not found. Is 'claude' installed and in PATH?"));
        } else {
          reject(err);
        }
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          // CLI JSON output has { result: "..." } structure
          const text = result.result || result.text || stdout;
          resolve(typeof text === "string" ? text : JSON.stringify(text));
        } catch {
          reject(new Error(`Failed to parse Claude CLI output: ${stdout.substring(0, 200)}`));
        }
      });
    });
  }
}
```

---

## 4. OpenRouter Provider (Refactored)

### `src/providers/openrouter-provider.ts`

The OpenRouter provider is essentially a thin wrapper around the existing `OpenRouterClient`. The main change is that it implements the `LlmProvider` interface.

```typescript
import { z } from "zod";
import type { LlmProvider } from "./types.js";
import type { CompressionLevel } from "../types.js";
import { ConfigMissingError } from "../errors.js";

const CompressionResponseSchema = z.object({
  text: z.string(),
});

/**
 * OpenRouter Provider for compression tasks.
 *
 * This is a refactored version of OpenRouterClient that implements
 * the LlmProvider interface for use with the provider abstraction.
 */
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

  /**
   * Build compression prompt using team-bruce template.
   */
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

  /**
   * Compress text using OpenRouter API.
   *
   * @param text - The text to compress
   * @param level - Compression level for target percentage
   * @param useLargeModel - If true, use large model; otherwise use standard model
   * @returns The compressed text
   */
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

  /**
   * Extract JSON from raw response and validate with Zod.
   */
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

**Note:** The OpenRouterProvider is essentially the same as the existing `OpenRouterClient` but implementing the `LlmProvider` interface. In Phase 1, we can either:
1. Create a new `OpenRouterProvider` class (cleaner separation)
2. Update `OpenRouterClient` to implement `LlmProvider` (less code duplication)

Recommendation: Create new `OpenRouterProvider` for cleaner separation, then deprecate `OpenRouterClient`.

---

## 5. Provider Factory

### `src/providers/index.ts`

```typescript
import { LlmProvider, ProviderType } from "./types.js";
import { ClaudeCliProvider } from "./claude-cli-provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { ConfigMissingError } from "../errors.js";

let cachedProvider: LlmProvider | null = null;
let cachedProviderType: ProviderType | null = null;

export function getProvider(): LlmProvider {
  const providerType = (process.env.LLM_PROVIDER || "openrouter") as ProviderType;

  if (cachedProvider && cachedProviderType === providerType) {
    return cachedProvider;
  }

  switch (providerType) {
    case "openrouter":
      cachedProvider = new OpenRouterProvider();
      break;
    case "cc-cli":
      cachedProvider = new ClaudeCliProvider();
      break;
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

## 6. Model Selection Summary

| Provider | Tokens | Model |
|----------|--------|-------|
| openrouter | ≤1000 | google/gemini-2.5-flash |
| openrouter | >1000 | anthropic/claude-opus-4.5 |
| cc-cli | ≤1000 | haiku (alias) |
| cc-cli | >1000 | opus (alias) |

---

## 7. Implementation Phases

### Phase 1: Provider Abstraction
- Create `src/providers/` directory
- Define `LlmProvider` interface
- Extract `OpenRouterProvider` from existing code
- Create `getProvider()` factory
- Update `compression.ts` to use provider
- All existing tests should pass

### Phase 2: Claude CLI Provider
- Implement `ClaudeCliProvider` using `child_process.spawn()`
- Add model selection (haiku vs opus based on tokens)
- Handle CLI errors (ENOENT, exit codes, stderr)
- Add provider tests
- Test with `LLM_PROVIDER=cc-cli`

---

## 8. Error Handling

| Error | Handling |
|-------|----------|
| OpenRouter: Missing API key | Throw `ConfigMissingError` at construction |
| Claude CLI: Not in PATH | Catch ENOENT, throw descriptive error |
| Claude CLI: Non-zero exit | Include stderr in error message |
| Invalid provider | Throw `ConfigMissingError` from factory |
| JSON parse failure | Throw with partial output for debugging |

---

## 9. Success Criteria

- [ ] Provider abstraction in place
- [ ] OpenRouter provider extracted and working
- [ ] Claude CLI provider implemented
- [ ] Model selection works (haiku/opus based on tokens)
- [ ] All existing tests pass
- [ ] New provider tests pass
- [ ] Can switch providers via env var
