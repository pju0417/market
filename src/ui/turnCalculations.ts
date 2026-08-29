/**
 * 기업/가게/가계 턴 화면(CompanyTurnScreen, StoreTurnScreen, HouseholdTurnScreen)이
 * 공유하는 파생 계산 로직. React에 의존하지 않는 순수 함수만 담는다 — 컴포넌트는 이 함수들을
 * 불러 쓰기만 하고, 계산 공식 자체를 다시 베껴 쓰지 않는다.
 *
 * 고정비/가용현금/가계 예산 계산은 src/economy/costs.ts로 옮겨졌다 (advisor 등 UI에 의존하지
 * 않는 모듈도 재사용해야 하기 때문) — 여기서는 기존 import 경로가 깨지지 않도록 그대로
 * re-export한다.
 */
import type { ProductCategoryId, RetailListing, WholesaleListing } from "../types/domain.js";

export { computeAvailableCash, computeCompanyFixedCost, computeHouseholdTotalBudget, computeStoreFixedCost } from "../economy/costs.js";

/** 매입/구매 대상 매물의 비용 계산에 필요한 최소 필드. */
export interface CostableListing {
  id: string;
  price: number;
}

/** 개당 단가로 살 수 있는 최대 수량. 단가가 0 이하이면 계산할 수 없으므로 0을 반환한다. */
export function computeMaxAffordable(availableCash: number, unitCost: number): number {
  return unitCost > 0 ? Math.floor(availableCash / unitCost) : 0;
}

export function computeProductionCost(quantity: number, unitCost: number): number {
  return quantity * unitCost;
}

/** 매물 목록 + 수량 선택(listingId -> quantity) 조합의 총 비용. */
export function computeTotalCost(listings: readonly CostableListing[], quantities: Record<string, number>): number {
  return listings.reduce((sum, listing) => sum + (quantities[listing.id] ?? 0) * listing.price, 0);
}

export function isOverBudget(cost: number, budget: number): boolean {
  return cost > budget;
}

export function sumQuantities(quantities: Record<string, number>): number {
  return Object.values(quantities).reduce((sum, q) => sum + q, 0);
}

/** 수량 제한 계산에 필요한 최소 필드. */
export interface QuantityLimitedListing extends CostableListing {
  quantityAvailable: number;
}

/**
 * 가계가 이 매물 하나에 지금 담을 수 있는 최대 수량. 재고, 라운드 전체 구매 개수 한도뿐
 * 아니라 "이미 다른 매물에 담아둔 금액/개수"까지 제외한 나머지로 계산한다 — 즉 다른 항목에
 * 먼저 담을수록 이 항목의 최대치가 실시간으로 줄어들어, 애초에 예산을 넘는 수량을 입력창에
 * 넣을 수 없게 한다.
 */
export function computeMaxPurchaseQuantity(
  listing: QuantityLimitedListing,
  totalBudget: number,
  maxUnits: number,
  otherListingsCost: number,
  otherListingsUnits: number,
): number {
  const remainingCash = Math.max(0, totalBudget - otherListingsCost);
  const remainingUnits = Math.max(0, maxUnits - otherListingsUnits);
  return Math.max(0, Math.min(listing.quantityAvailable, remainingUnits, computeMaxAffordable(remainingCash, listing.price)));
}

/**
 * 자기 거래 금지 필터(eligibleWholesaleListingsForStore)를 통과한 매물 중, 가게가 실제로
 * 화면에 표시하고 매입할 수 있는 것만 추린다 — 전문 업종과 일치하고 재고가 남아있어야 한다.
 */
export function filterEligibleWholesaleListings(
  listings: readonly WholesaleListing[],
  specialtyCategoryId: ProductCategoryId | null,
): WholesaleListing[] {
  return listings.filter((listing) => listing.categoryId === specialtyCategoryId && listing.quantityAvailable > 0);
}

/**
 * 자기 거래 금지 필터(eligibleRetailListingsForHousehold)를 통과한 매물 중, 재고가 남아있는
 * 것만 화면에 표시한다.
 */
export function filterEligibleRetailListings(listings: readonly RetailListing[]): RetailListing[] {
  return listings.filter((listing) => listing.quantityAvailable > 0);
}
