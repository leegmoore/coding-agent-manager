import { spawn } from "child_process";
import type { LlmProvider } from "./types.js";
import type { CompressionLevel } from "../types.js";

/**
 * Claude CLI Provider for compression tasks.
 *
 * Uses `claude -p` (pipe/one-shot mode) with --model flag.
 * Leverages existing OAuth authentication from `claude` login.
 *
 * Model selection:
 * - useLargeModel=false: haiku (Claude Haiku)
 * - useLargeModel=true: opus (Claude Opus)
 */
export class ClaudeCliProvider implements LlmProvider {
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

  /**
   * Compress text using Claude CLI.
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
    const model = useLargeModel
      ? "claude-opus-4-5-20251101"
      : "claude-haiku-4-5-20251001";
    const prompt = this.buildPrompt(text, level);
    const env = { ...process.env };
    if (useLargeModel) {
      env.MAX_THINKING_TOKENS = "8000";
    } else {
      delete env.MAX_THINKING_TOKENS;
    }

    return new Promise((resolve, reject) => {
      const child = spawn(
        "claude",
        ["-p", "--model", model, "--output-format", "json", "--max-turns", "1"],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env,
        }
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.stdin.write(prompt);
      child.stdin.end();

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          reject(
            new Error(
              "Claude CLI not found. Is 'claude' installed and in PATH?"
            )
          );
        } else {
          reject(err);
        }
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          // CLI JSON output has { result: "..." } structure
          const cliOutput = JSON.parse(stdout) as {
            result?: string;
            text?: string;
          };
          const llmResponse = cliOutput.result ?? cliOutput.text ?? stdout;

          // Extract JSON from markdown code blocks if present
          const jsonStr = this.extractJSON(llmResponse);

          // LLM returns {"text": "..."} per our prompt - extract the text
          const parsed = JSON.parse(jsonStr) as { text?: string };
          if (parsed.text) {
            resolve(parsed.text);
          } else {
            // Fallback if no text field
            resolve(llmResponse);
          }
        } catch {
          reject(
            new Error(
              `Failed to parse Claude CLI output: ${stdout.substring(0, 200)}`
            )
          );
        }
      });
    });
  }
}
