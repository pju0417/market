import { describe, expect, it } from "vitest";
import { createRng } from "../../src/economy/rng.js";
import { industrySwitchCost, MIN_ROUND_FOR_INDUSTRY_ACTIONS, NPC_STORE_SPECIALTY_DEVIATION_RULES } from "../../src/economy/config.js";
import {
  resolveCompanyDecision,
  resolveCompanyIndustrySwitch,
  resolveHouseholdPurchases,
  resolveStoreCategorySwitch,
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
    lastIndustrySwitchRound: null,
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
    currentSellingCategoryId: null,
    inventoryQuantity: 0,
    inventoryQuality: 0,
    retailPrice: 0,
    lastSellingCategoryChangeRound: null,
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

describe("resolveCompanyIndustrySwitch (Milestone 6, D-033, B안: 재고 강제 폐기)", () => {
  it("does nothing when switchToCategoryId is undefined", () => {
    const company = makeCompany({ productCategoryId: "food", inventoryQuantity: 10, quality: 0.5 });
    resolveCompanyIndustrySwitch(company, MIN_ROUND_FOR_INDUSTRY_ACTIONS, undefined);

    expect(company.productCategoryId).toBe("food");
    expect(company.inventoryQuantity).toBe(10);
    expect(company.lastIndustrySwitchRound).toBeNull();
  });

  it("rejects a switch attempt before MIN_ROUND_FOR_INDUSTRY_ACTIONS", () => {
    const company = makeCompany({ productCategoryId: "food", ledger: { cash: 1000, cumulativeProfit: 0 } });
    resolveCompanyIndustrySwitch(company, MIN_ROUND_FOR_INDUSTRY_ACTIONS - 1, "toys");

    expect(company.productCategoryId).toBe("food");
    expect(company.ledger.cash).toBe(1000);
  });

  it("treats a request for the same category as a no-op", () => {
    const company = makeCompany({ productCategoryId: "food", ledger: { cash: 1000, cumulativeProfit: 0 } });
    resolveCompanyIndustrySwitch(company, MIN_ROUND_FOR_INDUSTRY_ACTIONS, "food");

    expect(company.ledger.cash).toBe(1000);
    expect(company.lastIndustrySwitchRound).toBeNull();
  });

  it("rejects the switch when the switch cost exceeds available cash", () => {
    const cost = industrySwitchCost("food", "electronics");
    const company = makeCompany({ productCategoryId: "food", ledger: { cash: cost - 1, cumulativeProfit: 0 } });
    resolveCompanyIndustrySwitch(company, MIN_ROUND_FOR_INDUSTRY_ACTIONS, "electronics");

    expect(company.productCategoryId).toBe("food");
    expect(company.ledger.cash).toBe(cost - 1);
  });

  it("switches category, charges exactly the switch cost, and force-resets inventory/quality to 0 (B안)", () => {
    const cost = industrySwitchCost("food", "toys");
    const company = makeCompany({
      productCategoryId: "food",
      inventoryQuantity: 50,
      quality: 0.8,
      ledger: { cash: 1000, cumulativeProfit: 0 },
    });
    resolveCompanyIndustrySwitch(company, MIN_ROUND_FOR_INDUSTRY_ACTIONS, "toys");

    expect(company.productCategoryId).toBe("toys");
    expect(company.ledger.cash).toBe(1000 - cost);
    expect(company.inventoryQuantity).toBe(0);
    expect(company.quality).toBe(0);
    expect(company.lastIndustrySwitchRound).toBe(MIN_ROUND_FOR_INDUSTRY_ACTIONS);
  });

  it("switches even when inventory is already 0 (B안: 재고 유무는 게이팅 조건이 아니다)", () => {
    const company = makeCompany({
      productCategoryId: "food",
      inventoryQuantity: 0,
      ledger: { cash: 1000, cumulativeProfit: 0 },
    });
    resolveCompanyIndustrySwitch(company, MIN_ROUND_FOR_INDUSTRY_ACTIONS, "apparel");

    expect(company.productCategoryId).toBe("apparel");
  });
});

describe("resolveStoreCategorySwitch (Milestone 6, D-033)", () => {
  it("does nothing when sellingCategoryId is undefined", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    resolveStoreCategorySwitch(store, MIN_ROUND_FOR_INDUSTRY_ACTIONS, undefined);

    expect(store.currentSellingCategoryId).toBeNull();
  });

  it("rejects a switch attempt before MIN_ROUND_FOR_INDUSTRY_ACTIONS", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    resolveStoreCategorySwitch(store, MIN_ROUND_FOR_INDUSTRY_ACTIONS - 1, "toys");

    expect(store.currentSellingCategoryId).toBeNull();
  });

  it("treats a request for the same (effective) category as a no-op", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    resolveStoreCategorySwitch(store, MIN_ROUND_FOR_INDUSTRY_ACTIONS, "food");

    expect(store.currentSellingCategoryId).toBeNull();
    expect(store.lastSellingCategoryChangeRound).toBeNull();
  });

  it("switches selling category and force-resets inventory/quality to 0 (B안), no cost is charged", () => {
    const store = makeStore({
      specialtyCategoryId: "food",
      inventoryQuantity: 30,
      inventoryQuality: 0.6,
      ledger: { cash: 500, cumulativeProfit: 0 },
    });
    resolveStoreCategorySwitch(store, MIN_ROUND_FOR_INDUSTRY_ACTIONS, "toys");

    expect(store.currentSellingCategoryId).toBe("toys");
    expect(store.inventoryQuantity).toBe(0);
    expect(store.inventoryQuality).toBe(0);
    expect(store.lastSellingCategoryChangeRound).toBe(MIN_ROUND_FOR_INDUSTRY_ACTIONS);
    expect(store.ledger.cash).toBe(500);
  });

  it("rejects a second switch while the cooldown is still active", () => {
    const store = makeStore({
      specialtyCategoryId: "food",
      currentSellingCategoryId: "toys",
      lastSellingCategoryChangeRound: MIN_ROUND_FOR_INDUSTRY_ACTIONS,
    });
    const stillInCooldownRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS + NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds - 1;
    resolveStoreCategorySwitch(store, stillInCooldownRound, "electronics");

    expect(store.currentSellingCategoryId).toBe("toys");
  });

  it("allows a switch again once the cooldown has fully elapsed", () => {
    const store = makeStore({
      specialtyCategoryId: "food",
      currentSellingCategoryId: "toys",
      lastSellingCategoryChangeRound: MIN_ROUND_FOR_INDUSTRY_ACTIONS,
    });
    const afterCooldownRound = MIN_ROUND_FOR_INDUSTRY_ACTIONS + NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds;
    resolveStoreCategorySwitch(store, afterCooldownRound, "electronics");

    expect(store.currentSellingCategoryId).toBe("electronics");
    expect(store.lastSellingCategoryChangeRound).toBe(afterCooldownRound);
  });
});
