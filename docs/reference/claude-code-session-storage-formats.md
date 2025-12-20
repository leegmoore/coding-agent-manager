# Claude Code Session Storage Formats Specification

Version: 1.1.0
Last Updated: 2025-12-03
Analysis Based On: Claude Code versions 2.0.36 - 2.0.55

---

## 1. Executive Summary

### Key Findings

- **Session files** are stored as JSONL (one JSON object per line) in `~/.claude/projects/<encoded-path>/`
- **Project folder encoding**: Forward slashes in paths become dashes (e.g., `/Users/leemoore` becomes `-Users-leemoore`)
- **Session assignment**: Session is stored in folder matching the FIRST `cwd` in the session [CONFIRMED]
- **Entry types**: 5 core types (summary, user, assistant, queue-operation, file-history-snapshot)
- **UUID chain**: Entries form a linked list via `uuid` and `parentUuid` fields
- **Agent sessions**: Stored with `agent-<agentId>.jsonl` naming, have `isSidechain: true` and `agentId` field
- **Metadata scattered**: Todo, debug, file-history, and session-env data stored separately by session ID
- **No central index**: Session discovery appears to scan project folders directly

### Critical Observations for Tooling

1. **Empty session files exist** (0 bytes) - likely abandoned sessions
2. **Small stub files** (~133-298 bytes) contain only summary or queue-operation entries
3. **history.jsonl** tracks commands AND session IDs (newer entries only)
4. **session-env folders are empty** - purpose unclear, may be reserved for future use
5. **file-history contains actual file backups** with versioning
6. **Thinking blocks have signatures** - cryptographic signatures for extended thinking content
7. **First entry varies** - sessions may start with queue-operation, user, assistant, or file-history-snapshot entries; summary entries are rare (~0.15% of sessions)

---

## 2. Directory Reference

### Complete `~/.claude/` Structure

```
~/.claude/
├── .claude/                    # [DISCOVERED] Nested settings for ~/.claude itself
│   └── settings.local.json     # Project-level permissions for ~/.claude directory
│
├── agents/                     # Custom agent definitions (user-created)
│   └── <agent-name>.md         # Markdown file with YAML frontmatter (see Section 4.8)
│
├── debug/                      # Debug logs per session
│   └── <sessionId>.txt         # Plain text debug output (14,334 files observed)
│
├── downloads/                  # Download storage (purpose unclear)
│
├── file-history/               # File backups per session (91 sessions observed)
│   └── <sessionId>/            # Session-specific folder
│       └── <hash>@v<N>         # Versioned file backups
│
├── history.jsonl               # Command/input history with session references
│
├── ide/                        # IDE integration data
│   └── <pid>.lock              # Process locks (e.g., 36664.lock, 52990.lock)
│
├── output-styles/              # Custom output style definitions
│   └── <style-name>.md         # Markdown files with style instructions
│
├── plans/                      # Plan definitions (see Section 4.7)
│   └── <slug>.md               # Named plans (e.g., purrfect-stirring-platypus.md)
│
├── plugins/                    # Plugin system
│   ├── config.json             # Plugin configuration
│   ├── repos/                  # Plugin repository cache
│   └── <plugin-name>/          # Installed plugins
│       ├── .claude-plugin/     # Plugin metadata
│       ├── README.md
│       └── skills/             # Plugin-provided skills
│
├── projects/                   # Session files organized by project path
│   └── -<encoded-path>/        # Path with slashes as dashes
│       ├── <sessionId>.jsonl   # Regular session files
│       └── agent-<id>.jsonl    # Agent/subagent session files
│
├── session-env/                # Per-session environment (3,969 folders, all empty)
│   └── <sessionId>/            # Empty directory per session
│
├── session-extract/            # [USER-CREATED] Not part of Claude Code
│   └── consolidated/           # Custom extraction outputs
│
├── settings.json               # User settings (global)
├── settings.local.json         # Local settings override
│
├── shell-snapshots/            # Shell environment snapshots (10,537 files)
│   └── snapshot-<shell>-<timestamp>-<id>.sh
│
├── statsig/                    # Feature flag cache
│   ├── statsig.cached.evaluations.<hash>
│   ├── statsig.failed_logs.<hash>      # Failed log entries
│   ├── statsig.last_modified_time.evaluations
│   ├── statsig.session_id.<hash>
│   └── statsig.stable_id.<hash>
│
├── statusline-context.sh       # Custom status line script
│
└── todos/                      # Todo list state per session (17,161 files)
    ├── <sessionId>.json                    # Simple session todos
    └── <sessionId>-agent-<sessionId>.json  # Agent session todos
```

### File Counts Summary

| Location | Count | Purpose |
|----------|-------|---------|
| projects/\*\*/\*.jsonl | ~27,657 | Session conversation data |
| todos/\*.json | ~17,161 | Todo list state per session |
| debug/\*.txt | ~14,334 | Debug logs per session |
| agent-\*.jsonl | ~14,134 | Subagent session files |
| shell-snapshots/ | ~10,537 | Shell environment snapshots |
| session-env/ | ~3,969 | Empty folders (purpose unknown) |
| file-history/ | ~91 | Sessions with file backups |

---

## 3. Session File Specification

### File Location

**Pattern**: `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`

**Path Encoding Algorithm** [CONFIRMED]:
```
1. Take the absolute path
2. Replace all "/" with "-"
3. Result: /Users/foo/bar becomes -Users-foo-bar
```

**Session Assignment** [CONFIRMED]:
- Session is stored in folder matching the FIRST `cwd` value
- Changing directories mid-session does NOT move the file
- Entries within a session can have different `cwd` values

### JSONL Format

Each line is a complete, self-contained JSON object. No line continuations.

### Entry Types

#### 3.1 Type: `summary`

**Purpose**: Session metadata. When present, appears as first entry.

**Confidence**: LIKELY (summary entries are rare - ~0.15% of sessions)

**Schema**:
```typescript
interface SummaryEntry {
  type: "summary";
  summary: string;          // Human-readable session description
  leafUuid: string;         // UUID pointing to conversation head [SUSPECTED]
}
```

**Example**:
```json
{"type":"summary","summary":"Claude Code: Building Streaming Pipeline Foundation","leafUuid":"5abca538-7e87-43f3-b4f3-e89efcdd84af"}
```

**Notes**:
- Most sessions do NOT have a summary entry
- When present, appears as first entry in the file
- Multiple summary entries can exist in one session (updated as conversation progresses)
- `leafUuid` does NOT always match any entry's `uuid` in the file
- [SUSPECTED] May point to logical conversation head after branching

**First Entry Distribution** (observed):
- `queue-operation`: Majority of sessions
- `user`: Many agent sessions start directly with user entry
- `assistant`: Some agent sessions start directly with assistant entry
- `file-history-snapshot`: Some sessions start with file tracking
- `summary`: Rarely first, often NOT present at all

#### 3.2 Type: `user`

**Purpose**: User messages, including tool results.

**Confidence**: CONFIRMED

**Schema**:
```typescript
interface UserEntry {
  type: "user";
  uuid: string;              // Unique identifier for this entry
  parentUuid: string | null; // Previous entry in chain (null for first)
  sessionId: string;         // Session UUID
  cwd: string;               // Working directory at message time
  version: string;           // Claude Code version (e.g., "2.0.50")
  gitBranch: string;         // Current git branch
  isSidechain: boolean;      // True for agent/subagent sessions
  userType: "external";      // Always "external" observed
  timestamp: string;         // ISO 8601 timestamp
  message: {
    role: "user";
    content: string | ContentBlock[];
  };

  // Optional fields
  isMeta?: boolean;          // System-injected messages (not user-typed)
  slug?: string;             // Human-readable session slug
  agentId?: string;          // Present for agent sessions
  toolUseResult?: ToolResult; // Present when content has tool_result

  // Thinking control (observed in newer versions)
  thinkingMetadata?: {
    level: "high" | "low" | string;
    disabled: boolean;
    triggers: unknown[];
  };

  // Inline todo state (separate from external todo files)
  todos?: unknown[];
}

interface ToolResult {
  stdout: string;
  stderr: string;
  interrupted: boolean;
  isImage: boolean;
  returnCodeInterpretation?: string; // e.g., "No matches found"
  type?: "text";
  file?: FileResult;
}

interface FileResult {
  filePath: string;
  content: string;
  numLines: number;
  startLine: number;
  totalLines: number;
}
```

**Content Block Types for User**:
```typescript
type UserContentBlock =
  | string                    // Plain text
  | ToolResultBlock;

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;        // Matches tool_use.id from assistant
  content: string;
  is_error: boolean;
}
```

**isMeta Messages** [CONFIRMED]:
```json
{
  "type": "user",
  "isMeta": true,
  "message": {
    "role": "user",
    "content": "Caveat: The messages below were generated by the user while running local commands. DO NOT respond to these messages or otherwise consider them in your response unless the user explicitly asks you to."
  }
}
```

#### 3.3 Type: `assistant`

**Purpose**: Assistant responses, including tool calls.

**Confidence**: CONFIRMED

**Schema**:
```typescript
interface AssistantEntry {
  type: "assistant";
  uuid: string;
  parentUuid: string;
  sessionId: string;
  cwd: string;
  version: string;
  gitBranch: string;
  isSidechain: boolean;
  userType: "external";       // Also present on assistant entries
  timestamp: string;
  requestId: string;         // API request ID
  message: {
    model: string;           // e.g., "claude-sonnet-4-5-20250929"
    id: string;              // Message ID from API
    type: "message";
    role: "assistant";
    content: AssistantContentBlock[];
    stop_reason: "end_turn" | "tool_use" | "stop_sequence" | null;
    stop_sequence: string | null;
    usage: UsageData;
    context_management?: ContextManagement;
  };

  // Optional fields
  slug?: string;
  agentId?: string;
}

interface UsageData {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
  service_tier: "standard" | string;
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
}

interface ContextManagement {
  applied_edits: unknown[];
}
```

**Content Block Types for Assistant**:
```typescript
type AssistantContentBlock =
  | TextBlock
  | ToolUseBlock
  | ThinkingBlock;

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;                 // Unique ID for this tool call
  name: string;               // Tool name (e.g., "Bash", "Read", "Edit")
  input: Record<string, unknown>;
}

interface ThinkingBlock {
  type: "thinking";
  thinking: string;           // Extended thinking content
  signature: string;          // Cryptographic signature (base64)
}
```

**Stop Reason Values** [CONFIRMED]:
| Value | Meaning |
|-------|---------|
| `"end_turn"` | Final response, conversation turn complete |
| `"tool_use"` | Stopped to execute tool calls |
| `"stop_sequence"` | Hit a stop sequence |
| `null` | Streaming in progress (not final) |

**Version Differences** [UNVERIFIED]:
- Older versions may have all streaming entries with same stop_reason
- Newer versions may use `stop_reason: null` for streaming entries
- Exact version boundary unknown (speculation: somewhere around 2.0.45-2.0.50)
- Could not verify `stop_reason: null` in persisted files - may be transient state not persisted

#### 3.4 Type: `queue-operation`

**Purpose**: Internal lifecycle tracking.

**Confidence**: CONFIRMED

**Schema**:
```typescript
interface QueueOperationEntry {
  type: "queue-operation";
  operation: "enqueue" | "dequeue";
  timestamp: string;         // ISO 8601
  sessionId: string;
  content?: string;          // e.g., "context" for /context command
}
```

**Example**:
```json
{"type":"queue-operation","operation":"enqueue","timestamp":"2025-11-14T19:49:26.199Z","content":"context","sessionId":"550215d1-9af7-40ae-ba1b-69c425b03cb9"}
{"type":"queue-operation","operation":"dequeue","timestamp":"2025-11-14T19:49:26.200Z","sessionId":"550215d1-9af7-40ae-ba1b-69c425b03cb9"}
```

**Notes**:
- Always come in pairs (enqueue then dequeue)
- Used for slash commands like `/context`, `/cost`
- Sessions with ONLY queue-operation entries are likely abandoned

#### 3.5 Type: `file-history-snapshot`

**Purpose**: Track file state at points in conversation.

**Confidence**: CONFIRMED

**Schema**:
```typescript
interface FileHistorySnapshotEntry {
  type: "file-history-snapshot";
  messageId: string;
  isSnapshotUpdate: boolean;
  snapshot: {
    messageId: string;
    timestamp: string;
    trackedFileBackups: Record<string, FileBackupInfo>;
  };
}

interface FileBackupInfo {
  backupFileName: string | null;  // e.g., "541b0b61c1bb0007@v1"
  version: number;
  backupTime: string;
}
```

**Notes**:
- `backupFileName` references files in `~/.claude/file-history/<sessionId>/`
- `null` backupFileName indicates file tracked but no backup exists
- Multiple snapshots accumulate over conversation
- Can be first entry in a session (before user/assistant entries)

---

## 4. Metadata File Specifications

### 4.1 history.jsonl

**Location**: `~/.claude/history.jsonl`

**Purpose**: Track all user inputs/commands across all sessions.

**Confidence**: CONFIRMED

**Schema (older entries)**:
```typescript
interface HistoryEntryOld {
  display: string;           // What user typed
  pastedContents: Record<string, unknown>;
  timestamp: number;         // Unix timestamp in milliseconds
  project: string;           // Absolute path to project
}
```

**Schema (newer entries, includes sessionId)**:
```typescript
interface HistoryEntryNew {
  display: string;
  pastedContents: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;         // Session UUID
}
```

**Example**:
```json
{"display":"/context ","pastedContents":{},"timestamp":1764764730875,"project":"/Users/leemoore/code/codex-port-02","sessionId":"1deebc7c-fa3f-4ee4-b81e-7fde362974a5"}
```

**Notes**:
- ~3,509 entries observed
- Includes slash commands (/context, /cost, etc.)
- sessionId field added in later versions

### 4.2 session-env/

**Location**: `~/.claude/session-env/<sessionId>/`

**Purpose**: UNKNOWN - All observed folders are empty.

**Confidence**: SUSPECTED - Reserved for future use or environment variables

**Observed**: 3,969 empty directories

### 4.3 file-history/

**Location**: `~/.claude/file-history/<sessionId>/<hash>@v<N>`

**Purpose**: Store versioned backups of files modified during session.

**Confidence**: CONFIRMED

**Structure**:
```
file-history/
└── <sessionId>/
    ├── 541b0b61c1bb0007@v1
    ├── 541b0b61c1bb0007@v2
    ├── ...
    └── 541b0b61c1bb0007@v5
```

**File Content**: Raw file content (no metadata wrapper)

**Naming Convention**:
- Hash appears to be derived from file path
- `@v<N>` indicates version number
- Versions increment as file changes

### 4.4 todos/

**Location**: `~/.claude/todos/`

**Purpose**: Persist TodoWrite tool state per session.

**Confidence**: CONFIRMED

**Naming Patterns** (two observed):
1. `<sessionId>.json` - Simple session todos
2. `<sessionId>-agent-<sessionId>.json` - Agent session todos

**Content**: JSON array (empty array `[]` when no todos)

**Example**:
```json
[]
```

**Note**: User entries may also contain an inline `todos` field. The relationship between inline todos and external todo files is not fully documented.

### 4.5 debug/

**Location**: `~/.claude/debug/<sessionId>.txt`

**Purpose**: Debug logging for session.

**Confidence**: CONFIRMED

**Format**: Plain text with `[DEBUG]` and `[ERROR]` prefixes

**Example Content**:
```
[DEBUG] Watching for changes in setting files...
[DEBUG] [LSP MANAGER] initializeLspServerManager() called
[DEBUG] Loading skills from directories: managed=...
[ERROR] Failed to save config with lock: Error: Lock file is already being held
```

### 4.6 shell-snapshots/

**Location**: `~/.claude/shell-snapshots/snapshot-<shell>-<timestamp>-<id>.sh`

**Purpose**: Capture shell environment (aliases, functions, variables).

**Confidence**: CONFIRMED

**Format**: Shell script that can restore environment

**Example Filename**: `snapshot-zsh-1752619862231-hv5ze6.sh`

### 4.7 plans/

**Location**: `~/.claude/plans/<slug>.md`

**Purpose**: Store named plans created during sessions.

**Confidence**: CONFIRMED (structure observed, content format partially documented)

**Format**: Markdown file with structured content

**Example Structure**:
```markdown
# Context Utility MVP - Session Cloner

## Overview
[Plan description]

## Steps
1. First step
2. Second step
...
```

**Notes**:
- Slugs are auto-generated (e.g., `purrfect-stirring-platypus.md`)
- Plans can be referenced in future sessions
- Exact schema for plan content is not fully documented

### 4.8 agents/

**Location**: `~/.claude/agents/<agent-name>.md`

**Purpose**: Custom agent definitions (user-created).

**Confidence**: CONFIRMED (structure observed)

**Format**: Markdown file with YAML frontmatter

**Example**:
```markdown
---
name: senior-engineer
description: Use this agent when you need careful, thorough code review
model: opus
color: green
---

## Instructions

You are a senior engineer who...
```

**Frontmatter Fields**:
```typescript
interface AgentFrontmatter {
  name: string;           // Agent identifier
  description: string;    // When to use this agent
  model?: string;         // Model preference (e.g., "opus", "sonnet")
  color?: string;         // UI color indicator
}
```

---

## 5. Cross-Reference Map

### Session File References

```
Session File (<sessionId>.jsonl)
    │
    ├──> todos/<sessionId>.json
    │         OR todos/<sessionId>-agent-<sessionId>.json
    │         (TodoWrite tool state)
    │
    ├──> debug/<sessionId>.txt
    │         (Debug logs)
    │
    ├──> session-env/<sessionId>/
    │         (Empty, purpose unknown)
    │
    ├──> file-history/<sessionId>/
    │         (File backups, if files modified)
    │
    └──> history.jsonl
              (Command history entries with sessionId)
```

### Agent Session References

```
Main Session (<sessionId>.jsonl)
    │
    └──> Agent Session (agent-<agentId>.jsonl)
              │
              ├── isSidechain: true
              ├── agentId: "<short-id>"
              └── sessionId: "<parent-session-id>"
```

### File-History to Session Mapping

```
file-history-snapshot entry (in session file)
    │
    ├── snapshot.trackedFileBackups["<filepath>"].backupFileName
    │         = "<hash>@v<N>"
    │
    └──> file-history/<sessionId>/<hash>@v<N>
              (Actual file content backup)
```

---

## 6. Algorithms

### 6.1 Project Folder Assignment [CONFIRMED]

```
Input: Session with entries having various cwd values
Output: Project folder path

Algorithm:
1. Find first entry with cwd field (typically first user entry)
2. Take that cwd path
3. Replace "/" with "-"
4. Result is folder name under ~/.claude/projects/

Example:
  First entry cwd: "/Users/leemoore/code/codex-port-02"
  Folder: "-Users-leemoore-code-codex-port-02"
  Full path: ~/.claude/projects/-Users-leemoore-code-codex-port-02/
```

### 6.2 Session Discovery for /resume [SPECULATIVE]

```
Input: Current working directory
Output: List of resumable sessions

Algorithm (SPECULATIVE - no source code access):
1. Encode current directory to folder name
2. Scan ~/.claude/projects/<encoded-cwd>/*.jsonl
3. For each file:
   a. Read file to find session metadata
   b. Get file modification time
4. Sort by some criteria (modification time suspected)
5. Return list for selection

Notes:
- No index file discovered
- /resume only shows sessions from current directory's folder
- Moving session file breaks /resume discovery
- Summary entries are rare, so discovery likely does NOT rely on them
```

**What is NOT known:**
- Exact sort order
- Whether leafUuid is used
- How abandoned sessions are filtered
- Maximum sessions shown

### 6.3 Turn Detection [CONFIRMED]

```
Definition: A "turn" is one user submission through final assistant response.

Turn Start:
  - user entry with content type string (not tool_result)
  - NOT entries with isMeta: true

Turn End:
  - assistant entry with stop_reason: "end_turn"

Within Turn (same turn):
  - user entries with tool_result content (tool responses)
  - assistant entries with stop_reason: "tool_use" or null
```

### 6.4 UUID Chain Traversal

```
Algorithm: Build conversation history

1. Start from last entry (bottom of file)
2. Follow parentUuid backwards
3. Build ordered list

Edge Cases:
- First user entry has parentUuid: null
- Branching: Multiple entries can share same parentUuid
- leafUuid in summary may indicate current branch head
- Some leafUuids match entry uuids, others do not
```

---

## 7. Agent Sessions

### Naming Convention

**Pattern**: `agent-<agentId>.jsonl` where agentId is 8 hex characters

**Example**: `agent-3569d9ad.jsonl`

### Distinguishing Fields

```typescript
interface AgentSessionEntry {
  isSidechain: true;       // Always true for agent sessions
  agentId: string;         // Short ID matching filename
  sessionId: string;       // Can reference parent session
}
```

### Relationship to Parent Session

- Agent sessions stored in SAME project folder as parent
- sessionId in agent entries may point to parent session
- Agent entries have `isSidechain: true`

### First Entry Variability

Agent sessions have inconsistent first entry types:
- Some start with `user` entry (often with "Warmup" content)
- Some start directly with `assistant` entry (no user entry first)

This differs from main sessions and affects parsing logic.

---

## 8. Settings Files

### 8.1 settings.json (Global)

**Location**: `~/.claude/settings.json`

**Schema**:
```typescript
interface Settings {
  cleanupPeriodDays: number;      // Days before cleanup
  env: Record<string, string>;    // Environment overrides
  permissions: {
    allow: string[];
    deny: string[];
  };
  hooks: Record<string, unknown>;
  statusLine?: StatusLineConfig;
  alwaysThinkingEnabled?: boolean;
  feedbackSurveyState?: {
    lastShownTime: number;
  };
}
```

### 8.2 settings.local.json (Project-level)

**Location**: `<project>/.claude/settings.local.json` OR `~/.claude/settings.local.json`

**Schema**:
```typescript
interface LocalSettings {
  permissions: {
    allow: string[];
    deny: string[];
    ask?: string[];
  };
  enableAllProjectMcpServers?: boolean;
}
```

**Permission Format Examples**:
```json
[
  "Bash(git checkout:*)",
  "WebFetch(domain:docs.anthropic.com)",
  "Bash(npm run lint)",
  "mcp__firecrawl__firecrawl_scrape"
]
```

---

## 9. Known Issues and Edge Cases

### 9.1 Empty Session Files

**Observation**: Many 0-byte .jsonl files exist

**Likely Cause**: Sessions started but immediately cancelled

**Impact**: Safe to ignore or delete

### 9.2 Stub Files (~298 bytes)

**Observation**: Small files containing only summary or queue-operation entries

**Content Examples**:
- Just summary entry
- Just queue-operation pair
- file-history-snapshot only

**Likely Cause**:
- Sessions started with slash command, no actual conversation
- [SUSPECTED] May be stubs created when session moves to different folder

### 9.3 Session Discovery After Directory Change

**Observation**: If user `cd`s to different directory and continues session:
1. Session file stays in original project folder
2. New entries have different `cwd` values
3. /resume from new directory won't find the session

**Impact**: Users may lose access to sessions via /resume

**Workaround**: Know the session ID and manually navigate

### 9.4 leafUuid Inconsistency

**Observation**: summary.leafUuid sometimes matches entry uuids, sometimes does not

**Verified Behavior**:
- Some leafUuids DO match entry uuids in the file
- Some leafUuids do NOT match any entry's uuid

**Hypotheses**:
1. Points to "virtual" position in conversation graph
2. References deleted/compacted entries
3. Used for branching scenarios

**Status**: PARTIALLY UNDERSTOOD - needs more investigation

---

## 10. Known Gaps and Limitations

This specification does NOT cover the following areas:

### 10.1 Plugin System Details

- Plugin discovery mechanism
- Plugin registration/activation
- Skills loading from plugins
- Plugin configuration schema beyond basic `config.json`

### 10.2 Output Styles Format

- `~/.claude/output-styles/<name>.md` file format
- How output styles are applied
- Available style options

### 10.3 IDE Integration

- Lock file creation/cleanup timing
- How concurrent Claude Code instances coordinate
- IDE-specific session handling

### 10.4 Path Encoding Edge Cases

Not tested or verified:
- Paths containing spaces
- Paths with Unicode characters
- Very long paths (>255 characters)
- Paths ending in slash
- Paths with special characters

### 10.5 Cleanup/Garbage Collection

- Whether `cleanupPeriodDays` actually triggers cleanup
- What gets cleaned up (sessions, todos, debug logs, file-history?)
- The cleanup algorithm and schedule
- Whether cleanup is automatic or manual

### 10.6 Branching Behavior

- How Claude Code handles conversation branches
- How branch selection works in /resume
- Whether leafUuid controls active branch
- Cloning behavior and parent references

### 10.7 MCP Server Integration

- MCP server configuration storage
- How MCP permissions are persisted
- Server discovery and initialization

### 10.8 statsig Feature Flags

- What feature flags are tracked
- How to interpret cached evaluations
- Hash suffix meanings
- Failed log handling

---

## 11. Confidence Levels Summary

### CONFIRMED (Verified through multiple observations)

- Directory structure and encoding scheme
- Session file JSONL format
- Entry type schemas (user, assistant, queue-operation, file-history-snapshot)
- UUID chain mechanism
- Turn detection logic
- file-history backup structure
- settings.json/settings.local.json formats
- isMeta field behavior
- Agent session naming and fields
- Both todo file naming patterns
- Agent definition frontmatter format

### LIKELY (Strong evidence but not definitive)

- Session assignment based on first cwd
- cleanupPeriodDays triggers auto-cleanup
- leafUuid relates to conversation branching
- Summary entry appears first when present

### SPECULATIVE (Limited evidence, significant uncertainty)

- /resume discovery algorithm details
- Session sort order in /resume
- Stub file creation triggers

### UNVERIFIED (Claims made but could not verify)

- stop_reason:null in persisted files (may be transient state only)
- Version boundary for streaming behavior changes
- Exact garbage collection algorithm

### UNKNOWN (No evidence)

- Complete MCP server integration format
- IDE integration (.lock files) specifics
- statsig feature flag usage details
- Plugin system internals
- Output styles format

---

## 12. Appendix: Sample Data

### A. Complete Small Session File

```jsonl
{"type":"queue-operation","operation":"enqueue","timestamp":"2025-11-13T22:18:57.294Z","content":"context","sessionId":"0053e3fd-6057-466d-8c5b-0619c9607aa3"}
{"type":"queue-operation","operation":"dequeue","timestamp":"2025-11-13T22:18:57.294Z","sessionId":"0053e3fd-6057-466d-8c5b-0619c9607aa3"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/leemoore/code/codex-port-02","sessionId":"0053e3fd-6057-466d-8c5b-0619c9607aa3","version":"2.0.37","gitBranch":"main","type":"user","message":{"role":"user","content":"context"},"uuid":"1db2df87-71ae-46cf-96f0-648599826c69","timestamp":"2025-11-13T22:18:57.302Z"}
{"parentUuid":"1db2df87-71ae-46cf-96f0-648599826c69","isSidechain":false,"userType":"external","cwd":"/Users/leemoore/code/codex-port-02","sessionId":"0053e3fd-6057-466d-8c5b-0619c9607aa3","version":"2.0.37","gitBranch":"main","message":{"model":"claude-sonnet-4-5-20250929","id":"msg_01JTwWHnjvhnv6FemYQQrqRV","type":"message","role":"assistant","content":[{"type":"text","text":"I'm ready to help..."}],"stop_reason":"end_turn","stop_sequence":null,"usage":{"input_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":28443,"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0},"output_tokens":253,"service_tier":"standard"}},"requestId":"req_011CV6fXHsTmG6W24aFLeBXL","type":"assistant","uuid":"9beadacd-5be1-4eba-b484-ccadfbc17a8a","timestamp":"2025-11-13T22:19:06.543Z"}
```

### B. Tool Use Sequence

```jsonl
// Assistant requests tool
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_012SsGR4YvLeyohVmpsai4k3","name":"Bash","input":{"command":"find /Users/leemoore/code -type f -name \"*.ts\" | head -5"}}],"stop_reason":"tool_use"}}

// User provides result
{"type":"user","message":{"content":[{"tool_use_id":"toolu_012SsGR4YvLeyohVmpsai4k3","type":"tool_result","content":"/Users/leemoore/code/foo.ts\n/Users/leemoore/code/bar.ts","is_error":false}]},"toolUseResult":{"stdout":"/Users/leemoore/code/foo.ts\n/Users/leemoore/code/bar.ts","stderr":"","interrupted":false,"isImage":false}}
```

### C. Thinking Block Example

```jsonl
{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"Let me analyze this carefully...","signature":"Es4GCkYIChgC...GQAE="}]}}
```

### D. Agent Session Entry

```jsonl
{"parentUuid":null,"isSidechain":true,"userType":"external","cwd":"/Users/leemoore/code/codex-port-02","sessionId":"2886488b-7a58-4728-ac91-fc806456cf39","version":"2.0.50","gitBranch":"main","agentId":"3569d9ad","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'm ready to help..."}]}}
```

### E. User Entry with thinkingMetadata

```jsonl
{"type":"user","thinkingMetadata":{"level":"high","disabled":false,"triggers":[]},"todos":[],"uuid":"...","parentUuid":"...","message":{"role":"user","content":"..."}}
```

---

## 13. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-03 | Claude Code Analysis | Initial comprehensive analysis |
| 1.1.0 | 2025-12-03 | Claude Code (Correction) | Applied corrections from self-critique and independent review: Fixed summary entry "always first" claim; Added thinkingMetadata/todos to UserEntry; Added userType to AssistantEntry; Downgraded session discovery to SPECULATIVE; Marked stop_reason:null as UNVERIFIED; Added plans/agents format documentation; Documented both todo naming patterns; Added statsig.failed_logs pattern; Added Known Gaps section (Section 10); Updated confidence levels throughout |

---

## 14. Future Investigation Areas

1. **leafUuid mechanism**: Determine exact purpose and relationship to conversation branching
2. **session-env purpose**: Monitor for future use or discover hidden purpose
3. **Stub file creation**: Confirm when/why stub files are created
4. **MCP server integration**: Document how MCP server configs are stored/used
5. **IDE lock files**: Understand process coordination mechanism
6. **statsig feature flags**: Map flag IDs to feature names
7. **Path encoding edge cases**: Test spaces, unicode, long paths
8. **Cleanup mechanism**: Verify if/when automatic cleanup occurs
9. **Plugin system**: Document plugin loading and skill discovery
10. **Inline vs external todos**: Clarify relationship between `todos` field and `~/.claude/todos/` files
