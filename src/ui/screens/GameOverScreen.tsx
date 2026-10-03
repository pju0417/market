import type { GameState, PlayerState } from "../../types/domain.js";
import { formatWon, profitClass, signedWon } from "../labels.js";

interface Props {
  state: GameState;
  player: PlayerState;
  onRestart: () => void;
}

export function GameOverScreen({ state, player, onRestart }: Props) {
  const company = state.companies[player.companyId]!;
  const store = state.stores[player.storeId]!;
  const household = state.households[player.householdId]!;

  return (
    <div className="card card-result">
      <h2 className="card-title">
        <span className="role-icon" aria-hidden="true">🏆</span> 7라운드 완료!
      </h2>
      <section className="enterprise-section" aria-label="내 기업 최종 실적"><h3>내 기업</h3><div className="stat-row">
        <span className="label">공장 최종 현금 / 누적 손익</span>
        <span className="value">
          {formatWon(company.ledger.cash)} /{" "}
          <span className={profitClass(company.ledger.cumulativeProfit)}>{signedWon(company.ledger.cumulativeProfit)}</span>
        </span>
      </div>
      <div className="stat-row">
        <span className="label">가게 최종 현금 / 누적 손익</span>
        <span className="value">
          {formatWon(store.ledger.cash)} /{" "}
          <span className={profitClass(store.ledger.cumulativeProfit)}>{signedWon(store.ledger.cumulativeProfit)}</span>
        </span>
      </div>
      </section><h3>내 가정 · 가계</h3><div className="stat-row"><span className="label">가정 최종 저축</span>
        <span className="value">{formatWon(household.ledger.cash)}</span>
      </div>
      <div className="stat-row">
        <span className="label">가정 최종 만족도</span>
        <span className="value">{(household.satisfactionScore * 100).toFixed(0)}점</span>
      </div>

      <button className="primary big" onClick={onRestart} style={{ marginTop: 16 }}>
        🎮 새 게임 시작하기
      </button>
    </div>
  );
}
