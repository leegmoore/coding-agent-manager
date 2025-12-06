// claude-sdk-provider.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { LlmProvider } from "./types.js";
import type { CompressionLevel } from "../types.js";
import { ConfigMissingError } from "../errors.js";

/**
 * Claude SDK Provider for compression tasks.
 *
 * Uses the official Anthropic SDK with direct API calls.
 * Requires ANTHROPIC_API_KEY environment variable.
 *
 * Benefits over CLI:
 * - No process spawning overhead (~1s per call)
 * - No keyword-based thinking triggers
 * - Supports parallel requests
 * - 3-10x faster for batch operations
 *
 * Model selection:
 * - useLargeModel=false: claude-3-5-haiku-20241022 (Haiku 3.5)
 * - useLargeModel=true: claude-opus-4-20250514 (Opus 4)
 */
export class ClaudeSdkProvider implements LlmProvider {
  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ConfigMissingError(
        "ANTHROPIC_API_KEY environment variable is required for Claude SDK provider"
      );
    }
    // Agent SDK reads ANTHROPIC_API_KEY from the environment.
  }

  /**
   * Extract JSON from markdown code blocks or raw response.
   */
  private extractJSON(raw: string): string {
    // Try markdown code block first
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find raw JSON object containing "text" key
    const jsonMatch = raw.match(/\{[\s\S]*"text"[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    // Return as-is
    return raw;
  }

  /**
   * Build compression prompt using team-bruce template.
   */
  private buildPrompt(text: string, level: CompressionLevel): string {
    const targetPercent = level === "compress" ? 35 : 10;
    return `You are TextCompressor. Rewrite the text below to approximately ${targetPercent}% of its original length while preserving intent and factual meaning.

Token estimation: tokens ≈ ceil(characters / 4)

Rules:
- Preserve key entities, claims, and relationships
- Remove redundancy, filler, and hedging
- Keep fluent English
- If unsure about length, err shorter
- Do not include explanations or commentary outside the JSON
- Do not reference "I", "we", "user", "assistant", or conversation roles

Return exactly one JSON object: {"text": "your compressed text"}

Input text:
<<<CONTENT
${text}
CONTENT`;
  }

  private getModelName(useLargeModel: boolean): string {
    return useLargeModel
      ? "claude-opus-4-5-20251101" // Opus 4.5
      : "claude-haiku-4-5-20251001"; // Haiku 4.5
  }

  /**
   * Compress text using Claude SDK.
   *
   * @param text - The text to compress
   * @param level - Compression level for target percentage
   * @param useLargeModel - If true, use opus; otherwise use haiku
   * @returns The compressed text
   */
  async compress(
    text: string,
    level: CompressionLevel,
    useLargeModel: boolean
  ): Promise<string> {
    const model = this.getModelName(useLargeModel);
    const prompt = this.buildPrompt(text, level);
    const maxThinkingTokens = useLargeModel ? 8000 : 0;

    try {
      const stream = query({
        prompt,
        options: {
          model,
          maxThinkingTokens: maxThinkingTokens || undefined,
          includePartialMessages: false,
          settingSources: [],
          permissionMode: "bypassPermissions",
        },
      });

      let accumulatedText = "";
      let resultText: string | null = null;

      for await (const msg of stream as any) {
        if (msg?.type === "assistant") {
          // assistant messages come from the underlying API assistant message
          const content = (msg as any).message?.content;
          const first = Array.isArray(content) ? content[0] : content;
          const textBlock =
            first?.text ?? first?.content ?? (typeof first === "string" ? first : null);
          if (typeof textBlock === "string") {
            accumulatedText += (accumulatedText ? "\n" : "") + textBlock;
          }
        } else if (msg?.type === "result") {
          // Prefer structured result text if present
          if (typeof (msg as any).result === "string") {
            resultText = (msg as any).result;
          } else if ((msg as any).content) {
            const content = (msg as any).content;
            const first = Array.isArray(content) ? content[0] : content;
            const textBlock =
              first?.text ?? first?.content ?? (typeof first === "string" ? first : null);
            if (typeof textBlock === "string") {
              resultText = textBlock;
            }
          }
        }
      }

      const finalText = resultText ?? accumulatedText;
      if (finalText) {
        const jsonStr = this.extractJSON(finalText);
        try {
          const parsed = JSON.parse(jsonStr) as { text?: string };
          if (parsed.text) return parsed.text;
        } catch {
          // fall through
        }
        return finalText;
      }

      throw new Error("No text returned from Claude Agent SDK query");
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude Agent SDK error: ${error.message}`);
      }
      throw error;
    }
  }
}