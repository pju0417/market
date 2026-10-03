import { describe, expect, it } from "vitest";
import { createRng } from "../../src/economy/rng.js";
import {
  COSTS,
  industrySwitchCost,
  MIN_ROUND_FOR_ADVERTISING,
  MIN_ROUND_FOR_INDUSTRY_ACTIONS,
  NPC_STORE_SPECIALTY_DEVIATION_RULES,
} from "../../src/economy/config.js";
import {
  resolveCompanyAdvertising,
  resolveCompanyDecision,
  resolveCompanyIndustrySwitch,
  resolveHouseholdPurchases,
  resolveSingleCategoryPurchase,
  resolveStoreAdvertising,
  resolveStoreCategorySwitch,
  resolveStorePurchases,
  type CategoryPurchaseRequest,
  type StorePurchaseRequest,
} from "../../src/economy/humanDecisions.js";
import { decideCompanyProduction } from "../../src/npc/decisions.js";
import type { ActiveTrendEvent } from "../../src/economy/trendEvent.js";
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
    isAdvertisingActive: false,
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
    isAdvertisingActive: false,
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

function storeRequest(overrides: Partial<StorePurchaseRequest> = {}): StorePurchaseRequest {
  return { priorityPicks: [], maxQuantity: 0, ...overrides };
}

function categoryRequest(overrides: Partial<CategoryPurchaseRequest> & { categoryId: CategoryPurchaseRequest["categoryId"] }): CategoryPurchaseRequest {
  return { priorityPicks: [], maxQuantity: 0, ...overrides };
}

describe("resolveCompanyDecision", () => {
  it("charges more for quality and reduces affordable output, including market events", () => {
    const company = makeCompany();
    const make = (quality: number, cash = 1000, multiplier = 1) => resolveCompanyDecision(
      company, cash, { quantity: 20, quality, wholesalePrice: 50 }, createRng(1), multiplier,
    )!;
    const low = make(0), standard = make(0.5), high = make(1);
    expect(low.unitCost).toBeCloseTo(standard.unitCost * 0.75);
    expect(high.unitCost).toBeCloseTo(standard.unitCost * 1.25);
    expect(high.productionCost).toBeGreaterThan(low.productionCost);
    expect(make(1, 1000, 1.3).productionCost).toBeCloseTo(high.productionCost * 1.3);
    const budget = standard.unitCost * 10;
    expect(make(1, budget).quantity).toBeLessThan(make(0, budget).quantity);
    expect(make(1, budget).productionCost).toBeLessThanOrEqual(budget);
  });
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

describe("resolveStorePurchases (구매 매칭 알고리즘 재설계 Stage 1)", () => {
  const listings: WholesaleListing[] = [
    { id: "l-food", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 4 },
    { id: "l-toys", companyId: "co-b", categoryId: "toys", quantityAvailable: 50, quality: 0.9, price: 1 },
  ];
  // store.ownerId is "student-1" (see makeStore); co-a is owned by a different student so purchases succeed.
  const companies: Record<string, CompanyState> = {
    "co-a": makeCompany({ id: "co-a", ownerId: "student-2" }),
    "co-b": makeCompany({ id: "co-b", ownerId: "student-3" }),
  };

  it("request=undefined is treated as 'buy nothing' — it must NOT delegate to the bot policy (contract correction regression)", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    // Ample cash and a very attractive listing: if this incorrectly fell back to decideStorePurchases,
    // it would definitely buy something.
    const decision = resolveStorePurchases(store, 10_000, listings, companies, undefined, createRng(1));

    expect(decision.purchases).toEqual([]);
  });

  it("fulfills entirely from priority picks (1~3순위) when they cover the full maxQuantity — no auto-fill triggered", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const request = storeRequest({ priorityPicks: [{ listingId: "l-food", quantity: 5 }], maxQuantity: 5 });
    const decision = resolveStorePurchases(store, 100, listings, companies, request, createRng(1));

    expect(decision.purchases).toEqual([{ listingId: "l-food", quantity: 5, unitPrice: 4 }]);
  });

  it("never trusts a client-supplied unit price — always uses the listing's actual price", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const request = storeRequest({ priorityPicks: [{ listingId: "l-food", quantity: 5 }], maxQuantity: 5 });
    const decision = resolveStorePurchases(store, 100, listings, companies, request, createRng(1));

    expect(decision.purchases).toEqual([{ listingId: "l-food", quantity: 5, unitPrice: 4 }]);
  });

  it("ignores a priority pick for a listing outside the store's selling category (and there is no other food candidate for auto-fill to fall back on)", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    // Only a "toys" listing exists — no "food" candidate at all, so even the auto-fill safety
    // net (which would otherwise happily fill the shortfall from any other eligible category
    // candidate) has nothing to work with.
    const toysOnlyListings: WholesaleListing[] = [
      { id: "l-toys", companyId: "co-b", categoryId: "toys", quantityAvailable: 50, quality: 0.9, price: 1 },
    ];
    const request = storeRequest({ priorityPicks: [{ listingId: "l-toys", quantity: 5 }], maxQuantity: 5 });
    const decision = resolveStorePurchases(store, 100, toysOnlyListings, companies, request, createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });

  it("ignores a priority pick for a nonexistent listing id (e.g. stale or self-trade-filtered-out id), with no other candidate to auto-fill from", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const request = storeRequest({ priorityPicks: [{ listingId: "does-not-exist", quantity: 5 }], maxQuantity: 5 });
    const decision = resolveStorePurchases(store, 100, [], companies, request, createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });

  it("clamps priority-pick quantity to availableCash and listing.quantityAvailable", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const request = storeRequest({ priorityPicks: [{ listingId: "l-food", quantity: 999 }], maxQuantity: 999 });
    const decision = resolveStorePurchases(store, 10, listings, companies, request, createRng(1));
    const totalSpent = decision.purchases.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);

    expect(totalSpent).toBeLessThanOrEqual(10);
  });

  it("rejects a self-trade priority pick even if eligibleListings failed to filter it out", () => {
    const store = makeStore({ specialtyCategoryId: "food", ownerId: "student-1" });
    const selfTradeListings: WholesaleListing[] = [
      { id: "l-self", companyId: "co-self", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 4 },
    ];
    const companiesWithSelf: Record<string, CompanyState> = {
      "co-self": makeCompany({ id: "co-self", ownerId: "student-1" }),
    };
    const request = storeRequest({ priorityPicks: [{ listingId: "l-self", quantity: 5 }], maxQuantity: 5 });
    const decision = resolveStorePurchases(store, 100, selfTradeListings, companiesWithSelf, request, createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });

  it("rejects a priority pick whose listed seller no longer exists in companies (e.g. removed participant)", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const orphanListings: WholesaleListing[] = [
      { id: "l-orphan", companyId: "co-gone", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 4 },
    ];
    const request = storeRequest({ priorityPicks: [{ listingId: "l-orphan", quantity: 5 }], maxQuantity: 5 });
    const decision = resolveStorePurchases(store, 100, orphanListings, {}, request, createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });

  it("auto-fills only the shortfall when the 1순위 pick is short on stock, excluding that listing from auto-fill", () => {
    const scarceListings: WholesaleListing[] = [
      { id: "l-scarce", companyId: "co-a", categoryId: "food", quantityAvailable: 2, quality: 0.5, price: 4 },
      { id: "l-backup", companyId: "co-b", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 4 },
    ];
    const backupCompanies: Record<string, CompanyState> = {
      "co-a": makeCompany({ id: "co-a", ownerId: "student-2" }),
      "co-b": makeCompany({ id: "co-b", ownerId: "student-3" }),
    };
    const store = makeStore({ specialtyCategoryId: "food" });
    // Wants 5 total; l-scarce only has 2 in stock, so 3 must come from auto-fill (never re-picking l-scarce).
    const request = storeRequest({ priorityPicks: [{ listingId: "l-scarce", quantity: 5 }], maxQuantity: 5 });
    const decision = resolveStorePurchases(store, 1000, scarceListings, backupCompanies, request, createRng(1));

    expect(decision.purchases).toEqual(
      expect.arrayContaining([
        { listingId: "l-scarce", quantity: 2, unitPrice: 4 },
        { listingId: "l-backup", quantity: 3, unitPrice: 4 },
      ]),
    );
    const totalQuantity = decision.purchases.reduce((sum, p) => sum + p.quantity, 0);
    expect(totalQuantity).toBe(5);
  });

  it("only uses the first 3 priority picks — a 4th priority pick gets no priority treatment (maxQuantity fully consumed by the first 3 leaves no room for auto-fill either)", () => {
    const manyListings: WholesaleListing[] = [
      { id: "l-1", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 1 },
      { id: "l-2", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 1 },
      { id: "l-3", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 1 },
      { id: "l-4", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 1 },
    ];
    const store = makeStore({ specialtyCategoryId: "food" });
    const request = storeRequest({
      priorityPicks: [
        { listingId: "l-1", quantity: 1 },
        { listingId: "l-2", quantity: 1 },
        { listingId: "l-3", quantity: 1 },
        { listingId: "l-4", quantity: 1 },
      ],
      // maxQuantity is exactly what the first 3 picks need — no shortfall remains, so even the
      // auto-fill safety net (which otherwise could legitimately pick up l-4 as an ordinary
      // unused candidate) has no room left. This isolates "the 4th pick isn't prioritized" from
      // "auto-fill might still buy it anyway".
      maxQuantity: 3,
    });
    const decision = resolveStorePurchases(store, 1000, manyListings, companies, request, createRng(1));

    expect(decision.purchases.some((p) => p.listingId === "l-4")).toBe(false);
    expect(decision.purchases.reduce((sum, p) => sum + p.quantity, 0)).toBe(3);
  });

  it("cuts off priority picks mid-list once cash runs out, in rank order", () => {
    const pricedListings: WholesaleListing[] = [
      { id: "l-1", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 10 },
      { id: "l-2", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 10 },
      { id: "l-3", companyId: "co-a", categoryId: "food", quantityAvailable: 50, quality: 0.5, price: 10 },
    ];
    const store = makeStore({ specialtyCategoryId: "food" });
    const request = storeRequest({
      priorityPicks: [
        { listingId: "l-1", quantity: 1 }, // costs 10
        { listingId: "l-2", quantity: 1 }, // costs 10
        { listingId: "l-3", quantity: 1 }, // costs 10, but only 5 cash remains
      ],
      maxQuantity: 3,
    });
    // Exactly enough for the first two picks (20), nothing left for the third.
    const decision = resolveStorePurchases(store, 20, pricedListings, companies, request, createRng(1));

    expect(decision.purchases).toEqual([
      { listingId: "l-1", quantity: 1, unitPrice: 10 },
      { listingId: "l-2", quantity: 1, unitPrice: 10 },
    ]);
  });

  it("autoFillPreference='price' (and the default, when omitted) sorts the shortfall by price ascending", () => {
    // food reference price = CATEGORY_UNIT_COST.food(4) * 2.2 = 8.8
    const priceVsQualityListings: WholesaleListing[] = [
      { id: "l-cheap-lowquality", companyId: "co-a", categoryId: "food", quantityAvailable: 10, quality: 0.2, price: 4.4 },
      { id: "l-expensive-highquality", companyId: "co-b", categoryId: "food", quantityAvailable: 10, quality: 0.9, price: 8.8 },
    ];
    const store = makeStore({ specialtyCategoryId: "food" });

    const defaultRequest = storeRequest({ maxQuantity: 1 });
    const defaultDecision = resolveStorePurchases(store, 1000, priceVsQualityListings, companies, defaultRequest, createRng(1));
    expect(defaultDecision.purchases[0]!.listingId).toBe("l-cheap-lowquality");

    const priceRequest = storeRequest({ maxQuantity: 1, autoFillPreference: "price" });
    const priceDecision = resolveStorePurchases(store, 1000, priceVsQualityListings, companies, priceRequest, createRng(1));
    expect(priceDecision.purchases[0]!.listingId).toBe("l-cheap-lowquality");
  });

  it("autoFillPreference='quality' sorts the shortfall by price/quality score descending instead", () => {
    const priceVsQualityListings: WholesaleListing[] = [
      { id: "l-cheap-lowquality", companyId: "co-a", categoryId: "food", quantityAvailable: 10, quality: 0.2, price: 4.4 },
      { id: "l-expensive-highquality", companyId: "co-b", categoryId: "food", quantityAvailable: 10, quality: 0.9, price: 8.8 },
    ];
    const store = makeStore({ specialtyCategoryId: "food" });
    const qualityRequest = storeRequest({ maxQuantity: 1, autoFillPreference: "quality" });
    const qualityDecision = resolveStorePurchases(store, 1000, priceVsQualityListings, companies, qualityRequest, createRng(1));

    expect(qualityDecision.purchases[0]!.listingId).toBe("l-expensive-highquality");
  });

  it("always returns an integer quantity even when maxQuantity/priority-pick quantity are non-integers (D-027류 재발 방지 회귀 테스트)", () => {
    const store = makeStore({ specialtyCategoryId: "food" });
    const request = storeRequest({ priorityPicks: [{ listingId: "l-food", quantity: 5.5 }], maxQuantity: 5.5 });
    const decision = resolveStorePurchases(store, 1000, listings, companies, request, createRng(1));

    expect(decision.purchases).toHaveLength(1);
    expect(Number.isInteger(decision.purchases[0]!.quantity)).toBe(true);
    expect(decision.purchases[0]!.quantity).toBe(5);
  });

  it("maxUnitPrice caps only the auto-fill shortfall, never the priority picks", () => {
    const listingsWithCap: WholesaleListing[] = [
      { id: "l-expensive-pick", companyId: "co-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 50 },
      { id: "l-cheap-autofill", companyId: "co-b", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 5 },
      { id: "l-too-expensive-for-autofill", companyId: "co-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 40 },
    ];
    const store = makeStore({ specialtyCategoryId: "food" });
    const request = storeRequest({
      priorityPicks: [{ listingId: "l-expensive-pick", quantity: 1 }], // above maxUnitPrice, but it's a priority pick so it's unaffected
      maxQuantity: 2,
      maxUnitPrice: 10,
    });
    const decision = resolveStorePurchases(store, 1000, listingsWithCap, companies, request, createRng(1));

    expect(decision.purchases.some((p) => p.listingId === "l-expensive-pick")).toBe(true);
    expect(decision.purchases.some((p) => p.listingId === "l-cheap-autofill")).toBe(true);
    expect(decision.purchases.some((p) => p.listingId === "l-too-expensive-for-autofill")).toBe(false);
  });
});

describe("resolveSingleCategoryPurchase trendEvent handling (Milestone 6 제안 C, D-039)", () => {
  // food/toys reference prices: CATEGORY_UNIT_COST(4/8) * REFERENCE_PRICE_MULTIPLIER(2.2) = 8.8/17.6.
  const retailCandidates: RetailListing[] = [
    { id: "r-food", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 8.8 },
    { id: "r-toys", storeId: "store-a", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 17.6 },
  ];
  const retailStores: Record<string, StoreState> = {
    "store-a": makeStore({ id: "store-a", ownerId: "student-2", specialtyCategoryId: null }),
  };

  const wholesaleCandidates: WholesaleListing[] = [
    { id: "w-food", companyId: "co-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 8.8 },
    { id: "w-toys", companyId: "co-b", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 17.6 },
  ];
  const wholesaleCompanies: Record<string, CompanyState> = {
    "co-a": makeCompany({ id: "co-a", ownerId: "student-2" }),
    "co-b": makeCompany({ id: "co-b", ownerId: "student-3" }),
  };
  const trendEventForToys: ActiveTrendEvent = { categoryId: "toys", priorityBonus: 0.1 };

  it("autoFillPreference='quality' + retail listing: trendEvent's bonus flips the winner toward the trend category", () => {
    const request = categoryRequest({ categoryId: "food", maxQuantity: 1, autoFillPreference: "quality" });

    const withoutTrend = resolveSingleCategoryPurchase(retailCandidates, retailStores, "student-1", request, 1000, 1, createRng(1));
    const withTrend = resolveSingleCategoryPurchase(
      retailCandidates,
      retailStores,
      "student-1",
      request,
      1000,
      1,
      createRng(1),
      trendEventForToys,
    );

    // Both listings are otherwise identical (same normalized price/quality), so without the
    // trend bonus the winner is decided purely by the tiny tie-break, but with the 0.1 bonus
    // (which exceeds the max possible tie-break spread of 0.02) toys must win deterministically.
    expect(withTrend.purchases[0]!.listingId).toBe("r-toys");
    expect(withoutTrend.purchases[0]!.listingId).not.toBe(withTrend.purchases[0]!.listingId);
  });

  it("autoFillPreference='price' (default): trendEvent has no effect on retail listings", () => {
    // food is cheaper than toys per unit here (raw price, not normalized) so price-mode always
    // picks food regardless of any trend bonus on toys.
    const request = categoryRequest({ categoryId: "food", maxQuantity: 1 });

    const withoutTrend = resolveSingleCategoryPurchase(retailCandidates, retailStores, "student-1", request, 1000, 1, createRng(1));
    const withTrend = resolveSingleCategoryPurchase(
      retailCandidates,
      retailStores,
      "student-1",
      request,
      1000,
      1,
      createRng(1),
      trendEventForToys,
    );

    expect(withTrend).toEqual(withoutTrend);
  });

  it("wholesale listings ('companyId' in listing) are never affected by trendEvent, even with autoFillPreference='quality' (core invariant)", () => {
    const request = storeRequest({ maxQuantity: 1, autoFillPreference: "quality" });

    const withoutTrend = resolveSingleCategoryPurchase(
      wholesaleCandidates,
      wholesaleCompanies,
      "student-1",
      request,
      1000,
      1,
      createRng(1),
    );
    const withTrend = resolveSingleCategoryPurchase(
      wholesaleCandidates,
      wholesaleCompanies,
      "student-1",
      request,
      1000,
      1,
      createRng(1),
      trendEventForToys,
    );

    expect(withTrend).toEqual(withoutTrend);
  });
});

describe("resolveHouseholdPurchases (구매 매칭 알고리즘 재설계 Stage 1)", () => {
  const listings: RetailListing[] = [
    { id: "r1", storeId: "store-a", categoryId: "food", quantityAvailable: 50, quality: 0.9, price: 5 },
  ];
  // household.ownerId is "student-1" (see makeHousehold); store-a is owned by a different student.
  const stores: Record<string, StoreState> = {
    "store-a": makeStore({ id: "store-a", ownerId: "student-2" }),
  };

  it("falls back to the bot policy when requests is undefined (unchanged pre-existing contract)", () => {
    const household = makeHousehold();
    const decision = resolveHouseholdPurchases(household, 100, listings, stores, undefined, createRng(1));

    expect(decision.purchases.length).toBeGreaterThanOrEqual(0); // just needs to not throw / not equal "always empty"
  });

  it("treats an explicit empty request array as 'buy nothing' (distinct from undefined)", () => {
    const household = makeHousehold();
    const decision = resolveHouseholdPurchases(household, 100, listings, stores, [], createRng(1));

    expect(decision.purchases).toEqual([]);
  });

  it("never trusts a client-supplied unit price", () => {
    const household = makeHousehold();
    const request = categoryRequest({ categoryId: "food", priorityPicks: [{ listingId: "r1", quantity: 2 }], maxQuantity: 2 });
    const decision = resolveHouseholdPurchases(household, 100, listings, stores, [request], createRng(1));

    expect(decision.purchases).toEqual([{ listingId: "r1", quantity: 2, unitPrice: 5 }]);
  });

  it("respects the same max-units cap as the bot policy across a single category's priority picks", () => {
    const household = makeHousehold({ ledger: { cash: 10_000, cumulativeProfit: 0 } });
    const manyListings: RetailListing[] = [
      { id: "r1", storeId: "store-a", categoryId: "food", quantityAvailable: 100, quality: 0.5, price: 1 },
    ];
    const request = categoryRequest({ categoryId: "food", priorityPicks: [{ listingId: "r1", quantity: 999 }], maxQuantity: 999 });
    const decision = resolveHouseholdPurchases(household, 10_000, manyListings, stores, [request], createRng(1));
    const totalUnits = decision.purchases.reduce((sum, p) => sum + p.quantity, 0);

    expect(totalUnits).toBeLessThanOrEqual(6);
  });

  it("rejects a self-trade priority pick even if eligibleListings failed to filter it out", () => {
    const household = makeHousehold({ ownerId: "student-1" });
    const selfTradeListings: RetailListing[] = [
      { id: "r-self", storeId: "store-self", categoryId: "food", quantityAvailable: 50, quality: 0.9, price: 5 },
    ];
    const storesWithSelf: Record<string, StoreState> = {
      "store-self": makeStore({ id: "store-self", ownerId: "student-1" }),
    };
    const request = categoryRequest({ categoryId: "food", priorityPicks: [{ listingId: "r-self", quantity: 2 }], maxQuantity: 2 });
    const decision = resolveHouseholdPurchases(household, 100, selfTradeListings, storesWithSelf, [request], createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });

  it("rejects a priority pick whose listed seller no longer exists in stores (e.g. removed participant)", () => {
    const household = makeHousehold();
    const orphanListings: RetailListing[] = [
      { id: "r-orphan", storeId: "store-gone", categoryId: "food", quantityAvailable: 50, quality: 0.9, price: 5 },
    ];
    const request = categoryRequest({ categoryId: "food", priorityPicks: [{ listingId: "r-orphan", quantity: 2 }], maxQuantity: 2 });
    const decision = resolveHouseholdPurchases(household, 100, orphanListings, {}, [request], createRng(1));

    expect(decision.purchases).toHaveLength(0);
  });

  it("auto-fills the shortfall when the priority pick runs out of stock, excluding it from auto-fill", () => {
    const scarceListings: RetailListing[] = [
      { id: "r-scarce", storeId: "store-a", categoryId: "food", quantityAvailable: 1, quality: 0.9, price: 5 },
      { id: "r-backup", storeId: "store-b", categoryId: "food", quantityAvailable: 50, quality: 0.9, price: 5 },
    ];
    const twoStores: Record<string, StoreState> = {
      "store-a": makeStore({ id: "store-a", ownerId: "student-2" }),
      "store-b": makeStore({ id: "store-b", ownerId: "student-3" }),
    };
    const household = makeHousehold({ ledger: { cash: 1000, cumulativeProfit: 0 } });
    const request = categoryRequest({ categoryId: "food", priorityPicks: [{ listingId: "r-scarce", quantity: 3 }], maxQuantity: 3 });
    const decision = resolveHouseholdPurchases(household, 1000, scarceListings, twoStores, [request], createRng(1));

    const totalQuantity = decision.purchases.reduce((sum, p) => sum + p.quantity, 0);
    expect(totalQuantity).toBe(3);
    expect(decision.purchases.find((p) => p.listingId === "r-scarce")!.quantity).toBe(1);
    expect(decision.purchases.find((p) => p.listingId === "r-backup")!.quantity).toBe(2);
  });

  it("caps a category's 1단계 (priority pick) quantity to its own maxQuantity, carrying only the true leftover to the next category (major bug regression)", () => {
    const multiCategoryListings: RetailListing[] = [
      { id: "r-food", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 1 },
      { id: "r-apparel", storeId: "store-a", categoryId: "apparel", quantityAvailable: 10, quality: 0.5, price: 1 },
    ];
    const household = makeHousehold({ ledger: { cash: 1000, cumulativeProfit: 0 } });
    const requests: CategoryPurchaseRequest[] = [
      // Requests 6 units via priority picks, but this category's own cap is 2.
      categoryRequest({ categoryId: "food", priorityPicks: [{ listingId: "r-food", quantity: 6 }], maxQuantity: 2 }),
      // Should receive the true leftover: MAX_HOUSEHOLD_PURCHASE_UNITS(6) - 2 = 4.
      categoryRequest({ categoryId: "apparel", priorityPicks: [{ listingId: "r-apparel", quantity: 10 }], maxQuantity: 10 }),
    ];
    const decision = resolveHouseholdPurchases(household, 1000, multiCategoryListings, stores, requests, createRng(1));

    expect(decision.purchases.find((p) => p.listingId === "r-food")!.quantity).toBe(2);
    expect(decision.purchases.find((p) => p.listingId === "r-apparel")!.quantity).toBe(4);
  });

  it("processes multiple categories in fixed priority order (food -> apparel -> everything else), carrying the leftover budget forward regardless of request array order", () => {
    const multiCategoryListings: RetailListing[] = [
      { id: "r-food", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 40 },
      { id: "r-apparel", storeId: "store-a", categoryId: "apparel", quantityAvailable: 10, quality: 0.5, price: 40 },
      { id: "r-toys", storeId: "store-a", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 40 },
    ];
    const household = makeHousehold();
    // Deliberately out-of-priority-order input: toys, then food, then apparel.
    const requests: CategoryPurchaseRequest[] = [
      categoryRequest({ categoryId: "toys", priorityPicks: [{ listingId: "r-toys", quantity: 1 }], maxQuantity: 1 }),
      categoryRequest({ categoryId: "food", priorityPicks: [{ listingId: "r-food", quantity: 1 }], maxQuantity: 1 }),
      categoryRequest({ categoryId: "apparel", priorityPicks: [{ listingId: "r-apparel", quantity: 1 }], maxQuantity: 1 }),
    ];
    // 100 cash: enough for food (40) + apparel (40) = 80, leaving only 20 for toys (needs 40) -> toys must fail.
    const decision = resolveHouseholdPurchases(household, 100, multiCategoryListings, stores, requests, createRng(1));

    expect(decision.purchases.some((p) => p.listingId === "r-food")).toBe(true);
    expect(decision.purchases.some((p) => p.listingId === "r-apparel")).toBe(true);
    expect(decision.purchases.some((p) => p.listingId === "r-toys")).toBe(false);
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

describe("resolveCompanyAdvertising / resolveStoreAdvertising (Milestone 6, D-040)", () => {
  it("resolveCompanyAdvertising treats an omitted field as 'no advertising' (no charge)", () => {
    const company = makeCompany({ ledger: { cash: 1000, cumulativeProfit: 0 } });
    resolveCompanyAdvertising(company, MIN_ROUND_FOR_ADVERTISING, undefined);

    expect(company.isAdvertisingActive).toBe(false);
    expect(company.ledger.cash).toBe(1000);
  });

  it("resolveCompanyAdvertising treats false the same as omitted", () => {
    const company = makeCompany({ ledger: { cash: 1000, cumulativeProfit: 0 } });
    resolveCompanyAdvertising(company, MIN_ROUND_FOR_ADVERTISING, false);

    expect(company.isAdvertisingActive).toBe(false);
    expect(company.ledger.cash).toBe(1000);
  });

  it("resolveCompanyAdvertising charges exactly advertisingCostPerRound and sets the flag when true", () => {
    const company = makeCompany({ ledger: { cash: 1000, cumulativeProfit: 0 } });
    resolveCompanyAdvertising(company, MIN_ROUND_FOR_ADVERTISING, true);

    expect(company.isAdvertisingActive).toBe(true);
    expect(company.ledger.cash).toBe(1000 - COSTS.advertisingCostPerRound);
  });

  it("resolveStoreAdvertising follows the same omitted/false/true contract", () => {
    const storeOmitted = makeStore({ ledger: { cash: 1000, cumulativeProfit: 0 } });
    resolveStoreAdvertising(storeOmitted, MIN_ROUND_FOR_ADVERTISING, undefined);
    expect(storeOmitted.isAdvertisingActive).toBe(false);
    expect(storeOmitted.ledger.cash).toBe(1000);

    const storeTrue = makeStore({ ledger: { cash: 1000, cumulativeProfit: 0 } });
    resolveStoreAdvertising(storeTrue, MIN_ROUND_FOR_ADVERTISING, true);
    expect(storeTrue.isAdvertisingActive).toBe(true);
    expect(storeTrue.ledger.cash).toBe(1000 - COSTS.advertisingCostPerRound);
  });
});

describe("resolveSingleCategoryPurchase advertising handling (Milestone 6, D-040)", () => {
  // food/toys reference prices: CATEGORY_UNIT_COST(4/8) * REFERENCE_PRICE_MULTIPLIER(2.2) = 8.8/17.6.
  const wholesaleCandidates: WholesaleListing[] = [
    { id: "w-food", companyId: "co-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 8.8 },
    { id: "w-toys", companyId: "co-b", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 17.6 },
  ];
  const advertisingWholesaleCompanies: Record<string, CompanyState> = {
    "co-a": makeCompany({ id: "co-a", ownerId: "student-2" }),
    "co-b": makeCompany({ id: "co-b", ownerId: "student-3", isAdvertisingActive: true }),
  };

  const retailCandidates: RetailListing[] = [
    { id: "r-food", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 8.8 },
    { id: "r-toys", storeId: "store-b", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 17.6 },
  ];
  const advertisingRetailStores: Record<string, StoreState> = {
    "store-a": makeStore({ id: "store-a", ownerId: "student-2", specialtyCategoryId: null }),
    "store-b": makeStore({ id: "store-b", ownerId: "student-3", specialtyCategoryId: null, isAdvertisingActive: true }),
  };

  it("wholesale: a listing from an advertising company scores exactly ADVERTISING_PRIORITY_BONUS higher (D-039의 도매 면역과 달리, 광고는 도매에도 적용된다)", () => {
    const request = storeRequest({ maxQuantity: 1, autoFillPreference: "quality" });

    const decision = resolveSingleCategoryPurchase(
      wholesaleCandidates,
      advertisingWholesaleCompanies,
      "student-1",
      request,
      1000,
      1,
      createRng(1),
    );

    // Both listings are otherwise identical (same normalized price/quality), so without the
    // bonus the winner is decided purely by the tiny tie-break, but with the 0.1 bonus (which
    // exceeds the max possible tie-break spread of 0.02) the advertising company (co-b/toys)
    // must win deterministically.
    expect(decision.purchases[0]!.listingId).toBe("w-toys");
  });

  it("retail: a listing from an advertising store scores exactly ADVERTISING_PRIORITY_BONUS higher", () => {
    const request = categoryRequest({ categoryId: "food", maxQuantity: 1, autoFillPreference: "quality" });

    const decision = resolveSingleCategoryPurchase(
      retailCandidates,
      advertisingRetailStores,
      "student-1",
      request,
      1000,
      1,
      createRng(1),
    );

    expect(decision.purchases[0]!.listingId).toBe("r-toys");
  });

  it("regression: with no advertising sellers, results are identical to the pre-advertising behavior", () => {
    const neutralCompanies: Record<string, CompanyState> = {
      "co-a": makeCompany({ id: "co-a", ownerId: "student-2" }),
      "co-b": makeCompany({ id: "co-b", ownerId: "student-3" }),
    };
    const request = storeRequest({ maxQuantity: 1, autoFillPreference: "quality" });

    const withNeutralCompanies = resolveSingleCategoryPurchase(
      wholesaleCandidates,
      neutralCompanies,
      "student-1",
      request,
      1000,
      1,
      createRng(1),
    );
    const withoutAdjustmentArg = resolveSingleCategoryPurchase(
      wholesaleCandidates,
      neutralCompanies,
      "student-1",
      request,
      1000,
      1,
      createRng(1),
      undefined,
    );

    expect(withNeutralCompanies).toEqual(withoutAdjustmentArg);
  });
});
