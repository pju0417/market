/**
 * 게임 전역 공유 타입.
 *
 * 이 파일은 구조(누가 어떤 상태를 갖는가)만 정의한다. 실제 경제 공식은 담지 않는다.
 * 세부 규칙은 docs/GAME_RULES.md, 결정 배경은 docs/DECISIONS.md 참고.
 */

/** 학생 한 명이 매 라운드 수행하는 세 역할 (D-001). */
export type Role = "company" | "store" | "household";

/** company/store 여부와 무관하게 참여자가 학생인지 NPC인지 구분한다 (D-007). */
export type ParticipantKind = "student" | "npc";

export type ParticipantId = string;

/** 상권 후보 (docs/GAME_RULES.md 5절). 구체 계수는 docs/economy/config.ts 참고. */
export type DistrictId =
  | "school-area"
  | "residential"
  | "downtown"
  | "upscale"
  | "industrial"
  | "outskirts";

/** 상품 카테고리 (v1 baseline, 4종 — docs/economy/config.ts 참고). */
export type ProductCategoryId = "food" | "apparel" | "electronics" | "toys";

/**
 * NPC 전략 성향 (docs/NPC_DESIGN.md). 이번 단계부터는 가계/NPC 소비자의 가격·품질 선호를
 * 나타내는 데도 같은 성향 축을 재사용한다 (예: low-cost 성향 가계는 가격에 더 민감).
 */
export type StrategyId = "stable" | "low-cost" | "premium" | "aggressive" | "conservative";

/** 라운드 내부 진행 단계 (docs/ROUND_FLOW.md, 순서 고정). */
export type RoundPhase =
  | "company-turn"
  | "company-settlement"
  | "wholesale-market-update"
  | "store-turn"
  | "store-settlement"
  | "retail-market-update"
  | "household-turn"
  | "npc-consumer-behavior"
  | "round-settlement"
  | "round-result";

/**
 * 세 역할은 각각 별도의 자산/손익을 가진다 (D-002).
 * 실제 잔액 이동 로직은 economy 모듈에서 이 세 필드를 통해서만 접근해야 하며,
 * 서로 다른 역할의 필드를 직접 대입하는 방식으로 자산을 이동시켜서는 안 된다.
 */
export interface Ledger {
  cash: number;
  cumulativeProfit: number;
}

export interface CompanyState {
  id: ParticipantId;
  ownerId: ParticipantId;
  kind: ParticipantKind;
  districtId: DistrictId;
  ledger: Ledger;
  strategyId: StrategyId;
  productCategoryId: ProductCategoryId | null;
  /** 재고의 가중평균 품질 (0~1). */
  quality: number;
  /** 아직 도매시장에서 팔리지 않고 남아있는 재고 수량 (다음 라운드로 이월). */
  inventoryQuantity: number;
  /** company-turn에서 결정한 도매 판매가. wholesale-market-update가 이 값으로 상장한다. */
  lastWholesalePrice: number;
}

export interface StoreState {
  id: ParticipantId;
  ownerId: ParticipantId;
  kind: ParticipantKind;
  districtId: DistrictId;
  ledger: Ledger;
  strategyId: StrategyId;
  specialtyCategoryId: ProductCategoryId | null;
  /** 매입해 판매 중인 재고 수량 (다음 라운드로 이월). */
  inventoryQuantity: number;
  /** 현재 재고의 가중평균 품질 (0~1). */
  inventoryQuality: number;
  /** 현재 소매 판매가 (가게 턴에서 결정). */
  retailPrice: number;
}

export interface HouseholdState {
  id: ParticipantId;
  ownerId: ParticipantId;
  kind: ParticipantKind;
  ledger: Ledger;
  strategyId: StrategyId;
  /** 매 라운드 새로 지급되는 소비 예산 (가계 턴 시작 시 ledger.cash에 더해진다). */
  budgetPerRound: number;
  /** 가계 목표는 순자산 극대화 단일 지표가 아니라 복합 지표다 (docs/GAME_RULES.md 1절). */
  satisfactionScore: number;
}

/** 도매시장에 등록된 상품 한 건. 자기 거래 금지(D-005)는 매칭 로직에서 강제한다. */
export interface WholesaleListing {
  id: string;
  companyId: ParticipantId;
  categoryId: ProductCategoryId;
  quantityAvailable: number;
  quality: number;
  price: number;
}

/** 가게가 등록한 소매 상품 한 건. 자기 거래 금지(D-006)는 매칭 로직에서 강제한다. */
export interface RetailListing {
  id: string;
  storeId: ParticipantId;
  categoryId: ProductCategoryId;
  quantityAvailable: number;
  quality: number;
  price: number;
}

/** 라운드별 시장/경영 지표 스냅샷. economy-reviewer 검토와 validate:economy가 사용한다. */
export interface RoundMetrics {
  round: number;
  companyProfit: Record<ParticipantId, number>;
  storeProfit: Record<ParticipantId, number>;
  companyMarketShare: Record<ParticipantId, number>;
  storeMarketShare: Record<ParticipantId, number>;
  totalWholesaleVolume: number;
  totalWholesaleValue: number;
  totalRetailVolume: number;
  totalRetailValue: number;
  averageHouseholdSatisfaction: number;
}

/** 학생 한 명 = company + store + household 삼중 소유 (D-001). */
export interface PlayerState {
  id: ParticipantId;
  displayName: string;
  companyId: ParticipantId;
  storeId: ParticipantId;
  householdId: ParticipantId;
}

export interface GameConfig {
  totalRounds: 7;
  studentPlayerIds: ParticipantId[];
  /** 재현 가능한 시뮬레이션을 위한 결정론적 PRNG 시드 (docs/NPC_DESIGN.md). */
  rngSeed: number;
}

export interface GameState {
  config: GameConfig;
  currentRound: number;
  currentPhase: RoundPhase;
  players: PlayerState[];
  /** 학생 소유 + NPC 기업/가게/소비자(households에 함께 저장)를 모두 포함한다. */
  companies: Record<ParticipantId, CompanyState>;
  stores: Record<ParticipantId, StoreState>;
  households: Record<ParticipantId, HouseholdState>;
  wholesaleListings: WholesaleListing[];
  retailListings: RetailListing[];
  roundMetrics: RoundMetrics[];
}
