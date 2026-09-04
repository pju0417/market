import { describe, expect, it } from "vitest";
import { allocateCategoryPurchase, type AllocatableListing } from "../../src/economy/purchaseMatching.js";
import { createRng } from "../../src/economy/rng.js";

function listing(overrides: Partial<AllocatableListing> & { id: string }): AllocatableListing {
  return { price: 10, quantityAvailable: 10, quality: 0.5, ...overrides };
}

describe("allocateCategoryPurchase", () => {
  it("returns nothing for an empty listing array", () => {
    const purchases = allocateCategoryPurchase([], 10, Infinity, 1000, createRng(1));
    expect(purchases).toEqual([]);
  });

  it("filters out listings above maxUnitPrice before sorting/filling (boundary: price === maxUnitPrice is kept)", () => {
    const listings = [
      listing({ id: "at-cap", price: 10 }),
      listing({ id: "over-cap", price: 10.01 }),
    ];
    const purchases = allocateCategoryPurchase(listings, 10, 10, 1000, createRng(1));

    expect(purchases.some((p) => p.listingId === "at-cap")).toBe(true);
    expect(purchases.some((p) => p.listingId === "over-cap")).toBe(false);
  });

  it("respects maxQuantity across multiple listings", () => {
    const listings = [listing({ id: "a", price: 1, quantityAvailable: 100 }), listing({ id: "b", price: 1, quantityAvailable: 100 })];
    const purchases = allocateCategoryPurchase(listings, 5, Infinity, 1000, createRng(1));
    const total = purchases.reduce((sum, p) => sum + p.quantity, 0);

    expect(total).toBe(5);
  });

  it("respects availableCash even when maxQuantity would allow more", () => {
    const listings = [listing({ id: "a", price: 10, quantityAvailable: 100 })];
    const purchases = allocateCategoryPurchase(listings, 100, Infinity, 25, createRng(1));

    expect(purchases).toEqual([{ listingId: "a", quantity: 2, unitPrice: 10 }]);
  });

  it("never exceeds a single listing's quantityAvailable", () => {
    const listings = [listing({ id: "a", price: 1, quantityAvailable: 3 })];
    const purchases = allocateCategoryPurchase(listings, 100, Infinity, 1000, createRng(1));

    expect(purchases).toEqual([{ listingId: "a", quantity: 3, unitPrice: 1 }]);
  });

  it("without scoreFn, sorts by price ascending (price-preferred / default mode)", () => {
    const listings = [
      listing({ id: "expensive", price: 9, quantityAvailable: 1 }),
      listing({ id: "cheap", price: 1, quantityAvailable: 1 }),
    ];
    const purchases = allocateCategoryPurchase(listings, 1, Infinity, 1000, createRng(1));

    expect(purchases[0]!.listingId).toBe("cheap");
  });

  it("with scoreFn, sorts by score descending regardless of price", () => {
    const listings = [
      listing({ id: "cheap-low-score", price: 1, quantityAvailable: 1 }),
      listing({ id: "expensive-high-score", price: 9, quantityAvailable: 1 }),
    ];
    const purchases = allocateCategoryPurchase(listings, 1, Infinity, 1000, createRng(1), (l) =>
      l.id === "expensive-high-score" ? 100 : 0,
    );

    expect(purchases[0]!.listingId).toBe("expensive-high-score");
  });

  it("breaks exact price ties deterministically via rng, consistently for a fixed seed", () => {
    const listings = [
      listing({ id: "a", price: 5, quantityAvailable: 1 }),
      listing({ id: "b", price: 5, quantityAvailable: 1 }),
    ];
    const firstRun = allocateCategoryPurchase(listings, 1, Infinity, 1000, createRng(42));
    const secondRun = allocateCategoryPurchase(listings, 1, Infinity, 1000, createRng(42));

    expect(firstRun).toEqual(secondRun);
  });

  it("always produces integer quantities (Number.isInteger invariant, D-027 regression)", () => {
    const listings = [listing({ id: "a", price: 3, quantityAvailable: 7 })];
    const purchases = allocateCategoryPurchase(listings, 5, Infinity, 11, createRng(1));

    for (const purchase of purchases) {
      expect(Number.isInteger(purchase.quantity)).toBe(true);
    }
  });

  it("stops once maxQuantity or cash is exhausted, skipping listings that would need 0 units", () => {
    const listings = [
      listing({ id: "a", price: 1, quantityAvailable: 3 }),
      listing({ id: "b", price: 1, quantityAvailable: 3 }),
    ];
    const purchases = allocateCategoryPurchase(listings, 3, Infinity, 1000, createRng(1));
    const total = purchases.reduce((sum, p) => sum + p.quantity, 0);

    expect(total).toBe(3);
  });
});
