import { INCOME_EVENT_BUDGET_MULTIPLIER } from "../../economy/config.js";
import { isIncomeEventActive } from "../../economy/incomeEvent.js";
import type { GameState } from "../../types/domain.js";

const BUDGET_DECREASE_PERCENT = Math.round((1 - INCOME_EVENT_BUDGET_MULTIPLIER) * 100);

interface Props {
  state: GameState;
  role: "company" | "store" | "household";
}

/**
 * 소비자 소득 변화 이벤트("불황", Milestone 6 제안 A, docs/DECISIONS.md D-037) 상시 배너.
 * MarketEventBanner와 같은 패턴 — 비서 패널 토글 뒤에 숨기지 않고 턴 화면 최상단에 항상
 * 노출한다. 방향 지시("~하세요") 없이 사실+범위만 전달한다(docs/ADVISOR_RULES.md 원칙).
 */
export function IncomeEventBanner({ state, role }: Props) {
  if (!isIncomeEventActive(state.currentRound)) return null;

  const round = state.currentRound;
  const message =
    role === "household"
      ? `시장 소식: 이번 ${round}라운드는 경기가 어려워져 가계 용돈이 평소보다 적어요(약 ${BUDGET_DECREASE_PERCENT}% 감소). 이 라운드에만 적용됩니다.`
      : role === "store"
        ? `시장 소식: 이번 ${round}라운드는 경기가 어려워져 가계의 씀씀이가 줄어들 수 있어요. 소비자들이 평소보다 적게 살 수 있습니다.`
        : `시장 소식: 이번 ${round}라운드는 경기가 어려워져 소비자 구매력이 줄어들 수 있어요. 도매 판매에 영향이 있을 수 있습니다.`;

  return (
    <div className="market-event-banner">
      <span className="market-event-banner-icon" aria-hidden="true">
        📢
      </span>
      <span>{message}</span>
    </div>
  );
}
