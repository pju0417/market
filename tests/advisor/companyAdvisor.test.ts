import { describe, expect, it } from "vitest";
import { analyzeCompanyTurn } from "../../src/advisor/companyAdvisor.js";
import { DEFAULT_ADVISOR_RULES } from "../../src/advisor/rules.js";
import type {
  CompanyState,
  GameState,
  HouseholdState,
  RoundMetrics,
  StoreState,
} from "../../src/types/domain.js";

function makeCompany(overrides: Partial<CompanyState> = {}): CompanyState {
  return {
    id: "c1",
    ownerId: "student-1",
    kind: "student",
    districtId: "downtown",
    ledger: { cash: 500, cumulativeProfit: 0 },
    strategyId: "stable",
    productCategoryId: "food",
    quality: 0.5,
    inventoryQuantity: 0,
    lastWholesalePrice: 10,
    ...overrides,
  };
}

function emptyMetricsShape(round: number): Omit<RoundMetrics, "companyProfit" | "companyMarketShare" | "companyUnitsProduced" | "companyUnitsSoldWholesale" | "companyRevenue"> {
  return {
    round,
    storeProfit: {},
    storeMarketShare: {},
    totalWholesaleVolume: 0,
    totalWholesaleValue: 0,
    totalRetailVolume: 0,
    totalRetailValue: 0,
    averageHouseholdSatisfaction: 0,
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
  };
}

function makeState(options: {
  companies: Record<string, CompanyState>;
  roundMetrics?: RoundMetrics[];
  wholesaleListings?: GameState["wholesaleListings"];
}): GameState {
  const stores: Record<string, StoreState> = {};
  const households: Record<string, HouseholdState> = {};
  return {
    config: { totalRounds: 7, studentPlayerIds: ["student-1"], rngSeed: 1 },
    currentRound: 2,
    currentPhase: "company-turn",
    players: [{ id: "student-1", displayName: "Student 1", companyId: "c1", storeId: "s1", householdId: "h1" }],
    companies: options.companies,
    stores,
    households,
    wholesaleListings: options.wholesaleListings ?? [],
    retailListings: [],
    roundMetrics: options.roundMetrics ?? [],
  };
}

function expectWellFormedAdvice(advice: ReturnType<typeof analyzeCompanyTurn>): void {
  expect(advice.options.length === 2 || advice.options.length === 3).toBe(true);
  for (const option of advice.options) {
    expect(option.pros.length).toBeGreaterThan(0);
    expect(option.risks.length).toBeGreaterThan(0);
    expect(option.title.length).toBeGreaterThan(0);
  }
}

describe("analyzeCompanyTurn", () => {
  it("round 1 (no roundMetrics, no wholesaleListings) does not crash and reports no-history", () => {
    const company = makeCompany();
    const state = makeState({ companies: { c1: company } });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.dataAvailability).toBe("no-history");
    expectWellFormedAdvice(advice);
  });

  it("throws for an unknown companyId", () => {
    const state = makeState({ companies: { c1: makeCompany() } });
    expect(() => analyzeCompanyTurn(state, "does-not-exist")).toThrow();
  });

  it("reports partial data availability when history exists but no market listings do", () => {
    const company = makeCompany();
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: 100 },
      companyMarketShare: { c1: 0.5 },
      companyUnitsProduced: { c1: 20 },
      companyUnitsSoldWholesale: { c1: 20 },
      companyRevenue: { c1: 200 },
    };
    const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.dataAvailability).toBe("partial");
    expectWellFormedAdvice(advice);
  });

  it("reports full data availability when both history and market listings exist", () => {
    const company = makeCompany();
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: 100 },
      companyMarketShare: { c1: 0.5 },
      companyUnitsProduced: { c1: 20 },
      companyUnitsSoldWholesale: { c1: 20 },
      companyRevenue: { c1: 200 },
    };
    const state = makeState({
      companies: { c1: company },
      roundMetrics: [metrics],
      wholesaleListings: [
        { id: "wl-1", companyId: "other", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
      ],
    });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.dataAvailability).toBe("full");
    expectWellFormedAdvice(advice);
  });

  it("suggests reducing production when inventory carryover ratio is at/above the threshold", () => {
    const threshold = DEFAULT_ADVISOR_RULES.highInventoryCarryoverRatio;
    const unitsProduced = 20;
    const company = makeCompany({ inventoryQuantity: Math.ceil(unitsProduced * threshold) });
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: 10 },
      companyMarketShare: { c1: 0.2 },
      companyUnitsProduced: { c1: unitsProduced },
      companyUnitsSoldWholesale: { c1: unitsProduced - company.inventoryQuantity },
      companyRevenue: { c1: 50 },
    };
    const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.causeHypotheses.some((h) => h.id === "high-inventory-carryover")).toBe(true);
    expect(advice.options.some((o) => o.id === "reduce-production")).toBe(true);
  });

  it("does not flag inventory carryover just below the threshold", () => {
    const threshold = DEFAULT_ADVISOR_RULES.highInventoryCarryoverRatio;
    const unitsProduced = 20;
    const belowThresholdInventory = Math.floor(unitsProduced * threshold) - 1;
    const company = makeCompany({ inventoryQuantity: Math.max(0, belowThresholdInventory) });
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: 10 },
      companyMarketShare: { c1: 0.2 },
      companyUnitsProduced: { c1: unitsProduced },
      companyUnitsSoldWholesale: { c1: unitsProduced - company.inventoryQuantity },
      companyRevenue: { c1: 50 },
    };
    const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.causeHypotheses.some((h) => h.id === "high-inventory-carryover")).toBe(false);
    expect(advice.options.some((o) => o.id === "reduce-production")).toBe(false);
  });

  it("flags a high price vs market and offers to lower it, with the market price referenced in the summary", () => {
    const company = makeCompany({ lastWholesalePrice: 20 });
    const state = makeState({
      companies: { c1: company },
      wholesaleListings: [
        { id: "wl-a", companyId: "other-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
        { id: "wl-b", companyId: "other-b", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
      ],
    });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.causeHypotheses.some((h) => h.id === "price-above-market")).toBe(true);
    expect(advice.options.some((o) => o.id === "lower-price")).toBe(true);
    expect(advice.situationSummary.some((line) => line.includes("10") && line.includes("시장 평균"))).toBe(true);
  });

  it("flags a low price vs market and offers to raise it", () => {
    const company = makeCompany({ lastWholesalePrice: 5 });
    const state = makeState({
      companies: { c1: company },
      wholesaleListings: [
        { id: "wl-a", companyId: "other-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
        { id: "wl-b", companyId: "other-b", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
      ],
    });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.causeHypotheses.some((h) => h.id === "price-below-market")).toBe(true);
    expect(advice.options.some((o) => o.id === "raise-price")).toBe(true);
  });

  it("does not flag price when within the normal range around the market average", () => {
    const company = makeCompany({ lastWholesalePrice: 10 });
    const state = makeState({
      companies: { c1: company },
      wholesaleListings: [
        { id: "wl-a", companyId: "other-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
      ],
    });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.causeHypotheses.some((h) => h.id === "price-above-market")).toBe(false);
    expect(advice.causeHypotheses.some((h) => h.id === "price-below-market")).toBe(false);
    expect(advice.options.some((o) => o.id === "keep-price")).toBe(true);
  });

  it("flags high competitor count and suggests an industry switch when the closest category is cheap enough (toys -> electronics, similarity 0.5)", () => {
    const company = makeCompany({ productCategoryId: "toys" });
    const companies: Record<string, CompanyState> = { c1: company };
    for (let i = 0; i < 4; i += 1) {
      companies[`rival-${i}`] = makeCompany({ id: `rival-${i}`, ownerId: `rival-owner-${i}`, productCategoryId: "toys" });
    }
    const state = makeState({ companies });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.causeHypotheses.some((h) => h.id === "high-competition")).toBe(true);
    expect(advice.options.some((o) => o.id === "consider-industry-switch")).toBe(true);
  });

  it("does not suggest an industry switch when even the closest category is above the cost-ratio threshold (food's best alternative is too dissimilar)", () => {
    const company = makeCompany({ productCategoryId: "food" });
    const companies: Record<string, CompanyState> = { c1: company };
    for (let i = 0; i < 4; i += 1) {
      companies[`rival-${i}`] = makeCompany({ id: `rival-${i}`, ownerId: `rival-owner-${i}`, productCategoryId: "food" });
    }
    const state = makeState({ companies });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.causeHypotheses.some((h) => h.id === "high-competition")).toBe(true);
    expect(advice.options.some((o) => o.id === "consider-industry-switch")).toBe(false);
    expect(advice.options.some((o) => o.id === "maintain-strategy")).toBe(true);
  });

  it("honors a custom industrySwitchCostRatioForSuggestion rule (boundary case)", () => {
    const company = makeCompany({ productCategoryId: "food" });
    const companies: Record<string, CompanyState> = { c1: company };
    for (let i = 0; i < 4; i += 1) {
      companies[`rival-${i}`] = makeCompany({ id: `rival-${i}`, ownerId: `rival-owner-${i}`, productCategoryId: "food" });
    }
    const state = makeState({ companies });

    // food -> apparel 유사도는 0.2, 전환비용 비율은 0.8. 기본 임계값(0.6)으로는 제안되지
    // 않지만, 임계값을 완화하면(0.9) 제안이 나와야 한다 — 임계값이 실제로 결과를 바꾸는지 검증.
    const relaxedAdvice = analyzeCompanyTurn(state, "c1", {
      ...DEFAULT_ADVISOR_RULES,
      industrySwitchCostRatioForSuggestion: 0.9,
    });
    expect(relaxedAdvice.options.some((o) => o.id === "consider-industry-switch")).toBe(true);

    const defaultAdvice = analyzeCompanyTurn(state, "c1");
    expect(defaultAdvice.options.some((o) => o.id === "consider-industry-switch")).toBe(false);
  });

  it("all returned options always have 2 or 3 entries with non-empty pros/risks across scenarios", () => {
    const scenarios: GameState[] = [
      makeState({ companies: { c1: makeCompany() } }),
      makeState({
        companies: { c1: makeCompany({ lastWholesalePrice: 100 }) },
        wholesaleListings: [{ id: "wl", companyId: "other", categoryId: "food", quantityAvailable: 1, quality: 0.9, price: 5 }],
      }),
      makeState({
        companies: { c1: makeCompany({ inventoryQuantity: 50 }) },
        roundMetrics: [
          {
            ...emptyMetricsShape(1),
            companyProfit: { c1: -100 },
            companyMarketShare: { c1: 0.1 },
            companyUnitsProduced: { c1: 60 },
            companyUnitsSoldWholesale: { c1: 10 },
            companyRevenue: { c1: 100 },
          },
        ],
      }),
    ];

    for (const state of scenarios) {
      expectWellFormedAdvice(analyzeCompanyTurn(state, "c1"));
    }
  });

  it("handles a company with no product category chosen yet (productCategoryId: null) without crashing", () => {
    // 현재 실제 게임 흐름(src/engine/simulateGame.ts, src/multiplayer/GameSession.ts)에서는
    // 기업 턴이 진행되기 전에 항상 productCategoryId가 채워지므로 null은 실제로 발생하지
    // 않는 것으로 보이지만, 타입상 허용된 상태(ProductCategoryId | null)이고 다른 유닛
    // 테스트(tests/economy/humanDecisions.test.ts 등)도 이 값을 방어적으로 다루므로
    // analyzeCompanyTurn도 안전해야 한다.
    const company = makeCompany({ productCategoryId: null, inventoryQuantity: 5 });
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: 10 },
      companyMarketShare: { c1: 0 },
      companyUnitsProduced: { c1: 0 },
      companyUnitsSoldWholesale: { c1: 0 },
      companyRevenue: { c1: 0 },
    };
    const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

    const advice = analyzeCompanyTurn(state, "c1");

    expectWellFormedAdvice(advice);
    expect(advice.causeHypotheses.some((h) => h.id === "high-competition")).toBe(false);
    expect(advice.options.some((o) => o.id === "consider-industry-switch")).toBe(false);
    expect(advice.options.some((o) => o.id === "maintain-strategy")).toBe(true);
  });

  it("handles a company with zero inventory and no production/sales history without division-by-zero artifacts", () => {
    const company = makeCompany({ inventoryQuantity: 0 });
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: 0 },
      companyMarketShare: { c1: 0 },
      companyUnitsProduced: { c1: 0 },
      companyUnitsSoldWholesale: { c1: 0 },
      companyRevenue: { c1: 0 },
    };
    const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

    const advice = analyzeCompanyTurn(state, "c1");

    expectWellFormedAdvice(advice);
    // unitsProduced가 0이면 재고율(carryover ÷ produced)은 정의되지 않아야 하고(0으로
    // 나누지 않아야 하고), 그로 인해 잘못 "재고 과잉" 경고가 뜨면 안 된다.
    expect(advice.causeHypotheses.some((h) => h.id === "high-inventory-carryover")).toBe(false);
  });

  it("handles a near-bankrupt company (cash near zero / negative) without crashing", () => {
    const company = makeCompany({ ledger: { cash: -50, cumulativeProfit: -850 }, inventoryQuantity: 12 });
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: -300 },
      companyMarketShare: { c1: 0.05 },
      companyUnitsProduced: { c1: 20 },
      companyUnitsSoldWholesale: { c1: 8 },
      companyRevenue: { c1: 80 },
    };
    const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

    const advice = analyzeCompanyTurn(state, "c1");

    expectWellFormedAdvice(advice);
    expect(advice.causeHypotheses.some((h) => h.id === "negative-profit")).toBe(true);
    expect(advice.causeHypotheses.some((h) => h.id === "high-inventory-carryover")).toBe(true);
  });

  it("does not produce negative/nonsensical wording when carryover inventory lets unitsSoldWholesale exceed unitsProduced", () => {
    // 이월 재고 덕분에 이번 라운드 도매 판매량이 직전 라운드 생산량을 넘어서는, 실제 시뮬레이션에서
    // 관측되는 정상적인 상황 (경제 로직 버그 아님). "생산 X개 중 Y개 미판매"처럼 생산-판매를 빼는
    // 산식을 문구에 쓰면 음수가 나오므로, 그런 표현이 없는지 검증한다.
    const unitsProduced = 16;
    const unitsSoldWholesale = 20.5;
    const inventoryQuantity = 10; // ratio 10/16 = 0.625, above default threshold 0.5
    const company = makeCompany({ inventoryQuantity });
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: 10 },
      companyMarketShare: { c1: 0.2 },
      companyUnitsProduced: { c1: unitsProduced },
      companyUnitsSoldWholesale: { c1: unitsSoldWholesale },
      companyRevenue: { c1: 50 },
    };
    const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

    const advice = analyzeCompanyTurn(state, "c1");

    expect(advice.causeHypotheses.some((h) => h.id === "high-inventory-carryover")).toBe(true);
    expect(advice.options.some((o) => o.id === "reduce-production")).toBe(true);

    const allText = [
      ...advice.situationSummary,
      ...advice.causeHypotheses.flatMap((h) => [h.description, h.evidence]),
      ...advice.options.flatMap((o) => [o.title, ...o.pros, ...o.risks]),
    ].join("\n");

    expect(allText).not.toMatch(/-\d/);
    expect(allText).not.toContain("미판매");
  });

  it("never exposes fractional units (개) even when underlying quantities are decimals", () => {
    const company = makeCompany({ inventoryQuantity: 25.5, lastWholesalePrice: 10 });
    const metrics: RoundMetrics = {
      ...emptyMetricsShape(1),
      companyProfit: { c1: 10 },
      companyMarketShare: { c1: 0.2 },
      companyUnitsProduced: { c1: 16.4 },
      companyUnitsSoldWholesale: { c1: 20.5 },
      companyRevenue: { c1: 50 },
    };
    const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

    const advice = analyzeCompanyTurn(state, "c1");

    const allText = [
      ...advice.situationSummary,
      ...advice.causeHypotheses.flatMap((h) => [h.description, h.evidence]),
      ...advice.options.flatMap((o) => [o.title, ...o.pros, ...o.risks]),
    ].join("\n");

    expect(allText).not.toMatch(/\d+\.\d+개/);
  });

  describe("every AdvisorRules threshold actually changes behavior when overridden (ADVISOR_RULES.md: no hardcoded thresholds)", () => {
    it("highInventoryCarryoverRatio: tightening it flags a carryover ratio that the default would not", () => {
      const unitsProduced = 20;
      const inventoryQuantity = 8; // ratio 0.4: below default 0.5, above a tightened 0.3
      const company = makeCompany({ inventoryQuantity });
      const metrics: RoundMetrics = {
        ...emptyMetricsShape(1),
        companyProfit: { c1: 10 },
        companyMarketShare: { c1: 0.2 },
        companyUnitsProduced: { c1: unitsProduced },
        companyUnitsSoldWholesale: { c1: unitsProduced - inventoryQuantity },
        companyRevenue: { c1: 50 },
      };
      const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

      expect(analyzeCompanyTurn(state, "c1").causeHypotheses.some((h) => h.id === "high-inventory-carryover")).toBe(false);
      const tightened = analyzeCompanyTurn(state, "c1", { ...DEFAULT_ADVISOR_RULES, highInventoryCarryoverRatio: 0.3 });
      expect(tightened.causeHypotheses.some((h) => h.id === "high-inventory-carryover")).toBe(true);
    });

    it("highPriceVsMarketRatio: loosening it stops flagging a price the default would flag as too high", () => {
      const company = makeCompany({ lastWholesalePrice: 13 }); // 1.3x market average of 10
      const state = makeState({
        companies: { c1: company },
        wholesaleListings: [
          { id: "wl-a", companyId: "other-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      });

      expect(analyzeCompanyTurn(state, "c1").causeHypotheses.some((h) => h.id === "price-above-market")).toBe(true);
      const loosened = analyzeCompanyTurn(state, "c1", { ...DEFAULT_ADVISOR_RULES, highPriceVsMarketRatio: 1.5 });
      expect(loosened.causeHypotheses.some((h) => h.id === "price-above-market")).toBe(false);
    });

    it("lowPriceVsMarketRatio: loosening it stops flagging a price the default would flag as too low", () => {
      const company = makeCompany({ lastWholesalePrice: 7 }); // 0.7x market average of 10
      const state = makeState({
        companies: { c1: company },
        wholesaleListings: [
          { id: "wl-a", companyId: "other-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      });

      expect(analyzeCompanyTurn(state, "c1").causeHypotheses.some((h) => h.id === "price-below-market")).toBe(true);
      const loosened = analyzeCompanyTurn(state, "c1", { ...DEFAULT_ADVISOR_RULES, lowPriceVsMarketRatio: 0.5 });
      expect(loosened.causeHypotheses.some((h) => h.id === "price-below-market")).toBe(false);
    });

    it("lowQualityGapVsMarket: tightening it flags a quality gap the default would not", () => {
      const company = makeCompany({ quality: 0.45 }); // market average 0.5 => gap 0.05
      const state = makeState({
        companies: { c1: company },
        wholesaleListings: [
          { id: "wl-a", companyId: "other-a", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
        ],
      });

      expect(analyzeCompanyTurn(state, "c1").causeHypotheses.some((h) => h.id === "quality-below-market")).toBe(false);
      const tightened = analyzeCompanyTurn(state, "c1", { ...DEFAULT_ADVISOR_RULES, lowQualityGapVsMarket: 0.03 });
      expect(tightened.causeHypotheses.some((h) => h.id === "quality-below-market")).toBe(true);
    });

    it("negativeProfitThreshold: raising it (above 0) flags a small positive profit as a loss", () => {
      const company = makeCompany();
      const metrics: RoundMetrics = {
        ...emptyMetricsShape(1),
        companyProfit: { c1: 5 },
        companyMarketShare: { c1: 0.2 },
        companyUnitsProduced: { c1: 10 },
        companyUnitsSoldWholesale: { c1: 10 },
        companyRevenue: { c1: 50 },
      };
      const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

      expect(analyzeCompanyTurn(state, "c1").causeHypotheses.some((h) => h.id === "negative-profit")).toBe(false);
      const raised = analyzeCompanyTurn(state, "c1", { ...DEFAULT_ADVISOR_RULES, negativeProfitThreshold: 10 });
      expect(raised.causeHypotheses.some((h) => h.id === "negative-profit")).toBe(true);
    });

    it("lowProfitMarginRatio: raising it flags a healthy-looking margin the default would not", () => {
      const company = makeCompany();
      const metrics: RoundMetrics = {
        ...emptyMetricsShape(1),
        companyProfit: { c1: 20 }, // margin 0.2 on revenue 100
        companyMarketShare: { c1: 0.2 },
        companyUnitsProduced: { c1: 10 },
        companyUnitsSoldWholesale: { c1: 10 },
        companyRevenue: { c1: 100 },
      };
      const state = makeState({ companies: { c1: company }, roundMetrics: [metrics] });

      expect(analyzeCompanyTurn(state, "c1").causeHypotheses.some((h) => h.id === "low-profit-margin")).toBe(false);
      const raised = analyzeCompanyTurn(state, "c1", { ...DEFAULT_ADVISOR_RULES, lowProfitMarginRatio: 0.3 });
      expect(raised.causeHypotheses.some((h) => h.id === "low-profit-margin")).toBe(true);
    });

    it("highCompetitorCount: lowering it flags competition the default would not", () => {
      const company = makeCompany({ productCategoryId: "food" });
      const companies: Record<string, CompanyState> = { c1: company };
      for (let i = 0; i < 2; i += 1) {
        companies[`rival-${i}`] = makeCompany({ id: `rival-${i}`, ownerId: `rival-owner-${i}`, productCategoryId: "food" });
      }
      const state = makeState({ companies });

      expect(analyzeCompanyTurn(state, "c1").causeHypotheses.some((h) => h.id === "high-competition")).toBe(false);
      const lowered = analyzeCompanyTurn(state, "c1", { ...DEFAULT_ADVISOR_RULES, highCompetitorCount: 2 });
      expect(lowered.causeHypotheses.some((h) => h.id === "high-competition")).toBe(true);
    });
  });
});
