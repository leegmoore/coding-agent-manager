# Claude Provider for Message Compression

## Overview

Add Claude (via Claude Code CLI) as an alternative LLM provider for message compression, alongside the existing OpenRouter provider. Provider selection via environment variable allows switching between providers without code changes.

The CLI approach uses `claude -p` (pipe/one-shot mode) with `--model` flag, leveraging existing OAuth authentication.

---

## User Story

**As an** AI-enabled software engineer,
**I want** to use Claude models for message compression,
**So that** I can:
- Use Claude at work where OpenRouter isn't available
- Leverage Bedrock authentication when needed
- Use Haiku 4.5 for standard compression and Opus 4.5 for large messages

---

## Scope

### In Scope

- Create Claude provider using Claude Code CLI (`claude -p`)
- Provider selection via `LLM_PROVIDER` environment variable
- Two provider slugs: `openrouter` (default), `cc-cli`
- Model selection based on token count:
  - ≤1000 tokens: `--model haiku`
  - >1000 tokens: `--model opus`
- JSON output format via `--output-format json`
- Uses existing OAuth authentication from `claude` login
- Refactor existing compression to use provider abstraction

### Out of Scope

- Streaming responses (not needed for compression)
- Anthropic SDK direct integration
- UI changes (provider is backend-only)

---

## Provider Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    compression.ts                            │
│                                                             │
│  compressMessages() ──► processBatches(tasks, provider)     │
│                             │                               │
│                             ▼                               │
│                    compressWithTimeout(task, provider)      │
│                             │                               │
│                             ▼                               │
│                    provider.compress(text, level, useLarge) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────────────────┐
              │           Provider Interface                   │
              │                                               │
              │  compress(text, level, useLargeModel): string │
              └───────────────────────────────────────────────┘
                     │              │
                     ▼              ▼
            ┌────────────┐  ┌─────────────┐
            │ OpenRouter │  │ Claude CLI  │
            │  Provider  │  │  Provider   │
            └────────────┘  └─────────────┘
```

**Key Integration Point:** The provider is passed to `processBatches()` in `compression-batch.ts`, which calls `provider.compress()` for each task. The interface matches the existing `OpenRouterClient.compress()` signature.

---

## Configuration

### Environment Variables

```bash
# Provider selection (default: openrouter)
LLM_PROVIDER=cc-cli  # or "openrouter"

# OpenRouter (required if LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_MODEL_LARGE=anthropic/claude-opus-4.5

# Claude CLI (no env vars needed - uses OAuth from `claude` login)
# Requires: claude CLI installed, user logged in
```

### Model Configuration

| Condition | Provider | Model |
|-----------|----------|-------|
| ≤1000 tokens | cc-cli | haiku (alias) |
| >1000 tokens | cc-cli | opus (alias) |
| ≤1000 tokens | openrouter | google/gemini-2.5-flash |
| >1000 tokens | openrouter | anthropic/claude-opus-4.5 |

---

## Acceptance Criteria

### Provider Interface

- [ ] AC-01: `LlmProvider` interface defined with `compress(text, level, useLargeModel)` method
- [ ] AC-02: `getProvider()` returns correct provider based on `LLM_PROVIDER` env var
- [ ] AC-03: Default provider is `openrouter` when env var not set

### Claude CLI Provider

- [ ] AC-04: `ClaudeCliProvider` implements `LlmProvider` interface
- [ ] AC-05: Uses `--model haiku` for messages ≤1000 tokens
- [ ] AC-06: Uses `--model opus` for messages >1000 tokens
- [ ] AC-07: Returns JSON response matching existing schema
- [ ] AC-08: Uses OAuth authentication from `claude` login
- [ ] AC-09: Handles CLI errors gracefully (exit codes, stderr)

### OpenRouter Provider (Refactor)

- [ ] AC-10: `OpenRouterProvider` implements `LlmProvider` interface
- [ ] AC-11: Existing functionality preserved (no regressions)

### Integration

- [ ] AC-12: `compressMessages()` uses provider abstraction
- [ ] AC-13: All existing compression tests pass
- [ ] AC-14: Provider can be switched via env var without code changes

---

## Functional Test Conditions

### TC-01: Default provider
- **Given:** `LLM_PROVIDER` not set
- **When:** `getProvider()` called
- **Then:** Returns OpenRouter provider

### TC-02: Claude CLI provider selection
- **Given:** `LLM_PROVIDER=cc-cli`
- **When:** `getProvider()` called
- **Then:** Returns Claude CLI provider

### TC-03: Claude CLI small message
- **Given:** Message with 500 estimated tokens
- **When:** Compressed with Claude CLI provider
- **Then:** Spawns `claude -p --model haiku`

### TC-04: Claude CLI large message
- **Given:** Message with 1500 estimated tokens
- **When:** Compressed with Claude CLI provider
- **Then:** Spawns `claude -p --model opus`

### TC-05: Claude CLI JSON response
- **Given:** Valid compression request
- **When:** Claude CLI provider responds
- **Then:** Response matches `CompressionResponseSchema`

### TC-06: Invalid provider
- **Given:** `LLM_PROVIDER=invalid`
- **When:** `getProvider()` called
- **Then:** Throws `ConfigMissingError`

### TC-07: Claude CLI not found
- **Given:** `LLM_PROVIDER=cc-cli`, `claude` not in PATH
- **When:** Provider attempts to spawn
- **Then:** Throws descriptive error

---

## Technical Notes

### Claude CLI Usage

```typescript
import { spawn } from "child_process";

// Spawn claude CLI with pipe mode
const child = spawn("claude", [
  "-p",                    // Pipe/one-shot mode
  "--model", "haiku",      // Or "opus" for large messages
  "--output-format", "json"
], {
  stdio: ["pipe", "pipe", "pipe"]  // Important for Node.js compatibility
});

// Write prompt to stdin
child.stdin.write(prompt);
child.stdin.end();

// Collect stdout
let output = "";
child.stdout.on("data", (data) => { output += data; });

// Handle completion
child.on("close", (code) => {
  if (code === 0) {
    const result = JSON.parse(output);
    // result.result contains the response
  }
});
```

### Model Aliases

The CLI supports simple aliases:
- `haiku` → Claude Haiku 4.5
- `opus` → Claude Opus 4.5
- `sonnet` → Claude Sonnet 4.5

No need for full model IDs.

### Authentication

The CLI uses OAuth from `claude` login. No API key needed when user is logged in.

---

## Dependencies

### New Dependencies

None - uses built-in `child_process` module and assumes `claude` CLI is installed.

### Prerequisites

- Claude Code CLI installed and in PATH
- User logged in via `claude` (OAuth)

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/providers/types.ts` | `LlmProvider` interface |
| `src/providers/claude-cli-provider.ts` | Claude CLI subprocess implementation |
| `src/providers/openrouter-provider.ts` | Refactored OpenRouter |
| `src/providers/index.ts` | `getProvider()` factory |
| `test/providers/claude-cli-provider.test.ts` | Claude CLI provider tests |
| `test/providers/openrouter-provider.test.ts` | OpenRouter provider tests |

## Files to Modify

| File | Change |
|------|--------|
| `src/services/compression.ts` | Use provider abstraction |
| `src/config.ts` | Add `LLM_PROVIDER` config |
| `.env.example` | Add new env vars |
