import type { DistrictId, ProductCategoryId, StrategyId } from "../types/domain.js";

/**
 * 경제 규칙 데이터 (v1 baseline).
 *
 * 이 파일의 모든 수치는 "임계값을 코드에 하드코딩하지 않고 설정값으로 관리한다"는
 * docs/ADVISOR_RULES.md·CLAUDE.md 원칙에 따라 로직에서 분리해 둔 것이며, Milestone 1의
 * 첫 구현을 위한 **초기값**이다. 최종 밸런스가 아니라 플레이테스트/economy-reviewer 검토를
 * 통해 조정될 것을 전제로 한다 (docs/DECISIONS.md D-018 참고). 공식 자체의 구조(무엇을
 * 입력으로 받는가)는 docs/ECONOMY_ENGINE.md에 맞추되, 구체 계수는 여기서만 바꾼다.
 */

export const PRODUCT_CATEGORIES: readonly ProductCategoryId[] = [
  "food",
  "apparel",
  "electronics",
  "toys",
];

/** 카테고리별 기본 생산 단가. 값이 클수록 진입 장벽이 높은 업종이다. */
export const CATEGORY_UNIT_COST: Record<ProductCategoryId, number> = {
  food: 4,
  apparel: 6,
  electronics: 12,
  toys: 8,
};

/**
 * 업종 유사도 매트릭스 (0~1, 1은 동일 업종). 대칭 행렬.
 * 업종 전환 추가비용(D-011), 가게의 전문성 이탈 페널티 계산에 쓰인다.
 */
export const CATEGORY_SIMILARITY: Record<ProductCategoryId, Record<ProductCategoryId, number>> = {
  food: { food: 1, apparel: 0.2, electronics: 0.1, toys: 0.3 },
  apparel: { food: 0.2, apparel: 1, electronics: 0.2, toys: 0.4 },
  electronics: { food: 0.1, apparel: 0.2, electronics: 1, toys: 0.5 },
  toys: { food: 0.3, apparel: 0.4, electronics: 0.5, toys: 1 },
};

export function categorySimilarity(a: ProductCategoryId, b: ProductCategoryId): number {
  return CATEGORY_SIMILARITY[a][b];
}

/**
 * 업종 전환 추가비용 (D-011). 유사도가 낮을수록(관련 없을수록) 비싸진다. `MIN_ROUND_FOR_INDUSTRY_ACTIONS`
 * 라운드부터 사람(src/economy/humanDecisions.ts)과 NPC(src/npc/decisions.ts) 양쪽 경로가
 * 실제로 호출한다 (Milestone 6, docs/DECISIONS.md D-033).
 */
export function industrySwitchCost(previous: ProductCategoryId, next: ProductCategoryId): number {
  return COSTS.industrySwitchBaseCost * (1 - categorySimilarity(previous, next));
}

/**
 * 가게가 전문 업종과 다른 카테고리를 팔 때의 소비자 매력도 페널티 (docs/GAME_RULES.md 4절).
 * `MIN_ROUND_FOR_INDUSTRY_ACTIONS` 라운드부터 가게가 전문 업종을 벗어나 판매할 수 있게 되면서
 * (Milestone 6, docs/DECISIONS.md D-033) src/npc/decisions.ts의 scoreListingForBuyer(가계 구매
 * 알고리즘)가 실제로 호출한다.
 */
export function specialtyMismatchPenalty(specialty: ProductCategoryId, sold: ProductCategoryId): number {
  return COSTS.storeSpecialtyMismatchPenalty * (1 - categorySimilarity(specialty, sold));
}

/**
 * 업종 전환/전문 이탈 판매가 실제로 활성화되는 라운드 (Milestone 6, docs/DECISIONS.md D-033).
 * 3라운드까지는 창업 시 정한 업종/전문성을 그대로 유지해야 한다는 커리큘럼 의도(docs/ROUND_FLOW.md)
 * 를 코드에서 강제하는 하드 게이트다.
 */
export const MIN_ROUND_FOR_INDUSTRY_ACTIONS = 4;

export interface IndustrySwitchRules {
  /** 이 라운드 미만에서는 절대 전환하지 않는다. */
  minRound: number;
  /** 최근 이만큼의 라운드 연속으로 적자였을 때만 전환을 "고려"한다. */
  consecutiveNegativeProfitRounds: number;
  /** 전환을 고려하는 조건을 만족해도, 이 확률로만 실제 전환을 실행한다 (rng 기반, 결정론 유지). */
  switchProbability: number;
  /**
   * 전환 판정에 쓰는 `currentRound - lastSwitchRound < cooldownRounds` 기준값. 전환이 확정된
   * 바로 다음 라운드 1개만 막힌다는 뜻이다(예: 값이 2여도 2라운드가 아니라 1라운드만 막힘) —
   * "cooldownRounds만큼의 라운드 동안 막힌다"로 오해하지 않도록 주의.
   */
  cooldownRounds: number;
}

/**
 * NPC 기업의 업종 전환 조건 (Milestone 6, docs/DECISIONS.md D-033 확정값). architect 제안값을
 * 그대로 사용한다 — 밸런스 조정이 필요해지면 CLAUDE.md 4절 승인 절차를 따른다.
 */
export const NPC_INDUSTRY_SWITCH_RULES: IndustrySwitchRules = {
  minRound: 4,
  consecutiveNegativeProfitRounds: 2,
  switchProbability: 0.5,
  cooldownRounds: 2,
};

/**
 * NPC 가게의 전문 업종 이탈 판매 조건 (Milestone 6, docs/DECISIONS.md D-033). 기업과 같은
 * 구조지만 독립된 상수다 — 나중에 가게만 따로 튜닝할 수 있도록 값을 공유하지 않고 복제해
 * 둔다(현재는 기업과 동일한 값에서 시작).
 *
 * cooldownRounds는 NPC 전용이 아니다 — 가게의 사람 전환 경로(resolveStoreCategorySwitch,
 * src/economy/humanDecisions.ts)와 StoreTurnScreen.tsx도 이 값을 그대로 공유해서 쓴다
 * (D-033에서 사용자가 승인한 의도적 공유).
 */
export const NPC_STORE_SPECIALTY_DEVIATION_RULES: IndustrySwitchRules = {
  minRound: 4,
  consecutiveNegativeProfitRounds: 2,
  switchProbability: 0.5,
  cooldownRounds: 2,
};

export interface DistrictProfile {
  id: DistrictId;
  /** 임대료 배율 (기업/가게 공통 기준값에 곱해진다). */
  rentMultiplier: number;
  /** 생산 효율 — 클수록 기업의 실효 생산단가가 낮아진다 (docs/GAME_RULES.md 5절). */
  companySuitability: number;
  /** 가게 흡객력 — 소매 매칭 점수에 가산되는 가중치 (docs/GAME_RULES.md 5절). */
  storeSuitability: number;
}

/**
 * 기업에 좋은 입지와 가게에 좋은 입지가 다르다는 요구사항(docs/GAME_RULES.md 5절)을
 * companySuitability와 storeSuitability를 분리해 표현한다.
 */
export const DISTRICTS: Record<DistrictId, DistrictProfile> = {
  "school-area": { id: "school-area", rentMultiplier: 0.8, companySuitability: 0.6, storeSuitability: 0.8 },
  residential: { id: "residential", rentMultiplier: 0.9, companySuitability: 0.6, storeSuitability: 0.9 },
  downtown: { id: "downtown", rentMultiplier: 1.6, companySuitability: 0.7, storeSuitability: 1.4 },
  upscale: { id: "upscale", rentMultiplier: 1.9, companySuitability: 0.6, storeSuitability: 1.1 },
  industrial: { id: "industrial", rentMultiplier: 0.7, companySuitability: 1.4, storeSuitability: 0.4 },
  outskirts: { id: "outskirts", rentMultiplier: 0.5, companySuitability: 0.9, storeSuitability: 0.5 },
};

export const DISTRICT_IDS: readonly DistrictId[] = Object.keys(DISTRICTS) as DistrictId[];

/**
 * 기업의 실효 생산단가. src/npc/decisions.ts(봇)와 src/economy/humanDecisions.ts(사람)가
 * 똑같이 이 함수를 쓴다 — UI도 미리보기를 보여줄 때 이 함수를 그대로 불러써야 하며,
 * 공식을 다시 베껴 쓰지 않는다.
 */
export function companyUnitCost(categoryId: ProductCategoryId, districtId: DistrictId): number {
  return CATEGORY_UNIT_COST[categoryId] / DISTRICTS[districtId].companySuitability;
}

/** 기본 비용 상수 (docs/GAME_RULES.md 3절 — 1라운드부터 적용, D-009). */
export const COSTS = {
  initialCashCompany: 800,
  initialCashStore: 800,
  baseLaborCostCompany: 30,
  baseLaborCostStore: 25,
  baseRentCompany: 40,
  baseRentStore: 45,
  wholesaleDistributionCostPerUnit: 0.5,
  retailDistributionCostPerUnit: 0.3,
  /** 업종 완전 전환 시 최대 추가비용 (유사도 0일 때). 유사도가 1에 가까울수록 낮아진다. */
  industrySwitchBaseCost: 100,
  /** 가게가 전문 업종과 다른 카테고리를 팔 때 소비자 매력도에서 차감되는 최대 페널티. */
  storeSpecialtyMismatchPenalty: 0.35,
  householdBudgetPerRound: 100,
};

export interface CompanyStrategyPreset {
  /** 카테고리 평균 대비 생산량 배율. */
  quantityMultiplier: number;
  /** 목표 품질 (0~1). */
  qualityTarget: number;
  /** 생산단가 대비 도매가 배율. */
  priceMarkup: number;
}

export const COMPANY_STRATEGY_PRESETS: Record<StrategyId, CompanyStrategyPreset> = {
  stable: { quantityMultiplier: 1.0, qualityTarget: 0.5, priceMarkup: 1.3 },
  "low-cost": { quantityMultiplier: 1.3, qualityTarget: 0.35, priceMarkup: 1.1 },
  premium: { quantityMultiplier: 0.7, qualityTarget: 0.85, priceMarkup: 1.6 },
  aggressive: { quantityMultiplier: 1.5, qualityTarget: 0.55, priceMarkup: 1.15 },
  conservative: { quantityMultiplier: 0.6, qualityTarget: 0.5, priceMarkup: 1.4 },
};

export interface StoreStrategyPreset {
  /** 한 번에 매입을 시도하는 목표 수량 배율. */
  purchaseQuantityMultiplier: number;
  /** 도매가 대비 소매가 배율. */
  priceMarkup: number;
  /** 공급처 선택 시 가격 대비 품질에 두는 가중치 (0=가격만, 1=품질만). */
  qualityWeight: number;
};

export const STORE_STRATEGY_PRESETS: Record<StrategyId, StoreStrategyPreset> = {
  stable: { purchaseQuantityMultiplier: 1.0, priceMarkup: 1.4, qualityWeight: 0.5 },
  "low-cost": { purchaseQuantityMultiplier: 1.3, priceMarkup: 1.2, qualityWeight: 0.2 },
  premium: { purchaseQuantityMultiplier: 0.7, priceMarkup: 1.8, qualityWeight: 0.85 },
  aggressive: { purchaseQuantityMultiplier: 1.5, priceMarkup: 1.15, qualityWeight: 0.35 },
  conservative: { purchaseQuantityMultiplier: 0.6, priceMarkup: 1.5, qualityWeight: 0.5 },
};

export interface HouseholdStrategyPreset {
  /** 구매 결정 시 가격에 두는 민감도 (0~1). */
  priceSensitivity: number;
  /** 구매 결정 시 품질에 두는 민감도 (0~1). */
  qualitySensitivity: number;
}

export const HOUSEHOLD_STRATEGY_PRESETS: Record<StrategyId, HouseholdStrategyPreset> = {
  stable: { priceSensitivity: 0.5, qualitySensitivity: 0.5 },
  "low-cost": { priceSensitivity: 0.8, qualitySensitivity: 0.2 },
  premium: { priceSensitivity: 0.2, qualitySensitivity: 0.8 },
  aggressive: { priceSensitivity: 0.6, qualitySensitivity: 0.4 },
  conservative: { priceSensitivity: 0.65, qualitySensitivity: 0.35 },
};

export const ALL_STRATEGIES: readonly StrategyId[] = [
  "stable",
  "low-cost",
  "premium",
  "aggressive",
  "conservative",
];

/**
 * NPC 보충 목표치 (docs/NPC_DESIGN.md, docs/DECISIONS.md D-008, D-023). 카테고리별로
 * 최소 참여자 수(학생 포함)를 보장한다 — 예전에는 "전체 최소치"(예: 4)가 카테고리 수(4)와
 * 우연히 같아서 studentCount가 작을 때 카테고리당 참여자가 1명(독점)까지 줄어드는 문제가
 * 있었다 (D-023). 카테고리 단위로 하한을 두면 학급 규모와 무관하게 각 업종에 최소한의
 * 경쟁이 있다는 것을 구조적으로 보장한다. 실제 배치는 src/npc/backfill.ts가 담당한다.
 */
/**
 * "필수 소비" 카테고리별 만족도 페널티 (docs/DECISIONS.md D-024). 이 카테고리 매물이 시장에
 * 실제로 있었는데도 이번 라운드 하나도 사지 못했을 때 roundSatisfaction(0~1)에서 차감한다.
 * 식품이 의류보다 더 중요하다는 요구사항을 값 차등(2:1)으로 표현한다. v1 잠정값 — 근거는
 * 가계 만족도 정상상태(0.48~0.54)가 최악의 경우(둘 다 계속 놓침)에도 0.18~0.24로 남고,
 * 하나만 놓쳤을 때와 뚜렷이 구분되도록 계산해 정했다. 조정 시 CLAUDE.md 4절 승인 절차 적용.
 */
export const ESSENTIAL_CATEGORY_SATISFACTION_PENALTY: Partial<Record<ProductCategoryId, number>> = {
  food: 0.2,
  apparel: 0.1,
};

/**
 * 진짜 NPC 가계(household.kind === "npc") 구매 알고리즘(scoreListingForBuyer)에만 적용되는
 * 필수 카테고리 매물 가산점(학생 소유 자동진행 가계에는 적용 안 함, docs/DECISIONS.md D-024
 * 후속 수정 참고). 만족도 페널티와 스케일이 다른 별도 체계지만 상대적 비율(2:1)은 맞췄다.
 * v1 잠정값.
 */
export const ESSENTIAL_CATEGORY_NPC_PRIORITY_BONUS: Partial<Record<ProductCategoryId, number>> = {
  food: 0.15,
  apparel: 0.075,
};

export const ESSENTIAL_CATEGORY_IDS: readonly ProductCategoryId[] =
  Object.keys(ESSENTIAL_CATEGORY_SATISFACTION_PENALTY) as ProductCategoryId[];

export function isEssentialCategory(categoryId: ProductCategoryId): boolean {
  return categoryId in ESSENTIAL_CATEGORY_SATISFACTION_PENALTY;
}

export function essentialSatisfactionPenalty(categoryId: ProductCategoryId): number {
  return ESSENTIAL_CATEGORY_SATISFACTION_PENALTY[categoryId] ?? 0;
}

export function essentialNpcPriorityBonus(categoryId: ProductCategoryId): number {
  return ESSENTIAL_CATEGORY_NPC_PRIORITY_BONUS[categoryId] ?? 0;
}

/**
 * 시장 변화 이벤트("원자재비 변동", Milestone 6, docs/DECISIONS.md D-035) 발생 라운드. 다른
 * 곳에 이 숫자들을 하드코딩하지 않고 src/economy/marketEvents.ts의 헬퍼 뒤에 숨긴다.
 */
export const MARKET_EVENT_ROUNDS: readonly number[] = [6, 7];

/** 이벤트 발생 시 해당 카테고리의 그 라운드 companyUnitCost 결과값 전체에 곱해지는 배율. */
export const MARKET_EVENT_COST_MULTIPLIER = 1.3;

/**
 * 시장 변화 이벤트 대상 카테고리를 뽑는 데 쓰는 rng 시드 오프셋. 게임플레이 rng(`rngSeed+1`,
 * src/engine/simulateGame.ts)나 초기화 rng(`rngSeed` 단독)와 절대 겹치지 않아야 결정론이
 * 보존된다 — 실제로 겹치지 않는 임의의 큰 값을 쓴다.
 */
export const MARKET_EVENT_RNG_SEED_OFFSET = 9001;

export const NPC_TARGETS = {
  /** 카테고리 하나당 최소 몇 개 기업(학생+NPC 합계)이 있어야 하는가. */
  minCompaniesPerCategory: 2,
  /** 카테고리 하나당 최소 몇 개 가게(학생+NPC 합계)가 있어야 하는가. */
  minStoresPerCategory: 2,
  minConsumers: 10,
  /**
   * 가게(학생+NPC 합계) 1개당 목표 소비자 수. 학생 수가 아니라 **가게 수**를 기준으로 삼는다
   * — 모든 참여자는 기업+가게+가계를 함께 수행한다는 원칙(D-001)을 NPC 보충에도 적용한
   * 것이다 (D-023 후속). 가게(공급)를 카테고리별 최소치로 늘렸는데 소비자(수요)는 학생
   * 수에만 비례해 그대로 두면, 판매자만 늘고 수요는 그대로라 평균 손익이 오히려 더
   * 나빠지는 부작용이 있었다 — 가게 수에 연동하면 공급이 늘 때 수요도 함께 는다.
   */
  // 예전 값(consumersPerStudent=1.5)은 "학생 자신도 소비자 1명 + 추가 1.5명" = 학생당 총
  // 2.5명이었다. 가게 수 기준으로 바꾸면서도 가게 수가 안 변한 경우(NPC 가게 보충이 필요
  // 없던 5/10/20명 시나리오) 목표 소비자 수가 줄어들지 않도록 같은 배율(2.5)을 쓴다.
  consumersPerStore: 2.5,
};
