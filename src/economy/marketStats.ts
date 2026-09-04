/**
 * 도매시장 매물 스냅샷에서 카테고리별 시세 요약을 뽑아내는 순수 함수. 새 수요/가격 공식을
 * 만드는 게 아니라, 이미 state.wholesaleListings에 있는 값을 요약해서 advisor(전략 비서) 등
 * 소비 측 모듈이 읽기 쉬운 형태로 노출하는 것만 담당한다.
 */
import type { CategoryClearingSummary, CompanyState, ParticipantId, ProductCategoryId, StoreState } from "../types/domain.js";

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

/**
 * 카테고리별 예상 마진 = 해당 카테고리 매물의 평균 판매가 - unitCost. 새 공식이 아니라
 * computeCategoryAverages와 (기업이면 companyUnitCost, 가게면 매입 시세 등) 이미 존재하는
 * "단가" 값을 조합한 것뿐이다 (Milestone 6, NPC 업종 전환/전문 이탈 판매 결정이 재사용한다).
 * 해당 카테고리 매물이 하나도 없으면(데이터 없음) undefined를 반환한다.
 */
export function estimateCategoryMargin(
  listings: readonly CategorizedPriceQualityListing[],
  categoryId: ProductCategoryId,
  unitCost: number,
): number | undefined {
  const averages = computeCategoryAverages(listings, categoryId);
  if (averages === undefined) return undefined;
  return averages.averagePrice - unitCost;
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

/**
 * computeCategoryAverages/estimateCategoryMargin과 마찬가지로 WholesaleListing/RetailListing
 * 둘 다 만족하는 구조적으로 넓은 타입 (구매 매칭 알고리즘 재설계 Stage 1).
 */
export interface ClearingSnapshotListing {
  id: string;
  categoryId: ProductCategoryId;
  price: number;
  quantityAvailable: number;
}

/**
 * before(라운드/phase 시작 시점 매물 스냅샷)와 after(현재 매물, 동일 id 기준)를 비교해
 * 카테고리별 시세 청산 요약을 계산하는 순수 함수 — 새 수요/가격 공식이 아니라 스냅샷 비교만
 * 한다. before에 해당 카테고리 매물이 하나도 없으면(데이터 없음) undefined를 반환한다.
 * before에는 있었지만 after에서 사라진(있을 수 없지만 방어적으로) listing은 안 팔린 것으로
 * 간주한다(remaining = before 수량 그대로).
 */
export function computeCategoryClearingSummary(
  before: readonly ClearingSnapshotListing[],
  after: readonly ClearingSnapshotListing[],
  categoryId: ProductCategoryId,
): CategoryClearingSummary | undefined {
  const beforeMatching = before.filter((listing) => listing.categoryId === categoryId);
  if (beforeMatching.length === 0) {
    return undefined;
  }

  const afterById = new Map(after.map((listing) => [listing.id, listing]));

  let totalListed = 0;
  let totalSold = 0;
  let highestSoldPrice: number | undefined;
  let lowestUnsoldPrice: number | undefined;

  for (const listing of beforeMatching) {
    totalListed += listing.quantityAvailable;
    const remaining = afterById.get(listing.id)?.quantityAvailable ?? listing.quantityAvailable;
    const sold = listing.quantityAvailable - remaining;

    if (sold > 0) {
      totalSold += sold;
      if (highestSoldPrice === undefined || listing.price > highestSoldPrice) {
        highestSoldPrice = listing.price;
      }
    }
    if (remaining > 0 && (lowestUnsoldPrice === undefined || listing.price < lowestUnsoldPrice)) {
      lowestUnsoldPrice = listing.price;
    }
  }

  return { totalListed, totalSold, highestSoldPrice, lowestUnsoldPrice };
}
