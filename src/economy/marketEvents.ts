/**
 * 시장 변화 이벤트("원자재비 변동", Milestone 6 제안 C, docs/DECISIONS.md D-035). 6·7라운드에
 * 항상 발생하며, 매 라운드 무작위(그러나 결정론적)로 뽑힌 카테고리 하나의 그 라운드
 * companyUnitCost 결과값 전체에 배율(MARKET_EVENT_COST_MULTIPLIER)을 곱한다.
 *
 * 순수 함수만 제공한다 — GameState를 mutate하지 않고, 매번 새 createRng(...) 인스턴스를 만들어
 * 그 자리에서만 소비한다. 게임플레이 rng(`rngSeed+1`)나 초기화 rng(`rngSeed` 단독)를 절대
 * 소비하지 않으므로, 이벤트 로직 유무와 무관하게 다른 모든 라운드의 결과는 완전히 동일하다.
 */
import {
  MARKET_EVENT_COST_MULTIPLIER,
  MARKET_EVENT_RNG_SEED_OFFSET,
  MARKET_EVENT_ROUNDS,
  PRODUCT_CATEGORIES,
} from "./config.js";
import { createRng, rngPick } from "./rng.js";
import type { ProductCategoryId } from "../types/domain.js";

export interface ActiveMarketEvent {
  categoryId: ProductCategoryId;
  costMultiplier: number;
}

/**
 * 이번 라운드에 활성화된 시장 변화 이벤트를 반환한다. `round`가 MARKET_EVENT_ROUNDS에 없으면
 * undefined. 같은 (rngSeed, round)는 몇 번을 호출해도 항상 같은 결과를 낸다(결정론).
 */
export function getActiveMarketEvent(rngSeed: number, round: number): ActiveMarketEvent | undefined {
  if (!MARKET_EVENT_ROUNDS.includes(round)) {
    return undefined;
  }
  const rng = createRng(rngSeed + MARKET_EVENT_RNG_SEED_OFFSET + round);
  const categoryId = rngPick(rng, PRODUCT_CATEGORIES);
  return { categoryId, costMultiplier: MARKET_EVENT_COST_MULTIPLIER };
}

/**
 * MARKET_EVENT_ROUNDS 중 fromRound 이상인 것의 개수(6라운드 시점 → 2, 7라운드 시점 → 1). 이
 * 함수는 실제로는 이벤트가 활성화된 라운드(fromRound가 MARKET_EVENT_ROUNDS의 원소일 때)에서만
 * 호출될 것을 전제로 한다 — fromRound가 이벤트 라운드가 아니면(예: 5라운드) 0을 반환한다.
 */
export function countRemainingMarketEventRounds(fromRound: number): number {
  if (!MARKET_EVENT_ROUNDS.includes(fromRound)) {
    return 0;
  }
  return MARKET_EVENT_ROUNDS.filter((round) => round >= fromRound).length;
}

/** categoryId가 활성 이벤트의 대상 카테고리와 일치할 때만 배율을 반환하고, 그 외엔 1이다. */
export function marketEventCostMultiplierFor(
  categoryId: ProductCategoryId,
  event: ActiveMarketEvent | undefined,
): number {
  return event !== undefined && event.categoryId === categoryId ? event.costMultiplier : 1;
}
