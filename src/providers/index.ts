import type { LlmProvider, ProviderType } from "./types.js";
import { ClaudeCliProvider } from "./claude-cli-provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { ClaudeSdkProvider } from "./claude-sdk-provider.js";
import { ConfigMissingError } from "../errors.js";

let cachedProvider: LlmProvider | null = null;
let cachedProviderType: ProviderType | null = null;

/**
 * Get the configured LLM provider.
 *
 * Reads LLM_PROVIDER from environment (defaults to "openrouter").
 * Provider instance is cached for reuse.
 *
 * @returns The configured LlmProvider instance
 * @throws ConfigMissingError if provider type is invalid or provider-specific config missing
 */
export function getProvider(): LlmProvider {
  const providerType = (process.env.LLM_PROVIDER || "openrouter") as ProviderType;

  // Return cached provider if type matches
  if (cachedProvider && cachedProviderType === providerType) {
    return cachedProvider;
  }

  switch (providerType) {
    case "openrouter":
      cachedProvider = new OpenRouterProvider();
      break;
    case "cc-cli":
      cachedProvider = new ClaudeCliProvider();
      break;
    case "claude-sdk":
      cachedProvider = new ClaudeSdkProvider();
      break;
    default:
      throw new ConfigMissingError(`Invalid LLM_PROVIDER: ${providerType}`);
  }

  cachedProviderType = providerType;
  return cachedProvider;
}

/**
 * Reset the cached provider.
 *
 * Useful for testing or when environment changes.
 */
export function resetProvider(): void {
  cachedProvider = null;
  cachedProviderType = null;
}

export type { LlmProvider, ProviderType } from "./types.js";
