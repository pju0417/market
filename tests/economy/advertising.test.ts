/**
 * 광고 (Milestone 6, docs/DECISIONS.md D-040) 순수 함수 단위 테스트.
 */
import { describe, expect, it } from "vitest";
import { ADVERTISING_PRIORITY_BONUS, COSTS, MIN_ROUND_FOR_ADVERTISING } from "../../src/economy/config.js";
import { advertisingScoreBonus, applyAdvertisingDecision, isAdvertisingUnlocked } from "../../src/economy/advertising.js";
import type { Ledger } from "../../src/types/domain.js";

function makeEntity(cash: number, isAdvertisingActive = false): { ledger: Ledger; isAdvertisingActive: boolean } {
  return { ledger: { cash, cumulativeProfit: 0 }, isAdvertisingActive };
}

describe("isAdvertisingUnlocked", () => {
  it("is false before MIN_ROUND_FOR_ADVERTISING and true from it onward", () => {
    expect(isAdvertisingUnlocked(MIN_ROUND_FOR_ADVERTISING - 1)).toBe(false);
    expect(isAdvertisingUnlocked(MIN_ROUND_FOR_ADVERTISING)).toBe(true);
    expect(isAdvertisingUnlocked(MIN_ROUND_FOR_ADVERTISING + 1)).toBe(true);
  });
});

describe("applyAdvertisingDecision", () => {
  it("ignores a request before MIN_ROUND_FOR_ADVERTISING, charging nothing", () => {
    const entity = makeEntity(1000);
    applyAdvertisingDecision(entity, MIN_ROUND_FOR_ADVERTISING - 1, true);

    expect(entity.isAdvertisingActive).toBe(false);
    expect(entity.ledger.cash).toBe(1000);
  });

  it("ignores wantsToAdvertise=false, charging nothing", () => {
    const entity = makeEntity(1000);
    applyAdvertisingDecision(entity, MIN_ROUND_FOR_ADVERTISING, false);

    expect(entity.isAdvertisingActive).toBe(false);
    expect(entity.ledger.cash).toBe(1000);
  });

  it("silently does nothing (no charge) when cash is insufficient", () => {
    const entity = makeEntity(COSTS.advertisingCostPerRound - 1);
    applyAdvertisingDecision(entity, MIN_ROUND_FOR_ADVERTISING, true);

    expect(entity.isAdvertisingActive).toBe(false);
    expect(entity.ledger.cash).toBe(COSTS.advertisingCostPerRound - 1);
  });

  it("charges exactly advertisingCostPerRound and sets the flag on a valid request", () => {
    const entity = makeEntity(1000);
    applyAdvertisingDecision(entity, MIN_ROUND_FOR_ADVERTISING, true);

    expect(entity.isAdvertisingActive).toBe(true);
    expect(entity.ledger.cash).toBe(1000 - COSTS.advertisingCostPerRound);
  });

  it("re-charges every round it is requested — repeated advertising costs the fee again each time", () => {
    const entity = makeEntity(1000);
    applyAdvertisingDecision(entity, MIN_ROUND_FOR_ADVERTISING, true);
    applyAdvertisingDecision(entity, MIN_ROUND_FOR_ADVERTISING + 1, true);

    expect(entity.isAdvertisingActive).toBe(true);
    expect(entity.ledger.cash).toBe(1000 - COSTS.advertisingCostPerRound * 2);
  });

  it("re-imposition regression: an entity left isAdvertisingActive=true from a prior round resets to false when this round's request is false", () => {
    const entity = makeEntity(1000, true);
    applyAdvertisingDecision(entity, MIN_ROUND_FOR_ADVERTISING + 1, false);

    expect(entity.isAdvertisingActive).toBe(false);
    expect(entity.ledger.cash).toBe(1000); // no charge, no refund
  });

  it("re-imposition regression: an entity left isAdvertisingActive=true from a prior round resets to false first, then re-enables if requested again this round", () => {
    const entity = makeEntity(1000, true);
    applyAdvertisingDecision(entity, MIN_ROUND_FOR_ADVERTISING + 1, true);

    expect(entity.isAdvertisingActive).toBe(true);
    expect(entity.ledger.cash).toBe(1000 - COSTS.advertisingCostPerRound);
  });
});

describe("advertisingScoreBonus", () => {
  it("returns ADVERTISING_PRIORITY_BONUS when the seller is advertising", () => {
    expect(advertisingScoreBonus(true)).toBe(ADVERTISING_PRIORITY_BONUS);
  });

  it("returns 0 when the seller is not advertising", () => {
    expect(advertisingScoreBonus(false)).toBe(0);
  });
});
