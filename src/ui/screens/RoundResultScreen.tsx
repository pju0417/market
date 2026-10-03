import { BeginnerGuide } from "./BeginnerGuide.js";
import type { GameState, PlayerState } from "../../types/domain.js";
import { formatWon, profitClass, signedWon } from "../labels.js";

interface Props {
  state: GameState;
  player: PlayerState;
  onNext: () => void;
  isLastRound: boolean;
  disabled?: boolean;
}

/** 라운드 결과 화면: RoundMetrics를 그대로 보여준다. 새 지표를 여기서 계산하지 않는다. */
export function RoundResultScreen({ state, player, onNext, isLastRound, disabled = false }: Props) {
  const metrics = state.roundMetrics.at(-1);
  if (!metrics) return null;

  const myCompanyProfit = metrics.companyProfit[player.companyId] ?? 0;
  const myStoreProfit = metrics.storeProfit[player.storeId] ?? 0;
  const myCompanyShare = metrics.companyMarketShare[player.companyId] ?? 0;
  const myStoreShare = metrics.storeMarketShare[player.storeId] ?? 0;
  const household = state.households[player.householdId];

  return (
    <div className="card card-result">
      <h2 className="card-title">
        <span className="role-icon" aria-hidden="true">🏁</span> {metrics.round}라운드 결과
      </h2>

      <BeginnerGuide topic="results" />
      <section className="enterprise-section" aria-label="내 기업 실적"><h3>내 기업</h3><h4>🏭 공장 실적</h4>
      <div className="stat-row">
        <span className="label">이번 라운드 손익</span>
        <span className={`value ${profitClass(myCompanyProfit)}`}>{signedWon(myCompanyProfit)}</span>
      </div>
      <div className="stat-row">
        <span className="label">도매시장 점유율</span>
        <span className="value">{(myCompanyShare * 100).toFixed(1)}%</span>
      </div>
      <div className="stat-row">
        <span className="label">누적 손익</span>
        <span className={`value ${profitClass(state.companies[player.companyId]!.ledger.cumulativeProfit)}`}>{signedWon(state.companies[player.companyId]!.ledger.cumulativeProfit)}</span>
      </div>

      <h4>🏪 가게 실적</h4>
      <div className="stat-row">
        <span className="label">이번 라운드 손익</span>
        <span className={`value ${profitClass(myStoreProfit)}`}>{signedWon(myStoreProfit)}</span>
      </div>
      <div className="stat-row">
        <span className="label">소매시장 점유율</span>
        <span className="value">{(myStoreShare * 100).toFixed(1)}%</span>
      </div>
      <div className="stat-row">
        <span className="label">누적 손익</span>
        <span className={`value ${profitClass(state.stores[player.storeId]!.ledger.cumulativeProfit)}`}>{signedWon(state.stores[player.storeId]!.ledger.cumulativeProfit)}</span>
      </div>

      </section><h3>🏠 내 가정 · 가계</h3>
      <div className="stat-row">
        <span className="label">만족도</span>
        <span className="value">{household ? (household.satisfactionScore * 100).toFixed(0) : "-"}점</span>
      </div>
      <div className="stat-row">
        <span className="label">저축</span>
        <span className="value">{household ? formatWon(household.ledger.cash) : "-"}</span>
      </div>

      <h3>📊 전체 시장</h3>
      {metrics.locationCosts && <details className="round-location-costs"><summary>이번 라운드 위치·운송 비용</summary>
        {[player.companyId, player.storeId, player.householdId].map((id, index) => <p key={id}>{["공장", "가게", "가정"][index]}: 임대료 {(metrics.locationCosts?.[id]?.rent ?? 0).toFixed(2)}원 · 운송비 {(metrics.locationCosts?.[id]?.transport ?? 0).toFixed(2)}원</p>)}
      </details>}
      <div className="stat-row">
        <span className="label">도매 거래량 / 거래액</span>
        <span className="value">
          {Math.round(metrics.totalWholesaleVolume)}개 / {formatWon(metrics.totalWholesaleValue)}
        </span>
      </div>
      <div className="stat-row">
        <span className="label">소매 거래량 / 거래액</span>
        <span className="value">
          {Math.round(metrics.totalRetailVolume)}개 / {formatWon(metrics.totalRetailValue)}
        </span>
      </div>
      <div className="stat-row">
        <span className="label">평균 가정 만족도</span>
        <span className="value">{(metrics.averageHouseholdSatisfaction * 100).toFixed(0)}점</span>
      </div>

      <button className="primary big" onClick={onNext} disabled={disabled} style={{ marginTop: 16 }}>
        {isLastRound ? "🏆 최종 결과 보기" : "다음 라운드로 ➡️"}
      </button>
    </div>
  );
}
