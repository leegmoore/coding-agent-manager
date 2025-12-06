# Phase 1: Skeleton + lib/ Layer

## Goal

Create the directory structure and implement the pure function layer (`lib/`) with full TDD coverage.

## Scope

- Create `public/js/lib/`, `public/js/api/`, `public/js/ui/`, `public/js/pages/` directories
- Create `test/js/lib/` directory
- Implement `lib/validation.js` with TDD
- Implement `lib/transforms.js` with TDD
- Existing UI remains unchanged and functional

---

## Implementation

### Step 1: Create Directory Structure

```bash
mkdir -p public/js/lib public/js/api public/js/ui public/js/pages
mkdir -p test/js/lib test/js/api test/js/ui
```

### Step 2: lib/validation.js (TDD)

#### 2.1 Write Tests First

**File:** `test/js/lib/validation.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import { validateUUID } from '../../../public/js/lib/validation.js';

describe('validateUUID', () => {
  it('returns true for valid UUID v4 format', () => {
    expect(validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4')).toBe(true);
  });

  it('returns true for uppercase UUID', () => {
    expect(validateUUID('00A61603-C2EA-4D4C-AEE8-4A292AB7B3F4')).toBe(true);
  });

  it('returns false for invalid format - missing segment', () => {
    expect(validateUUID('00a61603-c2ea-4d4c-aee8')).toBe(false);
  });

  it('returns false for invalid format - wrong characters', () => {
    expect(validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3fz')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateUUID('')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(validateUUID(null)).toBe(false);
    expect(validateUUID(undefined)).toBe(false);
    expect(validateUUID(123)).toBe(false);
  });

  it('returns false for string with extra characters', () => {
    expect(validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4-extra')).toBe(false);
  });

  // Whitespace-padded UUIDs should fail - callers must trim before validating
  it('returns false for whitespace-padded UUID', () => {
    expect(validateUUID(' 00a61603-c2ea-4d4c-aee8-4a292ab7b3f4')).toBe(false);
    expect(validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4 ')).toBe(false);
    expect(validateUUID(' 00a61603-c2ea-4d4c-aee8-4a292ab7b3f4 ')).toBe(false);
  });
});
```

#### 2.2 Verify Tests Fail (Red)

```bash
npm test -- test/js/lib/validation.test.js
# Should fail: Cannot find module
```

#### 2.3 Implement to Pass (Green)

**File:** `public/js/lib/validation.js`

```javascript
/**
 * Validates UUID format (v4 style)
 * @param {string} id - String to validate
 * @returns {boolean} True if valid UUID format
 */
export function validateUUID(id) {
  if (typeof id !== 'string') return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(id);
}
```

#### 2.4 Verify Tests Pass (Green)

```bash
npm test -- test/js/lib/validation.test.js
# All tests should pass
```

---

### Step 3: lib/transforms.js (TDD)

#### 3.1 Write Tests First

**File:** `test/js/lib/transforms.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import { extractSessionId, formatStats } from '../../../public/js/lib/transforms.js';

describe('extractSessionId', () => {
  it('extracts UUID from full path', () => {
    const path = '/Users/leemoore/.claude/projects/-Users-leemoore/00a61603-c2ea-4d4c-aee8-4a292ab7b3f4.jsonl';
    expect(extractSessionId(path)).toBe('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4');
  });

  it('returns empty string for empty input', () => {
    expect(extractSessionId('')).toBe('');
  });

  it('returns input unchanged if no .jsonl extension', () => {
    expect(extractSessionId('no-extension')).toBe('no-extension');
  });

  it('handles path with only separator', () => {
    expect(extractSessionId('/')).toBe('');
  });

  it('handles path with different project directory', () => {
    const path = '/home/user/.claude/projects/-home-user-code/abc12345-1234-5678-9abc-def012345678.jsonl';
    expect(extractSessionId(path)).toBe('abc12345-1234-5678-9abc-def012345678');
  });

  // Note: In JS strings, \\ represents a single backslash. This test verifies
  // the splitting logic handles backslash separators, not actual Windows path handling.
  // At runtime, paths would contain single backslashes.
  it('handles Windows-style paths', () => {
    const path = 'C:\\Users\\user\\.claude\\projects\\-C-Users-user\\abc12345-1234-5678-9abc-def012345678.jsonl';
    expect(extractSessionId(path)).toBe('abc12345-1234-5678-9abc-def012345678');
  });

  it('handles filename only', () => {
    const path = '00a61603-c2ea-4d4c-aee8-4a292ab7b3f4.jsonl';
    expect(extractSessionId(path)).toBe('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4');
  });
});

describe('formatStats', () => {
  it('formats stats object to array of label/value pairs', () => {
    const stats = {
      originalTurnCount: 18,
      outputTurnCount: 15,
      toolCallsRemoved: 5,
      thinkingBlocksRemoved: 3,
    };

    const result = formatStats(stats);

    expect(result).toEqual([
      { label: 'Original turns', value: 18 },
      { label: 'Output turns', value: 15 },
      { label: 'Tool calls removed', value: 5 },
      { label: 'Thinking blocks removed', value: 3 },
    ]);
  });

  it('handles zero values', () => {
    const stats = {
      originalTurnCount: 10,
      outputTurnCount: 10,
      toolCallsRemoved: 0,
      thinkingBlocksRemoved: 0,
    };

    const result = formatStats(stats);

    expect(result[2]).toEqual({ label: 'Tool calls removed', value: 0 });
    expect(result[3]).toEqual({ label: 'Thinking blocks removed', value: 0 });
  });
});
```

#### 3.2 Verify Tests Fail (Red)

```bash
npm test -- test/js/lib/transforms.test.js
# Should fail: Cannot find module
```

#### 3.3 Implement to Pass (Green)

**File:** `public/js/lib/transforms.js`

```javascript
/**
 * Extracts session ID from file path
 * @param {string} outputPath - Full path to session file
 * @returns {string} Session UUID
 */
export function extractSessionId(outputPath) {
  // Handle both Unix and Windows path separators
  const parts = outputPath.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  return filename.replace(/\.jsonl$/, '');
}

/**
 * Formats stats for display
 * @param {Object} stats - Stats object from API
 * @returns {Array<{label: string, value: number}>} Formatted stats
 */
export function formatStats(stats) {
  return [
    { label: 'Original turns', value: stats.originalTurnCount },
    { label: 'Output turns', value: stats.outputTurnCount },
    { label: 'Tool calls removed', value: stats.toolCallsRemoved },
    { label: 'Thinking blocks removed', value: stats.thinkingBlocksRemoved },
  ];
}
```

#### 3.4 Verify Tests Pass (Green)

```bash
npm test -- test/js/lib/transforms.test.js
# All tests should pass
```

---

### Step 4: Verify Existing UI

```bash
npm run dev
# Visit http://localhost:3000
# Test clone operation - should work unchanged
```

---

## Verification Checklist

- [ ] Directory structure created: `public/js/{lib,api,ui,pages}/`
- [ ] Directory structure created: `test/js/{lib,api,ui}/`
- [ ] `lib/validation.js` implemented with `validateUUID()`
- [ ] `lib/transforms.js` implemented with `extractSessionId()`, `formatStats()`
- [ ] `test/js/lib/validation.test.js` - all tests pass
- [ ] `test/js/lib/transforms.test.js` - all tests pass
- [ ] Existing backend tests still pass
- [ ] Existing UI works unchanged

## Test Commands

```bash
# Run just Phase 1 tests
npm test -- test/js/lib/

# Run all tests (backend + Phase 1)
npm test

# Verify test count
npm test -- --reporter=verbose
```

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/lib/validation.js` | ~10 | UUID validation |
| `public/js/lib/transforms.js` | ~25 | Data transforms |
| `test/js/lib/validation.test.js` | ~40 | Validation tests |
| `test/js/lib/transforms.test.js` | ~50 | Transform tests |

## Next Phase

Phase 2: api/ + ui/ Layers - Implement HTTP client and DOM utilities with jsdom testing.
