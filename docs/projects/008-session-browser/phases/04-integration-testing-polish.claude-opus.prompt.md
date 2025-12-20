```prompt
# Phase 4: Integration Testing + Polish (Claude Opus 4.5)

## Objective

Complete the Session Browser feature with integration tests, route migration, and UI polish. Ensure all components work together seamlessly and the feature is production-ready.

## Context for Your Approach

This is the final phase. The API (Phases 1-2) and UI (Phase 3) are implemented. Now:
1. Verify the complete flow works end-to-end
2. Complete the route migration (clone page to `/session-clone`)
3. Add integration tests
4. Polish the UI and handle edge cases
5. Update navigation across the app

## Reference Files

Review current state:
- `src/routes/session-browser.ts` - current router
- `src/server.ts` - server configuration
- `views/pages/session-browser.ejs` - browser template
- `views/pages/clone.ejs` - clone template (needs route update)
- `public/js/pages/session-browser.js` - browser controller

## Deliverables

### 1. Complete Route Migration in Server

Update `src/server.ts` to properly route. **Specifically:**

1. **Read `src/server.ts`** to find the current home route (likely `app.get("/", (req, res) => res.render("pages/clone"))` or similar)

2. **Remove or comment out** the existing home route that renders the clone page

3. **Add the session browser router** before other routes:

```typescript
import sessionBrowserRouter from "./routes/session-browser.js";
// ... other imports

// Session Browser handles / (home), /session-clone, and /api/projects routes
app.use("/", sessionBrowserRouter);

// Other existing routes remain unchanged
```

4. **Verify** the session-browser router includes these routes:
   - `GET /` - renders `pages/session-browser`
   - `GET /session-clone` - renders `pages/clone`
   - `GET /api/projects` - returns project list
   - `GET /api/projects/:folder/sessions` - returns sessions

The old clone page route is now served by the session-browser router at `/session-clone`.

### 2. Update Clone Page for New Route

Update `views/pages/clone.ejs`:

1. **Read the file** to understand its current structure
2. **Find the page header** (likely an `<h1>` or header section)
3. **Add a back link** above or near the header:

```html
<!-- Add this near the top of the main content area, before the h1 -->
<div class="mb-4">
  <a href="/" class="text-blue-600 hover:underline text-sm">← Back to Session Browser</a>
</div>
```

4. **Check form actions** - if the form posts to `/` or uses relative URLs, update them appropriately
5. **Check any JavaScript** that might redirect to `/` after cloning - these should stay as-is since `/` now shows the browser (which is the desired destination)

6. **Pre-fill sessionId from URL query parameter** - The Session Browser navigates to `/session-clone?sessionId=...`. Update `public/js/pages/clone.js` to read and pre-fill this value:

```javascript
// Add near the top of the DOMContentLoaded handler, after DOM queries
const urlParams = new URLSearchParams(window.location.search);
const prefilledSessionId = urlParams.get("sessionId");
if (prefilledSessionId && sessionIdInput) {
  sessionIdInput.value = prefilledSessionId;
}
```

This ensures users clicking "Clone" from the Session Browser have the session ID automatically filled in.

### 3. Update Session Detail Page

Update `views/pages/session-detail.ejs`:

1. **Read the file** to understand its current structure
2. **Add a back link** similar to clone page:

```html
<!-- Add this near the top of the main content area -->
<div class="mb-4">
  <a href="/" class="text-blue-600 hover:underline text-sm">← Back to Session Browser</a>
</div>
```

3. **Optionally add** a "Clone this session" link if useful:

```html
<a href="/session-clone?sessionId=<%= sessionId %>" class="text-blue-600 hover:underline">Clone this session</a>
```

### 4. Integration Tests (`test/session-browser-integration.test.ts`)

Test the complete flow:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/server.js";
import path from "path";

describe("Session Browser Integration", () => {
  beforeAll(() => {
    process.env.CLAUDE_DIR = path.join(process.cwd(), "test/fixtures/session-browser");
  });

  afterAll(() => {
    delete process.env.CLAUDE_DIR;
  });

  describe("GET /", () => {
    it("renders session browser page", async () => {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Session Browser");
      expect(res.text).toContain("project-select");
    });
  });

  describe("GET /session-clone", () => {
    it("renders clone page", async () => {
      const res = await request(app).get("/session-clone");
      expect(res.status).toBe(200);
      expect(res.text).toContain("Clone"); // or whatever the clone page title is
    });

    it("accepts sessionId query param", async () => {
      const res = await request(app).get("/session-clone?sessionId=test-123");
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/projects", () => {
    it("returns list of projects", async () => {
      const res = await request(app).get("/api/projects");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("projects");
      expect(Array.isArray(res.body.projects)).toBe(true);
    });

    it("projects have folder and path properties", async () => {
      const res = await request(app).get("/api/projects");
      expect(res.status).toBe(200);
      
      if (res.body.projects.length > 0) {
        const project = res.body.projects[0];
        expect(project).toHaveProperty("folder");
        expect(project).toHaveProperty("path");
      }
    });
  });

  describe("GET /api/projects/:folder/sessions", () => {
    it("returns sessions for valid project", async () => {
      const projectsRes = await request(app).get("/api/projects");
      if (projectsRes.body.projects.length === 0) {
        return; // Skip if no projects in fixtures
      }
      
      const folder = projectsRes.body.projects[0].folder;
      const res = await request(app).get(`/api/projects/${encodeURIComponent(folder)}/sessions`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sessions");
      expect(Array.isArray(res.body.sessions)).toBe(true);
    });

    it("sessions have required properties", async () => {
      const projectsRes = await request(app).get("/api/projects");
      if (projectsRes.body.projects.length === 0) return;
      
      const folder = projectsRes.body.projects[0].folder;
      const res = await request(app).get(`/api/projects/${encodeURIComponent(folder)}/sessions`);
      
      if (res.body.sessions.length > 0) {
        const session = res.body.sessions[0];
        expect(session).toHaveProperty("sessionId");
        expect(session).toHaveProperty("source");
        expect(session).toHaveProperty("firstMessage");
        expect(session).toHaveProperty("createdAt");
        expect(session).toHaveProperty("lastModifiedAt");
        expect(session).toHaveProperty("sizeBytes");
        expect(session).toHaveProperty("turnCount");
      }
    });

    it("returns 404 for non-existent folder", async () => {
      const res = await request(app).get("/api/projects/nonexistent-folder/sessions");
      expect(res.status).toBe(404);
    });

    it("sessions are sorted by lastModifiedAt descending", async () => {
      const projectsRes = await request(app).get("/api/projects");
      if (projectsRes.body.projects.length === 0) return;
      
      const folder = projectsRes.body.projects[0].folder;
      const res = await request(app).get(`/api/projects/${encodeURIComponent(folder)}/sessions`);
      
      const sessions = res.body.sessions;
      for (let i = 1; i < sessions.length; i++) {
        const prev = new Date(sessions[i - 1].lastModifiedAt).getTime();
        const curr = new Date(sessions[i].lastModifiedAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  describe("Navigation Flow", () => {
    it("complete flow: browse → select project → view sessions", async () => {
      // 1. Load browser page
      const browserRes = await request(app).get("/");
      expect(browserRes.status).toBe(200);
      
      // 2. Get projects
      const projectsRes = await request(app).get("/api/projects");
      expect(projectsRes.status).toBe(200);
      
      if (projectsRes.body.projects.length === 0) return;
      
      // 3. Get sessions for first project
      const folder = projectsRes.body.projects[0].folder;
      const sessionsRes = await request(app).get(`/api/projects/${encodeURIComponent(folder)}/sessions`);
      expect(sessionsRes.status).toBe(200);
    });
  });
});
```

### 5. UI Polish

Add these enhancements to the Session Browser:

#### Loading States
- Disable project dropdown while loading sessions
- Show spinner or skeleton while loading

#### Error Handling
- Display user-friendly error messages
- Retry button for failed requests

#### Accessibility
- Proper ARIA labels on interactive elements
- Keyboard navigation support for table
- Focus management after actions

#### Visual Polish
```css
/* Add to styles or inline in EJS */
.session-row:hover {
  background-color: #f9fafb;
}

.sort-indicator {
  opacity: 0.7;
}

th[data-sort]:hover {
  background-color: #e5e7eb;
}

.toast {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

### 6. Navigation Updates

Ensure consistent navigation across pages:

| Page | Back Link | Other Links |
|------|-----------|-------------|
| Session Browser (`/`) | N/A | Clone, Visualize per row |
| Clone (`/session-clone`) | ← Back to Browser | Visualize after clone? |
| Session Detail (`/session-detail`) | ← Back to Browser | Clone this session? |

### 7. Final Fixture Verification

Ensure test fixtures are complete:

```
test/fixtures/session-browser/
└── projects/
    ├── -Users-test-project-alpha/
    │   ├── 11111111-1111-1111-1111-111111111111.jsonl  # 3 turns
    │   └── 22222222-2222-2222-2222-222222222222.jsonl  # 5 turns
    └── -Users-test-project-beta/
        └── 33333333-3333-3333-3333-333333333333.jsonl  # 2 turns
```

Each JSONL should have:
- Distinctive first user message
- Multiple turns
- Varying file sizes

## Verification

After completing this phase:

```bash
npm run typecheck  # Must pass
npm test           # All tests pass including integration
npm run dev        # Start server
```

Manual verification checklist:
- [ ] Home page (`/`) shows Session Browser
- [ ] Project dropdown loads and populates
- [ ] Selecting project shows sessions
- [ ] Table sorts by clicking headers
- [ ] Clone button → `/session-clone?sessionId=...`
- [ ] Visualize button → `/session-detail?id=...`
- [ ] Row click → `/session-detail?id=...`
- [ ] Session ID click → copies to clipboard
- [ ] Toast appears and fades
- [ ] Clone page loads at `/session-clone`
- [ ] Clone page has back link to browser
- [ ] Session detail has back link to browser
- [ ] Loading states appear appropriately
- [ ] Empty project shows message
- [ ] Error states display correctly

## Done When

- All integration tests pass
- All unit tests pass
- Route migration complete (`/` = browser, `/session-clone` = clone)
- Navigation between pages works correctly
- UI is polished with loading/error states
- Accessibility basics in place
- Manual verification checklist complete

| Verification | Status |
|--------------|--------|
| Integration tests | PASS |
| Unit tests | PASS |
| Route `/` | Session Browser |
| Route `/session-clone` | Clone page |
| Route `/session-detail` | Detail page |
| Navigation flow | Complete |
| Loading states | Working |
| Error handling | Working |
| Clipboard copy | Working |

Feature complete! The Session Browser is ready for use.
```
