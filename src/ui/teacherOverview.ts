/**
 * 교사 화면(읽기 전용 전체 시장 현황 오버레이)을 위한 뷰모델 계산.
 *
 * React에 의존하지 않는 순수 함수만 담는다 — GameState를 읽기만 하고 절대 변형하지 않는다.
 */
import type { DistrictId, GameState, ParticipantId, ParticipantKind, ProductCategoryId, RoundMetrics } from "../types/domain.js";

export interface ParticipantRankingRow {
  id: ParticipantId;
  kind: ParticipantKind;
  districtId: DistrictId;
  categoryId: ProductCategoryId | null;
  cash: number;
  cumulativeProfit: number;
  latestRoundProfit: number | undefined;
  latestMarketShare: number | undefined;
}

function sortByProfitDescending(rows: ParticipantRankingRow[]): ParticipantRankingRow[] {
  return rows.sort((a, b) => b.cumulativeProfit - a.cumulativeProfit);
}

export function computeCompanyRanking(state: GameState): ParticipantRankingRow[] {
  const latest = state.roundMetrics.at(-1);
  const rows = Object.values(state.companies).map((company) => ({
    id: company.id,
    kind: company.kind,
    districtId: company.districtId,
    categoryId: company.productCategoryId,
    cash: company.ledger.cash,
    cumulativeProfit: company.ledger.cumulativeProfit,
    latestRoundProfit: latest?.companyProfit[company.id],
    latestMarketShare: latest?.companyMarketShare[company.id],
  }));
  return sortByProfitDescending(rows);
}

export function computeStoreRanking(state: GameState): ParticipantRankingRow[] {
  const latest = state.roundMetrics.at(-1);
  const rows = Object.values(state.stores).map((store) => ({
    id: store.id,
    kind: store.kind,
    districtId: store.districtId,
    categoryId: store.currentSellingCategoryId ?? store.specialtyCategoryId,
    cash: store.ledger.cash,
    cumulativeProfit: store.ledger.cumulativeProfit,
    latestRoundProfit: latest?.storeProfit[store.id],
    latestMarketShare: latest?.storeMarketShare[store.id],
  }));
  return sortByProfitDescending(rows);
}

export function computeRoundTrend(state: GameState): RoundMetrics[] {
  return [...state.roundMetrics];
}
