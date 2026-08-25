/**
 * 도매/소매 시장의 자기 거래 금지 필터 (D-005, D-006). 가게는 여러 기업의 상품을 직접
 * 비교해 매입하고(D-004), 가계는 여러 가게의 상품을 직접 비교해 구매한다 — 이 파일은
 * "무엇을 비교 대상에서 아예 제외해야 하는가"만 책임지고, 무엇을 고를지는
 * src/npc/decisions.ts가 결정한다.
 */
import type {
  CompanyState,
  HouseholdState,
  ParticipantId,
  RetailListing,
  StoreState,
  WholesaleListing,
} from "../types/domain.js";

/** 자신의 기업 상품을 자신의 가게가 매입할 수 없다 (D-005). */
export function eligibleWholesaleListingsForStore(
  store: StoreState,
  listings: readonly WholesaleListing[],
  companies: Readonly<Record<ParticipantId, CompanyState>>,
): WholesaleListing[] {
  return listings.filter((listing) => {
    const company = companies[listing.companyId];
    return company !== undefined && company.ownerId !== store.ownerId;
  });
}

/** 자신의 가게에서 자신의 가계가 구매할 수 없다 (D-006). */
export function eligibleRetailListingsForHousehold(
  household: HouseholdState,
  listings: readonly RetailListing[],
  stores: Readonly<Record<ParticipantId, StoreState>>,
): RetailListing[] {
  return listings.filter((listing) => {
    const store = stores[listing.storeId];
    return store !== undefined && store.ownerId !== household.ownerId;
  });
}

/** 재고에 새 구매분을 섞은 가중평균 품질. 분모가 0이면 새 품질을 그대로 쓴다. */
export function blendQuality(
  existingQuantity: number,
  existingQuality: number,
  addedQuantity: number,
  addedQuality: number,
): number {
  const totalQuantity = existingQuantity + addedQuantity;
  if (totalQuantity <= 0) return addedQuality;
  return (existingQuantity * existingQuality + addedQuantity * addedQuality) / totalQuantity;
}
