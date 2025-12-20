# Copilot Session LLM Compression

## User Story

As a developer using GitHub Copilot, I want to clone sessions with LLM-based message compression so that I can reduce context window usage while preserving the meaning of my conversation history.

## Current Flow

1. User selects a Copilot session to clone
2. User configures compression bands (e.g., 0-25% heavy, 25-50% regular)
3. User clicks Clone
4. System removes the oldest N% of turns based on total band coverage
5. Removed turns are deleted entirely - their content is lost
6. Cloned session has fewer turns and no summarization

## Desired Flow

1. User selects a Copilot session to clone
2. User configures compression bands (e.g., 0-25% heavy, 25-50% regular)
3. User clicks Clone
4. System identifies turns in each compression band
5. System sends turns to LLM provider for summarization
6. LLM returns compressed summaries preserving key information
7. System builds cloned session with compressed versions of those turns
8. Cloned session has reduced token usage while preserving conversation context

## Reference Implementation

Copilot session compression should work exactly like Claude session compression. The existing Claude clone feature uses LLM-based summarization with compression bands. The Copilot clone should use the same approach, adapted for Copilot's message format.

## Acceptance Criteria

- [ ] Copilot clone uses LLM provider to compress messages
- [ ] Compression bands are respected (heavy vs regular compression levels)
- [ ] User and assistant messages are summarized appropriately
- [ ] Tool call information is preserved or summarized
- [ ] Clone operation shows progress during LLM compression
- [ ] Compression stats reflect actual token reduction from summarization
- [ ] Debug logging shows compression activity
- [ ] Original session is unchanged; compression applies only to the clone

## Tests to Add

| Test | Purpose |
|------|---------|
| Clone with compression bands invokes LLM provider | Verify LLM is called for compression |
| Clone respects heavy vs regular compression levels | Different prompts for different bands |
| Clone preserves tool call information in summaries | Tool context not lost |
| Clone returns accurate token reduction stats | Stats reflect actual summarization |
| Clone with compression shows progress | UI feedback during LLM calls |

## Tests to Modify

| Test | Changes |
|------|---------|
| Existing turn removal tests | Update to reflect turn removal as fallback when no LLM configured |

## Tests to Remove

None.
