/**
 * 광고 (Milestone 6, docs/DECISIONS.md D-040). 기업(도매)/가게(소매) 공용 메커니즘 — 매 라운드
 * 새로 신청해야 하고(재부과), 신청하지 않으면 다음 라운드엔 자동으로 꺼진다. trendEvent.ts/
 * incomeEvent.ts와 같은 "메커니즘 하나당 파일 하나" 패턴을 따른다.
 *
 * 유행 이벤트(trendEvent.ts, D-039)와 달리 광고는 도매(기업→가게) 매입 스코어링에도 그대로
 * 적용된다 — "도매는 구조적으로 면역"이라는 D-039의 불변식을 이 메커니즘은 의도적으로 깨는
 * 것이다. 두 메커니즘을 혼동하지 않도록 유의한다.
 */
import { ADVERTISING_PRIORITY_BONUS, COSTS, MIN_ROUND_FOR_ADVERTISING } from "./config.js";
import { chargeDiscretionary } from "./settlement.js";
import type { Ledger } from "../types/domain.js";

export function isAdvertisingUnlocked(round: number): boolean {
  return round >= MIN_ROUND_FOR_ADVERTISING;
}

/**
 * 이번 라운드 광고 여부를 확정한다. 항상 `entity.isAdvertisingActive`를 먼저 `false`로
 * 리셋한다 — "안 함"이 필드 생략/false와 완전히 동일한 진짜 중립이 되도록 하기 위함이다
 * (비용도 보너스도 0, 에러 아님). 게이트 미달이거나 `wantsToAdvertise`가 false면 그대로
 * 종료한다. 비용이 `entity.ledger.cash`보다 크면 조용히 종료한다(차감하지 않는다) — 잔액
 * 부족은 버그가 아니라 정상 시나리오다.
 */
export function applyAdvertisingDecision(
  entity: { ledger: Ledger; isAdvertisingActive: boolean },
  currentRound: number,
  wantsToAdvertise: boolean,
): void {
  entity.isAdvertisingActive = false;
  if (!wantsToAdvertise) return;
  if (!isAdvertisingUnlocked(currentRound)) return;

  const cost = COSTS.advertisingCostPerRound;
  if (cost > entity.ledger.cash) return;

  chargeDiscretionary(entity.ledger, cost);
  entity.isAdvertisingActive = true;
}

/** 판매자가 광고 중이면 ADVERTISING_PRIORITY_BONUS, 아니면 0. */
export function advertisingScoreBonus(sellerIsAdvertising: boolean): number {
  return sellerIsAdvertising ? ADVERTISING_PRIORITY_BONUS : 0;
}
