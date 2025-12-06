/**
 * Visualization data transforms and utilities
 */

/**
 * Color palette for entry types
 */
export const COLORS = {
  user: '#3B82F6',      // Blue
  assistant: '#22C55E', // Green
  tool: '#F97316',      // Orange
  thinking: '#A855F7',  // Purple
};

/**
 * Human-readable labels for entry types
 */
export const LABELS = {
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
  thinking: 'Thinking',
};

/**
 * Minimum strip height in pixels to ensure visibility
 */
export const MIN_STRIP_HEIGHT = 3;

/**
 * Maximum strip height in pixels to prevent huge entries from dominating
 */
export const MAX_STRIP_HEIGHT = 60;

/**
 * Gap between strips in pixels
 */
export const STRIP_GAP = 2;

/**
 * Calculate the height of a strip based on token count
 * Height is proportional to token count within min/max bounds
 * @param {number} tokens - Token count for this entry
 * @param {number} maxTokens - Maximum token count across all entries
 * @returns {number} Height in pixels
 */
export function calculateStripHeight(tokens, maxTokens) {
  if (maxTokens === 0) return MIN_STRIP_HEIGHT;
  const proportionalHeight = (tokens / maxTokens) * MAX_STRIP_HEIGHT;
  return Math.max(MIN_STRIP_HEIGHT, Math.min(MAX_STRIP_HEIGHT, proportionalHeight));
}

/**
 * Get color for an entry type
 * @param {string} type - Entry type ('user' | 'assistant' | 'tool' | 'thinking')
 * @returns {string} Hex color code
 */
export function getColor(type) {
  return COLORS[type] || COLORS.assistant;
}

/**
 * Get label for an entry type
 * @param {string} type - Entry type
 * @returns {string} Human-readable label
 */
export function getLabel(type) {
  return LABELS[type] || type;
}

/**
 * Format token count for display
 * @param {number} tokens - Token count
 * @returns {string} Formatted string (e.g., "1.2k" for 1200)
 */
export function formatTokens(tokens) {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

/**
 * Calculate summary statistics from session structure
 * @param {Object} structure - Session structure response
 * @returns {Object} Summary stats
 */
export function calculateStats(structure) {
  const byType = {
    user: { count: 0, tokens: 0 },
    assistant: { count: 0, tokens: 0 },
    tool: { count: 0, tokens: 0 },
    thinking: { count: 0, tokens: 0 },
  };

  for (const entry of structure.entries) {
    if (byType[entry.type]) {
      byType[entry.type].count++;
      byType[entry.type].tokens += entry.tokens;
    }
  }

  return {
    totalEntries: structure.entries.length,
    totalTokens: structure.totalTokens,
    byType,
  };
}
