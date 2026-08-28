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
  STORE_STRATEGY_PRESETS,
} from "../economy/config.js";
import { rngRange, type Rng } from "../economy/rng.js";
import type {
  CompanyState,
  HouseholdState,
  ProductCategoryId,
  RetailListing,
  StoreState,
  WholesaleListing,
} from "../types/domain.js";

/** 한 참여자가 매 라운드 생산/매입을 시도하는 기준 수량. 전략 배율이 곱해진다. */
const BASE_PRODUCTION_QUANTITY = 20;
const BASE_STORE_PURCHASE_QUANTITY = 15;
/** 가계 1회 소비가 쏠리지 않도록 하는 상한 (예산 관리, docs/GAME_RULES.md 1절). UI가 사람
 * 입력 폼에도 같은 상한을 보여줄 수 있도록 export한다 (src/economy/humanDecisions.ts). */
export const MAX_HOUSEHOLD_PURCHASE_UNITS = 6;
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
): CompanyProductionDecision | null {
  const categoryId = company.productCategoryId;
  if (categoryId === null) {
    return null;
  }
  const preset = COMPANY_STRATEGY_PRESETS[company.strategyId];
  const unitCost = companyUnitCost(categoryId, company.districtId);

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

  const candidates = eligibleListings
    .filter((listing) => listing.categoryId === store.specialtyCategoryId && listing.quantityAvailable > 0)
    .map((listing) => ({
      listing,
      score: scoreListingForBuyer(listing.price, listing.quality, listing.categoryId, preset.qualityWeight, rng),
    }))
    .sort((a, b) => b.score - a.score);

  const purchases: PurchaseLine[] = [];
  let remainingCash = availableCash;
  let remainingTarget = targetQuantity;

  for (const { listing } of candidates) {
    if (remainingTarget <= 0 || remainingCash <= 0) break;
    const affordable = Math.floor(remainingCash / listing.price);
    const quantity = Math.floor(Math.max(0, Math.min(remainingTarget, listing.quantityAvailable, affordable)));
    if (quantity <= 0) continue;
    purchases.push({ listingId: listing.id, quantity, unitPrice: listing.price });
    remainingCash -= quantity * listing.price;
    remainingTarget -= quantity;
  }

  return { purchases };
}

export interface HouseholdPurchaseDecision {
  purchases: PurchaseLine[];
}

/**
 * eligibleListings는 이미 자기 거래 금지(D-006) 필터를 적용한 상태여야 한다
 * (src/economy/market.ts의 eligibleRetailListingsForHousehold 참고).
 */
export function decideHouseholdPurchases(
  household: HouseholdState,
  availableCash: number,
  eligibleListings: readonly RetailListing[],
  rng: Rng,
): HouseholdPurchaseDecision {
  const preset = HOUSEHOLD_STRATEGY_PRESETS[household.strategyId];

  const candidates = eligibleListings
    .filter((listing) => listing.quantityAvailable > 0)
    .map((listing) => ({
      listing,
      score: scoreListingForBuyer(
        listing.price,
        listing.quality,
        listing.categoryId,
        preset.qualitySensitivity / Math.max(preset.qualitySensitivity + preset.priceSensitivity, 1e-6),
        rng,
        household.kind === "npc" ? essentialNpcPriorityBonus(listing.categoryId) : 0,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const purchases: PurchaseLine[] = [];
  let remainingCash = availableCash;
  let remainingUnits = MAX_HOUSEHOLD_PURCHASE_UNITS;

  for (const { listing } of candidates) {
    if (remainingUnits <= 0 || remainingCash <= 0) break;
    const affordable = Math.floor(remainingCash / listing.price);
    const quantity = Math.max(0, Math.min(remainingUnits, listing.quantityAvailable, affordable, 3));
    if (quantity <= 0) continue;
    purchases.push({ listingId: listing.id, quantity, unitPrice: listing.price });
    remainingCash -= quantity * listing.price;
    remainingUnits -= quantity;
  }

  return { purchases };
}

/**
 * 가격 대비 품질 점수. qualityWeight=1이면 품질만, 0이면 가격만 본다. 아주 작은 난수로 동점을
 * 깬다. priorityBonus는 "필수 소비" 카테고리(docs/DECISIONS.md D-024)에 가계 구매 알고리즘이
 * 주는 가산점이며, decideStorePurchases(기업→가게 도매 매입)에는 영향을 주지 않도록 항상
 * 기본값 0으로 호출된다. 이 가산점은 decideHouseholdPurchases에서 household.kind === "npc"일
 * 때만 적용되며, 학생 소유 자동진행 가계에는 적용되지 않는다(D-024 후속 수정).
 */
export function scoreListingForBuyer(
  price: number,
  quality: number,
  categoryId: ProductCategoryId,
  qualityWeight: number,
  rng: Rng,
  priorityBonus = 0,
): number {
  const referencePrice = CATEGORY_UNIT_COST[categoryId] * REFERENCE_PRICE_MULTIPLIER;
  const normalizedPrice = price / referencePrice;
  const tieBreak = rngRange(rng, -0.01, 0.01);
  return qualityWeight * quality - (1 - qualityWeight) * normalizedPrice + tieBreak + priorityBonus;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
