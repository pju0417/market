/**
 * Milestone 6 제안 C (docs/DECISIONS.md D-039): 유행 이벤트 순수 함수 단위 테스트.
 */
import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES } from "../../src/economy/config.js";
import { getActiveMarketEvent } from "../../src/economy/marketEvents.js";
import { createRng } from "../../src/economy/rng.js";
import { getActiveTrendEvent, trendPriorityBonusFor } from "../../src/economy/trendEvent.js";

describe("getActiveTrendEvent", () => {
  it("returns undefined outside round 6", () => {
    for (const round of [1, 2, 3, 4, 5, 7, 8, 9]) {
      expect(getActiveTrendEvent(42, round)).toBeUndefined();
    }
  });

  it("is pure: the same (rngSeed, round) always yields the same category", () => {
    const first = getActiveTrendEvent(42, 6);
    const second = getActiveTrendEvent(42, 6);
    const third = getActiveTrendEvent(42, 6);
    expect(first).toBeDefined();
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("returns a valid category with the configured priority bonus for round 6", () => {
    const roundSix = getActiveTrendEvent(42, 6);
    expect(roundSix).toBeDefined();
    expect(PRODUCT_CATEGORIES).toContain(roundSix!.categoryId);
    expect(roundSix!.priorityBonus).toBe(0.1);
  });

  it("different rngSeeds can produce different categories for the same round", () => {
    const seeds = Array.from({ length: 50 }, (_, i) => i);
    const categories = new Set(seeds.map((seed) => getActiveTrendEvent(seed, 6)!.categoryId));
    expect(categories.size).toBeGreaterThan(1);
  });
});

describe("trendPriorityBonusFor", () => {
  it("returns the event bonus when the category matches", () => {
    const event = { categoryId: "food" as const, priorityBonus: 0.1 };
    expect(trendPriorityBonusFor("food", event)).toBe(0.1);
  });

  it("returns 0 when the category doesn't match the active event", () => {
    const event = { categoryId: "food" as const, priorityBonus: 0.1 };
    expect(trendPriorityBonusFor("toys", event)).toBe(0);
  });

  it("returns 0 when there is no active event", () => {
    expect(trendPriorityBonusFor("food", undefined)).toBe(0);
  });
});

describe("rng stream isolation from getActiveMarketEvent (regression guard)", () => {
  it("consuming both getActiveMarketEvent and getActiveTrendEvent for the same (rngSeed, round=6) doesn't change the gameplay rng (rngSeed+1) sequence", () => {
    const rngSeed = 42;
    const round = 6;

    const gameplayRngBaseline = createRng(rngSeed + 1);
    const baselineDraws = Array.from({ length: 20 }, () => gameplayRngBaseline());

    // Calling both event functions (in either order) must not perturb the gameplay stream —
    // each event function creates and consumes its own independent rng instance.
    getActiveMarketEvent(rngSeed, round);
    getActiveTrendEvent(rngSeed, round);
    const gameplayRngAfterEvents = createRng(rngSeed + 1);
    const drawsAfterEvents = Array.from({ length: 20 }, () => gameplayRngAfterEvents());

    getActiveTrendEvent(rngSeed, round);
    getActiveMarketEvent(rngSeed, round);
    const gameplayRngAfterReversedOrder = createRng(rngSeed + 1);
    const drawsAfterReversedOrder = Array.from({ length: 20 }, () => gameplayRngAfterReversedOrder());

    expect(drawsAfterEvents).toEqual(baselineDraws);
    expect(drawsAfterReversedOrder).toEqual(baselineDraws);
  });
});
