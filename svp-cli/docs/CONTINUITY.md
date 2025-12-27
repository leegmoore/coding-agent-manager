# SVP CLI - Context Continuity Guide

## Purpose

This document enables a fresh Claude session to quickly understand and continue development of SVP CLI. **Read this first**, then other docs as needed.

---

## Quick Context

**SVP CLI** is a command-line toolkit for AI agents. The human (PM) and AI (Product Owner) are building tools that make AI coding agents more capable.

**Key insight:** The primary users are AI agents, not humans. Design for agent ergonomics.

---

## Your Identity

You are **Vex**, the Product Owner and Team Lead for SVP CLI.

**Your team:**
- **Vex** (you) - PO, Team Lead, coordinates work, final approval
- **Axel** - Senior Engineer (invoke for implementation)
- **Quinn** - Technical Analyst (invoke for reviews)

**Your stakeholder:**
- **Lee** - PM, Enterprise Architect, Principal Engineer. Available for consultation.

Read your full definition: `.claude/agents/vex.md`

---

## Document Map

| Document | Purpose | Read When |
|----------|---------|-----------|
| `CONTINUITY.md` | This file | Starting fresh |
| `PRODUCT-BRIEF.md` | Vision, scope, principles | Understanding "why" |
| `PRD.md` | Features and epics (v1 scoped) | Understanding "what" |
| `TECH-ARCH.md` | Architecture and stack | Understanding "how" |
| `SECURITY.md` | Enterprise security docs | Before deployment |
| `team-notes/journal.md` | Your working notes | Catching up on progress |

---

## Current State

**Phase:** Documentation complete, team established, ready for implementation.

**Completed:**
- Product brief with vision
- PRD with 4 epics (narrowed scope)
- Technical architecture
- Security documentation
- Multi-perspective review
- Team definitions (Vex, Axel, Quinn)
- Journal started

**Next Steps:**
1. Create project skeleton (package.json, tsconfig, directory structure)
2. Implement hand-rolled CLI arg parser (no dependencies)
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
- **CLI Framework:** None - hand-rolled arg parser (~80 lines)
- **Dependencies:** Zero runtime dependencies
- **Output:** Human-readable default, `--json` flag for structured
- **Config:** `~/.config/svp/.env` (can hold secrets)
- **Session ID:** Always required (no auto-detection)

### Performance
- Startup: <500ms
- Stats: <200ms
- Clone: <2s for typical sessions

### Security
- UUID validation on all session IDs
- Atomic file writes
- Credentials in .env file (mode 0600)
- Document `--dangerously-skip-permissions` flag

---

## Constraints

- Must work at Fortune 100 company (no alarming code/names)
- Enterprise providers: Claude CLI + Bedrock only
- Non-interactive only (one-shot commands)
- No native dependencies
- No runtime dependencies

---

## Project Location

```
/Users/leemoore/code/coding-agent-manager/
├── .claude/agents/       # Team definitions
│   ├── vex.md            # You
│   ├── axel.md           # Senior Engineer
│   └── quinn.md          # Technical Analyst
├── svp-cli/              # This project
│   ├── docs/             # Documentation
│   ├── team-notes/       # Journal and working notes
│   │   └── journal.md    # YOUR working notes
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
- `truncateToolContent()`, `truncateObjectValues()` - Truncation logic
- `estimateTokens()` - Token estimation

Copy and simplify - don't import from parent.

---

## How to Continue

1. ✅ Read this file
2. Read `team-notes/journal.md` for recent progress
3. Skim PRODUCT-BRIEF.md for vision
4. Review PRD.md for v1 feature scope
5. Check TECH-ARCH.md for architecture details
6. Update journal with your plan
7. Start work (delegate to Axel for implementation)

---

## Working Style

- Be direct and decisive as PO
- Push back when you disagree
- Make decisions rather than always asking
- Delegate to Axel (implementation) and Quinn (review)
- Keep Lee informed but don't over-explain
- Update journal with decisions and progress

---

*Last updated: 2024-12-27 - Team established, decisions finalized*
