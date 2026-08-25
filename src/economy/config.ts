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
 * 업종 전환 추가비용 (D-011). 유사도가 낮을수록(관련 없을수록) 비싸진다.
 * v1의 기본 NPC/시뮬레이션 봇은 게임 중 업종을 바꾸지 않으므로 자동 시뮬레이션에서는
 * 호출되지 않는다 — 학생이 실제로 업종 전환을 선택할 수 있게 되는 Milestone 2 이후
 * 플레이어 의사결정 경로에서 쓰기 위해 미리 정의해 둔다.
 */
export function industrySwitchCost(previous: ProductCategoryId, next: ProductCategoryId): number {
  return COSTS.industrySwitchBaseCost * (1 - categorySimilarity(previous, next));
}

/**
 * 가게가 전문 업종과 다른 카테고리를 팔 때의 소비자 매력도 페널티 (docs/GAME_RULES.md 4절).
 * v1 기본 봇은 항상 전문 업종 안에서만 매입/판매하므로 자동 시뮬레이션에서는 호출되지
 * 않는다 — 위 industrySwitchCost와 같은 이유로 Milestone 2 이후를 위해 미리 정의해 둔다.
 */
export function specialtyMismatchPenalty(specialty: ProductCategoryId, sold: ProductCategoryId): number {
  return COSTS.storeSpecialtyMismatchPenalty * (1 - categorySimilarity(specialty, sold));
}

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
 * NPC 보충 목표치 (docs/NPC_DESIGN.md, docs/DECISIONS.md D-008). 학생 수 대비 최소
 * 시장 참여자 수를 보장한다. 실제 배치는 src/npc/backfill.ts가 카테고리 쏠림도 고려한다.
 */
export const NPC_TARGETS = {
  minCompanies: 4,
  minStores: 4,
  minConsumers: 10,
  /** 학생 1인당 추가되는 목표 NPC 소비자 수 (시장 규모가 커질수록 소비자도 늘어나야 함). */
  consumersPerStudent: 1.5,
};
