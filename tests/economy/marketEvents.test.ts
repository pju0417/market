/**
 * Milestone 6 제안 C (docs/DECISIONS.md D-035): 시장 변화 이벤트("원자재비 변동") 순수 함수
 * 단위 테스트.
 */
import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES } from "../../src/economy/config.js";
import {
  countRemainingMarketEventRounds,
  getActiveMarketEvent,
  marketEventCostMultiplierFor,
} from "../../src/economy/marketEvents.js";

describe("getActiveMarketEvent", () => {
  it("returns undefined outside rounds 6 and 7", () => {
    for (const round of [1, 2, 3, 4, 5, 8, 9]) {
      expect(getActiveMarketEvent(42, round)).toBeUndefined();
    }
  });

  it("is pure: the same (rngSeed, round) always yields the same category", () => {
    const first = getActiveMarketEvent(42, 6);
    const second = getActiveMarketEvent(42, 6);
    const third = getActiveMarketEvent(42, 6);
    expect(first).toBeDefined();
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("returns a valid category with the configured cost multiplier for rounds 6 and 7", () => {
    const roundSix = getActiveMarketEvent(42, 6);
    const roundSeven = getActiveMarketEvent(42, 7);
    expect(roundSix).toBeDefined();
    expect(roundSeven).toBeDefined();
    expect(PRODUCT_CATEGORIES).toContain(roundSix!.categoryId);
    expect(PRODUCT_CATEGORIES).toContain(roundSeven!.categoryId);
    expect(roundSix!.costMultiplier).toBe(1.3);
    expect(roundSeven!.costMultiplier).toBe(1.3);
  });

  it("can produce different categories for round 6 vs round 7 under the same seed (not hardcoded to always match)", () => {
    // Scan a range of seeds; at least one must show round 6 and round 7 differing, since rounds
    // are re-rolled independently (derived rng seed includes `round`).
    const seeds = Array.from({ length: 50 }, (_, i) => i);
    const sawDifference = seeds.some((seed) => {
      const six = getActiveMarketEvent(seed, 6)!;
      const seven = getActiveMarketEvent(seed, 7)!;
      return six.categoryId !== seven.categoryId;
    });
    expect(sawDifference).toBe(true);
  });

  it("different rngSeeds can produce different categories for the same round", () => {
    const seeds = Array.from({ length: 50 }, (_, i) => i);
    const categories = new Set(seeds.map((seed) => getActiveMarketEvent(seed, 6)!.categoryId));
    expect(categories.size).toBeGreaterThan(1);
  });
});

describe("countRemainingMarketEventRounds", () => {
  it("counts event rounds at or after fromRound", () => {
    expect(countRemainingMarketEventRounds(6)).toBe(2);
    expect(countRemainingMarketEventRounds(7)).toBe(1);
    expect(countRemainingMarketEventRounds(5)).toBe(0);
    expect(countRemainingMarketEventRounds(1)).toBe(0);
    expect(countRemainingMarketEventRounds(8)).toBe(0);
  });
});

describe("marketEventCostMultiplierFor", () => {
  it("returns the event multiplier when the category matches", () => {
    const event = { categoryId: "food" as const, costMultiplier: 1.3 };
    expect(marketEventCostMultiplierFor("food", event)).toBe(1.3);
  });

  it("returns 1 when the category doesn't match the active event", () => {
    const event = { categoryId: "food" as const, costMultiplier: 1.3 };
    expect(marketEventCostMultiplierFor("toys", event)).toBe(1);
  });

  it("returns 1 when there is no active event", () => {
    expect(marketEventCostMultiplierFor("food", undefined)).toBe(1);
  });
});
