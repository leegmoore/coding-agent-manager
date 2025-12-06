import type { CompressionLevel } from "../types.js";

/**
 * LLM Provider interface for compression tasks.
 *
 * This interface matches the existing OpenRouterClient.compress() signature
 * so providers can be passed directly to processBatches() in compression-batch.ts.
 */
export interface LlmProvider {
  /**
   * Compress text using the provider's LLM.
   *
   * @param text - The text to compress
   * @param level - Compression level: "compress" (35%) or "heavy-compress" (10%)
   * @param useLargeModel - Whether to use the large model for messages >1000 tokens
   * @returns The compressed text
   */
  compress(
    text: string,
    level: CompressionLevel,
    useLargeModel: boolean
  ): Promise<string>;
}

export type ProviderType = "openrouter" | "cc-cli" | "claude-sdk";
