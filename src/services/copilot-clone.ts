import { getSessionSource } from "../sources/index.js";
import type { CopilotSessionSource } from "../sources/copilot-source.js";
import type { CopilotSession, CopilotRequest } from "../sources/copilot-types.js";
import type { CompressionBand, CompressionStats, CompressionTask } from "../types.js";
import { compressCopilotMessages } from "./copilot-compression.js";
import { writeCopilotCompressionDebugLog } from "./copilot-compression-debug-logger.js";
import { loadCompressionConfig } from "../config.js";
import { estimateTokens } from "../lib/token-estimator.js";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { getVSCodeStoragePath } from "../sources/copilot-source.js";
import { VSCodeStateDb, ChatSessionIndexEntry } from "../lib/sqlite-state.js";

export interface CopilotCloneOptions {
  removeToolCalls?: boolean;
  compressPercent?: number;
  writeToDisk?: boolean;
  targetWorkspaceHash?: string;
  compressionBands?: CompressionBand[];
  debugLog?: boolean;
}

export interface CopilotCloneStats {
  originalTurns: number;
  clonedTurns: number;
  removedTurns: number;
  originalTokens: number;
  clonedTokens: number;
  removedTokens: number;
  compressionRatio: number;
  compression?: CompressionStats;
}

export interface CopilotCloneResult {
  session: CopilotSession;
  stats: CopilotCloneStats;
  sessionPath?: string;
  backupPath?: string;
  writtenToDisk: boolean;
  debugLogPath?: string;
}

export class CopilotCloneService {
  async clone(sessionId: string, workspaceHash: string, options: CopilotCloneOptions = {}): Promise<CopilotCloneResult> {
    const source = getSessionSource("copilot") as CopilotSessionSource;
    const session = await source.loadSession(sessionId, workspaceHash);

    let requests = session.requests.filter(r => !r.isCanceled);
    const originalRequests = [...requests];

    let compressionStats: CompressionStats | undefined;
    let compressionTasks: CompressionTask[] = [];
    let preCompressionRequests: CopilotRequest[] | undefined;

    if (options.compressionBands && options.compressionBands.length > 0) {
      if (options.debugLog) {
        preCompressionRequests = JSON.parse(JSON.stringify(requests)) as CopilotRequest[];
      }

      const compressionConfig = loadCompressionConfig();
      const compressionResult = await compressCopilotMessages(requests, options.compressionBands, compressionConfig);
      requests = compressionResult.requests;
      compressionStats = compressionResult.stats;
      compressionTasks = compressionResult.tasks;
    }

    if (options.removeToolCalls) {
      requests = this.removeToolCalls(requests);
    }

    if (options.compressPercent !== undefined && options.compressPercent > 0) {
      requests = this.compressByPercentage(requests, options.compressPercent);
    }

    const clonedSession = this.buildClonedSession(session, requests);
    const stats = this.calculateStats(originalRequests, requests);

    if (compressionStats) {
      stats.compression = compressionStats;
    }

    let debugLogPath: string | undefined;
    if (options.debugLog && preCompressionRequests && compressionTasks.length > 0) {
      try {
        const debugLogDir = join(process.cwd(), "clone-debug-log");
        await writeCopilotCompressionDebugLog(sessionId, clonedSession.sessionId, preCompressionRequests, requests, compressionTasks, debugLogDir);
        debugLogPath = `/clone-debug-log/${clonedSession.sessionId}-compression-debug.md`;
      } catch (error) {
        console.error(`[debug] Failed to write Copilot compression debug log:`, error);
      }
    }

    if (options.writeToDisk !== false) {
      const targetWorkspace = options.targetWorkspaceHash || workspaceHash;
      const { sessionPath, backupPath } = await this.writeSession(clonedSession, targetWorkspace);
      return { session: clonedSession, stats, sessionPath, backupPath, writtenToDisk: true, debugLogPath };
    }

    return { session: clonedSession, stats, writtenToDisk: false, debugLogPath };
  }

  async writeSession(session: CopilotSession, targetWorkspaceHash: string): Promise<{ sessionPath: string; backupPath: string }> {
    const storagePath = getVSCodeStoragePath();
    const workspacePath = join(storagePath, targetWorkspaceHash);
    const chatSessionsPath = join(workspacePath, "chatSessions");
    const sessionPath = join(chatSessionsPath, `${session.sessionId}.json`);

    await mkdir(chatSessionsPath, { recursive: true });

    const stateDb = new VSCodeStateDb(workspacePath);
    const backupPath = await stateDb.backup();

    const sessionJson = JSON.stringify(session, null, 2);
    await writeFile(sessionPath, sessionJson, "utf-8");

    const indexEntry: ChatSessionIndexEntry = {
      sessionId: session.sessionId,
      title: session.customTitle || "Cloned Session",
      lastMessageDate: session.lastMessageDate,
      isImported: false,
      initialLocation: "panel",
      isEmpty: session.requests.length === 0,
    };

    try {
      stateDb.addSessionToIndex(indexEntry);
    } catch (error) {
      await unlink(sessionPath).catch(() => {});
      throw error;
    }

    return { sessionPath, backupPath };
  }

  removeToolCalls(requests: CopilotRequest[]): CopilotRequest[] {
    return requests.map(req => ({
      ...req,
      response: req.response.filter(item => {
        if (typeof item === "object" && item !== null) {
          const kind = item.kind;
          if (kind === "toolInvocationSerialized" || kind === "prepareToolInvocation" || kind === "mcpServersStarting") {
            return false;
          }
        }
        return true;
      })
    }));
  }

  compressByPercentage(requests: CopilotRequest[], percent: number): CopilotRequest[] {
    if (requests.length === 0 || percent <= 0) return requests;
    if (percent >= 100) return [];
    const removeCount = Math.floor(requests.length * (percent / 100));
    if (removeCount === 0) return requests;
    return requests.slice(removeCount);
  }

  generateSessionId(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  generateCloneTitle(firstUserMessage: string, maxLength: number = 50): string {
    const trimmed = firstUserMessage.trim();
    const preview = trimmed.length === 0 ? "(No message)" : trimmed.length <= maxLength ? trimmed : trimmed.slice(0, maxLength) + "...";
    const timestamp = this.formatTimestamp(new Date());
    return `Clone: ${preview} (${timestamp})`;
  }

  private formatTimestamp(date: Date): string {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[date.getMonth()];
    const day = date.getDate();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${month} ${day} ${hours}:${minutes}${ampm}`;
  }

  calculateStats(original: CopilotRequest[], cloned: CopilotRequest[]): CopilotCloneStats {
    const originalTokens = this.countTotalTokens(original);
    const clonedTokens = this.countTotalTokens(cloned);

    return {
      originalTurns: original.length,
      clonedTurns: cloned.length,
      removedTurns: original.length - cloned.length,
      originalTokens,
      clonedTokens,
      removedTokens: originalTokens - clonedTokens,
      compressionRatio: originalTokens > 0 ? Math.round((1 - clonedTokens / originalTokens) * 100) : 0
    };
  }

  private buildClonedSession(original: CopilotSession, requests: CopilotRequest[]): CopilotSession {
    const now = Date.now();
    const firstUserMessage = original.requests.length > 0 ? original.requests[0].message.text : "";

    return {
      ...original,
      requests,
      sessionId: this.generateSessionId(),
      creationDate: now,
      lastMessageDate: now,
      customTitle: this.generateCloneTitle(firstUserMessage),
      isImported: false
    };
  }

  private countTotalTokens(requests: CopilotRequest[]): number {
    return requests.reduce((total, req) => {
      const userTokens = estimateTokens(req.message.text);
      const assistantTokens = req.response.reduce((sum, item) => {
        if (typeof item === "object" && item !== null && "value" in item) {
          return sum + estimateTokens(String(item.value || ""));
        }
        return sum;
      }, 0);
      const toolResultTokens = this.countToolResultTokens(req);
      return total + userTokens + assistantTokens + toolResultTokens;
    }, 0);
  }

  private countToolResultTokens(request: CopilotRequest): number {
    const results = request.result?.metadata?.toolCallResults;
    if (!results) return 0;

    let tokens = 0;
    for (const result of Object.values(results)) {
      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (typeof item.value === "string") {
            tokens += estimateTokens(item.value);
          } else if (typeof item.value === "object" && item.value !== null) {
            tokens += estimateTokens(JSON.stringify(item.value));
          }
        }
      }
    }
    return tokens;
  }
}

export const copilotCloneService = new CopilotCloneService();
