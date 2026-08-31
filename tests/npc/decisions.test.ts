import { describe, expect, it } from "vitest";
import { createRng } from "../../src/economy/rng.js";
import {
  industrySwitchCost,
  MIN_ROUND_FOR_INDUSTRY_ACTIONS,
  NPC_INDUSTRY_SWITCH_RULES,
  NPC_STORE_SPECIALTY_DEVIATION_RULES,
  specialtyMismatchPenalty,
} from "../../src/economy/config.js";
import {
  decideCompanyIndustrySwitch,
  decideCompanyProduction,
  decideHouseholdPurchases,
  decideStorePurchases,
  decideStoreSpecialtyDeviation,
  scoreListingForBuyer,
} from "../../src/npc/decisions.js";
import type {
  CompanyState,
  GameState,
  HouseholdState,
  RetailListing,
  RoundMetrics,
  StoreState,
  WholesaleListing,
} from "../../src/types/domain.js";

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

function makeRoundMetrics(round: number, overrides: Partial<RoundMetrics> = {}): RoundMetrics {
  return {
    round,
    companyProfit: {},
    storeProfit: {},
    companyMarketShare: {},
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
    ...overrides,
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    config: { totalRounds: 7, studentPlayerIds: [], rngSeed: 1 },
    currentRound: MIN_ROUND_FOR_INDUSTRY_ACTIONS,
    currentPhase: "company-turn",
    players: [],
    companies: {},
    stores: {},
    households: {},
    wholesaleListings: [],
    retailListings: [],
    roundMetrics: [],
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

describe("decideCompanyIndustrySwitch (Milestone 6, D-033)", () => {
  const negativeProfitHistory = (companyId: string): RoundMetrics[] =>
    Array.from({ length: NPC_INDUSTRY_SWITCH_RULES.consecutiveNegativeProfitRounds }, (_, i) =>
      makeRoundMetrics(i + 1, { companyProfit: { [companyId]: -10 } }),
    );

  it("never switches before minRound, even with every other condition favorable", () => {
    const company = makeCompany({ id: "c1", productCategoryId: "food" });
    const state = makeGameState({
      currentRound: NPC_INDUSTRY_SWITCH_RULES.minRound - 1,
      roundMetrics: negativeProfitHistory("c1"),
      wholesaleListings: [{ id: "w1", companyId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 }],
    });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("food");
  });

  it("does not switch when profit history doesn't show consecutiveNegativeProfitRounds of losses", () => {
    const company = makeCompany({ id: "c1", productCategoryId: "food", ledger: { cash: 1000, cumulativeProfit: 0 } });
    const state = makeGameState({
      roundMetrics: [
        makeRoundMetrics(1, { companyProfit: { c1: -10 } }),
        makeRoundMetrics(2, { companyProfit: { c1: 5 } }), // most recent round was profitable
      ],
      wholesaleListings: [{ id: "w1", companyId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 }],
    });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("food");
  });

  it("does not switch when there isn't enough round history yet", () => {
    const company = makeCompany({ id: "c1", productCategoryId: "food" });
    const state = makeGameState({ roundMetrics: [makeRoundMetrics(1, { companyProfit: { c1: -10 } } )] });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("food");
  });

  it("stays put while still inside the post-switch cooldown", () => {
    const company = makeCompany({
      id: "c1",
      productCategoryId: "food",
      lastIndustrySwitchRound: MIN_ROUND_FOR_INDUSTRY_ACTIONS,
      ledger: { cash: 1000, cumulativeProfit: 0 },
    });
    const state = makeGameState({
      currentRound: MIN_ROUND_FOR_INDUSTRY_ACTIONS + NPC_INDUSTRY_SWITCH_RULES.cooldownRounds - 1,
      roundMetrics: negativeProfitHistory("c1"),
      wholesaleListings: [{ id: "w1", companyId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 }],
    });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("food");
  });

  it("does not switch when the probability roll fails (rng >= switchProbability)", () => {
    const company = makeCompany({ id: "c1", productCategoryId: "food", ledger: { cash: 1000, cumulativeProfit: 0 } });
    const state = makeGameState({
      roundMetrics: negativeProfitHistory("c1"),
      wholesaleListings: [{ id: "w1", companyId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 }],
    });
    decideCompanyIndustrySwitch(company, state, () => NPC_INDUSTRY_SWITCH_RULES.switchProbability);

    expect(company.productCategoryId).toBe("food");
  });

  it("excludes candidate categories with no wholesale market data", () => {
    const company = makeCompany({ id: "c1", productCategoryId: "food", ledger: { cash: 1000, cumulativeProfit: 0 } });
    // Only "toys" has any wholesale listings; apparel/electronics have none and must be skipped.
    const state = makeGameState({
      roundMetrics: negativeProfitHistory("c1"),
      wholesaleListings: [{ id: "w1", companyId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 }],
    });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("toys");
  });

  it("does not switch when no candidate category has any market data at all", () => {
    const company = makeCompany({ id: "c1", productCategoryId: "food", ledger: { cash: 1000, cumulativeProfit: 0 } });
    const state = makeGameState({ roundMetrics: negativeProfitHistory("c1"), wholesaleListings: [] });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("food");
  });

  it("picks the candidate category with the highest estimated margin", () => {
    const company = makeCompany({
      id: "c1",
      productCategoryId: "food",
      districtId: "downtown",
      ledger: { cash: 1000, cumulativeProfit: 0 },
    });
    // Both apparel and toys have wholesale data at the same average price (50), but toys has a
    // higher unit cost at this district, so apparel's estimated margin is strictly higher.
    const state = makeGameState({
      roundMetrics: negativeProfitHistory("c1"),
      wholesaleListings: [
        { id: "w-apparel", companyId: "other", categoryId: "apparel", quantityAvailable: 10, quality: 0.5, price: 50 },
        { id: "w-toys", companyId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 50 },
      ],
    });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("apparel");
  });

  it("rejects the switch (stays put) when the switch cost exceeds current cash", () => {
    const cost = industrySwitchCost("food", "toys");
    const company = makeCompany({ id: "c1", productCategoryId: "food", ledger: { cash: cost - 1, cumulativeProfit: 0 } });
    const state = makeGameState({
      roundMetrics: negativeProfitHistory("c1"),
      wholesaleListings: [{ id: "w1", companyId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 }],
    });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("food");
    expect(company.ledger.cash).toBe(cost - 1);
  });

  it("on a confirmed switch, charges exactly the switch cost and force-resets inventory/quality (B안)", () => {
    const cost = industrySwitchCost("food", "toys");
    const company = makeCompany({
      id: "c1",
      productCategoryId: "food",
      inventoryQuantity: 40,
      quality: 0.7,
      ledger: { cash: 1000, cumulativeProfit: 0 },
    });
    const state = makeGameState({
      currentRound: MIN_ROUND_FOR_INDUSTRY_ACTIONS,
      roundMetrics: negativeProfitHistory("c1"),
      wholesaleListings: [{ id: "w1", companyId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1000 }],
    });
    decideCompanyIndustrySwitch(company, state, () => 0);

    expect(company.productCategoryId).toBe("toys");
    expect(company.ledger.cash).toBe(1000 - cost);
    expect(company.inventoryQuantity).toBe(0);
    expect(company.quality).toBe(0);
    expect(company.lastIndustrySwitchRound).toBe(MIN_ROUND_FOR_INDUSTRY_ACTIONS);
  });
});

describe("decideStoreSpecialtyDeviation (Milestone 6, D-033)", () => {
  const negativeProfitHistory = (storeId: string): RoundMetrics[] =>
    Array.from({ length: NPC_STORE_SPECIALTY_DEVIATION_RULES.consecutiveNegativeProfitRounds }, (_, i) =>
      makeRoundMetrics(i + 1, { storeProfit: { [storeId]: -10 } }),
    );

  it("never switches before minRound", () => {
    const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
    const state = makeGameState({
      currentRound: NPC_STORE_SPECIALTY_DEVIATION_RULES.minRound - 1,
      roundMetrics: negativeProfitHistory("s1"),
      wholesaleListings: [{ id: "w1", companyId: "c", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 5 }],
      retailListings: [{ id: "r1", storeId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 20 }],
    });
    decideStoreSpecialtyDeviation(store, state, () => 0);

    expect(store.currentSellingCategoryId).toBeNull();
  });

  it("does not switch without consecutiveNegativeProfitRounds of losses", () => {
    const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
    const state = makeGameState({
      roundMetrics: [
        makeRoundMetrics(1, { storeProfit: { s1: -10 } }),
        makeRoundMetrics(2, { storeProfit: { s1: 5 } }),
      ],
      wholesaleListings: [{ id: "w1", companyId: "c", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 5 }],
      retailListings: [{ id: "r1", storeId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 20 }],
    });
    decideStoreSpecialtyDeviation(store, state, () => 0);

    expect(store.currentSellingCategoryId).toBeNull();
  });

  it("stays put while still inside the post-switch cooldown", () => {
    const store = makeStore({
      id: "s1",
      specialtyCategoryId: "food",
      currentSellingCategoryId: "food",
      lastSellingCategoryChangeRound: NPC_STORE_SPECIALTY_DEVIATION_RULES.minRound,
    });
    const state = makeGameState({
      currentRound: NPC_STORE_SPECIALTY_DEVIATION_RULES.minRound + NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds - 1,
      roundMetrics: negativeProfitHistory("s1"),
      wholesaleListings: [{ id: "w1", companyId: "c", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 5 }],
      retailListings: [{ id: "r1", storeId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 20 }],
    });
    decideStoreSpecialtyDeviation(store, state, () => 0);

    expect(store.currentSellingCategoryId).toBe("food");
  });

  it("does not switch when the probability roll fails", () => {
    const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
    const state = makeGameState({
      roundMetrics: negativeProfitHistory("s1"),
      wholesaleListings: [{ id: "w1", companyId: "c", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 5 }],
      retailListings: [{ id: "r1", storeId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 20 }],
    });
    decideStoreSpecialtyDeviation(store, state, () => NPC_STORE_SPECIALTY_DEVIATION_RULES.switchProbability);

    expect(store.currentSellingCategoryId).toBeNull();
  });

  it("excludes a candidate category missing either wholesale or retail market data", () => {
    const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
    const state = makeGameState({
      roundMetrics: negativeProfitHistory("s1"),
      // toys has both sides of data; apparel only has retail data (no wholesale quote) and must
      // be excluded even though its retail price looks attractive.
      wholesaleListings: [{ id: "w-toys", companyId: "c", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 5 }],
      retailListings: [
        { id: "r-toys", storeId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 20 },
        { id: "r-apparel", storeId: "other", categoryId: "apparel", quantityAvailable: 10, quality: 0.5, price: 1000 },
      ],
    });
    decideStoreSpecialtyDeviation(store, state, () => 0);

    expect(store.currentSellingCategoryId).toBe("toys");
  });

  it("does not switch when no candidate category has both wholesale and retail data", () => {
    const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
    const state = makeGameState({ roundMetrics: negativeProfitHistory("s1"), wholesaleListings: [], retailListings: [] });
    decideStoreSpecialtyDeviation(store, state, () => 0);

    expect(store.currentSellingCategoryId).toBeNull();
  });

  it("picks the candidate category with the highest estimated margin (retail price - wholesale cost)", () => {
    const store = makeStore({ id: "s1", specialtyCategoryId: "food" });
    const state = makeGameState({
      roundMetrics: negativeProfitHistory("s1"),
      wholesaleListings: [
        { id: "w-apparel", companyId: "c", categoryId: "apparel", quantityAvailable: 10, quality: 0.5, price: 10 },
        { id: "w-toys", companyId: "c", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 5 },
      ],
      retailListings: [
        { id: "r-apparel", storeId: "other", categoryId: "apparel", quantityAvailable: 10, quality: 0.5, price: 30 }, // margin 20
        { id: "r-toys", storeId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 20 }, // margin 15
      ],
    });
    decideStoreSpecialtyDeviation(store, state, () => 0);

    expect(store.currentSellingCategoryId).toBe("apparel");
  });

  it("on a confirmed switch, force-resets inventory/quality to 0 with no cost charged (B안)", () => {
    const store = makeStore({
      id: "s1",
      specialtyCategoryId: "food",
      inventoryQuantity: 25,
      inventoryQuality: 0.6,
      ledger: { cash: 500, cumulativeProfit: 0 },
    });
    const state = makeGameState({
      currentRound: NPC_STORE_SPECIALTY_DEVIATION_RULES.minRound,
      roundMetrics: negativeProfitHistory("s1"),
      wholesaleListings: [{ id: "w1", companyId: "c", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 5 }],
      retailListings: [{ id: "r1", storeId: "other", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 20 }],
    });
    decideStoreSpecialtyDeviation(store, state, () => 0);

    expect(store.currentSellingCategoryId).toBe("toys");
    expect(store.inventoryQuantity).toBe(0);
    expect(store.inventoryQuality).toBe(0);
    expect(store.ledger.cash).toBe(500);
    expect(store.lastSellingCategoryChangeRound).toBe(NPC_STORE_SPECIALTY_DEVIATION_RULES.minRound);
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

  it.each([
    ["premium", 0.7],
    ["low-cost", 1.3],
    ["aggressive", 1.5],
  ] as const)(
    "always returns integer purchase quantities for strategy=%s (targetStockLevel=15*%s is fractional)",
    (strategyId, _multiplier) => {
      const listings: WholesaleListing[] = [
        { id: "l-food", companyId: "co-a", categoryId: "food", quantityAvailable: 1000, quality: 0.5, price: 4 },
      ];
      const store = makeStore({ strategyId, specialtyCategoryId: "food", inventoryQuantity: 0 });
      const rng = createRng(1);

      const decision = decideStorePurchases(store, 10_000, listings, rng);

      expect(decision.purchases.length).toBeGreaterThan(0);
      for (const purchase of decision.purchases) {
        expect(Number.isInteger(purchase.quantity)).toBe(true);
      }
    },
  );

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

    const decision = decideHouseholdPurchases(household, 25, listings, {}, rng);
    const totalSpent = decision.purchases.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);

    expect(totalSpent).toBeLessThanOrEqual(25);
  });

  it("buys nothing when no listings are eligible", () => {
    const household = makeHousehold();
    const rng = createRng(1);

    const decision = decideHouseholdPurchases(household, 100, [], {}, rng);

    expect(decision.purchases).toHaveLength(0);
  });

  it("prioritizes food over apparel/electronics/toys when normalized price and quality are identical (D-024 priority bonus, npc household)", () => {
    const household = makeHousehold({ kind: "npc" });
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
    const decision = decideHouseholdPurchases(household, 1000, listings, {}, rng);

    expect(decision.purchases.length).toBeGreaterThan(0);
    expect(decision.purchases[0]!.listingId).toBe("r-food");
  });

  it("does not let the priority bonus override an extreme price disadvantage (npc household)", () => {
    const household = makeHousehold({ kind: "npc" });
    const listings: RetailListing[] = [
      { id: "r-food-expensive", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 1000 },
      { id: "r-toys-cheap", storeId: "store-a", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 10 },
    ];
    const rng = createRng(1);

    const decision = decideHouseholdPurchases(household, 15, listings, {}, rng);

    expect(decision.purchases.some((p) => p.listingId === "r-food-expensive")).toBe(false);
    expect(decision.purchases.some((p) => p.listingId === "r-toys-cheap")).toBe(true);
  });

  it("applies the priority bonus only for kind='npc', never for kind='student' (D-024 follow-up fix)", () => {
    // stable preset => qualityWeight = 0.5. Both listings share quality 0.5, quantityAvailable 10.
    // toys price is set exactly at its reference price (normalizedPrice = 1), giving a raw score
    // (before any bonus) of 0.5*0.5 - 0.5*1 = -0.25.
    // food price is set so normalizedPrice = 1.1, giving a raw score of 0.5*0.5 - 0.5*1.1 = -0.30
    // — a deterministic 0.05 gap below toys that is larger than the max possible tie-break spread
    // (rngRange(-0.01, 0.01) per candidate => at most 0.02 difference between two candidates), so
    // without the bonus toys always wins. Adding the npc-only bonus (food: 0.15) flips food's
    // score to -0.30 + 0.15 = -0.15, a 0.10 gap above toys that also exceeds the tie-break spread,
    // so with the bonus food always wins. This isolates the household.kind branch deterministically
    // instead of relying on `not.toBe` (which could pass by tie-break luck alone).
    const foodReferencePrice = 4 * 2.2; // CATEGORY_UNIT_COST.food * REFERENCE_PRICE_MULTIPLIER
    const toysReferencePrice = 8 * 2.2; // CATEGORY_UNIT_COST.toys * REFERENCE_PRICE_MULTIPLIER
    const listings: RetailListing[] = [
      { id: "r-food", storeId: "store-a", categoryId: "food", quantityAvailable: 10, quality: 0.5, price: 1.1 * foodReferencePrice },
      { id: "r-toys", storeId: "store-a", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 1.0 * toysReferencePrice },
    ];

    const npcHousehold = makeHousehold({ kind: "npc" });
    const studentHousehold = makeHousehold({ kind: "student" });

    // Ample cash: candidates are bought in descending score order, so the first purchase
    // reveals the top-ranked listing directly (same technique as the "prioritizes food" test
    // above) — with 1000 cash both listings would eventually be bought regardless of order,
    // so checking `purchases[0]` rather than "some" is what actually isolates the ranking.
    const npcDecision = decideHouseholdPurchases(npcHousehold, 1000, listings, {}, createRng(3));
    const studentDecision = decideHouseholdPurchases(studentHousehold, 1000, listings, {}, createRng(3));

    expect(npcDecision.purchases[0]!.listingId).toBe("r-food");
    expect(studentDecision.purchases[0]!.listingId).toBe("r-toys");
  });

  it("ranks a listing sold outside the seller's specialty lower via specialtyMismatchPenalty, regardless of household kind (Milestone 6, D-033)", () => {
    const listings: RetailListing[] = [
      { id: "r-match", storeId: "store-match", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 10 },
      { id: "r-mismatch", storeId: "store-mismatch", categoryId: "toys", quantityAvailable: 10, quality: 0.5, price: 10 },
    ];
    const stores: Record<string, StoreState> = {
      "store-match": makeStore({ id: "store-match", specialtyCategoryId: "toys" }),
      "store-mismatch": makeStore({ id: "store-mismatch", specialtyCategoryId: "food" }),
    };
    const studentHousehold = makeHousehold({ kind: "student" });

    const decision = decideHouseholdPurchases(studentHousehold, 1000, listings, stores, createRng(1));

    expect(decision.purchases[0]!.listingId).toBe("r-match");
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

  it("subtracting specialtyMismatchPenalty(...) as scoreAdjustment lowers the score by exactly that amount (Milestone 6, D-033)", () => {
    const penalty = specialtyMismatchPenalty("food", "toys");
    const rng1 = createRng(5);
    const rng2 = createRng(5);

    const withoutPenalty = scoreListingForBuyer(10, 0.5, "toys", 0.5, rng1);
    const withPenalty = scoreListingForBuyer(10, 0.5, "toys", 0.5, rng2, -penalty);

    expect(withoutPenalty - withPenalty).toBeCloseTo(penalty, 10);
  });

  it("defaults priorityBonus to 0 when omitted", () => {
    const rng1 = createRng(9);
    const rng2 = createRng(9);

    const implicit = scoreListingForBuyer(10, 0.5, "food", 0.5, rng1);
    const explicitZero = scoreListingForBuyer(10, 0.5, "food", 0.5, rng2, 0);

    expect(implicit).toBe(explicitZero);
  });
});
