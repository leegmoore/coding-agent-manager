# Phase 3: UI Skeleton + TDD Red

## Role

You are a Senior Frontend Engineer implementing the UI skeleton for the Session Detail Core feature. Your task is to create the page template, JavaScript modules with stub functions, and **TDD Red tests that expect REAL behavior**.

**CRITICAL:** TDD Red means tests assert real expected behavior. Tests FAIL because stubs return placeholder values. When Phase 4 implements real logic, these same tests will PASS.

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
4. **TDD Red tests that assert REAL expected behavior (tests will FAIL)**

**This phase does NOT implement full logic.** Functions return stub values. Tests FAIL.

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

Create stub functions that return placeholder values:

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

// Stub functions - return placeholder values, will be implemented in Phase 4

export function calculateBandHeight(tokens, maxTokens, containerHeight) {
  // Stub: return 0 (will fail tests expecting real calculation)
  return 0;
}

export function formatTokenCount(tokens) {
  // Stub: return empty string (will fail tests expecting formatted output)
  return '';
}

export function truncateToolContent(content, maxLines = 2) {
  // Stub: return content unchanged (will fail tests expecting truncation)
  return content;
}

export function exceedsScale(cumulative, scaleK) {
  // Stub: return false (will fail tests expecting true when exceeds)
  return false;
}

export function validateScaleInput(value) {
  // Stub: return value unchanged (will fail tests expecting clamping)
  return value;
}

export function validateTurnInput(value, max) {
  // Stub: return value unchanged (will fail tests expecting clamping)
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

**CRITICAL:** These tests assert REAL expected behavior. They will FAIL because stubs return placeholder values. This is correct TDD Red.

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
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
} from '../../../public/js/lib/session-detail.js';

// =============================================================================
// Constants tests - These PASS (constants are defined)
// =============================================================================
describe('Constants', () => {
  describe('COLORS', () => {
    it('has user color as blue hex', () => {
      expect(COLORS.user).toBe('#3B82F6');
    });

    it('has assistant color as green hex', () => {
      expect(COLORS.assistant).toBe('#22C55E');
    });

    it('has thinking color as purple hex', () => {
      expect(COLORS.thinking).toBe('#A855F7');
    });

    it('has tool color as orange hex', () => {
      expect(COLORS.tool).toBe('#F97316');
    });
  });

  describe('SCALE constants', () => {
    it('has SCALE_MIN as 50', () => {
      expect(SCALE_MIN).toBe(50);
    });

    it('has SCALE_MAX as 2000', () => {
      expect(SCALE_MAX).toBe(2000);
    });
  });

  describe('Dimension constants', () => {
    it('has DEFAULT_WIDTH as 800', () => {
      expect(DEFAULT_WIDTH).toBe(800);
    });

    it('has DEFAULT_HEIGHT as 500', () => {
      expect(DEFAULT_HEIGHT).toBe(500);
    });
  });
});

// =============================================================================
// calculateBandHeight tests - WILL FAIL (stub returns 0)
// =============================================================================
describe('calculateBandHeight', () => {
  it('returns 0 when tokens is 0', () => {
    expect(calculateBandHeight(0, 100000, 500)).toBe(0);
  });

  it('returns full height when tokens equals maxTokens', () => {
    expect(calculateBandHeight(100000, 100000, 500)).toBe(500);
  });

  it('returns half height when tokens is half of maxTokens', () => {
    expect(calculateBandHeight(50000, 100000, 500)).toBe(250);
  });

  it('returns proportional height for arbitrary values', () => {
    // 25000 / 100000 = 0.25, 0.25 * 500 = 125
    expect(calculateBandHeight(25000, 100000, 500)).toBe(125);
  });

  it('returns 0 when maxTokens is 0 (guard against division by zero)', () => {
    expect(calculateBandHeight(1000, 0, 500)).toBe(0);
  });

  it('handles different container heights', () => {
    expect(calculateBandHeight(50000, 100000, 400)).toBe(200);
    expect(calculateBandHeight(50000, 100000, 600)).toBe(300);
  });
});

// =============================================================================
// formatTokenCount tests - WILL FAIL (stub returns empty string)
// =============================================================================
describe('formatTokenCount', () => {
  it('returns raw number for values under 1000', () => {
    expect(formatTokenCount(500)).toBe('500');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats thousands with k suffix', () => {
    expect(formatTokenCount(1000)).toBe('1k');
    expect(formatTokenCount(1500)).toBe('1.5k');
    expect(formatTokenCount(2500)).toBe('2.5k');
  });

  it('formats tens of thousands with k suffix', () => {
    expect(formatTokenCount(10000)).toBe('10k');
    expect(formatTokenCount(50000)).toBe('50k');
    expect(formatTokenCount(99500)).toBe('99.5k');
  });

  it('formats hundreds of thousands with k suffix', () => {
    expect(formatTokenCount(100000)).toBe('100k');
    expect(formatTokenCount(500000)).toBe('500k');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokenCount(1000000)).toBe('1M');
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });

  it('handles zero', () => {
    expect(formatTokenCount(0)).toBe('0');
  });
});

// =============================================================================
// truncateToolContent tests - WILL FAIL (stub returns content unchanged)
// =============================================================================
describe('truncateToolContent', () => {
  it('returns content unchanged if lines <= maxLines', () => {
    expect(truncateToolContent('line1', 2)).toBe('line1');
    expect(truncateToolContent('line1\nline2', 2)).toBe('line1\nline2');
  });

  it('truncates content and adds ellipsis when lines > maxLines', () => {
    const content = 'line1\nline2\nline3\nline4';
    expect(truncateToolContent(content, 2)).toBe('line1\nline2\n...');
  });

  it('uses default maxLines of 2', () => {
    const content = 'line1\nline2\nline3';
    expect(truncateToolContent(content)).toBe('line1\nline2\n...');
  });

  it('handles single line content', () => {
    expect(truncateToolContent('single line', 2)).toBe('single line');
  });

  it('handles empty content', () => {
    expect(truncateToolContent('', 2)).toBe('');
  });

  it('handles content with exactly maxLines', () => {
    expect(truncateToolContent('line1\nline2', 2)).toBe('line1\nline2');
  });

  it('respects custom maxLines parameter', () => {
    const content = 'line1\nline2\nline3\nline4\nline5';
    expect(truncateToolContent(content, 3)).toBe('line1\nline2\nline3\n...');
    expect(truncateToolContent(content, 4)).toBe('line1\nline2\nline3\nline4\n...');
  });
});

// =============================================================================
// exceedsScale tests - WILL FAIL (stub returns false)
// =============================================================================
describe('exceedsScale', () => {
  it('returns false when total is under scale', () => {
    expect(exceedsScale({ total: 50000 }, 100)).toBe(false);  // 50k < 100k
  });

  it('returns false when total equals scale', () => {
    expect(exceedsScale({ total: 100000 }, 100)).toBe(false);  // 100k == 100k
  });

  it('returns true when total exceeds scale', () => {
    expect(exceedsScale({ total: 150000 }, 100)).toBe(true);  // 150k > 100k
  });

  it('correctly handles edge cases near boundary', () => {
    expect(exceedsScale({ total: 99999 }, 100)).toBe(false);
    expect(exceedsScale({ total: 100001 }, 100)).toBe(true);
  });

  it('works with different scale values', () => {
    expect(exceedsScale({ total: 60000 }, 50)).toBe(true);   // 60k > 50k
    expect(exceedsScale({ total: 1500000 }, 2000)).toBe(false); // 1.5M < 2M
  });
});

// =============================================================================
// validateScaleInput tests - WILL FAIL (stub returns value unchanged)
// =============================================================================
describe('validateScaleInput', () => {
  it('returns value unchanged when within valid range', () => {
    expect(validateScaleInput(100)).toBe(100);
    expect(validateScaleInput(500)).toBe(500);
    expect(validateScaleInput(1000)).toBe(1000);
  });

  it('clamps to SCALE_MIN when value is below minimum', () => {
    expect(validateScaleInput(0)).toBe(50);
    expect(validateScaleInput(25)).toBe(50);
    expect(validateScaleInput(49)).toBe(50);
  });

  it('clamps to SCALE_MAX when value is above maximum', () => {
    expect(validateScaleInput(2001)).toBe(2000);
    expect(validateScaleInput(3000)).toBe(2000);
    expect(validateScaleInput(10000)).toBe(2000);
  });

  it('handles boundary values correctly', () => {
    expect(validateScaleInput(50)).toBe(50);   // exactly SCALE_MIN
    expect(validateScaleInput(2000)).toBe(2000); // exactly SCALE_MAX
  });

  it('handles non-numeric input by returning SCALE_MIN', () => {
    expect(validateScaleInput(NaN)).toBe(50);
    expect(validateScaleInput(undefined)).toBe(50);
  });
});

// =============================================================================
// validateTurnInput tests - WILL FAIL (stub returns value unchanged)
// =============================================================================
describe('validateTurnInput', () => {
  it('returns value unchanged when within valid range', () => {
    expect(validateTurnInput(5, 10)).toBe(5);
    expect(validateTurnInput(0, 10)).toBe(0);
    expect(validateTurnInput(10, 10)).toBe(10);
  });

  it('clamps to 0 when value is negative', () => {
    expect(validateTurnInput(-1, 10)).toBe(0);
    expect(validateTurnInput(-100, 10)).toBe(0);
  });

  it('clamps to max when value exceeds max', () => {
    expect(validateTurnInput(15, 10)).toBe(10);
    expect(validateTurnInput(100, 10)).toBe(10);
  });

  it('handles max of 0 (single turn session)', () => {
    expect(validateTurnInput(0, 0)).toBe(0);
    expect(validateTurnInput(1, 0)).toBe(0);
  });

  it('handles non-numeric input by returning 0', () => {
    expect(validateTurnInput(NaN, 10)).toBe(0);
    expect(validateTurnInput(undefined, 10)).toBe(0);
  });
});
```

### Step 6: Create Page Test File `test/js/ui/session-detail.test.js`

**Note:** UI tests verify DOM structure and initial state. These CAN pass because they test the template, not the stub functions.

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

describe('session-detail page', () => {
  let dom;
  let document;

  beforeEach(() => {
    // Create minimal DOM matching the EJS template
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <input id="sessionInput" />
        <button id="loadButton">Load</button>
        <div id="errorMessage" class="hidden"></div>
        <div id="loadingIndicator" class="hidden"></div>
        <div id="visualizationSection" class="hidden">
          <button id="leftButton"></button>
          <input id="turnInput" type="number" min="0" value="0" />
          <button id="rightButton"></button>
          <input id="turnSlider" type="range" min="0" max="0" value="0" />
          <span id="turnLabel">Turn 0 of 0</span>
          <input id="scaleInput" type="number" min="50" max="2000" value="200" />
          <span id="scaleWarning" class="hidden"></span>
          <div id="visualizationContainer"></div>
          <div id="tokenStats"></div>
          <div id="detailCard"></div>
        </div>
      </body>
      </html>
    `);
    document = dom.window.document;
    global.document = document;
  });

  // =============================================================================
  // DOM Structure tests - These PASS (testing template structure)
  // =============================================================================
  describe('DOM structure', () => {
    it('has session input field', () => {
      const input = document.getElementById('sessionInput');
      expect(input).not.toBeNull();
      expect(input.tagName).toBe('INPUT');
    });

    it('has load button', () => {
      const button = document.getElementById('loadButton');
      expect(button).not.toBeNull();
      expect(button.tagName).toBe('BUTTON');
    });

    it('has error message container', () => {
      expect(document.getElementById('errorMessage')).not.toBeNull();
    });

    it('has loading indicator', () => {
      expect(document.getElementById('loadingIndicator')).not.toBeNull();
    });

    it('has visualization section', () => {
      expect(document.getElementById('visualizationSection')).not.toBeNull();
    });

    it('has all navigation controls', () => {
      expect(document.getElementById('leftButton')).not.toBeNull();
      expect(document.getElementById('turnInput')).not.toBeNull();
      expect(document.getElementById('rightButton')).not.toBeNull();
      expect(document.getElementById('turnSlider')).not.toBeNull();
      expect(document.getElementById('turnLabel')).not.toBeNull();
    });

    it('has scale controls', () => {
      expect(document.getElementById('scaleInput')).not.toBeNull();
      expect(document.getElementById('scaleWarning')).not.toBeNull();
    });

    it('has visualization container', () => {
      expect(document.getElementById('visualizationContainer')).not.toBeNull();
    });

    it('has token stats display', () => {
      expect(document.getElementById('tokenStats')).not.toBeNull();
    });

    it('has detail card', () => {
      expect(document.getElementById('detailCard')).not.toBeNull();
    });
  });

  // =============================================================================
  // Initial State tests - These PASS (testing initial class states)
  // =============================================================================
  describe('initial state', () => {
    it('has visualization section hidden initially', () => {
      const section = document.getElementById('visualizationSection');
      expect(section.classList.contains('hidden')).toBe(true);
    });

    it('has error message hidden initially', () => {
      const error = document.getElementById('errorMessage');
      expect(error.classList.contains('hidden')).toBe(true);
    });

    it('has loading indicator hidden initially', () => {
      const loading = document.getElementById('loadingIndicator');
      expect(loading.classList.contains('hidden')).toBe(true);
    });

    it('has scale warning hidden initially', () => {
      const warning = document.getElementById('scaleWarning');
      expect(warning.classList.contains('hidden')).toBe(true);
    });

    it('has turn input starting at 0', () => {
      const turnInput = document.getElementById('turnInput');
      expect(turnInput.value).toBe('0');
    });

    it('has scale input starting at 200', () => {
      const scaleInput = document.getElementById('scaleInput');
      expect(scaleInput.value).toBe('200');
    });

    it('has turn slider starting at 0', () => {
      const slider = document.getElementById('turnSlider');
      expect(slider.value).toBe('0');
    });

    it('has turn label showing "Turn 0 of 0"', () => {
      const label = document.getElementById('turnLabel');
      expect(label.textContent).toBe('Turn 0 of 0');
    });
  });

  // =============================================================================
  // Input constraints tests - These PASS (testing HTML attributes)
  // =============================================================================
  describe('input constraints', () => {
    it('turn input has min of 0', () => {
      const turnInput = document.getElementById('turnInput');
      expect(turnInput.getAttribute('min')).toBe('0');
    });

    it('scale input has min of 50 and max of 2000', () => {
      const scaleInput = document.getElementById('scaleInput');
      expect(scaleInput.getAttribute('min')).toBe('50');
      expect(scaleInput.getAttribute('max')).toBe('2000');
    });

    it('turn slider has min of 0', () => {
      const slider = document.getElementById('turnSlider');
      expect(slider.getAttribute('min')).toBe('0');
    });
  });
});
```

### Step 7: D3 Testing Strategy

D3 is loaded via CDN in the browser. For tests:
- **Lib tests** (`test/js/lib/`): Test pure functions only - no D3 needed
- **UI tests** (`test/js/ui/`): Test DOM structure - no D3 rendering
- D3 visualization testing is deferred to Phase 5 manual testing

### Step 8: Verify

- Run `npm run typecheck` - should pass
- Run `npm test` - **lib behavior tests FAIL, DOM structure tests pass**
- Navigate to `/session-detail` - page should load

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
- Use Vitest with describe/it pattern
- Lib tests assert REAL expected behavior (will FAIL)
- UI tests verify DOM structure (will PASS)
- This is correct TDD Red for lib layer

---

## Definition of Done

- [ ] EJS template created: `views/pages/session-detail.ejs`
- [ ] Page route added to `src/server.ts`
- [ ] Lib module created: `public/js/lib/session-detail.js` with stub functions
- [ ] Page module created: `public/js/pages/session-detail.js` with stub handlers
- [ ] Lib test file created: `test/js/lib/session-detail.test.js` with behavior assertions
- [ ] Page test file created: `test/js/ui/session-detail.test.js` with DOM tests
- [ ] TypeScript compiles (backend)
- [ ] DOM structure tests pass
- [ ] **Lib behavior tests FAIL** (stubs return placeholder values) - THIS IS CORRECT
- [ ] Page loads at `/session-detail`
- [ ] All DOM elements present and accessible

---

## Verification

```bash
npm run typecheck   # Should pass
npm test            # Lib behavior tests FAIL, DOM tests pass
```

**Expected test results:**
| Test Category | Expected Result |
|---------------|-----------------|
| Existing tests | PASS |
| Constants tests | PASS |
| DOM structure tests | PASS |
| Initial state tests | PASS |
| calculateBandHeight tests | FAIL (stub returns 0) |
| formatTokenCount tests | FAIL (stub returns '') |
| truncateToolContent tests | FAIL (stub returns unchanged) |
| exceedsScale tests | FAIL (stub returns false) |
| validateScaleInput tests | FAIL (stub returns unchanged) |
| validateTurnInput tests | FAIL (stub returns unchanged) |

This is correct TDD Red: comprehensive behavior tests written, lib tests failing, DOM tests passing.

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

## Test Results
- Existing tests: X passing
- New DOM structure tests: X passing
- New lib behavior tests: X failing (stub returns) - EXPECTED

## Definition of Done Checklist
- [ ] EJS template created
- [ ] Page route added
- [ ] Lib stubs created
- [ ] Page stubs created
- [ ] Comprehensive lib behavior tests written
- [ ] DOM structure tests written
- [ ] TypeScript compiles
- [ ] DOM tests pass
- [ ] Lib behavior tests FAIL (correct TDD Red)
- [ ] Page loads

## Feedback & Recommendations
[Observations about the app, phase spec, feature design]
```
