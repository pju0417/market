import { getActiveTrendEvent } from "../../economy/trendEvent.js";
import type { GameState } from "../../types/domain.js";
import { CATEGORY_LABELS } from "../labels.js";

interface Props {
  state: GameState;
  role: "company" | "store" | "household";
}

/**
 * 유행 이벤트("유행 카테고리", Milestone 6 제안 C, docs/DECISIONS.md D-039) 상시 배너.
 * MarketEventBanner/IncomeEventBanner와 같은 패턴 — 턴 화면 최상단에 항상 노출한다. 방향
 * 지시("~하세요") 없이 사실+범위만 전달하고(docs/ADVISOR_RULES.md 원칙), 가산점이 판매량이나
 * 가격을 보장하지 않는 "랭킹 보정일 뿐"이라는 점을 과장하지 않는다.
 */
export function TrendEventBanner({ state, role }: Props) {
  const event = getActiveTrendEvent(state.config.rngSeed, state.currentRound);
  if (event === undefined) return null;

  const categoryLabel = CATEGORY_LABELS[event.categoryId];
  const round = state.currentRound;
  const message =
    role === "company"
      ? `시장 소식: 이번 ${round}라운드는 ${categoryLabel}가 유행이에요. 다만 이 유행은 소비자가 가게에서 물건을 고를 때만 영향을 주는 작은 가산점일 뿐이고, 공장이 가게에 파는 도매 거래에는 전혀 영향을 주지 않습니다.`
      : role === "store"
        ? `시장 소식: 이번 ${round}라운드는 ${categoryLabel}가 유행이에요. 이 카테고리를 파는 가게가 소비자에게 조금 더 매력적으로 보일 수 있어요. 다만 판매량이나 가격을 보장하는 건 아니고, 다른 조건이 비슷할 때 순위를 살짝 올려주는 정도예요.`
        : `시장 소식: 이번 ${round}라운드는 ${categoryLabel}가 유행이에요. 다른 조건이 비슷하면 이 카테고리 상품이 조금 더 끌릴 수 있어요.`;

  return (
    <div className="market-event-banner">
      <span className="market-event-banner-icon" aria-hidden="true">
        📢
      </span>
      <span>{message}</span>
    </div>
  );
}
