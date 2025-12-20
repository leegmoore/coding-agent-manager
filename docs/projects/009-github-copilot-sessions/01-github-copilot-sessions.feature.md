# 009 - GitHub Copilot Session Support: Feature Specification

## Profile

**As an** AI-Enabled Software Engineer who uses both Claude Code and GitHub Copilot
**I want to** browse, clone, and visualize my GitHub Copilot Chat sessions in the same interface I use for Claude Code
**So that** I can manage all my AI coding sessions from a single unified tool with consistent functionality regardless of which AI assistant I used.

## Scope

### In Scope

Full GitHub Copilot Chat session support including discovery, browsing, cloning, and visualization. The implementation adds a `CopilotSessionSource` class for session discovery, a `CopilotCloneService` for session compression in native Copilot format, and extends the visualization to support both sources with unified token estimation. Platform-specific storage paths are detected automatically for macOS, Linux, and Windows. Sessions are parsed from the single-JSON format used by Copilot, with consistent turn counting (user prompt through all responses until next prompt). A unified `estimateTokens()` function (`words * 0.75`) replaces all existing token counting methods for consistency across both sources. When a user pastes a sessionId into Clone or Visualize, both sources are searched automatically.

### Out of Scope

- **Cross-source session conversion** - Converting Claude sessions to Copilot format or vice versa requires different considerations
- **Cross-source comparison** - Comparing Claude vs Copilot sessions on the same codebase is a future feature
- **Copilot inline completions** - Only Chat panel sessions are stored in `chatSessions/`; inline completions don't create session files
- **Remote/SSH workspaces** - Sessions from remote development environments may be stored differently
- **Session deletion** - All sources are read-only in this implementation

## Acceptance Criteria

### Source Discovery

- AC-1: The system detects the VS Code workspace storage directory based on the current platform (macOS: `~/Library/Application Support/Code/User/workspaceStorage/`, Linux: `~/.config/Code/User/workspaceStorage/`, Windows: `%APPDATA%\Code\User\workspaceStorage\`)
- AC-2: Each workspace folder with a valid `workspace.json` file is identified as a potential project
- AC-3: Workspace folders without `chatSessions/` subdirectories are excluded from the project list
- AC-4: The human-readable project path is extracted from `workspace.json`'s `folder` field

### Project Listing

- AC-5: `GET /api/copilot/projects` returns a list of workspaces that contain chat sessions
- AC-6: Each project includes the workspace hash (folder name) and decoded project path
- AC-7: Projects are sorted alphabetically by decoded path
- AC-8: A 503 response is returned if the VS Code storage directory doesn't exist

### Session Listing

- AC-9: `GET /api/copilot/projects/:hash/sessions` returns all chat sessions in that workspace
- AC-10: Each session includes: sessionId, source ("copilot"), projectPath, firstMessage, createdAt, lastModifiedAt, sizeBytes, turnCount
- AC-11: The `sessionId` is the UUID filename without `.json` extension
- AC-12: The `firstMessage` is extracted from `requests[0].message.text`, truncated to 100 characters
- AC-13: The `turnCount` counts turns consistently: each user prompt through all responses until next prompt (non-canceled requests)
- AC-14: Sessions are sorted by `lastModifiedAt` descending (most recent first)
- AC-15: A 404 response is returned for non-existent workspace hash

### Session Browser Integration

- AC-16: The Session Browser displays a source toggle (Claude / Copilot) above the project dropdown
- AC-17: Switching sources reloads the project list from the selected source
- AC-18: Session rows show a visual indicator of their source type (badge or icon)
- AC-19: Clone and Details actions work for both Claude and Copilot sessions
- AC-20: Session URLs include source parameter: `/session-detail?sessionId=xxx&source=copilot`

### Session ID Resolution

- AC-21: When user pastes a sessionId in Clone page, system searches Claude source first, then Copilot
- AC-22: When user pastes a sessionId in Visualize page, system searches Claude source first, then Copilot
- AC-23: If session found, source is auto-detected and used for subsequent operations
- AC-24: If session not found in either source, appropriate error is shown

### Copilot Session Cloning

- AC-25: `POST /api/copilot/clone` accepts sessionId and compression options
- AC-26: Clone output is valid Copilot JSON format (usable in VS Code)
- AC-27: Same compression logic applies: remove tool calls, remove thinking, compress by percentage
- AC-28: Compression operates on `requests[]` array, preserving Copilot structure
- AC-29: Clone returns session with updated `requests[]` reflecting removals

### Unified Token Estimation

- AC-30: All token displays use `estimateTokens(text)` function: `Math.ceil(wordCount * 0.75)`
- AC-31: Token estimation replaces Claude's `message.usage` data in visualization
- AC-32: Token estimation replaces any server-side token counting
- AC-33: Both sources display tokens consistently using same estimation

### Copilot Visualization

- AC-34: Session detail page renders Copilot sessions with same UI as Claude sessions
- AC-35: Turn-based view shows user prompts and assistant responses
- AC-36: Token bars display estimated tokens per turn
- AC-37: Cumulative token tracking works across turns
- AC-38: Playback controls (previous/next turn) work identically to Claude

### Error Handling

- AC-39: Invalid workspace hashes return 404 with `code: "NOT_FOUND"`
- AC-40: Missing VS Code storage returns 503 with `code: "SOURCE_UNAVAILABLE"`
- AC-41: Malformed session JSON files are skipped with a warning log, not fatal errors
- AC-42: Empty `chatSessions/` folders return an empty sessions array, not an error

## Test Conditions

### TC-01: Platform Path Detection
Given the application is running on macOS, when `CopilotSessionSource.getStoragePath()` is called, then it returns `~/Library/Application Support/Code/User/workspaceStorage/`.

### TC-02: Workspace Discovery
Given the workspace storage contains folders `abc123/`, `def456/`, and `ghi789/`, where `abc123` and `def456` have valid `workspace.json` and `chatSessions/` subfolder, but `ghi789` has no `chatSessions/`, when `listProjects()` is called, then only 2 projects are returned.

### TC-03: Project Path Extraction
Given a workspace folder containing `workspace.json` with `{"folder": "file:///Users/dev/myproject"}`, when the project is listed, then the `path` field is `/Users/dev/myproject`.

### TC-04: Turn Counting
Given a session JSON file with `requests` array containing 5 objects where 1 has `isCanceled: true`, when `listSessions()` parses this file, then `turnCount` is 4.

### TC-05: First Message Extraction
Given a session where `requests[0].message.text` is "Help me refactor this authentication module to use JWT tokens", when the session is listed, then `firstMessage` contains "Help me refactor this authentication module to use JWT tokens" (under 100 chars, no truncation).

### TC-06: Empty Session Handling
Given a session JSON file with `requests: []`, when `listSessions()` parses this file, then `firstMessage` is "(No messages)" and `turnCount` is 0.

### TC-07: Malformed JSON Recovery
Given a `chatSessions/` folder containing 3 JSON files where 1 is malformed, when `listSessions()` is called, then 2 valid sessions are returned and a warning is logged for the malformed file.

### TC-08: Source Toggle
Given the user is viewing Claude sessions, when they click the "Copilot" toggle, then the project dropdown reloads with Copilot workspaces.

### TC-09: Session ID Auto-Detection
Given a Copilot session with ID `abc123`, when user pastes `abc123` into the Clone page sessionId field, then the system finds it in Copilot source and loads correctly.

### TC-10: Token Estimation Consistency
Given a message with 100 words, when `estimateTokens()` is called, then it returns 75 (100 * 0.75).

### TC-11: Copilot Clone Output
Given a Copilot session with 5 requests, when cloned with 40% compression, then output JSON has ~3 requests and is valid Copilot format.

### TC-12: Copilot Visualization
Given a Copilot session, when opened in session detail view, then turns display with estimated token counts and playback works.

## UI Wireframe

```
+------------------------------------------------------------------+
|  Session Browser                                                  |
+------------------------------------------------------------------+
|                                                                   |
|  Source:  [Claude] [Copilot]  <-- Toggle buttons, Copilot active  |
|                                                                   |
|  Project: [/Users/dev/myproject            v]                     |
|                                                                   |
|  +--------------------------------------------------------------+ |
|  | Session ID      | First Message        | Modified | Actions  | |
|  |-----------------|----------------------|----------|----------| |
|  | abc123... [CP]  | Help me refactor...  | 2h ago   | Clone Details |
|  | def456... [CP]  | Create a new React...|  1d ago  | Clone Details |
|  +--------------------------------------------------------------+ |
|                                                                   |
|  [CP] = Copilot badge, [CC] = Claude Code badge                   |
|                                                                   |
+------------------------------------------------------------------+
```

## Dependencies

### Existing Code Reused

| Component | Location | Usage |
|-----------|----------|-------|
| `SessionSource` interface | `src/sources/types.ts` | Interface to implement |
| `getSessionSource` factory | `src/sources/index.ts` | Extended to support "copilot" |
| `ProjectInfo`, `SessionSummary` types | `src/types.ts` | Return types for API |
| `truncateMessage` | `src/sources/claude-source.ts` | Reused for message truncation |
| Session Browser UI | `views/pages/session-browser.ejs` | Extended with source toggle |
| Session Browser JS | `public/js/pages/session-browser.js` | Extended for multi-source |
| Clone page | `views/pages/clone.ejs` | Extended for source auto-detection |
| Session Detail page | `views/pages/session-detail.ejs` | Extended for Copilot support |
| Compression logic | `src/services/compression.ts` | Adapted for Copilot format |

### New Reference Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| Copilot Storage Format | `docs/reference/github-copilot-session-storage-formats.md` | Session JSON schema |

## Related Features

- **008-session-browser**: Establishes `SessionSource` abstraction that this project implements
- **006-session-detail-core**: Session visualization adapted for Copilot format
- **001-session-cloning**: Clone feature adapted for Copilot format
