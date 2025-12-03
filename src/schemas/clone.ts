import { z } from "zod";

// Request
export const CloneRequestSchema = z.object({
  sessionId: z.string().uuid(),
  toolRemoval: z.enum(["none", "50", "75", "100"]).default("none"),
  thinkingRemoval: z.enum(["none", "50", "75", "100"]).default("none"),
});

// Response
export const CloneResponseSchema = z.object({
  success: z.boolean(),
  outputPath: z.string(),
  stats: z.object({
    originalTurnCount: z.number(),
    outputTurnCount: z.number(),
    toolCallsRemoved: z.number(),
    thinkingBlocksRemoved: z.number(),
  }),
});

// Error response
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// Types
export type CloneRequest = z.infer<typeof CloneRequestSchema>;
export type CloneResponse = z.infer<typeof CloneResponseSchema>;


