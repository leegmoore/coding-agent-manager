// Constants
export const COLORS = {
  user: "#3B82F6",
  assistant: "#22C55E",
  thinking: "#A855F7",
  tool: "#F97316",
};

export const DEFAULT_WIDTH = 800;
export const DEFAULT_HEIGHT = 500;
export const SCALE_MIN = 50;
export const SCALE_MAX = 2000;

export function calculateBandHeight(tokens, maxTokens, containerHeight) {
  if (maxTokens === 0) return 0;
  return Math.round((tokens / maxTokens) * containerHeight);
}

export function formatTokenCount(tokens) {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }
  return tokens.toString();
}

export function truncateToolContent(content, maxLines = 2) {
  if (!content) return "";
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join("\n") + "\n...";
}

export function exceedsScale(cumulative, scaleK) {
  return cumulative.total > scaleK * 1000;
}

export function validateScaleInput(value) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return SCALE_MIN;
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, num));
}

export function validateTurnInput(value, max) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(max, num));
}

