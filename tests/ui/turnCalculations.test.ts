import { beforeEach, describe, expect, it, vi } from "vitest";
import * as humanDecisions from "../../src/economy/humanDecisions.js";
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
import type { CompanyState, RetailListing, WholesaleListing } from "../../src/types/domain.js";

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
      },
    };

    it("delegates directly to resolveSingleCategoryPurchase (same arguments, same return value)", () => {
      const spy = vi.spyOn(humanDecisions, "resolveSingleCategoryPurchase");
      const request = { priorityPicks: [{ listingId: "w1", quantity: 2 }], maxQuantity: 2 };
      const rng = createRng(1);

      const result = previewCategoryPurchase(wholesaleListings, companies, "buyer-student", request, 1000, 10, rng);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(wholesaleListings, companies, "buyer-student", request, 1000, 10, rng);
      expect(result).toEqual(spy.mock.results[0]!.value);
      expect(result.purchases).toEqual([{ listingId: "w1", quantity: 2, unitPrice: 10 }]);
    });
  });
});
