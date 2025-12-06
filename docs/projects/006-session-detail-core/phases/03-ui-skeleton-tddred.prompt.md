# Phase 3: UI Skeleton + TDD Red

## Role

You are a Senior Frontend Engineer implementing the UI skeleton for the Session Detail Core feature. Your task is to create the page template, JavaScript modules with stub functions, and TDD test cases. All functions should be stubbed (return placeholder values or throw). Tests should pass by expecting these stub behaviors.

---

## Application Overview

**coding-agent-manager** is a web application for managing Claude Code sessions. The frontend uses:
- Vanilla JavaScript with ES Modules
- EJS templates in `views/pages/`
- D3.js for visualizations (loaded via CDN)
- Tailwind CSS (loaded via CDN)
- Layered architecture: `lib/` (pure functions), `api/` (fetch), `ui/` (DOM), `pages/` (orchestration)

**Existing Patterns:**
- `public/js/lib/` - Pure functions, unit tested
- `public/js/api/client.js` - API wrapper with `get()` and `post()`
- `public/js/pages/` - Page orchestration
- `views/pages/` - EJS templates

**Reference Template:** Use `views/pages/visualize.ejs` as your model. Copy its structure for:
- Tailwind CSS CDN include
- D3.js CDN include
- HTML structure and Tailwind classes
- Script module loading pattern

**Reusable Functions (DO USE THESE):**
- `get(url)` from `public/js/api/client.js` - Fetch API data with error handling

---

## Feature Overview

**Session Detail Core** page provides:
1. Session ID input + Load button
2. Turn navigation: left button, input field, right button, slider
3. Vertical band visualization (User, Assistant, Thinking, Tool)
4. Scale input (50k-2000k) with auto-expand warning
5. Turn detail card showing selected turn's content

---

## Phase Scope

Create the complete UI skeleton:
1. EJS page template with all DOM elements
2. Lib module with stub functions
3. Page module with stub orchestration
4. TDD tests that pass with stub behaviors

**This phase does NOT implement full logic.** Functions return stub values or minimal implementations.

---

## Reference Documents

### Feature Specification
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/01-session-detail-core.feature.md`

Focus on:
- AC-1 through AC-23 (UI requirements)
- TC-01 through TC-17 (UI test conditions)

### Technical Design
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/02-session-detail-core.tech-design.md`

Focus on:
- Module architecture (Section 3) - VisualizePage, VisualizeLib
- Frontend lib functions (Section 5)
- Frontend page functions (Section 5)

---

## Step-by-Step Implementation

### Step 1: Create Page Template `views/pages/session-detail.ejs`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Detail - Context Visualizer</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://d3js.org/d3.v7.min.js"></script>
</head>
<body class="bg-gray-100 min-h-screen p-8">
  <div class="max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Session Detail</h1>

    <!-- Session Input -->
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="flex gap-4">
        <input type="text" id="sessionInput" placeholder="Enter session ID (UUID)"
               class="flex-1 px-4 py-2 border rounded focus:outline-none focus:ring-2">
        <button id="loadButton" class="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
          Load
        </button>
      </div>
      <div id="errorMessage" class="mt-2 text-red-500 hidden"></div>
      <div id="loadingIndicator" class="mt-2 text-blue-500 hidden">Loading session...</div>
    </div>

    <!-- Visualization Section (hidden until loaded) -->
    <div id="visualizationSection" class="hidden">
      <!-- Turn Navigation -->
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <div class="flex items-center gap-4 mb-4">
          <button id="leftButton" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">
            ←
          </button>
          <input type="number" id="turnInput" min="0" value="0"
                 class="w-20 px-2 py-1 border rounded text-center">
          <button id="rightButton" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50">
            →
          </button>
          <span id="turnLabel" class="text-gray-600">Turn 0 of 0</span>
        </div>
        <input type="range" id="turnSlider" min="0" max="0" value="0" class="w-full">
      </div>

      <!-- Scale Control -->
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <div class="flex items-center gap-4">
          <label class="text-gray-600">Scale (k tokens):</label>
          <input type="number" id="scaleInput" min="50" max="2000" value="200"
                 class="w-24 px-2 py-1 border rounded text-center">
          <span id="scaleWarning" class="text-orange-500 hidden">
            ⚠️ Auto-expanded to fit context
          </span>
        </div>
      </div>

      <!-- Visualization Container -->
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <div class="flex gap-4 mb-4">
          <span class="flex items-center gap-1"><span class="w-4 h-4 bg-blue-500 inline-block"></span> User</span>
          <span class="flex items-center gap-1"><span class="w-4 h-4 bg-green-500 inline-block"></span> Assistant</span>
          <span class="flex items-center gap-1"><span class="w-4 h-4 bg-purple-500 inline-block"></span> Thinking</span>
          <span class="flex items-center gap-1"><span class="w-4 h-4 bg-orange-500 inline-block"></span> Tool</span>
        </div>
        <div id="visualizationContainer" class="border rounded" style="width: 800px; height: 500px;">
          <!-- D3 renders here -->
        </div>
        <div id="tokenStats" class="mt-2 text-sm text-gray-600"></div>
      </div>

      <!-- Turn Detail Card -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold mb-4">Turn Content</h2>
        <div id="detailCard" class="prose max-w-none">
          <!-- Markdown content renders here -->
        </div>
      </div>
    </div>
  </div>

  <script type="module" src="/js/pages/session-detail.js"></script>
</body>
</html>
```

### Step 2: Add Page Route to `src/server.ts`

```typescript
app.get("/session-detail", (req, res) => {
  res.render("pages/session-detail");
});
```

### Step 3: Create Lib Module `public/js/lib/session-detail.js`

```javascript
// Constants
export const COLORS = {
  user: '#3B82F6',
  assistant: '#22C55E',
  thinking: '#A855F7',
  tool: '#F97316',
};

export const DEFAULT_WIDTH = 800;
export const DEFAULT_HEIGHT = 500;
export const SCALE_MIN = 50;
export const SCALE_MAX = 2000;

// Stub functions - to be implemented in Phase 4

export function calculateBandHeight(tokens, maxTokens, containerHeight) {
  // Stub: return 0
  return 0;
}

export function formatTokenCount(tokens) {
  // Stub: return empty string
  return '';
}

export function truncateToolContent(content, maxLines = 2) {
  // Stub: return content unchanged
  return content;
}

export function exceedsScale(cumulative, scaleK) {
  // Stub: return false
  return false;
}

export function validateScaleInput(value) {
  // Stub: return value unchanged
  return value;
}

export function validateTurnInput(value, max) {
  // Stub: return value unchanged
  return value;
}
```

### Step 4: Create Page Module `public/js/pages/session-detail.js`

```javascript
import { get } from '../api/client.js';
import {
  COLORS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  calculateBandHeight,
  formatTokenCount,
  truncateToolContent,
  exceedsScale,
  validateScaleInput,
  validateTurnInput,
} from '../lib/session-detail.js';

// State
let sessionData = null;
let currentTurn = 0;
let currentScale = 200;

// DOM elements
let sessionInput, loadButton, errorMessage, loadingIndicator;
let visualizationSection;
let leftButton, turnInput, rightButton, turnSlider, turnLabel;
let scaleInput, scaleWarning;
let visualizationContainer, tokenStats, detailCard;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Get DOM elements
  sessionInput = document.getElementById('sessionInput');
  loadButton = document.getElementById('loadButton');
  errorMessage = document.getElementById('errorMessage');
  loadingIndicator = document.getElementById('loadingIndicator');
  visualizationSection = document.getElementById('visualizationSection');
  leftButton = document.getElementById('leftButton');
  turnInput = document.getElementById('turnInput');
  rightButton = document.getElementById('rightButton');
  turnSlider = document.getElementById('turnSlider');
  turnLabel = document.getElementById('turnLabel');
  scaleInput = document.getElementById('scaleInput');
  scaleWarning = document.getElementById('scaleWarning');
  visualizationContainer = document.getElementById('visualizationContainer');
  tokenStats = document.getElementById('tokenStats');
  detailCard = document.getElementById('detailCard');

  // Attach event listeners
  loadButton.addEventListener('click', handleLoad);
  leftButton.addEventListener('click', handleLeftClick);
  rightButton.addEventListener('click', handleRightClick);
  turnInput.addEventListener('change', handleTurnInputChange);
  turnSlider.addEventListener('input', handleSliderChange);
  scaleInput.addEventListener('change', handleScaleInputChange);

  // Check for ?id= query parameter (AC-1b)
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get('id');
  if (sessionIdFromUrl) {
    sessionInput.value = sessionIdFromUrl;
    // In Phase 4, this will call handleLoad() automatically
  }
}

// Stub handlers - to be implemented in Phase 4

async function handleLoad() {
  // Stub: just log
  console.log('Load clicked');
}

function handleLeftClick() {
  // Stub
}

function handleRightClick() {
  // Stub
}

function handleTurnInputChange() {
  // Stub
}

function handleSliderChange() {
  // Stub
}

function handleScaleInputChange() {
  // Stub
}

function syncNavigation() {
  // Stub
}

function renderVisualization() {
  // Stub
}

function renderDetailCard() {
  // Stub
}

function checkScaleWarning() {
  // Stub
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function hideError() {
  errorMessage.classList.add('hidden');
}

function showLoading() {
  loadingIndicator.classList.remove('hidden');
}

function hideLoading() {
  loadingIndicator.classList.add('hidden');
}
```

### Step 5: Create Lib Test File `test/js/lib/session-detail.test.js`

**Note:** Follow existing pattern in `test/js/lib/transforms.test.js`. Lib tests run in node environment.

```javascript
import { describe, it, expect } from 'vitest';
import {
  calculateBandHeight,
  formatTokenCount,
  truncateToolContent,
  exceedsScale,
  validateScaleInput,
  validateTurnInput,
  COLORS,
  SCALE_MIN,
  SCALE_MAX,
} from '../../public/js/lib/session-detail.js';

describe('session-detail lib', () => {
  describe('COLORS', () => {
    it('should have all four color definitions', () => {
      expect(COLORS.user).toBeDefined();
      expect(COLORS.assistant).toBeDefined();
      expect(COLORS.thinking).toBeDefined();
      expect(COLORS.tool).toBeDefined();
    });
  });

  describe('SCALE constants', () => {
    it('should have min and max scale values', () => {
      expect(SCALE_MIN).toBe(50);
      expect(SCALE_MAX).toBe(2000);
    });
  });

  describe('calculateBandHeight', () => {
    it('should return 0 (stub)', () => {
      expect(calculateBandHeight(1000, 2000, 500)).toBe(0);
    });
  });

  describe('formatTokenCount', () => {
    it('should return empty string (stub)', () => {
      expect(formatTokenCount(1000)).toBe('');
    });
  });

  describe('truncateToolContent', () => {
    it('should return content unchanged (stub)', () => {
      const content = 'line1\nline2\nline3';
      expect(truncateToolContent(content, 2)).toBe(content);
    });
  });

  describe('exceedsScale', () => {
    it('should return false (stub)', () => {
      expect(exceedsScale({ total: 150000 }, 100)).toBe(false);
    });
  });

  describe('validateScaleInput', () => {
    it('should return value unchanged (stub)', () => {
      expect(validateScaleInput(25)).toBe(25);
    });
  });

  describe('validateTurnInput', () => {
    it('should return value unchanged (stub)', () => {
      expect(validateTurnInput(50, 20)).toBe(50);
    });
  });
});
```

### Step 6: Create Page Test File `test/js/ui/session-detail.test.js`

**Note:** Follow existing pattern in `test/js/ui/loading.test.js`. UI tests automatically use jsdom environment per vitest config.

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

describe('session-detail page', () => {
  let dom;
  let document;

  beforeEach(() => {
    // Create minimal DOM
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <input id="sessionInput" />
        <button id="loadButton">Load</button>
        <div id="errorMessage" class="hidden"></div>
        <div id="loadingIndicator" class="hidden"></div>
        <div id="visualizationSection" class="hidden"></div>
        <button id="leftButton"></button>
        <input id="turnInput" type="number" />
        <button id="rightButton"></button>
        <input id="turnSlider" type="range" />
        <span id="turnLabel"></span>
        <input id="scaleInput" type="number" />
        <span id="scaleWarning" class="hidden"></span>
        <div id="visualizationContainer"></div>
        <div id="tokenStats"></div>
        <div id="detailCard"></div>
      </body>
      </html>
    `);
    document = dom.window.document;
    global.document = document;
  });

  describe('DOM elements', () => {
    it('should have session input', () => {
      expect(document.getElementById('sessionInput')).not.toBeNull();
    });

    it('should have load button', () => {
      expect(document.getElementById('loadButton')).not.toBeNull();
    });

    it('should have navigation controls', () => {
      expect(document.getElementById('leftButton')).not.toBeNull();
      expect(document.getElementById('turnInput')).not.toBeNull();
      expect(document.getElementById('rightButton')).not.toBeNull();
      expect(document.getElementById('turnSlider')).not.toBeNull();
    });

    it('should have scale input', () => {
      expect(document.getElementById('scaleInput')).not.toBeNull();
    });

    it('should have visualization container', () => {
      expect(document.getElementById('visualizationContainer')).not.toBeNull();
    });

    it('should have detail card', () => {
      expect(document.getElementById('detailCard')).not.toBeNull();
    });
  });

  describe('initial state', () => {
    it('should have visualization section hidden', () => {
      const section = document.getElementById('visualizationSection');
      expect(section.classList.contains('hidden')).toBe(true);
    });

    it('should have error message hidden', () => {
      const error = document.getElementById('errorMessage');
      expect(error.classList.contains('hidden')).toBe(true);
    });

    it('should have scale warning hidden', () => {
      const warning = document.getElementById('scaleWarning');
      expect(warning.classList.contains('hidden')).toBe(true);
    });

    it('should have loading indicator hidden', () => {
      const loading = document.getElementById('loadingIndicator');
      expect(loading.classList.contains('hidden')).toBe(true);
    });
  });
});
```

### Step 7: D3 Testing Strategy

D3 is loaded via CDN in the browser. For tests:
- **Lib tests** (`test/js/lib/`): Don't need D3 - pure functions only
- **UI tests** (`test/js/ui/`): Test DOM structure, not D3 rendering
- D3 visualization testing is deferred to Phase 5 manual testing

For UI tests, verify:
- Container element exists
- Correct classes/attributes set
- Don't test actual SVG rendering in jsdom

### Step 8: Vitest Config Verification

The existing `vitest.config.ts` already includes the correct patterns:
```typescript
test: {
  include: ['test/**/*.test.{ts,js}'],
  // ...
}
```

### Step 8: Verify

- Run `npm run typecheck` - should pass
- Run `npm test` - all tests should pass
- Navigate to `/session-detail` - page should load
- Click Load - should log to console (stub behavior)

---

## Coding Standards

### HTML/EJS
- Use semantic HTML elements
- Use Tailwind CSS classes
- Include accessibility attributes where appropriate

### JavaScript
- Use ES Modules (`import`/`export`)
- Use `const` for constants, `let` for variables
- Follow existing patterns in `public/js/`

### Testing
- Use Vitest with jsdom for DOM tests
- Test stub behaviors (return values, not logic)
- Group tests with `describe()`

---

## Definition of Done

- [ ] EJS template created: `views/pages/session-detail.ejs`
- [ ] Page route added to `src/server.ts`
- [ ] Lib module created: `public/js/lib/session-detail.js` with stub functions
- [ ] Page module created: `public/js/pages/session-detail.js` with stub handlers
- [ ] Lib test file created: `test/js/lib/session-detail.test.js`
- [ ] Page test file created: `test/js/ui/session-detail.test.js`
- [ ] TypeScript compiles (backend)
- [ ] All tests pass (stub behaviors)
- [ ] Page loads at `/session-detail`
- [ ] All DOM elements present and accessible

---

## Output Format

Upon completion, provide a report in this format:

```markdown
# Phase 3 Completion Report: UI Skeleton + TDD Red

## Files Created
- [ ] `views/pages/session-detail.ejs`
- [ ] `public/js/lib/session-detail.js`
- [ ] `public/js/pages/session-detail.js`
- [ ] `test/js/lib/session-detail.test.js`
- [ ] `test/js/ui/session-detail.test.js`

## Files Modified
- [ ] `src/server.ts` (added page route)
- [ ] `vitest.config.ts` (if needed)

## Definition of Done Checklist
- [ ] EJS template created with all DOM elements
- [ ] Page route added
- [ ] Lib module created with X stub functions
- [ ] Page module created with X stub handlers
- [ ] Lib tests: X tests, all passing
- [ ] Page tests: X tests, all passing
- [ ] TypeScript compiles
- [ ] Page loads at /session-detail
- [ ] All DOM elements verified

## Standards Adherence
- [ ] Tailwind CSS used for styling
- [ ] ES Modules pattern followed
- [ ] Tests use describe/it pattern
- [ ] Follows existing frontend architecture

## Implementation Notes
[Any notes about implementation decisions, challenges, or deviations]

## Feedback & Recommendations
[Observations about the app, phase spec, feature design, or general recommendations based on what was encountered during implementation]
```
