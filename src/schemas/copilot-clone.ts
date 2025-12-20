import { z } from "zod";

const CompressionBandSchema = z.object({
  start: z.number().min(0).max(100),
  end: z.number().min(0).max(100),
  level: z.enum(["compress", "heavy-compress"]),
});

export const CopilotCloneRequestSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
  workspaceHash: z.string().min(1, "Workspace hash required"),
  options: z.object({
    removeToolCalls: z.boolean().optional(),
    compressPercent: z.number().min(0).max(100).optional(),
    writeToDisk: z.boolean().default(true),
    targetWorkspaceHash: z.string().optional(),
    compressionBands: z.array(CompressionBandSchema).optional(),
    debugLog: z.boolean().optional(),
  }).optional(),
});

export const CopilotCloneResponseSchema = z.object({
  success: z.boolean(),
  session: z.object({
    sessionId: z.string(),
    customTitle: z.string().optional(),
  }),
  stats: z.object({
    originalTurns: z.number(),
    clonedTurns: z.number(),
    removedTurns: z.number(),
    originalTokens: z.number(),
    clonedTokens: z.number(),
    removedTokens: z.number(),
    compressionRatio: z.number(),
    compression: z.object({
      messagesCompressed: z.number(),
      messagesSkipped: z.number(),
      messagesFailed: z.number(),
      originalTokens: z.number(),
      compressedTokens: z.number(),
      tokensRemoved: z.number(),
      reductionPercent: z.number(),
    }).optional(),
  }),
  sessionPath: z.string().optional(),
  backupPath: z.string().optional(),
  writtenToDisk: z.boolean(),
  debugLogPath: z.string().optional(),
});

export type CopilotCloneRequest = z.infer<typeof CopilotCloneRequestSchema>;
export type CopilotCloneResponse = z.infer<typeof CopilotCloneResponseSchema>;
