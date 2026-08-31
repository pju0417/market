/**
 * Milestone 6 (D-033): 4라운드부터 업종 전환/전문 이탈 판매가 실제로 엔진 phase handler를
 * 통해 동작하는지 검증한다. 단위 테스트(resolveCompanyIndustrySwitch/decideCompanyIndustrySwitch
 * 등)는 tests/economy/humanDecisions.test.ts, tests/npc/decisions.test.ts에 있다 — 여기서는
 * "phase handler가 그 함수들을 올바른 시점에, 올바른 조건에서만 호출하는가"에 집중한다.
 */
import { describe, expect, it } from "vitest";
import { MIN_ROUND_FOR_INDUSTRY_ACTIONS, NPC_STORE_SPECIALTY_DEVIATION_RULES } from "../../src/economy/config.js";
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
    ...overrides,
  };
}

const noopDecisionSource: HumanDecisionSource = {
  getCompanyInput: () => undefined,
  getStorePurchaseRequest: () => undefined,
  getHouseholdPurchaseRequest: () => undefined,
};

describe("runCompanyTurn: human-submitted industry switch (Milestone 6, D-033)", () => {
  it("ignores switchToCategoryId before MIN_ROUND_FOR_INDUSTRY_ACTIONS", async () => {
    const state = buildInitialGameState(1, 60001);
    const companyId = "student-1-company";
    state.currentRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS - 1;
    state.companies[companyId]!.productCategoryId = "food";
    state.companies[companyId]!.ledger.cash = 1000;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getCompanyInput: (id) => (id === companyId ? { quantity: 0, quality: 0.5, wholesalePrice: 5, switchToCategoryId: "toys" } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    await handlers["company-turn"]!(state);

    expect(state.companies[companyId]!.productCategoryId).toBe("food");
  });

  it("applies the switch (and produces using the new category's unit cost) from MIN_ROUND_FOR_INDUSTRY_ACTIONS onward", async () => {
    const state = buildInitialGameState(1, 60002);
    const companyId = "student-1-company";
    state.currentRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS;
    state.companies[companyId]!.productCategoryId = "food";
    state.companies[companyId]!.inventoryQuantity = 10;
    state.companies[companyId]!.quality = 0.5;
    state.companies[companyId]!.ledger.cash = 1000;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getCompanyInput: (id) => (id === companyId ? { quantity: 5, quality: 0.5, wholesalePrice: 5, switchToCategoryId: "toys" } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    await handlers["company-turn"]!(state);

    const company = state.companies[companyId]!;
    expect(company.productCategoryId).toBe("toys");
    // B안: switch resets carried-over inventory/quality to 0 before this round's production is
    // added, so post-turn inventory should be exactly this round's produced quantity (5), not 15.
    expect(company.inventoryQuantity).toBe(5);
    expect(company.lastIndustrySwitchRound).toBe(MIN_ROUND_FOR_INDUSTRY_ACTIONS);
  });

  it("does NOT invoke the bot industry-switch logic when a student submits production input without switchToCategoryId (regression guard)", async () => {
    const state = buildInitialGameState(1, 60003);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    company.productCategoryId = "food";
    company.ledger.cash = 1000;
    company.lastIndustrySwitchRound = null;
    state.currentRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS;
    // Conditions that WOULD trigger an NPC switch if (incorrectly) evaluated: 2 consecutive
    // rounds of losses, and wholesale data for a clearly more profitable category.
    state.roundMetrics = [
      makeRoundMetrics(1, { companyProfit: { [companyId]: -10 } }),
      makeRoundMetrics(2, { companyProfit: { [companyId]: -10 } }),
    ];
    state.wholesaleListings = [
      { id: "w-other", companyId: "some-other-company", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 },
    ];

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      // The student submitted a real decision (production input) but left switchToCategoryId
      // unset — this must be treated as "chose not to switch", not "no input at all".
      getCompanyInput: (id) => (id === companyId ? { quantity: 1, quality: 0.5, wholesalePrice: 5 } : undefined),
    };
    // rng always returns 0, which would pass the NPC switchProbability roll (0.5) if the bot
    // logic were (incorrectly) invoked for this student-controlled company.
    const handlers = createPhaseHandlers(() => 0, decisionSource);
    await handlers["company-turn"]!(state);

    expect(state.companies[companyId]!.productCategoryId).toBe("food");
  });

  it("a fully-bot company (no human input at all) can be switched by the NPC logic under favorable conditions", async () => {
    const state = buildInitialGameState(1, 60004);
    const companyId = "student-1-company"; // still "kind: student" but nobody submits for it below
    const company = state.companies[companyId]!;
    company.productCategoryId = "food";
    company.ledger.cash = 1000;
    company.lastIndustrySwitchRound = null;
    state.currentRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS;
    state.roundMetrics = [
      makeRoundMetrics(1, { companyProfit: { [companyId]: -10 } }),
      makeRoundMetrics(2, { companyProfit: { [companyId]: -10 } }),
    ];
    state.wholesaleListings = [
      { id: "w-other", companyId: "some-other-company", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 },
    ];

    // decisionSource itself is present, but getCompanyInput returns undefined for this company —
    // this is the "completely unattended" case that must still use the bot switch logic.
    const handlers = createPhaseHandlers(() => 0, noopDecisionSource);
    await handlers["company-turn"]!(state);

    expect(state.companies[companyId]!.productCategoryId).toBe("toys");
  });
});

describe("runStoreTurn: human-submitted selling-category switch (Milestone 6, D-033)", () => {
  it("ignores sellingCategoryId before MIN_ROUND_FOR_INDUSTRY_ACTIONS", async () => {
    const state = buildInitialGameState(1, 60005);
    const storeId = "student-1-store";
    state.currentRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS - 1;
    state.stores[storeId]!.specialtyCategoryId = "food";

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getStorePurchaseRequest: (id) => (id === storeId ? { purchases: [], sellingCategoryId: "toys" } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    await handlers["store-turn"]!(state);

    expect(state.stores[storeId]!.currentSellingCategoryId).toBeNull();
  });

  it("applies the switch from MIN_ROUND_FOR_INDUSTRY_ACTIONS onward and the resulting retail listing uses the new category", async () => {
    const state = buildInitialGameState(1, 60006);
    const storeId = "student-1-store";
    const store = state.stores[storeId]!;
    store.specialtyCategoryId = "food";
    store.inventoryQuantity = 10;
    store.inventoryQuality = 0.5;
    store.retailPrice = 20;
    state.currentRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getStorePurchaseRequest: (id) => (id === storeId ? { purchases: [], sellingCategoryId: "toys" } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    await handlers["store-turn"]!(state);

    expect(store.currentSellingCategoryId).toBe("toys");
    expect(store.inventoryQuantity).toBe(0); // B안: force-reset, no carryover
    expect(store.lastSellingCategoryChangeRound).toBe(MIN_ROUND_FOR_INDUSTRY_ACTIONS);
  });

  it("rejects a second human-requested switch while the cooldown is active", async () => {
    const state = buildInitialGameState(1, 60007);
    const storeId = "student-1-store";
    const store = state.stores[storeId]!;
    store.specialtyCategoryId = "food";
    store.currentSellingCategoryId = "toys";
    store.lastSellingCategoryChangeRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS;
    state.currentRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS + NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds - 1;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getStorePurchaseRequest: (id) => (id === storeId ? { purchases: [], sellingCategoryId: "electronics" } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    await handlers["store-turn"]!(state);

    expect(store.currentSellingCategoryId).toBe("toys");
  });

  it("does NOT invoke the bot specialty-deviation logic when a student submits purchases without sellingCategoryId (regression guard)", async () => {
    const state = buildInitialGameState(1, 60008);
    const storeId = "student-1-store";
    const store = state.stores[storeId]!;
    store.specialtyCategoryId = "food";
    store.ledger.cash = 500;
    state.currentRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS;
    state.roundMetrics = [
      makeRoundMetrics(1, { storeProfit: { [storeId]: -10 } }),
      makeRoundMetrics(2, { storeProfit: { [storeId]: -10 } }),
    ];
    state.wholesaleListings = [
      { id: "w-toys", companyId: "some-company", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 5 },
    ];
    state.retailListings = [
      { id: "r-toys", storeId: "some-other-store", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 20 },
    ];

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      // Real submission (explicit empty purchase list), but no sellingCategoryId — must be
      // treated as "chose not to switch".
      getStorePurchaseRequest: (id) => (id === storeId ? { purchases: [] } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0, decisionSource);
    await handlers["store-turn"]!(state);

    expect(store.currentSellingCategoryId).toBeNull();
  });
});
