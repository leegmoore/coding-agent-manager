/**
 * Estimate token count from text using word count * 0.75.
 * @param {string} text - The text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== "string") return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 0.75);
}

/**
 * Estimate tokens for content that may be a string or block array.
 * @param {string|Array} content - String or array of content blocks
 * @returns {number} Estimated token count
 */
export function estimateContentTokens(content) {
  if (!content) return 0;

  if (typeof content === "string") {
    return estimateTokens(content);
  }

  if (!Array.isArray(content)) return 0;

  return content.reduce((sum, block) => {
    switch (block.type) {
      case "text":
        return sum + estimateTokens(block.text || "");
      case "tool_use":
        return sum + estimateTokens(JSON.stringify(block.input || {}));
      case "tool_result":
        return sum + estimateTokens(
          typeof block.content === "string" ? block.content : JSON.stringify(block.content || {})
        );
      case "thinking":
        return sum + estimateTokens(block.thinking || "");
      default:
        return sum;
    }
  }, 0);
}
