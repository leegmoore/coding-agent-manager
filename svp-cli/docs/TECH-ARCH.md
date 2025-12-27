# SVP CLI - Technical Architecture

## Overview

This document defines the technical architecture for SVP CLI v1. Scope has been narrowed to session management only, based on review feedback.

---

## Non-Functional Requirements

### Performance
- **Startup time:** <500ms (realistic target)
- **Stats command:** <200ms
- **Clone operation:** <2s for sessions up to 50MB
- **Memory:** <50MB for normal operation

### Reliability
- **Graceful errors:** Clear messages with context
- **Atomic writes:** Temp file + rename pattern
- **Safe operations:** Clone creates new files, never modifies originals

### Security
- **No credentials in config files** - env vars only
- **UUID validation** - all session IDs validated before file operations
- **Safe shell execution** - spawn() with arrays, never exec() with strings
- **Enterprise-safe** - innocuous naming, minimal dependencies
- **File permissions** - respect system defaults, document recommendations

### Usability (Agent-Focused)
- **Predictable I/O:** Human-readable default, `--json` for structured
- **Zero interactivity:** Never prompt, never hang
- **Clear errors:** What failed, why, and where we looked

### Portability
- **Platforms:** macOS, Linux (Windows deferred)
- **Node version:** 20+ (LTS)
- **No native dependencies** - pure JavaScript/TypeScript

---

## Technology Stack

### Language & Runtime
- **TypeScript 5.x** - Type safety
- **Node.js 20+** - Native fetch, good performance
- **ESM modules** - Modern imports

### CLI Framework
- **Commander.js** - Simple, well-documented, small footprint

### Build
- **tsup** - Fast bundling, single file output
- Target: single `svp.js` file for easy distribution

### Testing
- **Vitest** - Compatible with existing codebase

### Dependencies (Minimal)
- `commander` - CLI framework
- That's it for runtime. Everything else is dev dependencies.

---

## Architecture

### Directory Structure

```
svp-cli/
  docs/
    PRODUCT-BRIEF.md
    PRD.md
    TECH-ARCH.md
    CONTINUITY.md
    SECURITY.md
  src/
    index.ts           # Entry point
    cli.ts             # Command definitions
    commands/
      clone.ts         # svp clone
      stats.ts         # svp stats
      report.ts        # svp report
      profiles.ts      # svp profiles
      config.ts        # svp config
    session/
      loader.ts        # Load session from disk
      parser.ts        # Parse JSONL entries
      analyzer.ts      # Extract statistics
      cloner.ts        # Clone with removals
    config/
      loader.ts        # Load configuration
      defaults.ts      # Built-in defaults
      profiles.ts      # Built-in profiles
    output/
      formatter.ts     # Output formatting
      human.ts         # Human-readable output
      json.ts          # JSON output
    utils/
      paths.ts         # Claude session paths
      validation.ts    # UUID validation
  test/
  package.json
  tsconfig.json
```

### Code Reuse Strategy

Reuse logic from `coding-agent-manager` by **copying relevant functions** into `svp-cli/src/session/`. This keeps svp-cli self-contained and independently deployable.

Files to adapt:
- Session parsing (`parseSession`)
- Turn identification (`identifyTurns`)
- Removal logic (`applyRemovals`, `truncateToolContent`)
- Token estimation (`estimateTokens`)

Do not import from parent project - copy and simplify.

---

## Command Implementations

### `svp clone [session-id] [--profile=name]`

```typescript
// Pseudo-implementation
async function clone(sessionId?: string, options?: CloneOptions) {
  // 1. Resolve session ID (auto-detect if not provided)
  const resolvedId = sessionId || await autoDetectSession();

  // 2. Validate UUID format (security)
  if (!isValidUUID(resolvedId)) {
    throw new ValidationError('Invalid session ID format');
  }

  // 3. Load session
  const session = await loadSession(resolvedId);

  // 4. Load profile if specified, merge with defaults
  const profile = options.profile
    ? await loadProfile(options.profile)
    : getDefaults();

  // 5. Apply removals
  const cloned = applyRemovals(session, profile);

  // 6. Write atomically (temp file + rename)
  const newId = await writeSession(cloned);

  // 7. Output
  return {
    sessionId: newId,
    command: `claude --dangerously-skip-permissions --resume ${newId}`,
    stats: { /* ... */ }
  };
}
```

### `svp stats [session-id]`

```typescript
async function stats(sessionId?: string) {
  const resolvedId = sessionId || await autoDetectSession();
  const session = await loadSession(resolvedId);

  return {
    turns: countTurns(session),
    toolCalls: countToolCalls(session),
    tokens: estimateTokens(session),
    files: extractFileList(session),
    lastActivity: session.lastModified
  };
}
```

### `svp profiles [show <name>]`

```typescript
async function profiles(subcommand?: string, name?: string) {
  const allProfiles = await loadAllProfiles();

  if (subcommand === 'show' && name) {
    return allProfiles[name] || throw new Error(`Unknown profile: ${name}`);
  }

  return Object.keys(allProfiles);
}
```

---

## Configuration

### Built-in Defaults

```typescript
const DEFAULTS = {
  claudeDir: '~/.claude',
  profiles: {
    'quick-clean': {
      toolRemoval: 100,
      toolHandlingMode: 'remove',
      thinkingRemoval: 100
    },
    'heavy-trim': {
      toolRemoval: 100,
      toolHandlingMode: 'truncate',
      thinkingRemoval: 100
    },
    'preserve-recent': {
      toolRemoval: 80,
      toolHandlingMode: 'remove',
      thinkingRemoval: 100
    }
  }
};
```

### User Config Schema

```typescript
interface SvpConfig {
  // Override default Claude directory
  claudeDir?: string;

  // Custom profiles (merged with built-ins)
  profiles?: {
    [name: string]: {
      toolRemoval: number;       // 0-100
      toolHandlingMode: 'remove' | 'truncate';
      thinkingRemoval: number;   // 0-100
    };
  };
}
```

Location: `~/.config/svp/config.json`

---

## Session Auto-Detection

When session ID is omitted:

```typescript
async function autoDetectSession(): Promise<string> {
  // 1. Check CLAUDE_SESSION_ID env var (if Claude sets this)
  if (process.env.CLAUDE_SESSION_ID) {
    return process.env.CLAUDE_SESSION_ID;
  }

  // 2. Find most recently modified session in current project
  const projectPath = encodeProjectPath(process.cwd());
  const sessions = await findSessionsInProject(projectPath);

  if (sessions.length === 0) {
    throw new Error('No sessions found for current directory');
  }

  if (sessions.length === 1) {
    return sessions[0].id;
  }

  // Multiple sessions - use most recent
  const mostRecent = sessions.sort((a, b) => b.mtime - a.mtime)[0];
  return mostRecent.id;
}
```

---

## Output Formatting

### Human-Readable (Default)

```
Session cloned successfully!

New Session: abc12345-1234-5678-9abc-def012345678

Stats:
  Original turns:     87
  Output turns:       87
  Tool calls removed: 234
  Thinking removed:   45

Resume command:
  claude --dangerously-skip-permissions --resume abc12345-1234-5678-9abc-def012345678
```

### JSON (`--json` flag)

```json
{
  "success": true,
  "sessionId": "abc12345-1234-5678-9abc-def012345678",
  "command": "claude --dangerously-skip-permissions --resume abc12345-1234-5678-9abc-def012345678",
  "stats": {
    "originalTurns": 87,
    "outputTurns": 87,
    "toolCallsRemoved": 234,
    "thinkingBlocksRemoved": 45
  }
}
```

---

## Error Handling

### Error Structure

```typescript
interface SvpError {
  code: string;        // Machine-readable
  message: string;     // Human-readable
  details?: string;    // Additional context
}
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Configuration error |
| 5 | Session error (not found, parse failed) |

### Example Error Output

```
Error: Session not found

Session ID: abc12345-1234-5678-9abc-def012345678
Searched in: /Users/lee/.claude/projects/

Hint: Run 'svp stats' to list available sessions in current project
```

---

## Security Considerations

### UUID Validation

```typescript
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
```

All session IDs must pass validation before being used in file paths.

### Atomic File Writes

```typescript
async function writeSessionAtomic(path: string, content: string) {
  const tempPath = `${path}.tmp.${Date.now()}`;
  await writeFile(tempPath, content, { mode: 0o600 });
  await rename(tempPath, path);
}
```

### Shell Command Safety

For any future features that shell out (v2):
```typescript
// GOOD
spawn('claude', ['--resume', sessionId]);

// BAD - never do this
exec(`claude --resume ${sessionId}`);
```

---

## Build & Distribution

### Development
```bash
cd svp-cli
npm install
npm run dev      # Watch mode
npm test         # Run tests
```

### Production Build
```bash
npm run build    # Produces dist/svp.js
```

### Installation Options
1. **npm global:** `npm install -g svp-cli`
2. **Direct execution:** `node /path/to/svp.js`
3. **Shell alias:** `alias svp='node ~/tools/svp.js'`

---

## Testing Strategy

### Unit Tests
- Session parser (various JSONL formats)
- Turn identification
- Removal logic
- Token estimation
- UUID validation
- Path resolution

### Integration Tests
- Clone real session files (fixtures)
- Stats extraction
- Config loading

### No Shell Mocking Needed
v1 has no shell execution - all file-based operations.

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Bundling strategy? | Single file via tsup |
| Session file discovery? | Default `~/.claude/`, configurable |
| Caching? | Not in v1 |
| Native dependencies? | None - pure JS |

---

*This document is designed for context continuity. A fresh agent session can read this and understand how to build the system.*
