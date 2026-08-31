import { describe, expect, it } from "vitest";
import {
  computeCategoryAverages,
  computeCompetitorCount,
  computeStoreCompetitorCount,
  estimateCategoryMargin,
} from "../../src/economy/marketStats.js";
import type { CompanyState, RetailListing, StoreState, WholesaleListing } from "../../src/types/domain.js";

function makeListing(overrides: Partial<WholesaleListing>): WholesaleListing {
  return {
    id: "wl-1",
    companyId: "c1",
    categoryId: "food",
    quantityAvailable: 10,
    quality: 0.5,
    price: 10,
    ...overrides,
  };
}

function makeRetailListing(overrides: Partial<RetailListing>): RetailListing {
  return {
    id: "rl-1",
    storeId: "s1",
    categoryId: "food",
    quantityAvailable: 10,
    quality: 0.5,
    price: 20,
    ...overrides,
  };
}

function makeCompany(overrides: Partial<CompanyState>): CompanyState {
  return {
    id: "c1",
    ownerId: "c1",
    kind: "student",
    districtId: "downtown",
    ledger: { cash: 100, cumulativeProfit: 0 },
    strategyId: "stable",
    productCategoryId: "food",
    quality: 0.5,
    inventoryQuantity: 0,
    lastWholesalePrice: 10,
    lastIndustrySwitchRound: null,
    ...overrides,
  };
}

function makeStore(overrides: Partial<StoreState>): StoreState {
  return {
    id: "s1",
    ownerId: "s1",
    kind: "student",
    districtId: "downtown",
    ledger: { cash: 100, cumulativeProfit: 0 },
    strategyId: "stable",
    specialtyCategoryId: "food",
    currentSellingCategoryId: null,
    inventoryQuantity: 0,
    inventoryQuality: 0.5,
    retailPrice: 20,
    lastSellingCategoryChangeRound: null,
    ...overrides,
  };
}

describe("computeCategoryAverages", () => {
  it("returns undefined when no listings match the category", () => {
    const listings = [makeListing({ categoryId: "apparel" })];
    expect(computeCategoryAverages(listings, "food")).toBeUndefined();
  });

  it("returns undefined for an empty listing array", () => {
    expect(computeCategoryAverages([], "food")).toBeUndefined();
  });

  it("computes average price/quality and count for matching listings only", () => {
    const listings = [
      makeListing({ id: "a", categoryId: "food", price: 10, quality: 0.4 }),
      makeListing({ id: "b", categoryId: "food", price: 20, quality: 0.6 }),
      makeListing({ id: "c", categoryId: "apparel", price: 1000, quality: 1 }),
    ];
    const result = computeCategoryAverages(listings, "food");
    expect(result).toEqual({ averagePrice: 15, averageQuality: 0.5, listingCount: 2 });
  });

  it("also accepts RetailListing[] (structurally compatible, no logic change) as a regression check", () => {
    const listings = [
      makeRetailListing({ id: "a", categoryId: "food", price: 20, quality: 0.4 }),
      makeRetailListing({ id: "b", categoryId: "food", price: 30, quality: 0.6 }),
      makeRetailListing({ id: "c", categoryId: "apparel", price: 1000, quality: 1 }),
    ];
    const result = computeCategoryAverages(listings, "food");
    expect(result).toEqual({ averagePrice: 25, averageQuality: 0.5, listingCount: 2 });
  });
});

describe("computeCompetitorCount", () => {
  it("counts other companies in the same category, excluding self", () => {
    const companies = {
      c1: makeCompany({ id: "c1", productCategoryId: "food" }),
      c2: makeCompany({ id: "c2", productCategoryId: "food" }),
      c3: makeCompany({ id: "c3", productCategoryId: "apparel" }),
    };
    expect(computeCompetitorCount(companies, "food", "c1")).toBe(1);
  });

  it("returns 0 when no other company shares the category", () => {
    const companies = {
      c1: makeCompany({ id: "c1", productCategoryId: "food" }),
      c2: makeCompany({ id: "c2", productCategoryId: "apparel" }),
    };
    expect(computeCompetitorCount(companies, "food", "c1")).toBe(0);
  });

  it("excludes the company itself even if it matches the category", () => {
    const companies = {
      c1: makeCompany({ id: "c1", productCategoryId: "food" }),
    };
    expect(computeCompetitorCount(companies, "food", "c1")).toBe(0);
  });
});

describe("computeStoreCompetitorCount", () => {
  it("counts other stores in the same specialty category, excluding self", () => {
    const stores = {
      s1: makeStore({ id: "s1", specialtyCategoryId: "food" }),
      s2: makeStore({ id: "s2", specialtyCategoryId: "food" }),
      s3: makeStore({ id: "s3", specialtyCategoryId: "apparel" }),
    };
    expect(computeStoreCompetitorCount(stores, "food", "s1")).toBe(1);
  });

  it("returns 0 when no other store shares the specialty category", () => {
    const stores = {
      s1: makeStore({ id: "s1", specialtyCategoryId: "food" }),
      s2: makeStore({ id: "s2", specialtyCategoryId: "apparel" }),
    };
    expect(computeStoreCompetitorCount(stores, "food", "s1")).toBe(0);
  });

  it("excludes the store itself even if it matches the category", () => {
    const stores = {
      s1: makeStore({ id: "s1", specialtyCategoryId: "food" }),
    };
    expect(computeStoreCompetitorCount(stores, "food", "s1")).toBe(0);
  });
});

describe("estimateCategoryMargin (Milestone 6, D-033)", () => {
  it("returns averagePrice - unitCost when the category has listings", () => {
    const listings = [
      makeListing({ id: "a", categoryId: "food", price: 10 }),
      makeListing({ id: "b", categoryId: "food", price: 20 }),
    ];
    expect(estimateCategoryMargin(listings, "food", 4)).toBe(15 - 4);
  });

  it("returns undefined when the category has no listings (data unavailable)", () => {
    const listings = [makeListing({ id: "a", categoryId: "apparel" })];
    expect(estimateCategoryMargin(listings, "food", 4)).toBeUndefined();
  });

  it("can be negative when unitCost exceeds the average selling price", () => {
    const listings = [makeListing({ id: "a", categoryId: "food", price: 5 })];
    expect(estimateCategoryMargin(listings, "food", 20)).toBe(5 - 20);
  });
});
