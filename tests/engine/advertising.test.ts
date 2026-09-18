/**
 * Milestone 6 (D-040): 5라운드부터 광고가 실제로 엔진 phase handler를 통해 동작하는지
 * 검증한다. 단위 테스트(applyAdvertisingDecision/decideCompanyAdvertising 등)는
 * tests/economy/advertising.test.ts, tests/economy/humanDecisions.test.ts,
 * tests/npc/decisions.test.ts에 있다 — 여기서는 "phase handler가 그 함수들을 올바른 시점에,
 * 올바른 조건에서만 호출하는가"와 "비용 차감이 생산량 계산보다 먼저 일어나는가"(D-033류
 * 재발 방지)에 집중한다.
 */
import { describe, expect, it } from "vitest";
import { companyUnitCost, COSTS, MIN_ROUND_FOR_ADVERTISING } from "../../src/economy/config.js";
import { computeCompanyFixedCost, computeStoreFixedCost } from "../../src/economy/costs.js";
import { buildInitialGameState, createPhaseHandlers, type HumanDecisionSource } from "../../src/engine/simulateGame.js";

const noopDecisionSource: HumanDecisionSource = {
  getCompanyInput: () => undefined,
  getStorePurchaseRequest: () => undefined,
  getHouseholdPurchaseRequest: () => undefined,
  getStoreSubmissionReceivedAt: () => undefined,
  getHouseholdSubmissionReceivedAt: () => undefined,
  getPhaseStartedAt: () => 0,
  getSubmissionTimeoutSettings: () => ({ enabled: false, timeoutMs: 120_000, npcGraduatedEntryEnabled: true }),
};

describe("runCompanyTurn: human-submitted advertising (Milestone 6, D-040)", () => {
  it("charges exactly advertisingCostPerRound and sets isAdvertisingActive when submitted from MIN_ROUND_FOR_ADVERTISING onward", async () => {
    const state = buildInitialGameState(1, 70001);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    company.productCategoryId = "food";
    company.ledger.cash = 1000;
    state.currentRound = MIN_ROUND_FOR_ADVERTISING;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getCompanyInput: (id) => (id === companyId ? { quantity: 1, quality: 0.5, wholesalePrice: 5, advertise: true } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    const cashBeforeTurn = company.ledger.cash;
    const fixedCost = computeCompanyFixedCost(company.districtId);
    await handlers["company-turn"]!(state);

    expect(company.isAdvertisingActive).toBe(true);
    const unitCost = companyUnitCost("food", company.districtId);
    expect(company.ledger.cash).toBe(cashBeforeTurn - fixedCost - COSTS.advertisingCostPerRound - 1 * unitCost);
  });

  it("ignores advertise=true before MIN_ROUND_FOR_ADVERTISING (no charge, flag stays false)", async () => {
    const state = buildInitialGameState(1, 70002);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    company.productCategoryId = "food";
    company.ledger.cash = 1000;
    state.currentRound = MIN_ROUND_FOR_ADVERTISING - 1;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getCompanyInput: (id) => (id === companyId ? { quantity: 0, quality: 0.5, wholesalePrice: 5, advertise: true } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    const fixedCost = computeCompanyFixedCost(company.districtId);
    const cashBeforeTurn = company.ledger.cash;
    await handlers["company-turn"]!(state);

    expect(company.isAdvertisingActive).toBe(false);
    expect(company.ledger.cash).toBe(cashBeforeTurn - fixedCost);
  });

  it("a fully-bot company (no human input) auto-advertises according to its strategy preset", async () => {
    const state = buildInitialGameState(1, 70003);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    company.productCategoryId = "food";
    company.strategyId = "aggressive"; // COMPANY_STRATEGY_PRESETS.aggressive.advertises === true
    company.ledger.cash = 1000;
    state.currentRound = MIN_ROUND_FOR_ADVERTISING;

    const handlers = createPhaseHandlers(() => 0.5, noopDecisionSource);
    await handlers["company-turn"]!(state);

    expect(company.isAdvertisingActive).toBe(true);
  });

  it("a fully-bot company with a non-advertising strategy does not advertise", async () => {
    const state = buildInitialGameState(1, 70004);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    company.productCategoryId = "food";
    company.strategyId = "stable"; // COMPANY_STRATEGY_PRESETS.stable.advertises === false
    company.ledger.cash = 1000;
    state.currentRound = MIN_ROUND_FOR_ADVERTISING;

    const handlers = createPhaseHandlers(() => 0.5, noopDecisionSource);
    await handlers["company-turn"]!(state);

    expect(company.isAdvertisingActive).toBe(false);
  });

  it("re-imposition regression: a company that advertised last round automatically stops advertising this round unless it submits again", async () => {
    const state = buildInitialGameState(1, 70005);
    const companyId = "student-1-company";
    const company = state.companies[companyId]!;
    company.productCategoryId = "food";
    company.ledger.cash = 1000;
    company.isAdvertisingActive = true; // carried over from a prior round's confirmed state
    state.currentRound = MIN_ROUND_FOR_ADVERTISING;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getCompanyInput: (id) => (id === companyId ? { quantity: 0, quality: 0.5, wholesalePrice: 5 } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    await handlers["company-turn"]!(state);

    expect(company.isAdvertisingActive).toBe(false);
  });

  it("deducts the advertising fee BEFORE computing affordable production quantity (D-033류 재발 방지): production shrinks by exactly the units the ad fee would have bought", async () => {
    const unitCost = companyUnitCost("food", "industrial");
    const cashAfterFixedCost = 1000;
    const expectedQuantityWithoutAd = Math.floor(cashAfterFixedCost / unitCost);
    const expectedQuantityWithAd = Math.floor((cashAfterFixedCost - COSTS.advertisingCostPerRound) / unitCost);
    // Sanity: the fee must actually be able to buy at least one fewer unit here, otherwise this
    // test wouldn't actually exercise the ordering bug.
    expect(expectedQuantityWithAd).toBeLessThan(expectedQuantityWithoutAd);

    async function runWithAdvertise(advertise: boolean): Promise<number> {
      const state = buildInitialGameState(1, 70006);
      const companyId = "student-1-company";
      const company = state.companies[companyId]!;
      company.productCategoryId = "food";
      company.districtId = "industrial";
      company.ledger.cash = computeCompanyFixedCost("industrial") + cashAfterFixedCost;
      state.currentRound = MIN_ROUND_FOR_ADVERTISING;

      const decisionSource: HumanDecisionSource = {
        ...noopDecisionSource,
        getCompanyInput: (id) =>
          id === companyId ? { quantity: 9999, quality: 0.5, wholesalePrice: 5, advertise } : undefined,
      };
      const handlers = createPhaseHandlers(() => 0.5, decisionSource);
      await handlers["company-turn"]!(state);
      return company.inventoryQuantity;
    }

    expect(await runWithAdvertise(false)).toBe(expectedQuantityWithoutAd);
    expect(await runWithAdvertise(true)).toBe(expectedQuantityWithAd);
  });
});

describe("runStoreTurn: human-submitted advertising (Milestone 6, D-040)", () => {
  it("charges exactly advertisingCostPerRound and sets isAdvertisingActive when submitted from MIN_ROUND_FOR_ADVERTISING onward", async () => {
    const state = buildInitialGameState(1, 70007);
    const storeId = "student-1-store";
    const store = state.stores[storeId]!;
    state.currentRound = MIN_ROUND_FOR_ADVERTISING;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getStorePurchaseRequest: (id) => (id === storeId ? { advertise: true } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    const cashBeforeTurn = store.ledger.cash;
    const fixedCost = computeStoreFixedCost(store.districtId);
    await handlers["store-turn"]!(state);

    expect(store.isAdvertisingActive).toBe(true);
    expect(store.ledger.cash).toBe(cashBeforeTurn - fixedCost - COSTS.advertisingCostPerRound);
  });

  it("ignores advertise=true before MIN_ROUND_FOR_ADVERTISING", async () => {
    const state = buildInitialGameState(1, 70008);
    const storeId = "student-1-store";
    const store = state.stores[storeId]!;
    state.currentRound = MIN_ROUND_FOR_ADVERTISING - 1;

    const decisionSource: HumanDecisionSource = {
      ...noopDecisionSource,
      getStorePurchaseRequest: (id) => (id === storeId ? { advertise: true } : undefined),
    };
    const handlers = createPhaseHandlers(() => 0.5, decisionSource);
    const fixedCost = computeStoreFixedCost(store.districtId);
    const cashBeforeTurn = store.ledger.cash;
    await handlers["store-turn"]!(state);

    expect(store.isAdvertisingActive).toBe(false);
    expect(store.ledger.cash).toBe(cashBeforeTurn - fixedCost);
  });

  it("a fully-bot store (no human input) auto-advertises according to its strategy preset", async () => {
    const state = buildInitialGameState(1, 70009);
    const storeId = "student-1-store";
    const store = state.stores[storeId]!;
    store.strategyId = "premium"; // STORE_STRATEGY_PRESETS.premium.advertises === true
    state.currentRound = MIN_ROUND_FOR_ADVERTISING;

    const handlers = createPhaseHandlers(() => 0.5, noopDecisionSource);
    await handlers["store-turn"]!(state);

    expect(store.isAdvertisingActive).toBe(true);
  });

  it("a fully-bot store with a non-advertising strategy does not advertise", async () => {
    const state = buildInitialGameState(1, 70010);
    const storeId = "student-1-store";
    const store = state.stores[storeId]!;
    store.strategyId = "low-cost"; // STORE_STRATEGY_PRESETS["low-cost"].advertises === false
    state.currentRound = MIN_ROUND_FOR_ADVERTISING;

    const handlers = createPhaseHandlers(() => 0.5, noopDecisionSource);
    await handlers["store-turn"]!(state);

    expect(store.isAdvertisingActive).toBe(false);
  });
});
