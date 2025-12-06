# Phase 5.1: Compression Debug Log

## Goal

Add optional debug logging that creates a markdown file showing before/after for each compressed message.

## Context

**Project:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/`

Phase 5 complete. Add debugging aid for manual verification.

**Note:** This phase requires minor updates to Phase 3-4 code to expose compression tasks for debugging.

## Feature

When `debugLog: true` is in the request, create a markdown file alongside the cloned session showing:
- Each message attempted for compression
- Before and after content
- All message fields
- Compression status (success/skipped/failed)

**Output location:** `clone-debug-log/<target-session-id>-compression-debug.md`

---

## Required Changes to Existing Code

These changes expose data needed for debug logging without breaking existing functionality.

### 1. Update CompressionTask Status Type

**File:** `src/types.ts`

Add `"skipped"` status for messages below threshold:

```typescript
interface CompressionTask {
  messageIndex: number;
  entryType: "user" | "assistant";
  originalContent: string;
  level: CompressionLevel;
  estimatedTokens: number;
  attempt: number;
  timeoutMs: number;
  status: "pending" | "success" | "failed" | "skipped";  // Add "skipped"
  result?: string;
  error?: string;
}
```

**Update `createCompressionTasks()`** to mark skipped messages:

When a message is below the threshold, create a task with `status: "skipped"` instead of filtering it out completely. This allows debug logging to show which messages were skipped.

### 2. Update `compressMessages()` Return Type

**File:** `src/services/compression.ts`

Expose tasks in return value:

```typescript
export async function compressMessages(
  entries: SessionEntry[],
  turns: Turn[],
  bands: CompressionBand[],
  config: CompressionConfig
): Promise<{
  entries: SessionEntry[];
  stats: CompressionStats;
  tasks: CompressionTask[];  // NEW - expose for debug logging
}> {
  // ... existing implementation ...

  // At end, return tasks along with entries and stats
  return {
    entries: compressedEntries,
    stats,
    tasks: completedTasks  // Include all tasks (success/failed/skipped)
  };
}
```

### 3. Update All Callers

**File:** `src/services/session-clone.ts` (in `cloneSessionV2()`)

Capture tasks and clone entries when debug logging:

```typescript
let compressionStats: CompressionStats | undefined;
let compressionTasks: CompressionTask[] = [];
let originalEntries: SessionEntry[] | undefined;

if (request.compressionBands && request.compressionBands.length > 0) {
  // Deep clone entries before compression if debug logging
  if (request.debugLog) {
    originalEntries = JSON.parse(JSON.stringify(entries));
  }

  const compressionConfig = loadCompressionConfig();
  const compressionResult = await compressMessages(
    entries,
    turns,
    request.compressionBands,
    compressionConfig
  );

  entries = compressionResult.entries;
  compressionStats = compressionResult.stats;
  compressionTasks = compressionResult.tasks;  // NEW - capture tasks
}
```

### 4. Update Existing Tests for New Return Type

**Files to update:**
- `test/clone-v2-integration.test.ts` - Update any direct calls to `compressMessages()`
- `test/compression-core.test.ts` - Update TC-10 test that calls `compressMessages()`

**Changes:**

```typescript
// In test/clone-v2-integration.test.ts
// If any tests call compressMessages() directly, update to:
const result = await compressMessages(...);
expect(result.entries).toBeDefined();
expect(result.stats).toBeDefined();
expect(result.tasks).toBeDefined();  // NEW assertion
expect(result.tasks).toBeInstanceOf(Array);

// In test/compression-core.test.ts (TC-10)
it("TC-10: returns unchanged when no compression bands", async () => {
  const result = await compressMessages(entries, turns, [], config);
  expect(result.entries).toEqual(entries);
  expect(result.stats.messagesCompressed).toBe(0);
  expect(result.tasks).toEqual([]);  // NEW - empty bands = no tasks
});
```

---

## Request Schema Update

**File:** `src/schemas/clone-v2.ts`

Update `CloneRequestSchemaV2`:

```typescript
export const CloneRequestSchemaV2 = z.object({
  sessionId: z.string().uuid(),
  toolRemoval: z.enum(["none", "50", "75", "100"]).default("none"),
  thinkingRemoval: z.enum(["none", "50", "75", "100"]).default("none"),
  compressionBands: z.array(CompressionBandSchema).optional(),
  debugLog: z.boolean().optional().default(false),  // NEW
});
```

---

## Debug Log Format

### Structure

```markdown
# Compression Debug Log

## Cloning Session

**Source:** `<source-session-id>`
**Target:** `<target-session-id>`

**Source File:** `<full-path-to-source.jsonl>`
**Target File:** `<full-path-to-target.jsonl>`

### Source Session Fields
- sessionId: `<id>`
- cwd: `<cwd>`
- gitBranch: `<branch>`
- version: `<version>`

### Target Session Fields
- sessionId: `<new-id>`
- cwd: `<cwd>` (preserved)
- gitBranch: `<branch>` (preserved)
- version: `<version>`

---

## Message 1 - UserMessage `<uuid>`

### Before Compression

**Content:**
```
<full text content>
```

**Message Fields:**
- role: `user`
- estimatedTokens: `50`

### After Compression

**Status:** Compressed (35% target)

**Content:**
```
<compressed text>
```

**Message Fields:**
- role: `user`
- compressedTokens: `17`

**Compression Stats:**
- Original: 50 tokens
- Compressed: 17 tokens
- Reduction: 66%

---

## Message 2 - AssistantMessage `<uuid>`

### Before Compression

**Content:**
```
<full text content>
```

**Message Fields:**
- role: `assistant`
- model: `claude-opus-4-5-20251101`
- id: `msg_01ABC...`
- stop_reason: `null`
- estimatedTokens: `100`
- usage:
  - input_tokens: 500
  - output_tokens: 100

### After Compression

**Status:** Not Compressed - Below Threshold (15 tokens)

**Content:**
```
<original text unchanged>
```

---

## Message 3 - UserMessage `<uuid>`

### Before Compression

**Content:**
```
<full text content>
```

**Message Fields:**
- role: `user`
- estimatedTokens: `200`

### After Compression

**Status:** Not Compressed - Failed After 4 Attempts

**Error:** `Compression timeout`

**Content:**
```
<original text unchanged>
```

---

[Repeat for all messages in compression bands]

## Messages Not in Compression Bands

1. Message 10 - AssistantMessage `<uuid>` (250 tokens)
2. Message 15 - UserMessage `<uuid>` (180 tokens)
3. Message 20 - AssistantMessage `<uuid>` (320 tokens)
[... all messages not in any band]

## Summary

Total messages attempted: 15
- Compressed successfully: 10
- Skipped (below threshold): 3
- Failed: 2

Messages not in any band: 45
```

---

## Implementation

### 1. Create Debug Logger Service

**File:** `src/services/compression-debug-logger.ts`

```typescript
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import type { SessionEntry, CompressionTask, CompressionStats } from "../types.js";

export interface DebugLogEntry {
  messageIndex: number;
  entryType: "user" | "assistant";
  uuid: string;
  beforeContent: string;
  afterContent: string;
  beforeFields: Record<string, unknown>;
  afterFields: Record<string, unknown>;
  status: "compressed" | "skipped" | "failed";
  error?: string;
  originalTokens: number;
  compressedTokens?: number;
  reductionPercent?: number;
}

export async function writeCompressionDebugLog(
  sourceSessionId: string,
  targetSessionId: string,
  sourcePath: string,
  targetPath: string,
  sourceEntries: SessionEntry[],
  targetEntries: SessionEntry[],
  tasks: CompressionTask[],
  debugLogDir: string
): Promise<void> {
  // Build markdown content
  let markdown = `# Compression Debug Log\n\n`;
  markdown += `## Cloning Session\n\n`;
  markdown += `**Source:** \`${sourceSessionId}\`\n`;
  markdown += `**Target:** \`${targetSessionId}\`\n\n`;
  markdown += `**Source File:** \`${sourcePath}\`\n`;
  markdown += `**Target File:** \`${targetPath}\`\n\n`;

  // Add session-level fields (from first user entry)
  const sourceUserEntry = sourceEntries.find(e => e.type === "user");
  const targetUserEntry = targetEntries.find(e => e.type === "user");

  if (sourceUserEntry) {
    markdown += `### Source Session Fields\n`;
    markdown += formatSessionFields(sourceUserEntry);
    markdown += `\n`;
  }

  if (targetUserEntry) {
    markdown += `### Target Session Fields\n`;
    markdown += formatSessionFields(targetUserEntry);
    markdown += `\n`;
  }

  markdown += `---\n\n`;

  // Add each compressed message
  let messageCount = 0;
  for (const task of tasks) {
    messageCount++;
    const sourceEntry = sourceEntries[task.messageIndex];
    const targetEntry = targetEntries[task.messageIndex];

    markdown += `## Message ${messageCount} - ${task.entryType === "user" ? "UserMessage" : "AssistantMessage"} \`${sourceEntry.uuid}\`\n\n`;

    // Before compression
    markdown += `### Before Compression\n\n`;
    markdown += `**Content:**\n\`\`\`\n${task.originalContent}\n\`\`\`\n\n`;
    markdown += `**Message Fields:**\n`;
    markdown += formatMessageFields(sourceEntry.message);
    markdown += `- estimatedTokens: \`${task.estimatedTokens}\`\n\n`;

    // After compression
    markdown += `### After Compression\n\n`;

    if (task.status === "success") {
      markdown += `**Status:** Compressed (${task.level === "compress" ? "35%" : "10%"} target)\n\n`;
      markdown += `**Content:**\n\`\`\`\n${task.result}\n\`\`\`\n\n`;
      markdown += `**Message Fields:**\n`;
      markdown += formatMessageFields(targetEntry.message);

      const compressedTokens = Math.ceil((task.result?.length || 0) / 4);
      const reduction = Math.round(((task.estimatedTokens - compressedTokens) / task.estimatedTokens) * 100);

      markdown += `\n**Compression Stats:**\n`;
      markdown += `- Original: ${task.estimatedTokens} tokens\n`;
      markdown += `- Compressed: ${compressedTokens} tokens\n`;
      markdown += `- Reduction: ${reduction}%\n\n`;

    } else if (task.status === "skipped") {
      markdown += `**Status:** Not Compressed - Below Threshold (${task.estimatedTokens} tokens)\n\n`;
      markdown += `**Content:**\n\`\`\`\n${task.originalContent}\n\`\`\`\n\n`;

    } else if (task.status === "failed") {
      markdown += `**Status:** Not Compressed - Failed After ${task.attempt} Attempts\n\n`;
      markdown += `**Error:** \`${task.error}\`\n\n`;
      markdown += `**Content:**\n\`\`\`\n${task.originalContent}\n\`\`\`\n\n`;
    }

    markdown += `---\n\n`;
  }

  // Summary
  const successful = tasks.filter(t => t.status === "success").length;
  const skipped = tasks.filter(t => t.status === "skipped").length;
  const failed = tasks.filter(t => t.status === "failed").length;

  markdown += `## Summary\n\n`;
  markdown += `Total messages attempted: ${tasks.length}\n`;
  markdown += `- Compressed successfully: ${successful}\n`;
  markdown += `- Skipped (below threshold): ${skipped}\n`;
  markdown += `- Failed: ${failed}\n`;

  // Write file
  await mkdir(debugLogDir, { recursive: true });
  const debugFilePath = path.join(debugLogDir, `${targetSessionId}-compression-debug.md`);
  await writeFile(debugFilePath, markdown, "utf-8");

  console.log(`[debug] Compression debug log written to: ${debugFilePath}`);
}

function formatSessionFields(entry: SessionEntry): string {
  let output = "";
  if (entry.sessionId) output += `- sessionId: \`${entry.sessionId}\`\n`;
  if (entry.cwd) output += `- cwd: \`${entry.cwd}\`\n`;
  if (entry.gitBranch) output += `- gitBranch: \`${entry.gitBranch}\`\n`;
  if (entry.version) output += `- version: \`${entry.version}\`\n`;
  return output;
}

function formatMessageFields(message: Record<string, unknown> | undefined): string {
  if (!message) return "";

  let output = "";
  if (message.role) output += `- role: \`${message.role}\`\n`;
  if (message.model) output += `- model: \`${message.model}\`\n`;
  if (message.id) output += `- id: \`${message.id}\`\n`;
  if (message.stop_reason !== undefined) output += `- stop_reason: \`${message.stop_reason}\`\n`;
  if (message.stop_sequence) output += `- stop_sequence: \`${message.stop_sequence}\`\n`;

  if (message.usage && typeof message.usage === "object") {
    const usage = message.usage as Record<string, unknown>;
    output += `- usage:\n`;
    if (usage.input_tokens) output += `  - input_tokens: ${usage.input_tokens}\n`;
    if (usage.output_tokens) output += `  - output_tokens: ${usage.output_tokens}\n`;
    if (usage.cache_creation_input_tokens) output += `  - cache_creation_input_tokens: ${usage.cache_creation_input_tokens}\n`;
    if (usage.cache_read_input_tokens) output += `  - cache_read_input_tokens: ${usage.cache_read_input_tokens}\n`;
  }

  return output;
}
```

### 2. Update `cloneSessionV2()` in `src/services/session-clone.ts`

Add import at top of file:

```typescript
import { writeCompressionDebugLog } from "./compression-debug-logger.js";
```

Modifications needed:

```typescript
export async function cloneSessionV2(request: CloneRequestV2): Promise<CloneResponseV2> {
  // ... load source session, parse, identify turns ...

  let compressionStats: CompressionStats | undefined;
  let compressionTasks: CompressionTask[] = [];
  let originalEntries: SessionEntry[] | undefined;

  // Apply compression if specified
  if (request.compressionBands && request.compressionBands.length > 0) {
    // Clone entries before compression if debug logging enabled
    if (request.debugLog) {
      originalEntries = JSON.parse(JSON.stringify(entries));  // Deep clone
    }

    const compressionConfig = loadCompressionConfig();
    const compressionResult = await compressMessages(
      entries,
      turns,
      request.compressionBands,
      compressionConfig
    );

    entries = compressionResult.entries;
    compressionStats = compressionResult.stats;
    compressionTasks = compressionResult.tasks;  // NEW - capture tasks
  }

  // ... apply removals, repair chain, write output, log lineage ...

  // Write debug log if requested
  if (request.debugLog && originalEntries && compressionTasks.length > 0) {
    try {
      const debugLogDir = path.join(process.cwd(), "clone-debug-log");
      await writeCompressionDebugLog(
        request.sessionId,
        newSessionId,
        sourcePath,
        outputPath,
        originalEntries,      // entries before compression
        finalEntries,         // entries after all processing
        compressionTasks,     // tasks with results/errors
        debugLogDir
      );
    } catch (error) {
      // Don't fail clone if debug log fails
      console.error(`[debug] Failed to write compression debug log:`, error);
    }
  }

  return {
    success: true,
    outputPath,
    stats: { ... }
  };
}
```

### 3. Update `.gitignore`

```
clone-debug-log/
```

---

## Test

No automated tests needed. Manual verification:

```bash
curl -X POST http://localhost:3000/api/v2/clone \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<session-id>",
    "compressionBands": [{"start": 0, "end": 50, "level": "compress"}],
    "debugLog": true
  }'
```

Check: `clone-debug-log/<new-session-id>-compression-debug.md` exists and contains:
- H1 with source/target session info
- H2 for each compressed message
- Before/after sections
- All message fields
- Summary at end

---

## Verification

- [ ] Schema accepts `debugLog` parameter
- [ ] Debug log written when `debugLog: true`
- [ ] Debug log NOT written when `debugLog: false` or omitted
- [ ] Markdown file includes all message fields
- [ ] Shows successful, skipped, and failed compressions
- [ ] Summary section accurate
- [ ] TypeScript compiles
- [ ] Existing tests pass

## Notes

- Debug log includes ALL messages attempted (success, skip, fail)
- Message fields: role, model, id, stop_reason, usage, etc.
- Session-level fields in H1 section
- Creates `clone-debug-log/` directory if needed
- File naming: `<target-session-id>-compression-debug.md`
