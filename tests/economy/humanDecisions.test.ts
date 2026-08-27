import { describe, expect, it } from "vitest";
import { createRng } from "../../src/economy/rng.js";
import {
  resolveCompanyDecision,
  resolveHouseholdPurchases,
  resolveStorePurchases,
} from "../../src/economy/humanDecisions.js";
import { decideCompanyProduction } from "../../src/npc/decisions.js";
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

describe("resolveCompanyDecision", () => {
  it("falls back to the bot policy when humanInput is undefined (identical to calling decideCompanyProduction directly)", () => {
    const company = makeCompany();
    const botDecision = decideCompanyProduction(company, 500, createRng(7));
    const resolved = resolveCompanyDecision(company, 500, undefined, createRng(7));

    expect(resolved).toEqual(botDecision);
  });

  it("clamps human-requested quantity to what's affordable", () => {
    const company = makeCompany();
    const decision = resolveCompanyDecision(company, 10, { quantity: 999, quality: 0.9, wholesalePrice: 50 }, createRng(1));

    expect(decision!.productionCost).toBeLessThanOrEqual(10);
    expect(decision!.quantity).toBeGreaterThan(0);
  });

  it("clamps quality to [0, 1] and rejects negative price", () => {
    const company = makeCompany();
    const decision = resolveCompanyDecision(company, 1000, { quantity: 1, quality: 5, wholesalePrice: -20 }, createRng(1));

    expect(decision!.quality).toBe(1);
    expect(decision!.wholesalePrice).toBe(0);
  });

  it("returns null when the company has no assigned category, even with human input", () => {
    const company = makeCompany({ productCategoryId: null });
    const decision = resolveCompanyDecision(company, 1000, { quantity: 5, quality: 0.5, wholesalePrice: 10 }, createRng(1));

    expect(decision).toBeNull();
  });
});

describe("resolveStorePurchases", () => {
  const listings: WholesaleListing[] = [
    { id: "l-food", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 4 },
    { id: "l-toys", companyId: "co-b", categoryId: "toys", quantityAvailable: 50, quality: 0.9, price: 1 },
  ];
  // store.ownerId is "student-1" (see makeStore); co-a is owned by a different student so purchases succeed.
  const companies: Record<string, CompanyState> = {
    "co-a": makeCompany({ id: "co-a", ownerId: "student-2" }),
    "co-b": makeCompany({ id: "co-b", ownerId: "student-3" }),
  };

  it("never trusts a client-supplied unit price — always uses the listing's actual price", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const decision = resolveStorePurchases(store, 100, listings, companies, [{ listingId: "l-food", quantity: 5 }], createRng(1));

    expect(decision.purchases).toEqual([{ listingId: "l-food", quantity: 5, unitPrice: 4 }]);
  });

  it("ignores a request for a listing outside the store's specialty category", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const decision = resolveStorePurchases(store, 100, listings, companies, [{ listingId: "l-toys", quantity: 5 }], createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });

  it("ignores a request for a nonexistent listing id (e.g. stale or self-trade-filtered-out id)", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const decision = resolveStorePurchases(
      store,
      100,
      listings,
      companies,
      [{ listingId: "does-not-exist", quantity: 5 }],
      createRng(1),
    );

    expect(decision.purchases).toHaveLength(0);
  });

  it("clamps requested quantity to availableCash and listing.quantityAvailable", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const decision = resolveStorePurchases(store, 10, listings, companies, [{ listingId: "l-food", quantity: 999 }], createRng(1));
    const totalSpent = decision.purchases.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);

    expect(totalSpent).toBeLessThanOrEqual(10);
  });

  it("rejects a self-trade even if eligibleListings failed to filter it out", () => {
    const store = makeStore({ specialtyCategoryId: "food", ownerId: "student-1" });
    const selfTradeListings: WholesaleListing[] = [
      { id: "l-self", companyId: "co-self", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 4 },
    ];
    const companiesWithSelf: Record<string, CompanyState> = {
      "co-self": makeCompany({ id: "co-self", ownerId: "student-1" }),
    };
    const decision = resolveStorePurchases(
      store,
      100,
      selfTradeListings,
      companiesWithSelf,
      [{ listingId: "l-self", quantity: 5 }],
      createRng(1),
    );

    expect(decision.purchases).toHaveLength(0);
  });

  it("rejects a purchase whose listed seller no longer exists in companies (e.g. removed participant)", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const orphanListings: WholesaleListing[] = [
      { id: "l-orphan", companyId: "co-gone", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 4 },
    ];
    const decision = resolveStorePurchases(store, 100, orphanListings, {}, [{ listingId: "l-orphan", quantity: 5 }], createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });
});

describe("resolveHouseholdPurchases", () => {
  const listings: RetailListing[] = [
    { id: "r1", storeId: "store-a", categoryId: "food", quantityAvailable: 50, quality: 0.9, price: 5 },
  ];
  // household.ownerId is "student-1" (see makeHousehold); store-a is owned by a different student.
  const stores: Record<string, StoreState> = {
    "store-a": makeStore({ id: "store-a", ownerId: "student-2" }),
  };

  it("never trusts a client-supplied unit price", () => {
    const household = makeHousehold();
    const decision = resolveHouseholdPurchases(household, 100, listings, stores, [{ listingId: "r1", quantity: 2 }], createRng(1));

    expect(decision.purchases).toEqual([{ listingId: "r1", quantity: 2, unitPrice: 5 }]);
  });

  it("respects the same max-units cap as the bot policy across multiple requested lines", () => {
    const household = makeHousehold({ ledger: { cash: 10_000, cumulativeProfit: 0 } });
    const manyListings: RetailListing[] = [
      { id: "r1", storeId: "store-a", categoryId: "food", quantityAvailable: 100, quality: 0.5, price: 1 },
    ];
    const decision = resolveHouseholdPurchases(
      household,
      10_000,
      manyListings,
      stores,
      [{ listingId: "r1", quantity: 999 }],
      createRng(1),
    );
    const totalUnits = decision.purchases.reduce((sum, p) => sum + p.quantity, 0);

    expect(totalUnits).toBeLessThanOrEqual(6);
  });

  it("rejects a self-trade even if eligibleListings failed to filter it out", () => {
    const household = makeHousehold({ ownerId: "student-1" });
    const selfTradeListings: RetailListing[] = [
      { id: "r-self", storeId: "store-self", categoryId: "food", quantityAvailable: 50, quality: 0.9, price: 5 },
    ];
    const storesWithSelf: Record<string, StoreState> = {
      "store-self": makeStore({ id: "store-self", ownerId: "student-1" }),
    };
    const decision = resolveHouseholdPurchases(
      household,
      100,
      selfTradeListings,
      storesWithSelf,
      [{ listingId: "r-self", quantity: 2 }],
      createRng(1),
    );

    expect(decision.purchases).toHaveLength(0);
  });

  it("rejects a purchase whose listed seller no longer exists in stores (e.g. removed participant)", () => {
    const household = makeHousehold();
    const orphanListings: RetailListing[] = [
      { id: "r-orphan", storeId: "store-gone", categoryId: "food", quantityAvailable: 50, quality: 0.9, price: 5 },
    ];
    const decision = resolveHouseholdPurchases(household, 100, orphanListings, {}, [{ listingId: "r-orphan", quantity: 2 }], createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });
});
