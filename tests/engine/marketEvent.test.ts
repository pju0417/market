/**
 * Milestone 6 제안 C (docs/DECISIONS.md D-035): "runCompanyTurn이 D-033 확률적 전환과 이번
 * 결정론적 전환(decideCompanyMarketEventSwitch)을 올바른 조건에서, 상호 배타적으로만
 * 호출하는가"에 집중한다. 단위 테스트(각 함수 자체의 로직)는 tests/npc/decisions.test.ts,
 * tests/economy/marketEvents.test.ts에 있다. tests/engine/industrySwitch.test.ts와 같은 패턴을
 * 재사용한다.
 */
import { describe, expect, it } from "vitest";
import { companyUnitCost, COSTS, DISTRICTS, industrySwitchCost } from "../../src/economy/config.js";
import { getActiveMarketEvent } from "../../src/economy/marketEvents.js";
import { buildInitialGameState, createPhaseHandlers, type HumanDecisionSource } from "../../src/engine/simulateGame.js";
import type { RoundMetrics } from "../../src/types/domain.js";

function makeRoundMetrics(round: number, overrides: Partial<RoundMetrics> = {}): RoundMetrics {
  return {
    round,
    companyProfit: {},
    storeProfit: {},
    companyMarketShare: {},
    storeMarketShare: {},
    totalWholesaleVolume: 0,
    totalWholesaleValue: 0,
    totalRetailVolume: 0,
    totalRetailValue: 0,
    averageHouseholdSatisfaction: 0,
    companyUnitsProduced: {},
    companyUnitsSoldWholesale: {},
    companyRevenue: {},
    storeUnitsPurchased: {},
    storeWholesaleSpend: {},
    storeUnitsSoldRetail: {},
    storeRevenue: {},
    storeSupplierCount: {},
    storeTopSupplierSpendShare: {},
    householdSpend: {},
    householdUnitsBought: {},
    householdCategoryCount: {},
    householdTopCategorySpendShare: {},
    householdEssentialCategoriesMissed: {},
    wholesaleCategoryClearing: {},
    retailCategoryClearing: {},
    ...overrides,
  };
}

const noopDecisionSource: HumanDecisionSource = {
  getCompanyInput: () => undefined,
  getStorePurchaseRequest: () => undefined,
  getHouseholdPurchaseRequest: () => undefined,
  getStoreSubmissionReceivedAt: () => undefined,
  getHouseholdSubmissionReceivedAt: () => undefined,
  getPhaseStartedAt: () => 0,
  getSubmissionTimeoutSettings: () => ({ enabled: false, timeoutMs: 120_000, npcGraduatedEntryEnabled: true }),
};

// seed=70004: round 6 and round 7 both resolve the event category to "food" (verified offline via
// getActiveMarketEvent) -- picked purely for test convenience, no significance to the value itself.
const EVENT_SEED = 70004;

describe("runCompanyTurn: market event switch vs D-033 industry switch are mutually exclusive (Milestone 6, D-035)", () => {
  it("uses the deterministic market-event switch (not the probabilistic D-033 switch) for a fully-bot company in the event category, even when D-033's own trigger conditions are also satisfied", async () => {
    const state = buildInitialGameState(1, EVENT_SEED);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    const event = getActiveMarketEvent(state.config.rngSeed, 6)!;
    expect(event.categoryId).toBe("food");

    state.currentRound = 6;
    company.productCategoryId = event.categoryId;
    company.districtId = "downtown";
    company.strategyId = "stable";
    company.ledger.cash = 1000;
    company.lastIndustrySwitchRound = null;
    // D-033 trigger conditions: minRound satisfied (6 >= 4), 2 consecutive negative-profit rounds.
    state.roundMetrics = [
      makeRoundMetrics(4, { companyProfit: { [companyId]: -10 } }),
      makeRoundMetrics(5, { companyProfit: { [companyId]: -10 } }),
    ];

    const foodUnitCostDuringEvent = companyUnitCost("food", "downtown") * event.costMultiplier;
    const toysUnitCost = companyUnitCost("toys", "downtown");
    const toysSwitchCost = industrySwitchCost("food", "toys");
    // toys has a *positive* plain margin (price - unitCost = +1), so D-033's margin-based picker
    // would definitely switch to it if it were (incorrectly) invoked here (best-margin candidate,
    // margin > -Infinity, cost affordable, and rng below is rigged to always pass the probability
    // roll). But D-035's full series-profit comparison finds it not worth the switch cost over the
    // remaining event rounds (see the equivalent unit-test numbers in tests/npc/decisions.test.ts).
    state.wholesaleListings = [
      { id: "w-food", companyId: "other", categoryId: "food", quantityAvailable: 100, quality: 0.5, price: foodUnitCostDuringEvent },
      { id: "w-toys", companyId: "other", categoryId: "toys", quantityAvailable: 100, quality: 0.5, price: toysUnitCost + 1 },
    ];
    expect(toysSwitchCost).toBeLessThan(company.ledger.cash);

    // rng() === 0 always passes D-033's switchProbability roll (0 < 0.5) -- if D-033 were invoked
    // instead of D-035, this company would switch to toys.
    const handlers = createPhaseHandlers(() => 0, noopDecisionSource);
    await handlers["company-turn"]!(state);

    // D-035 correctly decides staying is better than switching to toys here, proving the D-033
    // path was never taken for this event-category company.
    expect(company.productCategoryId).toBe("food");
  });

  it("still uses the ordinary D-033 probabilistic switch for a fully-bot company NOT in the event category", async () => {
    const state = buildInitialGameState(1, EVENT_SEED);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    const event = getActiveMarketEvent(state.config.rngSeed, 6)!;
    expect(event.categoryId).toBe("food"); // this company will be in "toys", not the event category

    state.currentRound = 6;
    company.productCategoryId = "toys";
    company.districtId = "downtown";
    company.ledger.cash = 1000;
    company.lastIndustrySwitchRound = null;
    state.roundMetrics = [
      makeRoundMetrics(4, { companyProfit: { [companyId]: -10 } }),
      makeRoundMetrics(5, { companyProfit: { [companyId]: -10 } }),
    ];
    state.wholesaleListings = [
      { id: "w-food", companyId: "other", categoryId: "food", quantityAvailable: 100, quality: 0.5, price: 1000 },
    ];

    const handlers = createPhaseHandlers(() => 0, noopDecisionSource);
    await handlers["company-turn"]!(state);

    // D-033's ordinary margin-based switch applies normally outside the event category.
    expect(company.productCategoryId).toBe("food");
  });

  it("never invokes either bot switch function for a company whose student submitted production input (regression guard, event round)", async () => {
    const state = buildInitialGameState(1, EVENT_SEED);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    const event = getActiveMarketEvent(state.config.rngSeed, 6)!;

    state.currentRound = 6;
    company.productCategoryId = event.categoryId;
    company.ledger.cash = 1000;
    company.lastIndustrySwitchRound = null;
    // Conditions that would trigger a switch under either bot path if (incorrectly) evaluated.
    state.roundMetrics = [
      makeRoundMetrics(4, { companyProfit: { [companyId]: -10 } }),
      makeRoundMetrics(5, { companyProfit: { [companyId]: -10 } }),
    ];
    state.wholesaleListings = [
      { id: "w-other", companyId: "some-other-company", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 },
    ];

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getCompanyInput: (id) => (id === companyId ? { quantity: 1, quality: 0.5, wholesalePrice: 5 } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0, decisionSource);
    await handlers["company-turn"]!(state);

    expect(company.productCategoryId).toBe(event.categoryId);
  });
});

describe("runCompanyTurn: market events never affect rounds 1-5 (Milestone 6, D-035)", () => {
  it("getActiveMarketEvent returns undefined for rounds 1 through 5 regardless of seed", () => {
    for (const round of [1, 2, 3, 4, 5]) {
      expect(getActiveMarketEvent(EVENT_SEED, round)).toBeUndefined();
    }
  });

  it("produces using the plain (unmultiplied) unit cost in round 5, identical to pre-Milestone-6-market-event behavior", async () => {
    const state = buildInitialGameState(1, EVENT_SEED);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    company.productCategoryId = "food";
    company.districtId = "downtown";
    company.ledger.cash = 1000;
    state.currentRound = 5;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getCompanyInput: (id) => (id === companyId ? { quantity: 10, quality: 0.5, wholesalePrice: 5 } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    await handlers["company-turn"]!(state);

    const fixedCost = COSTS.baseLaborCostCompany + COSTS.baseRentCompany * DISTRICTS.downtown.rentMultiplier;
    const plainUnitCost = companyUnitCost("food", "downtown");
    const expectedCash = 1000 - fixedCost - 10 * plainUnitCost;
    expect(company.ledger.cash).toBeCloseTo(expectedCash, 10);
    expect(company.inventoryQuantity).toBe(10);
  });
});
