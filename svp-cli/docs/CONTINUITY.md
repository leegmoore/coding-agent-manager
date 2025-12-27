# SVP CLI - Context Continuity Guide

## Purpose

This document enables a fresh Claude session to quickly understand and continue development of SVP CLI. **Read this first**, then other docs as needed.

---

## Quick Context

**SVP CLI** is a command-line toolkit for AI agents. The human (PM) and AI (Product Owner) are building tools that make AI coding agents more capable.

**Key insight:** The primary users are AI agents, not humans. Design for agent ergonomics.

---

## Your Role

You are the **Product Owner**. The human is the **Product Manager**.

As PO, you:
- Own technical decisions
- Can push back on PM direction if you have good reasons
- Make implementation choices
- Coordinate work (including spawning sub-agents for reviews)

---

## Document Map

| Document | Purpose | Read When |
|----------|---------|-----------|
| `CONTINUITY.md` | This file | Starting fresh |
| `PRODUCT-BRIEF.md` | Vision, scope, principles | Understanding "why" |
| `PRD.md` | Features and epics (v1 scoped) | Understanding "what" |
| `TECH-ARCH.md` | Architecture and stack | Understanding "how" |
| `SECURITY.md` | Enterprise security docs | Before deployment |

---

## Current State

**Phase:** Documentation complete, reviewed, ready for implementation.

**Completed:**
- Product brief with vision
- PRD with 4 epics (narrowed scope)
- Technical architecture
- Security documentation
- Multi-perspective review (skeptical engineer, agent user, security)
- Incorporated feedback and narrowed v1 scope

**Next Steps:**
1. Create project skeleton (package.json, tsconfig, directory structure)
2. Implement CLI framework (Epic 2)
3. Port session logic from parent project
4. Implement `clone` command
5. Implement `stats` command
6. Add configuration and profiles

---

## Key Decisions Made

### Scope (v1)
- **IN:** Clone, stats, report, profiles
- **OUT:** Search unification, model providers (deferred to v2)

### Technical
- **Language:** TypeScript (Node.js 20+)
- **CLI Framework:** Commander.js
- **Dependencies:** Minimal (commander only for runtime)
- **Output:** Human-readable default, `--json` flag for structured
- **Config:** `~/.config/svp/config.json`, no API keys in files

### Performance
- Startup: <500ms
- Stats: <200ms
- Clone: <2s for typical sessions

### Security
- UUID validation on all session IDs
- Atomic file writes
- No credentials in config files
- Document `--dangerously-skip-permissions` flag

---

## Constraints

- Must work at Fortune 100 company (no alarming code/names)
- Enterprise providers: Claude CLI + Bedrock only
- Non-interactive only (one-shot commands)
- No native dependencies

---

## Project Location

```
/Users/leemoore/code/coding-agent-manager/
├── svp-cli/              # This project
│   ├── docs/             # Documentation (you are here)
│   ├── src/              # Source code (to be created)
│   └── test/             # Tests (to be created)
├── src/                  # Parent project (coding-agent-manager)
│   └── services/
│       └── session-clone.ts  # Reusable logic to port
└── rich/                 # TypeScript rich text library (gitignored)
```

---

## Code to Reuse

Port these from `coding-agent-manager/src/`:
- `parseSession()` - Parse JSONL
- `identifyTurns()` - Find turn boundaries
- `applyRemovals()` - Remove tool calls/thinking
- `truncateToolContent()` - Truncation logic
- `estimateTokens()` - Token estimation

Copy and simplify - don't import from parent.

---

## Review Feedback Summary

Three review perspectives were gathered:

**Skeptical Engineer:**
- Narrowed scope (removed search/model providers from v1)
- Realistic performance targets (<500ms not <100ms)
- Simplified config (2 layers not 5)

**Agent User:**
- Added `stats` command for quick metrics
- Default human-readable output
- Session auto-detection

**Enterprise Security:**
- Added SECURITY.md
- UUID validation requirement
- Credential handling policy

---

## How to Continue

1. ✅ Read this file
2. Skim PRODUCT-BRIEF.md for vision
3. Review PRD.md for v1 feature scope
4. Check TECH-ARCH.md for architecture details
5. Ask the PM for current priorities
6. Start implementation

---

## Communication Style

- Be direct and opinionated as PO
- Push back when you disagree
- Make decisions rather than always asking
- Spawn sub-agents for specific tasks
- Keep the PM informed but don't over-explain

---

*Last updated: After review feedback incorporated*
