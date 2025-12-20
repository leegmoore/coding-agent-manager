# 008 - Session Browser

## Overview

A session discovery and listing interface that allows users to browse Claude Code sessions by project folder, view session metadata, and navigate to existing features (clone, visualize).

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Session Source API + TDD Red | Not Started |
| 2 | Session Source Implementation + TDD Green | Not Started |
| 3 | Session Browser UI | Not Started |
| 4 | Integration Testing + Polish | Not Started |

## Scope

### Project Selection
- Dropdown or list of available project folders (decoded from `-Path-To-Dir` format)
- Shows project path in human-readable form

### Session List
- Table view of sessions in selected project
- Columns: First Message (truncated), Created, Last Modified, Size, Turns
- Sortable by any column (default: Last Modified descending)
- Row actions: View Details, Clone, Visualize

### Session Metadata Extraction
- First user message text (truncated to ~100 chars)
- File timestamps (created, modified)
- File size
- Turn count

### Abstraction Layer
- `SessionSource` interface for future multi-provider support (GitHub Copilot)
- `ClaudeSessionSource` implementation for Claude Code JSONL format

### Route Changes
- `/` - Session Browser (new home page)
- `/session-clone` - Clone page (moved from `/`)
- `/session-detail` - Session detail/visualizer (unchanged)

## Out of Scope (see 009-copilot-adapter)
- GitHub Copilot session support
- Cross-source session comparison
- Session search/filtering by content
- Session deletion or bulk operations
