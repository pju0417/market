import { describe, expect, it } from "vitest";
import { analyzeStoreTurn } from "../../src/advisor/storeAdvisor.js";
import { DEFAULT_ADVISOR_RULES } from "../../src/advisor/rules.js";
import type {
  CompanyState,
  GameState,
  HouseholdState,
  RoundMetrics,
  StoreState,
} from "../../src/types/domain.js";

function makeStore(overrides: Partial<StoreState> = {}): StoreState {
  return {
    id: "s1",
    ownerId: "student-1",
    kind: "student",
    districtId: "downtown",
    ledger: { cash: 500, cumulativeProfit: 0 },
    strategyId: "stable",
    specialtyCategoryId: "food",
    currentSellingCategoryId: null,
    inventoryQuantity: 0,
    inventoryQuality: 0.5,
    retailPrice: 20,
    lastSellingCategoryChangeRound: null,
    ...overrides,
  };
}

function emptyMetricsShape(
  round: number,
): Omit<
  RoundMetrics,
  | "storeProfit"
  | "storeMarketShare"
  | "storeUnitsPurchased"
  | "storeWholesaleSpend"
  | "storeUnitsSoldRetail"
  | "storeRevenue"
  | "storeSupplierCount"
  | "storeTopSupplierSpendShare"
> {
  return {
    round,
    companyProfit: {},
    companyMarketShare: {},
    totalWholesaleVolume: 0,
    totalWholesaleValue: 0,
    totalRetailVolume: 0,
    totalRetailValue: 0,
    averageHouseholdSatisfaction: 0,
    companyUnitsProduced: {},
    companyUnitsSoldWholesale: {},
    companyRevenue: {},
    householdSpend: {},
    householdUnitsBought: {},
    householdCategoryCount: {},
    householdTopCategorySpendShare: {},
    householdEssentialCategoriesMissed: {},
    wholesaleCategoryClearing: {},
    retailCategoryClearing: {},
  };
}

function makeState(options: {
  stores: Record<string, StoreState>;
  roundMetrics?: RoundMetrics[];
  wholesaleListings?: GameState["wholesaleListings"];
  retailListings?: GameState["retailListings"];
  currentRound?: number;
}): GameState {
  const companies: Record<string, CompanyState> = {};
  const households: Record<string, HouseholdState> = {};
  return {
    config: { totalRounds: 7, studentPlayerIds: ["student-1"], rngSeed: 1 },
    currentRound: options.currentRound ?? 2,
    currentPhase: "store-turn",
    players: [{ id: "student-1", displayName: "Student 1", companyId: "c1", storeId: "s1", householdId: "h1" }],
    companies,
    stores: options.stores,
    households,
    wholesaleListings: options.wholesaleListings ?? [],
    retailListings: options.retailListings ?? [],
    roundMetrics: options.roundMetrics ?? [],
  };
}

function expectWellFormedAdvice(advice: ReturnType<typeof analyzeStoreTurn>): void {
  expect(advice.options.length === 2 || advice.options.length === 3).toBe(true);
  for (const option of advice.options) {
    expect(option.pros.length).toBeGreaterThan(0);
    expect(option.risks.length).toBeGreaterThan(0);
    expect(option.title.length).toBeGreaterThan(0);
  }
}

function fullMetricsShapeWithStore(
  round: number,
  storeId: string,
  fields: {
    profit: number;
    marketShare: number;
    unitsPurchased: number;
    wholesaleSpend: number;
    unitsSoldRetail: number;
    revenue: number;
    supplierCount: number;
    topSupplierSpendShare: number;
  },
): RoundMetrics {
  return {
    ...emptyMetricsShape(round),
    storeProfit: { [storeId]: fields.profit },
    storeMarketShare: { [storeId]: fields.marketShare },
    storeUnitsPurchased: { [storeId]: fields.unitsPurchased },
    storeWholesaleSpend: { [storeId]: fields.wholesaleSpend },
    storeUnitsSoldRetail: { [storeId]: fields.unitsSoldRetail },
    storeRevenue: { [storeId]: fields.revenue },
    storeSupplierCount: { [storeId]: fields.supplierCount },
    storeTopSupplierSpendShare: { [storeId]: fields.topSupplierSpendShare },
  };
}

describe("analyzeStoreTurn", () => {
  it("round 1 (no roundMetrics, no listings) does not crash and reports no-history", () => {
    const store = makeStore({ retailPrice: 0, inventoryQuantity: 0 });
    const state = makeState({ stores: { s1: store } });

    const advice = analyzeStoreTurn(state, "s1");

    expect(advice.dataAvailability).toBe("no-history");
    expectWellFormedAdvice(advice);
  });

  it("throws for an unknown storeId", () => {
    const state = makeState({ stores: { s1: makeStore() } });
    expect(() => analyzeStoreTurn(state, "does-not-exist")).toThrow();
  });

  it("reports partial data availability when history exists but no market listings do", () => {
    const store = makeStore();
    const metrics = fullMetricsShapeWithStore(1, "s1", {
      profit: 50,
      marketShare: 0.3,
      unitsPurchased: 10,
      wholesaleSpend: 100,
      unitsSoldRetail: 8,
      revenue: 200,
      supplierCount: 1,
      topSupplierSpendShare: 1,
    });
    const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

    const advice = analyzeStoreTurn(state, "s1");

    expect(advice.dataAvailability).toBe("partial");
    expectWellFormedAdvice(advice);
  });

  it("reports full data availability when history and both wholesale/retail market data exist", () => {
    const store = makeStore();
    const metrics = fullMetricsShapeWithStore(1, "s1", {
      profit: 50,
      marketShare: 0.3,
      unitsPurchased: 10,
      wholesaleSpend: 100,
      unitsSoldRetail: 8,
      revenue: 200,
      supplierCount: 1,
      topSupplierSpendShare: 1,
    });
    const state = makeState({
      stores: { s1: store },
      roundMetrics: [metrics],
      wholesaleListings: [{ id: "wl-1", companyId: "c-other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 }],
      retailListings: [{ id: "rl-1", storeId: "s-other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 20 }],
    });

    const advice = analyzeStoreTurn(state, "s1");

    expect(advice.dataAvailability).toBe("full");
    expectWellFormedAdvice(advice);
  });

  describe("out-of-stock", () => {
    it("flags out-of-stock (never purchased) on a store with zero inventory and no history", () => {
      const store = makeStore({ inventoryQuantity: 0 });
      const state = makeState({ stores: { s1: store } });

      const advice = analyzeStoreTurn(state, "s1");

      expect(advice.causeHypotheses.some((h) => h.id === "out-of-stock")).toBe(true);
      expect(advice.options.some((o) => o.id === "increase-purchase")).toBe(true);
    });

    it("flags out-of-stock (sold out) without negative framing when history shows units sold", () => {
      const store = makeStore({ inventoryQuantity: 0 });
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 30,
        marketShare: 0.2,
        unitsPurchased: 10,
        wholesaleSpend: 100,
        unitsSoldRetail: 10,
        revenue: 250,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      const advice = analyzeStoreTurn(state, "s1");
      const hypothesis = advice.causeHypotheses.find((h) => h.id === "out-of-stock");
      expect(hypothesis).toBeDefined();
      // "매진"은 나쁜 신호가 아니라는 점을 명시적으로 부정 표현("~아닙니다")으로 드러내야
      // 한다 — "나쁜"이라는 단어 자체가 아니라 "손해"/"문제"처럼 부정적으로 단정하는 어투가
      // 없는지를 검사한다.
      expect(hypothesis!.description).toMatch(/아닙니다/);
      expect(hypothesis!.description).not.toMatch(/손해|문제/);
    });

    it("does not flag out-of-stock when inventory remains", () => {
      const store = makeStore({ inventoryQuantity: 5 });
      const state = makeState({ stores: { s1: store } });

      const advice = analyzeStoreTurn(state, "s1");

      expect(advice.causeHypotheses.some((h) => h.id === "out-of-stock")).toBe(false);
    });
  });

  describe("unit margin", () => {
    it("flags negative-unit-margin when retail price is below average purchase cost", () => {
      const store = makeStore({ retailPrice: 8 });
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: -20,
        marketShare: 0.1,
        unitsPurchased: 10,
        wholesaleSpend: 100, // avg cost 10
        unitsSoldRetail: 5,
        revenue: 40,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "negative-unit-margin")).toBe(true);
    });

    it("flags low-unit-margin at/above threshold but not negative", () => {
      const threshold = DEFAULT_ADVISOR_RULES.lowUnitMarginRatio;
      // avgCost=8.5, price=10 => marginRatio exactly 0.15 (== default threshold) without
      // floating-point rounding surprises (8.5/10 divides evenly in binary floating point).
      expect(threshold).toBe(0.15);
      const avgCost = 8.5;
      const price = 10;
      const store = makeStore({ retailPrice: price });
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 10,
        marketShare: 0.1,
        unitsPurchased: 10,
        wholesaleSpend: avgCost * 10,
        unitsSoldRetail: 10,
        revenue: price * 10,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "low-unit-margin")).toBe(true);
      expect(advice.causeHypotheses.some((h) => h.id === "negative-unit-margin")).toBe(false);
    });

    it("does not flag margin issues comfortably above threshold", () => {
      const store = makeStore({ retailPrice: 100 });
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 500,
        marketShare: 0.5,
        unitsPurchased: 10,
        wholesaleSpend: 100, // avg cost 10, margin ratio 0.9
        unitsSoldRetail: 10,
        revenue: 1000,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "negative-unit-margin")).toBe(false);
      expect(advice.causeHypotheses.some((h) => h.id === "low-unit-margin")).toBe(false);
    });

    it("skips the margin hypothesis when storeUnitsPurchased is 0 (guards division by zero)", () => {
      const store = makeStore({ retailPrice: 20 });
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 0,
        marketShare: 0,
        unitsPurchased: 0,
        wholesaleSpend: 0,
        unitsSoldRetail: 0,
        revenue: 0,
        supplierCount: 0,
        topSupplierSpendShare: 0,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "negative-unit-margin")).toBe(false);
      expect(advice.causeHypotheses.some((h) => h.id === "low-unit-margin")).toBe(false);
      expectWellFormedAdvice(advice);
    });

    it("skips the margin hypothesis when retailPrice is 0 (not yet set)", () => {
      const store = makeStore({ retailPrice: 0 });
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 10,
        marketShare: 0.1,
        unitsPurchased: 10,
        wholesaleSpend: 100,
        unitsSoldRetail: 10,
        revenue: 200,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "negative-unit-margin")).toBe(false);
      expect(advice.causeHypotheses.some((h) => h.id === "low-unit-margin")).toBe(false);
      expect(advice.options.some((o) => o.id === "set-price")).toBe(true);
    });

    it("skips the margin hypothesis when storeUnitsPurchased>0 but storeWholesaleSpend is 0 (extreme value guard)", () => {
      const store = makeStore({ retailPrice: 20 });
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 0,
        marketShare: 0,
        unitsPurchased: 10,
        wholesaleSpend: 0,
        unitsSoldRetail: 0,
        revenue: 0,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "negative-unit-margin")).toBe(false);
      expect(advice.causeHypotheses.some((h) => h.id === "low-unit-margin")).toBe(false);
    });
  });

  describe("retail price vs market", () => {
    it("flags retail-price-above-market and offers to lower it", () => {
      const store = makeStore({ retailPrice: 24 });
      const state = makeState({
        stores: { s1: store },
        retailListings: [{ id: "rl-1", storeId: "other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 20 }],
      });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "retail-price-above-market")).toBe(true);
      expect(advice.options.some((o) => o.id === "lower-price")).toBe(true);
    });

    it("flags retail-price-below-market and offers to raise it", () => {
      const store = makeStore({ retailPrice: 15 });
      const state = makeState({
        stores: { s1: store },
        retailListings: [{ id: "rl-1", storeId: "other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 20 }],
      });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "retail-price-below-market")).toBe(true);
      expect(advice.options.some((o) => o.id === "raise-price")).toBe(true);
    });

    it("keeps the price when within normal range", () => {
      const store = makeStore({ retailPrice: 20 });
      const state = makeState({
        stores: { s1: store },
        retailListings: [{ id: "rl-1", storeId: "other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 20 }],
      });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "retail-price-above-market")).toBe(false);
      expect(advice.causeHypotheses.some((h) => h.id === "retail-price-below-market")).toBe(false);
      expect(advice.options.some((o) => o.id === "keep-price")).toBe(true);
    });
  });

  describe("high-supplier-concentration", () => {
    it("flags concentration only when alternatives actually exist in the market", () => {
      const store = makeStore();
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 10,
        marketShare: 0.1,
        unitsPurchased: 10,
        wholesaleSpend: 100,
        unitsSoldRetail: 10,
        revenue: 200,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });

      // No alternatives in market: should NOT flag concentration nor suggest diversifying.
      const stateNoAlternative = makeState({
        stores: { s1: store },
        roundMetrics: [metrics],
        wholesaleListings: [{ id: "wl-1", companyId: "only-supplier", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 }],
      });
      const adviceNoAlternative = analyzeStoreTurn(stateNoAlternative, "s1");
      expect(adviceNoAlternative.causeHypotheses.some((h) => h.id === "high-supplier-concentration")).toBe(false);
      expect(adviceNoAlternative.options.some((o) => o.id === "diversify-suppliers")).toBe(false);

      // Alternatives exist: should flag and suggest diversifying.
      const stateWithAlternative = makeState({
        stores: { s1: store },
        roundMetrics: [metrics],
        wholesaleListings: [
          { id: "wl-1", companyId: "supplier-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
          { id: "wl-2", companyId: "supplier-b", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      });
      const adviceWithAlternative = analyzeStoreTurn(stateWithAlternative, "s1");
      expect(adviceWithAlternative.causeHypotheses.some((h) => h.id === "high-supplier-concentration")).toBe(true);
      expect(adviceWithAlternative.options.some((o) => o.id === "diversify-suppliers")).toBe(true);
    });

    it("does not flag concentration below the threshold", () => {
      const store = makeStore();
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 10,
        marketShare: 0.1,
        unitsPurchased: 10,
        wholesaleSpend: 100,
        unitsSoldRetail: 10,
        revenue: 200,
        supplierCount: 2,
        topSupplierSpendShare: 0.5,
      });
      const state = makeState({
        stores: { s1: store },
        roundMetrics: [metrics],
        wholesaleListings: [
          { id: "wl-1", companyId: "supplier-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
          { id: "wl-2", companyId: "supplier-b", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      });
      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-supplier-concentration")).toBe(false);
    });
  });

  describe("high-store-competition", () => {
    it("flags high competition and does not otherwise crash", () => {
      const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
      const stores: Record<string, StoreState> = { s1: store };
      for (let i = 0; i < 4; i += 1) {
        stores[`rival-${i}`] = makeStore({ id: `rival-${i}`, ownerId: `rival-owner-${i}`, specialtyCategoryId: "food" });
      }
      const state = makeState({ stores });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-store-competition")).toBe(true);
      expectWellFormedAdvice(advice);
    });

    it("does not flag competition below the threshold", () => {
      const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
      const stores: Record<string, StoreState> = { s1: store };
      stores["rival-0"] = makeStore({ id: "rival-0", ownerId: "rival-owner-0", specialtyCategoryId: "food" });
      const state = makeState({ stores });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-store-competition")).toBe(false);
    });
  });

  describe("high-fixed-cost-burden", () => {
    it("flags a heavy fixed-cost burden relative to cash", () => {
      const store = makeStore({ districtId: "upscale", ledger: { cash: 50, cumulativeProfit: 0 } });
      const state = makeState({ stores: { s1: store } });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-fixed-cost-burden")).toBe(true);
    });

    it("flags the burden without crashing when cash is zero or negative", () => {
      const store = makeStore({ ledger: { cash: -20, cumulativeProfit: -500 } });
      const state = makeState({ stores: { s1: store } });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-fixed-cost-burden")).toBe(true);
      expectWellFormedAdvice(advice);
    });

    it("does not flag the burden with ample cash", () => {
      const store = makeStore({ districtId: "outskirts", ledger: { cash: 5000, cumulativeProfit: 0 } });
      const state = makeState({ stores: { s1: store } });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-fixed-cost-burden")).toBe(false);
    });
  });

  describe("purchase option based on overstock", () => {
    it("suggests reducing purchases when inventory carryover is high relative to last round's purchases", () => {
      const threshold = DEFAULT_ADVISOR_RULES.highInventoryCarryoverRatio;
      const unitsPurchased = 20;
      const store = makeStore({ inventoryQuantity: Math.ceil(unitsPurchased * threshold) });
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 5,
        marketShare: 0.1,
        unitsPurchased,
        wholesaleSpend: 200,
        unitsSoldRetail: unitsPurchased - store.inventoryQuantity,
        revenue: 50,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      const advice = analyzeStoreTurn(state, "s1");
      expect(advice.options.some((o) => o.id === "reduce-purchase")).toBe(true);
    });
  });

  it("never exposes fractional units (개) even when underlying quantities are decimals", () => {
    const store = makeStore({ inventoryQuantity: 12.6, retailPrice: 20 });
    const metrics = fullMetricsShapeWithStore(1, "s1", {
      profit: 10,
      marketShare: 0.2,
      unitsPurchased: 16.4,
      wholesaleSpend: 150,
      unitsSoldRetail: 20.5,
      revenue: 400,
      supplierCount: 1,
      topSupplierSpendShare: 1,
    });
    const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

    const advice = analyzeStoreTurn(state, "s1");
    const allText = [
      ...advice.situationSummary,
      ...advice.causeHypotheses.flatMap((h) => [h.description, h.evidence]),
      ...advice.options.flatMap((o) => [o.title, ...o.pros, ...o.risks]),
    ].join("\n");

    expect(allText).not.toMatch(/\d+\.\d+개/);
  });

  it("handles a store with no specialty category chosen yet (specialtyCategoryId: null) without crashing", () => {
    const store = makeStore({ specialtyCategoryId: null, inventoryQuantity: 5 });
    const state = makeState({ stores: { s1: store } });

    const advice = analyzeStoreTurn(state, "s1");
    expectWellFormedAdvice(advice);
    expect(advice.causeHypotheses.some((h) => h.id === "high-store-competition")).toBe(false);
    expect(advice.options.some((o) => o.id === "maintain-strategy")).toBe(true);
  });

  it("summarizes that the store is selling outside its specialty category when currentSellingCategoryId differs", () => {
    const store = makeStore({ specialtyCategoryId: "food", currentSellingCategoryId: "electronics" });
    const state = makeState({ stores: { s1: store } });

    const advice = analyzeStoreTurn(state, "s1");
    expect(advice.situationSummary.some((line) => line.includes("전문 업종") && line.includes("벗어나"))).toBe(true);
  });

  it("handles zero listings on the wholesale market for the category without crashing", () => {
    const store = makeStore();
    const state = makeState({ stores: { s1: store }, wholesaleListings: [] });

    const advice = analyzeStoreTurn(state, "s1");
    expectWellFormedAdvice(advice);
    expect(advice.situationSummary.some((line) => line.includes("도매 매물이 없습니다"))).toBe(true);
  });

  it("all returned options always have 2 or 3 entries with non-empty pros/risks across scenarios", () => {
    const scenarios: GameState[] = [
      makeState({ stores: { s1: makeStore() } }),
      makeState({
        stores: { s1: makeStore({ retailPrice: 100 }) },
        retailListings: [{ id: "rl", storeId: "other", categoryId: "food", quantityAvailable: 1, quality: 0.9, price: 20 }],
      }),
      makeState({
        stores: { s1: makeStore({ inventoryQuantity: 50 }) },
        roundMetrics: [
          fullMetricsShapeWithStore(1, "s1", {
            profit: -100,
            marketShare: 0.1,
            unitsPurchased: 60,
            wholesaleSpend: 300,
            unitsSoldRetail: 10,
            revenue: 100,
            supplierCount: 1,
            topSupplierSpendShare: 1,
          }),
        ],
      }),
    ];

    for (const state of scenarios) {
      expectWellFormedAdvice(analyzeStoreTurn(state, "s1"));
    }
  });

  describe("every new AdvisorRules threshold actually changes behavior when overridden", () => {
    it("outOfStockThreshold: raising it flags a small positive inventory as out-of-stock", () => {
      const store = makeStore({ inventoryQuantity: 0.5 });
      const state = makeState({ stores: { s1: store } });

      expect(analyzeStoreTurn(state, "s1").causeHypotheses.some((h) => h.id === "out-of-stock")).toBe(false);
      const raised = analyzeStoreTurn(state, "s1", { ...DEFAULT_ADVISOR_RULES, outOfStockThreshold: 1 });
      expect(raised.causeHypotheses.some((h) => h.id === "out-of-stock")).toBe(true);
    });

    it("lowUnitMarginRatio: raising it flags a margin the default would not", () => {
      const store = makeStore({ retailPrice: 50 }); // avg cost 10, margin ratio 0.8
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 100,
        marketShare: 0.3,
        unitsPurchased: 10,
        wholesaleSpend: 100,
        unitsSoldRetail: 10,
        revenue: 500,
        supplierCount: 1,
        topSupplierSpendShare: 1,
      });
      const state = makeState({ stores: { s1: store }, roundMetrics: [metrics] });

      expect(analyzeStoreTurn(state, "s1").causeHypotheses.some((h) => h.id === "low-unit-margin")).toBe(false);
      const raised = analyzeStoreTurn(state, "s1", { ...DEFAULT_ADVISOR_RULES, lowUnitMarginRatio: 0.9 });
      expect(raised.causeHypotheses.some((h) => h.id === "low-unit-margin")).toBe(true);
    });

    it("highSupplierConcentrationRatio: lowering it flags a concentration the default would not", () => {
      const store = makeStore();
      const metrics = fullMetricsShapeWithStore(1, "s1", {
        profit: 10,
        marketShare: 0.1,
        unitsPurchased: 10,
        wholesaleSpend: 100,
        unitsSoldRetail: 10,
        revenue: 200,
        supplierCount: 2,
        topSupplierSpendShare: 0.6,
      });
      const state = makeState({
        stores: { s1: store },
        roundMetrics: [metrics],
        wholesaleListings: [
          { id: "wl-1", companyId: "supplier-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
          { id: "wl-2", companyId: "supplier-b", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      });

      expect(analyzeStoreTurn(state, "s1").causeHypotheses.some((h) => h.id === "high-supplier-concentration")).toBe(false);
      const lowered = analyzeStoreTurn(state, "s1", { ...DEFAULT_ADVISOR_RULES, highSupplierConcentrationRatio: 0.5 });
      expect(lowered.causeHypotheses.some((h) => h.id === "high-supplier-concentration")).toBe(true);
    });

    it("highStoreCompetitorCount: lowering it flags competition the default would not", () => {
      const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
      const stores: Record<string, StoreState> = { s1: store };
      for (let i = 0; i < 2; i += 1) {
        stores[`rival-${i}`] = makeStore({ id: `rival-${i}`, ownerId: `rival-owner-${i}`, specialtyCategoryId: "food" });
      }
      const state = makeState({ stores });

      expect(analyzeStoreTurn(state, "s1").causeHypotheses.some((h) => h.id === "high-store-competition")).toBe(false);
      const lowered = analyzeStoreTurn(state, "s1", { ...DEFAULT_ADVISOR_RULES, highStoreCompetitorCount: 2 });
      expect(lowered.causeHypotheses.some((h) => h.id === "high-store-competition")).toBe(true);
    });

    it("highRetailPriceVsMarketRatio: loosening it stops flagging a price the default would flag as too high", () => {
      const store = makeStore({ retailPrice: 26 }); // 1.3x market average of 20
      const state = makeState({
        stores: { s1: store },
        retailListings: [{ id: "rl-1", storeId: "other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 20 }],
      });

      expect(analyzeStoreTurn(state, "s1").causeHypotheses.some((h) => h.id === "retail-price-above-market")).toBe(true);
      const loosened = analyzeStoreTurn(state, "s1", { ...DEFAULT_ADVISOR_RULES, highRetailPriceVsMarketRatio: 1.5 });
      expect(loosened.causeHypotheses.some((h) => h.id === "retail-price-above-market")).toBe(false);
    });

    it("lowRetailPriceVsMarketRatio: loosening it stops flagging a price the default would flag as too low", () => {
      const store = makeStore({ retailPrice: 14 }); // 0.7x market average of 20
      const state = makeState({
        stores: { s1: store },
        retailListings: [{ id: "rl-1", storeId: "other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 20 }],
      });

      expect(analyzeStoreTurn(state, "s1").causeHypotheses.some((h) => h.id === "retail-price-below-market")).toBe(true);
      const loosened = analyzeStoreTurn(state, "s1", { ...DEFAULT_ADVISOR_RULES, lowRetailPriceVsMarketRatio: 0.5 });
      expect(loosened.causeHypotheses.some((h) => h.id === "retail-price-below-market")).toBe(false);
    });

    it("highFixedCostToCashRatio: raising it stops flagging a burden the default would flag", () => {
      const store = makeStore({ districtId: "upscale", ledger: { cash: 50, cumulativeProfit: 0 } });
      const state = makeState({ stores: { s1: store } });

      expect(analyzeStoreTurn(state, "s1").causeHypotheses.some((h) => h.id === "high-fixed-cost-burden")).toBe(true);
      const raised = analyzeStoreTurn(state, "s1", { ...DEFAULT_ADVISOR_RULES, highFixedCostToCashRatio: 10 });
      expect(raised.causeHypotheses.some((h) => h.id === "high-fixed-cost-burden")).toBe(false);
    });
  });

  describe("competitionFocusMinRound (Milestone 6 제안 A: 5라운드부터 가격/품질 경쟁 안내 문구)", () => {
    it("does not mention price/quality competition before the threshold round", () => {
      const store = makeStore();
      const state = makeState({ stores: { s1: store }, currentRound: 4 });

      const advice = analyzeStoreTurn(state, "s1");

      expect(advice.situationSummary.some((line) => line.includes("가격과 품질 경쟁"))).toBe(false);
      expectWellFormedAdvice(advice);
    });

    it("mentions price/quality competition exactly at the threshold round", () => {
      const store = makeStore();
      const state = makeState({ stores: { s1: store }, currentRound: 5 });

      const advice = analyzeStoreTurn(state, "s1");

      expect(advice.situationSummary.some((line) => line.includes("가격과 품질 경쟁"))).toBe(true);
      expectWellFormedAdvice(advice);
    });

    it("keeps mentioning price/quality competition well after the threshold round", () => {
      const store = makeStore();
      const state = makeState({ stores: { s1: store }, currentRound: 7 });

      const advice = analyzeStoreTurn(state, "s1");

      expect(advice.situationSummary.some((line) => line.includes("가격과 품질 경쟁"))).toBe(true);
      expectWellFormedAdvice(advice);
    });
  });
});
