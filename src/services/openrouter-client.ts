import { z } from "zod";
import { ConfigMissingError } from "../errors.js";
import type { CompressionLevel } from "../types.js";

/**
 * Zod schema for validating compression response from OpenRouter.
 */
const CompressionResponseSchema = z.object({
  text: z.string(),
});

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  modelLarge: string;
}

/**
 * OpenRouter API client for text compression.
 *
 * Uses the OpenRouter chat completions API to compress text using
 * configurable models. Supports large model (Opus) for messages >1000 tokens.
 */
export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly modelLarge: string;

  constructor(config: OpenRouterConfig) {
    if (!config.apiKey) {
      throw new ConfigMissingError("OPENROUTER_API_KEY");
    }
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.modelLarge = config.modelLarge;
  }

  /**
   * Compress text using the OpenRouter API.
   *
   * @param text - The text to compress
   * @param level - Compression level: "compress" (35%) or "heavy-compress" (10%)
   * @param useLargeModel - Whether to use the large model (Opus) for messages >1000 tokens
   * @returns The compressed text
   */
  async compress(
    text: string,
    level: CompressionLevel,
    useLargeModel: boolean
  ): Promise<string> {
    const targetPercent = level === "compress" ? 35 : 10;
    const prompt = this.buildPrompt(text, targetPercent);
    const model = useLargeModel ? this.modelLarge : this.model;

    const content = await this.callAPI(prompt, model);
    return this.validateResponse(content);
  }

  /**
   * Build the compression prompt using the team-bruce template.
   */
  private buildPrompt(text: string, targetPercent: number): string {
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
   * Call the OpenRouter API.
   *
   * @param prompt - The prompt to send
   * @param model - The model to use
   * @returns The raw content string from the API response
   */
  private async callAPI(prompt: string, model: string): Promise<string> {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "",
          "X-Title": process.env.OPENROUTER_SITE_NAME || "coding-agent-manager",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `OpenRouter API error ${response.status}: ${errorBody}`
      );
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("Invalid response format from OpenRouter");
    }

    return content;
  }

  /**
   * Extract JSON from raw response content.
   *
   * Handles:
   * - Clean JSON: {"text": "compressed"}
   * - Markdown code blocks: ```json\n{"text": "compressed"}\n```
   * - Preamble text: Here is the result:\n{"text": "compressed"}
   */
  private extractJSON(raw: string): string {
    // 1. Try markdown code block
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // 2. Try to find raw JSON object containing "text" key
    const jsonMatch = raw.match(/\{[\s\S]*"text"[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    // 3. Return as-is (will fail parsing, triggering retry)
    return raw;
  }

  /**
   * Validate and extract the compressed text from the API response.
   *
   * @param raw - The raw content string from the API
   * @returns The compressed text
   */
  private validateResponse(raw: string): string {
    // Extract JSON from possible markdown/preamble
    const jsonStr = this.extractJSON(raw);

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error(
        `Failed to parse compression response as JSON: ${jsonStr.substring(0, 100)}`
      );
    }

    // Validate with Zod
    const validated = CompressionResponseSchema.parse(parsed);

    return validated.text;
  }
}
