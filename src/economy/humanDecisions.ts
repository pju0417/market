/**
 * 사람이 직접 입력한 결정을 봇 결정과 같은 모양(CompanyProductionDecision, PurchaseLine[])
 * 으로 변환하고, 봇과 동일한 제약(가용 현금 이내, 실제 매물만)을 강제한다. 자기 거래 금지는
 * 호출자가 eligibleListings를 미리 걸러서 넘겨주는 것을 기대하지만, 이 함수도 companies/stores로
 * 판매자 소유자를 직접 재검증하므로 eligibleListings가 어떤 이유로든 필터링을 놓쳐도 자기거래는
 * 통과하지 않는다.
 *
 * 중요: 가격은 절대 사람 입력을 그대로 믿지 않는다 — 도매/소매 구매의 실제 단가는 항상
 * 매물(listing)에 기록된 값으로 다시 계산한다. 사람이 조작 가능한 클라이언트 입력값으로
 * 가격을 정하면 현금이 음수가 되는 등 데이터 무결성이 깨질 수 있다 (src/economy/settlement.ts
 * 의 chargeDiscretionary는 의도적으로 clamp하지 않으므로, 이런 버그는 바로 테스트에서
 * 드러나야 한다).
 *
 * humanInput이 undefined면 항상 기존 봇 정책(src/npc/decisions.ts)으로 그대로 위임한다 —
 * 이 파일은 봇 로직을 대체하지 않고, 사람이 입력했을 때만 끼어드는 얇은 층이다.
 */
import {
  companyUnitCost,
  industrySwitchCost,
  MIN_ROUND_FOR_INDUSTRY_ACTIONS,
  NPC_STORE_SPECIALTY_DEVIATION_RULES,
} from "./config.js";
import { chargeDiscretionary } from "./settlement.js";
import {
  decideCompanyProduction,
  decideHouseholdPurchases,
  decideStorePurchases,
  MAX_HOUSEHOLD_PURCHASE_UNITS,
  type CompanyProductionDecision,
  type HouseholdPurchaseDecision,
  type PurchaseLine,
  type StorePurchaseDecision,
} from "../npc/decisions.js";
import type { Rng } from "./rng.js";
import type {
  CompanyState,
  HouseholdState,
  ParticipantId,
  ProductCategoryId,
  RetailListing,
  StoreState,
  WholesaleListing,
} from "../types/domain.js";

export interface CompanyDecisionInput {
  quantity: number;
  quality: number;
  wholesalePrice: number;
  /**
   * 학생이 이번 라운드에 업종을 전환하고 싶을 때만 넣는다 (Milestone 6, docs/DECISIONS.md
   * D-033). 값이 없으면 "전환하지 않기로 선택"으로 취급한다 — resolveCompanyDecision이
   * 아니라 runCompanyTurn(src/engine/simulateGame.ts)이 사람 입력이 아예 없을 때만 NPC 전환
   * 로직을 대신 호출하므로, 이 필드를 생략한 것과 humanInput 자체가 undefined인 것은 다르게
   * 취급된다.
   */
  switchToCategoryId?: ProductCategoryId;
}

export interface PurchaseRequestLine {
  listingId: string;
  quantity: number;
}

export function resolveCompanyDecision(
  company: CompanyState,
  availableCash: number,
  humanInput: CompanyDecisionInput | undefined,
  rng: Rng,
  costMultiplier = 1,
): CompanyProductionDecision | null {
  if (humanInput === undefined) {
    return decideCompanyProduction(company, availableCash, rng, costMultiplier);
  }
  const categoryId = company.productCategoryId;
  if (categoryId === null) {
    return null;
  }
  const unitCost = companyUnitCost(categoryId, company.districtId) * costMultiplier;
  const affordableQuantity = Math.floor(Math.max(0, availableCash) / unitCost);
  const quantity = Math.max(0, Math.min(Math.floor(humanInput.quantity), affordableQuantity));
  const quality = Math.min(1, Math.max(0, humanInput.quality));
  const wholesalePrice = Math.max(0, humanInput.wholesalePrice);

  return { categoryId, quantity, quality, wholesalePrice, unitCost, productionCost: quantity * unitCost };
}

/**
 * 학생이 업종 전환을 요청했을 때만 적용한다 (Milestone 6, B안 — 재고 유무는 게이팅 조건에
 * 넣지 않는다). `company.ledger.cash`는 호출 시점에 이미 이번 라운드 고정비가 차감된
 * 상태여야 한다(runCompanyTurn이 applyFixedCosts 이후에 이 함수를 호출한다) — 그 값을
 * "가용 현금"으로 그대로 쓴다. 조건 미달(라운드 미달/동일 카테고리/잔액 부족/카테고리 미배정)
 * 이면 아무것도 하지 않고 조용히 무시한다(에러 아님). 전환이 확정되면 그 자리에서 비용을
 * 차감하고 재고/품질을 0으로 리셋한다 — 보상 없이 즉시 폐기(B안).
 *
 * 사람 전환에는 NPC와 달리 쿨다운을 두지 않는다 — 학생이 실제로 감당 가능한 비용
 * (industrySwitchCost)만 내면 매 라운드도 다시 전환할 수 있다. 다만 이 호출이
 * lastIndustrySwitchRound를 갱신하므로, 이후 이 기업이 사람 입력 없이 봇으로 넘어가는
 * 라운드가 생기면 NPC 쿨다운(decideCompanyIndustrySwitch)은 이 값을 그대로 존중한다.
 */
export function resolveCompanyIndustrySwitch(
  company: CompanyState,
  currentRound: number,
  switchToCategoryId: ProductCategoryId | undefined,
): void {
  if (switchToCategoryId === undefined) return;
  if (currentRound < MIN_ROUND_FOR_INDUSTRY_ACTIONS) return;
  if (company.productCategoryId === null || company.productCategoryId === switchToCategoryId) return;

  const cost = industrySwitchCost(company.productCategoryId, switchToCategoryId);
  if (cost > company.ledger.cash) return;

  chargeDiscretionary(company.ledger, cost);
  company.productCategoryId = switchToCategoryId;
  company.inventoryQuantity = 0;
  company.quality = 0;
  company.lastIndustrySwitchRound = currentRound;
}

/**
 * 학생이 이번 라운드 판매 카테고리 변경을 요청했을 때만 적용한다 (Milestone 6). 가게 쪽은
 * specialtyMismatchPenalty가 소비 측(가계 매력도)에서만 적용되므로 즉시 차감되는 비용이
 * 없다 — 대신 기업과 동일한 쿨다운(NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds)을
 * lastSellingCategoryChangeRound 기준으로 적용한다. 조건 미달이면 조용히 무시한다.
 */
export function resolveStoreCategorySwitch(
  store: StoreState,
  currentRound: number,
  sellingCategoryId: ProductCategoryId | undefined,
): void {
  if (sellingCategoryId === undefined) return;
  if (currentRound < MIN_ROUND_FOR_INDUSTRY_ACTIONS) return;

  const currentCategory = store.currentSellingCategoryId ?? store.specialtyCategoryId;
  if (currentCategory === sellingCategoryId) return;
  if (
    store.lastSellingCategoryChangeRound !== null &&
    currentRound - store.lastSellingCategoryChangeRound < NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds
  ) {
    return;
  }

  store.currentSellingCategoryId = sellingCategoryId;
  store.inventoryQuantity = 0;
  store.inventoryQuality = 0;
  store.lastSellingCategoryChangeRound = currentRound;
}

/**
 * eligibleListings는 이미 자기 거래 금지 필터(src/economy/market.ts)와 전문 업종 일치
 * 필터가 적용된 상태여야 한다 — 사람 가게도 봇과 마찬가지로 이번 라운드 판매 카테고리
 * (`store.currentSellingCategoryId ?? store.specialtyCategoryId`) 안에서만 매입한다.
 * 다만 이 함수는 companies로 매물의 실제 판매자 소유자를 다시 확인한다 — eligibleListings가
 * 필터링을 놓치더라도 자기 거래(D-005)는 여기서 다시 막힌다.
 */
export function resolveStorePurchases(
  store: StoreState,
  availableCash: number,
  eligibleListings: readonly WholesaleListing[],
  companies: Readonly<Record<ParticipantId, CompanyState>>,
  requested: readonly PurchaseRequestLine[] | undefined,
  rng: Rng,
): StorePurchaseDecision {
  if (requested === undefined) {
    return decideStorePurchases(store, availableCash, eligibleListings, rng);
  }

  const sellingCategoryId = store.currentSellingCategoryId ?? store.specialtyCategoryId;
  const purchases: PurchaseLine[] = [];
  let remainingCash = availableCash;
  for (const line of requested) {
    const listing = eligibleListings.find((l) => l.id === line.listingId && l.categoryId === sellingCategoryId);
    if (!listing) continue;
    const seller = companies[listing.companyId];
    if (seller === undefined || seller.ownerId === store.ownerId) continue; // 자기거래/미확인 판매자 방어적 거부
    const affordable = Math.floor(remainingCash / listing.price);
    const quantity = Math.max(0, Math.min(Math.floor(line.quantity), listing.quantityAvailable, affordable));
    if (quantity <= 0) continue;
    purchases.push({ listingId: listing.id, quantity, unitPrice: listing.price });
    remainingCash -= quantity * listing.price;
  }
  return { purchases };
}

/**
 * eligibleListings는 이미 자기 거래 금지 필터(src/economy/market.ts)가 적용된 상태여야
 * 한다. 다만 이 함수는 stores로 매물의 실제 판매자 소유자를 다시 확인한다 — eligibleListings가
 * 필터링을 놓치더라도 자기 거래(D-006)는 여기서 다시 막힌다.
 */
export function resolveHouseholdPurchases(
  household: HouseholdState,
  availableCash: number,
  eligibleListings: readonly RetailListing[],
  stores: Readonly<Record<ParticipantId, StoreState>>,
  requested: readonly PurchaseRequestLine[] | undefined,
  rng: Rng,
): HouseholdPurchaseDecision {
  if (requested === undefined) {
    return decideHouseholdPurchases(household, availableCash, eligibleListings, stores, rng);
  }

  const purchases: PurchaseLine[] = [];
  let remainingCash = availableCash;
  let remainingUnits = MAX_HOUSEHOLD_PURCHASE_UNITS;
  for (const line of requested) {
    const listing = eligibleListings.find((l) => l.id === line.listingId);
    if (!listing) continue;
    const seller = stores[listing.storeId];
    if (seller === undefined || seller.ownerId === household.ownerId) continue; // 자기거래/미확인 판매자 방어적 거부
    const affordable = Math.floor(remainingCash / listing.price);
    const quantity = Math.max(0, Math.min(Math.floor(line.quantity), listing.quantityAvailable, affordable, remainingUnits));
    if (quantity <= 0) continue;
    purchases.push({ listingId: listing.id, quantity, unitPrice: listing.price });
    remainingCash -= quantity * listing.price;
    remainingUnits -= quantity;
  }
  return { purchases };
}
