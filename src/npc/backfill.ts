/**
 * 부족한 시장 참여자를 NPC로 보충하는 계획 수립 (D-007, D-008, docs/NPC_DESIGN.md).
 * 인원수만 보는 것이 아니라 업종 쏠림도 본다: 학생 기업/가게가 특정 카테고리에 몰려 있으면
 * 비어 있는 카테고리를 NPC로 채운다.
 *
 * 이 모듈은 "몇 명을, 어떤 카테고리/상권/전략으로 만들 것인가"만 계산한다. 실제 GameState
 * 엔티티 생성은 src/engine/simulateGame.ts가 담당한다.
 */
import { ALL_STRATEGIES, DISTRICT_IDS, NPC_TARGETS, PRODUCT_CATEGORIES } from "../economy/config.js";
import { rngPick, type Rng } from "../economy/rng.js";
import type { DistrictId, ProductCategoryId, StrategyId } from "../types/domain.js";

export interface NpcBusinessSlot {
  categoryId: ProductCategoryId;
  districtId: DistrictId;
  strategyId: StrategyId;
}

export interface NpcConsumerSlot {
  strategyId: StrategyId;
}

export interface BackfillPlan {
  npcCompanies: NpcBusinessSlot[];
  npcStores: NpcBusinessSlot[];
  npcConsumers: NpcConsumerSlot[];
}

function fillCategoryCoverage(
  existingCategoryCounts: Record<ProductCategoryId, number>,
  baselineCount: number,
  rng: Rng,
): NpcBusinessSlot[] {
  const slots: NpcBusinessSlot[] = [];
  const counts = { ...existingCategoryCounts };

  for (let i = 0; i < baselineCount; i += 1) {
    const categoryId = PRODUCT_CATEGORIES[i % PRODUCT_CATEGORIES.length]!;
    const districtId = DISTRICT_IDS[i % DISTRICT_IDS.length]!;
    slots.push({ categoryId, districtId, strategyId: rngPick(rng, ALL_STRATEGIES) });
    counts[categoryId] = (counts[categoryId] ?? 0) + 1;
  }

  let districtCursor = baselineCount;
  for (const categoryId of PRODUCT_CATEGORIES) {
    if ((counts[categoryId] ?? 0) > 0) continue;
    const districtId = DISTRICT_IDS[districtCursor % DISTRICT_IDS.length]!;
    slots.push({ categoryId, districtId, strategyId: rngPick(rng, ALL_STRATEGIES) });
    counts[categoryId] = 1;
    districtCursor += 1;
  }

  return slots;
}

function emptyCategoryCounts(): Record<ProductCategoryId, number> {
  return { food: 0, apparel: 0, electronics: 0, toys: 0 };
}

function countByCategory(categories: readonly ProductCategoryId[]): Record<ProductCategoryId, number> {
  const counts = emptyCategoryCounts();
  for (const categoryId of categories) {
    counts[categoryId] += 1;
  }
  return counts;
}

export function planNpcBackfill(
  studentCount: number,
  studentCompanyCategories: readonly ProductCategoryId[],
  studentStoreCategories: readonly ProductCategoryId[],
  rng: Rng,
): BackfillPlan {
  const npcCompanies = fillCategoryCoverage(
    countByCategory(studentCompanyCategories),
    Math.max(0, NPC_TARGETS.minCompanies - studentCount),
    rng,
  );
  const npcStores = fillCategoryCoverage(
    countByCategory(studentStoreCategories),
    Math.max(0, NPC_TARGETS.minStores - studentCount),
    rng,
  );

  const targetTotalConsumers = Math.max(
    NPC_TARGETS.minConsumers,
    Math.ceil(studentCount * (1 + NPC_TARGETS.consumersPerStudent)),
  );
  const npcConsumerCount = Math.max(0, targetTotalConsumers - studentCount);
  const npcConsumers: NpcConsumerSlot[] = Array.from({ length: npcConsumerCount }, () => ({
    strategyId: rngPick(rng, ALL_STRATEGIES),
  }));

  return { npcCompanies, npcStores, npcConsumers };
}
