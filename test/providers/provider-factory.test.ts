import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getProvider, resetProvider } from "../../src/providers/index.js";
import { ClaudeCliProvider } from "../../src/providers/claude-cli-provider.js";
import { OpenRouterProvider } from "../../src/providers/openrouter-provider.js";

/**
 * Provider Factory Tests
 *
 * Tests the getProvider() factory function:
 * - Default provider selection (openrouter)
 * - Environment-based provider selection
 * - Provider caching behavior
 * - Invalid provider handling
 */

describe("getProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetProvider();
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: "test-openrouter-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetProvider();
  });

  it("returns OpenRouterProvider by default", () => {
    delete process.env.LLM_PROVIDER;
    const provider = getProvider();
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it("returns OpenRouterProvider when LLM_PROVIDER=openrouter", () => {
    process.env.LLM_PROVIDER = "openrouter";
    const provider = getProvider();
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it("throws for invalid provider", () => {
    process.env.LLM_PROVIDER = "invalid";
    expect(() => getProvider()).toThrow("Invalid LLM_PROVIDER");
  });

  it("caches provider instance", () => {
    const provider1 = getProvider();
    const provider2 = getProvider();
    expect(provider1).toBe(provider2);
  });

  it("creates new instance after reset", () => {
    const provider1 = getProvider();
    resetProvider();
    const provider2 = getProvider();
    expect(provider1).not.toBe(provider2);
  });

  it("returns ClaudeCliProvider when LLM_PROVIDER=cc-cli", () => {
    process.env.LLM_PROVIDER = "cc-cli";
    const provider = getProvider();
    expect(provider).toBeInstanceOf(ClaudeCliProvider);
  });
});
