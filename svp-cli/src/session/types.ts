/**
 * Session types for SVP CLI
 * Simplified from coding-agent-manager
 */

export interface SessionEntry {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string | null;
  message?: {
    content: string | ContentBlock[];
    [key: string]: unknown;
  };
  isMeta?: boolean;
  summary?: string;
  leafUuid?: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  tool_use_id?: string;
  input?: unknown;
  content?: string;
  [key: string]: unknown;
}

export interface Turn {
  startIndex: number;
  endIndex: number;
}

export interface RemovalOptions {
  toolRemoval: number;          // 0-100
  toolHandlingMode: 'remove' | 'truncate';
  thinkingRemoval: number;      // 0-100
}

export interface RemovalResult {
  entries: SessionEntry[];
  toolCallsRemoved: number;
  toolCallsTruncated: number;
  thinkingBlocksRemoved: number;
}

export interface SessionStats {
  turns: number;
  toolCalls: { total: number; failed: number };
  thinkingBlocks: number;
  tokens: number;
  files: string[];
  lastModified: string;
}
