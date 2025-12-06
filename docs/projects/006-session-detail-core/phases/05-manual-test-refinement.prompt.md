# Phase 5: Collaborative Manual Testing

## Overview

This is a collaborative testing session between us. I'll run backend checks and provide you with URLs/session IDs. You'll verify the frontend. We'll work through issues together in real-time.

---

## Test Sessions

These sessions are confirmed to exist and have varied characteristics:

| Session ID | Description | Use For |
|------------|-------------|---------|
| `84e0d3f1-f2ee-4560-87da-05ae7f33a6f0` | Large session, many turns | General testing, navigation |
| `b507f294-b58a-4088-bae4-2815040e4a07` | Heavy tools/thinking | Visualization balance |
| `122e1483-0ac1-463e-a776-b12f879f35cf` | Multi-turn conversation | Turn navigation |

---

## Part 1: Pre-Flight (I do)

Before we start, I'll verify:

1. **Server running** - `curl http://localhost:3000/`
2. **API endpoint works** - `curl http://localhost:3000/api/session/{id}/turns`
3. **Page loads** - `curl http://localhost:3000/session-detail`
4. **Automated tests pass** - `npm test`

I'll report results before we proceed.

---

## Part 2: Backend Verification (I do)

I'll test the API with curl and show you the results:

```bash
# Valid session
curl -s http://localhost:3000/api/session/84e0d3f1-f2ee-4560-87da-05ae7f33a6f0/turns | head -c 500

# Invalid UUID format
curl -s http://localhost:3000/api/session/not-a-uuid/turns

# Non-existent session
curl -s http://localhost:3000/api/session/00000000-0000-0000-0000-000000000000/turns
```

Expected:
- Valid → 200 with turn data
- Invalid UUID → 400
- Non-existent → 404

---

## Part 3: Frontend Testing (You do)

### 3.1 Basic Load

1. Open: http://localhost:3000/session-detail
2. Verify page loads with empty state
3. Enter session ID: `84e0d3f1-f2ee-4560-87da-05ae7f33a6f0`
4. Click Load

**Tell me:**
- Does the visualization appear?
- What turn number shows?
- Any errors in console?

### 3.2 Query Param Load

1. Open: http://localhost:3000/session-detail?id=84e0d3f1-f2ee-4560-87da-05ae7f33a6f0
2. Verify it auto-loads the session

**Tell me:**
- Did it auto-load?
- Or did you have to click Load?

### 3.3 Turn Navigation

With a session loaded:

1. Click left arrow - does turn decrement?
2. Click right arrow - does turn increment?
3. Type a number in turn input - does it jump?
4. Drag slider - does it update?
5. Go to turn 0 - is left arrow disabled?
6. Go to max turn - is right arrow disabled?

**Tell me:**
- Do all controls stay in sync?
- Any lag or glitches?

### 3.4 Visualization

1. Look at the 4 colored bands (User, Assistant, Thinking, Tool)
2. Change scale input (try 100, 500, 1000)
3. Navigate between turns

**Tell me:**
- Do bands resize when scale changes?
- Do band heights change between turns?
- Does legend match band colors?

### 3.5 Turn Detail Card

1. Look at the card below visualization
2. Navigate to different turns

**Tell me:**
- Do you see user prompt?
- Do you see tool calls (if any)?
- Do you see assistant response?
- Does card update when you change turns?

---

## Part 4: Integration Scenarios

### Scenario 1: Error Handling

1. Enter invalid UUID: `not-a-uuid`
2. Click Load

**Expected:** Error message appears
**Tell me:** What do you see?

### Scenario 2: Non-existent Session

1. Enter: `00000000-0000-0000-0000-000000000000`
2. Click Load

**Expected:** "Session not found" message
**Tell me:** What do you see?

### Scenario 3: Heavy Session

1. Load: `b507f294-b58a-4088-bae4-2815040e4a07`
2. Navigate through turns

**Tell me:**
- How do the bands look? Which color dominates?
- Is navigation smooth or laggy?

### Scenario 4: Scale Auto-Expand

1. Load any session
2. Set scale to 50
3. Navigate to later turns

**Expected:** If context exceeds 50k, warning appears and scale expands
**Tell me:** Does this happen?

### Scenario 5: Rapid Navigation

1. Load a session with many turns
2. Click left/right arrows rapidly (10+ times fast)

**Tell me:**
- Does it keep up?
- Any errors or freezing?

---

## Part 5: Issue Tracking

As we find issues, I'll track them here:

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

For each issue you report, I'll either:
- Fix it immediately
- Note it for later
- Explain why it's expected behavior

---

## Part 6: Sign-Off Checklist

We'll check these off together:

**Backend:**
- [ ] API returns 200 for valid session
- [ ] API returns 400 for invalid UUID
- [ ] API returns 404 for non-existent session

**Frontend - Loading:**
- [ ] Page loads at /session-detail
- [ ] Session loads on button click
- [ ] Query param ?id= auto-loads session
- [ ] Error messages display for invalid input

**Frontend - Navigation:**
- [ ] Turn input works
- [ ] Left/right buttons work
- [ ] Slider works
- [ ] All controls stay in sync
- [ ] Boundary conditions handled (turn 0, max turn)

**Frontend - Visualization:**
- [ ] 4 colored bands display
- [ ] Colors match legend
- [ ] Band heights reflect token proportions
- [ ] Scale input adjusts visualization
- [ ] Auto-expand warning works

**Frontend - Detail Card:**
- [ ] User prompt displays
- [ ] Tool calls display (truncated)
- [ ] Assistant response displays
- [ ] Card updates on turn change

---

## Ready to Start

When you're ready, I'll:
1. Start the server (if not running)
2. Run pre-flight checks
3. Test backend endpoints
4. Give you the go-ahead to start frontend testing

Say "go" and we'll begin.
