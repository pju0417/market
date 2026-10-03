import { useState } from "react";
import type { GameState, StoreState } from "../../types/domain.js";
import { analyzeStoreTurn } from "../../advisor/storeAdvisor.js";
import { AdvisorPanel } from "./AdvisorPanel.js";
import { money } from "./InventoryPanel.js";

export function StoreBriefing({ state, store }: { state: GameState; store: StoreState }) {
  const [reviewed, setReviewed] = useState(false);
  const previous = state.roundMetrics.find(m => m.round === state.currentRound - 1);
  return <section className="store-briefing" aria-label="가게 경영 보고서">
    <h3>📋 {previous ? `${previous.round}라운드 가게 보고서` : "첫 영업을 준비해요"}</h3>
    {!reviewed && <>{previous ? <>
      <p>{previous.storeUnitsSoldRetail[store.id] ?? 0}개를 팔아 {money(previous.storeRevenue[store.id] ?? 0)}의 매출을 올렸어요.</p>
      <dl className="briefing-grid"><div><dt>매입 수량</dt><dd>{previous.storeUnitsPurchased[store.id] ?? 0}개</dd></div><div><dt>매입에 쓴 돈</dt><dd>{money(previous.storeWholesaleSpend[store.id] ?? 0)}</dd></div><div><dt>모든 비용을 뺀 손익</dt><dd>{money(previous.storeProfit[store.id] ?? 0)}</dd></div><div><dt>이전 라운드 대비 손익</dt><dd>{(() => { const older = state.roundMetrics.find(m => m.round === previous.round - 1); return older ? money((previous.storeProfit[store.id] ?? 0) - (older.storeProfit[store.id] ?? 0)) : "첫 실적이에요"; })()}</dd></div></dl>
      <p className="hint">손익은 이번 라운드의 매출에서 매입비·임대료 등 지출을 뺀 금액이에요. 남은 재고의 가치는 포함하지 않아요.</p>
    </> : <p>아직 지난 라운드 실적은 없어요. 재고 확인 → 비서 의견 → 상품 매입 → 판매 가격 설정 순서로 준비해 보세요.</p>}</>}
    <button className="secondary" aria-expanded={!reviewed} onClick={() => setReviewed(!reviewed)}>{reviewed ? "보고서 다시 보기" : "확인했어요 · 매입 준비하기"}</button>
    <details className="store-advisor"><summary>💡 가게 비서 의견 보기</summary><AdvisorPanel advice={analyzeStoreTurn(state, store.id)} /></details>
  </section>;
}
