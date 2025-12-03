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


