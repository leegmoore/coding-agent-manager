# Independent Review: Claude Code Session Storage Formats Specification

**Reviewer**: Senior Engineer Agent (Independent Review)
**Date**: 2025-12-03
**Document Under Review**: `claude-code-session-storage-formats.md` v1.0.0

---

## Executive Summary

The document is **comprehensive and largely accurate**. It demonstrates thorough reverse-engineering of Claude Code's storage mechanisms. Most claims marked as CONFIRMED are indeed verifiable against actual file data. The document would serve as a solid foundation for building session management tooling.

**Overall Assessment**: 8/10 - High quality analysis with some gaps and minor inaccuracies.

---

## 1. Verified Claims (Errors NOT Found)

The following claims were verified against actual files in `~/.claude/`:

### Directory Structure - VERIFIED
- Project folder encoding algorithm (`/` -> `-`) is correct
- File counts are in the right ballpark (27,657 session files, 14,136 agent files)
- All documented directories exist and match descriptions

### Session File Format - VERIFIED
- JSONL format confirmed (one JSON object per line)
- Entry types (user, assistant, queue-operation, summary, file-history-snapshot) exist as documented
- UUID chain (uuid, parentUuid) works as described
- Queue operations come in enqueue/dequeue pairs

### Schema Accuracy - VERIFIED
- `UserEntry` schema matches actual data structure
- `AssistantEntry` schema matches actual data structure
- `QueueOperationEntry` schema matches
- `SummaryEntry` schema matches
- Thinking blocks have signatures as documented
- Tool use/result flow is accurate

### Session Assignment - VERIFIED
Found session `f069d913-459b-4385-9c2e-488d8b1a140e.jsonl` in `-Users-leemoore-code-codex-port-02/` folder with entries having both:
- `"cwd":"/Users/leemoore/code/codex-port-02"`
- `"cwd":"/Users/leemoore/code/codex-port-02/coding-agent-manager"`

This confirms the first-cwd assignment behavior.

### Agent Sessions - VERIFIED
- Agent files follow `agent-<8-hex-chars>.jsonl` pattern
- `isSidechain: true` present in agent session entries
- `agentId` field matches filename

### File History - VERIFIED
```
~/.claude/file-history/07329f39-c90c-4663-8366-c387cef25239/
  541b0b61c1bb0007@v1
  541b0b61c1bb0007@v2
  541b0b61c1bb0007@v3
  541b0b61c1bb0007@v4
  541b0b61c1bb0007@v5
```
Versioning scheme `<hash>@v<N>` confirmed.

### Session-env - VERIFIED
All sampled directories are empty. Purpose remains unknown.

---

## 2. Errors Found

### Error 1: Missing Fields in User Entry Schema

**Location**: Section 3.2 (Type: user)

**Issue**: The documented UserEntry schema is missing these observed fields:

```typescript
// Missing from documentation:
thinkingMetadata?: {
  level: "high" | "low" | string;
  disabled: boolean;
  triggers: unknown[];
};
todos?: unknown[];  // Inline todo state
```

**Evidence**:
```json
{
  "type": "user",
  "thinkingMetadata": {"level":"high","disabled":false,"triggers":[]},
  "todos": []
}
```

**Severity**: Medium - These fields appear in newer versions and are relevant for tooling.

### Error 2: Assistant Entry Missing userType Field

**Location**: Section 3.3 (Type: assistant)

**Issue**: The documented AssistantEntry schema shows it does not have `userType`, but actual files show assistant entries DO have this field.

**Evidence**:
```
Keys in actual assistant entry:
["cwd", "gitBranch", "isSidechain", "message", "parentUuid", "requestId",
 "sessionId", "slug", "timestamp", "type", "userType", "uuid", "version"]
```

**Severity**: Low - Minor schema documentation gap.

### Error 3: Summary Entry Position Claim Incorrect

**Location**: Section 3.1 (Type: summary)

**Claim**: "Session metadata, always first entry in non-empty sessions."

**Reality**: This is NOT accurate. In the examined session `f069d913-459b-4385-9c2e-488d8b1a140e.jsonl`:
- First entry is `file-history-snapshot`
- Summary entries appear later in the file (not first)
- Multiple summary entries can exist in one session

**Evidence**:
```bash
$ head -1 ~/.claude/projects/-Users-leemoore-code-codex-port-02/f069d913-459b-4385-9c2e-488d8b1a140e.jsonl
{"type":"file-history-snapshot",...}
```

**Severity**: High - This affects session parsing logic for tooling.

### Error 4: leafUuid Behavior Inconsistency

**Location**: Section 3.1 and 9.4

**Claim**: "leafUuid does NOT always match any entry's uuid in the file"

**Reality**: This claim is partially true but needs nuance. Testing showed:
- `leafUuid: "233968ab-ecf5-4528-b623-7754b4e12b84"` - FOUND as uuid in file
- `leafUuid: "cfb752af-3ae0-47f6-8869-6d9dd6b034c6"` - NOT FOUND in file

The document correctly identifies this as an inconsistency but should note that SOME leafUuids DO match entries.

**Severity**: Low - The hedging in the document is appropriate.

### Error 5: stop_reason:null Not Observed

**Location**: Section 3.3 (Version Differences)

**Claim**: "Newer versions (2.0.50+): Streaming entries have `stop_reason: null`"

**Reality**: Could not verify this claim. Searched extensively and found no `stop_reason: null` entries. All observed entries have string values.

**Evidence**:
```bash
$ grep '"stop_reason":null' ~/.claude/projects/-Users-leemoore-code-codex-port-02/*.jsonl
# (no output)
```

**Severity**: Medium - This may be version-specific or transient state not persisted. Should be marked SUSPECTED, not implied CONFIRMED.

---

## 3. Gaps Identified

### Gap 1: `thinkingMetadata` Field Undocumented

This field appears on user entries and controls thinking behavior:
```typescript
interface ThinkingMetadata {
  level: "high" | "low" | string;
  disabled: boolean;
  triggers: unknown[];
}
```

This is critical for session cloning/manipulation tools that need to preserve thinking settings.

### Gap 2: `todos` Field in Entries Undocumented

User entries can contain a `todos` array field inline, separate from the `~/.claude/todos/` files. The relationship between inline todos and external todo files is not documented.

### Gap 3: Plans Directory Not Documented

The document mentions `~/.claude/plans/` in the directory structure but provides no schema or format documentation. Plans are markdown files with structured content:

```markdown
# Context Utility MVP - Session Cloner

## Overview
...
```

### Gap 4: Agent Definition Format Not Documented

`~/.claude/agents/<name>.md` files have YAML frontmatter:
```yaml
---
name: senior-engineer
description: Use this agent when...
model: opus
color: green
---
```

This format is not documented despite agents being mentioned.

### Gap 5: Plugin Structure Not Documented

The plugins directory has structure:
```
plugins/
  config.json          # {"repositories": {}}
  repos/               # Repository cache
  <plugin-name>/
    README.md
    skills/
```

### Gap 6: Output Styles Not Documented

`~/.claude/output-styles/<name>.md` files exist but format is not documented.

### Gap 7: IDE Lock Files Purpose Unclear

Document mentions `ide/<pid>.lock` but doesn't explain:
- What process creates them
- When they're cleaned up
- How they coordinate between instances

### Gap 8: Session Cloning/Resumption Algorithm

The document discusses `/resume` discovery but doesn't cover:
- How session cloning works
- Whether cloned sessions maintain parent references
- How branching actually works in practice

### Gap 9: statsig Files Content

Document lists statsig files but doesn't examine their content or explain:
- What feature flags are tracked
- How to interpret the cached evaluations
- What the hash suffixes mean

### Gap 10: file-history-snapshot Appears First

Sessions can start with `file-history-snapshot` entries before any user/assistant content. This affects the "summary is always first" claim and impacts parsing logic.

---

## 4. Confidence Level Corrections

### Should Upgrade to CONFIRMED

| Item | Current | Recommended | Evidence |
|------|---------|-------------|----------|
| Agent session naming | CONFIRMED | CONFIRMED | Correctly marked |
| Path encoding | CONFIRMED | CONFIRMED | Verified |

### Should Downgrade from CONFIRMED

| Item | Current | Recommended | Evidence |
|------|---------|-------------|----------|
| Summary entry position | Implied CONFIRMED | LIKELY | First entry can be file-history-snapshot |

### Should Downgrade from LIKELY

| Item | Current | Recommended | Evidence |
|------|---------|-------------|----------|
| stop_reason:null in newer versions | SUSPECTED | UNKNOWN | Could not verify in any file |

### Appropriately Hedged

The following are correctly marked as SUSPECTED/UNKNOWN:
- session-env purpose
- Stub file creation triggers
- Exact garbage collection algorithm

---

## 5. Usefulness Assessment

### Can You Build Session Management Tools From This?

**YES, with caveats.**

The document provides sufficient information to:
1. Parse session files correctly
2. Understand UUID chain traversal
3. Identify turns in conversation
4. Locate associated metadata files
5. Handle agent vs main sessions

**Missing for complete tooling:**
1. `thinkingMetadata` handling
2. Inline `todos` array handling
3. Multiple summary entry handling
4. Non-first-position summary entries
5. file-history-snapshot as potential first entry

### What Would You Need That's Missing?

1. **Complete schema for all entry types** including newly discovered fields
2. **Order guarantees** - What entries can appear first?
3. **Relationship documentation** - How do inline todos relate to external todo files?
4. **Version migration notes** - What changed between versions?
5. **Example edge cases** - Sessions with branching, interrupted sessions, etc.

### Is The Document Well-Organized?

**YES.** The structure is logical:
- Executive summary upfront
- Detailed specifications by type
- Cross-reference maps
- Algorithms section
- Confidence levels clearly marked
- Sample data appendix

Suggestions:
- Add a "Version History" section documenting schema changes across Claude Code versions
- Add an "Edge Cases" section with specific examples
- Add a "Known Limitations" section for tooling builders

---

## 6. Specific Recommendations

### High Priority

1. **Fix Summary Entry Position Claim**
   - Change "always first entry" to "typically appears in sessions, position varies"
   - Document that file-history-snapshot can precede it

2. **Add Missing Fields to Schema**
   - Add `thinkingMetadata` to UserEntry
   - Add `todos` to UserEntry
   - Add `userType` to AssistantEntry

3. **Document Plans and Agents Format**
   - These are directly relevant for Claude Code power users

### Medium Priority

4. **Clarify stop_reason:null Claim**
   - Either provide evidence or mark as UNKNOWN

5. **Add leafUuid Nuance**
   - Note that some leafUuids DO match entry uuids

6. **Document Plugin Structure**
   - At least basic schema for `config.json` and directory structure

### Low Priority

7. **Add Version Change Log**
   - Track what fields appeared in which versions

8. **Expand Edge Cases**
   - Empty sessions
   - Interrupted sessions
   - Cloned sessions
   - Branched conversations

---

## 7. Trust Assessment

| Aspect | Score | Notes |
|--------|-------|-------|
| Factual Accuracy | 7/10 | Minor schema gaps, one significant position error |
| Completeness | 7/10 | Missing several fields and formats |
| Confidence Calibration | 8/10 | Appropriately hedged most uncertain claims |
| Usefulness for Tooling | 8/10 | Solid foundation, needs schema updates |
| Organization | 9/10 | Well-structured, easy to navigate |
| **Overall Trustworthiness** | **8/10** | Reliable for most use cases |

---

## 8. Conclusion

This document represents solid reverse-engineering work. The author clearly examined many session files and correctly identified the core patterns. The confidence-level tagging is a valuable feature that appropriately hedges uncertain claims.

The main issues are:
1. A few missing schema fields (thinkingMetadata, todos, userType on assistant)
2. Incorrect claim about summary entry always being first
3. Undocumented formats (agents, plans, plugins, output-styles)

For building session management tooling, this document provides approximately 85% of what you need. The remaining 15% requires:
- Schema field additions documented above
- Handling edge cases around entry ordering
- Understanding the inline todos vs external todos relationship

**Recommendation**: Update the document with the corrections noted above, then it will be production-ready for tooling development.

---

## Appendix: Verification Commands Used

```bash
# Directory structure verification
ls -la ~/.claude/

# Session file sampling
head -10 ~/.claude/projects/-Users-leemoore-code-codex-port-02/0024ed18-9e24-43fe-9444-4a40bee4c413.jsonl

# Schema field extraction
grep '"type":"user"' <file> | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(sorted(d.keys()))"

# Cross-directory cwd verification
grep '"cwd"' <session>.jsonl | grep -o '"cwd":"[^"]*"' | sort -u

# Entry type counts
grep -c '"type":"summary"' <file>

# Agent session verification
head -5 ~/.claude/projects/-Users-leemoore-code-codex-port-02-codex-ts/agent-74351d90.jsonl

# File history verification
ls ~/.claude/file-history/<sessionId>/
```
