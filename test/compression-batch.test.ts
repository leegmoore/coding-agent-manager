import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  processBatches,
  compressWithTimeout,
  calculateRetryTimeout,
} from "../src/services/compression-batch.js";
import type { CompressionTask, CompressionConfig } from "../src/types.js";

/**
 * Phase 3 TDD Tests: Batch Processing
 *
 * These tests verify the batch processing functions:
 * - compressWithTimeout: Individual task compression with timeout
 * - processBatches: Parallel batch processing with retry logic
 * - calculateTimeout: Timeout progression calculation
 *
 * Test coverage:
 * - TC-01: Basic compression band (3 tasks, all succeed)
 * - TC-02: Heavy compression band (level passed correctly)
 * - TC-06: Timeout and retry (fail once, succeed on retry)
 * - TC-07: Max retry exceeded (fail 4 times)
 * - TC-13: Parallel batching (15 tasks, concurrency 5)
 * - Timeout progression test (5000, 10000, 15000, 15000)
 */

// Mock client interface for tests
interface MockClient {
  compress: Mock<(text: string, level: string, useLargeModel: boolean) => Promise<string>>;
}

// Default config for tests
const defaultConfig: CompressionConfig = {
  concurrency: 10,
  timeoutInitial: 5000,
  timeoutIncrement: 5000,
  maxAttempts: 4,
  minTokens: 20,
  thinkingThreshold: 1000,
  targetHeavy: 70,
  targetStandard: 50,
};

describe("calculateRetryTimeout", () => {
  it("returns 1.5x for attempt 1", () => {
    const result = calculateRetryTimeout(20000, 1);
    expect(result).toBe(30000); // 20000 * 1.5
  });

  it("returns 2x for attempt 2", () => {
    const result = calculateRetryTimeout(20000, 2);
    expect(result).toBe(40000); // 20000 * 2
  });

  it("returns 2.5x for attempt 3", () => {
    const result = calculateRetryTimeout(20000, 3);
    expect(result).toBe(50000); // 20000 * 2.5
  });

  it("caps at 3x for attempt 4+", () => {
    // maxMultiplier = 3
    const result4 = calculateRetryTimeout(20000, 4);
    expect(result4).toBe(60000); // 20000 * 3 (capped)

    const result5 = calculateRetryTimeout(20000, 5);
    expect(result5).toBe(60000); // still capped at 3x
  });

  it("increases timeout on each retry (progression test)", () => {
    const baseTimeout = 20000;
    const timeouts = [1, 2, 3, 4].map((attempt) => calculateRetryTimeout(baseTimeout, attempt));
    expect(timeouts).toEqual([30000, 40000, 50000, 60000]); // 1.5x, 2x, 2.5x, 3x
  });
});

describe("compressWithTimeout", () => {
  let mockClient: MockClient;

  beforeEach(() => {
    mockClient = {
      compress: vi.fn().mockResolvedValue("compressed text"),
    };
  });

  it("returns success status when compression succeeds", async () => {
    const task: CompressionTask = {
      messageIndex: 0,
      entryType: "user",
      originalContent: "test content",
      level: "compress",
      estimatedTokens: 50,
      attempt: 0,
      timeoutMs: 5000,
      status: "pending",
    };

    const result = await compressWithTimeout(task, mockClient);

    expect(result.status).toBe("success");
    expect(result.result).toBe("compressed text");
  });

  it("returns failed status when compression throws", async () => {
    mockClient.compress.mockRejectedValue(new Error("API error"));

    const task: CompressionTask = {
      messageIndex: 0,
      entryType: "user",
      originalContent: "test content",
      level: "compress",
      estimatedTokens: 50,
      attempt: 0,
      timeoutMs: 5000,
      status: "pending",
    };

    const result = await compressWithTimeout(task, mockClient);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("API error");
  });

  it("passes useLargeModel=false for messages under 1000 tokens", async () => {
    const task: CompressionTask = {
      messageIndex: 0,
      entryType: "user",
      originalContent: "test content",
      level: "compress",
      estimatedTokens: 500, // Under 1000
      attempt: 0,
      timeoutMs: 5000,
      status: "pending",
    };

    await compressWithTimeout(task, mockClient);

    expect(mockClient.compress).toHaveBeenCalledWith("test content", "compress", false);
  });

  it("passes useLargeModel=true for messages over 1000 tokens", async () => {
    const task: CompressionTask = {
      messageIndex: 0,
      entryType: "user",
      originalContent: "test content",
      level: "compress",
      estimatedTokens: 1500, // Over 1000
      attempt: 0,
      timeoutMs: 5000,
      status: "pending",
    };

    await compressWithTimeout(task, mockClient);

    expect(mockClient.compress).toHaveBeenCalledWith("test content", "compress", true);
  });

  it("times out if compression takes too long", async () => {
    // Simulate a slow compression that takes longer than timeout
    mockClient.compress.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve("slow result"), 200))
    );

    const task: CompressionTask = {
      messageIndex: 0,
      entryType: "user",
      originalContent: "test content",
      level: "compress",
      estimatedTokens: 50,
      attempt: 0,
      timeoutMs: 50, // Short timeout to trigger
      status: "pending",
    };

    const result = await compressWithTimeout(task, mockClient);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Compression timeout");
  });
});

describe("processBatches", () => {
  let mockClient: MockClient;

  beforeEach(() => {
    mockClient = {
      compress: vi.fn().mockResolvedValue("compressed"),
    };
  });

  it("TC-01: processes compression band successfully", async () => {
    const tasks: CompressionTask[] = [
      {
        messageIndex: 0,
        entryType: "user",
        originalContent: "x".repeat(200),
        level: "compress",
        estimatedTokens: 50,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
      {
        messageIndex: 1,
        entryType: "assistant",
        originalContent: "y".repeat(400),
        level: "compress",
        estimatedTokens: 100,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
      {
        messageIndex: 2,
        entryType: "user",
        originalContent: "z".repeat(600),
        level: "compress",
        estimatedTokens: 150,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
    ];

    const config = { concurrency: 10, maxAttempts: 4 };
    const results = await processBatches(tasks, mockClient, config, defaultConfig);

    expect(results).toHaveLength(3);
    expect(results.filter((t) => t.status === "success")).toHaveLength(3);
    expect(mockClient.compress).toHaveBeenCalledTimes(3);
    expect(mockClient.compress).toHaveBeenCalledWith(expect.any(String), "compress", false);
  });

  it("TC-02: uses heavy-compress level", async () => {
    const tasks: CompressionTask[] = [
      {
        messageIndex: 0,
        entryType: "assistant",
        originalContent: "x".repeat(400),
        level: "heavy-compress",
        estimatedTokens: 100,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
      {
        messageIndex: 1,
        entryType: "user",
        originalContent: "y".repeat(800),
        level: "heavy-compress",
        estimatedTokens: 200,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
    ];

    const config = { concurrency: 10, maxAttempts: 4 };
    await processBatches(tasks, mockClient, config, defaultConfig);

    expect(mockClient.compress).toHaveBeenCalledWith(expect.any(String), "heavy-compress", false);
  });

  it("TC-06: retries failed compression with increased timeout", async () => {
    mockClient.compress
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("compressed on retry");

    const task: CompressionTask = {
      messageIndex: 0,
      entryType: "user",
      originalContent: "test message",
      level: "compress",
      estimatedTokens: 50,
      attempt: 0,
      timeoutMs: 5000,
      status: "pending",
    };

    const config = { concurrency: 10, maxAttempts: 4 };
    const results = await processBatches([task], mockClient, config, defaultConfig);

    expect(mockClient.compress).toHaveBeenCalledTimes(2);
    expect(results[0].status).toBe("success");
    expect(results[0].result).toBe("compressed on retry");
    expect(results[0].attempt).toBe(1);
  });

  it("TC-07: marks failed after max retries", async () => {
    mockClient.compress.mockRejectedValue(new Error("always fails"));

    const task: CompressionTask = {
      messageIndex: 0,
      entryType: "user",
      originalContent: "test",
      level: "compress",
      estimatedTokens: 50,
      attempt: 0,
      timeoutMs: 5000,
      status: "pending",
    };

    const config = { concurrency: 10, maxAttempts: 4 };
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const results = await processBatches([task], mockClient, config, defaultConfig);

    expect(mockClient.compress).toHaveBeenCalledTimes(4);
    expect(results[0].status).toBe("failed");
    expect(results[0].attempt).toBe(4);
    expect(results[0].error).toBeDefined();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("TC-13: processes in parallel batches", async () => {
    const tasks: CompressionTask[] = Array.from({ length: 15 }, (_, i) => ({
      messageIndex: i,
      entryType: "user" as const,
      originalContent: `Message ${i}`,
      level: "compress" as const,
      estimatedTokens: 50,
      attempt: 0,
      timeoutMs: 5000,
      status: "pending" as const,
    }));

    const config = { concurrency: 5, maxAttempts: 4 };
    const results = await processBatches(tasks, mockClient, config, defaultConfig);

    expect(results).toHaveLength(15);
    expect(results.every((t) => t.status === "success")).toBe(true);
    expect(mockClient.compress).toHaveBeenCalledTimes(15);
  });

  it("handles mixed success and failure with retries", async () => {
    // Task 0: succeeds first try
    // Task 1: fails twice, succeeds third
    // Task 2: succeeds first try
    mockClient.compress
      .mockResolvedValueOnce("success-0") // task 0, attempt 0
      .mockRejectedValueOnce(new Error("fail-1-0")) // task 1, attempt 0
      .mockResolvedValueOnce("success-2") // task 2, attempt 0
      .mockRejectedValueOnce(new Error("fail-1-1")) // task 1, attempt 1
      .mockResolvedValueOnce("success-1-2"); // task 1, attempt 2

    const tasks: CompressionTask[] = [
      {
        messageIndex: 0,
        entryType: "user",
        originalContent: "msg0",
        level: "compress",
        estimatedTokens: 50,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
      {
        messageIndex: 1,
        entryType: "assistant",
        originalContent: "msg1",
        level: "compress",
        estimatedTokens: 50,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
      {
        messageIndex: 2,
        entryType: "user",
        originalContent: "msg2",
        level: "compress",
        estimatedTokens: 50,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
    ];

    const config = { concurrency: 10, maxAttempts: 4 };
    const results = await processBatches(tasks, mockClient, config, defaultConfig);

    expect(results).toHaveLength(3);
    expect(results.every((t) => t.status === "success")).toBe(true);
    expect(mockClient.compress).toHaveBeenCalledTimes(5);
  });

  it("returns results sorted by messageIndex", async () => {
    // Even with retries shuffling order, results should be sorted
    mockClient.compress
      .mockRejectedValueOnce(new Error("fail")) // task 0 fails first
      .mockResolvedValueOnce("success-1") // task 1 succeeds
      .mockResolvedValueOnce("success-0"); // task 0 succeeds on retry

    const tasks: CompressionTask[] = [
      {
        messageIndex: 0,
        entryType: "user",
        originalContent: "msg0",
        level: "compress",
        estimatedTokens: 50,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
      {
        messageIndex: 1,
        entryType: "assistant",
        originalContent: "msg1",
        level: "compress",
        estimatedTokens: 50,
        attempt: 0,
        timeoutMs: 5000,
        status: "pending",
      },
    ];

    const config = { concurrency: 10, maxAttempts: 4 };
    const results = await processBatches(tasks, mockClient, config, defaultConfig);

    // Results should be in messageIndex order
    expect(results[0].messageIndex).toBe(0);
    expect(results[1].messageIndex).toBe(1);
  });

  it("handles empty task list", async () => {
    const config = { concurrency: 10, maxAttempts: 4 };
    const results = await processBatches([], mockClient, config, defaultConfig);

    expect(results).toHaveLength(0);
    expect(mockClient.compress).not.toHaveBeenCalled();
  });
});
