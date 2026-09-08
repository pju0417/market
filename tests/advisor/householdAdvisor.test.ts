import { describe, expect, it } from "vitest";
import { analyzeHouseholdTurn } from "../../src/advisor/householdAdvisor.js";
import { DEFAULT_ADVISOR_RULES } from "../../src/advisor/rules.js";
import type {
  CompanyState,
  GameState,
  HouseholdState,
  ProductCategoryId,
  RetailListing,
  RoundMetrics,
  StoreState,
} from "../../src/types/domain.js";

function makeHousehold(overrides: Partial<HouseholdState> = {}): HouseholdState {
  return {
    id: "h1",
    ownerId: "student-1",
    kind: "student",
    ledger: { cash: 50, cumulativeProfit: 0 },
    strategyId: "stable",
    budgetPerRound: 100,
    satisfactionScore: 0.5,
    ...overrides,
  };
}

function makeStore(id: string, ownerId: string): StoreState {
  return {
    id,
    ownerId,
    kind: "student",
    districtId: "downtown",
    ledger: { cash: 500, cumulativeProfit: 0 },
    strategyId: "stable",
    specialtyCategoryId: "food",
    currentSellingCategoryId: null,
    inventoryQuantity: 10,
    inventoryQuality: 0.5,
    retailPrice: 10,
    lastSellingCategoryChangeRound: null,
  };
}

function emptyMetricsShape(
  round: number,
): Omit<
  RoundMetrics,
  "householdSpend" | "householdUnitsBought" | "householdCategoryCount" | "householdTopCategorySpendShare" | "householdEssentialCategoriesMissed"
> {
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
    wholesaleCategoryClearing: {},
    retailCategoryClearing: {},
  };
}

function fullMetricsShapeWithHousehold(
  round: number,
  householdId: string,
  fields: {
    spend: number;
    unitsBought: number;
    categoryCount: number;
    topCategorySpendShare: number;
    essentialCategoriesMissed: ProductCategoryId[];
  },
): RoundMetrics {
  return {
    ...emptyMetricsShape(round),
    householdSpend: { [householdId]: fields.spend },
    householdUnitsBought: { [householdId]: fields.unitsBought },
    householdCategoryCount: { [householdId]: fields.categoryCount },
    householdTopCategorySpendShare: { [householdId]: fields.topCategorySpendShare },
    householdEssentialCategoriesMissed: { [householdId]: fields.essentialCategoriesMissed },
  };
}

function makeState(options: {
  households: Record<string, HouseholdState>;
  roundMetrics?: RoundMetrics[];
  retailListings?: RetailListing[];
  stores?: Record<string, StoreState>;
  currentRound?: number;
}): GameState {
  const companies: Record<string, CompanyState> = {};
  return {
    config: { totalRounds: 7, studentPlayerIds: ["student-1"], rngSeed: 1 },
    currentRound: options.currentRound ?? 2,
    currentPhase: "household-turn",
    players: [{ id: "student-1", displayName: "Student 1", companyId: "c1", storeId: "s1", householdId: "h1" }],
    companies,
    stores: options.stores ?? {},
    households: options.households,
    wholesaleListings: [],
    retailListings: options.retailListings ?? [],
    roundMetrics: options.roundMetrics ?? [],
  };
}

function expectWellFormedAdvice(advice: ReturnType<typeof analyzeHouseholdTurn>): void {
  expect(advice.options.length).toBe(3);
  for (const option of advice.options) {
    expect(option.pros.length).toBeGreaterThan(0);
    expect(option.risks.length).toBeGreaterThan(0);
    expect(option.title.length).toBeGreaterThan(0);
  }
}

function allAdviceText(advice: ReturnType<typeof analyzeHouseholdTurn>): string[] {
  return [
    ...advice.situationSummary,
    ...advice.causeHypotheses.flatMap((h) => [h.description, h.evidence]),
    ...advice.options.flatMap((o) => [o.title, ...o.pros, ...o.risks]),
  ];
}

describe("analyzeHouseholdTurn", () => {
  it("round 1 (no roundMetrics, no listings) does not crash and reports no-history", () => {
    const household = makeHousehold();
    const state = makeState({ households: { h1: household } });

    const advice = analyzeHouseholdTurn(state, "h1");

    expect(advice.dataAvailability).toBe("no-history");
    expectWellFormedAdvice(advice);
  });

  it("throws for an unknown householdId", () => {
    const state = makeState({ households: { h1: makeHousehold() } });
    expect(() => analyzeHouseholdTurn(state, "does-not-exist")).toThrow();
  });

  it("reports partial data availability when history exists but no market listings do", () => {
    const household = makeHousehold();
    const metrics = fullMetricsShapeWithHousehold(1, "h1", {
      spend: 20,
      unitsBought: 3,
      categoryCount: 1,
      topCategorySpendShare: 1,
      essentialCategoriesMissed: [],
    });
    const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

    const advice = analyzeHouseholdTurn(state, "h1");

    expect(advice.dataAvailability).toBe("partial");
    expectWellFormedAdvice(advice);
  });

  it("reports partial data availability when listings exist but no history does", () => {
    const household = makeHousehold();
    const store = makeStore("s-other", "student-2");
    const state = makeState({
      households: { h1: household },
      stores: { "s-other": store },
      retailListings: [{ id: "rl-1", storeId: "s-other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 }],
    });

    const advice = analyzeHouseholdTurn(state, "h1");

    expect(advice.dataAvailability).toBe("partial");
    expectWellFormedAdvice(advice);
  });

  it("reports full data availability when both history and market listings exist", () => {
    const household = makeHousehold();
    const store = makeStore("s-other", "student-2");
    const metrics = fullMetricsShapeWithHousehold(1, "h1", {
      spend: 20,
      unitsBought: 3,
      categoryCount: 1,
      topCategorySpendShare: 1,
      essentialCategoriesMissed: [],
    });
    const state = makeState({
      households: { h1: household },
      stores: { "s-other": store },
      roundMetrics: [metrics],
      retailListings: [{ id: "rl-1", storeId: "s-other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 }],
    });

    const advice = analyzeHouseholdTurn(state, "h1");

    expect(advice.dataAvailability).toBe("full");
    expectWellFormedAdvice(advice);
  });

  describe("missed essential categories", () => {
    it("flags missed-essential-food only when food was missed and apparel was not", () => {
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 1,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: ["food"],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "missed-essential-food")).toBe(true);
      expect(advice.causeHypotheses.some((h) => h.id === "missed-essential-apparel")).toBe(false);
      expect(advice.options.some((o) => o.id === "prioritize-essentials")).toBe(true);
    });

    it("flags missed-essential-apparel only when apparel was missed and food was not", () => {
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 1,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: ["apparel"],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "missed-essential-apparel")).toBe(true);
      expect(advice.causeHypotheses.some((h) => h.id === "missed-essential-food")).toBe(false);
      expect(advice.options.some((o) => o.id === "prioritize-essentials")).toBe(true);
    });

    it("flags both when both are missed simultaneously", () => {
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 1,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: ["food", "apparel"],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "missed-essential-food")).toBe(true);
      expect(advice.causeHypotheses.some((h) => h.id === "missed-essential-apparel")).toBe(true);
    });

    it("does not flag either when neither was missed", () => {
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 1,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: [],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "missed-essential-food")).toBe(false);
      expect(advice.causeHypotheses.some((h) => h.id === "missed-essential-apparel")).toBe(false);
      expect(advice.options.some((o) => o.id === "maintain-essential-consumption")).toBe(true);
    });
  });

  describe("low-satisfaction", () => {
    it("flags low satisfaction at/below the threshold", () => {
      const threshold = DEFAULT_ADVISOR_RULES.householdLowSatisfactionThreshold;
      const household = makeHousehold({ satisfactionScore: threshold });
      const state = makeState({ households: { h1: household } });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "low-satisfaction")).toBe(true);
    });

    it("does not flag low satisfaction comfortably above the threshold", () => {
      const household = makeHousehold({ satisfactionScore: 0.9 });
      const state = makeState({ households: { h1: household } });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "low-satisfaction")).toBe(false);
    });
  });

  describe("low-consumption-diversity", () => {
    function marketWithTwoCategories(): { stores: Record<string, StoreState>; retailListings: RetailListing[] } {
      const store = makeStore("s-other", "student-2");
      return {
        stores: { "s-other": store },
        retailListings: [
          { id: "rl-food", storeId: "s-other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
          { id: "rl-toys", storeId: "s-other", categoryId: "toys", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      };
    }

    it("flags concentration when categoryCount is at the diversity threshold and alternatives exist", () => {
      const threshold = DEFAULT_ADVISOR_RULES.householdLowCategoryDiversityCount;
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 2,
        categoryCount: threshold,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: [],
      });
      const market = marketWithTwoCategories();
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics], ...market });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "low-consumption-diversity")).toBe(true);
      expect(advice.options.some((o) => o.id === "diversify-consumption")).toBe(true);
    });

    it("flags concentration when topCategorySpendShare is at/above the ratio threshold and alternatives exist", () => {
      const ratio = DEFAULT_ADVISOR_RULES.householdHighCategorySpendShareRatio;
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 2,
        categoryCount: 2,
        topCategorySpendShare: ratio,
        essentialCategoriesMissed: [],
      });
      const market = marketWithTwoCategories();
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics], ...market });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "low-consumption-diversity")).toBe(true);
    });

    it("does NOT flag concentration when no alternative categories actually exist in the market", () => {
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 2,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: [],
      });
      const store = makeStore("s-other", "student-2");
      const state = makeState({
        households: { h1: household },
        roundMetrics: [metrics],
        stores: { "s-other": store },
        retailListings: [{ id: "rl-food", storeId: "s-other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 }],
      });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "low-consumption-diversity")).toBe(false);
      expect(advice.options.some((o) => o.id === "diversify-consumption")).toBe(false);
    });

    it("does not flag concentration when diversity is comfortably above thresholds", () => {
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 2,
        categoryCount: 2,
        topCategorySpendShare: 0.5,
        essentialCategoriesMissed: [],
      });
      const market = marketWithTwoCategories();
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics], ...market });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "low-consumption-diversity")).toBe(false);
      expect(advice.options.some((o) => o.id === "maintain-diversity")).toBe(true);
    });
  });

  describe("budget usage", () => {
    it("flags high-budget-usage when last round's spend/available-budget ratio is at/above the threshold", () => {
      const ratio = DEFAULT_ADVISOR_RULES.householdHighBudgetUsageRatio;
      // availableBudgetLastRound = cash + spend; choose cash so spend/available == ratio exactly.
      // spend=90, cash=10 => available=100, ratio=0.9.
      const household = makeHousehold({ ledger: { cash: 10, cumulativeProfit: 0 } });
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 90,
        unitsBought: 5,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: [],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      expect(90 / (10 + 90)).toBe(ratio);
      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-budget-usage")).toBe(true);
      expect(advice.options.some((o) => o.id === "reduce-spending")).toBe(true);
    });

    it("flags low-budget-usage when last round's spend/available-budget ratio is at/below the threshold", () => {
      const ratio = DEFAULT_ADVISOR_RULES.householdLowBudgetUsageRatio;
      // spend=20, cash=80 => available=100, ratio=0.2.
      const household = makeHousehold({ ledger: { cash: 80, cumulativeProfit: 0 } });
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 20,
        unitsBought: 2,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: [],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      expect(20 / (80 + 20)).toBe(ratio);
      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "low-budget-usage")).toBe(true);
      expect(advice.options.some((o) => o.id === "use-more-budget")).toBe(true);
    });

    it("does not flag budget usage in the normal range and offers to maintain the budget", () => {
      const household = makeHousehold({ ledger: { cash: 50, cumulativeProfit: 0 } });
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 50,
        unitsBought: 3,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: [],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-budget-usage")).toBe(false);
      expect(advice.causeHypotheses.some((h) => h.id === "low-budget-usage")).toBe(false);
      expect(advice.options.some((o) => o.id === "maintain-budget")).toBe(true);
    });

    it("does not crash when spend and cash are both zero (guards division by zero)", () => {
      const household = makeHousehold({ ledger: { cash: 0, cumulativeProfit: 0 } });
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 0,
        unitsBought: 0,
        categoryCount: 0,
        topCategorySpendShare: 0,
        essentialCategoriesMissed: [],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      const advice = analyzeHouseholdTurn(state, "h1");
      expect(advice.causeHypotheses.some((h) => h.id === "high-budget-usage")).toBe(false);
      expect(advice.causeHypotheses.some((h) => h.id === "low-budget-usage")).toBe(false);
      expectWellFormedAdvice(advice);
    });
  });

  describe("income event budget multiplier (round 7, D-037)", () => {
    it("round 7: applies the 0.7x income event multiplier to the displayed budget and total", () => {
      const household = makeHousehold({ ledger: { cash: 50, cumulativeProfit: 0 }, budgetPerRound: 100 });
      const state = makeState({ households: { h1: household }, currentRound: 7 });

      const advice = analyzeHouseholdTurn(state, "h1");
      const summaryText = advice.situationSummary.join("\n");

      // effective budget = 100 * 0.7 = 70; total = cash(50) + 70 = 120.
      expect(summaryText).toContain("70원");
      expect(summaryText).toContain("120원");
      expect(summaryText).not.toContain("100원");
      expect(summaryText).not.toContain("150원");
      // household.budgetPerRound itself must not be mutated by the multiplier.
      expect(household.budgetPerRound).toBe(100);
    });

    it("round 6: does not apply the income event multiplier (regression guard)", () => {
      const household = makeHousehold({ ledger: { cash: 50, cumulativeProfit: 0 }, budgetPerRound: 100 });
      const state = makeState({ households: { h1: household }, currentRound: 6 });

      const advice = analyzeHouseholdTurn(state, "h1");
      const summaryText = advice.situationSummary.join("\n");

      // no income event in round 6: effective budget = 100, total = cash(50) + 100 = 150.
      expect(summaryText).toContain("100원");
      expect(summaryText).toContain("150원");
      expect(summaryText).not.toContain("70원");
    });
  });

  it("all returned options always have exactly 3 entries with non-empty pros/risks across scenarios", () => {
    const scenarios: GameState[] = [
      makeState({ households: { h1: makeHousehold() } }),
      makeState({
        households: { h1: makeHousehold({ satisfactionScore: 0.1 }) },
        roundMetrics: [
          fullMetricsShapeWithHousehold(1, "h1", {
            spend: 90,
            unitsBought: 5,
            categoryCount: 1,
            topCategorySpendShare: 1,
            essentialCategoriesMissed: ["food", "apparel"],
          }),
        ],
      }),
    ];

    for (const state of scenarios) {
      expectWellFormedAdvice(analyzeHouseholdTurn(state, "h1"));
    }
  });

  it("never leaks NaN/undefined/null and never exposes fractional units (개) even when underlying quantities are decimals", () => {
    const household = makeHousehold({ ledger: { cash: 12.3, cumulativeProfit: 0 } });
    const metrics = fullMetricsShapeWithHousehold(1, "h1", {
      spend: 45.6,
      unitsBought: 3.7,
      categoryCount: 2,
      topCategorySpendShare: 0.62,
      essentialCategoriesMissed: ["food"],
    });
    const store = makeStore("s-other", "student-2");
    const state = makeState({
      households: { h1: household },
      roundMetrics: [metrics],
      stores: { "s-other": store },
      retailListings: [{ id: "rl-1", storeId: "s-other", categoryId: "food", quantityAvailable: 5.5, quality: 0.567, price: 10.25 }],
    });

    const advice = analyzeHouseholdTurn(state, "h1");
    const allText = allAdviceText(advice).join("\n");

    expect(allText).not.toMatch(/undefined/);
    expect(allText).not.toMatch(/NaN/);
    expect(allText).not.toMatch(/\bnull\b/);
    expect(allText).not.toMatch(/\d+\.\d+개/);
  });

  describe("every new AdvisorRules threshold actually changes behavior when overridden", () => {
    it("householdLowSatisfactionThreshold: raising it flags a satisfaction the default would not", () => {
      const household = makeHousehold({ satisfactionScore: 0.5 });
      const state = makeState({ households: { h1: household } });

      expect(analyzeHouseholdTurn(state, "h1").causeHypotheses.some((h) => h.id === "low-satisfaction")).toBe(false);
      const raised = analyzeHouseholdTurn(state, "h1", { ...DEFAULT_ADVISOR_RULES, householdLowSatisfactionThreshold: 0.6 });
      expect(raised.causeHypotheses.some((h) => h.id === "low-satisfaction")).toBe(true);
    });

    it("householdLowCategoryDiversityCount: raising it flags a diversity issue the default would not", () => {
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 2,
        categoryCount: 2,
        topCategorySpendShare: 0.5,
        essentialCategoriesMissed: [],
      });
      const store = makeStore("s-other", "student-2");
      const state = makeState({
        households: { h1: household },
        roundMetrics: [metrics],
        stores: { "s-other": store },
        retailListings: [
          { id: "rl-food", storeId: "s-other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
          { id: "rl-toys", storeId: "s-other", categoryId: "toys", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      });

      expect(analyzeHouseholdTurn(state, "h1").causeHypotheses.some((h) => h.id === "low-consumption-diversity")).toBe(false);
      const raised = analyzeHouseholdTurn(state, "h1", { ...DEFAULT_ADVISOR_RULES, householdLowCategoryDiversityCount: 2 });
      expect(raised.causeHypotheses.some((h) => h.id === "low-consumption-diversity")).toBe(true);
    });

    it("householdHighCategorySpendShareRatio: lowering it flags a concentration the default would not", () => {
      const household = makeHousehold();
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 10,
        unitsBought: 2,
        categoryCount: 2,
        topCategorySpendShare: 0.6,
        essentialCategoriesMissed: [],
      });
      const store = makeStore("s-other", "student-2");
      const state = makeState({
        households: { h1: household },
        roundMetrics: [metrics],
        stores: { "s-other": store },
        retailListings: [
          { id: "rl-food", storeId: "s-other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
          { id: "rl-toys", storeId: "s-other", categoryId: "toys", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      });

      expect(analyzeHouseholdTurn(state, "h1").causeHypotheses.some((h) => h.id === "low-consumption-diversity")).toBe(false);
      const lowered = analyzeHouseholdTurn(state, "h1", { ...DEFAULT_ADVISOR_RULES, householdHighCategorySpendShareRatio: 0.5 });
      expect(lowered.causeHypotheses.some((h) => h.id === "low-consumption-diversity")).toBe(true);
    });

    it("householdHighBudgetUsageRatio: lowering it flags a budget usage the default would not", () => {
      const household = makeHousehold({ ledger: { cash: 30, cumulativeProfit: 0 } });
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 70,
        unitsBought: 4,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: [],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      expect(analyzeHouseholdTurn(state, "h1").causeHypotheses.some((h) => h.id === "high-budget-usage")).toBe(false);
      const lowered = analyzeHouseholdTurn(state, "h1", { ...DEFAULT_ADVISOR_RULES, householdHighBudgetUsageRatio: 0.6 });
      expect(lowered.causeHypotheses.some((h) => h.id === "high-budget-usage")).toBe(true);
    });

    it("householdLowBudgetUsageRatio: raising it flags a budget usage the default would not", () => {
      const household = makeHousehold({ ledger: { cash: 70, cumulativeProfit: 0 } });
      const metrics = fullMetricsShapeWithHousehold(1, "h1", {
        spend: 30,
        unitsBought: 2,
        categoryCount: 1,
        topCategorySpendShare: 1,
        essentialCategoriesMissed: [],
      });
      const state = makeState({ households: { h1: household }, roundMetrics: [metrics] });

      expect(analyzeHouseholdTurn(state, "h1").causeHypotheses.some((h) => h.id === "low-budget-usage")).toBe(false);
      const raised = analyzeHouseholdTurn(state, "h1", { ...DEFAULT_ADVISOR_RULES, householdLowBudgetUsageRatio: 0.4 });
      expect(raised.causeHypotheses.some((h) => h.id === "low-budget-usage")).toBe(true);
    });
  });
});
