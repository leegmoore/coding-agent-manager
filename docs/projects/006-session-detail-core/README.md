# 006 - Session Detail Core

## Overview

A detailed session visualization and navigation interface that shows cumulative context consumption by type across turns.

## Scope

### Session Input
- Session ID text field + "Load" button
- On load, displays full session at the latest turn

### Turn Navigation
- **Left button** - Decrements turn (disabled at turn 0)
- **Turn input** - Integer text box, bounded 0 to totalTurns
- **Right button** - Increments turn (disabled at max turn)
- **Slider** - Horizontal slider from 0 to totalTurns, positioned below buttons

### Context Visualization
- Fixed dimensions: 800px wide × 500px tall (configurable)
- Vertical bands grouped by type (left to right): User, Assistant, Thinking, Tool
- Band height represents cumulative tokens of that type up to selected turn
- Scale dropdown: 50k to 2000k token bounding
- Auto-expand with warning if context exceeds selected scale

### Turn Detail Card
- Markdown card below visualization
- Shows content for the selected turn:
  - User prompt (full text)
  - Tool calls (first 2 lines + ellipsis for each)
  - Assistant response (full text)
- Read-only view

## Out of Scope (see 007)
- Turn operations (remove tool calls, remove thinking, delete turn)
- Content summarization
- Edit dialogs
- Clone from turn
