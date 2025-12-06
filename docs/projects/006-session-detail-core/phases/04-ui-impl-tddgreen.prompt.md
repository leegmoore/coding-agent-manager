# Phase 4: UI Implementation + TDD Green

## Role

You are a Senior Frontend Engineer implementing the UI logic for the Session Detail Core feature. Your task is to implement all lib and page functions so that the TDD tests from Phase 3 pass with real logic. You will also add tests for edge cases and implement the D3 visualization.

---

## Application Overview

**coding-agent-manager** is a web application for managing Claude Code sessions. The frontend uses:
- Vanilla JavaScript with ES Modules
- D3.js for visualizations
- Tailwind CSS for styling
- Layered architecture: `lib/` → `api/` → `pages/`

**API Endpoint (from Phase 2):**
- `GET /api/session/:id/turns` - Returns `SessionTurnsResponse`

**Reusable Functions (DO USE THESE):**
- `get(url)` from `public/js/api/client.js` - Fetch API data with error handling
- `showShimmer()`, `hideShimmer()` from `public/js/ui/loading.js` - Loading indicators (if applicable)
- `showSuccess()`, `showError()` from `public/js/ui/notifications.js` - User feedback

---

## Feature Overview

**Session Detail Core** page provides:
1. Session ID input + Load button → calls API
2. Turn navigation: synchronized buttons, input, slider
3. Vertical band visualization with D3 (User, Assistant, Thinking, Tool)
4. Scale input (50k-2000k) with auto-expand warning
5. Turn detail card with markdown content

---

## Phase Scope

Implement all frontend logic:
1. Lib functions - pure calculation and formatting
2. Page orchestration - event handlers, state management
3. D3 visualization - render vertical bands
4. Navigation sync - buttons, input, slider stay in sync
5. Detail card - render turn content as markdown

---

## IMPORTANT: Test Updates Required

Phase 3 created tests that expected **stub behaviors** (returning 0, empty strings, etc.). In this phase, you MUST:

1. **REPLACE** stub expectation tests with real behavior tests
2. Do **NOT** keep both old and new tests - the old stub tests are now invalid
3. Update test descriptions to reflect actual behavior

For example, Phase 3 had:
```javascript
it('should return 0 (stub)', () => {
  expect(calculateBandHeight(1000, 2000, 500)).toBe(0);
});
```

This MUST be replaced with:
```javascript
it('should calculate proportional height', () => {
  expect(calculateBandHeight(1000, 2000, 500)).toBe(250);
});
```

---

## Reference Documents

### Feature Specification
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/01-session-detail-core.feature.md`

Focus on all UI acceptance criteria (AC-1 through AC-23) and test conditions (TC-01 through TC-17).

### Technical Design
**File:** `/Users/leemoore/code/codex-port-02/coding-agent-manager/docs/projects/006-session-detail-core/02-session-detail-core.tech-design.md`

Focus on frontend lib and page functions (Section 5).

### Phase 3 Implementation
Review the files created in Phase 3:
- `public/js/lib/session-detail.js` - stubs to implement
- `public/js/pages/session-detail.js` - stubs to implement
- `test/js/lib/session-detail.test.js` - tests to make pass
- `test/js/ui/session-detail.test.js` - tests to make pass

---

## Step-by-Step Implementation

### Step 1: Implement Lib Functions

```javascript
// public/js/lib/session-detail.js

// Note: SCALE_MIN and SCALE_MAX are already defined as constants in this file
// Make sure validateScaleInput uses these constants

export function calculateBandHeight(tokens, maxTokens, containerHeight) {
  if (maxTokens === 0) return 0;
  return Math.round((tokens / maxTokens) * containerHeight);
}

export function formatTokenCount(tokens) {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return tokens.toString();
}

export function truncateToolContent(content, maxLines = 2) {
  if (!content) return '';
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join('\n') + '\n...';
}

export function exceedsScale(cumulative, scaleK) {
  return cumulative.total > scaleK * 1000;
}

export function validateScaleInput(value) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return SCALE_MIN;
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, num));
}

export function validateTurnInput(value, max) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return 0;
  return Math.max(0, Math.min(max, num));
}
```

### Step 2: Update Lib Tests

Update `test/js/lib/session-detail.test.js` with real expectations:

```javascript
describe('calculateBandHeight', () => {
  it('should calculate proportional height', () => {
    expect(calculateBandHeight(1000, 2000, 500)).toBe(250);
  });

  it('should return 0 when maxTokens is 0', () => {
    expect(calculateBandHeight(1000, 0, 500)).toBe(0);
  });

  it('should handle full height', () => {
    expect(calculateBandHeight(2000, 2000, 500)).toBe(500);
  });
});

describe('formatTokenCount', () => {
  it('should format thousands with k suffix', () => {
    expect(formatTokenCount(1500)).toBe('2k');
    expect(formatTokenCount(50000)).toBe('50k');
  });

  it('should format millions with M suffix', () => {
    expect(formatTokenCount(1500000)).toBe('1.5M');
  });

  it('should return number as string for small values', () => {
    expect(formatTokenCount(500)).toBe('500');
  });
});

describe('truncateToolContent', () => {
  it('should return content unchanged if within limit', () => {
    expect(truncateToolContent('line1\nline2', 2)).toBe('line1\nline2');
  });

  it('should truncate with ellipsis', () => {
    expect(truncateToolContent('line1\nline2\nline3', 2)).toBe('line1\nline2\n...');
  });

  it('should handle empty content', () => {
    expect(truncateToolContent('', 2)).toBe('');
  });
});

describe('exceedsScale', () => {
  it('should return true when total exceeds scale', () => {
    expect(exceedsScale({ total: 150000 }, 100)).toBe(true);
  });

  it('should return false when total is within scale', () => {
    expect(exceedsScale({ total: 50000 }, 100)).toBe(false);
  });
});

describe('validateScaleInput', () => {
  it('should clamp to min', () => {
    expect(validateScaleInput(25)).toBe(50);
  });

  it('should clamp to max', () => {
    expect(validateScaleInput(3000)).toBe(2000);
  });

  it('should accept valid values', () => {
    expect(validateScaleInput(200)).toBe(200);
  });

  it('should handle NaN', () => {
    expect(validateScaleInput('abc')).toBe(50);
  });
});

describe('validateTurnInput', () => {
  it('should clamp to 0', () => {
    expect(validateTurnInput(-5, 20)).toBe(0);
  });

  it('should clamp to max', () => {
    expect(validateTurnInput(50, 20)).toBe(20);
  });

  it('should accept valid values', () => {
    expect(validateTurnInput(10, 20)).toBe(10);
  });
});
```

### Step 3: Implement Page Handlers

**Note:** Also update the `init()` function to auto-load when `?id=` query param is present (AC-1b):

```javascript
// In init(), update the query param section:
if (sessionIdFromUrl) {
  sessionInput.value = sessionIdFromUrl;
  handleLoad();  // Auto-load the session
}
```

```javascript
// public/js/pages/session-detail.js

async function handleLoad() {
  const sessionId = sessionInput.value.trim();
  if (!sessionId) {
    showError('Please enter a session ID');
    return;
  }

  hideError();
  showLoading();

  try {
    sessionData = await get(`/api/session/${sessionId}/turns`);
    hideLoading();
    currentTurn = sessionData.totalTurns - 1; // Start at latest turn

    // Setup navigation bounds
    turnSlider.max = sessionData.totalTurns - 1;
    turnInput.max = sessionData.totalTurns - 1;

    // Show visualization section
    visualizationSection.classList.remove('hidden');

    // Render initial state
    syncNavigation();
    checkScaleWarning();
    renderVisualization();
    renderDetailCard();
  } catch (error) {
    hideLoading();
    showError(error.message || 'Failed to load session');
  }
}

function handleLeftClick() {
  if (currentTurn > 0) {
    currentTurn--;
    syncNavigation();
    checkScaleWarning();
    renderVisualization();
    renderDetailCard();
  }
}

function handleRightClick() {
  if (currentTurn < sessionData.totalTurns - 1) {
    currentTurn++;
    syncNavigation();
    checkScaleWarning();
    renderVisualization();
    renderDetailCard();
  }
}

function handleTurnInputChange() {
  currentTurn = validateTurnInput(turnInput.value, sessionData.totalTurns - 1);
  syncNavigation();
  checkScaleWarning();
  renderVisualization();
  renderDetailCard();
}

function handleSliderChange() {
  currentTurn = parseInt(turnSlider.value, 10);
  syncNavigation();
  checkScaleWarning();
  renderVisualization();
  renderDetailCard();
}

function handleScaleInputChange() {
  currentScale = validateScaleInput(scaleInput.value);
  scaleInput.value = currentScale;
  checkScaleWarning();
  renderVisualization();
}

function syncNavigation() {
  turnInput.value = currentTurn;
  turnSlider.value = currentTurn;
  // Display human-friendly: "Turn 1 of 10" (not zero-indexed for display)
  turnLabel.textContent = `Turn ${currentTurn + 1} of ${sessionData.totalTurns}`;

  // Enable/disable buttons
  leftButton.disabled = currentTurn === 0;
  rightButton.disabled = currentTurn === sessionData.totalTurns - 1;
}

function checkScaleWarning() {
  const turn = sessionData.turns[currentTurn];
  if (exceedsScale(turn.cumulative, currentScale)) {
    // Auto-expand
    currentScale = Math.ceil(turn.cumulative.total / 1000);
    scaleInput.value = currentScale;
    scaleWarning.classList.remove('hidden');
  } else {
    scaleWarning.classList.add('hidden');
  }
}
```

### Step 4: Implement D3 Visualization

```javascript
function renderVisualization() {
  const turn = sessionData.turns[currentTurn];
  const cumulative = turn.cumulative;
  const maxTokens = currentScale * 1000;

  // Clear previous
  visualizationContainer.innerHTML = '';

  const width = DEFAULT_WIDTH;
  const height = DEFAULT_HEIGHT;
  const bandWidth = width / 4;
  const bandGap = 0;

  const svg = d3.select(visualizationContainer)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // Band data
  const bands = [
    { type: 'user', tokens: cumulative.user, color: COLORS.user },
    { type: 'assistant', tokens: cumulative.assistant, color: COLORS.assistant },
    { type: 'thinking', tokens: cumulative.thinking, color: COLORS.thinking },
    { type: 'tool', tokens: cumulative.tool, color: COLORS.tool },
  ];

  // Render bands (from bottom up)
  bands.forEach((band, i) => {
    const bandHeight = calculateBandHeight(band.tokens, maxTokens, height);
    const x = i * bandWidth;
    const y = height - bandHeight; // Align to bottom

    svg.append('rect')
      .attr('x', x)
      .attr('y', y)
      .attr('width', bandWidth - bandGap)
      .attr('height', bandHeight)
      .attr('fill', band.color);

    // Label
    if (band.tokens > 0) {
      svg.append('text')
        .attr('x', x + bandWidth / 2)
        .attr('y', y - 5)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .text(formatTokenCount(band.tokens));
    }
  });

  // Update stats
  tokenStats.textContent = `Total: ${formatTokenCount(cumulative.total)} tokens`;
}
```

### Step 5: Implement Detail Card Rendering

```javascript
function renderDetailCard() {
  const turn = sessionData.turns[currentTurn];
  const content = turn.content;

  let html = '';

  // User prompt
  if (content.userPrompt) {
    html += `<h3 class="font-semibold text-blue-600">User</h3>`;
    html += `<pre class="bg-gray-50 p-3 rounded text-sm overflow-x-auto">${escapeHtml(content.userPrompt)}</pre>`;
  }

  // Tool calls
  if (content.toolBlocks && content.toolBlocks.length > 0) {
    html += `<h3 class="font-semibold text-orange-600 mt-4">Tool Calls</h3>`;
    content.toolBlocks.forEach(tool => {
      const truncated = truncateToolContent(tool.content);
      html += `<div class="bg-orange-50 p-3 rounded mt-2">`;
      html += `<strong>${escapeHtml(tool.name)}</strong>`;
      html += `<pre class="text-sm mt-1">${escapeHtml(truncated)}</pre>`;
      html += `</div>`;
    });
  }

  // Assistant response
  if (content.assistantResponse) {
    html += `<h3 class="font-semibold text-green-600 mt-4">Assistant</h3>`;
    html += `<pre class="bg-gray-50 p-3 rounded text-sm overflow-x-auto whitespace-pre-wrap">${escapeHtml(content.assistantResponse)}</pre>`;
  }

  detailCard.innerHTML = html;
}

function escapeHtml(text) {
  // String-based implementation (works in both browser and Node.js tests)
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### Step 6: Add Page Tests

Add tests for page functionality:

```javascript
describe('handleLoad', () => {
  it('should show error for empty session ID', async () => {
    sessionInput.value = '';
    await handleLoad();
    expect(errorMessage.classList.contains('hidden')).toBe(false);
  });
});

describe('syncNavigation', () => {
  it('should disable left button at turn 0', () => {
    currentTurn = 0;
    sessionData = { totalTurns: 10, turns: [] };
    syncNavigation();
    expect(leftButton.disabled).toBe(true);
  });

  it('should disable right button at max turn', () => {
    currentTurn = 9;
    sessionData = { totalTurns: 10, turns: [] };
    syncNavigation();
    expect(rightButton.disabled).toBe(true);
  });
});
```

### Step 7: Verify End-to-End

- Navigate to `/session-detail`
- Enter a valid session ID
- Verify visualization displays
- Navigate through turns
- Verify scale warning triggers when appropriate
- Verify detail card updates

---

## Coding Standards

### JavaScript
- Use ES Modules
- Use `const` for constants
- Use pure functions in lib module
- Handle errors gracefully

### D3.js
- Use method chaining
- Clear previous content before re-rendering
- Use semantic variable names

### D3 Testing Strategy
- D3 visualization is NOT unit tested - jsdom doesn't fully support SVG rendering
- Unit tests verify lib functions and DOM structure only
- D3 rendering is verified in Phase 5 manual testing
- For page tests, mock the `renderVisualization` function or verify it was called

### Testing
- Test real behaviors, not stubs
- Include edge cases
- Mock API responses for page tests

---

## Definition of Done

- [ ] All lib functions implemented
- [ ] All page handlers implemented
- [ ] D3 visualization renders correctly
- [ ] Navigation controls sync properly
- [ ] Scale warning triggers when context exceeds scale
- [ ] Detail card renders turn content
- [ ] Tool content truncated correctly
- [ ] All Phase 3 tests pass with real implementation
- [ ] Edge case tests added
- [ ] End-to-end manual verification passes

---

## Output Format

Upon completion, provide a report in this format:

```markdown
# Phase 4 Completion Report: UI Implementation + TDD Green

## Files Modified
- [ ] `public/js/lib/session-detail.js` (implemented all functions)
- [ ] `public/js/pages/session-detail.js` (implemented all handlers)
- [ ] `test/js/lib/session-detail.test.js` (updated with real expectations)
- [ ] `test/js/ui/session-detail.test.js` (added page tests)

## Definition of Done Checklist
- [ ] Lib functions implemented: X functions
- [ ] Page handlers implemented: X handlers
- [ ] D3 visualization renders
- [ ] Navigation controls sync
- [ ] Scale warning triggers correctly
- [ ] Detail card renders
- [ ] Tool content truncation works
- [ ] Phase 3 tests pass: X/Y
- [ ] Edge case tests added: X new tests
- [ ] Manual E2E verification: passed

## Standards Adherence
- [ ] ES Modules used throughout
- [ ] Pure functions in lib module
- [ ] D3 patterns followed
- [ ] Error handling in place

## Test Coverage Summary
| Module | Tests | Passing |
|--------|-------|---------|
| Lib | X | Y |
| Page | X | Y |

## Implementation Notes
[Any notes about implementation decisions, challenges, or deviations]

## Feedback & Recommendations
[Observations about the app, phase spec, feature design, or general recommendations based on what was encountered during implementation]
```
