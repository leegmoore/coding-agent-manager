import { z } from "zod";
import type { LlmProvider } from "./types.js";
import type { CompressionLevel } from "../types.js";
import { ConfigMissingError } from "../errors.js";

const CompressionResponseSchema = z.object({
  text: z.string(),
});

/**
 * OpenRouter Provider for compression tasks.
 *
 * Uses the OpenRouter chat completions API to compress text using
 * configurable models. Supports large model (Opus) for messages >1000 tokens.
 */
export class OpenRouterProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly modelLarge: string;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new ConfigMissingError("OPENROUTER_API_KEY");
    }
    this.apiKey = apiKey;
    this.model =
      process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview";
    this.modelLarge =
      process.env.OPENROUTER_MODEL_LARGE || "anthropic/claude-opus-4.5";
  }

  /**
   * Build the compression prompt using the team-bruce template.
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

  /**
   * Compress text using the OpenRouter API.
   *
   * @param text - The text to compress
   * @param level - Compression level: "compress" (35%) or "heavy-compress" (10%)
   * @param useLargeModel - Whether to use the large model for messages >1000 tokens
   * @returns The compressed text
   */
  async compress(
    text: string,
    level: CompressionLevel,
    useLargeModel: boolean
  ): Promise<string> {
    const model = useLargeModel ? this.modelLarge : this.model;
    const prompt = this.buildPrompt(text, level);

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "",
          "X-Title": process.env.OPENROUTER_SITE_NAME || "coding-agent-manager",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          reasoning: { effort: "minimal" },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text().catch(() => "");
      throw new Error(`OpenRouter API error ${response.status}: ${error}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("Invalid response format from OpenRouter");
    }

    return this.validateResponse(content);
  }

  /**
   * Extract JSON from raw response content and validate.
   *
   * Handles:
   * - Clean JSON: {"text": "compressed"}
   * - Markdown code blocks: ```json\n{"text": "compressed"}\n```
   * - Preamble text: Here is the result:\n{"text": "compressed"}
   */
  private validateResponse(raw: string): string {
    // Try markdown code block first
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return CompressionResponseSchema.parse(parsed).text;
    }

    // Try raw JSON object
    const jsonMatch = raw.match(/\{[\s\S]*"text"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return CompressionResponseSchema.parse(parsed).text;
    }

    // Try parsing as-is
    const parsed = JSON.parse(raw);
    return CompressionResponseSchema.parse(parsed).text;
  }
}
