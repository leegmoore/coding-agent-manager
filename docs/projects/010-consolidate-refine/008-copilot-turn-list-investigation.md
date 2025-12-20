# Investigation: Missing Tool Calls in Copilot Turn List

## Problem Statement

The session detail visualization for Copilot sessions shows:
- **Chart (left):** Orange "Tool" bars ARE showing (token counting is correct)
- **Turn list (right):** Only shows User (U) and Assistant (A) entries, NO tool calls (T)

In Claude Code sessions, tool calls appear as separate items in the turn list. For Copilot sessions, they are missing from the list even though tokens are being counted correctly in the chart.

## Root Cause Analysis

### 1. Data Structure Mismatch

**Claude `TurnContent` interface** (`src/types.ts:102-107`):
```typescript
export interface TurnContent {
  userPrompt: string;
  toolBlocks: ToolBlock[];      // <-- Array of {name, content}
  toolResults?: ToolBlock[];    // <-- Array of {name, content}
  thinking?: string;
  assistantResponse: string;
}
```

**Copilot `CopilotTurnData.content`** (`src/services/copilot-structure.ts:41-45`):
```typescript
content: {
  userPrompt: string;
  assistantResponse: string;
  toolCalls: CopilotToolCall[];  // <-- Different property name!
}
```

**Key difference:** Claude uses `toolBlocks` and `toolResults`, but Copilot uses `toolCalls`.

### 2. Frontend Expects Claude's Structure

The frontend (`public/js/pages/session-detail.js:533-550`) explicitly checks for `toolBlocks` and `toolResults`:

```javascript
// Line 537-543 - looks for toolBlocks
if (content.toolBlocks && Array.isArray(content.toolBlocks)) {
  content.toolBlocks.forEach((t, idx) => {
    const label = t?.name || `Tool ${idx + 1}`;
    const text = t?.content || "";
    segments.push({ type: "tool", text: `${label}: ${text}` });
  });
}

// Line 545-551 - looks for toolResults
if (content.toolResults && Array.isArray(content.toolResults)) {
  content.toolResults.forEach((t, idx) => {
    const label = t?.name || `Tool result ${idx + 1}`;
    const text = t?.content || "";
    segments.push({ type: "tool", text: `Result ${label}: ${text}` });
  });
}
```

Since Copilot's data has `toolCalls` instead of `toolBlocks`/`toolResults`, these conditions never match and no tool segments are created.

### 3. Token Counting Works Because It Uses Different Logic

The chart correctly shows tool tokens because `CopilotStructureService.calculateToolTokens()` iterates over the raw Copilot data structures (response array items and metadata), not the `content.toolBlocks` field that the frontend expects.

## Affected Files

| File | Role | Issue |
|------|------|-------|
| `src/services/copilot-structure.ts:38-46` | API response structure | Uses `toolCalls` instead of `toolBlocks`/`toolResults` |
| `public/js/pages/session-detail.js:537-551` | Turn rail rendering | Expects `toolBlocks` and `toolResults` |
| `src/types.ts:102-107` | Type definitions | Defines `TurnContent` with `toolBlocks`/`toolResults` |

## Fix Difficulty Assessment

**Difficulty: EASY**

This is a straightforward property naming mismatch. The data is being extracted correctly in `CopilotStructureService.extractToolCalls()`, it is just returned under a different property name than what the frontend expects.

## Recommended Fix

**Option A: Change Copilot API response to match Claude's structure (Recommended)**

Modify `src/services/copilot-structure.ts` to return `toolBlocks` and optionally `toolResults` instead of `toolCalls`:

```typescript
// In CopilotTurnData interface (lines 38-46)
export interface CopilotTurnData {
  turnIndex: number;
  cumulative: CopilotTokensByType;
  content: {
    userPrompt: string;
    assistantResponse: string;
    toolBlocks: { name: string; content: string }[];   // Renamed from toolCalls
    toolResults?: { name: string; content: string }[]; // Add for results
    thinking?: string;                                  // Add for consistency
  };
}
```

Then update `extractTurnsWithCumulative()` to map `CopilotToolCall` to the expected format:

```typescript
// In extractTurnsWithCumulative (around line 159)
content: {
  userPrompt,
  assistantResponse,
  toolBlocks: toolCalls.map(tc => ({
    name: tc.toolName,
    content: tc.invocationMessage
  })),
  toolResults: toolCalls
    .filter(tc => tc.resultContent)
    .map(tc => ({
      name: tc.toolName,
      content: tc.resultContent!
    })),
  thinking: undefined, // Copilot doesn't expose thinking
},
```

**Option B: Update frontend to handle both structures**

Add fallback checks in `session-detail.js`:

```javascript
// Support both Claude (toolBlocks) and Copilot (toolCalls)
const toolBlocksArray = content.toolBlocks || content.toolCalls || [];
if (Array.isArray(toolBlocksArray)) {
  toolBlocksArray.forEach((t, idx) => {
    const label = t?.name || t?.toolName || `Tool ${idx + 1}`;
    const text = t?.content || t?.invocationMessage || "";
    segments.push({ type: "tool", text: `${label}: ${text}` });
  });
}
```

### Recommended Approach: Option A

Option A is cleaner because:
1. It maintains a single expected data format on the frontend
2. The API adapts source-specific data to a common interface
3. No conditional logic needed in the frontend
4. Future sources can adapt to the same interface

## Implementation Checklist

- [ ] Update `CopilotTurnData` interface in `src/services/copilot-structure.ts`
- [ ] Update `extractTurnsWithCumulative()` to return `toolBlocks` and `toolResults`
- [ ] Add `thinking?: string` to content for interface consistency
- [ ] Test with a Copilot session that has tool calls
- [ ] Verify turn rail shows T: entries for tools

## Test Verification

After fix, load a Copilot session with tool usage and verify:
1. Chart still shows orange tool token bars (regression check)
2. Turn rail shows "T:XXt - tool_name: ..." entries
3. Detail card shows "### Tools" section with tool information
