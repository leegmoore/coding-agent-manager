import { validateUUID } from '../lib/validation.js';
import { get, ApiError } from '../api/client.js';
import {
  COLORS,
  LABELS,
  calculateStripHeight,
  getColor,
  formatTokens,
  calculateStats,
} from '../lib/visualize.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM queries
  const form = document.getElementById('visualize-form');
  const submitBtn = document.getElementById('submit-btn');
  const sessionIdInput = document.getElementById('sessionId');

  const containers = {
    loading: document.getElementById('loading'),
    visualization: document.getElementById('visualization'),
    error: document.getElementById('error-result'),
    stats: document.getElementById('stats-panel'),
  };

  const vizContainer = document.getElementById('viz-container');
  const statsContent = document.getElementById('stats-content');

  // Verify required elements exist
  if (!form || !submitBtn || !sessionIdInput || !vizContainer) {
    console.error('Missing required DOM elements');
    return;
  }

  // Guard against double submission
  let isSubmitting = false;

  /**
   * Hide all result containers
   */
  function hideAll() {
    if (containers.loading) containers.loading.classList.add('hidden');
    if (containers.visualization) containers.visualization.classList.add('hidden');
    if (containers.error) containers.error.classList.add('hidden');
    if (containers.stats) containers.stats.classList.add('hidden');
  }

  /**
   * Show loading state
   */
  function showLoading() {
    hideAll();
    if (containers.loading) {
      containers.loading.classList.remove('hidden');
    }
    submitBtn.disabled = true;
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  function showError(message) {
    hideAll();
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
      errorMessage.textContent = message;
    }
    if (containers.error) {
      containers.error.classList.remove('hidden');
    }
    submitBtn.disabled = false;
  }

  /**
   * Render the D3 visualization
   * @param {Object} structure - Session structure data
   */
  function renderVisualization(structure) {
    // Clear previous visualization
    vizContainer.innerHTML = '';

    // Get container width
    const containerWidth = vizContainer.clientWidth || 800;

    // Reverse entries so newest/latest appear at TOP, oldest at BOTTOM
    const reversedEntries = [...structure.entries].reverse();

    // Pre-calculate heights for each entry and compute total height
    const entryHeights = reversedEntries.map(entry =>
      calculateStripHeight(entry.tokens, structure.maxEntryTokens)
    );
    const totalHeight = entryHeights.reduce((sum, h) => sum + h, 0);

    // Pre-calculate Y positions (cumulative)
    const yPositions = [];
    let currentY = 0;
    for (const height of entryHeights) {
      yPositions.push(currentY);
      currentY += height;
    }

    // Create SVG with D3
    const svg = d3.select(vizContainer)
      .append('svg')
      .attr('width', containerWidth)
      .attr('height', totalHeight)
      .attr('class', 'visualization-svg');

    // Create groups for each entry
    const entries = svg.selectAll('g.entry')
      .data(reversedEntries)
      .enter()
      .append('g')
      .attr('class', 'entry')
      .attr('transform', (d, i) => `translate(0, ${yPositions[i]})`);

    // Add rectangles for each entry - full width, variable height
    entries.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', containerWidth)
      .attr('height', (d, i) => entryHeights[i])
      .attr('fill', d => getColor(d.type))
      .attr('rx', 2)
      .attr('ry', 2);

    // Add title (native browser tooltip) to each entry
    entries.append('title')
      .text(d => `${LABELS[d.type] || d.type}: ${formatTokens(d.tokens)} tokens`);

    // Show visualization container
    hideAll();
    if (containers.visualization) {
      containers.visualization.classList.remove('hidden');
    }
    submitBtn.disabled = false;

    // Show stats panel
    displayStats(structure);
  }

  /**
   * Display statistics panel
   * @param {Object} structure - Session structure data
   */
  function displayStats(structure) {
    if (!statsContent || !containers.stats) return;

    const stats = calculateStats(structure);

    const html = `
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-500">Total Entries:</span>
          <span class="font-medium ml-2">${stats.totalEntries}</span>
        </div>
        <div>
          <span class="text-gray-500">Total Tokens:</span>
          <span class="font-medium ml-2">${formatTokens(stats.totalTokens)}</span>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        ${Object.entries(stats.byType).map(([type, data]) => `
          <div class="flex items-center gap-2">
            <span class="inline-block w-3 h-3 rounded" style="background-color: ${COLORS[type]}"></span>
            <span>${LABELS[type]}: ${data.count}</span>
          </div>
        `).join('')}
      </div>
    `;

    statsContent.innerHTML = html;
    containers.stats.classList.remove('hidden');
  }

  /**
   * Handles form submission
   */
  async function handleSubmit(e) {
    e.preventDefault();

    // Prevent double submission
    if (isSubmitting) return;
    isSubmitting = true;

    const sessionId = sessionIdInput.value.trim();

    // Client-side validation
    if (!validateUUID(sessionId)) {
      showError('Invalid session ID format. Please enter a valid UUID.');
      isSubmitting = false;
      return;
    }

    // Show loading state
    showLoading();

    try {
      const structure = await get(`/api/session/${sessionId}/structure`);

      if (!structure.entries || structure.entries.length === 0) {
        showError('Session has no entries to visualize.');
        isSubmitting = false;
        return;
      }

      renderVisualization(structure);
    } catch (err) {
      let message;
      if (err instanceof ApiError) {
        message = err.message;
      } else if (err.message && err.message.includes('fetch')) {
        message = `Network error: ${err.message}. Please check your connection.`;
      } else {
        message = err.message || 'An unexpected error occurred';
      }
      showError(message);
    } finally {
      isSubmitting = false;
    }
  }

  // Event listeners
  form.addEventListener('submit', handleSubmit);
  submitBtn.addEventListener('click', handleSubmit);

  // Handle window resize - re-render if visualization is shown
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // If visualization is visible, re-fetch and render
      const sessionId = sessionIdInput.value.trim();
      if (!containers.visualization?.classList.contains('hidden') && validateUUID(sessionId)) {
        get(`/api/session/${sessionId}/structure`)
          .then(structure => renderVisualization(structure))
          .catch(() => {}); // Silently ignore resize errors
      }
    }, 250);
  });
});
