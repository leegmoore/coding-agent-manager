# Feature: Session Browser

## Profile

**As an** AI Enabled Software Engineer  
**I want to** browse my Claude Code sessions by project folder and see key metadata  
**So that** I can quickly find sessions to clone, visualize, or resume without manually copying session IDs from the filesystem.

---

## Scope

### In Scope

This feature makes the session browser the home page (`/`) providing project-based session discovery. Users select a project folder from a dropdown, and the page displays a sortable table of sessions with metadata including: truncated first message, creation date, last modified date, file size, and turn count. Each row has action buttons to navigate to the clone page or session detail/visualizer with the session ID pre-filled. The implementation uses an abstraction layer (`SessionSource` interface) to enable future support for other session formats (GitHub Copilot). The existing clone page moves to `/session-clone`.

### Out of Scope

This feature does not include GitHub Copilot session support - that is covered in 009-copilot-adapter. Session content search/filtering is not included. Session deletion or bulk operations are not included. Real-time session monitoring is not included. Session comparison views are not included.

---

## Acceptance Criteria

### Project Selection

- AC-1: The home page (`/`) displays a dropdown of available project folders
- AC-2: Project folders are shown in human-readable format (e.g., `/Users/lee/code/myapp` not `-Users-lee-code-myapp`)
- AC-3: Projects are sorted alphabetically by decoded path
- AC-4: On page load, no project is selected; user must choose one
- AC-5: Empty projects directory shows appropriate message

### Session List

- AC-6: After selecting a project, a table displays all sessions in that folder
- AC-7: Table columns: First Message, Created, Last Modified, Size, Turns
- AC-8: First Message column shows first ~100 characters of first user message, with ellipsis if truncated
- AC-9: Created and Last Modified show human-friendly relative dates (e.g., "2 hours ago", "Dec 8")
- AC-10: Size shows human-friendly format (e.g., "1.2 MB", "340 KB")
- AC-11: Table is sortable by clicking column headers
- AC-12: Default sort is Last Modified descending (most recent first)
- AC-13: Empty project (no sessions) shows appropriate message
- AC-14: Loading state shown while fetching sessions

### Session Actions

- AC-15: Each row has a "Clone" button that navigates to `/session-clone?sessionId=<id>` 
- AC-16: Each row has a "Visualize" button that navigates to `/session-detail?id=<id>`
- AC-17: Clicking the session ID copies it to clipboard with visual feedback
- AC-18: Row click (not on buttons) navigates to session detail

### API

- AC-19: New endpoint `GET /api/projects` returns list of project folders
- AC-20: Response includes encoded folder name and decoded path
- AC-21: New endpoint `GET /api/projects/:folder/sessions` returns sessions in a project
- AC-22: Response includes sessionId, firstMessage, createdAt, lastModifiedAt, sizeBytes, turnCount
- AC-23: Invalid folder returns 404
- AC-24: Sessions are returned sorted by lastModifiedAt descending

### Abstraction Layer

- AC-25: `SessionSource` interface defines `listProjects()` and `listSessions(folder)` methods
- AC-26: `ClaudeSessionSource` implements the interface for Claude Code JSONL format
- AC-27: Source type is configurable (default: claude) for future extensibility

### Route Changes

- AC-28: The session browser becomes the home page at `/`
- AC-29: The existing clone page moves to `/session-clone`
- AC-30: Clone page at `/session-clone` accepts `?sessionId=<id>` query parameter to pre-fill the session ID field

---

## Test Conditions

### TC-01: Project List Load
Given the Claude projects directory contains 3 project folders, when the user loads `/`, then the dropdown shows 3 projects with human-readable paths.

### TC-02: Project List Empty
Given the Claude projects directory is empty or doesn't exist, when the user loads `/`, then an appropriate "No projects found" message is displayed.

### TC-03: Session List Load
Given a project folder contains 5 session files, when the user selects that project, then the table displays 5 rows with correct metadata.

### TC-04: Session List Empty
Given a project folder contains no session files, when the user selects that project, then an appropriate "No sessions found" message is displayed.

### TC-05: First Message Extraction
Given a session with first user message "Please help me refactor this authentication module to use JWT tokens instead of session cookies", when displayed in the table, then First Message shows "Please help me refactor this authentication module to use JWT tokens inst..." (truncated with ellipsis).

### TC-06: First Message - No User Message
Given a session that starts with a summary or queue-operation entry (no user message), when displayed in the table, then First Message shows "(No user message)" or similar placeholder.

### TC-07: Sort by Created
Given a session list sorted by Last Modified, when the user clicks the Created column header, then the list re-sorts by Created date.

### TC-08: Sort Toggle
Given a session list sorted by Last Modified descending, when the user clicks Last Modified again, then the sort order toggles to ascending.

### TC-09: Clone Navigation
Given a session row with ID "abc-123", when the user clicks the Clone button, then they are navigated to `/session-clone?sessionId=abc-123`.

### TC-10: Visualize Navigation
Given a session row with ID "abc-123", when the user clicks the Visualize button, then they are navigated to `/session-detail?id=abc-123`.

### TC-11: Copy Session ID
Given a session row with ID "abc-123", when the user clicks the session ID, then it is copied to clipboard and a "Copied!" toast appears.

### TC-12: Large File Handling
Given a project with 100+ session files, when the user selects that project, then all sessions load within reasonable time (<3s) and the table is responsive.

### TC-13: Metadata Accuracy
Given a session file with known timestamps and size, when displayed in the table, then Created, Last Modified, and Size match the actual file metadata.

### TC-14: Turn Count Accuracy
Given a session with 15 identified turns, when displayed in the table, then Turns column shows "15".

---

## UI Wireframe

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Session Browser                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Project: [ /Users/lee/code/myapp                    ▼ ]                │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  First Message              │ Created  │ Modified │ Size   │ Turns │    │
├─────────────────────────────────────────────────────────────────────────┤
│  Please help me refactor... │ Dec 8    │ 2h ago   │ 1.2 MB │  45   │ ⚡📊│
│  Can you add unit tests...  │ Dec 7    │ 1d ago   │ 340 KB │  12   │ ⚡📊│
│  I need to debug this...    │ Dec 5    │ 3d ago   │ 89 KB  │   8   │ ⚡📊│
│  ...                        │          │          │        │       │    │
└─────────────────────────────────────────────────────────────────────────┘

⚡ = Clone    📊 = Visualize
```

---

## Dependencies

- Existing: `findSessionFile`, `parseSession`, `identifyTurns` from session-clone service
- Existing: File system access to `~/.claude/projects/`
- New: None

## Related Features

- 006-session-detail-core: Visualize button navigates here
- 009-copilot-adapter: Will implement `SessionSource` for GitHub Copilot format
- Clone page: Clone button navigates here with pre-filled session ID
