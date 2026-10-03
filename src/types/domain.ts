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
  /** Weighted acquisition cost per remaining unit; absent for legacy stock. */
  inventoryUnitCost?: number | undefined;
  /** company-turn에서 결정한 도매 판매가. wholesale-market-update가 이 값으로 상장한다. */
  lastWholesalePrice: number;
  /**
   * 이 기업이 마지막으로 업종을 전환한 라운드 (Milestone 6). 아직 한 번도 전환하지 않았으면
   * null. NPC 전환 쿨다운(docs/DECISIONS.md D-033) 판단에 쓰인다.
   */
  lastIndustrySwitchRound: number | null;
  /**
   * 이번 라운드 광고 신청 여부 (Milestone 6, docs/DECISIONS.md D-040). 매 라운드 새로
   * 신청해야 하는 "이번 라운드 상태"다 — switchToCategoryId류 "결정"이 아니라, 매 라운드
   * 해당 참여자의 턴 처리 시작 시 먼저 false로 리셋한 뒤 이번 라운드 결정에 따라 세팅한다
   * (src/economy/advertising.ts의 applyAdvertisingDecision 참고).
   */
  isAdvertisingActive: boolean;
}

export interface StoreState {
  id: ParticipantId;
  ownerId: ParticipantId;
  kind: ParticipantKind;
  districtId: DistrictId;
  ledger: Ledger;
  strategyId: StrategyId;
  /** 등록된 전문 업종(정체성). 업종 전환 비용 계산의 기준(이전 카테고리)이 되는 것은
   * currentSellingCategoryId이지, 이 필드가 아니다 — 이 필드는 "이 가게가 어떤 업종으로
   * 창업했는가"를 그대로 보존한다 (Milestone 6). */
  specialtyCategoryId: ProductCategoryId | null;
  /**
   * 이번 라운드 실제 판매 카테고리 (Milestone 6). null이면 아직 전문 업종에서 이탈한 적이
   * 없다는 뜻이며, 이 경우 실제 판매 카테고리는 specialtyCategoryId를 그대로 쓴다
   * (`store.currentSellingCategoryId ?? store.specialtyCategoryId`). 전문 업종과 다르면
   * 소비자 매력도 페널티(specialtyMismatchPenalty)가 적용된다.
   */
  currentSellingCategoryId: ProductCategoryId | null;
  /** 매입해 판매 중인 재고 수량 (다음 라운드로 이월). */
  inventoryQuantity: number;
  /** Weighted purchase cost including transport; absent for legacy stock. */
  inventoryUnitCost?: number | undefined;
  /** 현재 재고의 가중평균 품질 (0~1). */
  inventoryQuality: number;
  /** 현재 소매 판매가 (가게 턴에서 결정). */
  retailPrice: number;
  /**
   * 이 가게가 마지막으로 판매 카테고리를 변경한 라운드 (Milestone 6). 아직 한 번도 변경하지
   * 않았으면 null. 사람/NPC 모두 동일한 쿨다운 판단에 쓰인다 (docs/DECISIONS.md D-033).
   */
  lastSellingCategoryChangeRound: number | null;
  /**
   * 이번 라운드 광고 신청 여부 (Milestone 6, docs/DECISIONS.md D-040). CompanyState의 동명
   * 필드와 같은 원칙 — 매 라운드 재부과된다.
   */
  isAdvertisingActive: boolean;
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
  purchases?: { round: number; categoryId: ProductCategoryId; quantity: number; unitCost: number; quality: number }[];
}

/** 도매시장에 등록된 상품 한 건. 자기 거래 금지(D-005)는 매칭 로직에서 강제한다. */
export interface WholesaleListing {
  /** Buyer-specific UI/decision quote only; authoritative market price excludes transport. */
  transportCostPerUnit?: number;
  goodsPrice?: number;
  id: string;
  companyId: ParticipantId;
  categoryId: ProductCategoryId;
  quantityAvailable: number;
  quality: number;
  price: number;
}

/** 가게가 등록한 소매 상품 한 건. 자기 거래 금지(D-006)는 매칭 로직에서 강제한다. */
export interface RetailListing {
  transportCostPerUnit?: number;
  goodsPrice?: number;
  id: string;
  storeId: ParticipantId;
  categoryId: ProductCategoryId;
  quantityAvailable: number;
  quality: number;
  price: number;
}

/**
 * 매물 스냅샷 비교(before/after)로 뽑아낸 카테고리별 시세 청산 요약 (구매 매칭 알고리즘
 * 재설계 Stage 1). 새 수요/가격 공식이 아니라, 이미 있는 매물 배열을 비교한 결과만 담는다
 * (src/economy/marketStats.ts의 computeCategoryClearingSummary 참고).
 */
export interface CategoryClearingSummary {
  totalListed: number;
  totalSold: number;
  highestSoldPrice: number | undefined;
  lowestUnsoldPrice: number | undefined;
}

/** 라운드별 시장/경영 지표 스냅샷. economy-reviewer 검토와 validate:economy가 사용한다. */
export interface RoundMetrics {
  locationCosts?: Record<ParticipantId, { rent: number; transport: number }>;
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
  /** 이 라운드에 기업이 생산한 수량 (팔렸는지 여부와 무관, docs/ADVISOR_RULES.md가 재고율 계산에 사용). */
  companyUnitsProduced: Record<ParticipantId, number>;
  /** 이 라운드에 도매시장에서 실제로 팔린 수량 (companyUnitsProduced와의 차이가 재고 누적분). */
  companyUnitsSoldWholesale: Record<ParticipantId, number>;
  /** 이 라운드 도매 판매로 얻은 총 매출(유통비 차감 전, 가게가 지불한 금액 기준). */
  companyRevenue: Record<ParticipantId, number>;
  /** 이 라운드에 가게가 도매시장에서 매입한 수량. */
  storeUnitsPurchased: Record<ParticipantId, number>;
  /** 이 라운드에 가게가 도매 매입에 지출한 총액. */
  storeWholesaleSpend: Record<ParticipantId, number>;
  /** 이 라운드에 소매시장에서 실제로 팔린 수량. */
  storeUnitsSoldRetail: Record<ParticipantId, number>;
  /** 이 라운드 소매 판매로 얻은 총 매출(유통비 차감 전, 가계가 지불한 금액 기준). */
  storeRevenue: Record<ParticipantId, number>;
  /** 이 라운드에 가게가 매입한 서로 다른 기업(공급처)의 수 (매입이 없었으면 0). */
  storeSupplierCount: Record<ParticipantId, number>;
  /** 이 라운드 매입 지출 중 최대 단일 공급처가 차지하는 비중 (0~1, 매입이 없었으면 0). */
  storeTopSupplierSpendShare: Record<ParticipantId, number>;
  /** 이 라운드 가계가 소비시장에서 지출한 총액. */
  householdSpend: Record<ParticipantId, number>;
  /** 이 라운드 가계가 구매한 총 수량. */
  householdUnitsBought: Record<ParticipantId, number>;
  /** 이 라운드 가계가 구매한 서로 다른 카테고리 수 (소비 다양성, 구매가 없었으면 0). */
  householdCategoryCount: Record<ParticipantId, number>;
  /** 이 라운드 지출 중 최대 단일 카테고리가 차지하는 비중 (0~1, 구매가 없었으면 0). */
  householdTopCategorySpendShare: Record<ParticipantId, number>;
  /**
   * 이 라운드 "필수 소비" 카테고리(현재 food/apparel) 중 시장에 매물이 있었는데도 하나도 사지
   * 못한 카테고리 id 목록 (매물 자체가 없었던 카테고리는 제외 — 면제). 비어있으면 필수 소비를
   * 모두 충족했다는 뜻.
   */
  householdEssentialCategoriesMissed: Record<ParticipantId, ProductCategoryId[]>;
  /**
   * 이 라운드 도매/소매 시장의 카테고리별 시세 청산 요약 (구매 매칭 알고리즘 재설계 Stage 1).
   * 매물이 하나도 없었던 카테고리는 키 자체가 없다.
   */
  wholesaleCategoryClearing: Partial<Record<ProductCategoryId, CategoryClearingSummary>>;
  retailCategoryClearing: Partial<Record<ProductCategoryId, CategoryClearingSummary>>;
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
  /** Persist in-flight accounting across stateless Apps Script requests. */
  roundAccounting?: RoundAccumulator;
  shopping?: ShoppingProgress;
  /** Absent on legacy saves; new city games share these coordinates and traffic snapshots. */
  city?: CityState;
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

export type CityPoint = [number, number];
export interface CityState {
  metropolisLayout?: true;
  addresses?: Record<ParticipantId, { building: number; unit: number }>;
  artworkLayout?: true;
  zoneDistricts?: DistrictId[];
  version: 1;
  blockSize: number;
  positions: Record<ParticipantId, CityPoint>;
  trafficRound: number;
  /** Last round's road usage; fixed throughout this round for consistent quotes. */
  traffic: Record<string, number>;
  roadLoads: Record<string, number>;
  costs: Record<ParticipantId, { rent: number; transport: number }>;
}

export interface RoundAccumulator {
  householdQualityUnits?: Record<ParticipantId, number>;
  householdCategoryUnits?: Record<ParticipantId, Partial<Record<ProductCategoryId, number>>>;
  householdBaseSatisfaction?: Record<ParticipantId, number>;
  cashSnapshotCompany: Record<ParticipantId, number>;
  cashSnapshotStore: Record<ParticipantId, number>;
  wholesaleRevenueByCompany: Record<ParticipantId, number>;
  retailRevenueByStore: Record<ParticipantId, number>;
  wholesaleVolume: number;
  wholesaleValue: number;
  retailVolume: number;
  retailValue: number;
  /** advisor(전략 비서)용 계측치. 시장 지표 계산 자체에는 쓰이지 않는다 (docs/DECISIONS.md 참고: 새 필드 추가만, 기존 계산 순서는 불변). */
  companyUnitsProduced: Record<ParticipantId, number>;
  companyUnitsSoldWholesale: Record<ParticipantId, number>;
  storeUnitsPurchased: Record<ParticipantId, number>;
  storeWholesaleSpend: Record<ParticipantId, number>;
  storeUnitsSoldRetail: Record<ParticipantId, number>;
  /** 가게별 × 공급 기업별 이번 라운드 매입 지출 (storeSupplierCount/storeTopSupplierSpendShare 계산용). */
  storeSpendByCompany: Record<ParticipantId, Record<ParticipantId, number>>;
  householdSpend: Record<ParticipantId, number>;
  householdUnitsBought: Record<ParticipantId, number>;
  /** 가계별 × 카테고리별 이번 라운드 지출 (householdCategoryCount/householdTopCategorySpendShare 계산용). */
  householdSpendByCategory: Record<ParticipantId, Partial<Record<ProductCategoryId, number>>>;
  householdEssentialCategoriesMissed: Record<ParticipantId, ProductCategoryId[]>;
  /** D-026: 이번 라운드 가계 소비 처리(household-turn/npc-consumer-behavior 공용) 시작 시점의
   *  state.retailListings 스냅샷. null이면 아직 이번 라운드에 계산 안 함 — runConsumerPurchases가
   *  라운드 내 처음 호출될 때 그 자리에서 한 번만 채운다. */
  roundStartRetailListings: RetailListing[] | null;
  /** 구매 매칭 알고리즘 재설계 Stage 1: runStoreTurn 시작 시점의 state.wholesaleListings
   *  스냅샷. roundStartRetailListings와 대칭 — wholesaleCategoryClearing 계산에 쓰인다. */
  roundStartWholesaleListings: WholesaleListing[] | null;
}


export interface CartLine { listingId: string; quantity: number; unitPrice: number }
export interface CartCheckout { requestId: string; round: number; lines: CartLine[]; retailPrice?: number; sellingCategoryId?: ProductCategoryId; advertise?: boolean }
export interface CartReceipt { requestId: string; round: number; participantId: ParticipantId; total: number; units: number; remainingCash: number }
export interface ShoppingProgress {
  round: number;
  prepared: Record<ParticipantId, boolean>;
  units: Record<ParticipantId, number>;
  receipts: Record<string, CartReceipt>;
}
