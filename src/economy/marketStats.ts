/**
 * 도매시장 매물 스냅샷에서 카테고리별 시세 요약을 뽑아내는 순수 함수. 새 수요/가격 공식을
 * 만드는 게 아니라, 이미 state.wholesaleListings에 있는 값을 요약해서 advisor(전략 비서) 등
 * 소비 측 모듈이 읽기 쉬운 형태로 노출하는 것만 담당한다.
 */
import type { CompanyState, ParticipantId, ProductCategoryId, StoreState } from "../types/domain.js";

export interface CategoryMarketAverages {
  averagePrice: number;
  averageQuality: number;
  listingCount: number;
}

/**
 * WholesaleListing/RetailListing 둘 다 categoryId/price/quality 필드를 같은 의미로 가지므로,
 * 이 함수는 둘 중 어느 매물 배열을 넘겨도 동작하도록 구조적으로 넓은 타입을 받는다. 로직
 * 자체는 바꾸지 않는다 — 시그니처만 넓힌 것이다.
 */
export interface CategorizedPriceQualityListing {
  categoryId: ProductCategoryId;
  price: number;
  quality: number;
}

/** 해당 카테고리의 매물이 하나도 없으면 undefined를 반환한다 (호출자가 "데이터 없음"을 구분할 수 있도록). */
export function computeCategoryAverages(
  listings: readonly CategorizedPriceQualityListing[],
  categoryId: ProductCategoryId,
): CategoryMarketAverages | undefined {
  const matching = listings.filter((listing) => listing.categoryId === categoryId);
  if (matching.length === 0) {
    return undefined;
  }
  const totalPrice = matching.reduce((sum, listing) => sum + listing.price, 0);
  const totalQuality = matching.reduce((sum, listing) => sum + listing.quality, 0);
  return {
    averagePrice: totalPrice / matching.length,
    averageQuality: totalQuality / matching.length,
    listingCount: matching.length,
  };
}

/** 같은 업종(categoryId)을 가진 다른 기업의 수 (자기 자신은 제외). */
export function computeCompetitorCount(
  companies: Readonly<Record<ParticipantId, CompanyState>>,
  categoryId: ProductCategoryId,
  excludeCompanyId: ParticipantId,
): number {
  return Object.values(companies).filter(
    (company) => company.id !== excludeCompanyId && company.productCategoryId === categoryId,
  ).length;
}

/** computeCompetitorCount의 가게판: 같은 전문 업종(specialtyCategoryId)을 가진 다른 가게의 수 (자기 자신은 제외). */
export function computeStoreCompetitorCount(
  stores: Readonly<Record<ParticipantId, StoreState>>,
  categoryId: ProductCategoryId,
  excludeStoreId: ParticipantId,
): number {
  return Object.values(stores).filter(
    (store) => store.id !== excludeStoreId && store.specialtyCategoryId === categoryId,
  ).length;
}
