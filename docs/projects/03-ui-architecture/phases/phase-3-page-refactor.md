# Phase 3: Page Refactor + Integration

## Goal

Create the page orchestration layer, update HTML to use ES modules, remove the old monolithic code, and verify full integration.

## Prerequisites

- Phase 1 complete (lib/ layer)
- Phase 2 complete (api/ + ui/ layers)

## Scope

- Create `pages/clone.js` orchestrating all layers
- Update `clone.ejs` to use `<script type="module">`
- Delete old `public/js/clone.js`
- Add shimmer CSS to stylesheet
- Manual integration testing
- Verify all functionality preserved

---

## Implementation

### Step 1: Create pages/clone.js

**File:** `public/js/pages/clone.js`

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
  const copyBtn = document.getElementById('copy-btn');

  const containers = {
    loading: document.getElementById('loading'),
    success: document.getElementById('success-result'),
    error: document.getElementById('error-result'),
  };

  // Verify required elements exist
  if (!form || !submitBtn || !containers.loading || !containers.success || !containers.error) {
    console.error('Missing required DOM elements');
    return;
  }

  // Hide all results initially
  hideAll(containers);

  // Guard against double submission
  let isSubmitting = false;

  /**
   * Handles form submission
   */
  async function handleSubmit(e) {
    e.preventDefault();

    // Prevent double submission from overlapping form/button events
    if (isSubmitting) return;
    isSubmitting = true;

    const formData = new FormData(form);
    const sessionId = formData.get('sessionId')?.trim() || '';

    // Client-side validation
    if (!validateUUID(sessionId)) {
      hideAll(containers);
      showError(containers.error, 'Invalid session ID format. Please enter a valid UUID.');
      return;
    }

    // Show loading state
    hideAll(containers);
    showLoading(containers.loading, 'Curating Context For Cloned Session...');
    setSubmitDisabled(submitBtn, true);

    try {
      const result = await post('/api/clone', {
        sessionId,
        toolRemoval: formData.get('toolRemoval'),
        thinkingRemoval: formData.get('thinkingRemoval'),
      });

      if (!result.success) {
        throw new Error('Clone operation failed. Please try again.');
      }
      if (!result.outputPath || !result.stats) {
        throw new Error('Invalid response from server');
      }

      const newSessionId = extractSessionId(result.outputPath);
      const command = `claude --dangerously-skip-permissions --resume ${newSessionId}`;

      hideLoading(containers.loading);
      showSuccess(containers.success, {
        sessionId: newSessionId,
        command,
        stats: formatStats(result.stats),
      });

      // Scroll to result
      setTimeout(() => {
        containers.success.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);

    } catch (err) {
      hideLoading(containers.loading);

      let message;
      if (err instanceof ApiError) {
        message = err.message;
      } else if (err.message.includes('fetch')) {
        message = `Network error: ${err.message}. Please check your connection.`;
      } else {
        message = err.message || 'An unexpected error occurred';
      }

      showError(containers.error, message);
      containers.error.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
      setSubmitDisabled(submitBtn, false);
      isSubmitting = false;
    }
  }

  /**
   * Handles copy to clipboard
   */
  async function handleCopy() {
    const resumeCommand = document.getElementById('resume-command');
    const command = resumeCommand?.textContent || '';

    try {
      await navigator.clipboard.writeText(command);

      // Visual feedback
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('bg-green-600', 'hover:bg-green-700');
      copyBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');

      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        copyBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback: select text for manual copy (Ctrl+C)
      if (resumeCommand && window.getSelection) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(resumeCommand);
        selection.removeAllRanges();
        selection.addRange(range);
        // Alert user to copy manually
        copyBtn.textContent = 'Select & Copy';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      }
    }
  }

  // Event listeners
  // Note: We attach handleSubmit to both form submit and button click.
  // The button has type="button" (not submit), so both won't fire together.
  // This preserves legacy behavior and handles edge cases where form submit
  // might not trigger. The e.preventDefault() ensures no double execution.
  form.addEventListener('submit', handleSubmit);
  submitBtn.addEventListener('click', handleSubmit);

  if (copyBtn) {
    copyBtn.addEventListener('click', handleCopy);
  }
});
```

---

### Step 2: Add Shimmer CSS

**File:** `public/css/styles.css` (create if doesn't exist)

```css
/* Shimmer animation for loading text */
.shimmer {
  background: linear-gradient(90deg, #666 25%, #888 50%, #666 75%);
  background-size: 200% 100%;
  /* Fallback color if background-clip not supported */
  color: #666;
  /* Apply background-clip with vendor prefix */
  -webkit-background-clip: text;
  background-clip: text;
  /* Override color to transparent when background-clip works */
  -webkit-text-fill-color: transparent;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Utility classes */
.hidden {
  display: none !important;
}
```

---

### Step 3: Update clone.ejs

**File:** `views/pages/clone.ejs`

Change script tag from:
```html
<script src="/js/clone.js?v=3"></script>
```

To:
```html
<link rel="stylesheet" href="/css/styles.css">
<script type="module" src="/js/pages/clone.js"></script>
```

**Full updated file:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Cloner - Claude Code</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-100 min-h-screen py-8">
  <div class="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Session Cloner</h1>
      <p class="text-gray-600">Clone Claude Code sessions with selective removal of tool calls and thinking blocks</p>
    </div>

    <form id="clone-form" class="space-y-6">
      <div>
        <label for="sessionId" class="block text-sm font-medium text-gray-700 mb-2">
          Session GUID
        </label>
        <input
          type="text"
          id="sessionId"
          name="sessionId"
          required
          pattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
          placeholder="e.g., 00a61603-c2ea-4d4c-aee8-4a292ab7b3f4"
          class="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p class="mt-1 text-sm text-gray-500">Paste the session UUID from Claude Code</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label for="toolRemoval" class="block text-sm font-medium text-gray-700 mb-2">
            Tool Call Removal
          </label>
          <select
            id="toolRemoval"
            name="toolRemoval"
            class="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="none">None</option>
            <option value="50">50% (oldest half)</option>
            <option value="75">75% (oldest three-quarters)</option>
            <option value="100">100% (all)</option>
          </select>
          <p class="mt-1 text-sm text-gray-500">Remove tool calls from oldest portion</p>
        </div>

        <div>
          <label for="thinkingRemoval" class="block text-sm font-medium text-gray-700 mb-2">
            Thinking Block Removal
          </label>
          <select
            id="thinkingRemoval"
            name="thinkingRemoval"
            class="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="none">None</option>
            <option value="50">50% (oldest half)</option>
            <option value="75">75% (oldest three-quarters)</option>
            <option value="100">100% (all)</option>
          </select>
          <p class="mt-1 text-sm text-gray-500">Remove thinking blocks from oldest portion</p>
        </div>
      </div>

      <button
        type="button"
        id="submit-btn"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        Clone Session
      </button>
    </form>

    <!-- Loading indicator -->
    <div id="loading" class="hidden mt-6 text-center text-lg font-medium text-gray-700">
      <!-- Content set by JavaScript -->
    </div>

    <!-- Success result -->
    <div id="success-result" class="hidden mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
      <h3 class="text-lg font-semibold text-green-900 mb-2">✓ Session cloned successfully!</h3>
      <div class="mb-4">
        <p class="text-sm text-gray-700 mb-2"><strong>New Session ID:</strong></p>
        <code id="new-session-id" class="block p-2 bg-white border border-gray-300 rounded text-sm font-mono break-all"></code>
      </div>
      <div class="mb-4">
        <p class="text-sm text-gray-700 mb-2"><strong>Stats:</strong></p>
        <ul id="stats-list" class="text-sm text-gray-600 space-y-1"></ul>
      </div>
      <div>
        <p class="text-sm text-gray-700 mb-2"><strong>Resume command:</strong></p>
        <div class="flex items-center gap-2">
          <code id="resume-command" class="flex-1 p-2 bg-white border border-gray-300 rounded text-sm font-mono break-all"></code>
          <button
            id="copy-btn"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors duration-200"
          >
            Copy
          </button>
        </div>
      </div>
    </div>

    <!-- Error result -->
    <div id="error-result" class="hidden mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
      <h3 class="text-lg font-semibold text-red-900 mb-2">✗ Error</h3>
      <p id="error-message" class="text-sm text-red-700"></p>
    </div>
  </div>

  <script type="module" src="/js/pages/clone.js"></script>
</body>
</html>
```

---

### Step 4: Delete Old Code

```bash
rm public/js/clone.js
```

---

### Step 5: Verify CSS Serving

Before testing, verify Express serves the CSS file:

```bash
# Start server
npm run dev

# In another terminal, verify CSS is accessible
curl -I http://localhost:3000/css/styles.css
# Should return HTTP 200, Content-Type: text/css
```

If CSS returns 404, verify `express.static` in `src/server.ts` includes the `public` directory:
```typescript
app.use(express.static(path.join(__dirname, "../public")));
```

---

### Step 6: Manual Integration Testing

#### Test 1: Valid Clone
1. Start server: `npm run dev`
2. Visit http://localhost:3000
3. Enter valid session UUID
4. Select tool removal: 75%
5. Click "Clone Session"
6. **Expected:** Loading shimmer → Success with stats → Copy works

#### Test 2: Invalid UUID
1. Enter "not-a-uuid"
2. Click "Clone Session"
3. **Expected:** Error message "Invalid session ID format"

#### Test 3: Session Not Found
1. Enter valid UUID format but non-existent session
2. Click "Clone Session"
3. **Expected:** Error message from API

#### Test 4: Copy to Clipboard
1. Complete a successful clone
2. Click "Copy" button
3. **Expected:** Button changes to "Copied!" briefly
4. Paste elsewhere to verify

#### Test 5: Loading State
1. Start a clone operation
2. **Expected:** "Curating Context For Cloned Session..." with shimmer animation

---

## Verification Checklist

- [ ] `public/js/pages/clone.js` created with imports from all layers
- [ ] `public/css/styles.css` created with shimmer CSS
- [ ] `views/pages/clone.ejs` updated to use module script
- [ ] Old `public/js/clone.js` deleted
- [ ] CSS file accessible at `/css/styles.css` (HTTP 200)
- [ ] Manual test: valid clone works
- [ ] Manual test: invalid UUID shows error
- [ ] Manual test: copy to clipboard works
- [ ] Manual test: loading shimmer displays
- [ ] All unit tests pass (lib/, api/, ui/)
- [ ] All existing backend tests pass
- [ ] No visual regressions (except loading state: shimmer replaces spinner)

## Test Commands

```bash
# Run all tests
npm test

# Run just JS unit tests
npm test -- test/js/

# Start dev server for manual testing
npm run dev
```

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/pages/clone.js` | ~120 | Page orchestration |
| `public/css/styles.css` | ~20 | Shimmer + utilities |

## Files Modified

| File | Change |
|------|--------|
| `views/pages/clone.ejs` | Script tag → module, added CSS link |

## Files Deleted

| File | Reason |
|------|--------|
| `public/js/clone.js` | Replaced by `pages/clone.js` |

---

## Rollback Plan

If issues are discovered post-deployment:

1. Restore old `clone.js`:
   ```bash
   git checkout HEAD~1 -- public/js/clone.js
   ```

2. Revert HTML change:
   ```html
   <script src="/js/clone.js?v=3"></script>
   ```

3. Keep new modules (no harm, unused)

---

## Project Complete

After Phase 3, the UI architecture is:

```
public/js/
├── lib/
│   ├── validation.js    ✅ Unit tested
│   └── transforms.js    ✅ Unit tested
├── api/
│   └── client.js        ✅ Unit tested
├── ui/
│   ├── loading.js       ✅ Unit tested (jsdom)
│   └── notifications.js ✅ Unit tested (jsdom)
└── pages/
    └── clone.js         ✅ Manual tested
```

This foundation supports:
- TDD for new features
- Reusable components
- Clear dependency management
- Easy extension for Project 2 Phase 7 (compression UI)
