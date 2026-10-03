import type { GameState } from "../../types/domain.js";
import { CATEGORY_LABELS, DISTRICT_LABELS, PARTICIPANT_KIND_LABELS, formatWon } from "../labels.js";
import {
  computeCompanyRanking,
  computeRoundTrend,
  computeStoreRanking,
  type ParticipantRankingRow,
} from "../teacherOverview.js";

interface Props {
  state: GameState;
  onClose: () => void;
}

function RankingTable({ title, rows }: { title: string; rows: ParticipantRankingRow[] }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="empty-note">참가자가 없습니다.</p>
      ) : (
        <table className="metrics-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>구분</th>
              <th>상권</th>
              <th>업종</th>
              <th>현금</th>
              <th>누적손익</th>
              <th>최근 라운드 손익</th>
              <th>최근 점유율</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{PARTICIPANT_KIND_LABELS[row.kind]}</td>
                <td>{DISTRICT_LABELS[row.districtId]}</td>
                <td>{row.categoryId ? CATEGORY_LABELS[row.categoryId] : "-"}</td>
                <td>{formatWon(row.cash)}</td>
                <td>{formatWon(row.cumulativeProfit)}</td>
                <td>{row.latestRoundProfit !== undefined ? formatWon(row.latestRoundProfit) : "-"}</td>
                <td>{row.latestMarketShare !== undefined ? `${(row.latestMarketShare * 100).toFixed(1)}%` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TeacherOverviewScreen({ state, onClose }: Props) {
  const companyRanking = computeCompanyRanking(state);
  const storeRanking = computeStoreRanking(state);
  const roundTrend = computeRoundTrend(state);

  return (
    <div className="teacher-overlay">
      <div className="card">
        <h2>교사 화면 — 전체 시장 현황</h2>
        <button className="secondary" onClick={onClose}>
          닫기
        </button>
      </div>

      <RankingTable title="공장 순위" rows={companyRanking} />
      <RankingTable title="가게 순위" rows={storeRanking} />

      <div className="card">
        <h2>라운드별 지표 추이</h2>
        {roundTrend.length === 0 ? (
          <p className="empty-note">아직 집계된 라운드 데이터가 없습니다.</p>
        ) : (
          <table className="metrics-table">
            <thead>
              <tr>
                <th>라운드</th>
                <th>도매 거래량</th>
                <th>도매 거래액</th>
                <th>소매 거래량</th>
                <th>소매 거래액</th>
                <th>평균 가정 만족도</th>
              </tr>
            </thead>
            <tbody>
              {roundTrend.map((metrics) => (
                <tr key={metrics.round}>
                  <td>{metrics.round}</td>
                  <td>{Math.round(metrics.totalWholesaleVolume)}개</td>
                  <td>{formatWon(metrics.totalWholesaleValue)}</td>
                  <td>{Math.round(metrics.totalRetailVolume)}개</td>
                  <td>{formatWon(metrics.totalRetailValue)}</td>
                  <td>{(metrics.averageHouseholdSatisfaction * 100).toFixed(0)}점</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
