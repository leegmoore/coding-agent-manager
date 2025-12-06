import { describe, it, expect } from "vitest";
import {
  calculateBandHeight,
  formatTokenCount,
  truncateToolContent,
  exceedsScale,
  validateScaleInput,
  validateTurnInput,
  COLORS,
  SCALE_MIN,
  SCALE_MAX,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
} from "../../../public/js/lib/session-detail.js";

describe("Constants", () => {
  describe("COLORS", () => {
    it("has user color as blue hex", () => {
      expect(COLORS.user).toBe("#3B82F6");
    });

    it("has assistant color as green hex", () => {
      expect(COLORS.assistant).toBe("#22C55E");
    });

    it("has thinking color as purple hex", () => {
      expect(COLORS.thinking).toBe("#A855F7");
    });

    it("has tool color as orange hex", () => {
      expect(COLORS.tool).toBe("#F97316");
    });
  });

  describe("SCALE constants", () => {
    it("has SCALE_MIN as 50", () => {
      expect(SCALE_MIN).toBe(50);
    });

    it("has SCALE_MAX as 2000", () => {
      expect(SCALE_MAX).toBe(2000);
    });
  });

  describe("Dimension constants", () => {
    it("has DEFAULT_WIDTH as 800", () => {
      expect(DEFAULT_WIDTH).toBe(800);
    });

    it("has DEFAULT_HEIGHT as 500", () => {
      expect(DEFAULT_HEIGHT).toBe(500);
    });
  });
});

describe("calculateBandHeight", () => {
  it("calculates proportional height", () => {
    expect(calculateBandHeight(1000, 2000, 500)).toBe(250);
  });

  it("returns 0 when maxTokens is 0", () => {
    expect(calculateBandHeight(1000, 0, 500)).toBe(0);
  });

  it("returns full height", () => {
    expect(calculateBandHeight(2000, 2000, 500)).toBe(500);
  });
});

describe("formatTokenCount", () => {
  it("formats thousands with k suffix (rounded)", () => {
    expect(formatTokenCount(1500)).toBe("2k");
    expect(formatTokenCount(50000)).toBe("50k");
  });

  it("formats millions with M suffix", () => {
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
  });

  it("returns number as string for small values", () => {
    expect(formatTokenCount(500)).toBe("500");
  });
});

describe("truncateToolContent", () => {
  it("returns content unchanged if within limit", () => {
    expect(truncateToolContent("line1\nline2", 2)).toBe("line1\nline2");
  });

  it("truncates with ellipsis", () => {
    expect(truncateToolContent("line1\nline2\nline3", 2)).toBe("line1\nline2\n...");
  });

  it("handles empty content", () => {
    expect(truncateToolContent("", 2)).toBe("");
  });
});

describe("exceedsScale", () => {
  it("returns true when total exceeds scale", () => {
    expect(exceedsScale({ total: 150000 }, 100)).toBe(true);
  });

  it("returns false when total is within scale", () => {
    expect(exceedsScale({ total: 50000 }, 100)).toBe(false);
  });
});

describe("validateScaleInput", () => {
  it("clamps to min", () => {
    expect(validateScaleInput(25)).toBe(50);
  });

  it("clamps to max", () => {
    expect(validateScaleInput(3000)).toBe(2000);
  });

  it("accepts valid values", () => {
    expect(validateScaleInput(200)).toBe(200);
  });

  it("handles NaN", () => {
    expect(validateScaleInput("abc")).toBe(50);
  });
});

describe("validateTurnInput", () => {
  it("clamps to 0", () => {
    expect(validateTurnInput(-5, 20)).toBe(0);
  });

  it("clamps to max", () => {
    expect(validateTurnInput(50, 20)).toBe(20);
  });

  it("accepts valid values", () => {
    expect(validateTurnInput(10, 20)).toBe(10);
  });
});

