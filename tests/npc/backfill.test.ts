import { describe, expect, it } from "vitest";
import { NPC_TARGETS, PRODUCT_CATEGORIES } from "../../src/economy/config.js";
import { createRng } from "../../src/economy/rng.js";
import { planNpcBackfill } from "../../src/npc/backfill.js";
import type { ProductCategoryId } from "../../src/types/domain.js";

describe("planNpcBackfill (D-007, D-008)", () => {
  it("fills every category with at least one company and one store even when students cover none", () => {
    const rng = createRng(1);
    const plan = planNpcBackfill(1, ["food"], ["food"], rng);

    const companyCategories = new Set<ProductCategoryId>(["food", ...plan.npcCompanies.map((s) => s.categoryId)]);
    const storeCategories = new Set<ProductCategoryId>(["food", ...plan.npcStores.map((s) => s.categoryId)]);

    for (const category of PRODUCT_CATEGORIES) {
      expect(companyCategories.has(category)).toBe(true);
      expect(storeCategories.has(category)).toBe(true);
    }
  });

  it("adds no baseline NPC companies/stores once students alone cover the minimum and all categories", () => {
    const rng = createRng(1);
    const studentCategories = [...PRODUCT_CATEGORIES, ...PRODUCT_CATEGORIES];
    const plan = planNpcBackfill(NPC_TARGETS.minCompanies + 4, studentCategories, studentCategories, rng);

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
