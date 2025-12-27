# SVP CLI - Product Requirements Document

## Overview

This PRD defines the epics and features for SVP CLI **v1**. Scope has been deliberately narrowed based on review feedback. The goal is a focused tool that does session management excellently.

---

## V1 Scope Decision

**In v1:**
- Session cloning/trimming with profiles
- Session statistics (quick metrics)
- Session reporting
- CLI framework with good ergonomics

**Deferred to v2 (if demand exists):**
- Unified search (Context7, Firecrawl, Exa)
- Multi-provider model calls
- Session diff

**Rationale:** Agents already have MCP access to search providers. Model provider abstraction duplicates existing tools. Focus on the unique value: context management.

---

## Epic 1: Session Management

Core value proposition - manage Claude Code session context.

### Features

**1.1 Session Clone**
- Clone a session with configurable removal options
- Support named profiles (e.g., `--profile=heavy-trim`)
- Options: tool removal %, thinking removal %, truncate vs remove
- Output: new session ID + resume command
- Auto-detect current session if no ID provided (when running in Claude Code)

**1.2 Session Stats**
Quick metrics without full analysis:
```bash
svp stats [session-id]
# Turns: 87
# Tool calls: 234 (12 failed)
# Tokens (est): 145K
# Files touched: 23
# Last activity: 2 hours ago
```
- Fast execution (<200ms)
- Auto-detect session if ID omitted

**1.3 Session Report**
- Generate readable session summary
- Include: task progression, key decisions, files modified
- Output: markdown (default) or JSON (`--json`)
- Useful for debugging and handoff

**1.4 Clone Profiles**
- Config file with named presets
- Built-in profiles: `quick-clean`, `heavy-trim`, `preserve-recent`
- Custom profiles in user config
- `svp profiles` lists available profiles
- `svp profiles show <name>` displays settings

---

## Epic 2: CLI Framework

Foundation for all commands.

### Features

**2.1 Command Structure**
```
svp <command> [args] [flags]

Commands:
  clone     Clone and trim a session
  stats     Quick session statistics
  report    Generate session report
  profiles  List/show clone profiles
  config    Show effective configuration
```

**2.2 Input Handling**
- Positional arguments for common cases
- Flags for options
- Auto-detect session ID when possible
- UUID validation on all session IDs (security)

**2.3 Output Modes**
- Human-readable by default (for debugging)
- `--json` flag for structured output (for scripting)
- `--quiet` flag for minimal output (just essential info)
- Errors to stderr with context

**2.4 Error Handling**
- Meaningful error messages with context
- "Session not found" → include where we looked
- "Config invalid" → include which field is wrong
- Exit codes:
  - 0: Success
  - 1: General error
  - 2: Invalid arguments
  - 3: Configuration error
  - 5: Session error (not found, parse error)

**2.5 Help & Examples**
- Every command has `--help`
- 2-3 realistic examples per command
- Show output format in help

---

## Epic 3: Configuration

Simple, predictable configuration.

### Features

**3.1 Config Resolution (Simplified)**
Two layers only:
1. Built-in defaults
2. User config (`~/.config/svp/config.json`)
3. CLI flags (highest priority)

No project-local config, no env var layer (except for secrets).

**3.2 Clone Profiles**
```json
{
  "profiles": {
    "quick-clean": {
      "toolRemoval": 100,
      "toolHandlingMode": "remove",
      "thinkingRemoval": 100
    },
    "heavy-trim": {
      "toolRemoval": 100,
      "toolHandlingMode": "truncate",
      "thinkingRemoval": 100
    }
  }
}
```

**3.3 Credential Handling**
- **NO API keys in config files** (security requirement)
- All credentials via environment variables
- Document required env vars in help output
- For v1: no external API keys needed (session-only features)

**3.4 Session Discovery**
- Default Claude Code paths: `~/.claude/projects/`
- Configurable base path for non-standard installations
- Cross-platform path handling (macOS, Linux)

---

## Epic 4: Agent Ergonomics

Make this genuinely useful for AI agents.

### Features

**4.1 Predictable Behavior**
- Same input → same output (except timestamps)
- No interactive prompts ever
- No confirmation dialogs
- Fast startup (<500ms target)

**4.2 Session Auto-Detection**
When session ID is omitted:
- Check if running inside Claude Code session
- Use most recently modified session in current project
- Clear error if ambiguous

**4.3 Scriptable Output**
- JSON output parseable by jq
- Exit codes for conditionals
- Quiet mode for pipelines

**4.4 Discoverable Commands**
- `svp` with no args shows help
- `svp profiles` shows available profiles
- `svp config` shows effective configuration

---

## Priority Order (v1)

1. **Epic 2: CLI Framework** - Foundation
2. **Epic 1.1: Session Clone** - Core value
3. **Epic 1.2: Session Stats** - Quick wins
4. **Epic 3: Configuration** - Profiles
5. **Epic 1.4: Clone Profiles** - Power feature
6. **Epic 4: Agent Ergonomics** - Polish
7. **Epic 1.3: Session Report** - Nice to have

---

## Success Criteria

- Agent can reduce context by 50%+ with `svp clone --profile=heavy-trim`
- `svp stats` returns in <200ms
- Zero configuration required for basic `svp clone <id>`
- Works on macOS and Linux
- All commands have helpful `--help` with examples

---

## Deferred Features (v2 Candidates)

- Unified search (Context7, Firecrawl, Exa)
- Multi-provider model calls (Claude CLI, Bedrock, OpenRouter, Gemini)
- Session diff between turns
- Cache layer for search results
- Batch operations

---

*This document is designed for context continuity. A fresh agent session can read this and understand what to build.*
