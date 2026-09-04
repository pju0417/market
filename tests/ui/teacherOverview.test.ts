import { describe, expect, it } from "vitest";
import { buildInitialGameState } from "../../src/engine/simulateGame.js";
import { computeCompanyRanking, computeRoundTrend, computeStoreRanking } from "../../src/ui/teacherOverview.js";
import type { RoundMetrics } from "../../src/types/domain.js";

describe("teacherOverview", () => {
  it("computeCompanyRanking sorts by cumulativeProfit descending and marks student/npc kind", () => {
    const state = buildInitialGameState(2, 1);
    const companyIds = Object.keys(state.companies);
    expect(companyIds.length).toBeGreaterThan(2);

    // 임의로 누적손익을 부여해 정렬이 실제로 적용되는지 확인한다.
    companyIds.forEach((id, index) => {
      state.companies[id]!.ledger.cumulativeProfit = index * 100;
    });

    const ranking = computeCompanyRanking(state);
    expect(ranking.length).toBe(companyIds.length);
    for (let i = 0; i < ranking.length - 1; i += 1) {
      expect(ranking[i]!.cumulativeProfit).toBeGreaterThanOrEqual(ranking[i + 1]!.cumulativeProfit);
    }

    const kinds = new Set(ranking.map((row) => row.kind));
    expect(kinds.has("student")).toBe(true);
    expect(kinds.has("npc")).toBe(true);
  });

  it("computeCompanyRanking returns undefined latestRoundProfit/latestMarketShare when roundMetrics is empty", () => {
    const state = buildInitialGameState(1, 1);
    expect(state.roundMetrics).toEqual([]);

    const ranking = computeCompanyRanking(state);
    for (const row of ranking) {
      expect(row.latestRoundProfit).toBeUndefined();
      expect(row.latestMarketShare).toBeUndefined();
    }
  });

  it("computeCompanyRanking reads latestRoundProfit/latestMarketShare from the last roundMetrics entry", () => {
    const state = buildInitialGameState(1, 1);
    const companyId = Object.keys(state.companies)[0]!;

    const oldMetrics: RoundMetrics = {
      round: 1,
      companyProfit: { [companyId]: -999 },
      storeProfit: {},
      companyMarketShare: { [companyId]: 0.01 },
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
    };
    const latestMetrics: RoundMetrics = {
      round: 2,
      companyProfit: { [companyId]: 500 },
      storeProfit: {},
      companyMarketShare: { [companyId]: 0.42 },
      storeMarketShare: {},
      totalWholesaleVolume: 10,
      totalWholesaleValue: 1000,
      totalRetailVolume: 8,
      totalRetailValue: 900,
      averageHouseholdSatisfaction: 0.5,
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
    };
    state.roundMetrics.push(oldMetrics, latestMetrics);

    const ranking = computeCompanyRanking(state);
    const row = ranking.find((r) => r.id === companyId);
    expect(row).toBeDefined();
    expect(row!.latestRoundProfit).toBe(500);
    expect(row!.latestMarketShare).toBe(0.42);
  });

  it("computeStoreRanking sorts by cumulativeProfit descending", () => {
    const state = buildInitialGameState(2, 1);
    const storeIds = Object.keys(state.stores);
    storeIds.forEach((id, index) => {
      state.stores[id]!.ledger.cumulativeProfit = (storeIds.length - index) * 10;
    });

    const ranking = computeStoreRanking(state);
    expect(ranking.length).toBe(storeIds.length);
    for (let i = 0; i < ranking.length - 1; i += 1) {
      expect(ranking[i]!.cumulativeProfit).toBeGreaterThanOrEqual(ranking[i + 1]!.cumulativeProfit);
    }
  });

  it("computeRoundTrend returns roundMetrics as-is", () => {
    const state = buildInitialGameState(1, 1);
    expect(computeRoundTrend(state)).toEqual([]);

    const metrics: RoundMetrics = {
      round: 1,
      companyProfit: {},
      storeProfit: {},
      companyMarketShare: {},
      storeMarketShare: {},
      totalWholesaleVolume: 5,
      totalWholesaleValue: 500,
      totalRetailVolume: 3,
      totalRetailValue: 300,
      averageHouseholdSatisfaction: 0.6,
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
    };
    state.roundMetrics.push(metrics);

    expect(computeRoundTrend(state)).toEqual([metrics]);
  });
});
