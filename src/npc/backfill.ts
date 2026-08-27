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

/**
 * 카테고리별로 최소 참여자 수(minPerCategory)를 채운다 (D-023) — "전체 최소치"가 아니라
 * 카테고리 단위 하한이라, 학생이 어느 업종에 쏠려 있든 각 카테고리마다 최소한의 경쟁자가
 * 생긴다. 예: minPerCategory=2, 학생이 food에만 1명 있으면 food에 NPC 1개, 나머지 3개
 * 카테고리에는 NPC 2개씩 배치된다.
 */
function fillCategoryMinimums(
  existingCategoryCounts: Record<ProductCategoryId, number>,
  minPerCategory: number,
  rng: Rng,
): NpcBusinessSlot[] {
  const slots: NpcBusinessSlot[] = [];
  let districtCursor = 0;

  for (const categoryId of PRODUCT_CATEGORIES) {
    const existing = existingCategoryCounts[categoryId] ?? 0;
    const needed = Math.max(0, minPerCategory - existing);
    for (let i = 0; i < needed; i += 1) {
      const districtId = DISTRICT_IDS[districtCursor % DISTRICT_IDS.length]!;
      slots.push({ categoryId, districtId, strategyId: rngPick(rng, ALL_STRATEGIES) });
      districtCursor += 1;
    }
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
  const npcCompanies = fillCategoryMinimums(
    countByCategory(studentCompanyCategories),
    NPC_TARGETS.minCompaniesPerCategory,
    rng,
  );
  const npcStores = fillCategoryMinimums(
    countByCategory(studentStoreCategories),
    NPC_TARGETS.minStoresPerCategory,
    rng,
  );

  // 소비자(수요) 목표는 학생 수가 아니라 실제 가게 수(공급)에 연동한다 — D-023 후속:
  // 카테고리별 최소치로 가게를 늘렸는데 소비자 수는 그대로면 판매자만 늘어 평균 손익이
  // 더 나빠진다. 모든 참여자는 기업+가게+가계를 함께 한다는 원칙(D-001)을 NPC에도
  // 반영해, 가게가 늘어난 만큼 소비자도 함께 늘린다.
  const totalStores = studentStoreCategories.length + npcStores.length;
  const targetTotalConsumers = Math.max(
    NPC_TARGETS.minConsumers,
    Math.ceil(totalStores * NPC_TARGETS.consumersPerStore),
  );
  const npcConsumerCount = Math.max(0, targetTotalConsumers - studentCount);
  const npcConsumers: NpcConsumerSlot[] = Array.from({ length: npcConsumerCount }, () => ({
    strategyId: rngPick(rng, ALL_STRATEGIES),
  }));

  return { npcCompanies, npcStores, npcConsumers };
}
