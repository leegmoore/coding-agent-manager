/**
 * Extracts session ID from file path
 * @param {string} outputPath - Full path to session file
 * @returns {string} Session UUID
 */
export function extractSessionId(outputPath) {
  // Handle both Unix and Windows path separators
  const parts = outputPath.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  return filename.replace(/\.jsonl$/, '');
}

/**
 * Formats stats for display
 * @param {Object} stats - Stats object from API
 * @returns {Array<{label: string, value: number}>} Formatted stats
 */
export function formatStats(stats) {
  return [
    { label: 'Original turns', value: stats.originalTurnCount },
    { label: 'Output turns', value: stats.outputTurnCount },
    { label: 'Tool calls removed', value: stats.toolCallsRemoved },
    { label: 'Thinking blocks removed', value: stats.thinkingBlocksRemoved },
  ];
}

/**
 * Formats compression stats for display
 * @param {Object|null} compression - Compression stats from API (result.stats.compression)
 * @returns {Array<{label: string, value: string|number}>}
 */
export function formatCompressionStats(compression) {
  if (!compression) {
    return [];
  }

  const {
    messagesCompressed,
    messagesSkipped,
    messagesFailed,
    originalTokens,
    compressedTokens,
    tokensRemoved,
    reductionPercent,
  } = compression;

  return [
    { label: 'Messages compressed', value: messagesCompressed },
    { label: 'Messages skipped', value: messagesSkipped },
    { label: 'Compressions failed', value: messagesFailed },
    { label: 'Original tokens', value: originalTokens },
    { label: 'Compressed tokens', value: compressedTokens },
    { label: 'Tokens removed', value: tokensRemoved },
    { label: 'Token reduction', value: `${reductionPercent}%` },
  ];
}
