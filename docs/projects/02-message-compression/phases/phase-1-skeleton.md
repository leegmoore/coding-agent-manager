# Phase 1: Skeleton

## Goal

All new modules, types, and function signatures in place. Functions throw `NotImplementedError`. Server runs with v2 endpoint responding 501.

## Context

**Project:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/`

Setting up scaffolding for message compression feature. Existing v1 endpoint must remain unchanged.

## Existing Types (Already Defined)

From `src/types.ts`:

```typescript
interface SessionEntry {
  type: string;                    // "user" | "assistant" | "queue-operation" | "file-history-snapshot" | "summary"
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  isMeta?: boolean;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
    stop_reason?: string;
  };
  [key: string]: unknown;
}

interface ContentBlock {
  type: string;  // "text" | "tool_use" | "tool_result" | "thinking" | etc.
  text?: string;
  [key: string]: unknown;
}

interface Turn {
  startIndex: number;  // First entry index of turn
  endIndex: number;    // Last entry index of turn
}
```

## Session JSONL Format

Each line is a JSON object representing a session entry:

```jsonl
{"type":"user","uuid":"abc","parentUuid":null,"sessionId":"session-123","message":{"role":"user","content":"Hello"}}
{"type":"assistant","uuid":"def","parentUuid":"abc","sessionId":"session-123","message":{"role":"assistant","content":[{"type":"text","text":"Hi there"}],"stop_reason":null}}
```

**Key patterns:**
- `message.content` can be string OR array of ContentBlock
- User messages with text content (not tool_result) mark turn starts
- Turn = user message through all assistant responses until next user text message

## Deliverables

### 1. New Types (`src/types.ts`)

Add to existing file:

```typescript
type CompressionLevel = "compress" | "heavy-compress";

interface CompressionBand {
  start: number;      // 0-100
  end: number;        // 0-100
  level: CompressionLevel;
}

interface CompressionTask {
  messageIndex: number;
  entryType: "user" | "assistant";
  originalContent: string;
  level: CompressionLevel;
  estimatedTokens: number;
  attempt: number;
  timeoutMs: number;
  status: "pending" | "success" | "failed";
  result?: string;
  error?: string;
}

interface TurnBandMapping {
  turnIndex: number;
  band: CompressionBand | null;
}

interface CompressionStats {
  messagesCompressed: number;
  messagesSkipped: number;
  messagesFailed: number;
  originalTokens: number;
  compressedTokens: number;
  tokensRemoved: number;
  reductionPercent: number;
}

interface CompressionConfig {
  concurrency: number;
  timeoutInitial: number;
  timeoutIncrement: number;
  maxAttempts: number;
  minTokens: number;
  thinkingThreshold: number;
  targetHeavy: number;
  targetStandard: number;
}
```

### 2. New Errors (`src/errors.ts`)

Add to existing file:

```typescript
export class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(`Not implemented: ${methodName}`);
    this.name = "NotImplementedError";
  }
}

export class ConfigMissingError extends Error {
  constructor(configName: string) {
    super(`Required configuration missing: ${configName}`);
    this.name = "ConfigMissingError";
  }
}
```

### 3. New Schema (`src/schemas/clone-v2.ts`)

Create complete file:

```typescript
import { z } from "zod";

export const CompressionBandSchema = z.object({
  start: z.number().min(0).max(100),
  end: z.number().min(0).max(100),
  level: z.enum(["compress", "heavy-compress"]),
}).refine(data => data.start < data.end, "start must be less than end");

function validateNonOverlappingBands(data: { compressionBands?: { start: number; end: number }[] }) {
  if (!data.compressionBands || data.compressionBands.length <= 1) return true;
  const sorted = [...data.compressionBands].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return false;
  }
  return true;
}

export const CloneRequestSchemaV2 = z.object({
  sessionId: z.string().uuid(),
  toolRemoval: z.enum(["none", "50", "75", "100"]).default("none"),
  thinkingRemoval: z.enum(["none", "50", "75", "100"]).default("none"),
  compressionBands: z.array(CompressionBandSchema).optional(),
}).refine(validateNonOverlappingBands, "Compression bands must not overlap");

export const CompressionStatsSchema = z.object({
  messagesCompressed: z.number(),
  messagesSkipped: z.number(),
  messagesFailed: z.number(),
  originalTokens: z.number(),
  compressedTokens: z.number(),
  tokensRemoved: z.number(),
  reductionPercent: z.number(),
});

export const CloneResponseSchemaV2 = z.object({
  success: z.boolean(),
  outputPath: z.string(),
  stats: z.object({
    originalTurnCount: z.number(),
    outputTurnCount: z.number(),
    toolCallsRemoved: z.number(),
    thinkingBlocksRemoved: z.number(),
    compression: CompressionStatsSchema.optional(),
  }),
});

export const CompressionResponseSchema = z.object({
  text: z.string(),
});

export type CloneRequestV2 = z.infer<typeof CloneRequestSchemaV2>;
export type CloneResponseV2 = z.infer<typeof CloneResponseSchemaV2>;
export type CompressionBand = z.infer<typeof CompressionBandSchema>;
```

### 4. New Route (`src/routes/clone-v2.ts`)

Create complete file:

```typescript
import { Router } from "express";
import validate from "express-zod-safe";
import { CloneRequestSchemaV2 } from "../schemas/clone-v2.js";
import { cloneSessionV2 } from "../services/session-clone.js";
import { SessionNotFoundError, NotImplementedError, ConfigMissingError } from "../errors.js";

export const cloneRouterV2 = Router();

cloneRouterV2.post(
  "/clone",
  validate({ body: CloneRequestSchemaV2 }),
  async (req, res) => {
    try {
      const result = await cloneSessionV2(req.body);
      res.json(result);
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
      }
      if (err instanceof NotImplementedError) {
        return res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: err.message } });
      }
      if (err instanceof ConfigMissingError) {
        return res.status(500).json({ error: { code: "CONFIG_MISSING", message: err.message } });
      }
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
    }
  }
);
```

### 5. New Service (`src/services/compression.ts`)

Create file with 7 stubbed functions:

```typescript
import { NotImplementedError } from "../errors.js";
import type {
  SessionEntry,
  Turn,
  CompressionBand,
  CompressionTask,
  TurnBandMapping,
  CompressionStats,
  CompressionConfig
} from "../types.js";

export async function compressMessages(
  entries: SessionEntry[],
  turns: Turn[],
  bands: CompressionBand[],
  config: CompressionConfig
): Promise<{ entries: SessionEntry[]; stats: CompressionStats }> {
  throw new NotImplementedError("compressMessages");
}

export function mapTurnsToBands(
  turns: Turn[],
  bands: CompressionBand[]
): TurnBandMapping[] {
  throw new NotImplementedError("mapTurnsToBands");
}

export function createCompressionTasks(
  entries: SessionEntry[],
  turns: Turn[],
  mapping: TurnBandMapping[]
): CompressionTask[] {
  throw new NotImplementedError("createCompressionTasks");
}

export function estimateTokens(text: string): number {
  throw new NotImplementedError("estimateTokens");
}

export function extractTextContent(entry: SessionEntry): string {
  throw new NotImplementedError("extractTextContent");
}

export function applyCompressedContent(
  entry: SessionEntry,
  compressedText: string
): SessionEntry {
  throw new NotImplementedError("applyCompressedContent");
}

export function applyCompressionResults(
  entries: SessionEntry[],
  results: CompressionTask[]
): SessionEntry[] {
  throw new NotImplementedError("applyCompressionResults");
}
```

### 6. New Service (`src/services/compression-batch.ts`)

```typescript
import { NotImplementedError } from "../errors.js";
import type { CompressionTask } from "../types.js";
import type { OpenRouterClient } from "./openrouter-client.js";

export interface BatchConfig {
  concurrency: number;
  maxAttempts: number;
}

export async function processBatches(
  tasks: CompressionTask[],
  client: OpenRouterClient,
  config: BatchConfig
): Promise<CompressionTask[]> {
  throw new NotImplementedError("processBatches");
}

export async function compressWithTimeout(
  task: CompressionTask,
  client: OpenRouterClient
): Promise<CompressionTask> {
  throw new NotImplementedError("compressWithTimeout");
}
```

### 7. New Service (`src/services/openrouter-client.ts`)

```typescript
import { NotImplementedError, ConfigMissingError } from "../errors.js";
import type { CompressionLevel } from "../types.js";

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  modelThinking: string;
}

export class OpenRouterClient {
  private apiKey: string;
  private model: string;
  private modelThinking: string;

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new ConfigMissingError("OPENROUTER_API_KEY");
    }
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.modelThinking = config.modelThinking;
  }

  async compress(
    text: string,
    level: CompressionLevel,
    useThinking: boolean
  ): Promise<string> {
    throw new NotImplementedError("OpenRouterClient.compress");
  }
}
```

### 8. Modified Service (`src/services/session-clone.ts`)

Add function (do not modify existing code):

```typescript
import type { CloneRequestV2, CloneResponseV2 } from "../schemas/clone-v2.js";

export async function cloneSessionV2(request: CloneRequestV2): Promise<CloneResponseV2> {
  throw new NotImplementedError("cloneSessionV2");
}
```

### 9. Modified Server (`src/server.ts`)

Add after existing route registration:

```typescript
import { cloneRouterV2 } from "./routes/clone-v2.js";

app.use("/api/v2", cloneRouterV2);
```

### 10. Test Fixtures (`test/fixtures/compression/`)

Create directory structure and files.

#### `session-10-turns.jsonl`

Exactly 10 turns with predictable content. Example structure:

```jsonl
{"type":"queue-operation","operation":"enqueue"}
{"type":"user","uuid":"u1","parentUuid":null,"sessionId":"test-session","message":{"role":"user","content":"Turn 1 user message with about 100 characters of text to ensure it exceeds the 20 token minimum threshold"}}
{"type":"assistant","uuid":"a1","parentUuid":"u1","sessionId":"test-session","message":{"role":"assistant","content":[{"type":"text","text":"Turn 1 assistant response with about 100 characters of text to ensure it exceeds the 20 token minimum threshold"}],"stop_reason":null}}
{"type":"user","uuid":"u2","parentUuid":"a1","sessionId":"test-session","message":{"role":"user","content":"Turn 2 user message..."}}
{"type":"assistant","uuid":"a2","parentUuid":"u2","sessionId":"test-session","message":{"role":"assistant","content":[{"type":"text","text":"Turn 2 assistant response..."}],"stop_reason":null}}
...
```

**Requirements:**
- Exactly 10 user-initiated turns
- Each turn has user message + assistant response
- Messages are 100+ characters (~25 tokens each)
- Valid JSONL (one JSON object per line)
- Consistent uuid/parentUuid chain

#### `session-mixed-lengths.jsonl`

Session with messages of varying lengths:
- Turn 1-2: Short messages (~50 chars, <20 tokens) - should be skipped
- Turn 3-5: Medium messages (~200 chars, ~50 tokens) - normal compression
- Turn 6-7: Long messages (~5000 chars, >1000 tokens) - thinking mode threshold

Use same JSONL structure as session-10-turns.jsonl.

#### `expected/` directory

Create empty directory. Golden files will be added in later phases.

## Verification

Run these checks after implementation:

- [ ] `npm run dev` starts without errors
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] `POST /api/v2/clone` with valid body returns 501:
  ```bash
  curl -X POST http://localhost:3000/api/v2/clone \
    -H "Content-Type: application/json" \
    -d '{"sessionId":"550e8400-e29b-41d4-a716-446655440000"}'
  # Expected: {"error":{"code":"NOT_IMPLEMENTED","message":"Not implemented: cloneSessionV2"}}
  ```
- [ ] `POST /api/v2/clone` with overlapping bands returns 400:
  ```bash
  curl -X POST http://localhost:3000/api/v2/clone \
    -H "Content-Type: application/json" \
    -d '{"sessionId":"550e8400-e29b-41d4-a716-446655440000","compressionBands":[{"start":0,"end":50,"level":"compress"},{"start":40,"end":60,"level":"compress"}]}'
  # Expected: {"error":"Compression bands must not overlap"}
  ```
- [ ] `POST /api/clone` (v1) still works unchanged
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Tests run: `npm run test` (existing v1 tests pass, new tests not written yet)

## Files Created

- `src/types.ts` - Types added
- `src/errors.ts` - Errors added
- `src/schemas/clone-v2.ts` - New file
- `src/routes/clone-v2.ts` - New file
- `src/services/compression.ts` - New file (7 stubs)
- `src/services/compression-batch.ts` - New file (2 stubs)
- `src/services/openrouter-client.ts` - New file (stubbed class)
- `src/services/session-clone.ts` - Function added
- `src/server.ts` - Modified
- `test/fixtures/compression/session-10-turns.jsonl` - New file
- `test/fixtures/compression/session-mixed-lengths.jsonl` - New file
- `test/fixtures/compression/expected/` - New directory

## Notes

- Do NOT modify `cloneSession()` (v1 function)
- Do NOT modify `src/routes/clone.ts`
- Do NOT modify `src/schemas/clone.ts`
- All stubs throw `NotImplementedError`
- Test fixtures use simplified but valid JSONL structure
