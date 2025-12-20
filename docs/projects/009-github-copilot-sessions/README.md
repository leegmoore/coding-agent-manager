# 009 - GitHub Copilot Session Support

## Overview

Full GitHub Copilot Chat session support including discovery, browsing, cloning, and visualization. Implements a `CopilotSessionSource` that reads from VS Code's workspace storage, a `CopilotCloneService` for session compression, and extends the visualization to support both sources with unified token estimation.

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Discovery & Browsing - Skeleton + TDD Red | Not Started |
| 2 | Discovery & Browsing - TDD Green | Not Started |
| 3 | Visualization - Skeleton + TDD Red | Not Started |
| 4 | Visualization - TDD Green | Not Started |
| 5 | Cloning & Integration - Skeleton + TDD Red | Not Started |
| 6 | Cloning & Integration - TDD Green | Not Started |

## Phase Structure

Each feature follows the Skeleton → TDD Red → TDD Green cycle:

**Phases 1-2: Discovery & Browsing**
- `CopilotSessionSource` implementation
- API routes for project/session listing
- Source toggle in Session Browser UI
- Test fixtures and comprehensive tests

**Phases 3-4: Visualization**
- Unified `estimateTokens()` utility
- `CopilotStructureService` for turn extraction
- Session detail page multi-source support
- Token bars and playback for Copilot sessions

**Phases 5-6: Cloning & Integration**
- `CopilotCloneService` for native-format cloning
- Source resolver for session ID auto-detection
- Clone page multi-source support
- End-to-end integration tests

## Scope

### Copilot Session Discovery
- Scan VS Code workspace storage directory for chat sessions
- Map workspace hash folders to project paths via `workspace.json`
- Support multiple workspaces simultaneously
- Platform-aware storage path detection (macOS, Linux, Windows)

### Copilot Session Parsing
- Parse single-JSON session format (different from Claude's JSONL)
- Extract session metadata: title, timestamps, turn count
- Extract first user message from `requests[0].message.text`
- Consistent turn definition: user prompt through all responses until next prompt

### Session Browser Integration
- Source selector in Session Browser UI (Claude / Copilot toggle)
- Visual distinction between source types in session list
- Paste-sessionId searches both sources automatically
- Fully qualified session URLs with source parameter

### Copilot Session Cloning
- Clone Copilot sessions in native Copilot JSON format
- Same compression/removal logic applied to `requests[]` structure
- Output valid Copilot session JSON (usable in VS Code)

### Unified Token Estimation
- Single `estimateTokens(text)` function: `words * 0.75`
- Replace all existing token counting (server-side, usage data, libraries)
- Consistent token display across both sources
- Applied in visualization and cloning

### Copilot Visualization
- Full visualization support with token estimation
- Same turn-based view as Claude sessions
- Playback controls work identically

### Route Updates
- `GET /api/copilot/projects` - List Copilot workspaces
- `GET /api/copilot/projects/:hash/sessions` - List sessions in workspace
- `POST /api/copilot/clone` - Clone Copilot session
- `GET /api/copilot/session/:id/structure` - Session structure for visualization
- `GET /api/copilot/session/:id/turns` - Session turns for visualization

## Out of Scope (see future projects)
- Cross-source session conversion (Claude ↔ Copilot)
- Cross-source session comparison
- Copilot inline completions (only chat sessions)
- Remote/SSH workspace sessions
