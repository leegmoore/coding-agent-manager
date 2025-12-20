# Claude Code Session Storage Analysis Prompt

## Objective

Perform a comprehensive analysis of how Claude Code stores session data, user history, and related metadata. Produce a detailed specification document suitable for building utilities that manage, fix, and enhance Claude Code session management.

## Output

Write your findings to:
`/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/claude-code-session-storage-formats.md`

---

## Background

We are building utilities to clone and modify Claude Code sessions. During development, we encountered several undocumented behaviors that caused bugs. We need a complete understanding of the file formats and relationships to build reliable tooling.

---

## What We Know (Confirmed Facts)

### Directory Structure

The main Claude Code data directory is `~/.claude/` with this structure:

```
~/.claude/
├── projects/                    # Session files organized by project path
│   ├── -Users-leemoore/         # Sessions started from /Users/leemoore
│   ├── -Users-leemoore-code-codex-port-02/  # Sessions from that path
│   └── ...                      # Pattern: slashes replaced with dashes
├── history.jsonl                # Command history with session references
├── session-env/                 # Per-session environment data
│   └── <sessionId>/             # Often empty folders
├── file-history/                # File tracking/snapshots per session
│   └── <sessionId>/
├── todos/                       # Todo lists
│   └── <sessionId>-agent-*.json
├── debug/                       # Debug logs
│   └── <sessionId>.txt
├── settings.json                # User settings
├── settings.local.json          # Local settings override
├── agents/                      # Custom agents
├── plans/                       # Plan files
└── plugins/                     # Plugin data
```

### Session File Format (JSONL)

Each session is a `.jsonl` file (one JSON object per line) named `<sessionId>.jsonl`.

**Entry Types Observed:**

1. **`type: "summary"`** - First entry, contains:
   - `summary`: string - Brief description of conversation
   - `leafUuid`: string - UUID (purpose unclear, may point to last message?)
   - No `sessionId` field (null/absent)

2. **`type: "file-history-snapshot"`** - File tracking:
   - `isSnapshotUpdate`: boolean
   - `messageId`: string
   - `snapshot`: object
   - No `sessionId` field (null/absent)

3. **`type: "user"`** - User messages:
   - `uuid`: string - Unique identifier for this entry
   - `parentUuid`: string|null - Points to previous entry (linked list)
   - `sessionId`: string - The session UUID
   - `cwd`: string - Working directory at time of message
   - `gitBranch`: string
   - `isSidechain`: boolean
   - `message`: object with `role`, `content`
   - `timestamp`: number
   - `userType`: "external" | other
   - `isMeta`: boolean (optional) - System-injected messages

4. **`type: "assistant"`** - Assistant responses:
   - Same fields as user, plus:
   - `requestId`: string
   - `message.stop_reason`: "end_turn" | "tool_use" | null
   - `message.usage`: token counting object

5. **`type: "queue-operation"`** - Internal lifecycle:
   - `operation`: "enqueue" | "dequeue"
   - `sessionId`: string
   - `timestamp`: number
   - `content`: object (optional)

6. **`type: "system"`** - System messages (rare)

### Message Content Structure

The `message.content` field varies:

- **String**: Plain text (user input)
- **Array of blocks**:
  - `{type: "text", text: "..."}` - Text content
  - `{type: "tool_use", id: "...", name: "...", input: {...}}` - Tool call
  - `{type: "tool_result", tool_use_id: "...", content: "..."}` - Tool response
  - `{type: "thinking", thinking: "...", signature: "..."}` - Reasoning block

### UUID Chain

Entries form a linked list via `uuid` and `parentUuid`:
- First user entry has `parentUuid: null`
- Each subsequent entry points to the previous
- Chain can break if entries are deleted

### Usage Data

Token counts stored in `message.usage`:
```json
{
  "input_tokens": 9,
  "cache_creation_input_tokens": 74554,
  "cache_read_input_tokens": 0,
  "output_tokens": 1,
  "service_tier": "standard"
}
```

This is what Claude Code uses to compute "Context X% remaining" in the status bar.

### Turn Detection

A "turn" is user submission through assistant final response:
- Starts: User entry with text content (not tool_result)
- Ends: Assistant entry with `stop_reason: "end_turn"`
- Tool loops (tool_use → tool_result → tool_use...) are within a single turn

### Multiple CWDs in One Session

A single session file can contain entries with different `cwd` values if the user changed directories during the session.

### history.jsonl Format

Each line tracks a command/interaction:
```json
{
  "display": "/context ",
  "pastedContents": {},
  "timestamp": 1764764730875,
  "project": "/Users/leemoore/code/codex-port-02",
  "sessionId": "1deebc7c-fa3f-4ee4-b81e-7fde362974a5"
}
```

---

## What We Suspect (Likely But Unconfirmed)

### Project Directory Assignment

We SUSPECT sessions are stored in the project folder matching the FIRST `cwd` in the session, but this is unconfirmed. The algorithm for determining project folder is unknown.

### Stub File Creation

When resuming a session from a different directory than where it's stored, Claude Code appears to create a small "stub" file in the original location. We observed:
- Original file moved to new location (836KB)
- Tiny stub file (407 bytes) appeared in original location
- Our cloner found the stub first (alphabetical search)

### leafUuid Purpose

The `summary` entry's `leafUuid` may point to the "current" position in the conversation, but we haven't confirmed this. It doesn't match any entry's `uuid` in our samples.

### Session Indexing for /resume

Claude Code's `/resume` command only shows sessions from the current directory's project folder. Unknown if there's an index file or if it scans the folder.

### Version Differences

Different Claude Code versions may store data differently:
- v2.0.36-42: All streaming entries have same stop_reason
- v2.0.50+: Intermediate entries have stop_reason: null

---

## What We Don't Know (Open Questions)

1. **Project folder algorithm**: Exactly how does Claude Code decide which `-Path-To-Dir/` folder a session belongs in?

2. **Session discovery**: How does `/resume` find sessions? Folder scan? Index file? Database?

3. **session-env purpose**: What is stored in `session-env/<sessionId>/` folders? They're often empty.

4. **file-history mechanics**: How does `file-history/<sessionId>/` relate to `file-history-snapshot` entries?

5. **Stub file triggers**: What exactly triggers stub file creation? Directory mismatch on resume?

6. **leafUuid purpose**: What does `summary.leafUuid` actually point to?

7. **Cross-session references**: Are there any files that reference multiple sessions?

8. **Cleanup/garbage collection**: Does Claude Code ever clean up old session data?

9. **settings.json impact**: Do any settings affect session storage behavior?

10. **agents/ folder**: How do agent sessions relate to main sessions?

---

## Analysis Tasks

### Task 1: Directory Structure Inventory

Examine `~/.claude/` thoroughly:
- List ALL subdirectories and their apparent purposes
- Count files in each directory type
- Identify any files/folders not mentioned above

### Task 2: Session File Deep Dive

Analyze 5+ diverse session files:
- Document ALL entry types found
- Document ALL fields per entry type
- Identify patterns in field presence/absence
- Note any version-specific differences (check `version` field)

### Task 3: Metadata File Analysis

For each metadata location:
- `history.jsonl`: Full schema, how entries relate to sessions
- `session-env/`: Contents, purpose, when populated
- `file-history/`: Contents, relationship to session entries
- `todos/`: Schema, naming convention
- `debug/`: Format, what triggers creation

### Task 4: Cross-Reference Analysis

Determine how files relate:
- What references what?
- Are there orphaned files (metadata without session, or vice versa)?
- What happens when a session file is moved/deleted?

### Task 5: Project Folder Algorithm

Attempt to reverse-engineer:
- Create test sessions from different directories
- Track which folder they land in
- Document the encoding scheme (we know `/` → `-`)
- Determine if CWD changes affect folder assignment

### Task 6: Session Discovery

Investigate how Claude Code finds sessions:
- Is there an index/registry file?
- Test what happens when files are moved
- Document the stub file behavior

---

## Document Structure

Your output document should have:

1. **Executive Summary** - Key findings in bullet points

2. **Directory Reference** - Complete `~/.claude/` structure with purposes

3. **Session File Specification**
   - Complete entry type schemas
   - Field descriptions
   - Required vs optional fields
   - Relationships between entries

4. **Metadata File Specifications**
   - history.jsonl schema
   - session-env structure
   - file-history structure
   - todos schema
   - debug format

5. **Cross-Reference Map** - How files relate to each other

6. **Algorithms**
   - Project folder assignment (best guess)
   - Session discovery process
   - Turn detection

7. **Known Issues** - Documented bugs/limitations

8. **Confidence Levels** - For each finding:
   - CONFIRMED: Verified through multiple observations
   - LIKELY: Strong evidence but not definitive
   - SUSPECTED: Limited evidence, needs verification
   - UNKNOWN: No evidence, needs investigation

9. **Appendix: Raw Observations** - Sample data that informed conclusions

---

## Important Notes

- Be thorough but also be honest about uncertainty
- Mark speculation clearly
- Include sample JSON for all schemas
- Note Claude Code version numbers when relevant
- This document will be the foundation for building session management utilities
