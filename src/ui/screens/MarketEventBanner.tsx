import { MARKET_EVENT_COST_MULTIPLIER } from "../../economy/config.js";
import { getActiveMarketEvent } from "../../economy/marketEvents.js";
import type { GameState } from "../../types/domain.js";
import { CATEGORY_LABELS } from "../labels.js";

const COST_INCREASE_PERCENT = Math.round((MARKET_EVENT_COST_MULTIPLIER - 1) * 100);

interface Props {
  state: GameState;
  role: "company" | "store" | "household";
}

/**
 * 시장 변화 이벤트("원자재비 변동", Milestone 6 제안 C, docs/DECISIONS.md D-035) 상시 배너.
 * 비서 패널 토글 뒤에 숨기지 않고 턴 화면 최상단에 항상 노출한다. 방향 지시("~하세요") 없이
 * 사실+범위만 전달한다(docs/ADVISOR_RULES.md 원칙).
 */
export function MarketEventBanner({ state, role }: Props) {
  const event = getActiveMarketEvent(state.config.rngSeed, state.currentRound);
  if (event === undefined) return null;

  const categoryLabel = CATEGORY_LABELS[event.categoryId];
  const round = state.currentRound;
  const message =
    role === "company"
      ? `시장 소식: 이번 ${round}라운드에는 ${categoryLabel} 원자재 가격이 올라, ${categoryLabel}를 생산하는 공장의 생산단가가 평소보다 약 ${COST_INCREASE_PERCENT}% 더 듭니다. 이 라운드에만 적용됩니다.`
      : role === "store"
        ? `시장 소식: 이번 ${round}라운드에는 ${categoryLabel} 원자재 가격이 올라, ${categoryLabel}를 만드는 공장들의 생산단가가 올랐어요. 그래서 이번 라운드 도매시장의 ${categoryLabel} 매입가가 평소보다 높을 수 있어요.`
        : `시장 소식: 이번 ${round}라운드에는 ${categoryLabel} 원자재 가격이 올라, ${categoryLabel} 관련 물건값이 평소보다 비쌀 수 있어요.`;

  return (
    <div className="market-event-banner">
      <span className="market-event-banner-icon" aria-hidden="true">
        📢
      </span>
      <span>{message}</span>
    </div>
  );
}
