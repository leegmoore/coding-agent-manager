# Phase 5: Manual Test + UI Refinement

## Role

You are a Senior QA/UX Engineer conducting manual testing and UI refinement for the Session Detail Core feature. Your task is to test the feature with real sessions, identify integration issues, and refine the UX based on observations. This phase is more exploratory than previous phases.

---

## Application Overview

**coding-agent-manager** is a web application for managing Claude Code sessions. The Session Detail Core feature has been implemented in Phases 1-4:
- API: `GET /api/session/:id/turns`
- UI: `/session-detail` page with visualization and navigation

---

## Feature Overview

**Session Detail Core** provides:
1. Session ID input + Load button
2. Turn navigation (buttons, input, slider)
3. Vertical band visualization (User, Assistant, Thinking, Tool)
4. Scale input (50k-2000k) with auto-expand warning
5. Turn detail card showing selected turn's content

---

## Phase Scope

1. **Manual Testing** - Systematic testing with real sessions
2. **Integration Fixes** - Address any issues between API and UI
3. **UX Refinement** - Improve usability based on observations
4. **Edge Cases** - Handle unusual sessions gracefully
5. **Browser Compatibility** - Verify in major browsers

This phase is ad-hoc and exploratory. Follow the test plan but also investigate anything unusual.

---

## Reference Documents

### Feature Specification
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/01-session-detail-core.feature.md`

All acceptance criteria should be verified.

### Technical Design
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/02-session-detail-core.tech-design.md`

Phase 5 section lists test sessions and verification activities.

---

## Test Plan

### Test Sessions

Use sessions with varying characteristics:

| Category | Session ID | Notes |
|----------|------------|-------|
| Small | Find a session with <10 turns | Verify navigation at edges |
| Medium | Find a session with 50-100 turns | Typical usage |
| Large | Find a session with 200+ turns | Performance, scrolling |
| Heavy Thinking | Find a thinking-intensive session | Purple band dominates |
| Heavy Tools | Find a tool-intensive session | Orange band dominates |
| Mixed | This current session | All content types |

To find sessions, look in `~/.claude/projects/` directories.

### Test Cases

#### TC-A: Session Loading

1. **Valid Session Load**
   - Enter a valid session ID
   - Click Load
   - Verify visualization appears at latest turn
   - Verify navigation controls show correct max turn

2. **Invalid Session ID**
   - Enter "not-a-uuid"
   - Click Load
   - Verify error message appears

3. **Non-existent Session**
   - Enter a valid UUID format that doesn't exist
   - Click Load
   - Verify 404-style error message

4. **Empty Session ID**
   - Leave input empty
   - Click Load
   - Verify error message

#### TC-B: Turn Navigation

1. **Left Button**
   - Load a session, navigate to turn 5
   - Click left button
   - Verify turn decrements to 4
   - Verify all controls sync

2. **Right Button**
   - From turn 4, click right button
   - Verify turn increments to 5

3. **Left Button Disabled**
   - Navigate to turn 0
   - Verify left button is disabled

4. **Right Button Disabled**
   - Navigate to max turn
   - Verify right button is disabled

5. **Turn Input**
   - Enter a specific turn number
   - Press Enter or blur
   - Verify navigation updates

6. **Turn Input Bounds**
   - Enter a number greater than max
   - Verify it clamps to max

7. **Slider**
   - Drag slider
   - Verify smooth updates
   - Verify other controls sync

8. **Rapid Navigation**
   - Click left/right rapidly
   - Verify no glitches or errors

#### TC-C: Visualization

1. **Band Display**
   - Verify 4 distinct colored bands
   - Verify colors match legend

2. **Token Proportions**
   - Find a turn with varied token distribution
   - Verify band heights reflect relative tokens

3. **Scale Input**
   - Change scale to different values
   - Verify bands resize proportionally

4. **Scale Bounds**
   - Enter value below 50
   - Verify clamps to 50
   - Enter value above 2000
   - Verify clamps to 2000

5. **Auto-Expand Warning**
   - Find or navigate to a turn with context > current scale
   - Verify warning appears
   - Verify scale auto-expands

6. **Token Labels**
   - Verify token counts display on/near bands
   - Verify formatting (k, M suffixes)

#### TC-D: Turn Detail Card

1. **Content Display**
   - Verify user prompt shows
   - Verify tool calls show (if any)
   - Verify assistant response shows

2. **Tool Truncation**
   - Find a turn with verbose tool calls
   - Verify first 2 lines + ellipsis

3. **Card Updates**
   - Navigate between turns
   - Verify card updates to show new turn's content

4. **Long Content**
   - Find a turn with very long content
   - Verify scrolling works
   - Verify no layout breaks

#### TC-E: Edge Cases

1. **Empty Turn**
   - If a turn has minimal content
   - Verify graceful display

2. **No Tool Calls**
   - Turn without tool calls
   - Verify tool section hidden or shows "None"

3. **No Thinking**
   - Session without thinking blocks
   - Verify thinking band shows 0 or is minimal

4. **Very Large Context**
   - Session with 500k+ tokens
   - Verify auto-expand handles it
   - Verify performance is acceptable

#### TC-F: Browser Compatibility

1. **Chrome** - Full test
2. **Firefox** - Basic test
3. **Safari** - Basic test (if on Mac)

---

## Common Issues to Look For

1. **Layout Breaks**
   - Content overflowing containers
   - Bands not aligning
   - Card not scrolling

2. **Performance**
   - Slow rendering on large sessions
   - Lag during navigation

3. **State Sync**
   - Controls out of sync after rapid navigation
   - Scale not updating correctly

4. **Error Handling**
   - Errors not displayed clearly
   - Console errors

5. **Accessibility**
   - Focus indicators
   - Keyboard navigation
   - Screen reader labels

---

## Refinement Checklist

Based on testing, consider these refinements:

- [ ] Loading indicator during API call
- [ ] Clearer error messages
- [ ] Better keyboard navigation
- [ ] Responsive design for smaller screens
- [ ] Improved color contrast
- [ ] Hover states for interactive elements
- [ ] Better tool content display
- [ ] Turn transition animation
- [ ] Cumulative stats summary

---

## Definition of Done

- [ ] All TC-A through TC-F test cases executed
- [ ] Issues documented with reproduction steps
- [ ] Critical issues fixed
- [ ] UX refinements applied
- [ ] Browser compatibility verified
- [ ] Final regression test passed
- [ ] All automated tests still pass

---

## Output Format

Upon completion, provide a report in this format:

```markdown
# Phase 5 Completion Report: Manual Test + UI Refinement

## Test Sessions Used
| Category | Session ID | Turns | Notes |
|----------|------------|-------|-------|
| Small | xxx-xxx | X | ... |
| Medium | xxx-xxx | X | ... |
| Large | xxx-xxx | X | ... |
| Heavy Thinking | xxx-xxx | X | ... |
| Heavy Tools | xxx-xxx | X | ... |

## Test Results Summary

### TC-A: Session Loading
| Test | Result | Notes |
|------|--------|-------|
| Valid Session Load | PASS/FAIL | ... |
| Invalid Session ID | PASS/FAIL | ... |
| Non-existent Session | PASS/FAIL | ... |
| Empty Session ID | PASS/FAIL | ... |

### TC-B: Turn Navigation
| Test | Result | Notes |
|------|--------|-------|
| Left Button | PASS/FAIL | ... |
| Right Button | PASS/FAIL | ... |
| ... | ... | ... |

### TC-C: Visualization
| Test | Result | Notes |
|------|--------|-------|
| Band Display | PASS/FAIL | ... |
| ... | ... | ... |

### TC-D: Turn Detail Card
| Test | Result | Notes |
|------|--------|-------|
| Content Display | PASS/FAIL | ... |
| ... | ... | ... |

### TC-E: Edge Cases
| Test | Result | Notes |
|------|--------|-------|
| ... | ... | ... |

### TC-F: Browser Compatibility
| Browser | Result | Notes |
|---------|--------|-------|
| Chrome | PASS/FAIL | ... |
| Firefox | PASS/FAIL | ... |
| Safari | PASS/FAIL | ... |

## Issues Found

### Critical Issues
| Issue | Reproduction | Fix Applied |
|-------|--------------|-------------|
| ... | ... | ... |

### Minor Issues
| Issue | Reproduction | Status |
|-------|--------------|--------|
| ... | ... | Fixed/Deferred |

## UX Refinements Applied
- [ ] Refinement 1: description
- [ ] Refinement 2: description
- [ ] ...

## Definition of Done Checklist
- [ ] All test cases executed
- [ ] Issues documented
- [ ] Critical issues fixed
- [ ] UX refinements applied
- [ ] Browser compatibility verified
- [ ] Final regression passed
- [ ] Automated tests pass: X/Y

## Files Modified
- [ ] `file1.js` - description of change
- [ ] `file2.ejs` - description of change

## Implementation Notes
[Any notes about issues found, fixes applied, or decisions made]

## Feedback & Recommendations
[Observations about the app, phase spec, feature design, or general recommendations for future work]

### For 007-session-detail-refine
[Specific recommendations or considerations for the next feature phase based on what was learned]
```
