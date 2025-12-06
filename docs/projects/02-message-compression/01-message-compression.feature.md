# Feature: Message Compression for Session Cloning

## Profile

**As an** AI Enabled Software Engineer
**I want to** compress older messages in my Claude Code session history by configurable bands
**So that** I can reclaim context window space while preserving the semantic meaning of prior conversation, enabling longer productive sessions without losing important context.

---

## Scope

### In Scope

This feature creates a new v2 clone endpoint (`POST /api/v2/clone`) that extends the existing clone functionality with LLM-based compression of messages within configurable percentage bands. The existing v1 endpoint remains unchanged and fully operational. Each band specifies a start/end percentage (oldest to newest) and a compression level. Messages within a band are individually compressed via an external LLM (OpenRouter), with compression targeting either ~10% (heavy) or ~30-40% (standard) of original token count. Turns (user message plus assistant response) are kept together in the same compression band. The feature includes batched parallel processing with timeout-based retry logic, token tracking before and after compression, and graceful handling of compression failures.

### Out of Scope

This feature does not include UI changes - it is API-only for now. The existing v1 clone endpoint is not modified. It does not correlate compression bands with existing tool/thinking removal bands; these remain independent options. Message merging (collapsing multiple messages into one) is a future feature. Per-turn or per-message compression level overrides are not supported; compression is applied uniformly within each band. Real-time streaming of compression progress is not included. Model/prompt tuning and A/B testing infrastructure are not part of this feature.

---

## Acceptance Criteria

### Request Format

- AC-1: A new endpoint `POST /api/v2/clone` accepts all existing clone parameters plus an optional `compressionBands` array
- AC-2: Each band specifies `start` (0-100), `end` (0-100), and `level` ("compress" | "heavy-compress")
- AC-3: Bands may be non-contiguous; unspecified ranges receive no compression
- AC-4: Overlapping bands are rejected with a validation error
- AC-5: The existing `toolRemoval` and `thinkingRemoval` options continue to work independently
- AC-6: The existing `POST /api/clone` endpoint remains unchanged and fully functional

### Compression Behavior

- AC-7: User messages and assistant messages within compression bands are compressed
- AC-8: Messages shorter than the minimum token threshold (default 20 tokens) are not compressed
- AC-9: Compression level "heavy-compress" targets approximately 10% of original message length
- AC-10: Compression level "compress" targets approximately 30-40% of original message length
- AC-11: Each message is compressed via a separate LLM call returning JSON with the compressed text
- AC-12: Compression responses are validated against a Zod schema; malformed responses are treated as failures and retried
- AC-13: Turns are kept together - if a user message falls in a band, its corresponding assistant response is in the same band
- AC-14: Band boundaries align to turn boundaries with sensible rounding

### Processing and Reliability

- AC-15: Messages are processed in parallel batches with configurable concurrency (default 10)
- AC-16: Individual compression calls have a timeout (default 5 seconds)
- AC-17: Failed or timed-out compressions are retried in subsequent batches with increased timeout
- AC-18: After maximum retry attempts (default 4), failed messages are left uncompressed with a warning logged
- AC-19: Messages over a token threshold (default 1000 tokens) use thinking mode (`google/gemini-2.5-flash:thinking`) for compression

### Response Format

- AC-20: The response includes compression statistics: messages compressed, original tokens, compressed tokens, tokens removed, reduction percentage
- AC-21: The response includes counts of any messages that failed compression after all retries
- AC-22: The cloned session file is written with compressed content replacing original content

### Configuration

- AC-23: OpenRouter API key is configured via environment variable
- AC-24: Compression model, concurrency, timeouts, and thresholds are configurable via environment variables

---

## Test Conditions

### TC-01: Basic Compression Band
Given a session with 100 turns and a request specifying compression band 0-50% at "compress" level, then approximately the oldest 50 turns have their messages compressed to ~30-40% of original length while the newest 50 turns remain unchanged.

### TC-02: Heavy Compression Band
Given a session and a request specifying band 0-25% at "heavy-compress" level, then messages in that band are compressed to approximately 10% of original length.

### TC-03: Multiple Non-Contiguous Bands
Given a request with bands [0-30%: heavy-compress, 50-80%: compress], then messages in 0-30% are heavily compressed, messages in 30-50% are unchanged, messages in 50-80% are standard compressed, and messages in 80-100% are unchanged.

### TC-04: Turn Cohesion
Given a turn that straddles a band boundary, both the user message and assistant response are placed in the same band and receive the same compression treatment.

### TC-05: Minimum Token Threshold
Given a message with fewer than 20 tokens in a compression band, that message is not sent for compression and remains unchanged.

### TC-06: Compression Timeout and Retry
Given a compression call that times out, that message is included in the next batch with an increased timeout, up to maximum retries.

### TC-07: Maximum Retry Exceeded
Given a message that fails compression after 4 attempts, the message is left uncompressed, a warning is logged, and the clone operation completes successfully.

### TC-08: Token Statistics
Given a successful clone with compression, the response includes accurate counts of original tokens, compressed tokens, and calculated reduction percentage.

### TC-09: Thinking Mode Threshold
Given a message exceeding 1000 tokens in a compression band, the compression call uses thinking mode for that message.

### TC-10: Empty Compression Bands
Given a request with no compressionBands specified, the clone proceeds with only tool/thinking removal as before (no compression).

### TC-11: Overlapping Bands Rejected
Given a request with overlapping bands (e.g., 0-50% and 40-70%), the API returns a 400 validation error.

### TC-12: Combined with Tool Removal
Given a request with both compressionBands and toolRemoval specified, both operations are applied: tool calls are removed from specified percentage, and remaining messages are compressed according to bands.

### TC-13: Parallel Batch Processing
Given 50 messages to compress with concurrency of 10, messages are processed in batches of 10, with failed items rolling into subsequent batches.

### TC-14: API Key Missing
Given no OpenRouter API key configured, compression requests return an error indicating configuration is required.

### TC-15: Malformed Compression Response
Given an LLM response that does not match the expected JSON schema, the compression is treated as a failure and retried according to the retry logic.
