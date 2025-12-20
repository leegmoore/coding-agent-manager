/**
 * Workspace configuration from VS Code's workspace.json
 */
export interface WorkspaceConfig {
  /** Folder URI in format "file:///path/to/folder" */
  folder: string;
}

/**
 * Copilot chat session structure
 */
export interface CopilotSession {
  /** Schema version (currently 3) */
  version: number;
  /** Session UUID (matches filename) */
  sessionId: string;
  /** Creation timestamp in Unix ms */
  creationDate: number;
  /** Last message timestamp in Unix ms */
  lastMessageDate: number;
  /** User-assigned or auto-generated title */
  customTitle?: string;
  /** Whether session was imported */
  isImported: boolean;
  /** Array of conversation turns */
  requests: CopilotRequest[];
  /** GitHub username of the requester */
  requesterUsername?: string;
  /** Username of the responder (typically "GitHub Copilot") */
  responderUsername?: string;
}

/**
 * Single request/response turn in Copilot session
 */
export interface CopilotRequest {
  /** Unique request identifier */
  requestId: string;
  /** Response identifier */
  responseId?: string;
  /** User message content */
  message: {
    /** Full message text */
    text: string;
    /** Structured message parts */
    parts: unknown[];
  };
  /** Response items from Copilot */
  response: CopilotResponseItem[];
  /** Request result with metadata including tool call results */
  result?: CopilotRequestResult;
  /** Whether user canceled this request */
  isCanceled: boolean;
  /** Request timestamp in Unix ms */
  timestamp: number;
}

/**
 * Response item in Copilot response array
 */
export interface CopilotResponseItem {
  kind?: string;
  value?: string;
  [key: string]: unknown;
}

/**
 * Tool call result content from Copilot response metadata.
 */
export interface ToolCallResultContent {
  $mid?: number;
  value: string | Record<string, unknown>;
}

/**
 * Tool call result from Copilot response metadata.
 */
export interface ToolCallResult {
  $mid?: number;
  content: ToolCallResultContent[];
}

/**
 * Metadata about tool calls in a request result.
 */
export interface ToolCallRound {
  response: string;
  toolCalls: Array<{
    name: string;
    arguments: string;
    id: string;
  }>;
  toolInputRetry: number;
  id: string;
}

/**
 * Request result metadata containing tool call information.
 */
export interface CopilotRequestResult {
  timings?: {
    firstProgress: number;
    totalElapsed: number;
  };
  metadata?: {
    codeBlocks?: Array<{
      code: string;
      language: string;
      markdownBeforeBlock: string;
    }>;
    toolCallRounds?: ToolCallRound[];
    toolCallResults?: Record<string, ToolCallResult>;
    cacheKey?: string;
    modelMessageId?: string;
    responseId?: string;
    sessionId?: string;
    agentId?: string;
  };
  details?: string;
}
