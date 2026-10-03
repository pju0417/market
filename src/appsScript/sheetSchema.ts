/**
 * Apps Script 스프레드시트 탭 이름/컬럼 상수와 GameState/RoundMetrics 직렬화 변환 순수
 * 함수 (Milestone 5 1부, D-032). 이 파일은 `SpreadsheetGateway`를 전혀 참조하지 않는다 —
 * 순수 문자열 변환만 담당하고, 실제 시트 읽기/쓰기는 `gasSessionStore.ts`/`gasTokenStore.ts`가
 * 담당한다.
 *
 * 라운드가 지나도 한 셀이 무한정 커지지 않도록 탭을 분리했다(D-032 설계 근거 3항):
 * - `LIVE_STATE_SHEET`: 세션당 1행. `GameState`에서 `roundMetrics`를 뺀 나머지(현재 라운드/
 *   phase, players, companies/stores/households, 진행 중인 시장 매물)만 담는다. 라운드가
 *   지나도 이 값 자체의 크기는 참가자 수에만 비례하고 라운드 수와는 무관하다.
 * - `ROUND_METRICS_SHEET`: append-only. 세션 하나의 라운드 하나 = 한 행. 매 라운드 끝날 때
 *   한 행씩만 추가되므로 `LiveState`처럼 통째로 다시 쓰지 않는다.
 * - `ROUND_SUMMARY_SHEET`: 엔진이 다시 읽지 않는 순수 파생 데이터(사람이 스프레드시트에서
 *   바로 읽기 위한 것). `RoundMetrics`의 참가자별 Record 필드들을 참가자당 1행으로 펼친다.
 */
import type { GameState, ParticipantId, ProductCategoryId, RoundMetrics } from "../types/domain.js";

export const SESSIONS_SHEET = "Sessions";
export const LIVE_STATE_SHEET = "LiveState";
export const PENDING_SUBMISSIONS_SHEET = "PendingSubmissions";
export const ROUND_METRICS_SHEET = "RoundMetrics";
export const ROUND_SUMMARY_SHEET = "RoundSummary";
export const TOKENS_SHEET = "Tokens";

/** `GameState`에서 `roundMetrics`만 뺀 모양 — `LIVE_STATE_SHEET`의 한 행에 저장되는 값. */
export type LiveGameState = Omit<GameState, "roundMetrics">;

/**
 * `state`에서 `roundMetrics`를 뺀 나머지를 JSON 문자열로 직렬화한다 (`LIVE_STATE_SHEET`).
 * `roundMetrics`는 라운드마다 계속 자라므로 이 문자열에는 절대 포함하지 않는다 — 셀 문자수
 * 한도(약 50,000자) 회귀는 `tests/appsScript/sheetSchema.test.ts`가 감시한다.
 */
export function serializeLiveState(state: GameState): string {
  const {
    config,
    currentRound,
    currentPhase,
    players,
    companies,
    stores,
    households,
    wholesaleListings,
    retailListings,
  } = state;
  const liveState: LiveGameState = {
    ...(state.roundAccounting ? { roundAccounting: state.roundAccounting } : {}),
    ...(state.shopping ? { shopping: state.shopping } : {}),
    ...(state.city ? { city: state.city } : {}),
    config,
    currentRound,
    currentPhase,
    players,
    companies,
    stores,
    households,
    wholesaleListings,
    retailListings,
  };
  const json = JSON.stringify(liveState);
  if (json.length < 35000) return json;
  // Repeated field names dominate classroom snapshots. Lossless key packing keeps
  // the live state within a Sheets cell without rounding monetary values.
  const keys: string[] = [];
  const indices = new Map<string, string>();
  function pack(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(pack);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      let index = indices.get(key);
      if (index === undefined) { index = keys.length.toString(36); keys.push(key); indices.set(key, index); }
      return [index, pack(item)];
    }));
  }
  const data = pack(liveState);
  return JSON.stringify({ packedKeysV1: keys, data });
}

/**
 * `serializeLiveState`의 역함수. 이미 별도로(`ROUND_METRICS_SHEET`에서) 조회해 둔
 * `roundMetrics` 배열을 다시 합쳐 완전한 `GameState`를 재구성한다.
 */
export function deserializeLiveState(json: string, roundMetrics: RoundMetrics[]): GameState {
  const parsed = JSON.parse(json) as LiveGameState & { packedKeysV1?: string[]; data?: unknown };
  function unpack(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(unpack);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [parsed.packedKeysV1![parseInt(key, 36)]!, unpack(item)]));
  }
  const liveState = parsed.packedKeysV1 ? unpack(parsed.data) as LiveGameState : parsed;
  return { ...liveState, roundMetrics };
}

/** `RoundMetrics` 하나를 JSON 문자열로 직렬화한다 (`ROUND_METRICS_SHEET`의 한 행). */
export function serializeRoundMetrics(metrics: RoundMetrics): string {
  return JSON.stringify(metrics);
}

/** `serializeRoundMetrics`의 역함수. */
export function deserializeRoundMetrics(json: string): RoundMetrics {
  return JSON.parse(json) as RoundMetrics;
}

/** 여러 `Record<ParticipantId, unknown>`에 등장하는 모든 키(참가자 id)의 합집합. */
function unionParticipantIds(...records: Record<ParticipantId, unknown>[]): ParticipantId[] {
  const ids = new Set<ParticipantId>();
  for (const record of records) {
    for (const id of Object.keys(record)) {
      ids.add(id);
    }
  }
  return [...ids];
}

function numberToCell(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/**
 * `RoundMetrics` + 세션 id를 `ROUND_SUMMARY_SHEET`의 평평한 행들로 펼친다 — **엔진이 다시
 * 읽지 않는 순수 파생 데이터**다(사람이 스프레드시트에서 바로 읽고 분석하기 위한 용도일 뿐,
 * `deserializeLiveState`/`GameSession`은 이 탭을 절대 참조하지 않는다).
 *
 * 참가자당 1행이 원칙이지만, `RoundMetrics`의 회사/가게/가계 관련 필드는 서로 다른 id
 * 공간(companyId/storeId/householdId, D-002 자산 분리)이라 하나의 행으로 합칠 수 없다 —
 * 대신 `entityType` 컬럼으로 구분한 행을 엔티티(회사/가게/가계) 하나당 1행씩 만든다. 라운드
 * 전체 집계 컬럼(총 거래량/금액, 평균 만족도)은 참고용으로 모든 행에 함께 싣는다.
 */
export function buildRoundSummaryRows(sessionId: string, metrics: RoundMetrics): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const roundTotals = {
    totalWholesaleVolume: numberToCell(metrics.totalWholesaleVolume),
    totalWholesaleValue: numberToCell(metrics.totalWholesaleValue),
    totalRetailVolume: numberToCell(metrics.totalRetailVolume),
    totalRetailValue: numberToCell(metrics.totalRetailValue),
    averageHouseholdSatisfaction: numberToCell(metrics.averageHouseholdSatisfaction),
  };

  const companyIds = unionParticipantIds(
    metrics.companyProfit,
    metrics.companyMarketShare,
    metrics.companyUnitsProduced,
    metrics.companyUnitsSoldWholesale,
    metrics.companyRevenue,
  );
  for (const companyId of companyIds) {
    rows.push({
      sessionId,
      round: String(metrics.round),
      entityType: "company",
      entityId: companyId,
      profit: numberToCell(metrics.companyProfit[companyId]),
      marketShare: numberToCell(metrics.companyMarketShare[companyId]),
      unitsProduced: numberToCell(metrics.companyUnitsProduced[companyId]),
      unitsSoldWholesale: numberToCell(metrics.companyUnitsSoldWholesale[companyId]),
      revenue: numberToCell(metrics.companyRevenue[companyId]),
      unitsPurchased: "",
      wholesaleSpend: "",
      unitsSoldRetail: "",
      supplierCount: "",
      topSupplierSpendShare: "",
      householdSpend: "",
      unitsBought: "",
      categoryCount: "",
      topCategorySpendShare: "",
      essentialCategoriesMissed: "",
      ...roundTotals,
    });
  }

  const storeIds = unionParticipantIds(
    metrics.storeProfit,
    metrics.storeMarketShare,
    metrics.storeUnitsPurchased,
    metrics.storeWholesaleSpend,
    metrics.storeUnitsSoldRetail,
    metrics.storeRevenue,
    metrics.storeSupplierCount,
    metrics.storeTopSupplierSpendShare,
  );
  for (const storeId of storeIds) {
    rows.push({
      sessionId,
      round: String(metrics.round),
      entityType: "store",
      entityId: storeId,
      profit: numberToCell(metrics.storeProfit[storeId]),
      marketShare: numberToCell(metrics.storeMarketShare[storeId]),
      unitsProduced: "",
      unitsSoldWholesale: "",
      revenue: numberToCell(metrics.storeRevenue[storeId]),
      unitsPurchased: numberToCell(metrics.storeUnitsPurchased[storeId]),
      wholesaleSpend: numberToCell(metrics.storeWholesaleSpend[storeId]),
      unitsSoldRetail: numberToCell(metrics.storeUnitsSoldRetail[storeId]),
      supplierCount: numberToCell(metrics.storeSupplierCount[storeId]),
      topSupplierSpendShare: numberToCell(metrics.storeTopSupplierSpendShare[storeId]),
      householdSpend: "",
      unitsBought: "",
      categoryCount: "",
      topCategorySpendShare: "",
      essentialCategoriesMissed: "",
      ...roundTotals,
    });
  }

  const householdIds = unionParticipantIds(
    metrics.householdSpend,
    metrics.householdUnitsBought,
    metrics.householdCategoryCount,
    metrics.householdTopCategorySpendShare,
    metrics.householdEssentialCategoriesMissed,
  );
  for (const householdId of householdIds) {
    const missed: ProductCategoryId[] | undefined = metrics.householdEssentialCategoriesMissed[householdId];
    rows.push({
      sessionId,
      round: String(metrics.round),
      entityType: "household",
      entityId: householdId,
      profit: "",
      marketShare: "",
      unitsProduced: "",
      unitsSoldWholesale: "",
      revenue: "",
      unitsPurchased: "",
      wholesaleSpend: "",
      unitsSoldRetail: "",
      supplierCount: "",
      topSupplierSpendShare: "",
      householdSpend: numberToCell(metrics.householdSpend[householdId]),
      unitsBought: numberToCell(metrics.householdUnitsBought[householdId]),
      categoryCount: numberToCell(metrics.householdCategoryCount[householdId]),
      topCategorySpendShare: numberToCell(metrics.householdTopCategorySpendShare[householdId]),
      essentialCategoriesMissed: (missed ?? []).join(","),
      ...roundTotals,
    });
  }

  return rows;
}
