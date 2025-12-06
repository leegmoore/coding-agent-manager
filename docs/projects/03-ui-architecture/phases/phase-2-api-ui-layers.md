# Phase 2: api/ + ui/ Layers

## Goal

Implement the API client layer and UI utility layer with full TDD coverage, including jsdom for DOM testing.

## Prerequisites

- Phase 1 complete (lib/ layer implemented and tested)

## Scope

- Install jsdom dev dependency
- Update vitest.config.ts for jsdom environment
- Implement `api/client.js` with TDD (mock fetch)
- Implement `ui/loading.js` with TDD (jsdom)
- Implement `ui/notifications.js` with TDD (jsdom)
- Existing UI remains unchanged and functional

---

## Implementation

### Step 1: Install jsdom

```bash
npm install -D jsdom
```

### Step 2: Update Vitest Config

**File:** `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.{ts,js}'],
    environment: 'node',
    environmentMatchGlobs: [
      ['test/js/ui/**', 'jsdom']
    ],
  },
});
```

---

### Step 3: api/client.js (TDD)

#### 3.1 Write Tests First

**File:** `test/js/api/client.test.js`

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { post, ApiError } from '../../../public/js/api/client.js';

describe('api/client', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('post', () => {
    it('returns JSON on successful response', async () => {
      const mockResponse = { success: true, data: 'test' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await post('/api/test', { foo: 'bar' });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' }),
      });
    });

    it('throws ApiError on HTTP 400', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input' }
        }),
      });

      await expect(post('/api/test', {})).rejects.toThrow(ApiError);
      await expect(post('/api/test', {})).rejects.toMatchObject({
        message: 'Invalid input',
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('throws ApiError on HTTP 500 with default message', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(post('/api/test', {})).rejects.toMatchObject({
        message: 'Server error: HTTP 500',
        status: 500,
        code: 'UNKNOWN',
      });
    });

    it('throws ApiError on HTTP 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          error: { code: 'NOT_FOUND', message: 'Session not found' }
        }),
      });

      await expect(post('/api/test', {})).rejects.toMatchObject({
        message: 'Session not found',
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('propagates network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      await expect(post('/api/test', {})).rejects.toThrow('Network failure');
    });

    it('propagates timeout errors', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValue(timeoutError);

      await expect(post('/api/test', {})).rejects.toThrow('The operation was aborted');
    });

    it('throws ApiError on non-JSON response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      await expect(post('/api/test', {})).rejects.toThrow(ApiError);
      await expect(post('/api/test', {})).rejects.toMatchObject({
        message: 'Invalid JSON response from server',
        status: 200,
        code: 'PARSE_ERROR',
      });
    });
  });

  describe('ApiError', () => {
    it('is an instance of Error', () => {
      const error = new ApiError('test', 400, 'TEST');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ApiError');
    });

    it('stores status and code', () => {
      const error = new ApiError('message', 404, 'NOT_FOUND');
      expect(error.message).toBe('message');
      expect(error.status).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });
});
```

#### 3.2 Implement to Pass

**File:** `public/js/api/client.js`

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

---

### Step 4: ui/loading.js (TDD with jsdom)

#### 4.1 Write Tests First

**File:** `test/js/ui/loading.test.js`

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { showLoading, hideLoading, setSubmitDisabled } from '../../../public/js/ui/loading.js';

describe('ui/loading', () => {
  let container;
  let button;

  beforeEach(() => {
    // jsdom provides document
    container = document.createElement('div');
    container.classList.add('hidden');
    button = document.createElement('button');
  });

  describe('showLoading', () => {
    it('sets innerHTML with shimmer span', () => {
      showLoading(container, 'Loading...');
      expect(container.innerHTML).toBe('<span class="shimmer">Loading...</span>');
    });

    it('removes hidden class', () => {
      showLoading(container, 'Loading...');
      expect(container.classList.contains('hidden')).toBe(false);
    });

    it('handles different text', () => {
      showLoading(container, 'Curating Context For Cloned Session...');
      expect(container.querySelector('.shimmer').textContent).toBe('Curating Context For Cloned Session...');
    });
  });

  describe('hideLoading', () => {
    it('adds hidden class', () => {
      container.classList.remove('hidden');
      hideLoading(container);
      expect(container.classList.contains('hidden')).toBe(true);
    });

    it('clears innerHTML', () => {
      container.innerHTML = '<span>something</span>';
      hideLoading(container);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('setSubmitDisabled', () => {
    it('sets disabled to true', () => {
      setSubmitDisabled(button, true);
      expect(button.disabled).toBe(true);
    });

    it('sets disabled to false', () => {
      button.disabled = true;
      setSubmitDisabled(button, false);
      expect(button.disabled).toBe(false);
    });
  });
});
```

#### 4.2 Implement to Pass

**File:** `public/js/ui/loading.js`

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

---

### Step 5: ui/notifications.js (TDD with jsdom)

#### 5.1 Write Tests First

**File:** `test/js/ui/notifications.test.js`

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { hideAll, showSuccess, showError } from '../../../public/js/ui/notifications.js';

describe('ui/notifications', () => {
  let successContainer;
  let errorContainer;
  let loadingContainer;

  beforeEach(() => {
    // Create success container with required children
    successContainer = document.createElement('div');
    successContainer.innerHTML = `
      <span id="new-session-id"></span>
      <code id="resume-command"></code>
      <ul id="stats-list"></ul>
    `;

    // Create error container with required children
    errorContainer = document.createElement('div');
    errorContainer.innerHTML = `<p id="error-message"></p>`;

    // Create loading container
    loadingContainer = document.createElement('div');
  });

  describe('hideAll', () => {
    it('adds hidden class to all containers', () => {
      successContainer.classList.remove('hidden');
      errorContainer.classList.remove('hidden');
      loadingContainer.classList.remove('hidden');

      hideAll({
        success: successContainer,
        error: errorContainer,
        loading: loadingContainer,
      });

      expect(successContainer.classList.contains('hidden')).toBe(true);
      expect(errorContainer.classList.contains('hidden')).toBe(true);
      expect(loadingContainer.classList.contains('hidden')).toBe(true);
    });
  });

  describe('showSuccess', () => {
    it('renders session ID', () => {
      showSuccess(successContainer, {
        sessionId: 'test-uuid-1234',
        command: 'claude --resume test-uuid-1234',
        stats: [],
      });

      expect(successContainer.querySelector('#new-session-id').textContent).toBe('test-uuid-1234');
    });

    it('renders resume command', () => {
      showSuccess(successContainer, {
        sessionId: 'test-uuid-1234',
        command: 'claude --dangerously-skip-permissions --resume test-uuid-1234',
        stats: [],
      });

      expect(successContainer.querySelector('#resume-command').textContent)
        .toBe('claude --dangerously-skip-permissions --resume test-uuid-1234');
    });

    it('renders stats list', () => {
      showSuccess(successContainer, {
        sessionId: 'test-uuid-1234',
        command: 'cmd',
        stats: [
          { label: 'Original turns', value: 18 },
          { label: 'Tool calls removed', value: 5 },
        ],
      });

      const statsList = successContainer.querySelector('#stats-list');
      expect(statsList.children.length).toBe(2);
      expect(statsList.children[0].textContent).toBe('Original turns: 18');
      expect(statsList.children[1].textContent).toBe('Tool calls removed: 5');
    });

    it('removes hidden class', () => {
      successContainer.classList.add('hidden');

      showSuccess(successContainer, {
        sessionId: 'test',
        command: 'test',
        stats: [],
      });

      expect(successContainer.classList.contains('hidden')).toBe(false);
    });

    it('handles empty stats array', () => {
      showSuccess(successContainer, {
        sessionId: 'test-uuid',
        command: 'claude --resume test-uuid',
        stats: [],
      });

      const statsList = successContainer.querySelector('#stats-list');
      expect(statsList.children.length).toBe(0);
      expect(statsList.innerHTML).toBe('');
    });
  });

  describe('showError', () => {
    it('renders error message', () => {
      showError(errorContainer, 'Something went wrong');

      expect(errorContainer.querySelector('#error-message').textContent)
        .toBe('Something went wrong');
    });

    it('removes hidden class', () => {
      errorContainer.classList.add('hidden');

      showError(errorContainer, 'Error');

      expect(errorContainer.classList.contains('hidden')).toBe(false);
    });
  });
});
```

#### 5.2 Implement to Pass

**File:** `public/js/ui/notifications.js`

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

---

### Step 6: Verify All Tests Pass

```bash
# Run all JS tests
npm test -- test/js/

# Expected output:
# test/js/lib/validation.test.js - PASS
# test/js/lib/transforms.test.js - PASS
# test/js/api/client.test.js - PASS
# test/js/ui/loading.test.js - PASS
# test/js/ui/notifications.test.js - PASS
```

### Step 7: Verify Existing UI Still Works

```bash
npm run dev
# Visit http://localhost:3000
# Test clone operation - should work unchanged
```

---

## Verification Checklist

- [ ] jsdom installed as dev dependency
- [ ] vitest.config.ts updated with environmentMatchGlobs
- [ ] `api/client.js` implemented with `post()`, `ApiError`
- [ ] `ui/loading.js` implemented with `showLoading()`, `hideLoading()`, `setSubmitDisabled()`
- [ ] `ui/notifications.js` implemented with `hideAll()`, `showSuccess()`, `showError()`
- [ ] All api/ tests pass (mock fetch)
- [ ] All ui/ tests pass (jsdom)
- [ ] All lib/ tests still pass
- [ ] All existing backend tests still pass
- [ ] Existing UI works unchanged

## Test Commands

```bash
# Run Phase 2 tests only
npm test -- test/js/api/ test/js/ui/

# Run all JS tests
npm test -- test/js/

# Run all tests (backend + JS)
npm test
```

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/api/client.js` | ~35 | HTTP client |
| `public/js/ui/loading.js` | ~25 | Loading utilities |
| `public/js/ui/notifications.js` | ~30 | Notification utilities |
| `test/js/api/client.test.js` | ~80 | Client tests |
| `test/js/ui/loading.test.js` | ~50 | Loading tests |
| `test/js/ui/notifications.test.js` | ~80 | Notification tests |

## Files Modified

| File | Change |
|------|--------|
| `vitest.config.ts` | Added environmentMatchGlobs for jsdom |
| `package.json` | Added jsdom dev dependency |

## Next Phase

Phase 3: Page Refactor + Integration - Create `pages/clone.js`, update HTML, remove old code.
