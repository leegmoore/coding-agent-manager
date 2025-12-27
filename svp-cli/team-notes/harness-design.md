# Vex Autonomous Harness Design

## Design Philosophy

**Core Insight:** I'm the Product Owner, not the coder. I orchestrate, don't execute. This prevents drift.

### What I Do
- Keep big picture, requirements, standards
- Sign off on deliverables
- Write context packets for 1-shot agents
- Review outputs and decide next steps
- Decide when to involve Lee

### What I Don't Do
- Write production code (Axel does)
- Write tests (Axel does, Quinn reviews)
- Get lost in implementation details

---

## Harness Architecture

### Session Types

```
┌─────────────────────────────────────────────────────────────────┐
│                         VEX SESSION                              │
│  - Reads state files on startup                                  │
│  - Plans next work increment                                     │
│  - Creates context packet for Axel                               │
│  - Calls Axel (1-shot)                                          │
│  - Reviews output                                                │
│  - Updates state files                                           │
│  - Decides: continue / wait for Lee / done                       │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AXEL SESSION (1-shot)                       │
│  - Receives context packet (files to read, task, constraints)   │
│  - Executes: skeleton / TDD red / TDD green                     │
│  - Commits work                                                  │
│  - Reports completion status                                     │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     QUINN SESSION (1-shot)                       │
│  - Receives review packet                                        │
│  - Reviews: code / docs / requirements alignment                 │
│  - Reports findings                                              │
└─────────────────────────────────────────────────────────────────┘
```

### State Files

Location: `svp-cli/team-notes/`

| File | Purpose | Who Writes |
|------|---------|-----------|
| `journal.md` | High-level progress, decisions, learnings | Vex |
| `decision-log.md` | Durable architectural decisions (D-001, etc) | Vex |
| `current-sprint.md` | Active work: tasks, status, blockers | Vex |
| `axel-output.md` | Axel's last session output | Axel |
| `quinn-output.md` | Quinn's last review output | Quinn |

### Vex Startup Ritual

Every session:
1. Read `journal.md` - current state, recent decisions
2. Read `current-sprint.md` - what's in progress
3. Read `axel-output.md` / `quinn-output.md` if pending
4. Decide next action

### Context Packet Format

What I give to Axel/Quinn for 1-shot work:

```markdown
# Context Packet: [Task Name]

## Summary
One sentence of what to do.

## Files to Read
- path/to/file1.ts (why relevant)
- path/to/file2.ts (why relevant)

## Task
Detailed description of deliverable.

## Constraints
- Must not break X
- Must follow pattern Y
- Tests must pass

## Acceptance Criteria
- [ ] AC-1
- [ ] AC-2

## Output
When done, update `axel-output.md` with:
- Status: complete / blocked / partial
- What was done
- Files changed
- Any issues found
- Suggested next steps
```

---

## Work Methodology

Following Lee's proven pattern:

### Phase 1: Feature Spec
1. **I write** feature doc (acceptance criteria, test conditions)
2. **Quinn reviews** for gaps, contradictions
3. **I incorporate** feedback
4. Up to 3 review cycles

### Phase 2: Tech Design
1. **I draft** high-level architecture
2. **Axel reviews** for feasibility
3. **I finalize** design decisions
4. Log decisions in `decision-log.md`

### Phase 3: Skeleton
- Axel creates stubs, types, interfaces
- All functions throw NotImplementedError
- App compiles and runs

### Phase 4: TDD Red
- Axel writes tests for acceptance criteria
- Tests fail (code not implemented)

### Phase 5: TDD Green
- Axel implements until tests pass
- May be multiple sessions per feature

### Phase 6: Manual Verification
- I or Quinn verify end-to-end
- Document any issues

---

## Harness Script

The harness needs to:
1. Wake me (Vex) with startup prompt
2. I work and update state
3. I can call Axel/Quinn via subagent
4. When I'm done for the session, I signal the harness
5. Harness cleans context, restarts me

### Signal Structure

When I end a session:

```json
{
  "action": "continue" | "wait_for_lee" | "done",
  "clone_profile": "routine" | "emergency" | null,
  "next_prompt": "Optional specific prompt for next session",
  "message_to_lee": "Optional message if wait_for_lee"
}
```

### Harness Loop (pseudocode)

```bash
while true; do
  # Start Vex session
  claude --dangerously-skip-permissions \
    --resume $SESSION_ID \
    --agent vex \
    < "$VEX_PROMPT"

  # Read Vex's signal from state file
  signal=$(cat team-notes/harness-signal.json)

  case $signal.action in
    "continue")
      # Clone if needed
      if [ -n "$signal.clone_profile" ]; then
        new_id=$(svp clone $SESSION_ID --profile=$signal.clone_profile --json | jq -r '.sessionId')
        SESSION_ID=$new_id
      fi
      sleep 5
      ;;
    "wait_for_lee")
      # Send notification
      notify_lee "$signal.message_to_lee"
      exit 0  # Stop loop, wait for manual restart
      ;;
    "done")
      exit 0
      ;;
  esac
done
```

---

## Lee Integration

### When to Involve Lee
1. **Blockers** - can't proceed without decision
2. **Scope changes** - feature creep, priority shift
3. **Major architecture decisions** - things that are hard to reverse
4. **Quality gates** - before shipping major features
5. **Periodic check-ins** - every few hours of autonomous work

### Notification API

For now, simple:
- Write to `team-notes/messages-to-lee.md`
- Harness can watch file and send push notification (future)

Eventually:
- SMS/Slack integration
- Lee's phone buzzes with summary

---

## Immediate Next Steps

1. Create state file structure
2. Write Vex startup prompt
3. Create harness script (bash initially)
4. Test one loop cycle
5. Iterate

---

## Open Questions for Lee

1. **Subagent invocation** - Can I call Axel/Quinn directly via Claude Code subagents, or should harness restart with different agent?
2. **Notification mechanism** - What's easiest for you? File watch? SMS? Slack?
3. **Session length** - Should I time-box sessions (e.g., 30 min max) or go until context limit?
4. **Linear vs Markdown** - For tracking epics/features, do you want me to try Linear MCP or stay markdown-based?

---

*This design synthesizes Anthropic's two-agent pattern with Lee's tests-first methodology and decision logging. Key difference: I stay at orchestration layer, never in the weeds.*
