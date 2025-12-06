# Phase 2: Claude CLI Provider

## Goal

Implement Claude CLI provider using `child_process.spawn()` with model selection based on token count.

## Prerequisites

- Phase 1 complete (provider abstraction in place)
- Claude Code CLI installed (`claude` in PATH)
- User logged in via `claude` (OAuth)

## Scope

- Implement `ClaudeCliProvider` using subprocess
- Model selection: haiku (≤1000 tokens), opus (>1000 tokens)
- Handle CLI errors (ENOENT, exit codes, stderr)
- Add provider tests
- Update factory to support `cc-cli`

---

## Implementation

### Step 1: Create Claude CLI Provider (TDD)

**File:** `test/providers/claude-cli-provider.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeCliProvider } from "../../src/providers/claude-cli-provider.js";
import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

function createMockProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdin = { write: vi.fn(), end: vi.fn() } as any;
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  return proc;
}

describe("ClaudeCliProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("compress", () => {
    it("spawns claude with haiku when useLargeModel is false", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test text", "compress", false);

      mockProc.stdout.emit("data", '{"result": "compressed text"}');
      mockProc.emit("close", 0);

      await promise;

      expect(spawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "--model", "haiku", "--output-format", "json"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] })
      );
    });

    it("spawns claude with opus when useLargeModel is true", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test text", "compress", true);

      mockProc.stdout.emit("data", '{"result": "compressed text"}');
      mockProc.emit("close", 0);

      await promise;

      expect(spawn).toHaveBeenCalledWith(
        "claude",
        ["-p", "--model", "opus", "--output-format", "json"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] })
      );
    });

    it("builds prompt with correct target percent for compress level", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test text", "compress", false);

      mockProc.stdout.emit("data", '{"result": "ok"}');
      mockProc.emit("close", 0);

      await promise;

      const writtenPrompt = (mockProc.stdin.write as any).mock.calls[0][0];
      expect(writtenPrompt).toContain("35%");
    });

    it("builds prompt with correct target percent for heavy-compress level", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test text", "heavy-compress", false);

      mockProc.stdout.emit("data", '{"result": "ok"}');
      mockProc.emit("close", 0);

      await promise;

      const writtenPrompt = (mockProc.stdin.write as any).mock.calls[0][0];
      expect(writtenPrompt).toContain("10%");
    });

    it("writes prompt to stdin and closes", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("my text", "compress", false);

      mockProc.stdout.emit("data", '{"result": "ok"}');
      mockProc.emit("close", 0);

      await promise;

      expect(mockProc.stdin.write).toHaveBeenCalled();
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });

    it("returns parsed result from JSON output", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      mockProc.stdout.emit("data", '{"result": "compressed output"}');
      mockProc.emit("close", 0);

      const result = await promise;
      expect(result).toBe("compressed output");
    });

    it("handles chunked stdout", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      // Send in chunks
      mockProc.stdout.emit("data", '{"result":');
      mockProc.stdout.emit("data", ' "chunked"}');
      mockProc.emit("close", 0);

      const result = await promise;
      expect(result).toBe("chunked");
    });

    it("throws descriptive error when claude not found", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      const error = new Error("spawn ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockProc.emit("error", error);

      await expect(promise).rejects.toThrow("Claude CLI not found");
    });

    it("throws error on non-zero exit code", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      mockProc.stderr.emit("data", "Authentication required");
      mockProc.emit("close", 1);

      await expect(promise).rejects.toThrow("Claude CLI exited with code 1");
    });

    it("throws error on invalid JSON output", async () => {
      const mockProc = createMockProcess();
      (spawn as any).mockReturnValue(mockProc);

      const provider = new ClaudeCliProvider();
      const promise = provider.compress("test", "compress", false);

      mockProc.stdout.emit("data", "not valid json");
      mockProc.emit("close", 0);

      await expect(promise).rejects.toThrow("Failed to parse Claude CLI output");
    });
  });
});
```

**File:** `src/providers/claude-cli-provider.ts`

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

### Step 2: Update Provider Factory

**Modify:** `src/providers/index.ts`

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

### Step 3: Update Factory Tests

**Add to:** `test/providers/provider-factory.test.ts`

```typescript
import { ClaudeCliProvider } from "../../src/providers/claude-cli-provider.js";

// Add to existing tests:

it("returns ClaudeCliProvider when LLM_PROVIDER=cc-cli", () => {
  process.env.LLM_PROVIDER = "cc-cli";
  const provider = getProvider();
  expect(provider).toBeInstanceOf(ClaudeCliProvider);
});
```

---

### Step 4: Update Environment Files

**Modify:** `.env.example`

```bash
# LLM Provider Selection
# Options: openrouter (default), cc-cli
LLM_PROVIDER=openrouter

# OpenRouter (required if LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_MODEL_LARGE=anthropic/claude-opus-4.5

# Claude CLI (no env vars needed - uses OAuth from `claude` login)
# Requires: claude CLI installed, user logged in
```

---

## Verification Checklist

- [ ] `src/providers/claude-cli-provider.ts` created
- [ ] `test/providers/claude-cli-provider.test.ts` - all tests pass
- [ ] Provider factory updated with `cc-cli` case
- [ ] Factory tests updated for Claude CLI provider
- [ ] All existing tests pass
- [ ] `.env.example` updated

## Test Commands

```bash
# Run Claude CLI provider tests
npm test -- test/providers/claude-cli-provider.test.ts

# Run all provider tests
npm test -- test/providers/

# Run all tests
npm test

# Manual test with Claude CLI provider
LLM_PROVIDER=cc-cli npm run dev
```

## Manual Testing

1. Ensure `claude` CLI is installed and in PATH
2. Log in via `claude` if not already authenticated
3. Set `LLM_PROVIDER=cc-cli` in environment
4. Start server: `npm run dev`
5. Use UI to clone with compression
6. Verify compression works with Claude models

---

## Project Complete

After Phase 2, the provider system supports:

```
LLM_PROVIDER=openrouter
├── ≤1000 tokens → google/gemini-2.5-flash
└── >1000 tokens → anthropic/claude-opus-4.5

LLM_PROVIDER=cc-cli
├── ≤1000 tokens → haiku (Claude Haiku 4.5)
└── >1000 tokens → opus (Claude Opus 4.5)
```

Switch providers via environment variable - no code changes needed.
