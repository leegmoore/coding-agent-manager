```prompt
# Phase 3: Session Browser UI (Claude Opus 4.5)

## Objective

Create the complete Session Browser UI: EJS template, page controller, API client, formatting utilities, and tests.

This phase builds the frontend that enables users to browse sessions by project and navigate to Clone or Visualize pages. All components should be fully implemented and tested.

## Context for Your Approach

The Session Browser is the new home page (`/`). Users:
1. Select a project from a dropdown
2. See a table of sessions with metadata (first message, dates, size, turns)
3. Click actions to Clone (⚡) or Visualize (📊) a session

The API endpoints from Phase 1-2 provide the data. This phase builds the UI layer.

## Reference Files

Read these to understand existing patterns:
- `views/pages/clone.ejs` - existing page template pattern (check for EJS partials usage)
- `views/pages/session-detail.ejs` - another page template example
- `public/js/pages/` - existing page controller patterns
- `public/js/api/client.js` - existing API client pattern
- `public/js/lib/` - existing utility libraries
- `public/css/styles.css` - Tailwind-based styles

## CSS and Layout Notes

**Styling:** Use Tailwind utility classes directly in the HTML. No custom CSS classes are needed. The template below uses standard Tailwind classes that are already available.

**Toast Styling:** The toast notification uses Tailwind's fixed positioning utilities:
- `fixed bottom-4 right-4` for positioning
- `bg-green-500 text-white px-4 py-2 rounded shadow-lg` for appearance
- Toggle `hidden` class to show/hide

**EJS Partials:** Check if `views/pages/clone.ejs` uses partials like `<%- include('../partials/head') %>`. If so, follow the same pattern in `session-browser.ejs`. If not, use the standalone HTML structure provided below.

**Row Hover:** Use `hover:bg-gray-50` on table rows for hover feedback.

## Deliverables

### 1. EJS Template (`views/pages/session-browser.ejs`)

Create the page structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Browser - Coding Agent Manager</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="bg-gray-100 min-h-screen">
  <div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">Session Browser</h1>
    
    <!-- Project Selector -->
    <div class="mb-6">
      <label for="project-select" class="block text-sm font-medium text-gray-700 mb-2">
        Project
      </label>
      <select id="project-select" class="w-full max-w-xl px-4 py-2 border rounded-lg">
        <option value="">Select a project...</option>
      </select>
    </div>
    
    <!-- Loading Indicator -->
    <div id="loading" class="hidden text-gray-600">
      Loading sessions...
    </div>
    
    <!-- Empty State -->
    <div id="empty-message" class="hidden text-gray-500 py-8 text-center">
      No sessions found.
    </div>
    
    <!-- Error State (distinct from empty) -->
    <div id="error-message" class="hidden text-red-600 bg-red-50 border border-red-200 rounded-lg py-4 px-6 text-center">
      An error occurred.
    </div>
    
    <!-- Sessions Table -->
    <div id="session-table-container" class="hidden">
      <table id="session-table" class="w-full bg-white rounded-lg shadow">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer" data-sort="sessionId">ID</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer" data-sort="firstMessage">First Message</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer" data-sort="createdAt">Created</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer" data-sort="lastModifiedAt">Modified</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer" data-sort="sizeBytes">Size</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer" data-sort="turnCount">Turns</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody id="session-body">
          <!-- Rows inserted by JavaScript -->
        </tbody>
      </table>
    </div>
    
    <!-- Toast for clipboard feedback -->
    <div id="toast" class="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg hidden">
      Copied!
    </div>
  </div>
  
  <script type="module" src="/js/pages/session-browser.js"></script>
</body>
</html>
```

### 2. API Client (`public/js/api/session-browser-client.js`)

**Use the existing `client.js` pattern.** Import `get` and `ApiError` from the shared client module for consistent error handling.

```javascript
import { get, ApiError } from "./client.js";

/**
 * Fetch list of available projects
 * @returns {Promise<{projects: Array<{folder: string, path: string}>}>}
 * @throws {ApiError} On HTTP error or parse failure
 */
export async function fetchProjects() {
  return get("/api/projects");
}

/**
 * Fetch sessions for a specific project
 * @param {string} folder - Encoded folder name
 * @returns {Promise<{folder: string, path: string, sessions: Array}>}
 * @throws {ApiError} On HTTP error or parse failure
 */
export async function fetchSessions(folder) {
  const url = `/api/projects/${encodeURIComponent(folder)}/sessions`;
  return get(url);
}
```

### 3. Formatting Utilities (`public/js/lib/format.js`)

**Create this new file.** This file does not exist yet - do not modify existing lib files.

Create `public/js/lib/format.js` with these utilities:

```javascript
/**
 * Format a date as relative time (e.g., "2 hours ago", "Dec 8")
 * @param {Date} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format bytes as human-readable size (e.g., "1.2 MB", "340 KB")
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
```

### 4. Page Controller (`public/js/pages/session-browser.js`)

Create the page controller with full functionality:

```javascript
import { fetchProjects, fetchSessions } from "../api/session-browser-client.js";
import { formatRelativeTime, formatFileSize, escapeHtml } from "../lib/format.js";

class SessionBrowserController {
  constructor() {
    this.projectSelect = document.getElementById("project-select");
    this.sessionTableContainer = document.getElementById("session-table-container");
    this.sessionBody = document.getElementById("session-body");
    this.loadingIndicator = document.getElementById("loading");
    this.emptyMessage = document.getElementById("empty-message");
    this.errorMessage = document.getElementById("error-message");
    this.toast = document.getElementById("toast");
    
    this.currentSort = { field: "lastModifiedAt", order: "desc" };
    this.sessions = [];
    
    this.init();
  }

  async init() {
    await this.loadProjects();
    this.setupEventListeners();
  }

  async loadProjects() {
    try {
      const { projects } = await fetchProjects();
      this.renderProjectDropdown(projects);
    } catch (error) {
      this.showError("Failed to load projects: " + error.message);
    }
  }

  renderProjectDropdown(projects) {
    const options = projects.map(p => 
      `<option value="${escapeHtml(p.folder)}">${escapeHtml(p.path)}</option>`
    );
    this.projectSelect.innerHTML = `<option value="">Select a project...</option>${options.join("")}`;
  }

  async loadSessions(folder) {
    this.showLoading(true);
    this.hideTable();
    this.hideEmpty();
    this.hideError();
    
    try {
      const { sessions } = await fetchSessions(folder);
      this.sessions = sessions;
      this.sortAndRender();
    } catch (error) {
      this.showError("Failed to load sessions: " + error.message);
    } finally {
      this.showLoading(false);
    }
  }

  sortAndRender() {
    const { field, order } = this.currentSort;
    const sorted = [...this.sessions].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      if (field === "createdAt" || field === "lastModifiedAt") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (typeof aVal === "string") {
        return order === "asc" 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });
    
    this.renderSessionTable(sorted);
    this.updateSortIndicators();
  }

  renderSessionTable(sessions) {
    if (sessions.length === 0) {
      this.hideTable();
      this.showEmpty("No sessions found in this project.");
      return;
    }

    this.hideEmpty();
    this.showTable();
    
    this.sessionBody.innerHTML = sessions.map(s => `
      <tr class="hover:bg-gray-50 border-b cursor-pointer" data-session-id="${escapeHtml(s.sessionId)}">
        <td class="px-4 py-3">
          <span class="session-id text-blue-600 hover:underline font-mono text-sm" 
                title="Click to copy: ${escapeHtml(s.sessionId)}">${escapeHtml(s.sessionId.slice(0, 8))}...</span>
        </td>
        <td class="px-4 py-3 max-w-md truncate" title="${escapeHtml(s.firstMessage)}">
          ${escapeHtml(s.firstMessage)}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
          ${formatRelativeTime(new Date(s.createdAt))}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
          ${formatRelativeTime(new Date(s.lastModifiedAt))}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
          ${formatFileSize(s.sizeBytes)}
        </td>
        <td class="px-4 py-3 text-sm text-gray-600">
          ${s.turnCount}
        </td>
        <td class="px-4 py-3 whitespace-nowrap">
          <button class="clone-btn px-2 py-1 text-sm bg-blue-100 hover:bg-blue-200 rounded mr-1"
                  title="Clone session">⚡</button>
          <button class="visualize-btn px-2 py-1 text-sm bg-purple-100 hover:bg-purple-200 rounded"
                  title="Visualize session">📊</button>
        </td>
      </tr>
    `).join("");
  }

  setupEventListeners() {
    // Project selection
    this.projectSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        this.loadSessions(e.target.value);
      } else {
        this.hideTable();
        this.hideEmpty();
      }
    });

    // Column header sorting
    document.querySelectorAll("[data-sort]").forEach(header => {
      header.addEventListener("click", () => {
        const field = header.dataset.sort;
        if (this.currentSort.field === field) {
          this.currentSort.order = this.currentSort.order === "asc" ? "desc" : "asc";
        } else {
          this.currentSort.field = field;
          this.currentSort.order = field === "lastModifiedAt" || field === "createdAt" ? "desc" : "asc";
        }
        this.sortAndRender();
      });
    });

    // Table row actions (event delegation)
    this.sessionBody.addEventListener("click", (e) => {
      const row = e.target.closest("tr");
      if (!row) return;
      
      const sessionId = row.dataset.sessionId;
      
      if (e.target.classList.contains("session-id")) {
        e.stopPropagation();
        this.copySessionId(sessionId);
      } else if (e.target.classList.contains("clone-btn")) {
        e.stopPropagation();
        window.location.href = `/session-clone?sessionId=${sessionId}`;
      } else if (e.target.classList.contains("visualize-btn")) {
        e.stopPropagation();
        window.location.href = `/session-detail?id=${sessionId}`;
      } else if (!e.target.closest("button")) {
        // Row click (not on button) goes to visualize
        window.location.href = `/session-detail?id=${sessionId}`;
      }
    });
  }

  async copySessionId(sessionId) {
    try {
      await navigator.clipboard.writeText(sessionId);
      this.showToast("Session ID copied!");
    } catch {
      this.showToast("Failed to copy");
    }
  }

  updateSortIndicators() {
    document.querySelectorAll("[data-sort]").forEach(header => {
      const indicator = header.querySelector(".sort-indicator") || document.createElement("span");
      indicator.className = "sort-indicator ml-1";
      
      if (header.dataset.sort === this.currentSort.field) {
        indicator.textContent = this.currentSort.order === "asc" ? "↑" : "↓";
        if (!header.querySelector(".sort-indicator")) {
          header.appendChild(indicator);
        }
      } else {
        indicator.remove();
      }
    });
  }

  showLoading(show) {
    this.loadingIndicator.classList.toggle("hidden", !show);
  }

  showTable() {
    this.sessionTableContainer.classList.remove("hidden");
  }

  hideTable() {
    this.sessionTableContainer.classList.add("hidden");
  }

  showEmpty(message) {
    this.emptyMessage.textContent = message;
    this.emptyMessage.classList.remove("hidden");
  }

  hideEmpty() {
    this.emptyMessage.classList.add("hidden");
  }

  showError(message) {
    this.hideEmpty();
    this.errorMessage.textContent = message;
    this.errorMessage.classList.remove("hidden");
  }

  hideError() {
    this.errorMessage.classList.add("hidden");
  }

  showToast(message) {
    this.toast.textContent = message;
    this.toast.classList.remove("hidden");
    setTimeout(() => {
      this.toast.classList.add("hidden");
    }, 2000);
  }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  new SessionBrowserController();
});
```

### 5. Tests (`test/js/lib/format.test.js`)

**Note:** Frontend tests use plain JavaScript (`.js`), not TypeScript. Follow the pattern in existing tests like `test/js/lib/transforms.test.js`.

**Environment:** Add `// @vitest-environment jsdom` at the top of the test file to enable DOM APIs.

Create `test/js/lib/format.test.js`:

```javascript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { formatRelativeTime, formatFileSize, escapeHtml } from "../../../public/js/lib/format.js";

describe("formatRelativeTime", () => {
  it("returns 'just now' for times < 60 seconds ago", () => {
    const date = new Date(Date.now() - 30 * 1000); // 30 seconds ago
    expect(formatRelativeTime(date)).toBe("just now");
  });

  it("returns minutes for times < 60 minutes ago", () => {
    const date = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    expect(formatRelativeTime(date)).toBe("15m ago");
  });

  it("returns hours for times < 24 hours ago", () => {
    const date = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
    expect(formatRelativeTime(date)).toBe("5h ago");
  });

  it("returns days for times < 7 days ago", () => {
    const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    expect(formatRelativeTime(date)).toBe("3d ago");
  });

  it("returns month/day format for older dates", () => {
    const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const result = formatRelativeTime(date);
    // Should be like "Nov 10" or "Dec 8"
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it("returns '1m ago' at exactly 60 seconds", () => {
    const date = new Date(Date.now() - 60 * 1000); // exactly 60 seconds
    expect(formatRelativeTime(date)).toBe("1m ago");
  });

  it("returns '1h ago' at exactly 60 minutes", () => {
    const date = new Date(Date.now() - 60 * 60 * 1000); // exactly 60 minutes
    expect(formatRelativeTime(date)).toBe("1h ago");
  });
});

describe("formatFileSize", () => {
  it("formats bytes correctly", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes correctly", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes correctly", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });

  it("handles zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});

describe("escapeHtml", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  // Note: textContent/innerHTML technique does NOT escape quotes
  // This is safe because we use textContent (which never interprets HTML)
  // Quotes only need escaping in attribute contexts
  it("preserves quotes (not escaped by textContent/innerHTML)", () => {
    expect(escapeHtml('"test"')).toBe('"test"');
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
```

## Verification

After completing this phase:

```bash
npm run typecheck  # Must pass
npm test           # All tests pass including new frontend tests
npm run dev        # Start server, visit http://localhost:3000
```

Manual verification:
1. Home page (`/`) shows Session Browser
2. Dropdown populates with projects
3. Selecting project loads sessions table
4. Clicking column headers sorts the table
5. Clone button navigates to `/session-clone?sessionId=...`
6. Visualize button navigates to `/session-detail?id=...`
7. Clicking session ID copies to clipboard with toast

## Done When

- Session Browser page renders at `/`
- Clone page accessible at `/session-clone`
- Project dropdown populates from API
- Session table displays with all columns
- Sorting works on all sortable columns
- Clone/Visualize buttons navigate correctly
- Session ID click copies to clipboard
- Loading and empty states display correctly
- All frontend tests pass

| Component | Expected Result |
|-----------|-----------------|
| EJS template | Renders correctly |
| API client | Fetches and parses responses |
| Format utilities | All tests pass |
| Page controller | Handles all interactions |
| Navigation | Clone → /session-clone, Visualize → /session-detail |

Implement the complete phase. Deliver working code with proper HTML, CSS, and JavaScript, not a plan.
```
