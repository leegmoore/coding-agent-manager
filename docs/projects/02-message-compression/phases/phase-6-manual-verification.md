# Phase 6: Manual Verification

## Goal

Test with real OpenRouter API against real Claude Code sessions.

## Context

**Project:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/`

All automated tests pass. Now verify with real sessions and real API calls.

## Prerequisites

1. OpenRouter API key in `.env.local`: `OPENROUTER_API_KEY=sk-or-v1-...`
2. Server running: `npm run dev`

---

## Finding Test Sessions

Use this command to find sessions with sufficient turns:

```bash
# Find sessions with 20+ user messages (proxy for turns)
for f in ~/.claude/projects/*/*.jsonl; do
  turns=$(grep -c '"type":"user"' "$f" 2>/dev/null || echo 0)
  size=$(wc -l < "$f" 2>/dev/null || echo 0)
  if [ "$turns" -gt 20 ]; then
    basename=$(basename "$f" .jsonl)
    echo "$basename: $turns turns, $size lines"
  fi
done | head -5
```

Pick a session ID from the output for testing.

---

## Manual Test Cases

### Test 1: Basic Compression

**Objective:** Verify compression reduces token count and session loads.

**Steps:**

1. Clone with 50% compression:
   ```bash
   curl -X POST http://localhost:3000/api/v2/clone \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "<session-id>",
       "compressionBands": [{"start": 0, "end": 50, "level": "compress"}]
     }' | jq .
   ```

2. Record stats:
   - `messagesCompressed`
   - `originalTokens`
   - `compressedTokens`
   - `reductionPercent`

3. Resume session:
   ```bash
   claude --dangerously-skip-permissions --resume <new-session-id>
   ```

4. Verify quality (see Quality Checklist below)

**Expected:**
- `reductionPercent`: 60-70%
- Session loads successfully
- Compressed messages are readable

---

### Test 2: Heavy Compression

**Objective:** Verify heavy compression achieves >80% reduction.

**Steps:**

1. Clone with heavy compression:
   ```bash
   curl -X POST http://localhost:3000/api/v2/clone \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "<session-id>",
       "compressionBands": [{"start": 0, "end": 50, "level": "heavy-compress"}]
     }' | jq .
   ```

2. Compare to Test 1:
   - `reductionPercent` should be higher (target >80%)
   - `compressedTokens` should be lower

3. Resume and verify quality

**Expected:**
- `reductionPercent`: 85-90%
- Messages more aggressively compressed
- Still readable and coherent

---

### Test 3: Multiple Bands

**Objective:** Verify non-contiguous bands work correctly.

**Steps:**

1. Clone with multiple bands:
   ```bash
   curl -X POST http://localhost:3000/api/v2/clone \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "<session-id>",
       "compressionBands": [
         {"start": 0, "end": 30, "level": "heavy-compress"},
         {"start": 50, "end": 80, "level": "compress"}
       ]
     }' | jq .
   ```

2. Resume session and scroll through history

3. Visually verify:
   - Oldest ~30% heavily compressed (very brief)
   - Middle 30-50% unchanged (original length)
   - Next 50-80% moderately compressed
   - Newest 80-100% unchanged

**Expected:**
- Different compression levels visible
- Uncompressed ranges remain full length

---

### Test 4: Combined Operations

**Objective:** Verify compression + tool removal + thinking removal all work together.

**Steps:**

1. Clone with all options:
   ```bash
   curl -X POST http://localhost:3000/api/v2/clone \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "<session-id>",
       "toolRemoval": "75",
       "thinkingRemoval": "75",
       "compressionBands": [{"start": 0, "end": 100, "level": "compress"}]
     }' | jq .
   ```

2. Verify response stats show:
   - `toolCallsRemoved` > 0
   - `thinkingBlocksRemoved` > 0
   - `compression.messagesCompressed` > 0

3. Resume and verify maximum context reclamation

**Expected:**
- All three operations recorded in stats
- Significant total reduction
- Session still usable

---

### Test 5: Thinking Mode

**Objective:** Verify long messages trigger thinking mode.

**Steps:**

1. Add debug logging to `src/services/openrouter-client.ts`:
   ```typescript
   async compress(text: string, level: CompressionLevel, useThinking: boolean): Promise<string> {
     console.log(`[OpenRouter] Model: ${useThinking ? this.modelThinking : this.model}, useThinking: ${useThinking}`);
     // ... rest of method
   }
   ```

2. Clone session with long messages:
   ```bash
   curl -X POST http://localhost:3000/api/v2/clone \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "<session-with-long-messages>",
       "compressionBands": [{"start": 0, "end": 100, "level": "compress"}]
     }'
   ```

3. Check server logs for:
   ```
   [OpenRouter] Model: google/gemini-2.5-flash:thinking, useThinking: true
   ```

**Expected:**
- Messages >4000 characters (~1000 tokens) use thinking model
- Log shows `:thinking` suffix

---

### Test 6: Failure Handling

**Objective:** Verify graceful handling when compressions fail.

**Steps:**

1. Set very low timeout to force failures:
   ```bash
   COMPRESSION_TIMEOUT_INITIAL=100 npm run dev
   ```

2. Clone a session:
   ```bash
   curl -X POST http://localhost:3000/api/v2/clone \
     -H "Content-Type: application/json" \
     -d '{
       "sessionId": "<session-id>",
       "compressionBands": [{"start": 0, "end": 100, "level": "compress"}]
     }' | jq .
   ```

3. Verify:
   - `messagesFailed` > 0
   - Clone still completes (success: true)
   - Session file created

4. Resume session

**Expected:**
- Clone completes despite failures
- Failed messages remain uncompressed
- Session loads normally

---

## Quality Verification Checklist

For each compressed message, verify:

- [ ] **Named entities preserved** - People names, product names, file paths unchanged
- [ ] **Numeric values preserved** - Dates, counts, line numbers, version numbers intact
- [ ] **Code references preserved** - Function names, variable names, file names unchanged
- [ ] **No factual contradictions** - Compressed text doesn't introduce false information
- [ ] **Readable standalone** - No orphan references like "as mentioned above" without context
- [ ] **Technical terms preserved** - API names, technical concepts unchanged

## Token Reduction Targets

| Level | Expected Reduction | Pass Threshold |
|-------|-------------------|----------------|
| compress | 60-70% | >50% |
| heavy-compress | 85-90% | >80% |

If reduction is significantly lower, compression quality may be poor.

---

## Performance Expectations

| Messages | Expected Time | Max Acceptable |
|----------|---------------|----------------|
| 10 | <10s | 20s |
| 50 | <30s | 60s |
| 100 | <60s | 120s |

Times include network latency to OpenRouter. Actual performance depends on:
- Message length
- Network conditions
- OpenRouter load

---

## Documentation

Create `docs/compression-verification-results.md` with:

```markdown
# Compression Verification Results

## Test Environment
- Date: YYYY-MM-DD
- Model: google/gemini-2.5-flash
- Session tested: [session-id]
- Original session: X turns, Y tokens

## Test Results

### Test 1: Basic Compression (0-50%, compress)
- Original tokens: X
- Compressed tokens: Y
- Reduction: Z%
- Duration: Xs
- Quality: PASS/FAIL
- Notes: ...

### Test 2: Heavy Compression (0-50%, heavy-compress)
- Original tokens: X
- Compressed tokens: Y
- Reduction: Z%
- Quality: PASS/FAIL
- Notes: ...

### Test 3: Multiple Bands
- Bands tested: [0-30: heavy, 50-80: compress]
- Different levels visually verified: YES/NO
- Notes: ...

### Test 4: Combined Operations
- Tool removal: Y calls removed
- Thinking removal: Z blocks removed
- Compression: W messages compressed
- Total reduction: X%
- Notes: ...

### Test 5: Thinking Mode
- Long messages (>1000 tokens): X found
- Thinking mode used: YES/NO (verified in logs)
- Notes: ...

### Test 6: Failure Handling
- Failures simulated: YES/NO
- Clone completed: YES/NO
- Failed count: X
- Notes: ...

## Quality Assessment

### Semantic Preservation
[Overall assessment of whether compressed messages preserve key information]

### Common Issues Found
- Issue 1: ...
- Issue 2: ...

### Readability
[Assessment of whether compressed text is fluent and coherent]

## Performance Metrics

- Average compression time per message: Xms
- Timeout rate: X%
- Retry rate: X%
- Total time for 100-message session: Xs

## Recommended Settings

Based on testing:
- Optimal concurrency: X
- Recommended timeout initial: Xms
- Best compression level for conversations: compress/heavy-compress
- Suggested band configurations: ...

## Conclusion

[Overall assessment of compression feature readiness]
```

---

## Verification Checklist

- [ ] Test 1: Basic compression - reduction 60-70%, quality PASS
- [ ] Test 2: Heavy compression - reduction >80%, quality acceptable
- [ ] Test 3: Multiple bands - different levels visible
- [ ] Test 4: Combined operations - all three work, no conflicts
- [ ] Test 5: Thinking mode - confirmed in logs for long messages
- [ ] Test 6: Failure handling - clone completes despite errors
- [ ] All cloned sessions load in Claude Code
- [ ] Can resume and continue working in cloned sessions
- [ ] Results documented in `docs/compression-verification-results.md`

## Notes

- Manual verification is subjective but uses objective checklist
- Test with real sessions to find edge cases
- Document any unexpected behavior
- If compression quality is poor, iterate on prompt template
