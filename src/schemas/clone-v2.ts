import { z } from "zod";

export const CompressionBandSchema = z.object({
  start: z.number().min(0).max(100),
  end: z.number().min(0).max(100),
  level: z.enum(["compress", "heavy-compress"]),
}).refine(data => data.start < data.end, "start must be less than end");

function validateNonOverlappingBands(data: { compressionBands?: { start: number; end: number }[] }): boolean {
  if (!data.compressionBands || data.compressionBands.length <= 1) return true;
  const sorted = [...data.compressionBands].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return false;
  }
  return true;
}

export const CloneRequestSchemaV2 = z.object({
  sessionId: z.string().uuid(),
  toolRemoval: z.number().min(0).max(100).default(0),
  toolHandlingMode: z.enum(["remove", "truncate"]).default("remove"),
  thinkingRemoval: z.number().min(0).max(100).default(0),
  compressionBands: z.array(CompressionBandSchema).optional(),
  includeUserMessages: z.boolean().default(false),
  debugLog: z.boolean().optional().default(false),
}).refine(validateNonOverlappingBands, "Compression bands must not overlap");

export const CompressionStatsSchema = z.object({
  messagesCompressed: z.number(),
  messagesSkipped: z.number(),
  messagesFailed: z.number(),
  originalTokens: z.number(),
  compressedTokens: z.number(),
  tokensRemoved: z.number(),
  reductionPercent: z.number(),
});

export const CloneResponseSchemaV2 = z.object({
  success: z.boolean(),
  outputPath: z.string(),
  debugLogPath: z.string().optional(),
  stats: z.object({
    originalTurnCount: z.number(),
    outputTurnCount: z.number(),
    toolCallsRemoved: z.number(),
    toolCallsTruncated: z.number().optional(),
    thinkingBlocksRemoved: z.number(),
    compression: CompressionStatsSchema.optional(),
  }),
});

export const CompressionResponseSchema = z.object({
  text: z.string(),
});

export type CloneRequestV2 = z.infer<typeof CloneRequestSchemaV2>;
export type CloneResponseV2 = z.infer<typeof CloneResponseSchemaV2>;
export type CompressionBand = z.infer<typeof CompressionBandSchema>;
