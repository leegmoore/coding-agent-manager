# GitHub Copilot Chat Session Storage Formats Specification

Version: 1.0.0
Last Updated: 2025-12-11
Analysis Based On: VS Code Extension `GitHub.copilot-chat` version 0.33.5

---

## 1. Executive Summary

### Key Findings

- **Session files** are stored as JSON (single JSON object) in VS Code's workspaceStorage
- **Location**: `~/Library/Application Support/Code/User/workspaceStorage/<workspace-hash>/chatSessions/<session-uuid>.json`
- **Workspace mapping**: Each workspace folder gets a unique hash-named folder containing a `workspace.json` that maps to the folder path
- **Session structure**: Single JSON document with metadata header and `requests[]` array containing all conversation turns
- **Tool invocations**: Stored inline within response arrays with detailed serialization
- **Editing sessions**: Separate `chatEditingSessions/` folder stores file modification snapshots

### Critical Observations for Tooling

1. **Single JSON document** - Unlike Claude Code's JSONL format, each session is one complete JSON object
2. **Workspace-based organization** - Sessions organized by VS Code workspace hash, not by project path directly
3. **Rich tool metadata** - Tool invocations include full serialization with confirmation states, timing, and results
4. **Multiple session types** - `chatSessions/` for conversations, `chatEditingSessions/` for file edit states
5. **Model information** - Each request includes the model ID used (e.g., `copilot/claude-opus-4.5`)
6. **MCP server integration** - Sessions track MCP server startup states
7. **Code citations** - Built-in support for tracking code source citations

### Comparison with Claude Code Format

| Aspect | GitHub Copilot | Claude Code |
|--------|----------------|-------------|
| File format | Single JSON | JSONL (one object per line) |
| Organization | By workspace hash | By encoded project path |
| Session ID | UUID in filename | UUID in filename |
| Turn structure | `requests[]` array | Sequential entries with `parentUuid` chain |
| Tool calls | Inline in `response[]` | Separate user/assistant entries |
| File edits | Separate `chatEditingSessions/` | Inline in session file |
| Metadata | Header fields | `summary` entry type |

---

## 2. Directory Reference

### Complete Storage Structure

```
~/Library/Application Support/Code/User/workspaceStorage/
├── <workspace-hash>/                    # MD5-like hash of workspace folder
│   ├── workspace.json                   # Maps hash to folder URI
│   ├── state.vscdb                      # VS Code workspace state database
│   ├── state.vscdb.backup               # Backup of state database
│   │
│   ├── chatSessions/                    # Chat conversation sessions
│   │   └── <session-uuid>.json          # Individual session files
│   │
│   └── chatEditingSessions/             # File editing session data
│       └── <session-uuid>/              # Per-session editing folder
│           ├── state.json               # Edit session state (large)
│           └── contents/                # File snapshots
│               └── <short-hash>         # Individual file content snapshots
```

### workspace.json Format

```json
{
  "folder": "file:///Users/username/code/project-name"
}
```

**Purpose**: Maps the workspace hash folder name back to the actual filesystem path.

---

## 3. Session File Specification

### File Location

**Pattern**: `~/Library/Application Support/Code/User/workspaceStorage/<hash>/chatSessions/<session-uuid>.json`

**Platform Variations**:
- **macOS**: `~/Library/Application Support/Code/User/workspaceStorage/`
- **Windows**: `%APPDATA%\Code\User\workspaceStorage\`
- **Linux**: `~/.config/Code/User/workspaceStorage/`

### Top-Level Session Schema

```typescript
interface CopilotChatSession {
  // Format version
  version: number;                        // Currently 3

  // User identity
  requesterUsername: string;              // GitHub username
  requesterAvatarIconUri: UriObject;      // GitHub avatar URL

  // Responder identity
  responderUsername: string;              // "GitHub Copilot"
  responderAvatarIconUri: IconReference;  // { id: "copilot" }

  // UI state
  initialLocation: "panel" | "editor";    // Where chat was initiated

  // Conversation content
  requests: ChatRequest[];                // Array of all conversation turns

  // Session metadata
  sessionId: string;                      // UUID matching filename
  creationDate: number;                   // Unix timestamp (milliseconds)
  lastMessageDate: number;                // Unix timestamp (milliseconds)
  isImported: boolean;                    // Whether session was imported
  customTitle?: string;                   // User-assigned or auto-generated title
}

interface UriObject {
  $mid: number;                           // VS Code internal marker
  path: string;                           // URI path component
  scheme: string;                         // "https", "file", etc.
  authority?: string;                     // Domain for HTTPS URIs
  query?: string;                         // Query parameters
  external?: string;                      // Full external URI
}

interface IconReference {
  id: string;                             // Icon identifier
}
```

---

## 4. Request/Response Structure

### ChatRequest Schema

Each conversation turn is represented as a `ChatRequest` object:

```typescript
interface ChatRequest {
  // Identifiers
  requestId: string;                      // "request_<uuid>" format
  responseId: string;                     // "response_<uuid>" format

  // User input
  message: UserMessage;
  variableData: VariableData;

  // AI response
  response: ResponseItem[];               // Array of response components
  result: RequestResult;                  // Timing, metadata, tool results

  // Status
  isCanceled: boolean;
  followups: unknown[];                   // Follow-up suggestions
  timestamp: number;                      // Unix timestamp (milliseconds)

  // Model and agent info
  modelId: string;                        // e.g., "copilot/claude-opus-4.5"
  agent: AgentInfo;                       // Extension/agent details

  // Additional data
  responseMarkdownInfo: MarkdownInfo[];
  contentReferences: ContentReference[];
  codeCitations: CodeCitation[];
}
```

### UserMessage Schema

```typescript
interface UserMessage {
  text: string;                           // Full message text
  parts: MessagePart[];                   // Structured message parts
}

interface MessagePart {
  range: {
    start: number;                        // Character offset start
    endExclusive: number;                 // Character offset end
  };
  editorRange: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  text: string;                           // Part text content
  kind: "text" | "file" | "selection";    // Part type
}

interface VariableData {
  variables: Variable[];                  // Referenced variables/context
}

interface Variable {
  name: string;
  value: string;
  range?: Range;
}
```

---

## 5. Response Item Types

The `response` array contains various item types that represent different aspects of the AI response:

### 5.1 MCP Server Starting

```typescript
interface McpServersStartingItem {
  kind: "mcpServersStarting";
  didStartServerIds: string[];            // IDs of servers that started
}
```

### 5.2 Text Response

```typescript
interface TextResponseItem {
  value: string;                          // Markdown text content
  supportThemeIcons: boolean;
  supportHtml: boolean;
  baseUri: UriObject;                     // Base URI for relative references
}
```

### 5.3 Tool Invocation Preparation

```typescript
interface PrepareToolInvocationItem {
  kind: "prepareToolInvocation";
  toolName: string;                       // Tool being prepared
}
```

### 5.4 Tool Invocation Serialized

```typescript
interface ToolInvocationSerializedItem {
  kind: "toolInvocationSerialized";
  invocationMessage: string | LocalizedString;
  pastTenseMessage?: string | LocalizedString;
  isConfirmed: ConfirmationState;
  isComplete: boolean;
  source: ToolSource;
  toolCallId: string;                     // UUID for this tool call
  toolId: string;                         // Tool identifier
  toolSpecificData?: ToolSpecificData;    // Tool-specific payload
}

interface ConfirmationState {
  type: 0 | 1 | 4;                        // 0=pending, 1=confirmed, 4=auto-approved
}

interface ToolSource {
  type: "internal" | "mcp" | "extension";
  label: string;                          // "Built-In", server name, etc.
}
```

### 5.5 Tool-Specific Data Types

#### Terminal Tool

```typescript
interface TerminalToolData {
  kind: "terminal";
  terminalToolSessionId: string;
  terminalCommandId: string;
  commandLine: {
    original: string;                     // Original command
    toolEdited?: string;                  // Simplified display version
  };
  language: "sh" | "bash" | "zsh";
  autoApproveInfo?: LocalizedString;      // Auto-approval rule info
}
```

#### Todo List Tool

```typescript
interface TodoListToolData {
  kind: "todoList";
  sessionId: string;
  todoList: TodoItem[];
}

interface TodoItem {
  id: string;
  title: string;
  description: string;
  status: "not-started" | "in-progress" | "completed";
}
```

---

## 6. Request Result Schema

```typescript
interface RequestResult {
  timings: {
    firstProgress: number;                // ms to first response
    totalElapsed: number;                 // Total request duration ms
  };
  metadata: RequestMetadata;
  details: string;                        // e.g., "Claude Opus 4.5 (Preview) • 3x"
}

interface RequestMetadata {
  // Code blocks extracted from response
  codeBlocks: CodeBlock[];

  // Rendered prompts sent to model
  renderedUserMessage: RenderedMessage[];
  renderedGlobalContext?: RenderedMessage[];

  // Tool execution tracking
  toolCallRounds: ToolCallRound[];
  toolCallResults?: Record<string, ToolCallResult>;

  // Session tracking
  cacheKey: string;                       // Workspace URI
  modelMessageId: string;
  responseId: string;
  sessionId: string;
  agentId: string;                        // e.g., "github.copilot.editsAgent"
}

interface CodeBlock {
  code: string;
  language: string;
  markdownBeforeBlock: string;
}

interface RenderedMessage {
  type: 1 | 3;                            // 1=text content, 3=cache directive
  text?: string;                          // For type 1
  cacheType?: "ephemeral";                // For type 3
}

interface ToolCallRound {
  response: string;                       // Text response before/between tools
  toolCalls: ToolCall[];
  toolInputRetry: number;
  id: string;
}

interface ToolCall {
  name: string;                           // Tool name
  arguments: string;                      // JSON-encoded arguments
  id: string;                             // Tool call ID (toolu_* format)
}

interface ToolCallResult {
  $mid: number;
  content: ToolResultContent[];
}

interface ToolResultContent {
  $mid: number;
  value: string | StructuredValue;
}
```

---

## 7. Agent Information

```typescript
interface AgentInfo {
  extensionId: ExtensionId;
  extensionVersion: string;               // e.g., "0.33.5"
  publisherDisplayName: string;           // "GitHub"
  extensionPublisherId: string;           // "GitHub"
  extensionDisplayName: string;           // "GitHub Copilot Chat"
  id: string;                             // Agent identifier
  description: string;
  when: string;                           // Activation condition
  metadata: AgentMetadata;
  name: string;                           // Short name
  fullName: string;                       // Display name
  isDefault: boolean;
  locations: ("panel" | "editor")[];
  modes: ("agent" | "chat")[];
  slashCommands: SlashCommand[];
  disambiguation: unknown[];
}

interface ExtensionId {
  value: string;                          // e.g., "GitHub.copilot-chat"
  _lower: string;                         // Lowercase version
}

interface AgentMetadata {
  themeIcon: { id: string };
  hasFollowups: boolean;
  supportIssueReporting: boolean;
}

interface SlashCommand {
  name: string;                           // Command name without /
}
```

---

## 8. Known Tool Names

Based on observed sessions, the following tools are available:

| Tool ID | Description |
|---------|-------------|
| `run_in_terminal` | Execute shell commands in terminal |
| `get_terminal_output` | Read output from background terminal |
| `copilot_readFile` | Read file contents |
| `copilot_listDirectory` | List directory contents |
| `manage_todo_list` | Create/update todo items |
| `runSubagent` | Launch a sub-agent for complex tasks |
| `replace_string_in_file` | Edit file by string replacement |
| `multi_replace_string_in_file` | Multiple simultaneous edits |

---

## 9. Chat Editing Sessions

### Directory Structure

When Copilot makes file edits, a parallel editing session is created:

```
chatEditingSessions/
└── <session-uuid>/              # Matches chatSessions UUID
    ├── state.json               # Full edit state (can be large, 2MB+)
    └── contents/                # File content snapshots
        ├── 009cd85              # Short hash filenames
        ├── 0558ced
        └── ...
```

### Contents Files

Each file in `contents/` is a snapshot of a file at a point in time. The filenames appear to be truncated hashes of the file path or content.

**Content Format**: Raw file content (not JSON wrapped)

### state.json

The `state.json` file contains the full editing session state including:
- Edit history
- File mappings
- Undo/redo state
- Diff information

**Note**: This file can be very large (2MB+) for sessions with many edits.

---

## 10. Rendered Context Structure

Copilot constructs rich context prompts that include:

### Environment Info Block

```xml
<environment_info>
The user's current OS is: macOS
The user's default shell is: "zsh". When you generate terminal commands, please generate them correctly for this shell.
</environment_info>
```

### Workspace Info Block

```xml
<workspace_info>
I am working in a workspace with the following folders:
- /Users/username/code/project-name
I am working in a workspace that has the following structure:
```
package.json
src/
  ...
```
</workspace_info>
```

### Context Block

```xml
<context>
The current date is December 11, 2025.
Terminals:
Terminal: zsh
Last Command: npm test
Cwd: /Users/username/project
Exit Code: 0
</context>
```

### Editor Context Block

```xml
<editorContext>
The user's current file is /path/to/file.ts. The current selection is from line 1 to line 50.
</editorContext>
```

### Repository Context Block

```xml
<repoContext>
Repository name: project-name
Owner: username
Current branch: main
</repoContext>
```

### Reminder Instructions Block

```xml
<reminderInstructions>
When using the replace_string_in_file tool...
Do NOT create a new markdown file to document each change...
</reminderInstructions>
```

### User Request Block

```xml
<userRequest>
The actual user message here
</userRequest>
```

---

## 11. Cross-Reference Map

### Session to Workspace Mapping

```
Workspace Folder (/Users/username/code/project)
    │
    └── workspace.json (in hash-named folder)
            │
            └──> chatSessions/
                    │
                    └── <session-uuid>.json
                            │
                            ├── requests[].result.metadata.cacheKey
                            │     = "file:///Users/username/code/project"
                            │
                            └── requests[].result.metadata.sessionId
                                  = "<model-session-id>" (different from file UUID)
```

### Session to Editing Session Mapping

```
chatSessions/<session-uuid>.json
    │
    └──> chatEditingSessions/<session-uuid>/
            │
            ├── state.json (edit history)
            └── contents/<hash> (file snapshots)
```

---

## 12. Turn Detection

### Definition

A "turn" in GitHub Copilot sessions is represented by a single `ChatRequest` object in the `requests[]` array. Unlike Claude Code where turns are tracked via `parentUuid` chains, Copilot uses array ordering.

### Turn Counting

```typescript
function countTurns(session: CopilotChatSession): number {
  return session.requests.length;
}
```

### Turn Identification

- **Request start**: User submits message (stored in `message`)
- **Response**: AI response components (stored in `response[]`)
- **Completion**: `result.timings.totalElapsed` indicates request finished
- **Cancellation**: `isCanceled: true` indicates user stopped the request

---

## 13. Model Identification

### Model ID Format

```
copilot/<model-name>

Examples:
- copilot/claude-opus-4.5
- copilot/gpt-4
- copilot/claude-3.5-sonnet
```

### Model Selection

The model used for each request is stored in `request.modelId`. The model can vary between requests in the same session.

---

## 14. Differences from Claude Code Sessions

### Structural Differences

| Aspect | GitHub Copilot | Claude Code |
|--------|----------------|-------------|
| Format | Single JSON object | JSONL (newline-delimited) |
| Entry linking | Array index order | `uuid`/`parentUuid` chain |
| Session discovery | Via `workspace.json` mapping | Folder name encodes path |
| Tool results | Inline in `toolCallResults` | Separate `user` entry with `tool_result` |
| Thinking blocks | Not supported | `thinking` type in content |
| File history | Separate `chatEditingSessions/` | `file-history-snapshot` entries |
| Summary/Title | `customTitle` field | `summary` entry type |

### Content Differences

| Aspect | GitHub Copilot | Claude Code |
|--------|----------------|-------------|
| User message | `message.text` + `message.parts[]` | `message.content` (string or array) |
| AI response | `response[]` array with typed items | `message.content[]` array |
| Tool calls | `toolCallRounds[].toolCalls[]` | `tool_use` content blocks |
| Usage stats | Not stored (computed server-side) | `message.usage` object |
| Stop reason | Not stored | `message.stop_reason` |

### Organizational Differences

| Aspect | GitHub Copilot | Claude Code |
|--------|----------------|-------------|
| Base path | `~/Library/Application Support/Code/User/workspaceStorage/` | `~/.claude/projects/` |
| Folder naming | MD5-like hash | Encoded path (`-Users-name-project`) |
| Session files | `chatSessions/<uuid>.json` | `<uuid>.jsonl` |
| Agent sessions | Same location | `agent-<agentId>.jsonl` |
| Metadata files | In same workspace folder | Separate `todos/`, `debug/`, etc. |

---

## 15. Parsing Considerations for Tooling

### Loading a Session

```typescript
// Load GitHub Copilot session
async function loadCopilotSession(path: string): Promise<CopilotChatSession> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content);
}

// Compare with Claude Code loading
async function loadClaudeSession(path: string): Promise<ClaudeSessionEntry[]> {
  const content = await fs.readFile(path, 'utf-8');
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}
```

### Extracting First User Message

```typescript
function getFirstUserMessage(session: CopilotChatSession): string {
  if (session.requests.length === 0) return "(No messages)";
  return session.requests[0].message.text.slice(0, 100);
}
```

### Counting Turns

```typescript
function getTurnCount(session: CopilotChatSession): number {
  return session.requests.filter(r => !r.isCanceled).length;
}
```

### Extracting Tool Calls

```typescript
function getToolCalls(session: CopilotChatSession): ToolCall[] {
  const tools: ToolCall[] = [];
  for (const request of session.requests) {
    for (const round of request.result?.metadata?.toolCallRounds ?? []) {
      tools.push(...round.toolCalls);
    }
  }
  return tools;
}
```

---

## 16. Workspace Discovery

### Finding All Workspaces

```typescript
async function discoverWorkspaces(baseDir: string): Promise<WorkspaceInfo[]> {
  const workspaces: WorkspaceInfo[] = [];
  const entries = await fs.readdir(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const workspaceJsonPath = path.join(baseDir, entry.name, 'workspace.json');
    try {
      const content = await fs.readFile(workspaceJsonPath, 'utf-8');
      const data = JSON.parse(content);
      workspaces.push({
        hash: entry.name,
        folder: data.folder,
        path: new URL(data.folder).pathname
      });
    } catch {
      // Skip folders without workspace.json
    }
  }

  return workspaces;
}
```

### Finding Sessions in Workspace

```typescript
async function findSessions(workspaceDir: string): Promise<string[]> {
  const sessionsDir = path.join(workspaceDir, 'chatSessions');
  try {
    const files = await fs.readdir(sessionsDir);
    return files.filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }
}
```

---

## 17. Known Gaps and Limitations

### Not Fully Documented

1. **state.json format** - Full editing session state structure
2. **Content hash algorithm** - How file snapshot hashes are generated
3. **Cache types** - Complete list of `cacheType` values
4. **Confirmation types** - Full range of `isConfirmed.type` values
5. **MCP server integration** - How custom MCP servers appear in sessions
6. **Extension tools** - Schema for extension-provided tools
7. **Structured tool results** - Complete `StructuredValue` types

### Platform Differences

- Path structures may vary by OS
- Database formats (`.vscdb`) are VS Code internal

### Version Compatibility

- Schema `version: 3` is documented here
- Earlier versions may have different structures
- Future versions may add fields

---

## 18. Appendix: Sample Data

### A. Minimal Session

```json
{
  "version": 3,
  "requesterUsername": "username",
  "requesterAvatarIconUri": {
    "$mid": 1,
    "path": "/u/12345",
    "scheme": "https",
    "authority": "avatars.githubusercontent.com"
  },
  "responderUsername": "GitHub Copilot",
  "responderAvatarIconUri": { "id": "copilot" },
  "initialLocation": "panel",
  "requests": [],
  "sessionId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "creationDate": 1733900000000,
  "lastMessageDate": 1733900000000,
  "isImported": false
}
```

### B. Text-Only Request

```json
{
  "requestId": "request_uuid-here",
  "message": {
    "text": "Hello, how are you?",
    "parts": [{
      "range": { "start": 0, "endExclusive": 19 },
      "editorRange": {
        "startLineNumber": 1,
        "startColumn": 1,
        "endLineNumber": 1,
        "endColumn": 20
      },
      "text": "Hello, how are you?",
      "kind": "text"
    }]
  },
  "variableData": { "variables": [] },
  "response": [{
    "kind": "mcpServersStarting",
    "didStartServerIds": []
  }, {
    "value": "Hello! I'm doing well, thank you for asking.",
    "supportThemeIcons": false,
    "supportHtml": false,
    "baseUri": { "$mid": 1, "path": "/workspace/", "scheme": "file" }
  }],
  "responseId": "response_uuid-here",
  "result": {
    "timings": { "firstProgress": 1500, "totalElapsed": 3000 },
    "metadata": { ... },
    "details": "Claude Opus 4.5 (Preview)"
  },
  "isCanceled": false,
  "followups": [],
  "timestamp": 1733900000000,
  "modelId": "copilot/claude-opus-4.5",
  "agent": { ... }
}
```

### C. Tool Call Example

```json
{
  "response": [
    { "kind": "mcpServersStarting", "didStartServerIds": [] },
    { "kind": "prepareToolInvocation", "toolName": "run_in_terminal" },
    {
      "kind": "toolInvocationSerialized",
      "invocationMessage": "Using \"Run in Terminal\"",
      "isConfirmed": { "type": 1 },
      "isComplete": true,
      "source": { "type": "internal", "label": "Built-In" },
      "toolSpecificData": {
        "kind": "terminal",
        "terminalToolSessionId": "session-uuid",
        "terminalCommandId": "tool-uuid",
        "commandLine": { "original": "npm run dev" },
        "language": "sh"
      },
      "toolCallId": "uuid-here",
      "toolId": "run_in_terminal"
    },
    {
      "value": "The server is now running at http://localhost:3000",
      "supportThemeIcons": false,
      "supportHtml": false,
      "baseUri": { ... }
    }
  ]
}
```

---

## 19. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-11 | Analysis | Initial specification based on VS Code extension 0.33.5 |

---

## 20. Future Investigation Areas

1. **state.json schema** - Full editing session state structure
2. **Multi-workspace sessions** - How sessions span multiple folders
3. **Session import/export** - Format for imported sessions
4. **Extension tool schemas** - Documentation for custom extension tools
5. **Version migration** - How older session versions are upgraded
6. **Sync behavior** - Whether/how sessions sync across devices
7. **Garbage collection** - How old sessions are cleaned up
