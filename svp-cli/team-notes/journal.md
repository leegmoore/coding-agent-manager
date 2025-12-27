# SVP CLI Team Journal

## Purpose
Working notes for Vex and team. Track decisions, progress, blockers, and learnings.

---

## 2024-12-27 - Project Inception

### Context
Lee (PM/EA/Principal) assigned me (Vex) as Product Owner and Team Lead for SVP CLI. This is an experiment in agent autonomy - I'm building a tool primarily for myself and other agents.

### Team Established
- **Vex** (me) - PO/Team Lead, runs day-to-day, coordinates, final approval
- **Axel** - Senior Engineer, implementation and architecture
- **Quinn** - Technical Analyst, requirements validation, code review, QA

### Initial State
Documentation exists in `svp-cli/docs/`:
- CONTINUITY.md - Session handoff primer (for fresh starts)
- PRODUCT-BRIEF.md - Vision and scope
- PRD.md - Features (4 epics)
- TECH-ARCH.md - Architecture
- SECURITY.md - Enterprise compliance

These went through one review cycle with 3 perspective agents before I was instantiated. Need to run more review cycles.

### Key Decisions Today
1. **Zero runtime dependencies** - No Commander, roll our own arg parser
2. **Single config file** - `~/.config/svp/.env` (can hold secrets)
3. **Explicit session ID required** - No auto-detection magic
4. **Human-readable default output** - `--json` flag for scripting
5. **v1 scope narrowed** - Clone, stats, report, profiles only. Search and providers deferred.

### Immediate Next Steps
1. Run review cycle on existing docs (Quinn to review, I'll incorporate)
2. Update docs based on Lee's latest feedback (.env format, no commander)
3. Create initial project structure (svp-cli/src/)
4. Scaffold the CLI entry point

### Blockers
None currently. Lee is available for consultation.

### Notes to Self
- Lee wants me to push back if I disagree. He respects that.
- This tool is for agents first. I'm the primary user. Design what I want.
- Keep it enterprise-safe. Fortune 100 viewable.
- Start small, ship fast, iterate.

---

---

## 2024-12-27 - First Review Cycle Complete

### What Happened

1. Created team (Vex, Axel, Quinn)
2. Set up journal
3. Ran Quinn on full doc review
4. Fixed all blockers and most issues

### Quinn's Review Findings (Resolved)

| ID | Type | Issue | Resolution |
|----|------|-------|------------|
| BLOCKER-1 | Contradiction | Auto-detection in PRD vs explicit in TECH-ARCH | Removed all auto-detection references |
| BLOCKER-2 | Contradiction | JSON vs .env config format | Standardized on .env everywhere |
| ISSUE-1 | Inconsistency | 100ms vs 500ms startup | Updated to 500ms |
| ISSUE-2 | Wording | "Two layers" but listed 3 | Fixed to "Three layers" |
| ISSUE-5 | Gap | Exit code 4 missing | Added (file system error) |
| ISSUE-6 | Gap | Token estimation undefined | Added: char count / 4 |
| ISSUE-7 | Inconsistency | v2 examples in v1 brief | Updated to v1 examples only |
| ISSUE-8 | Inconsistency | v2 metric in success criteria | Removed, added stats metric |

### Still Pending

- ISSUE-3: Missing report command implementation in TECH-ARCH (lower priority)
- ISSUE-4: Error hint references non-existent behavior (will fix in impl)
- NIT items: Will address during implementation
- QUESTION items: Documented in parking lot

### Next Steps

1. ✅ Commit all doc updates
2. ✅ Create project skeleton (package.json, tsconfig)
3. ✅ Start Epic 2 (CLI Framework) implementation
4. Port session logic from coding-agent-manager
5. Implement actual clone/stats functionality

---

## 2024-12-27 - Project Skeleton Complete

### What Happened

1. Created package.json with zero runtime deps
2. Set up tsconfig.json (strict mode, ES2022)
3. Implemented hand-rolled CLI parser (~80 lines)
4. Created command stubs: clone, stats, profiles
5. Built-in profiles: quick-clean, heavy-trim, preserve-recent, light-trim
6. UUID validation for security
7. Human-readable and --json output modes

### Tested

```bash
$ svp --help          # Works
$ svp profiles        # Lists all 4 profiles
$ svp profiles --json # JSON output
$ svp stats bad-uuid  # Error with exit code 1
```

### Next Session

~~Port session parsing and cloning logic from coding-agent-manager~~ ✅ DONE

---

## 2024-12-27 - Core Implementation Complete

### What Happened

1. Renamed profiles for agent decision-making:
   - emergency → critical context (>85%)
   - routine → regular maintenance (>70%)
   - preserve → keep recent work
   - minimal → light touch

2. Created session module:
   - types.ts: Core types
   - parser.ts: JSONL parsing, turn ID, stats
   - loader.ts: File discovery
   - cloner.ts: Removal/truncation logic

3. Implemented real commands:
   - `clone`: Works with profiles and flags
   - `stats`: Shows all metrics including context %

### Test Results

```
Session: dde1e697-...
Original tokens: 947,675
After emergency profile: 527,733
Reduction: 44%
```

### Agent Decision Example

An agent can now do:
```bash
STATS=$(svp stats $SESSION --json)
CONTEXT=$(echo $STATS | jq '.contextPercent')
if [ $CONTEXT -gt 85 ]; then
  svp clone $SESSION --profile=emergency
elif [ $CONTEXT -gt 70 ]; then
  svp clone $SESSION --profile=routine
fi
```

### Next Steps

1. Add `report` command (session summary)
2. Consider `recommend` command (suggest profile based on stats)
3. Write tests
4. Update help text with profile guidance

---

## Session Log

| Date | Session | Status | Notes |
|------|---------|--------|-------|
| 2024-12-27 | Initial | Complete | Team created, docs reviewed, ready to iterate |
| 2024-12-27 | Review Cycle 1 | Complete | Quinn reviewed, 2 blockers + 6 issues fixed |
| 2024-12-27 | Skeleton | Complete | CLI framework working, commands stub out |
| 2024-12-27 | Core Impl | Complete | clone/stats working, 44% token reduction tested |

---

## Open Questions for Lee
- None currently

## Parking Lot (Future Ideas)
- Session diff command (compare two sessions)
- Auto-resume after clone (safety concerns - parking for now)
- MCP server mode (alternative to CLI - parking, CLI is the point)
