# Sequential Stack Visualizer

## Overview

A visualization page that displays Claude Code session context as a vertical stack of horizontal strips, where each strip represents a content entry and width is proportional to token count.

## Requirements

### Functional Requirements

1. New page at `/visualize` with session ID input field and "Visualize" button
2. On submit, fetch session structure and render visualization
3. Display entries in sequential order (top to bottom = start to end of session)
4. Each entry rendered as a horizontal strip with width proportional to estimated tokens
5. Color-code by content type:
   - **User message** - Blue
   - **Assistant text** - Green
   - **Tool** (use + result) - Orange
   - **Thinking** - Purple
6. Legend showing color key
7. Scrollable container if visualization exceeds viewport

### Non-Functional Requirements

1. Pure visual (no click interactivity in this slice)
2. Responsive width (visualization fills available container)
3. Follow existing Project 3 layered architecture patterns

---

## API Specification

### Endpoint

```
GET /api/session/:id/structure
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Session UUID (validated with regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`) |

### Request Validation

```typescript
// Zod schema for route params
const SessionIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid session ID format")
});
```

### Response

```typescript
interface SessionStructureResponse {
  sessionId: string;
  totalTokens: number;
  maxEntryTokens: number;  // Largest single entry - used for width scaling
  entries: StructureEntry[];
}

interface StructureEntry {
  index: number;
  type: "user" | "assistant" | "tool" | "thinking";
  tokens: number;
}
```

### Response Example

```json
{
  "sessionId": "84e0d3f1-f2ee-4560-87da-05ae7f33a6f0",
  "totalTokens": 45230,
  "maxEntryTokens": 2100,
  "entries": [
    { "index": 0, "type": "user", "tokens": 150 },
    { "index": 1, "type": "assistant", "tokens": 320 },
    { "index": 2, "type": "tool", "tokens": 1200 },
    { "index": 3, "type": "tool", "tokens": 890 },
    { "index": 4, "type": "assistant", "tokens": 210 },
    { "index": 5, "type": "thinking", "tokens": 2100 },
    { "index": 6, "type": "assistant", "tokens": 450 }
  ]
}
```

### Error Responses

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_ID` | Session ID fails UUID regex validation |
| 404 | `NOT_FOUND` | Session file not found in any project directory |
| 500 | `PARSE_ERROR` | Failed to parse session JSONL |
| 500 | `SERVER_ERROR` | Unexpected server error |

```typescript
interface ErrorResponse {
  error: {
    code: "INVALID_ID" | "NOT_FOUND" | "PARSE_ERROR" | "SERVER_ERROR";
    message: string;
  }
}
```

### Entry Type Classification

| Source Entry | Maps To |
|--------------|---------|
| `type: "user"` with string content (no tool_result) | `user` |
| `type: "user"` with text blocks (no tool_result) | `user` |
| `type: "user"` with `tool_result` blocks | `tool` |
| `type: "assistant"` with text blocks | `assistant` |
| `type: "assistant"` with `tool_use` blocks | `tool` |
| `type: "assistant"` with `thinking` blocks | `thinking` |
| `type: "summary"` | skip (not included in output) |
| `type: "file-history-snapshot"` | skip (not included in output) |
| `isMeta: true` | skip (not included in output) |

**Note:** Token counts are estimates using `chars/4` heuristic. Exact counts not required.

---

## Mixed-Content Splitting Algorithm

When an entry contains multiple content block types, split into separate StructureEntry items preserving order.

### Algorithm

```
for each entry in session:
  if entry.type is "summary" or "file-history-snapshot" or entry.isMeta:
    skip

  if entry.message.content is string:
    emit single entry with type based on entry.type

  if entry.message.content is array:
    currentType = null
    currentTokens = 0

    for each block in content:
      blockType = classifyBlock(block)  // "text" | "tool" | "thinking"
      blockTokens = estimateTokens(block.text or block content)

      if blockType != currentType and currentType != null:
        emit entry(currentType, currentTokens)
        currentTokens = 0

      currentType = blockType
      currentTokens += blockTokens

    if currentTokens > 0:
      emit entry(currentType, currentTokens)

function classifyBlock(block):
  if block.type == "thinking": return "thinking"
  if block.type == "tool_use": return "tool"
  if block.type == "tool_result": return "tool"
  if block.type == "text": return "text"  // maps to user or assistant based on parent
  return "text"  // default
```

### Example

**Input:** Assistant entry with content:
```json
[
  { "type": "thinking", "thinking": "Let me analyze..." },
  { "type": "text", "text": "I'll help with that." },
  { "type": "tool_use", "name": "read_file", ... },
  { "type": "tool_use", "name": "write_file", ... }
]
```

**Output:**
```json
[
  { "index": 5, "type": "thinking", "tokens": 50 },
  { "index": 6, "type": "assistant", "tokens": 30 },
  { "index": 7, "type": "tool", "tokens": 120 }
]
```

Note: Consecutive same-type blocks are merged (two tool_use → one tool entry).

---

## UI Functional Description

### Page Layout

1. **Header area** - Session ID input (text field) + "Visualize" button
2. **Legend** - Horizontal bar showing: 🟦 User  🟩 Assistant  🟧 Tool  🟪 Thinking
3. **Visualization container** - Scrollable area containing the stack

### Visualization Behavior

1. Container has fixed max-width (e.g., 800px) centered on page
2. Each strip is a horizontal bar within the container
3. Strip width = `(entry.tokens / maxEntryTokens) * containerWidth`
4. Minimum strip width of 4px to ensure visibility of small entries
5. Strip height fixed (e.g., 8-12px) with small gap between strips
6. Strips left-aligned within container
7. Vertical scroll if stack exceeds viewport height

### States

1. **Empty** - Just input field, no visualization
2. **Loading** - Shimmer or spinner while fetching
3. **Loaded** - Visualization rendered
4. **Error** - Error message (session not found, parse error)

---

## Technical Stack

### New Dependencies

```json
{
  "d3": "^7.8.5"
}
```

Load via CDN in template:
```html
<script src="https://d3js.org/d3.v7.min.js"></script>
```

### File Structure

```
public/js/
├── api/
│   └── client.js         # Add get() function
├── lib/
│   └── visualize.js      # Data transforms
├── pages/
│   └── visualize.js      # Page orchestration
views/pages/
└── visualize.ejs         # Page template
src/routes/
└── session-structure.ts  # New route file for GET /api/session/:id/structure
src/services/
└── session-structure.ts  # Parse session, classify entries, compute tokens
```

### API Client Addition

Add to `public/js/api/client.js`:

```javascript
export async function get(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `Server error: HTTP ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}
```

### Service Layer

```typescript
// src/services/session-structure.ts

import { findSessionFile, parseSession } from "./session-clone.js";
import { estimateTokens } from "./compression.js";

interface StructureEntry {
  index: number;
  type: "user" | "assistant" | "tool" | "thinking";
  tokens: number;
}

interface SessionStructure {
  sessionId: string;
  totalTokens: number;
  maxEntryTokens: number;
  entries: StructureEntry[];
}

export async function getSessionStructure(sessionId: string): Promise<SessionStructure>;
```

---

## Implementation Notes

1. Reuse `findSessionFile()` from session-clone.ts to locate session
2. Reuse `parseSession()` from session-clone.ts to parse JSONL
3. Reuse `estimateTokens()` from compression.ts for token estimation
4. D3 used for rendering strips - allows easy scaling and future interactivity
5. Multiple UI iterations expected - keep visualization logic in pages/visualize.js flexible

---

## Out of Scope (Future Slices)

- Click interactivity (show content on click)
- Compression band overlay
- Stats panel with breakdown
- Growth-over-time visualizer (V2)
- Comparison view (before/after compression)
