import { get } from "../api/client.js";
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
} from "../lib/session-detail.js";
import {
  showLoading as showShimmer,
  hideLoading as hideShimmer,
  setSubmitDisabled,
} from "../ui/loading.js";

// State
let sessionData = null;
let currentTurn = 0;
let currentScale = 200;

// DOM elements
let sessionInput,
  loadButton,
  errorMessage,
  loadingIndicator,
  visualizationSection,
  leftButton,
  turnInput,
  rightButton,
  turnSlider,
  turnLabel,
  scaleInput,
  scaleWarning,
  visualizationContainer,
  tokenStats,
  detailCard,
  turnRail;
let isLoading = false;

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", init);

function init() {
  // Get DOM elements
  sessionInput = document.getElementById("sessionInput");
  loadButton = document.getElementById("loadButton");
  errorMessage = document.getElementById("errorMessage");
  loadingIndicator = document.getElementById("loadingIndicator");
  visualizationSection = document.getElementById("visualizationSection");
  leftButton = document.getElementById("leftButton");
  turnInput = document.getElementById("turnInput");
  rightButton = document.getElementById("rightButton");
  turnSlider = document.getElementById("turnSlider");
  turnLabel = document.getElementById("turnLabel");
  scaleInput = document.getElementById("scaleInput");
  scaleWarning = document.getElementById("scaleWarning");
  visualizationContainer = document.getElementById("visualizationContainer");
  tokenStats = document.getElementById("tokenStats");
  detailCard = document.getElementById("detailCard");
  turnRail = document.getElementById("turnRail");

  // Attach event listeners
  loadButton.addEventListener("click", handleLoad);
  leftButton.addEventListener("click", handleLeftClick);
  rightButton.addEventListener("click", handleRightClick);
  turnInput.addEventListener("change", handleTurnInputChange);
  turnSlider.addEventListener("input", handleSliderChange);
  scaleInput.addEventListener("change", handleScaleInputChange);

  // Check for ?id= query parameter (AC-1b)
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get("id");
  if (sessionIdFromUrl) {
    sessionInput.value = sessionIdFromUrl;
    handleLoad();
  }
}

// Stub handlers - to be implemented in Phase 4

async function handleLoad() {
  const sessionId = sessionInput.value.trim();
  if (!sessionId) {
    showError("Please enter a session ID");
    return;
  }

  hideError();
  setLoading(true);

  try {
    sessionData = await get(`/api/session/${sessionId}/turns`);
    setLoading(false);
    currentTurn = Math.max(0, sessionData.totalTurns - 1);

    // Setup navigation bounds (1-based display)
    const maxTurnDisplay = Math.max(1, sessionData.totalTurns);
    turnSlider.max = maxTurnDisplay;
    turnInput.max = maxTurnDisplay;

    // Show visualization section
    visualizationSection.classList.remove("hidden");

    // Render initial state
    syncNavigation();
    checkScaleWarning();
    renderVisualization();
    renderDetailCard();
    renderTurnRail();
  } catch (error) {
    setLoading(false);
    clearVisualization();
    showError(error?.message || "Failed to load session");
  }
}

function handleLeftClick() {
  if (!sessionData) return;
  if (currentTurn > 0) {
    currentTurn--;
    syncNavigation();
    checkScaleWarning();
    renderVisualization();
    renderDetailCard();
    renderTurnRail();
  }
}

function handleRightClick() {
  if (!sessionData) return;
  if (currentTurn < sessionData.totalTurns - 1) {
    currentTurn++;
    syncNavigation();
    checkScaleWarning();
    renderVisualization();
    renderDetailCard();
    renderTurnRail();
  }
}

function handleTurnInputChange() {
  if (!sessionData) return;
  currentTurn = validateTurnInputOneBased(turnInput.value, sessionData.totalTurns) - 1;
  syncNavigation();
  checkScaleWarning();
  renderVisualization();
  renderDetailCard();
  renderTurnRail();
}

function handleSliderChange() {
  if (!sessionData) return;
  currentTurn = clampTurnDisplay(parseInt(turnSlider.value, 10), sessionData.totalTurns) - 1;
  syncNavigation();
  checkScaleWarning();
  renderVisualization();
  renderDetailCard();
  renderTurnRail();
}

function handleScaleInputChange() {
  currentScale = validateScaleInput(scaleInput.value);
  scaleInput.value = currentScale;
  checkScaleWarning();
  renderVisualization();
}

function syncNavigation() {
  const turnDisplay = currentTurn + 1;
  const total = sessionData?.totalTurns ?? 0;
  turnInput.value = Math.min(Math.max(turnDisplay, 1), Math.max(1, total));
  turnSlider.value = Math.min(Math.max(turnDisplay, 1), Math.max(1, total));
  turnLabel.textContent = `Turn ${turnDisplay} of ${total}`;

  leftButton.disabled = currentTurn === 0;
  rightButton.disabled = sessionData ? currentTurn === sessionData.totalTurns - 1 : true;
}

function renderVisualization() {
  if (!sessionData) return;
  const turns = sessionData.turns.slice(0, currentTurn + 1);
  if (!turns.length) return;

  const lastTurn = turns[turns.length - 1];
  const maxTokens = currentScale * 1000;

  visualizationContainer.innerHTML = "";

  const rect = visualizationContainer.getBoundingClientRect();
  const width = Math.max(rect.width || DEFAULT_WIDTH, 320);
  const height = 420;
  const margin = { top: 12, right: 12, bottom: 26, left: 12 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const data = turns.map((turn, idx) => {
    const turnIndex = Number.isFinite(turn.turnIndex) ? turn.turnIndex : idx;
    return {
      turn: turnIndex,
      user: turn.cumulative.user,
      assistant: turn.cumulative.assistant,
      thinking: turn.cumulative.thinking,
      tool: turn.cumulative.tool,
    };
  });

  const xMax =
    data.length > 0 ? Math.max(data[data.length - 1].turn, 1) : Math.max(currentTurn, 1);

  const stack = d3.stack().keys(["user", "assistant", "thinking", "tool"]);
  const series = stack(data);

  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, innerWidth]);
  const yScale = d3.scaleLinear().domain([0, maxTokens]).range([innerHeight, 0]);

  const area = d3
    .area()
    .curve(d3.curveMonotoneX)
    .x((d) => xScale(d.data.turn))
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]));

  const svg = d3
    .select(visualizationContainer)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  series.forEach((layer) => {
    g.append("path")
      .datum(layer)
      .attr("fill", COLORS[layer.key])
      .attr("d", area);
  });

  tokenStats.textContent = `Total: ${formatTokenCount(lastTurn.cumulative.total)} tokens (scale: ${formatTokenCount(
    maxTokens
  )})`;
}

function renderDetailCard() {
  if (!sessionData) return;
  const turn = sessionData.turns[currentTurn];
  const { userPrompt, assistantResponse, toolBlocks, toolResults, thinking } = turn.content;

  const toolLines = [];
  if (toolBlocks && toolBlocks.length) {
    toolBlocks.forEach((t) => toolLines.push(`**Tool ${t.name}**\n${truncateToolContent(t.content, 6)}`));
  }
  if (toolResults && toolResults.length) {
    toolResults.forEach((t) =>
      toolLines.push(`**Tool result ${t.name}**\n${truncateToolContent(t.content, 6)}`)
    );
  }
  if (thinking) {
    toolLines.push(`**Thinking**\n${truncateToolContent(thinking, 6)}`);
  }
  const toolText = toolLines.length ? toolLines.join("\n\n") : "";

  const md = `
### User
${userPrompt || "_(no prompt)_"}

### Assistant
${assistantResponse || "_(no response)_"}

${toolText ? "### Tools\n" + toolText : ""}
`.trim();

  detailCard.innerHTML = renderMarkdownSafe(md);
}

function renderTurnRail() {
  if (!sessionData || !turnRail) return;
  const turns = sessionData.turns;
  turnRail.innerHTML = "";

  const frag = document.createDocumentFragment();

  for (let i = currentTurn; i >= 0; i--) {
    const turn = turns[i];
    if (!turn) continue;
    const card = document.createElement("div");
    card.className = "mb-3 last:mb-0 p-2 rounded border border-gray-200 bg-gray-50 shadow-sm";

    const header = document.createElement("div");
    header.className = "text-xs text-gray-600 mb-1";
    header.textContent = `Turn ${i + 1}`;
    card.appendChild(header);

    const content = turn.content || {};
    const segments = [];

    if (content.assistantResponse) {
    segments.push({ type: "assistant", text: content.assistantResponse });
    }

    if (content.toolBlocks && Array.isArray(content.toolBlocks)) {
      content.toolBlocks.forEach((t, idx) => {
        const label = t?.name || `Tool ${idx + 1}`;
        const text = t?.content || "";
        segments.push({ type: "tool", text: `${label}: ${text}` });
      });
    }

  if (content.toolResults && Array.isArray(content.toolResults)) {
    content.toolResults.forEach((t, idx) => {
      const label = t?.name || `Tool result ${idx + 1}`;
      const text = t?.content || "";
      segments.push({ type: "tool", text: `Result ${label}: ${text}` });
    });
  }

    if (content.thinking) {
      segments.push({ type: "thinking", text: content.thinking });
    }

    if (content.userPrompt) {
      segments.push({ type: "user", text: content.userPrompt });
    }

    if (!segments.length) {
      segments.push({ type: "user", text: "(no content)" });
    }

    segments.forEach((segment) => {
      const tokens = estimateTokensFromText(segment.text);
      const item = document.createElement("div");
      item.className = "rounded px-2 py-1 text-sm mb-2 last:mb-0 truncate border";
      const baseColor = COLORS[segment.type] || "#9ca3af";
      item.style.backgroundColor = withAlpha(baseColor, 0.18);
      item.style.borderColor = withAlpha(baseColor, 0.35);
      const roleCode = segmentCode(segment.type);
      item.title = `${roleCode}: ${truncateLine(segment.text, 160)} · ~${tokens} tokens`;
      item.textContent = `${roleCode}:${tokens}t - ${truncateLine(segment.text, 36)}`;
      card.appendChild(item);
    });

    frag.appendChild(card);
  }

  turnRail.appendChild(frag);
}

function checkScaleWarning() {
  if (!sessionData) return;
  const turn = sessionData.turns[currentTurn];
  if (exceedsScale(turn.cumulative, currentScale)) {
    currentScale = Math.ceil(turn.cumulative.total / 1000);
    scaleInput.value = currentScale;
    scaleWarning.classList.remove("hidden");
  } else {
    scaleWarning.classList.add("hidden");
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

function hideError() {
  errorMessage.classList.add("hidden");
}

function setLoading(loading) {
  isLoading = loading;
  setSubmitDisabled(loadButton, loading);
  if (loading) {
    showShimmer(loadingIndicator, "Loading session...");
  } else {
    hideShimmer(loadingIndicator);
  }
}

function clearVisualization() {
  visualizationContainer.innerHTML = "";
  tokenStats.textContent = "";
  detailCard.innerHTML = "";
  if (turnRail) {
    turnRail.innerHTML = "";
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdownSafe(text) {
  const escaped = escapeHtml(text);
  const withHeadings = escaped.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  const withBold = withHeadings.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const withItalics = withBold.replace(/_(.+?)_/g, "<em>$1</em>");
  return withItalics.replace(/\n/g, "<br>");
}

function withAlpha(hex, alpha) {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return hex;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function truncateLine(text, max = 80) {
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1)}…`;
}

function estimateTokensFromText(text) {
  if (!text) return 0;
  const collapsed = text.replace(/\s+/g, " ").trim();
  // Simple heuristic: ~4 characters per token
  return Math.max(1, Math.ceil(collapsed.length / 4));
}

function segmentCode(type) {
  switch (type) {
    case "assistant":
      return "A";
    case "user":
      return "U";
    case "tool":
      return "T";
    case "thinking":
      return "R";
    default:
      return "M";
  }
}

function validateTurnInputOneBased(value, totalTurns) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return 1;
  const max = Math.max(1, totalTurns);
  return Math.max(1, Math.min(max, num));
}

function clampTurnDisplay(displayValue, totalTurns) {
  const max = Math.max(1, totalTurns);
  if (Number.isNaN(displayValue)) return 1;
  return Math.max(1, Math.min(max, displayValue));
}

