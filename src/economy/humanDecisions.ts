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
import { companyUnitCost } from "./config.js";
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
  RetailListing,
  StoreState,
  WholesaleListing,
} from "../types/domain.js";

export interface CompanyDecisionInput {
  quantity: number;
  quality: number;
  wholesalePrice: number;
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
): CompanyProductionDecision | null {
  if (humanInput === undefined) {
    return decideCompanyProduction(company, availableCash, rng);
  }
  const categoryId = company.productCategoryId;
  if (categoryId === null) {
    return null;
  }
  const unitCost = companyUnitCost(categoryId, company.districtId);
  const affordableQuantity = Math.floor(Math.max(0, availableCash) / unitCost);
  const quantity = Math.max(0, Math.min(Math.floor(humanInput.quantity), affordableQuantity));
  const quality = Math.min(1, Math.max(0, humanInput.quality));
  const wholesalePrice = Math.max(0, humanInput.wholesalePrice);

  return { categoryId, quantity, quality, wholesalePrice, unitCost, productionCost: quantity * unitCost };
}

/**
 * eligibleListings는 이미 자기 거래 금지 필터(src/economy/market.ts)와 전문 업종 일치
 * 필터가 적용된 상태여야 한다 — 사람 가게도 봇과 마찬가지로 이번 마일스톤에서는 자신의
 * specialtyCategoryId 안에서만 매입한다 (업종 확장/전환은 v1 범위 밖, docs/NPC_DESIGN.md).
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

  const purchases: PurchaseLine[] = [];
  let remainingCash = availableCash;
  for (const line of requested) {
    const listing = eligibleListings.find(
      (l) => l.id === line.listingId && l.categoryId === store.specialtyCategoryId,
    );
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
    return decideHouseholdPurchases(household, availableCash, eligibleListings, rng);
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
