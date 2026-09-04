/**
 * 구매 매칭 알고리즘 재설계(Stage 1)의 저수준 순수 함수. "1~3순위 수동 지정 밖 부족분"을
 * 자동으로 채우는 안전망 로직만 담당한다 — 수동 지정 처리(1단계)와 카테고리별 예산 이어받기는
 * src/economy/humanDecisions.ts의 resolveSingleCategoryPurchase가 담당한다.
 *
 * scoreFn이 있으면(품질 우선 모드) 점수 내림차순으로, 없으면(가격 우선 모드, 기본값) 가격
 * 오름차순으로 정렬한 뒤 그리디하게 채운다. NPC 봇(src/npc/decisions.ts)은 항상 scoreFn을
 * 넘긴다 — "가격 우선"이라는 별도 모드가 없고, qualityWeight가 0에 가까운 값으로도 가격
 * 선호를 표현하기 때문이다.
 */
import { rngRange, type Rng } from "./rng.js";
import type { PurchaseLine } from "../npc/decisions.js";

/** allocateCategoryPurchase가 다룰 수 있는 최소 구조 — WholesaleListing/RetailListing 둘 다 만족한다. */
export interface AllocatableListing {
  id: string;
  price: number;
  quantityAvailable: number;
  quality: number;
}

/**
 * eligibleListings는 이미 자기거래 필터를 통과한 상태여야 하며(호출자 책임), 사람 경로에서는
 * 1~3순위에 쓰인 listingId도 이미 제외된 상태여야 한다. maxUnitPrice는 무제한이면 Infinity를
 * 넘긴다 — 상한가 필터는 항상 정렬 "전"에 적용한다(정렬 후 멈추는 방식이 아니다).
 */
export function allocateCategoryPurchase<L extends AllocatableListing>(
  eligibleListings: readonly L[],
  maxQuantity: number,
  maxUnitPrice: number,
  availableCash: number,
  rng: Rng,
  scoreFn?: (listing: L) => number,
): PurchaseLine[] {
  const withinPriceCap = eligibleListings.filter((listing) => listing.price <= maxUnitPrice);

  const sorted =
    scoreFn !== undefined
      ? withinPriceCap
          .map((listing) => ({ listing, score: scoreFn(listing) }))
          .sort((a, b) => b.score - a.score)
          .map((entry) => entry.listing)
      : withinPriceCap
          .map((listing) => ({ listing, tieBreak: rngRange(rng, -0.01, 0.01) }))
          .sort((a, b) => a.listing.price - b.listing.price || a.tieBreak - b.tieBreak)
          .map((entry) => entry.listing);

  const purchases: PurchaseLine[] = [];
  let remainingCash = availableCash;
  let remainingQuantity = maxQuantity;

  for (const listing of sorted) {
    if (remainingQuantity <= 0 || remainingCash <= 0) break;
    const affordable = Math.floor(remainingCash / listing.price);
    const quantity = Math.floor(Math.max(0, Math.min(remainingQuantity, listing.quantityAvailable, affordable)));
    if (quantity <= 0) continue;
    purchases.push({ listingId: listing.id, quantity, unitPrice: listing.price });
    remainingCash -= quantity * listing.price;
    remainingQuantity -= quantity;
  }

  return purchases;
}
