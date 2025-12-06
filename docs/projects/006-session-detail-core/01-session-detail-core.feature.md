# Feature: Session Detail Core

## Profile

**As an** AI Enabled Software Engineer
**I want to** visualize my Claude Code session's cumulative context consumption by type across turns
**So that** I can understand how my context window is being used, identify which content types are consuming the most space, and make informed decisions about context management.

---

## Scope

### In Scope

This feature creates a new session detail page (`/session-detail`) that provides a turn-by-turn visualization of cumulative context consumption. Users enter a session ID, and the page displays: (1) turn navigation controls including left/right buttons, a bounded integer input, and a synchronized slider; (2) a vertical band visualization showing cumulative tokens grouped by type (User, Assistant, Thinking, Tool) with configurable dimensions and scale; (3) a turn detail card showing the selected turn's content in markdown format with truncated tool calls. The visualization updates as users navigate through turns, showing how context accumulates over the session lifetime.

### Out of Scope

This feature does not include turn modification operations (remove tool calls, remove thinking, delete turn, summarize) - those are covered in 007-session-detail-refine. Clone-from-turn functionality is not included. Edit dialogs and fine-grained content editing are not included. Real-time session monitoring is not included. Comparison views (before/after compression) are not included.

---

## Acceptance Criteria

### Session Loading

- AC-1: A new page at `/session-detail` accepts a session ID input field and "Load" button
- AC-1b: Page accepts session ID via `?id=` query parameter for direct linking
- AC-2: On load, the session is fetched and displayed at the latest turn
- AC-2b: While loading, a loading indicator is displayed; hidden on success or error
- AC-3: Invalid session IDs return a clear error message
- AC-4: Sessions not found return a 404 with user-friendly message

### Turn Navigation

- AC-5: Left button decrements the current turn by 1 (disabled at turn 0)
- AC-6: Right button increments the current turn by 1 (disabled at max turn)
- AC-7: Turn input accepts integers bounded from 0 to totalTurns-1 (zero-indexed)
- AC-8: Turn input rejects non-integer values
- AC-9: Turn slider ranges from 0 to totalTurns-1 (zero-indexed)
- AC-10: All navigation controls are synchronized - changing one updates the others
- AC-11: On load, navigation is set to the latest turn (rightmost position)

### Context Visualization

- AC-12: Visualization displays 4 vertical bands: User, Assistant, Thinking, Tool (left to right)
- AC-13: Band height represents cumulative tokens of that type up to the selected turn
- AC-14: Visualization dimensions are configurable (default 800px wide × 500px tall)
- AC-15: Scale input accepts values from 50k to 2000k tokens as the maximum bound (text input, not dropdown)
- AC-16: If cumulative context exceeds the selected scale, a warning appears and scale auto-expands
- AC-17: Auto-expanded scale shows indicator that it has been adjusted
- AC-18: Visualization updates when turn selection changes

### Turn Detail Card

- AC-19: Below the visualization, a markdown card shows the selected turn's content
- AC-20: User prompt is displayed in full
- AC-21: Tool calls show first 2 lines followed by ellipsis if content exceeds 2 lines
- AC-22: Assistant response is displayed in full
- AC-23: Card updates when turn selection changes

### API

- AC-24: New endpoint `GET /api/session/:id/turns` returns turn-organized session data
- AC-25: Response includes cumulative token counts by type at each turn
- AC-26: Response includes turn content (user prompt, tool blocks, assistant response)
- AC-27: Invalid session ID format returns 400
- AC-28: Session not found returns 404

---

## Test Conditions

### TC-01: Session Load Success
Given a valid session ID, when the user clicks Load, then the session is fetched and the visualization displays at the latest turn with all navigation controls synchronized to that position.

### TC-02: Session Load Failure - Invalid ID
Given an invalid session ID format (not a UUID), when the user clicks Load, then an error message is displayed indicating the ID format is invalid.

### TC-03: Session Load Failure - Not Found
Given a valid UUID that doesn't match any session, when the user clicks Load, then a 404-style error message is displayed indicating the session was not found.

### TC-04: Turn Navigation - Left Button
Given a session loaded at turn 5, when the user clicks the left button, then the turn decrements to 4 and all controls update accordingly.

### TC-05: Turn Navigation - Left Button Disabled
Given a session loaded at turn 0, then the left button is disabled and cannot be clicked.

### TC-06: Turn Navigation - Right Button
Given a session loaded at turn 5 of 10, when the user clicks the right button, then the turn increments to 6 and all controls update accordingly.

### TC-07: Turn Navigation - Right Button Disabled
Given a session loaded at the maximum turn, then the right button is disabled and cannot be clicked.

### TC-08: Turn Navigation - Input Field
Given a session with 20 turns, when the user enters "15" in the turn input and presses Enter, then the visualization updates to turn 15.

### TC-09: Turn Navigation - Input Bounds
Given a session with 20 turns, when the user enters "25" in the turn input, then the input rejects the value or clamps to 20.

### TC-10: Turn Navigation - Slider
Given a session with 20 turns, when the user drags the slider to the midpoint, then the turn updates to approximately 10 and other controls sync.

### TC-11: Visualization - Band Display
Given a session with user messages, assistant responses, thinking blocks, and tool calls, when displayed at a turn, then 4 distinct colored bands are visible representing cumulative tokens of each type.

### TC-12: Visualization - Token Proportions
Given a session where thinking blocks dominate token count, when visualized, then the Thinking band is visibly taller than other bands.

### TC-13: Visualization - Scale Input
Given a visualization with scale set to 100k, when the user enters 200 in the scale input, then the band heights adjust proportionally to the new scale.

### TC-13b: Visualization - Scale Input Bounds
Given the scale input, when the user enters a value below 50 or above 2000, then the input is clamped to the valid range (50-2000).

### TC-14: Visualization - Auto-Expand Warning
Given a session with 150k cumulative tokens at turn N and scale set to 100k, when the user navigates to turn N, then a warning appears indicating scale has auto-expanded to accommodate the context.

### TC-15: Turn Detail - Content Display
Given a turn with a user prompt, tool calls, and assistant response, when that turn is selected, then all three sections appear in the markdown card.

### TC-16: Turn Detail - Tool Call Truncation
Given a tool call with 10 lines of content, when displayed in the turn detail card, then only the first 2 lines are shown followed by an ellipsis.

### TC-17: Turn Detail - Card Updates
Given turn 5 is selected showing its content, when the user navigates to turn 6, then the card updates to show turn 6's content.

### TC-18: API - Cumulative Token Calculation
Given a session with 10 turns, when the API returns turn data, then each turn includes cumulative token counts that are the sum of all tokens from turn 0 through that turn.

### TC-19: API - Turn Content Extraction
Given a turn with mixed content (thinking, text, tool_use), when the API processes it, then the turn object contains the user prompt, separated tool blocks, and assistant response text.
