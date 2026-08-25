import { describe, expect, it } from "vitest";
import { blendQuality, eligibleRetailListingsForHousehold, eligibleWholesaleListingsForStore } from "../../src/economy/market.js";
import type { CompanyState, HouseholdState, RetailListing, StoreState, WholesaleListing } from "../../src/types/domain.js";

function makeCompany(overrides: Partial<CompanyState> = {}): CompanyState {
  return {
    id: "company-1",
    ownerId: "student-1",
    kind: "student",
    districtId: "downtown",
    ledger: { cash: 100, cumulativeProfit: 0 },
    strategyId: "stable",
    productCategoryId: "food",
    quality: 0.5,
    inventoryQuantity: 0,
    lastWholesalePrice: 0,
    ...overrides,
  };
}

function makeStore(overrides: Partial<StoreState> = {}): StoreState {
  return {
    id: "store-1",
    ownerId: "student-1",
    kind: "student",
    districtId: "downtown",
    ledger: { cash: 100, cumulativeProfit: 0 },
    strategyId: "stable",
    specialtyCategoryId: "food",
    inventoryQuantity: 0,
    inventoryQuality: 0,
    retailPrice: 0,
    ...overrides,
  };
}

function makeHousehold(overrides: Partial<HouseholdState> = {}): HouseholdState {
  return {
    id: "household-1",
    ownerId: "student-1",
    kind: "student",
    ledger: { cash: 0, cumulativeProfit: 0 },
    strategyId: "stable",
    budgetPerRound: 100,
    satisfactionScore: 0,
    ...overrides,
  };
}

describe("eligibleWholesaleListingsForStore (D-005 self-trade ban)", () => {
  it("excludes listings from a company owned by the same student", () => {
    const store = makeStore({ ownerId: "student-1" });
    const ownCompany = makeCompany({ id: "own-co", ownerId: "student-1" });
    const otherCompany = makeCompany({ id: "other-co", ownerId: "student-2" });
    const listings: WholesaleListing[] = [
      { id: "l1", companyId: "own-co", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 5 },
      { id: "l2", companyId: "other-co", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 5 },
    ];

    const eligible = eligibleWholesaleListingsForStore(store, listings, {
      "own-co": ownCompany,
      "other-co": otherCompany,
    });

    expect(eligible.map((l) => l.id)).toEqual(["l2"]);
  });
});

describe("eligibleRetailListingsForHousehold (D-006 self-trade ban)", () => {
  it("excludes listings from a store owned by the same student", () => {
    const household = makeHousehold({ ownerId: "student-1" });
    const ownStore = makeStore({ id: "own-store", ownerId: "student-1" });
    const otherStore = makeStore({ id: "other-store", ownerId: "student-2" });
    const listings: RetailListing[] = [
      { id: "r1", storeId: "own-store", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 5 },
      { id: "r2", storeId: "other-store", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 5 },
    ];

    const eligible = eligibleRetailListingsForHousehold(household, listings, {
      "own-store": ownStore,
      "other-store": otherStore,
    });

    expect(eligible.map((l) => l.id)).toEqual(["r2"]);
  });
});

describe("blendQuality", () => {
  it("returns the added quality when there is no existing inventory", () => {
    expect(blendQuality(0, 0, 5, 0.8)).toBe(0.8);
  });

  it("computes a quantity-weighted average", () => {
    expect(blendQuality(10, 0.4, 10, 0.8)).toBeCloseTo(0.6);
  });
});
