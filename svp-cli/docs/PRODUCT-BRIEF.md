# SVP CLI - Product Brief

## Vision

**SVP (Session & Vibe Protocol)** is a command-line toolkit designed primarily for AI agents. While humans can use it, every design decision optimizes for agent ergonomics: predictable I/O, composable commands, zero interactivity, and fast execution.

The core insight: AI coding agents spend enormous context on repetitive tasks - searching documentation, managing session context, calling external APIs. SVP consolidates these into efficient, scriptable primitives that any agent can invoke mid-task.

## Problem Statement

AI coding agents (Claude Code, Copilot, Cursor, etc.) face common friction points:

1. **Context bloat** - Sessions fill with tool calls, thinking blocks, stale content
2. **Search fragmentation** - Documentation search, code search, web search all require different tools/MCPs with different interfaces
3. **Provider lock-in** - Switching between Claude, Bedrock, OpenRouter requires code changes
4. **MCP overhead** - MCP servers are heavyweight for simple one-shot queries
5. **Report generation** - Analyzing sessions for debugging or handoff requires manual work

## Solution

A lightweight CLI that an agent can call like any other shell command:

```bash
# Clone and trim a Claude Code session
svp clone abc123 --profile=heavy-trim

# Quick session stats
svp stats abc123

# Generate session report
svp report abc123 --format=md > session-analysis.md

# List available profiles
svp profiles
```

## Target Users

**Primary:** AI agents (Claude Code, future agents)
**Secondary:** Developers orchestrating AI workflows
**Tertiary:** Power users who want CLI access to these capabilities

## Design Principles

1. **One-shot execution** - No interactive prompts, no streaming unless requested
2. **JSON-native** - Structured input via stdin or files, structured output to stdout
3. **Composable** - Works with pipes, xargs, parallel execution
4. **Fast startup** - <500ms for all commands
5. **Predictable errors** - Exit codes and structured error output
6. **Enterprise-safe** - Innocuous naming, no alarming dependencies

## Scope

### In Scope (v1) - Focused
- Session cloning/trimming with configurable profiles
- Session statistics (quick metrics)
- Session analysis and reporting
- Profile-based configuration

### Deferred to v2 (if demand exists)
- Search unification (Context7, Firecrawl, Exa)
- Multi-provider model calls
- Session diff between turns

### Out of Scope
- Interactive modes
- GUI or TUI
- Session visualization
- Real-time streaming
- Copilot session support

## Success Metrics

- Agent can reduce session context by 50%+ with single command
- `svp stats` returns in <200ms
- Zero configuration required for basic usage
- Works identically on macOS and Linux

## Resolved Questions

1. **Name:** `svp` (Super Vibe Protocol - enterprise-safe, short, memorable)
2. **Config location:** `~/.config/svp/.env` (standard XDG, .env format)
3. **Search caching:** Deferred to v2 with search feature

---

*This document is designed for context continuity. A fresh agent session can read this and understand the product vision.*
