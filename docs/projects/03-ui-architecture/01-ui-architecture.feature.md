# UI Architecture Enhancement

## Overview

Refactor the existing vanilla JS/HTML UI from a monolithic structure to a layered, testable architecture that supports TDD and scales for future feature development.

**Current State:** Single `clone.js` file with all logic embedded in `DOMContentLoaded` callback. No separation of concerns, no testability without full DOM setup.

**Target State:** Layered ES module architecture with pure functions (testable), API layer (mockable), UI utilities (reusable), and thin page orchestration.

---

## User Story

**As an** AI-enabled software engineer building tools for Claude Code session management,
**I want** a well-structured frontend codebase with clear separation of concerns,
**So that** I can:
- Write tests first (TDD) for business logic without DOM setup
- Reuse UI components across pages
- Extend features without regression risk
- Maintain code quality as complexity grows

---

## Scope

### In Scope

- Restructure `public/js/` into layered module architecture
- Extract pure validation functions to testable `lib/` layer
- Create reusable API client in `api/` layer
- Create reusable UI utilities in `ui/` layer
- Refactor `clone.js` to orchestrate imported modules
- Unit test `lib/` layer with Vitest (no DOM)
- Unit test `ui/` layer with Vitest + jsdom
- Maintain identical user-facing functionality

### Out of Scope

- E2E testing (Playwright/Cypress) - future enhancement
- React/Vue/framework migration - staying vanilla JS
- Backend changes - API remains unchanged (v2 endpoint already exists)

### Phase 4 Addition

Phase 4 extends the refactored architecture with compression UI controls:
- Compression band inputs with validation
- Debug log checkbox and viewer
- Compression stats display
- Uses v2 endpoint with compression support

---

## Architecture

### Target Structure

```
public/js/
├── lib/                    # Layer 1: Pure functions (unit testable, no DOM)
│   ├── validation.js       # Form validation logic
│   └── transforms.js       # Data transformations
│
├── api/                    # Layer 2: API layer (mockable)
│   └── client.js           # Fetch wrapper, error handling
│
├── ui/                     # Layer 3: UI utilities (testable with jsdom)
│   ├── loading.js          # Loading states, shimmer
│   └── notifications.js    # Success/error displays
│
└── pages/                  # Layer 4: Page orchestration (manual test)
    └── clone.js            # Wires layers together
```

### Dependency Direction

```
pages/ → ui/ → api/ → lib/
         ↓
       (never reverse)
```

Pages import from all layers. UI imports from API and lib. API imports from lib. Lib has no dependencies.

### Module Loading

Native ES modules via `<script type="module">`:

```html
<script type="module" src="/js/pages/clone.js"></script>
```

No bundler required. Browser-native imports.

---

## Acceptance Criteria

### Architecture

- [ ] AC-01: `public/js/lib/` directory exists with pure function modules
- [ ] AC-02: `public/js/api/` directory exists with API client module
- [ ] AC-03: `public/js/ui/` directory exists with UI utility modules
- [ ] AC-04: `public/js/pages/` directory exists with page orchestration
- [ ] AC-05: All modules use ES module syntax (import/export)
- [ ] AC-06: No circular dependencies between layers

### Extraction

- [ ] AC-07: UUID validation extracted to `lib/validation.js`
- [ ] AC-08: API fetch logic extracted to `api/client.js`
- [ ] AC-09: Loading state logic extracted to `ui/loading.js`
- [ ] AC-10: Success/error display extracted to `ui/notifications.js`
- [ ] AC-11: `pages/clone.js` imports and orchestrates all layers

### Testing

- [ ] AC-12: `lib/` modules have unit tests (Vitest, no DOM)
- [ ] AC-13: `ui/` modules have unit tests (Vitest + jsdom)
- [ ] AC-14: All tests pass
- [ ] AC-15: Test files located in `test/js/` mirroring `public/js/` structure

### Functionality

- [ ] AC-16: Clone form submits correctly (same as before)
- [ ] AC-17: Success result displays correctly (same as before)
- [ ] AC-18: Error handling works correctly (same as before)
- [ ] AC-19: Copy-to-clipboard works correctly (same as before)
- [ ] AC-20: No visual changes to UI except loading state (shimmer text replaces spinner)

---

## Functional Test Conditions

### TC-01: Validation - Valid UUID
- **Given:** `validateUUID('00a61603-c2ea-4d4c-aee8-4a292ab7b3f4')`
- **Then:** Returns `true`

### TC-02: Validation - Invalid UUID
- **Given:** `validateUUID('not-a-uuid')`
- **Then:** Returns `false`

### TC-03: Validation - Empty string
- **Given:** `validateUUID('')`
- **Then:** Returns `false`

### TC-03b: Validation - Whitespace-padded UUID
- **Given:** `validateUUID(' 00a61603-c2ea-4d4c-aee8-4a292ab7b3f4 ')`
- **Then:** Returns `false` (callers must trim)

### TC-04: API Client - Successful POST
- **Given:** Mock fetch returns 200 with JSON
- **When:** `post('/api/clone', data)`
- **Then:** Returns parsed JSON body

### TC-05: API Client - HTTP Error
- **Given:** Mock fetch returns 400 with error JSON
- **When:** `post('/api/clone', data)`
- **Then:** Throws `ApiError` with message and status

### TC-06: API Client - Network Error
- **Given:** Mock fetch rejects with network error
- **When:** `post('/api/clone', data)`
- **Then:** Throws error with network message

### TC-06b: API Client - Non-JSON Response
- **Given:** Mock fetch returns 200 with HTML (not JSON)
- **When:** `post('/api/clone', data)`
- **Then:** Throws `ApiError` with code `PARSE_ERROR`

### TC-07: Loading - Show shimmer
- **Given:** DOM element exists
- **When:** `showLoading(element, 'Loading...')`
- **Then:** Element has shimmer class and text content

### TC-08: Loading - Hide
- **Given:** Element is visible with shimmer
- **When:** `hideLoading(element)`
- **Then:** Element is hidden

### TC-09: Notifications - Show success
- **Given:** Container element exists
- **When:** `showSuccess(container, { sessionId, stats })`
- **Then:** Success content rendered, container visible

### TC-09b: Notifications - Show success with empty stats
- **Given:** Container element exists, stats is empty array
- **When:** `showSuccess(container, { sessionId, command, stats: [] })`
- **Then:** Stats list is empty, no errors

### TC-10: Notifications - Show error
- **Given:** Container element exists
- **When:** `showError(container, 'Error message')`
- **Then:** Error content rendered, container visible

### TC-11: Integration - Clone flow
- **Given:** Form with valid session ID
- **When:** User clicks submit
- **Then:** Loading shown → API called → Success displayed

### TC-12: Integration - Error flow
- **Given:** Form with invalid session ID format
- **When:** User clicks submit
- **Then:** Validation error shown, no API call

---

## Technical Notes

### Why Vanilla JS

- No build step required
- Immediate browser execution
- Simple deployment (static files)
- Sufficient for current complexity
- Easy to migrate to framework later if needed

### Why ES Modules

- Native browser support (no bundler)
- Clear dependency graph
- Tree-shakeable by browsers
- Standard JavaScript (not proprietary)

### Why jsdom for UI Tests

- Faster than browser-based tests
- No Playwright/Cypress setup overhead
- Sufficient for component-level testing
- Well-integrated with Vitest

### Why JavaScript (not TypeScript) for Frontend

- Browser-native execution without transpilation
- Simpler debugging (source matches runtime)
- No build step for static files
- Backend remains TypeScript; frontend is separate concern
- Easy to migrate to TypeScript later if complexity warrants

### Why Manual Integration Testing

- Page orchestration layer is thin (just wiring)
- E2E setup overhead not justified for single page
- All business logic is unit tested in layers
- Visual verification requires human judgment
- Playwright/Cypress can be added later if needed

---

## Dependencies

### New Dev Dependencies

```json
{
  "jsdom": "^24.0.0"
}
```

### Vitest Config Update

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,js}'],
    environment: 'node', // default
    environmentMatchGlobs: [
      ['test/js/ui/**', 'jsdom'] // jsdom for UI tests
    ]
  }
});
```
