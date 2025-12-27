export interface SessionEntry {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  isMeta?: boolean; // Meta messages (system-injected) are not turns
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
    stop_reason?: string;
  };
  // ... other fields as needed
  [key: string]: unknown;
}

export interface ContentBlock {
  type: string;
  [key: string]: unknown;
}

export interface Turn {
  startIndex: number;
  endIndex: number;
}

export interface RemovalOptions {
  toolRemoval: number;  // 0-100 percentage
  toolHandlingMode: "remove" | "truncate";
  thinkingRemoval: number;  // 0-100 percentage
}

// Compression types for v2 API

export type CompressionLevel = "compress" | "heavy-compress";

export interface CompressionBand {
  start: number;      // 0-100
  end: number;        // 0-100
  level: CompressionLevel;
}

export interface CompressionTask {
  messageIndex: number;
  entryType: "user" | "assistant";
  originalContent: string;
  level: CompressionLevel;
  estimatedTokens: number;
  attempt: number;
  timeoutMs: number;
  status: "pending" | "success" | "failed" | "skipped";
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface TurnBandMapping {
  turnIndex: number;
  band: CompressionBand | null;
}

export interface CompressionStats {
  messagesCompressed: number;
  messagesSkipped: number;
  messagesFailed: number;
  originalTokens: number;
  compressedTokens: number;
  tokensRemoved: number;
  reductionPercent: number;
  totalDurationMs?: number;
  avgDurationMs?: number;
}

export interface CompressionConfig {
  concurrency: number;
  timeoutInitial: number;
  timeoutIncrement: number;
  maxAttempts: number;
  minTokens: number;
  thinkingThreshold: number;
  targetHeavy: number;
  targetStandard: number;
}

/**
 * Token counts grouped by message type.
 */
export interface TokensByType {
  user: number;
  assistant: number;
  thinking: number;
  tool: number;
  total: number;
}

/**
 * Tool content within an assistant message.
 */
export interface ToolBlock {
  name: string;
  content: string;
}

/**
 * Structured content for a single turn.
 */
export interface TurnContent {
  userPrompt: string;
  toolBlocks: ToolBlock[];
  toolResults?: ToolBlock[];
  thinking?: string;
  assistantResponse: string;
}

/**
 * Turn data with cumulative token statistics.
 */
export interface TurnData {
  turnIndex: number;
  cumulative: TokensByType;
  content: TurnContent;
}

/**
 * Response payload for session turns endpoint.
 */
export interface SessionTurnsResponse {
  sessionId: string;
  totalTurns: number;
  turns: TurnData[];
}

// Session Browser types

export interface ProjectInfo {
  /** Encoded folder name (filesystem safe) */
  folder: string;
  /** Human-readable decoded path (best-effort, may be incorrect for paths with dashes) */
  path: string;
}

export interface SessionSummary {
  /** Session identifier (filename without extension) */
  sessionId: string;
  /** Source type for multi-source support */
  source: "claude" | "copilot";
  /** Human-readable project path */
  projectPath: string;
  /** First ~100 chars of first user message */
  firstMessage: string;
  /** File creation timestamp */
  createdAt: Date;
  /** File last modified timestamp */
  lastModifiedAt: Date;
  /** File size in bytes */
  sizeBytes: number;
  /** Number of conversation turns */
  turnCount: number;
}

export interface ProjectsResponse {
  projects: ProjectInfo[];
}

export interface SessionsResponse {
  folder: string;
  path: string;
  sessions: SessionSummary[];
}
