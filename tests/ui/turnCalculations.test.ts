import { describe, expect, it } from "vitest";
import {
  computeAvailableCash,
  computeCompanyFixedCost,
  computeHouseholdTotalBudget,
  computeMaxAffordable,
  computeProductionCost,
  computeStoreFixedCost,
  computeTotalCost,
  filterEligibleRetailListings,
  filterEligibleWholesaleListings,
  isOverBudget,
  sumQuantities,
} from "../../src/ui/turnCalculations.js";
import { COSTS, DISTRICTS } from "../../src/economy/config.js";
import type { RetailListing, WholesaleListing } from "../../src/types/domain.js";

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

  describe("computeTotalCost", () => {
    const listings = [
      { id: "a", price: 10 },
      { id: "b", price: 20 },
    ];

    it("sums price * quantity across listings", () => {
      expect(computeTotalCost(listings, { a: 2, b: 1 })).toBe(40);
    });

    it("treats missing quantities as 0", () => {
      expect(computeTotalCost(listings, { a: 3 })).toBe(30);
    });

    it("is 0 for empty listings", () => {
      expect(computeTotalCost([], { a: 3 })).toBe(0);
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

  describe("sumQuantities", () => {
    it("sums all quantity values", () => {
      expect(sumQuantities({ a: 1, b: 2, c: 3 })).toBe(6);
    });

    it("is 0 for empty record", () => {
      expect(sumQuantities({})).toBe(0);
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
});
