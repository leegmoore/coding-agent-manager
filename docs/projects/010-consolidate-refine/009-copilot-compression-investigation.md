# Investigation: Copilot Compression Not Working

## Problem Statement

When cloning a Copilot session with compression settings, compression appears to be bypassed entirely:

- Source session: `28a27a52-feb1-4f04-92cb-77741bbfa7a2`
- Cloned to: `9d581b29-67a8-4254-95f3-2345fa99d14d`
- Settings: 75% tool call removal, 75% thinking removal, heavy compression 0-25%, regular compression 25-50%
- Result: No compression applied

## Root Cause Analysis

### 1. Frontend Sends Incomplete Options to Copilot Endpoint

The frontend (`public/js/pages/clone.js`) builds different request bodies for Claude vs Copilot:

**Claude request (lines 363-372):**
```javascript
body = {
  sessionId,
  toolRemoval: options.toolRemoval,
  thinkingRemoval: options.thinkingRemoval,
  compressionBands: options.compressionBands,  // Full LLM compression bands
  debugLog: options.debugLog,
};
```

**Copilot request (lines 346-361):**
```javascript
body = {
  sessionId,
  workspaceHash: resolvedLocation,
  options: {
    removeToolCalls: options.toolRemoval !== "none",      // Boolean only
    compressPercent: options.compressionBands?.[0]?.compressionLevel || 0,  // WRONG!
    writeToDisk: true,
    targetWorkspaceHash: targetWorkspace || undefined
  }
};
```

**Issue 1:** `compressionBands[0].compressionLevel` is undefined because the band structure has `compressionType` ("heavy" or "regular"), not `compressionLevel`.

**Issue 2:** Even if this worked, only extracting the first band's level ignores the multi-band concept entirely.

### 2. Copilot Clone Service Only Supports Simple Percentage Compression

The `CopilotCloneService` (`src/services/copilot-clone.ts`) has a minimal compression implementation:

```typescript
// Lines 75-77: Simple percentage-based compression only
if (options.compressPercent !== undefined && options.compressPercent > 0) {
  requests = this.compressByPercentage(requests, options.compressPercent);
}
```

The `compressByPercentage` method (lines 180-188) just removes the oldest N% of turns:

```typescript
compressByPercentage(requests: CopilotRequest[], percent: number): CopilotRequest[] {
  if (requests.length === 0 || percent <= 0) return requests;
  if (percent >= 100) return [];

  const removeCount = Math.floor(requests.length * (percent / 100));
  if (removeCount === 0) return requests;

  // Remove from beginning (oldest), keep end (most recent)
  return requests.slice(removeCount);
}
```

**Missing:** LLM-based compression bands like Claude has.

### 3. Schema Doesn't Support Compression Bands

The Copilot clone schema (`src/schemas/copilot-clone.ts`) only allows:

```typescript
options: z.object({
  removeToolCalls: z.boolean().optional(),
  compressPercent: z.number().min(0).max(100).optional(),  // Simple percent only
  writeToDisk: z.boolean().default(true),
  targetWorkspaceHash: z.string().optional(),
}).optional(),
```

**Missing:** `compressionBands` array, `thinkingRemoval` percentage, `toolRemoval` percentage (it only has boolean).

### 4. Comparison: What Claude Clone Supports

Claude's V2 clone (`src/services/session-clone.ts:cloneSessionV2`) supports:

| Feature | Claude | Copilot |
|---------|--------|---------|
| Tool removal percentage (0-100%) | Yes | No (boolean only) |
| Thinking removal percentage (0-100%) | Yes | No |
| Compression bands (heavy/regular by turn range) | Yes | No |
| LLM-based summarization | Yes | No |
| Simple turn removal | N/A | Yes |

### 5. Why Compression Results in 0%

Looking at the frontend code:

```javascript
compressPercent: options.compressionBands?.[0]?.compressionLevel || 0,
```

The `compressionBands` from `buildCompressionBands()` returns objects like:
```javascript
{
  startPercent: 0,
  endPercent: 25,
  compressionType: "heavy"  // Not "compressionLevel"!
}
```

Since `compressionLevel` is undefined, the fallback `|| 0` is used, resulting in 0% compression.

## Affected Files

| File | Issue |
|------|-------|
| `public/js/pages/clone.js:346-361` | Incorrect option mapping for Copilot |
| `src/services/copilot-clone.ts:75-77` | No LLM compression support |
| `src/schemas/copilot-clone.ts` | Missing compression band schema |

## Difficulty Assessment

**Difficulty: HARD**

This is not a simple fix. The Copilot clone service fundamentally lacks the LLM-based compression that Claude has. Options:

1. **Quick Fix (Easy):** Fix the `compressPercent` extraction in `clone.js` to use `endPercent` from the first band as a rough approximation. This would at least make the simple percentage compression work.

2. **Full Implementation (Hard):** Port the LLM compression system from Claude to Copilot:
   - Add `compressionBands` to the Copilot schema
   - Implement `compressMessages()` for Copilot request format
   - Add thinking block removal (if Copilot exposes thinking)
   - Add percentage-based tool removal

## Recommended Fix

### Phase 1: Quick Fix (Make Basic Compression Work)

Fix `public/js/pages/clone.js` to extract a meaningful compression value:

```javascript
// Calculate total compression percentage from bands
// Band 1: heavy compression for 0-25% = removes those turns
// Band 2: regular compression for 25-50% = summarizes those turns
// For simple mode, use the end of the first band as turn removal percent
const compressionPercent = options.compressionBands?.length > 0
  ? options.compressionBands[options.compressionBands.length - 1].endPercent
  : 0;

body = {
  sessionId,
  workspaceHash: resolvedLocation,
  options: {
    removeToolCalls: options.toolRemoval !== "none",
    compressPercent: compressionPercent,  // Fixed!
    writeToDisk: true,
    targetWorkspaceHash: targetWorkspace || undefined
  }
};
```

This would make the "heavy compression 0-25%" band work by removing the oldest 25% of turns.

### Phase 2: Full Parity (Future Work)

1. Update `CopilotCloneOptions` to include:
   - `toolRemoval: string` (percentage like "75" or "none")
   - `thinkingRemoval: string` (percentage or "none")
   - `compressionBands: CompressionBand[]`

2. Implement `compressMessages()` for Copilot:
   - Adapt the message format from Copilot requests to LLM-compatible format
   - Call the same compression service Claude uses
   - Map results back to Copilot request format

3. Update the frontend to send full options to Copilot endpoint

## Implementation Checklist

### Phase 1 (Quick Fix)
- [ ] Fix `compressPercent` calculation in `clone.js`
- [ ] Add UI feedback showing "Basic compression mode for Copilot"
- [ ] Test with Copilot session

### Phase 2 (Full Parity)
- [ ] Update `CopilotCloneRequestSchema` with full options
- [ ] Implement `applyRemovals()` equivalent for Copilot
- [ ] Implement LLM compression for Copilot message format
- [ ] Update frontend to send full options
- [ ] Add tests for all compression modes

## Test Plan

1. Clone a Copilot session with 50% compression
2. Verify the cloned session has ~50% fewer turns
3. Verify the remaining turns are the most recent ones
4. Compare token counts before/after
