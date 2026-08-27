import { describe, expect, it } from "vitest";
import {
  computeAvailableCash,
  computeCompanyFixedCost,
  computeHouseholdTotalBudget,
  computeStoreFixedCost,
} from "../../src/economy/costs.js";
import { COSTS, DISTRICTS } from "../../src/economy/config.js";

describe("economy/costs (moved from src/ui/turnCalculations)", () => {
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

  describe("computeHouseholdTotalBudget", () => {
    it("adds cash and budgetPerRound", () => {
      expect(computeHouseholdTotalBudget(50, 100)).toBe(150);
    });
  });
});
