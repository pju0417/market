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
    const decision = decideHouseholdPurchases(household, 1000, listings, rng);

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

    const decision = decideHouseholdPurchases(household, 15, listings, rng);

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
    const npcDecision = decideHouseholdPurchases(npcHousehold, 1000, listings, createRng(3));
    const studentDecision = decideHouseholdPurchases(studentHousehold, 1000, listings, createRng(3));

    expect(npcDecision.purchases[0]!.listingId).toBe("r-food");
    expect(studentDecision.purchases[0]!.listingId).toBe("r-toys");
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
