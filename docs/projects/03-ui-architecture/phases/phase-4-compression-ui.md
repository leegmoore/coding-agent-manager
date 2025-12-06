# Phase 4: Compression UI Integration

## Goal

Add compression controls to the clone UI using the layered architecture from Phases 1-3. Users can configure compression bands and view debug logs.

## Prerequisites

- Phase 1-3 complete (layered UI architecture)
- Project 2 compression API complete (`POST /api/v2/clone`)

## Scope

- Extend `lib/validation.js` with band validation functions
- Extend `lib/transforms.js` with compression stats formatting
- Extend `ui/notifications.js` with compression results display
- Add new `lib/compression.js` for band building logic
- Update `pages/clone.js` to use v2 endpoint with compression
- Update HTML with compression inputs and debug log checkbox
- Add static route for debug logs

---

## Architecture Integration

### New Files

| File | Layer | Purpose |
|------|-------|---------|
| `public/js/lib/compression.js` | lib | `validateBands()`, `buildCompressionBands()`, `formatBandPreview()` |
| `test/js/lib/compression.test.js` | test | Unit tests for compression functions |

### Modified Files

| File | Changes |
|------|---------|
| `public/js/lib/transforms.js` | Add `formatCompressionStats()` |
| `test/js/lib/transforms.test.js` | Add compression stats tests |
| `public/js/pages/clone.js` | Add compression UI logic, switch to v2 endpoint |
| `public/css/styles.css` | Add validation error styles |
| `views/pages/clone.ejs` | Add compression inputs, debug checkbox, stats display |
| `src/server.ts` | Add static route for debug logs |

---

## Implementation

### Step 1: lib/compression.js (TDD)

**File:** `test/js/lib/compression.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import { validateBands, buildCompressionBands, formatBandPreview } from '../../../public/js/lib/compression.js';

describe('validateBands', () => {
  it('returns valid for both empty', () => {
    const result = validateBands('', '');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns error for Band 1 only', () => {
    const result = validateBands('50', '');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Both bands required or both empty');
  });

  it('returns error for Band 2 only', () => {
    const result = validateBands('', '50');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Both bands required or both empty');
  });

  it('returns valid for both set correctly', () => {
    const result = validateBands('35', '75');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns error for Band 1 = 0', () => {
    const result = validateBands('0', '50');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 1 must be between 1 and 99');
  });

  it('returns error for Band 1 >= 100', () => {
    const result = validateBands('100', '100');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 1 must be between 1 and 99');
  });

  it('returns error for Band 2 <= Band 1', () => {
    const result = validateBands('60', '40');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 2 must be greater than Band 1');
  });

  it('returns error for Band 2 > 100', () => {
    const result = validateBands('50', '101');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 2 must be 100 or less');
  });

  it('returns error for non-integer Band 1', () => {
    const result = validateBands('35.5', '75');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 1 must be a whole number');
  });

  it('returns error for non-integer Band 2', () => {
    const result = validateBands('35', '75.5');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band 2 must be a whole number');
  });

  it('returns multiple errors when applicable', () => {
    const result = validateBands('0', '101');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('buildCompressionBands', () => {
  it('returns null for empty inputs', () => {
    expect(buildCompressionBands('', '')).toBeNull();
  });

  it('builds correct bands array', () => {
    const bands = buildCompressionBands('35', '75');
    expect(bands).toEqual([
      { start: 0, end: 35, level: 'heavy-compress' },
      { start: 35, end: 75, level: 'compress' },
    ]);
  });

  it('handles Band 2 = 100', () => {
    const bands = buildCompressionBands('50', '100');
    expect(bands).toEqual([
      { start: 0, end: 50, level: 'heavy-compress' },
      { start: 50, end: 100, level: 'compress' },
    ]);
  });
});

describe('formatBandPreview', () => {
  it('returns empty message for no bands', () => {
    expect(formatBandPreview('', '')).toBe('No compression');
  });

  it('formats preview with uncompressed remainder', () => {
    expect(formatBandPreview('35', '75')).toBe('0-35% heavy | 35-75% compress | 75-100% none');
  });

  it('formats preview with full compression', () => {
    expect(formatBandPreview('50', '100')).toBe('0-50% heavy | 50-100% compress');
  });
});
```

**File:** `public/js/lib/compression.js`

```javascript
/**
 * Validates compression band inputs
 * @param {string} band1 - Band 1 end percentage (or empty)
 * @param {string} band2 - Band 2 end percentage (or empty)
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateBands(band1, band2) {
  const errors = [];
  const b1 = band1.trim();
  const b2 = band2.trim();

  // Both empty is valid
  if (b1 === '' && b2 === '') {
    return { valid: true, errors: [] };
  }

  // One set, one empty is invalid
  if ((b1 === '' && b2 !== '') || (b1 !== '' && b2 === '')) {
    errors.push('Both bands required or both empty');
    return { valid: false, errors };
  }

  const num1 = Number(b1);
  const num2 = Number(b2);

  // Check integers
  if (!Number.isInteger(num1)) {
    errors.push('Band 1 must be a whole number');
  }
  if (!Number.isInteger(num2)) {
    errors.push('Band 2 must be a whole number');
  }

  // Check Band 1 range
  if (Number.isInteger(num1) && (num1 < 1 || num1 >= 100)) {
    errors.push('Band 1 must be between 1 and 99');
  }

  // Check Band 2 > Band 1
  if (Number.isInteger(num1) && Number.isInteger(num2) && num2 <= num1) {
    errors.push('Band 2 must be greater than Band 1');
  }

  // Check Band 2 <= 100
  if (Number.isInteger(num2) && num2 > 100) {
    errors.push('Band 2 must be 100 or less');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Builds compression bands array for API
 * @param {string} band1 - Band 1 end percentage
 * @param {string} band2 - Band 2 end percentage
 * @returns {Array|null} Bands array or null if no compression
 */
export function buildCompressionBands(band1, band2) {
  const b1 = band1.trim();
  const b2 = band2.trim();

  if (b1 === '' && b2 === '') {
    return null;
  }

  return [
    { start: 0, end: Number(b1), level: 'heavy-compress' },
    { start: Number(b1), end: Number(b2), level: 'compress' },
  ];
}

/**
 * Formats band preview text
 * @param {string} band1 - Band 1 end percentage
 * @param {string} band2 - Band 2 end percentage
 * @returns {string} Human-readable preview
 */
export function formatBandPreview(band1, band2) {
  const b1 = band1.trim();
  const b2 = band2.trim();

  if (b1 === '' && b2 === '') {
    return 'No compression';
  }

  const num1 = Number(b1);
  const num2 = Number(b2);

  let preview = `0-${num1}% heavy | ${num1}-${num2}% compress`;
  if (num2 < 100) {
    preview += ` | ${num2}-100% none`;
  }

  return preview;
}
```

---

### Step 2: Extend transforms.js

**Add to:** `test/js/lib/transforms.test.js`

```javascript
describe('formatCompressionStats', () => {
  it('formats compression stats', () => {
    const stats = {
      messagesCompressed: 24,
      messagesSkipped: 100,
      messagesFailed: 1,
      originalTokens: 50000,
      compressedTokens: 10000,
      tokensRemoved: 40000,
      reductionPercent: 80,
    };
    const result = formatCompressionStats(stats);
    expect(result).toEqual([
      { label: 'Messages compressed', value: 24 },
      { label: 'Messages skipped', value: 100 },
      { label: 'Compressions failed', value: 1 },
      { label: 'Original tokens', value: 50000 },
      { label: 'Compressed tokens', value: 10000 },
      { label: 'Tokens removed', value: 40000 },
      { label: 'Token reduction', value: '80%' },
    ]);
  });

  it('handles zero compression', () => {
    const stats = {
      messagesCompressed: 0,
      messagesSkipped: 50,
      messagesFailed: 0,
      originalTokens: 0,
      compressedTokens: 0,
      tokensRemoved: 0,
      reductionPercent: 0,
    };
    const result = formatCompressionStats(stats);
    expect(result[6]).toEqual({ label: 'Token reduction', value: '0%' });
  });

  it('returns empty array for null stats', () => {
    expect(formatCompressionStats(null)).toEqual([]);
  });
});
```

**Add to:** `public/js/lib/transforms.js`

```javascript
/**
 * Formats compression stats for display
 * @param {Object|null} compression - Compression stats from API (result.stats.compression)
 * @returns {Array<{label: string, value: string|number}>}
 */
export function formatCompressionStats(compression) {
  if (!compression) {
    return [];
  }

  const {
    messagesCompressed,
    messagesSkipped,
    messagesFailed,
    originalTokens,
    compressedTokens,
    tokensRemoved,
    reductionPercent,
  } = compression;

  return [
    { label: 'Messages compressed', value: messagesCompressed },
    { label: 'Messages skipped', value: messagesSkipped },
    { label: 'Compressions failed', value: messagesFailed },
    { label: 'Original tokens', value: originalTokens },
    { label: 'Compressed tokens', value: compressedTokens },
    { label: 'Tokens removed', value: tokensRemoved },
    { label: 'Token reduction', value: `${reductionPercent}%` },
  ];
}
```

---

### Step 3: Update server.ts

**Add static route for debug logs:**

```typescript
// Add after existing static middleware
app.use('/clone-debug-log', express.static(path.join(__dirname, '../clone-debug-log')));
```

---

### Step 4: Update clone.ejs

**Add after tool/thinking removal selects:**

```html
<!-- Compression Bands -->
<div class="border-t border-gray-200 pt-6 mt-6">
  <h3 class="text-sm font-medium text-gray-700 mb-4">Compression Bands (optional)</h3>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label for="band1" class="block text-sm text-gray-600 mb-1">
        Band 1 ends at (heavy-compress)
      </label>
      <div class="flex items-center">
        <input
          type="number"
          id="band1"
          name="band1"
          min="1"
          max="99"
          placeholder="e.g., 35"
          class="w-24 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span class="ml-2 text-gray-500">%</span>
      </div>
    </div>
    <div>
      <label for="band2" class="block text-sm text-gray-600 mb-1">
        Band 2 ends at (compress)
      </label>
      <div class="flex items-center">
        <input
          type="number"
          id="band2"
          name="band2"
          min="1"
          max="100"
          placeholder="e.g., 75"
          class="w-24 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span class="ml-2 text-gray-500">%</span>
      </div>
    </div>
  </div>
  <p id="band-preview" class="mt-2 text-sm text-gray-500">No compression</p>
  <p id="band-errors" class="mt-1 text-sm text-red-600 hidden"></p>
</div>

<!-- Debug Log Option -->
<div class="mt-4">
  <label class="flex items-center">
    <input type="checkbox" id="debugLog" name="debugLog" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
    <span class="ml-2 text-sm text-gray-700">Generate debug log</span>
  </label>
</div>
```

**Add to results section (after existing stats):**

```html
<!-- Compression Stats (shown when compression used) -->
<div id="compression-stats" class="hidden mt-4 pt-4 border-t border-gray-200">
  <p class="text-sm text-gray-700 mb-2"><strong>Compression:</strong></p>
  <ul id="compression-stats-list" class="text-sm text-gray-600 space-y-1"></ul>
</div>

<!-- Debug Log Link (shown when debug enabled) -->
<div id="debug-log-link" class="hidden mt-4">
  <a id="debug-log-anchor" href="#" target="_blank" class="text-blue-600 hover:text-blue-800 text-sm">
    View Debug Log →
  </a>
</div>
```

**Add marked.js CDN in head:**

```html
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
```

---

### Step 5: Update pages/clone.js

**Add imports:**

```javascript
import { validateBands, buildCompressionBands, formatBandPreview } from '../lib/compression.js';
import { formatCompressionStats } from '../lib/transforms.js';
```

**Add DOM queries:**

```javascript
const band1Input = document.getElementById('band1');
const band2Input = document.getElementById('band2');
const bandPreview = document.getElementById('band-preview');
const bandErrors = document.getElementById('band-errors');
const debugLogCheckbox = document.getElementById('debugLog');
const compressionStatsDiv = document.getElementById('compression-stats');
const compressionStatsList = document.getElementById('compression-stats-list');
const debugLogLinkDiv = document.getElementById('debug-log-link');
const debugLogAnchor = document.getElementById('debug-log-anchor');
```

**Add band validation handler:**

```javascript
function updateBandValidation() {
  const band1 = band1Input.value;
  const band2 = band2Input.value;

  const result = validateBands(band1, band2);

  // Update preview
  bandPreview.textContent = formatBandPreview(band1, band2);

  // Update errors
  if (result.valid) {
    bandErrors.classList.add('hidden');
    bandErrors.textContent = '';
    submitBtn.disabled = false;
  } else {
    bandErrors.classList.remove('hidden');
    bandErrors.textContent = result.errors.join('. ');
    submitBtn.disabled = true;
  }
}

band1Input.addEventListener('input', updateBandValidation);
band2Input.addEventListener('input', updateBandValidation);
```

**Update handleSubmit to use v2:**

```javascript
// Build request body
const compressionBands = buildCompressionBands(band1Input.value, band2Input.value);
const debugLog = debugLogCheckbox.checked;

const result = await post('/api/v2/clone', {
  sessionId,
  toolRemoval: formData.get('toolRemoval'),
  thinkingRemoval: formData.get('thinkingRemoval'),
  compressionBands,
  debugLog,
});
```

**Display compression stats:**

```javascript
// After showing basic stats
if (result.stats.compression) {
  const compressionStats = formatCompressionStats(result.stats.compression);
  compressionStatsList.innerHTML = compressionStats
    .map(s => `<li>${s.label}: ${s.value}</li>`)
    .join('');
  compressionStatsDiv.classList.remove('hidden');
} else {
  compressionStatsDiv.classList.add('hidden');
}

// Show debug log link if applicable
if (debugLog && result.debugLogPath) {
  debugLogAnchor.href = '#';
  debugLogAnchor.onclick = (e) => {
    e.preventDefault();
    openDebugLog(result.debugLogPath);
  };
  debugLogLinkDiv.classList.remove('hidden');
} else {
  debugLogLinkDiv.classList.add('hidden');
}
```

**Add debug log viewer:**

```javascript
async function openDebugLog(path) {
  try {
    const response = await fetch(path);
    const markdown = await response.text();
    const html = marked.parse(markdown);

    const newWindow = window.open('', '_blank');
    newWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Compression Debug Log</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
          pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
          code { background: #f5f5f5; padding: 2px 4px; }
          h1, h2, h3 { color: #333; }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `);
    newWindow.document.close();
  } catch (err) {
    console.error('Failed to load debug log:', err);
    alert('Failed to load debug log');
  }
}
```

---

## Verification Checklist

- [ ] `lib/compression.js` created with `validateBands()`, `buildCompressionBands()`, `formatBandPreview()`
- [ ] `lib/compression.test.js` - all tests pass
- [ ] `formatCompressionStats()` added to `lib/transforms.js`
- [ ] Compression stats tests pass
- [ ] Static route for `/clone-debug-log/` added to server.ts
- [ ] HTML updated with compression inputs, debug checkbox, stats display
- [ ] `pages/clone.js` updated with band validation and v2 endpoint
- [ ] All existing tests pass (no regressions)
- [ ] Manual test: empty bands = no compression
- [ ] Manual test: valid bands = correct preview and API call
- [ ] Manual test: invalid bands = error messages, submit disabled
- [ ] Manual test: debug log checkbox → link appears → opens rendered markdown

---

## Test Scenarios

### TC-UI-01: Empty compression bands
- **Given:** Both band inputs empty
- **When:** Submit clone
- **Then:** No compression, preview shows "No compression"

### TC-UI-02: Band 1 only
- **Given:** Band 1 = 50, Band 2 empty
- **Then:** Error "Both bands required or both empty"

### TC-UI-03: Valid two bands
- **Given:** Band 1 = 35, Band 2 = 75
- **Then:** Preview "0-35% heavy | 35-75% compress | 75-100% none"

### TC-UI-04: Invalid - Band 2 less than Band 1
- **Given:** Band 1 = 60, Band 2 = 40
- **Then:** Error "Band 2 must be greater than Band 1", submit disabled

### TC-UI-05: Debug log enabled
- **Given:** Debug log checked, clone completes
- **Then:** Debug log link visible, opens rendered markdown

### TC-UI-06: Compression stats displayed
- **Given:** Clone with compression completes
- **Then:** Compression stats section shows all metrics

---

## Acceptance Criteria

- [ ] AC-01: Two integer inputs for compression band boundaries
- [ ] AC-02: Dynamic preview label showing band configuration
- [ ] AC-03: Real-time validation with red error text
- [ ] AC-04: Submit disabled when validation fails
- [ ] AC-05: Both bands required or both empty
- [ ] AC-06: Debug log checkbox sends `debugLog: true`
- [ ] AC-07: Static route serves debug logs at `/clone-debug-log/`
- [ ] AC-08: Debug log link opens rendered markdown in new tab
- [ ] AC-09: Compression stats displayed in results
- [ ] AC-10: UI uses v2 endpoint with compression bands
- [ ] AC-11: All existing functionality preserved
