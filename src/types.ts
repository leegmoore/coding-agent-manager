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
  toolRemoval: "none" | "50" | "75" | "100";
  thinkingRemoval: "none" | "50" | "75" | "100";
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
