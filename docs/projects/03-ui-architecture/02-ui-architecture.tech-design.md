# UI Architecture - Technical Design

## 1. Overview

Refactor `public/js/clone.js` from monolithic structure to layered ES module architecture enabling TDD.

### Current State

```
public/js/
└── clone.js (307 lines, all in DOMContentLoaded)
    ├── DOM element queries
    ├── UUID validation (inline regex)
    ├── Fetch API call (inline)
    ├── Show/hide logic (inline)
    ├── Success/error rendering (inline)
    └── Event handlers
```

### Target State

```
public/js/
├── lib/validation.js      # Pure: validateUUID()
├── lib/transforms.js      # Pure: extractSessionId(), buildStats()
├── api/client.js          # Async: post(), ApiError
├── ui/loading.js          # DOM: showLoading(), hideLoading()
├── ui/notifications.js    # DOM: showSuccess(), showError(), hideAll()
└── pages/clone.js         # Orchestration: imports + event handlers
```

---

## 2. Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   clone.js  │────▶│  api/client │────▶│   Server    │────▶│  Response   │
│   (page)    │     │   post()    │     │ /api/clone  │     │   JSON      │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                                                           │
       │ validates                                                 │
       ▼                                                           ▼
┌─────────────┐                                           ┌─────────────┐
│     lib/    │                                           │    ui/      │
│ validation  │                                           │notifications│
└─────────────┘                                           └─────────────┘
```

---

## 3. Module Specifications

### 3.1 lib/validation.js

**Purpose:** Pure validation functions with no side effects.

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

**Tests:** `test/js/lib/validation.test.js`
- Valid UUID → true
- Invalid format → false
- Empty string → false
- Non-string → false
- Whitespace-padded UUID → false (callers must trim)

---

### 3.2 lib/transforms.js

**Purpose:** Data transformation functions.

```javascript
/**
 * Extracts session ID from file path
 * @param {string} outputPath - Full path to session file
 * @returns {string} Session UUID
 */
export function extractSessionId(outputPath) {
  const parts = outputPath.split('/');
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

**Tests:** `test/js/lib/transforms.test.js`
- extractSessionId from full path
- extractSessionId handles various path formats
- formatStats returns correct structure

---

### 3.3 api/client.js

**Purpose:** HTTP client with error handling.

```javascript
/**
 * Custom error for API failures
 */
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * POST JSON to endpoint
 * @param {string} url - Endpoint URL
 * @param {Object} data - Request body
 * @returns {Promise<Object>} Response JSON
 * @throws {ApiError} On HTTP error or parse failure
 */
export async function post(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  // Handle non-JSON responses (HTML error pages, empty responses)
  let json;
  try {
    json = await response.json();
  } catch (parseError) {
    throw new ApiError('Invalid JSON response from server', response.status, 'PARSE_ERROR');
  }

  if (!response.ok) {
    const message = json.error?.message || `Server error: HTTP ${response.status}`;
    const code = json.error?.code || 'UNKNOWN';
    throw new ApiError(message, response.status, code);
  }

  return json;
}
```

**Tests:** `test/js/api/client.test.js` (mock fetch)
- Successful POST returns JSON
- HTTP 400 throws ApiError with message
- HTTP 500 throws ApiError
- Network failure throws error
- Non-JSON response throws ApiError with PARSE_ERROR code

---

### 3.4 ui/loading.js

**Purpose:** Loading state management.

```javascript
/**
 * Shows loading state with shimmer text
 * @param {HTMLElement} container - Container element
 * @param {string} text - Loading text
 */
export function showLoading(container, text) {
  container.innerHTML = `<span class="shimmer">${text}</span>`;
  container.classList.remove('hidden');
}

/**
 * Hides loading state
 * @param {HTMLElement} container - Container element
 */
export function hideLoading(container) {
  container.classList.add('hidden');
  container.innerHTML = '';
}

/**
 * Disables/enables form submit button
 * @param {HTMLButtonElement} button - Submit button
 * @param {boolean} disabled - Disabled state
 */
export function setSubmitDisabled(button, disabled) {
  button.disabled = disabled;
}
```

**Tests:** `test/js/ui/loading.test.js` (jsdom)
- showLoading adds shimmer class and text
- showLoading removes hidden class
- hideLoading adds hidden class
- hideLoading clears innerHTML
- setSubmitDisabled toggles disabled attribute

---

### 3.5 ui/notifications.js

**Purpose:** Success/error display.

```javascript
/**
 * Hides all result containers
 * @param {Object} containers - {success, error, loading}
 */
export function hideAll(containers) {
  Object.values(containers).forEach(el => {
    el.classList.add('hidden');
  });
}

/**
 * Shows success result
 * @param {HTMLElement} container - Success container
 * @param {Object} data - {sessionId, command, stats}
 */
export function showSuccess(container, { sessionId, command, stats }) {
  container.querySelector('#new-session-id').textContent = sessionId;
  container.querySelector('#resume-command').textContent = command;

  const statsList = container.querySelector('#stats-list');
  statsList.innerHTML = stats
    .map(s => `<li>${s.label}: ${s.value}</li>`)
    .join('');

  container.classList.remove('hidden');
}

/**
 * Shows error result
 * @param {HTMLElement} container - Error container
 * @param {string} message - Error message
 */
export function showError(container, message) {
  container.querySelector('#error-message').textContent = message;
  container.classList.remove('hidden');
}
```

**Tests:** `test/js/ui/notifications.test.js` (jsdom)
- hideAll adds hidden class to all containers
- showSuccess renders sessionId, command, stats
- showSuccess removes hidden class
- showSuccess handles empty stats array
- showError renders message
- showError removes hidden class

**Note:** `showSuccess` queries elements by ID (`#new-session-id`, `#resume-command`, `#stats-list`). This couples the function to specific HTML structure. Tests must create matching element IDs. This is intentional for simplicity - if HTML structure changes, both code and tests need updating.

---

### 3.6 pages/clone.js

**Purpose:** Page orchestration - imports modules, binds events.

```javascript
import { validateUUID } from '../lib/validation.js';
import { extractSessionId, formatStats } from '../lib/transforms.js';
import { post, ApiError } from '../api/client.js';
import { showLoading, hideLoading, setSubmitDisabled } from '../ui/loading.js';
import { hideAll, showSuccess, showError } from '../ui/notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM queries
  const form = document.getElementById('clone-form');
  const submitBtn = document.getElementById('submit-btn');
  const containers = {
    loading: document.getElementById('loading'),
    success: document.getElementById('success-result'),
    error: document.getElementById('error-result'),
  };

  // Event handler
  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(form);
    const sessionId = formData.get('sessionId').trim();

    // Validate
    if (!validateUUID(sessionId)) {
      showError(containers.error, 'Invalid session ID format');
      return;
    }

    // Loading state
    hideAll(containers);
    showLoading(containers.loading, 'Cloning session...');
    setSubmitDisabled(submitBtn, true);

    try {
      const result = await post('/api/clone', {
        sessionId,
        toolRemoval: formData.get('toolRemoval'),
        thinkingRemoval: formData.get('thinkingRemoval'),
      });

      hideLoading(containers.loading);
      showSuccess(containers.success, {
        sessionId: extractSessionId(result.outputPath),
        command: `claude --dangerously-skip-permissions --resume ${extractSessionId(result.outputPath)}`,
        stats: formatStats(result.stats),
      });
    } catch (err) {
      hideLoading(containers.loading);
      const message = err instanceof ApiError
        ? err.message
        : `Network error: ${err.message}`;
      showError(containers.error, message);
    } finally {
      setSubmitDisabled(submitBtn, false);
    }
  }

  form.addEventListener('submit', handleSubmit);
});
```

**Tests:** Manual testing only (thin orchestration layer)

---

## 4. Test Structure

```
test/js/
├── lib/
│   ├── validation.test.js    # Unit tests (Vitest, node)
│   └── transforms.test.js    # Unit tests (Vitest, node)
├── api/
│   └── client.test.js        # Unit tests (Vitest, mock fetch)
└── ui/
    ├── loading.test.js       # Unit tests (Vitest, jsdom)
    └── notifications.test.js # Unit tests (Vitest, jsdom)
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,js}'],
    environment: 'node',
    environmentMatchGlobs: [
      ['test/js/ui/**', 'jsdom']
    ],
  },
});
```

---

## 5. Implementation Phases

### Phase 1: Skeleton + lib/ Layer
- Create directory structure
- Implement `lib/validation.js` with tests (TDD)
- Implement `lib/transforms.js` with tests (TDD)
- Verify existing UI still works (no changes yet)

### Phase 2: api/ + ui/ Layers
- Implement `api/client.js` with tests (TDD, mock fetch)
- Install jsdom dev dependency
- Implement `ui/loading.js` with tests (TDD, jsdom)
- Implement `ui/notifications.js` with tests (TDD, jsdom)
- Verify existing UI still works (no changes yet)

### Phase 3: Page Refactor + Integration
- Create `pages/clone.js` importing all layers
- Update HTML to use `<script type="module">`
- Remove old `clone.js`
- Manual integration testing
- Verify all functionality preserved

---

## 6. Migration Strategy

**Zero-downtime approach:**

1. **Phase 1-2:** Build new modules alongside existing code
2. **Phase 3:** Single atomic switch from old to new
3. **Rollback:** Revert script tag if issues

```html
<!-- Before (Phase 1-2) -->
<script src="/js/clone.js?v=3"></script>

<!-- After (Phase 3) -->
<script type="module" src="/js/pages/clone.js"></script>
```

---

## 7. Files to Create

| Phase | File | Purpose |
|-------|------|---------|
| 1 | `public/js/lib/validation.js` | UUID validation |
| 1 | `public/js/lib/transforms.js` | Data transforms |
| 1 | `test/js/lib/validation.test.js` | Validation tests |
| 1 | `test/js/lib/transforms.test.js` | Transform tests |
| 2 | `public/js/api/client.js` | HTTP client |
| 2 | `public/js/ui/loading.js` | Loading states |
| 2 | `public/js/ui/notifications.js` | Notifications |
| 2 | `test/js/api/client.test.js` | Client tests |
| 2 | `test/js/ui/loading.test.js` | Loading tests |
| 2 | `test/js/ui/notifications.test.js` | Notification tests |
| 3 | `public/js/pages/clone.js` | Page orchestration |

## 8. Files to Modify

| Phase | File | Change |
|-------|------|--------|
| 2 | `vitest.config.ts` | Add jsdom environment for ui/ tests |
| 2 | `package.json` | Add jsdom dev dependency |
| 3 | `views/pages/clone.ejs` | Change script tag to module |
| 3 | `public/js/clone.js` | Delete (replaced by pages/clone.js) |

---

## 9. Success Criteria

- [ ] All new tests pass (lib/, api/, ui/)
- [ ] Existing backend tests still pass
- [ ] UI functions identically to before refactor
- [ ] No visual changes except loading state (shimmer text replaces spinner)
- [ ] Clean dependency graph (no cycles)
- [ ] ES modules work in browser without bundler
