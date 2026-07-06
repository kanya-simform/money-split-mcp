import { describe, it, expect } from "vitest";
import { splitEvenlyCents, dollarsToCents, centsToDollars } from "../src/services/money.js";

describe("splitEvenlyCents", () => {
  it("splits evenly divisible amounts equally", () => {
    expect(splitEvenlyCents(900, 3)).toEqual([300, 300, 300]);
  });

  it("distributes leftover pennies to the first participants", () => {
    expect(splitEvenlyCents(1000, 3)).toEqual([334, 333, 333]);
  });

  it("always sums back to the original total", () => {
    for (const [total, count] of [[1000, 3], [1, 7], [9999, 4], [500, 1]] as const) {
      const shares = splitEvenlyCents(total, count);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      expect(shares).toHaveLength(count);
    }
  });

  it("throws for zero or negative participant counts", () => {
    expect(() => splitEvenlyCents(100, 0)).toThrow();
    expect(() => splitEvenlyCents(100, -1)).toThrow();
  });
});

describe("dollars/cents conversion", () => {
  it("round-trips cleanly", () => {
    expect(dollarsToCents(10.5)).toBe(1050);
    expect(centsToDollars(1050)).toBe(10.5);
  });

  it("avoids floating point drift on common amounts", () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
  });
});
