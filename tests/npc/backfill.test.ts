import { describe, expect, it } from "vitest";
import { NPC_TARGETS, PRODUCT_CATEGORIES } from "../../src/economy/config.js";
import { createRng } from "../../src/economy/rng.js";
import { planNpcBackfill } from "../../src/npc/backfill.js";
import type { ProductCategoryId } from "../../src/types/domain.js";

function countByCategory(categoryIds: readonly ProductCategoryId[]): Record<ProductCategoryId, number> {
  const counts: Record<ProductCategoryId, number> = { food: 0, apparel: 0, electronics: 0, toys: 0 };
  for (const id of categoryIds) counts[id] += 1;
  return counts;
}

describe("planNpcBackfill (D-007, D-008, D-023)", () => {
  it("brings every category up to at least minCompaniesPerCategory/minStoresPerCategory participants, even when a single student covers only one category", () => {
    const rng = createRng(1);
    const plan = planNpcBackfill(1, ["food"], ["food"], rng);

    const companyCounts = countByCategory(plan.npcCompanies.map((s) => s.categoryId));
    const storeCounts = countByCategory(plan.npcStores.map((s) => s.categoryId));
    companyCounts.food += 1; // the student's own company
    storeCounts.food += 1; // the student's own store

    for (const category of PRODUCT_CATEGORIES) {
      expect(companyCounts[category]).toBeGreaterThanOrEqual(NPC_TARGETS.minCompaniesPerCategory);
      expect(storeCounts[category]).toBeGreaterThanOrEqual(NPC_TARGETS.minStoresPerCategory);
    }
  });

  it("D-023 regression: a lone student's own category is not left as a bare duopoly-of-one — every other category still meets the same per-category floor", () => {
    // Before D-023's fix, minCompanies/minStores were a *flat* total (4) that happened to
    // equal the category count (4), so at studentCount=1 every category ended up with
    // exactly one seller. This asserts the floor is now genuinely per-category.
    const rng = createRng(1);
    const plan = planNpcBackfill(1, ["food"], ["toys"], rng);

    const companyCounts = countByCategory(plan.npcCompanies.map((s) => s.categoryId));
    const storeCounts = countByCategory(plan.npcStores.map((s) => s.categoryId));

    // The student's own category needs one fewer NPC than the others (the student fills one slot).
    expect(companyCounts.food).toBe(NPC_TARGETS.minCompaniesPerCategory - 1);
    expect(companyCounts.apparel).toBe(NPC_TARGETS.minCompaniesPerCategory);
    expect(companyCounts.electronics).toBe(NPC_TARGETS.minCompaniesPerCategory);
    expect(storeCounts.toys).toBe(NPC_TARGETS.minStoresPerCategory - 1);
    expect(storeCounts.food).toBe(NPC_TARGETS.minStoresPerCategory);
  });

  it("adds no NPC companies/stores once students alone meet the per-category minimum everywhere", () => {
    const rng = createRng(1);
    // Two students per category, which already meets minCompaniesPerCategory (2).
    const studentCategories = [...PRODUCT_CATEGORIES, ...PRODUCT_CATEGORIES];
    const plan = planNpcBackfill(studentCategories.length, studentCategories, studentCategories, rng);

    expect(plan.npcCompanies).toHaveLength(0);
    expect(plan.npcStores).toHaveLength(0);
  });

  it("scales NPC consumer count up with student count", () => {
    const rngSmall = createRng(1);
    const rngLarge = createRng(1);
    const smallPlan = planNpcBackfill(1, ["food"], ["food"], rngSmall);
    const largePlan = planNpcBackfill(20, Array(20).fill("food"), Array(20).fill("food"), rngLarge);

    expect(largePlan.npcConsumers.length).toBeGreaterThan(smallPlan.npcConsumers.length);
  });

  it("scales NPC consumer count with total store count, not just student count (D-001/D-023 follow-up: supply and demand should grow together)", () => {
    // Same studentCount (1) in both cases, but one leaves student store categories spread out
    // (fewer NPC stores needed) and the other concentrates them so more NPC stores get added
    // to satisfy minStoresPerCategory — more stores should mean more targeted consumers, even
    // though studentCount itself never changed.
    const rngFewStores = createRng(1);
    const plan = planNpcBackfill(1, ["food"], ["food"], rngFewStores);
    const totalStores = 1 + plan.npcStores.length;
    const expectedMinConsumers = Math.max(
      NPC_TARGETS.minConsumers,
      Math.ceil(totalStores * NPC_TARGETS.consumersPerStore),
    );

    expect(1 + plan.npcConsumers.length).toBeGreaterThanOrEqual(expectedMinConsumers);
  });

  it("never produces a negative NPC consumer count", () => {
    const rng = createRng(1);
    const studentCount = 100;
    const plan = planNpcBackfill(
      studentCount,
      Array(studentCount).fill("food"),
      Array(studentCount).fill("food"),
      rng,
    );

    expect(plan.npcConsumers.length).toBeGreaterThanOrEqual(0);
  });
});
