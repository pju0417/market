/**
 * 규칙 기반 의사결정 함수 (docs/NPC_DESIGN.md). 이 함수들은 진짜 NPC뿐 아니라, Headless
 * Simulator(Milestone 1)에서 사람 입력이 없는 "학생 소유" 참여자를 자동 진행시키는 데도
 * 재사용한다 — 사람 입력이 생기는 Milestone 2부터는 학생 소유 참여자에 한해 이 함수 대신
 * 실제 입력을 사용하도록 교체하면 된다. 순수 함수로 유지하고 Math.random()을 직접 쓰지
 * 않는다 (src/economy/rng.ts의 결정론적 Rng만 사용). 단, 필수 카테고리 NPC 우선순위 가산점
 * (essentialNpcPriorityBonus)은 진짜 NPC와 학생 자동진행을 구분해야 하므로 예외적으로
 * decideHouseholdPurchases 내부에서 household.kind === "npc"일 때만 적용한다(D-024 후속 수정,
 * 아래 scoreListingForBuyer 근처 JSDoc 참고).
 */
import {
  CATEGORY_UNIT_COST,
  COMPANY_STRATEGY_PRESETS,
  companyUnitCost,
  essentialNpcPriorityBonus,
  HOUSEHOLD_STRATEGY_PRESETS,
  industrySwitchCost,
  MIN_ROUND_FOR_INDUSTRY_ACTIONS,
  NPC_INDUSTRY_SWITCH_RULES,
  NPC_STORE_SPECIALTY_DEVIATION_RULES,
  PRODUCT_CATEGORIES,
  specialtyMismatchPenalty,
  STORE_STRATEGY_PRESETS,
} from "../economy/config.js";
import { estimateCategoryMargin, computeCategoryAverages } from "../economy/marketStats.js";
import { countRemainingMarketEventRounds, type ActiveMarketEvent } from "../economy/marketEvents.js";
import { allocateCategoryPurchase } from "../economy/purchaseMatching.js";
import { rngRange, type Rng } from "../economy/rng.js";
import { chargeDiscretionary } from "../economy/settlement.js";
import type {
  CompanyState,
  GameState,
  HouseholdState,
  ParticipantId,
  ProductCategoryId,
  RetailListing,
  StoreState,
  WholesaleListing,
} from "../types/domain.js";

/** 손익 투사에서 실제 게임 rng 스트림을 절대 소비하지 않기 위한 더미(품질 지터만 고정값으로 만든다). */
const PROJECTION_RNG: Rng = () => 0.5;

/** 한 참여자가 매 라운드 생산/매입을 시도하는 기준 수량. 전략 배율이 곱해진다. */
const BASE_PRODUCTION_QUANTITY = 20;
const BASE_STORE_PURCHASE_QUANTITY = 15;
/** 가계 1회 소비가 쏠리지 않도록 하는 상한 (예산 관리, docs/GAME_RULES.md 1절). UI가 사람
 * 입력 폼에도 같은 상한을 보여줄 수 있도록 export한다 (src/economy/humanDecisions.ts). */
export const MAX_HOUSEHOLD_PURCHASE_UNITS = 6;
/** NPC 가계가 단일 소매 매물 하나에서 살 수 있는 최대 수량 (공급 쏠림 방지, 사람 구매에는
 * 적용되지 않는 NPC 전용 제약 — docs/NPC_DESIGN.md). */
const MAX_UNITS_PER_RETAIL_LISTING_NPC = 3;
/** 가격 정규화 기준 배율 (생산단가 대비 "적당한 소매가"로 간주하는 배율). */
const REFERENCE_PRICE_MULTIPLIER = 2.2;

export interface CompanyProductionDecision {
  categoryId: ProductCategoryId;
  quantity: number;
  quality: number;
  wholesalePrice: number;
  unitCost: number;
  productionCost: number;
}

/** availableCash는 고정비(인건비/임대료)를 이미 낸 뒤 남은 현금이어야 한다. */
export function decideCompanyProduction(
  company: CompanyState,
  availableCash: number,
  rng: Rng,
  costMultiplier = 1,
): CompanyProductionDecision | null {
  const categoryId = company.productCategoryId;
  if (categoryId === null) {
    return null;
  }
  const preset = COMPANY_STRATEGY_PRESETS[company.strategyId];
  const unitCost = companyUnitCost(categoryId, company.districtId) * costMultiplier;

  // "적정 재고까지만 채운다"(order-up-to) 정책: 이미 안 팔린 재고가 많으면 그만큼 덜
  // 생산한다. 재고를 보지 않고 매번 목표량을 그대로 생산하면 안 팔린 물량이 쌓이는 동안에도
  // 현금만 계속 소진되어 파산이 앞당겨진다 (docs/DECISIONS.md D-019에서 관찰됨).
  const targetStockLevel = BASE_PRODUCTION_QUANTITY * preset.quantityMultiplier;
  const neededQuantity = Math.floor(Math.max(0, targetStockLevel - company.inventoryQuantity));
  const affordableQuantity = Math.floor(Math.max(0, availableCash) / unitCost);
  const quantity = Math.max(0, Math.min(neededQuantity, affordableQuantity));

  const quality = clamp01(preset.qualityTarget + rngRange(rng, -0.05, 0.05));
  const wholesalePrice = unitCost * preset.priceMarkup * (1 + (quality - 0.5) * 0.4);
  const productionCost = quantity * unitCost;

  return { categoryId, quantity, quality, wholesalePrice, unitCost, productionCost };
}

/**
 * NPC 기업의 업종 전환 결정 (Milestone 6, docs/DECISIONS.md D-033). 순수 함수가 아니라
 * company를 직접 mutate한다(전환 확정 시 재고/품질 리셋 + 비용 차감 + lastIndustrySwitchRound
 * 갱신까지 한 번에 처리) — chargeDiscretionary/credit 등 settlement 헬퍼가 원장을 직접 바꾸는
 * 것과 같은 패턴이다. runCompanyTurn(src/engine/simulateGame.ts)은 이 기업에 사람 입력이
 * 전혀 없을 때만(=완전 봇) 이 함수를 호출해야 한다 — 사람이 생산 입력은 냈지만 전환 필드를
 * 비운 경우에는 호출하면 안 된다(학생의 "전환 안 함" 선택을 봇이 뒤집는 버그가 된다).
 *
 * 전환을 "고려"하는 조건(최소 라운드, 쿨다운, 최근 N라운드 연속 적자)을 모두 만족해도,
 * switchProbability로만 실제 전환을 실행한다(rng 기반, 결정론 유지). 전환 대상 카테고리는
 * estimateCategoryMargin으로 도매시장 실시간 매물 기준 예상 마진이 가장 높은 카테고리를
 * 고른다 — 매물 자체가 없어 마진을 추정할 수 없는 카테고리는 후보에서 제외하고, 후보가
 * 하나도 없으면 전환하지 않는다.
 */
export function decideCompanyIndustrySwitch(company: CompanyState, state: GameState, rng: Rng): void {
  const rules = NPC_INDUSTRY_SWITCH_RULES;
  if (state.currentRound < rules.minRound) return;
  const currentCategory = company.productCategoryId;
  if (currentCategory === null) return;
  if (
    company.lastIndustrySwitchRound !== null &&
    state.currentRound - company.lastIndustrySwitchRound < rules.cooldownRounds
  ) {
    return;
  }

  const recentRounds = state.roundMetrics.slice(-rules.consecutiveNegativeProfitRounds);
  if (recentRounds.length < rules.consecutiveNegativeProfitRounds) return;
  const allNegative = recentRounds.every((metrics) => (metrics.companyProfit[company.id] ?? 0) < 0);
  if (!allNegative) return;

  if (rng() >= rules.switchProbability) return;

  let bestCategory: ProductCategoryId | undefined;
  let bestMargin = -Infinity;
  for (const candidate of PRODUCT_CATEGORIES) {
    if (candidate === currentCategory) continue;
    const unitCost = companyUnitCost(candidate, company.districtId);
    const margin = estimateCategoryMargin(state.wholesaleListings, candidate, unitCost);
    if (margin === undefined) continue;
    if (margin > bestMargin) {
      bestMargin = margin;
      bestCategory = candidate;
    }
  }
  if (bestCategory === undefined) return;

  const cost = industrySwitchCost(currentCategory, bestCategory);
  if (cost > company.ledger.cash) return;

  chargeDiscretionary(company.ledger, cost);
  company.productCategoryId = bestCategory;
  company.inventoryQuantity = 0;
  company.quality = 0;
  company.lastIndustrySwitchRound = state.currentRound;
}

/**
 * 시장 변화 이벤트("원자재비 변동", Milestone 6 제안 C, docs/DECISIONS.md D-035) 대상
 * 카테고리에 속한 NPC 기업의 전환 결정. decideCompanyIndustrySwitch(D-033)와 달리 확률
 * 판정이 없다 — "잔여 이벤트 라운드 동안 같은 여건이 반복된다"고 가정한 총이득을 결정론적으로
 * 비교해, 전환이 명백히 더 유리할 때만(순이득 > 0) 전환한다. runCompanyTurn
 * (src/engine/simulateGame.ts)은 이 기업이 이벤트 대상 카테고리에 속해 있고 사람 입력이 전혀
 * 없을 때만 이 함수를 호출해야 한다 — decideCompanyIndustrySwitch와 상호 배타적으로 호출된다
 * (한 기업에게 두 전환 로직이 같은 라운드에 동시에 적용되면 이중 전환/이중 비용 차감 버그가
 * 난다).
 */
export function decideCompanyMarketEventSwitch(
  company: CompanyState,
  state: GameState,
  marketEvent: ActiveMarketEvent,
): void {
  const currentCategory = company.productCategoryId;
  if (currentCategory === null || currentCategory !== marketEvent.categoryId) return;
  if (state.currentRound < MIN_ROUND_FOR_INDUSTRY_ACTIONS) return;

  const stayAverages = computeCategoryAverages(state.wholesaleListings, currentCategory);
  if (stayAverages === undefined) return;

  const stayProjection = decideCompanyProduction(
    company,
    company.ledger.cash,
    PROJECTION_RNG,
    marketEvent.costMultiplier,
  );
  if (stayProjection === null) return;
  const stayRoundProfit = stayProjection.quantity * stayAverages.averagePrice - stayProjection.productionCost;

  const remaining = countRemainingMarketEventRounds(state.currentRound);
  const staySeriesProfit = stayRoundProfit * remaining;

  let bestCategory: ProductCategoryId | undefined;
  let bestCost = 0;
  let bestNetTotal = -Infinity;
  for (const candidate of PRODUCT_CATEGORIES) {
    if (candidate === currentCategory) continue;
    const candidateAverages = computeCategoryAverages(state.wholesaleListings, candidate);
    if (candidateAverages === undefined) continue;

    const cost = industrySwitchCost(currentCategory, candidate);
    if (cost > company.ledger.cash) continue;

    const hypotheticalCompany: CompanyState = { ...company, productCategoryId: candidate, inventoryQuantity: 0 };
    const switchProjection = decideCompanyProduction(
      hypotheticalCompany,
      company.ledger.cash - cost,
      PROJECTION_RNG,
      1,
    );
    if (switchProjection === null) continue;
    const switchRoundProfit =
      switchProjection.quantity * candidateAverages.averagePrice - switchProjection.productionCost;
    const switchSeriesProfit = switchRoundProfit * remaining - cost;

    const netTotal = switchSeriesProfit - staySeriesProfit;
    if (netTotal > bestNetTotal) {
      bestNetTotal = netTotal;
      bestCategory = candidate;
      bestCost = cost;
    }
  }

  if (bestCategory === undefined || bestNetTotal <= 0) return;

  chargeDiscretionary(company.ledger, bestCost);
  company.productCategoryId = bestCategory;
  company.inventoryQuantity = 0;
  company.quality = 0;
  company.lastIndustrySwitchRound = state.currentRound;
}

export interface PurchaseLine {
  listingId: string;
  quantity: number;
  unitPrice: number;
}

export interface StorePurchaseDecision {
  purchases: PurchaseLine[];
}

/**
 * eligibleListings는 이미 자기 거래 금지(D-005) 필터를 적용한 상태여야 한다
 * (src/economy/market.ts의 eligibleWholesaleListingsForStore 참고).
 */
export function decideStorePurchases(
  store: StoreState,
  availableCash: number,
  eligibleListings: readonly WholesaleListing[],
  rng: Rng,
): StorePurchaseDecision {
  const preset = STORE_STRATEGY_PRESETS[store.strategyId];
  // 기업과 같은 "적정 재고까지만 채운다" 정책 (docs/DECISIONS.md D-019).
  const targetStockLevel = BASE_STORE_PURCHASE_QUANTITY * preset.purchaseQuantityMultiplier;
  const targetQuantity = Math.floor(Math.max(0, targetStockLevel - store.inventoryQuantity));
  const sellingCategoryId = store.currentSellingCategoryId ?? store.specialtyCategoryId;

  const candidates = eligibleListings.filter(
    (listing) => listing.categoryId === sellingCategoryId && listing.quantityAvailable > 0,
  );
  const purchases = allocateCategoryPurchase(candidates, targetQuantity, Infinity, availableCash, rng, (listing) =>
    scoreListingForBuyer(listing.price, listing.quality, listing.categoryId, preset.qualityWeight, rng),
  );

  return { purchases };
}

/**
 * NPC 가게의 전문 업종 이탈 판매 결정 (Milestone 6, docs/DECISIONS.md D-033).
 * decideCompanyIndustrySwitch와 같은 구조 — 순수 함수가 아니라 store를 직접 mutate한다.
 * 가게 쪽은 즉시 차감되는 전환 비용이 없다(specialtyMismatchPenalty는 소비 측에서만
 * 적용된다) — 대신 기업과 동일한 쿨다운을 lastSellingCategoryChangeRound 기준으로 적용한다.
 * runStoreTurn(src/engine/simulateGame.ts)은 이 가게에 사람 입력이 전혀 없을 때만(=완전 봇)
 * 이 함수를 호출해야 한다.
 *
 * 전환 대상 카테고리의 예상 마진은 "그 카테고리를 팔았을 때의 소매가(직전 라운드 마감
 * 시세) - 그 카테고리를 매입하는 데 드는 도매가(이번 라운드 실시간 시세)"로 추정한다 —
 * 둘 중 하나라도 시장 데이터가 없는 카테고리는 후보에서 제외한다.
 */
export function decideStoreSpecialtyDeviation(store: StoreState, state: GameState, rng: Rng): void {
  const rules = NPC_STORE_SPECIALTY_DEVIATION_RULES;
  if (state.currentRound < rules.minRound) return;
  const currentCategory = store.currentSellingCategoryId ?? store.specialtyCategoryId;
  if (currentCategory === null) return;
  if (
    store.lastSellingCategoryChangeRound !== null &&
    state.currentRound - store.lastSellingCategoryChangeRound < rules.cooldownRounds
  ) {
    return;
  }

  const recentRounds = state.roundMetrics.slice(-rules.consecutiveNegativeProfitRounds);
  if (recentRounds.length < rules.consecutiveNegativeProfitRounds) return;
  const allNegative = recentRounds.every((metrics) => (metrics.storeProfit[store.id] ?? 0) < 0);
  if (!allNegative) return;

  if (rng() >= rules.switchProbability) return;

  let bestCategory: ProductCategoryId | undefined;
  let bestMargin = -Infinity;
  for (const candidate of PRODUCT_CATEGORIES) {
    if (candidate === currentCategory) continue;
    const wholesaleAverages = computeCategoryAverages(state.wholesaleListings, candidate);
    if (wholesaleAverages === undefined) continue;
    const margin = estimateCategoryMargin(state.retailListings, candidate, wholesaleAverages.averagePrice);
    if (margin === undefined) continue;
    if (margin > bestMargin) {
      bestMargin = margin;
      bestCategory = candidate;
    }
  }
  if (bestCategory === undefined) return;

  store.currentSellingCategoryId = bestCategory;
  store.inventoryQuantity = 0;
  store.inventoryQuality = 0;
  store.lastSellingCategoryChangeRound = state.currentRound;
}

export interface HouseholdPurchaseDecision {
  purchases: PurchaseLine[];
}

/**
 * eligibleListings는 이미 자기 거래 금지(D-006) 필터를 적용한 상태여야 한다
 * (src/economy/market.ts의 eligibleRetailListingsForHousehold 참고). stores는 각 매물의
 * 판매 가게를 조회해 전문 업종 이탈 여부(specialtyMismatchPenalty)를 판단하는 데 쓴다
 * (Milestone 6).
 */
export function decideHouseholdPurchases(
  household: HouseholdState,
  availableCash: number,
  eligibleListings: readonly RetailListing[],
  stores: Readonly<Record<ParticipantId, StoreState>>,
  rng: Rng,
): HouseholdPurchaseDecision {
  const preset = HOUSEHOLD_STRATEGY_PRESETS[household.strategyId];
  const qualityWeight = preset.qualitySensitivity / Math.max(preset.qualitySensitivity + preset.priceSensitivity, 1e-6);

  // 단일 매물 쏠림 방지(MAX_UNITS_PER_RETAIL_LISTING_NPC)를 allocateCategoryPurchase의 그리디
  // 채움 단계에서 그대로 강제하기 위해, 후보의 quantityAvailable을 이 상한으로 미리 클램핑한
  // 사본을 만든다 — 실제 게임 상태(state.retailListings)는 건드리지 않는다.
  const candidates = eligibleListings
    .filter((listing) => listing.quantityAvailable > 0)
    .map((listing) => ({ ...listing, quantityAvailable: Math.min(listing.quantityAvailable, MAX_UNITS_PER_RETAIL_LISTING_NPC) }));

  const purchases = allocateCategoryPurchase(
    candidates,
    MAX_HOUSEHOLD_PURCHASE_UNITS,
    Infinity,
    availableCash,
    rng,
    (listing) => {
      const priorityBonus = household.kind === "npc" ? essentialNpcPriorityBonus(listing.categoryId) : 0;
      const sellingStore = stores[listing.storeId];
      const mismatchPenalty =
        sellingStore !== undefined && sellingStore.specialtyCategoryId !== null
          ? specialtyMismatchPenalty(sellingStore.specialtyCategoryId, listing.categoryId)
          : 0;
      return scoreListingForBuyer(
        listing.price,
        listing.quality,
        listing.categoryId,
        qualityWeight,
        rng,
        priorityBonus - mismatchPenalty,
      );
    },
  );

  return { purchases };
}

/**
 * 가격 대비 품질 점수. qualityWeight=1이면 품질만, 0이면 가격만 본다. 아주 작은 난수로 동점을
 * 깬다. scoreAdjustment는 이 기본 점수에 그대로 더해지는 일반화된 보정치다(이전 이름은
 * priorityBonus) — 두 가지 서로 다른 보정을 합산해 넘길 수 있다:
 * - "필수 소비" 카테고리(docs/DECISIONS.md D-024) 가산점: decideHouseholdPurchases에서
 *   household.kind === "npc"일 때만 적용되며, 학생 소유 자동진행 가계에는 적용되지 않는다
 *   (D-024 후속 수정).
 * - 가게의 전문 업종 이탈 판매 매력도 페널티(specialtyMismatchPenalty, Milestone 6,
 *   docs/DECISIONS.md D-033): household.kind와 무관하게 적용된다.
 * decideStorePurchases(기업→가게 도매 매입)에는 영향을 주지 않도록 항상 기본값 0으로 호출된다.
 */
export function scoreListingForBuyer(
  price: number,
  quality: number,
  categoryId: ProductCategoryId,
  qualityWeight: number,
  rng: Rng,
  scoreAdjustment = 0,
): number {
  const referencePrice = CATEGORY_UNIT_COST[categoryId] * REFERENCE_PRICE_MULTIPLIER;
  const normalizedPrice = price / referencePrice;
  const tieBreak = rngRange(rng, -0.01, 0.01);
  return qualityWeight * quality - (1 - qualityWeight) * normalizedPrice + tieBreak + scoreAdjustment;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
