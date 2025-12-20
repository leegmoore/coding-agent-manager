import { fetchProjects, fetchSessions } from "../api/session-browser-client.js";
import { formatRelativeTime, formatFileSize, escapeHtml } from "../lib/format.js";

function getSourceBadge(source) {
  if (source === "copilot") {
    return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Copilot</span>';
  }
  return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Claude</span>';
}

class SessionBrowserController {
  constructor() {
    this.projectSelect = document.getElementById("project-select");
    this.sessionTableContainer = document.getElementById("session-table-container");
    this.sessionBody = document.getElementById("session-body");
    this.loadingIndicator = document.getElementById("loading");
    this.emptyMessage = document.getElementById("empty-message");
    this.errorMessage = document.getElementById("error-message");
    this.retryBtn = document.getElementById("retry-btn");
    this.toast = document.getElementById("toast");
    this.sourceToggle = document.getElementById("source-toggle");

    this.currentSort = { field: "lastModifiedAt", order: "desc" };
    this.sessions = [];
    this.lastSelectedFolder = null;
    this.currentSource = "claude";

    this.init();
  }

  async init() {
    this.initSourceToggle();
    await this.loadProjects();
    this.setupEventListeners();
  }

  initSourceToggle() {
    if (!this.sourceToggle) return;

    this.sourceToggle.addEventListener("click", async (e) => {
      const button = e.target.closest(".source-btn");
      if (!button || button.disabled) return;

      const newSource = button.dataset.source;
      if (newSource === this.currentSource) return;

      this.currentSource = newSource;
      this.updateSourceToggleUI();
      this.clearProjectDropdown();
      this.clearSessionTable();
      await this.loadProjects();
    });
  }

  updateSourceToggleUI() {
    const buttons = document.querySelectorAll(".source-btn");
    buttons.forEach(btn => {
      if (btn.dataset.source === this.currentSource) {
        btn.classList.remove("bg-gray-200", "text-gray-700", "hover:bg-gray-300");
        btn.classList.add("bg-blue-600", "text-white");
      } else {
        btn.classList.remove("bg-blue-600", "text-white");
        btn.classList.add("bg-gray-200", "text-gray-700", "hover:bg-gray-300");
      }
    });
  }

  clearProjectDropdown() {
    if (this.projectSelect) {
      this.projectSelect.innerHTML = '<option value="">Select a project...</option>';
    }
  }

  clearSessionTable() {
    this.hideTable();
    this.hideEmpty();
    this.hideError();
    this.sessions = [];
    if (this.sessionBody) {
      this.sessionBody.innerHTML = "";
    }
  }

  async loadProjects() {
    this.projectSelect.disabled = true;
    this.projectSelect.innerHTML = `<option value="">Loading projects...</option>`;

    try {
      const { projects } = await fetchProjects(this.currentSource);
      this.renderProjectDropdown(projects);
    } catch (error) {
      this.projectSelect.innerHTML = `<option value="">Failed to load projects</option>`;
      this.showError(`Failed to load ${this.currentSource} projects: ${error.message}`);
    } finally {
      this.projectSelect.disabled = false;
    }
  }

  renderProjectDropdown(projects) {
    const options = projects.map(p =>
      `<option value="${escapeHtml(p.folder)}">${escapeHtml(p.path)}</option>`
    );
    this.projectSelect.innerHTML = `<option value="">Select a project...</option>${options.join("")}`;
  }

  async loadSessions(folder) {
    this.lastSelectedFolder = folder;
    this.showLoading(true);
    this.hideTable();
    this.hideEmpty();
    this.hideError();
    this.projectSelect.disabled = true;

    try {
      const { sessions } = await fetchSessions(this.currentSource, folder);
      sessions.forEach(s => s.source = this.currentSource);
      this.sessions = sessions;
      this.sortAndRender();
    } catch (error) {
      this.showError("Failed to load sessions: " + error.message);
    } finally {
      this.showLoading(false);
      this.projectSelect.disabled = false;
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
        return order === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
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
      <tr class="hover:bg-gray-50 border-b cursor-pointer" data-session-id="${escapeHtml(s.sessionId)}" data-source="${escapeHtml(s.source)}">
        <td class="px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="session-id text-blue-600 hover:underline font-mono text-sm"
                  title="Click to copy: ${escapeHtml(s.sessionId)}">${escapeHtml(s.sessionId.slice(0, 8))}...</span>
            ${getSourceBadge(s.source)}
          </div>
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
                  title="Clone session">Clone</button>
          <button class="visualize-btn px-2 py-1 text-sm bg-purple-100 hover:bg-purple-200 rounded"
                  title="Visualize session">Details</button>
        </td>
      </tr>
    `).join("");
  }

  setupEventListeners() {
    this.projectSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        this.loadSessions(e.target.value);
      } else {
        this.hideTable();
        this.hideEmpty();
      }
    });

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

    if (this.retryBtn) {
      this.retryBtn.addEventListener("click", () => {
        if (this.lastSelectedFolder) {
          this.loadSessions(this.lastSelectedFolder);
        }
      });
    }

    this.sessionBody.addEventListener("click", (e) => {
      const row = e.target.closest("tr");
      if (!row) return;

      const sessionId = row.dataset.sessionId;
      const source = row.dataset.source || this.currentSource;

      if (e.target.classList.contains("session-id")) {
        e.stopPropagation();
        this.copySessionId(sessionId);
      } else if (e.target.classList.contains("clone-btn")) {
        e.stopPropagation();
        window.location.href = this.getCloneUrl(sessionId, source);
      } else if (e.target.classList.contains("visualize-btn")) {
        e.stopPropagation();
        window.location.href = this.getDetailsUrl(sessionId, source);
      } else if (!e.target.closest("button")) {
        window.location.href = this.getDetailsUrl(sessionId, source);
      }
    });
  }

  getCurrentFolder() {
    return this.projectSelect ? this.projectSelect.value : "";
  }

  getDetailsUrl(sessionId, source) {
    if (source === "copilot") {
      const folder = this.getCurrentFolder();
      return `/session-detail?sessionId=${encodeURIComponent(sessionId)}&source=copilot&workspace=${encodeURIComponent(folder)}`;
    }
    return `/session-detail?sessionId=${encodeURIComponent(sessionId)}&source=claude`;
  }

  getCloneUrl(sessionId, source) {
    if (source === "copilot") {
      const folder = this.getCurrentFolder();
      return `/session-clone?sessionId=${encodeURIComponent(sessionId)}&source=copilot&workspace=${encodeURIComponent(folder)}`;
    }
    return `/session-clone?sessionId=${encodeURIComponent(sessionId)}&source=claude`;
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
        indicator.textContent = this.currentSort.order === "asc" ? "^" : "v";
        header.setAttribute("aria-sort", this.currentSort.order === "asc" ? "ascending" : "descending");
        if (!header.querySelector(".sort-indicator")) {
          header.appendChild(indicator);
        }
      } else {
        header.removeAttribute("aria-sort");
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

document.addEventListener("DOMContentLoaded", () => {
  new SessionBrowserController();
});
