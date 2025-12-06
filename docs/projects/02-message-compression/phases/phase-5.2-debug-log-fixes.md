# Phase 5.2: Debug Log Fixes and Large Message Model

## Goal

1. Simplify debug log for messages not in compression bands (simple list vs full sections)
2. Switch large messages (>1000 tokens) to Opus 4.5 instead of Flash thinking

## Context

**Project:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/`

Phase 5.1 complete. Two improvements needed based on manual testing.

## Changes

### 1. Debug Log - Simplify Non-Band Messages

**Problem:** Messages not in any compression band still get full before/after sections, creating noise in the debug log.

**Solution:** Show these as a simple numbered list instead.

**File:** `src/services/compression-debug-logger.ts`

**Current behavior:**
- Every message gets a full ## Message N section with before/after

**New behavior:**
- Messages in compression bands: full before/after sections (as current)
- Messages NOT in any band: simple numbered list after the compressed messages

**Updated format:**
```markdown
[... all compressed/attempted messages with full sections ...]

## Messages Not in Compression Bands

1. Message 10 - AssistantMessage `abc123` (250 tokens) - Band: none
2. Message 15 - UserMessage `def456` (180 tokens) - Band: none
3. Message 20 - AssistantMessage `ghi789` (320 tokens) - Band: none

## Summary
...
```

### 2. Large Message Model Switch

**Problem:** Flash 2.5 thinking can't handle very large messages (40-50k tokens from user pastes).

**Solution:** Use Opus 4.5 with low thinking for messages >1000 tokens.

**Files to update:**
- `src/services/compression-batch.ts` - Update model selection in `compressWithTimeout()`
- `.env.example` - Add `OPENROUTER_MODEL_LARGE`

**Current logic:**
```typescript
const useThinking = task.estimatedTokens > 1000;
// Uses google/gemini-2.5-flash:thinking
```

**New logic:**
```typescript
const useLargeModel = task.estimatedTokens > 1000;
// Uses anthropic/claude-opus-4.5 (with low thinking)
```

**Environment variables:**
```env
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_MODEL_LARGE=anthropic/claude-opus-4.5
```

**OpenRouterClient updates:**

```typescript
export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  modelLarge: string;  // NEW - for messages >1000 tokens
}

// Update compress() to accept model selection
async compress(
  text: string,
  level: CompressionLevel,
  useLargeModel: boolean  // Renamed from useThinking
): Promise<string> {
  const targetPercent = level === "compress" ? 35 : 10;
  const prompt = this.buildPrompt(text, targetPercent);
  const model = useLargeModel ? this.modelLarge : this.model;

  const response = await this.callAPI(prompt, model);
  return this.validateResponse(response);
}
```

**compressWithTimeout() update:**

```typescript
async function compressWithTimeout(
  task: CompressionTask,
  client: OpenRouterClient
): Promise<CompressionTask> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Compression timeout")), task.timeoutMs);
  });

  try {
    const useLargeModel = task.estimatedTokens > 1000;  // Renamed from useThinking
    const result = await Promise.race([
      client.compress(task.originalContent, task.level, useLargeModel),
      timeoutPromise
    ]);

    return { ...task, status: "success", result };
  } catch (error) {
    return {
      ...task,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

**compressMessages() update:**

```typescript
const client = new OpenRouterClient({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
  modelLarge: process.env.OPENROUTER_MODEL_LARGE || "anthropic/claude-opus-4.5"
});
```

## Implementation Steps

1. Update `.env.example` with `OPENROUTER_MODEL_LARGE`
2. Update `OpenRouterConfig` interface to include `modelLarge`
3. Rename `useThinking` parameter to `useLargeModel` throughout
4. Update model selection to use `modelLarge` for messages >1000 tokens
5. Update debug logger to show non-band messages as simple list
6. Update tests to use new parameter name

## Verification

- [ ] Large messages (>1000 tokens) use Opus 4.5
- [ ] Small messages use Flash 2.5
- [ ] Debug log shows non-band messages as simple list
- [ ] All 86 tests still pass
- [ ] TypeScript compiles
- [ ] Manual test with large message works

## Notes

- Opus 4.5 via OpenRouter has higher latency but can handle large inputs
- Low thinking mode is automatic (no `:thinking` suffix needed)
- Debug log now has three sections: compressed messages, non-band messages list, summary
