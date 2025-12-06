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
  detailCard;
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

    // Setup navigation bounds
    turnSlider.max = Math.max(0, sessionData.totalTurns - 1);
    turnInput.max = Math.max(0, sessionData.totalTurns - 1);

    // Show visualization section
    visualizationSection.classList.remove("hidden");

    // Render initial state
    syncNavigation();
    checkScaleWarning();
    renderVisualization();
    renderDetailCard();
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
  }
}

function handleTurnInputChange() {
  if (!sessionData) return;
  currentTurn = validateTurnInput(turnInput.value, sessionData.totalTurns - 1);
  syncNavigation();
  checkScaleWarning();
  renderVisualization();
  renderDetailCard();
}

function handleSliderChange() {
  if (!sessionData) return;
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
  turnLabel.textContent = `Turn ${currentTurn + 1} of ${sessionData?.totalTurns ?? 0}`;

  leftButton.disabled = currentTurn === 0;
  rightButton.disabled = sessionData ? currentTurn === sessionData.totalTurns - 1 : true;
}

function renderVisualization() {
  if (!sessionData) return;
  const turn = sessionData.turns[currentTurn];
  const cumulative = turn.cumulative;
  const maxTokens = currentScale * 1000;

  visualizationContainer.innerHTML = "";

  const rect = visualizationContainer.getBoundingClientRect();
  const width = Math.max(rect.width || DEFAULT_WIDTH, 320);
  const height = Math.max(rect.height || DEFAULT_HEIGHT, 200);
  const bandWidth = width / 4;
  const bandGap = 0;

  const svg = d3
    .select(visualizationContainer)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const bands = [
    { type: "user", tokens: cumulative.user, color: COLORS.user },
    { type: "assistant", tokens: cumulative.assistant, color: COLORS.assistant },
    { type: "thinking", tokens: cumulative.thinking, color: COLORS.thinking },
    { type: "tool", tokens: cumulative.tool, color: COLORS.tool },
  ];

  bands.forEach((band, i) => {
    const bandHeight = calculateBandHeight(band.tokens, maxTokens, height);
    const x = i * bandWidth;
    const y = height - bandHeight;

    svg
      .append("rect")
      .attr("x", x)
      .attr("y", y)
      .attr("width", bandWidth - bandGap)
      .attr("height", bandHeight)
      .attr("fill", band.color);

    if (band.tokens > 0) {
      svg
        .append("text")
        .attr("x", x + bandWidth / 2)
        .attr("y", y - 5)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .text(formatTokenCount(band.tokens));
    }
  });

  tokenStats.textContent = `Total: ${formatTokenCount(cumulative.total)} tokens`;
}

function renderDetailCard() {
  if (!sessionData) return;
  const turn = sessionData.turns[currentTurn];
  const { userPrompt, assistantResponse, toolBlocks } = turn.content;

  const toolText =
    toolBlocks && toolBlocks.length
      ? toolBlocks
          .map((t) => `**Tool ${t.name}**\n${truncateToolContent(t.content)}`)
          .join("\n\n")
      : "";

  const md = `
### User
${userPrompt || "_(no prompt)_"}

### Assistant
${assistantResponse || "_(no response)_"}

${toolText ? "### Tools\n" + toolText : ""}
`.trim();

  detailCard.innerHTML = renderMarkdownSafe(md);
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

