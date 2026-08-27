import { describe, expect, it } from "vitest";
import { createRng } from "../../src/economy/rng.js";
import {
  decideCompanyProduction,
  decideHouseholdPurchases,
  decideStorePurchases,
  scoreListingForBuyer,
} from "../../src/npc/decisions.js";
import type { CompanyState, HouseholdState, RetailListing, StoreState, WholesaleListing } from "../../src/types/domain.js";

function makeCompany(overrides: Partial<CompanyState> = {}): CompanyState {
  return {
    id: "company-1",
    ownerId: "student-1",
    kind: "student",
    districtId: "downtown",
    ledger: { cash: 1000, cumulativeProfit: 0 },
    strategyId: "stable",
    productCategoryId: "food",
    quality: 0,
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
    ledger: { cash: 1000, cumulativeProfit: 0 },
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
    ledger: { cash: 100, cumulativeProfit: 0 },
    strategyId: "stable",
    budgetPerRound: 100,
    satisfactionScore: 0,
    ...overrides,
  };
}

describe("decideCompanyProduction", () => {
  it("never spends more than availableCash", () => {
    const company = makeCompany();
    const rng = createRng(1);
    const decision = decideCompanyProduction(company, 37, rng);

    expect(decision).not.toBeNull();
    expect(decision!.productionCost).toBeLessThanOrEqual(37);
  });

  it("returns null when the company has no assigned category", () => {
    const company = makeCompany({ productCategoryId: null });
    const rng = createRng(1);

    expect(decideCompanyProduction(company, 1000, rng)).toBeNull();
  });

  it("produces nothing when there is no cash available", () => {
    const company = makeCompany();
    const rng = createRng(1);
    const decision = decideCompanyProduction(company, 0, rng);

    expect(decision!.quantity).toBe(0);
  });

  it("produces less when unsold inventory is already high, even with ample cash (order-up-to policy)", () => {
    const freshCompany = makeCompany({ inventoryQuantity: 0 });
    const stockedCompany = makeCompany({ inventoryQuantity: 1000 });
    const rng1 = createRng(1);
    const rng2 = createRng(1);

    const freshDecision = decideCompanyProduction(freshCompany, 10_000, rng1);
    const stockedDecision = decideCompanyProduction(stockedCompany, 10_000, rng2);

    expect(stockedDecision!.quantity).toBeLessThan(freshDecision!.quantity);
    expect(stockedDecision!.quantity).toBe(0);
  });
});

describe("decideStorePurchases", () => {
  it("never spends more than availableCash and only buys within its specialty category", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const listings: WholesaleListing[] = [
      { id: "l-food", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 4 },
      { id: "l-toys", companyId: "co-b", categoryId: "toys", quantityAvailable: 50, quality: 0.5, price: 1 },
    ];
    const rng = createRng(1);

    const decision = decideStorePurchases(store, 20, listings, rng);
    const totalSpent = decision.purchases.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);

    expect(totalSpent).toBeLessThanOrEqual(20);
    expect(decision.purchases.every((p) => p.listingId === "l-food")).toBe(true);
  });

  it("buys less when unsold inventory is already high, even with ample cash (order-up-to policy)", () => {
    const listings: WholesaleListing[] = [
      { id: "l-food", companyId: "co-a", categoryId: "food", quantityAvailable: 1000, quality: 0.5, price: 4 },
    ];
    const freshStore = makeStore({ specialtyCategoryId: "food", inventoryQuantity: 0 });
    const stockedStore = makeStore({ specialtyCategoryId: "food", inventoryQuantity: 1000 });
    const rng1 = createRng(1);
    const rng2 = createRng(1);

    const freshDecision = decideStorePurchases(freshStore, 10_000, listings, rng1);
    const stockedDecision = decideStorePurchases(stockedStore, 10_000, listings, rng2);
    const stockedQty = stockedDecision.purchases.reduce((sum, p) => sum + p.quantity, 0);
    const freshQty = freshDecision.purchases.reduce((sum, p) => sum + p.quantity, 0);

    expect(stockedQty).toBeLessThan(freshQty);
    expect(stockedQty).toBe(0);
  });
});

describe("decideHouseholdPurchases", () => {
  it("never spends more than availableCash", () => {
    const household = makeHousehold();
    const listings: RetailListing[] = [
      { id: "r1", storeId: "store-a", categoryId: "food", quantityAvailable: 50, quality: 0.9, price: 30 },
    ];
    const rng = createRng(1);

    const decision = decideHouseholdPurchases(household, 25, listings, rng);
    const totalSpent = decision.purchases.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);

    expect(totalSpent).toBeLessThanOrEqual(25);
  });

  it("buys nothing when no listings are eligible", () => {
    const household = makeHousehold();
    const rng = createRng(1);

    const decision = decideHouseholdPurchases(household, 100, [], rng);

    expect(decision.purchases).toHaveLength(0);
  });

  it("prioritizes food over apparel/electronics/toys when normalized price and quality are identical (D-024 priority bonus)", () => {
    const household = makeHousehold();
    // Each category has a different CATEGORY_UNIT_COST reference price, so prices are scaled
    // per-category (unitCost * 2.2) to make the underlying price/quality score identical before
    // the essential-category priority bonus is applied — isolating the effect being tested.
    const listings: RetailListing[] = [
      { id: "r-food", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 4 * 2.2 },
      { id: "r-apparel", storeId: "store-a", categoryId: "apparel", quantityAvailable: 10, quality: 0.5, price: 6 * 2.2 },
      { id: "r-electronics", storeId: "store-a", categoryId: "electronics", quantityAvailable: 10, quality: 0.5, price: 12 * 2.2 },
      { id: "r-toys", storeId: "store-a", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 8 * 2.2 },
    ];
    const rng = createRng(1);

    // Ample cash: candidates are bought in descending score order, so the first purchase
    // reveals the top-ranked listing directly.
    const decision = decideHouseholdPurchases(household, 1000, listings, rng);

    expect(decision.purchases.length).toBeGreaterThan(0);
    expect(decision.purchases[0]!.listingId).toBe("r-food");
  });

  it("does not let the priority bonus override an extreme price disadvantage", () => {
    const household = makeHousehold();
    const listings: RetailListing[] = [
      { id: "r-food-expensive", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 1000 },
      { id: "r-toys-cheap", storeId: "store-a", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 10 },
    ];
    const rng = createRng(1);

    const decision = decideHouseholdPurchases(household, 15, listings, rng);

    expect(decision.purchases.some((p) => p.listingId === "r-food-expensive")).toBe(false);
    expect(decision.purchases.some((p) => p.listingId === "r-toys-cheap")).toBe(true);
  });
});

describe("scoreListingForBuyer (exported for direct unit testing, D-024)", () => {
  it("adds exactly priorityBonus to the score, all else being equal", () => {
    const rng1 = createRng(5);
    const rng2 = createRng(5);

    const withoutBonus = scoreListingForBuyer(10, 0.5, "food", 0.5, rng1);
    const withBonus = scoreListingForBuyer(10, 0.5, "food", 0.5, rng2, 0.15);

    expect(withBonus - withoutBonus).toBeCloseTo(0.15, 10);
  });

  it("defaults priorityBonus to 0 when omitted", () => {
    const rng1 = createRng(9);
    const rng2 = createRng(9);

    const implicit = scoreListingForBuyer(10, 0.5, "food", 0.5, rng1);
    const explicitZero = scoreListingForBuyer(10, 0.5, "food", 0.5, rng2, 0);

    expect(implicit).toBe(explicitZero);
  });
});
