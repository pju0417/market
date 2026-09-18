/**
 * 유행 이벤트("유행 카테고리", Milestone 6 제안 C, docs/DECISIONS.md D-039). 6라운드에
 * 항상 발생하며, 매 게임 무작위(그러나 결정론적)로 뽑힌 카테고리 하나의 소매(가게→가계)
 * 구매 우선순위 스코어링에만 가산점(TREND_EVENT_PRIORITY_BONUS)을 더한다. 도매(기업→가게)
 * 매입 스코어링이나 만족도 공식에는 전혀 영향을 주지 않는다.
 *
 * marketEvents.ts와 같은 순수 함수 패턴이다 — GameState를 mutate하지 않고, 매번 새
 * createRng(...) 인스턴스를 만들어 그 자리에서만 소비한다. 게임플레이 rng(`rngSeed+1`)나
 * 초기화 rng(`rngSeed` 단독), 원자재비 이벤트 rng(`rngSeed + MARKET_EVENT_RNG_SEED_OFFSET`)
 * 어느 것도 절대 소비하지 않으므로, 이벤트 로직 유무와 무관하게 다른 모든 라운드/이벤트의
 * 결과는 완전히 동일하다.
 */
import { PRODUCT_CATEGORIES, TREND_EVENT_PRIORITY_BONUS, TREND_EVENT_RNG_SEED_OFFSET, TREND_EVENT_ROUNDS } from "./config.js";
import { createRng, rngPick } from "./rng.js";
import type { ProductCategoryId } from "../types/domain.js";

export interface ActiveTrendEvent {
  categoryId: ProductCategoryId;
  priorityBonus: number;
}

/**
 * 이번 라운드에 활성화된 유행 이벤트를 반환한다. `round`가 TREND_EVENT_ROUNDS에 없으면
 * undefined. 같은 (rngSeed, round)는 몇 번을 호출해도 항상 같은 결과를 낸다(결정론).
 */
export function getActiveTrendEvent(rngSeed: number, round: number): ActiveTrendEvent | undefined {
  if (!TREND_EVENT_ROUNDS.includes(round)) {
    return undefined;
  }
  const rng = createRng(rngSeed + TREND_EVENT_RNG_SEED_OFFSET + round);
  const categoryId = rngPick(rng, PRODUCT_CATEGORIES);
  return { categoryId, priorityBonus: TREND_EVENT_PRIORITY_BONUS };
}

/** categoryId가 활성 유행 이벤트의 대상 카테고리와 일치할 때만 가산점을 반환하고, 그 외엔 0이다. */
export function trendPriorityBonusFor(categoryId: ProductCategoryId, event: ActiveTrendEvent | undefined): number {
  return event !== undefined && event.categoryId === categoryId ? event.priorityBonus : 0;
}
