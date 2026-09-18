import { beforeEach, describe, expect, it, vi } from "vitest";
import * as humanDecisions from "../../src/economy/humanDecisions.js";
import { resolveHouseholdPurchases, type CategoryPurchaseRequest } from "../../src/economy/humanDecisions.js";
import {
  computeAvailableCash,
  computeCompanyFixedCost,
  computeHouseholdTotalBudget,
  computeMaxAffordable,
  computeProductionCost,
  computeStoreFixedCost,
  filterEligibleRetailListings,
  filterEligibleWholesaleListings,
  isOverBudget,
  previewCategoryPurchase,
} from "../../src/ui/turnCalculations.js";
import { COSTS, DISTRICTS } from "../../src/economy/config.js";
import { createRng } from "../../src/economy/rng.js";
import type { ActiveTrendEvent } from "../../src/economy/trendEvent.js";
import { MAX_HOUSEHOLD_PURCHASE_UNITS } from "../../src/npc/decisions.js";
import type { CompanyState, RetailListing, StoreState, WholesaleListing } from "../../src/types/domain.js";

describe("turnCalculations", () => {
  describe("computeCompanyFixedCost / computeStoreFixedCost", () => {
    it("matches baseLaborCost + baseRentCost * rentMultiplier for company", () => {
      const districtId = "downtown";
      const expected = COSTS.baseLaborCostCompany + COSTS.baseRentCompany * DISTRICTS[districtId].rentMultiplier;
      expect(computeCompanyFixedCost(districtId)).toBe(expected);
    });

    it("matches baseLaborCost + baseRentCost * rentMultiplier for store", () => {
      const districtId = "outskirts";
      const expected = COSTS.baseLaborCostStore + COSTS.baseRentStore * DISTRICTS[districtId].rentMultiplier;
      expect(computeStoreFixedCost(districtId)).toBe(expected);
    });

    it("differs across districts because rentMultiplier differs", () => {
      expect(computeCompanyFixedCost("industrial")).not.toBe(computeCompanyFixedCost("upscale"));
    });
  });

  describe("computeAvailableCash", () => {
    it("subtracts fixed cost from cash", () => {
      expect(computeAvailableCash(1000, 300)).toBe(700);
    });

    it("clamps to 0 when fixed cost exceeds cash", () => {
      expect(computeAvailableCash(100, 300)).toBe(0);
    });

    it("returns 0 when cash exactly equals fixed cost", () => {
      expect(computeAvailableCash(300, 300)).toBe(0);
    });
  });

  describe("computeMaxAffordable", () => {
    it("floors availableCash / unitCost", () => {
      expect(computeMaxAffordable(100, 3)).toBe(33);
    });

    it("returns 0 when unitCost is 0 (e.g. productCategoryId is null)", () => {
      expect(computeMaxAffordable(100, 0)).toBe(0);
    });

    it("returns 0 when unitCost is negative (defensive)", () => {
      expect(computeMaxAffordable(100, -5)).toBe(0);
    });

    it("returns 0 when availableCash is 0", () => {
      expect(computeMaxAffordable(0, 5)).toBe(0);
    });
  });

  describe("computeProductionCost", () => {
    it("multiplies quantity by unit cost", () => {
      expect(computeProductionCost(10, 4.5)).toBe(45);
    });

    it("is 0 when quantity is 0", () => {
      expect(computeProductionCost(0, 4.5)).toBe(0);
    });
  });

  describe("isOverBudget", () => {
    it("is false when cost equals budget exactly", () => {
      expect(isOverBudget(100, 100)).toBe(false);
    });

    it("is true when cost exceeds budget", () => {
      expect(isOverBudget(101, 100)).toBe(true);
    });

    it("is false when cost is below budget", () => {
      expect(isOverBudget(50, 100)).toBe(false);
    });
  });

  describe("computeHouseholdTotalBudget", () => {
    it("adds cash and budgetPerRound", () => {
      expect(computeHouseholdTotalBudget(50, 100)).toBe(150);
    });
  });

  describe("filterEligibleWholesaleListings", () => {
    const listings: WholesaleListing[] = [
      { id: "w1", companyId: "c1", categoryId: "food", quantityAvailable: 5, quality: 0.5, price: 10 },
      { id: "w2", companyId: "c2", categoryId: "apparel", quantityAvailable: 5, quality: 0.5, price: 10 },
      { id: "w3", companyId: "c3", categoryId: "food", quantityAvailable: 0, quality: 0.5, price: 10 },
    ];

    it("keeps only listings matching the specialty category with stock remaining", () => {
      const result = filterEligibleWholesaleListings(listings, "food");
      expect(result.map((l) => l.id)).toEqual(["w1"]);
    });

    it("returns empty array when specialtyCategoryId is null", () => {
      expect(filterEligibleWholesaleListings(listings, null)).toEqual([]);
    });

    it("excludes listings with 0 quantityAvailable even if category matches", () => {
      const result = filterEligibleWholesaleListings(listings, "food");
      expect(result.find((l) => l.id === "w3")).toBeUndefined();
    });
  });

  describe("filterEligibleRetailListings", () => {
    const listings: RetailListing[] = [
      { id: "r1", storeId: "s1", categoryId: "food", quantityAvailable: 3, quality: 0.5, price: 10 },
      { id: "r2", storeId: "s2", categoryId: "toys", quantityAvailable: 0, quality: 0.5, price: 10 },
    ];

    it("keeps only listings with stock remaining", () => {
      const result = filterEligibleRetailListings(listings);
      expect(result.map((l) => l.id)).toEqual(["r1"]);
    });

    it("returns empty array for empty input", () => {
      expect(filterEligibleRetailListings([])).toEqual([]);
    });
  });

  /**
   * 구매 매칭 알고리즘 재설계 Stage 2: 화면 실시간 미리보기가 서버가 실제로 쓰는 계산과
   * 갈라지지 않도록, previewCategoryPurchase가 정말로 humanDecisions.resolveSingleCategoryPurchase를
   * 그대로 호출하는지 확인한다(별도 계산 로직을 베껴 쓰지 않았는지, D-033류 재발 방지).
   */
  describe("previewCategoryPurchase", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    const wholesaleListings: WholesaleListing[] = [
      { id: "w1", companyId: "other-company", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 10 },
    ];
    const companies: Record<string, CompanyState> = {
      "other-company": {
        id: "other-company",
        ownerId: "other-student",
        kind: "student",
        districtId: "downtown",
        ledger: { cash: 0, cumulativeProfit: 0 },
        strategyId: "stable",
        productCategoryId: "food",
        quality: 0.5,
        inventoryQuantity: 0,
        lastWholesalePrice: 10,
        lastIndustrySwitchRound: null,
        isAdvertisingActive: false,
      },
    };

    it("delegates directly to resolveSingleCategoryPurchase (same arguments, same return value)", () => {
      const spy = vi.spyOn(humanDecisions, "resolveSingleCategoryPurchase");
      const request = { priorityPicks: [{ listingId: "w1", quantity: 2 }], maxQuantity: 2 };
      const rng = createRng(1);

      const result = previewCategoryPurchase(wholesaleListings, companies, "buyer-student", request, 1000, 10, rng);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(wholesaleListings, companies, "buyer-student", request, 1000, 10, rng, undefined);
      expect(result).toEqual(spy.mock.results[0]!.value);
      expect(result.purchases).toEqual([{ listingId: "w1", quantity: 2, unitPrice: 10 }]);
    });

    it("forwards trendEvent to resolveSingleCategoryPurchase as the 8th argument (Milestone 6 제안 C, D-039)", () => {
      const spy = vi.spyOn(humanDecisions, "resolveSingleCategoryPurchase");
      const request = { priorityPicks: [{ listingId: "w1", quantity: 2 }], maxQuantity: 2 };
      const rng = createRng(1);
      const trendEvent: ActiveTrendEvent = { categoryId: "food", priorityBonus: 0.1 };

      previewCategoryPurchase(wholesaleListings, companies, "buyer-student", request, 1000, 10, rng, trendEvent);

      expect(spy).toHaveBeenCalledWith(wholesaleListings, companies, "buyer-student", request, 1000, 10, rng, trendEvent);
    });

    it("with/without trendEvent produces different results for retail listings when it flips the ranking", () => {
      // food/toys reference prices: CATEGORY_UNIT_COST(4/8) * REFERENCE_PRICE_MULTIPLIER(2.2) = 8.8/17.6.
      const retailListings: RetailListing[] = [
        { id: "r-food", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 8.8 },
        { id: "r-toys", storeId: "store-a", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 17.6 },
      ];
      const stores: Record<string, StoreState> = {
        "store-a": {
          id: "store-a",
          ownerId: "other-student",
          kind: "student",
          districtId: "downtown",
          ledger: { cash: 0, cumulativeProfit: 0 },
          strategyId: "stable",
          specialtyCategoryId: null,
          currentSellingCategoryId: null,
          inventoryQuantity: 0,
          inventoryQuality: 0,
          retailPrice: 0,
          lastSellingCategoryChangeRound: null,
          isAdvertisingActive: false,
        },
      };
      const request = { categoryId: "food" as const, priorityPicks: [], maxQuantity: 1, autoFillPreference: "quality" as const };
      const trendEvent: ActiveTrendEvent = { categoryId: "toys", priorityBonus: 0.1 };

      const withoutTrend = previewCategoryPurchase(retailListings, stores, "buyer-student", request, 1000, 1, createRng(1));
      const withTrend = previewCategoryPurchase(retailListings, stores, "buyer-student", request, 1000, 1, createRng(1), trendEvent);

      expect(withTrend.purchases[0]!.listingId).toBe("r-toys");
      expect(withoutTrend.purchases[0]!.listingId).not.toBe(withTrend.purchases[0]!.listingId);
    });
  });

  /**
   * 엔진(resolveHouseholdPurchases)과 화면 미리보기(previewCategoryPurchase, 카테고리별 순차
   * 호출)가 동일한 state/request로 완전히 같은 purchases를 내는지 확인한다 — D-037류(엔진은
   * 반영하는데 화면 미리보기는 반영 안 하는 수치 불일치) 표시 버그를 테스트로 고정한다
   * (Milestone 6 제안 C, D-039).
   */
  describe("resolveHouseholdPurchases (engine) vs previewCategoryPurchase (UI) parity with trendEvent", () => {
    const retailListings: RetailListing[] = [
      { id: "r-food", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 8.8 },
      { id: "r-apparel", storeId: "store-a", categoryId: "apparel", quantityAvailable: 10, quality: 0.5, price: 13.2 },
      { id: "r-toys", storeId: "store-a", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 17.6 },
    ];
    const stores: Record<string, StoreState> = {
      "store-a": {
        id: "store-a",
        ownerId: "other-student",
        kind: "student",
        districtId: "downtown",
        ledger: { cash: 0, cumulativeProfit: 0 },
        strategyId: "stable",
        specialtyCategoryId: null,
        currentSellingCategoryId: null,
        inventoryQuantity: 0,
        inventoryQuality: 0,
        retailPrice: 0,
        lastSellingCategoryChangeRound: null,
        isAdvertisingActive: false,
      },
    };
    const household = {
      id: "household-1",
      ownerId: "buyer-student",
      kind: "student" as const,
      ledger: { cash: 100, cumulativeProfit: 0 },
      strategyId: "stable" as const,
      budgetPerRound: 100,
      satisfactionScore: 0,
    };
    const requests: CategoryPurchaseRequest[] = [
      { categoryId: "food", priorityPicks: [], maxQuantity: 2, autoFillPreference: "quality" },
      { categoryId: "apparel", priorityPicks: [], maxQuantity: 2, autoFillPreference: "quality" },
      { categoryId: "toys", priorityPicks: [], maxQuantity: 2, autoFillPreference: "quality" },
    ];
    const trendEvent: ActiveTrendEvent = { categoryId: "toys", priorityBonus: 0.1 };

    it("produces identical purchases whether computed via resolveHouseholdPurchases or via sequential previewCategoryPurchase calls", () => {
      const engineResult = resolveHouseholdPurchases(household, 1000, retailListings, stores, requests, createRng(1), trendEvent);

      // Mirrors HouseholdTurnScreen.tsx's loop: same category order as `requests` (already
      // food -> apparel -> toys, matching orderCategoriesByFixedPriority), sharing one rng and
      // running cash/unit budgets across categories.
      const uiPurchases = [];
      let remainingCash = 1000;
      let remainingUnits = MAX_HOUSEHOLD_PURCHASE_UNITS;
      const rng = createRng(1);
      for (const request of requests) {
        const eligibleForCategory = retailListings.filter((l) => l.categoryId === request.categoryId);
        const preview = previewCategoryPurchase(
          eligibleForCategory,
          stores,
          household.ownerId,
          request,
          remainingCash,
          remainingUnits,
          rng,
          trendEvent,
        );
        uiPurchases.push(...preview.purchases);
        remainingCash -= preview.spentCash;
        remainingUnits -= preview.spentUnits;
      }

      expect(uiPurchases).toEqual(engineResult.purchases);
    });
  });
});
