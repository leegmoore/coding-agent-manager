# 007 - Session Detail Refine

## Overview

Turn-level operations for manual context curation, building on the 006 visualization foundation.

## Scope

### Turn Operations
Operations available on the currently selected turn:

| Operation | Description |
|-----------|-------------|
| **Remove Tool Calls** | Strip all tool_use and tool_result blocks from this turn |
| **Remove Thinking** | Strip all thinking blocks from this turn |
| **Delete Turn** | Remove the entire turn from the session |
| **Summarize User Prompt** | LLM-compress the user message |
| **Summarize Assistant Response** | LLM-compress the assistant message |

### Clone from Turn
- "Create clone from this turn" button
- Creates new session with turns 0 through selected turn
- Returns new session ID and launch command

### Edit Dialog (stretch)
- Opens modal for fine-grained turn editing
- Individual block selection/removal
- Custom text edits
- Preview changes before applying

## Dependencies
- Requires 006-session-detail-core to be complete
- Reuses existing compression infrastructure from Project 2
- Reuses clone infrastructure from Project 1

## Out of Scope
- Batch operations across multiple turns
- Automatic optimization suggestions
- Undo/redo
