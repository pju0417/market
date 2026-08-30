/**
 * Apps Script용 세션 저장소 (Milestone 5 1부, D-032). `src/server/sessionRegistry.ts`(로컬
 * 폴링 서버, 참고만 함 — 그대로 베끼지 않음)와 같은 역할을 하지만, Apps Script는 요청마다
 * 실행 컨텍스트가 완전히 사라지는 무상태 모델이므로 인메모리 `Map`으로 세션을 들고 있을 수
 * 없다. 대신 매 함수 호출마다 `SpreadsheetGateway`에서 읽어(hydrate) `GameSession`을
 * 재구성하고, 호출자가 로직을 실행한 뒤 명시적으로 다시 써야(flush) 한다.
 *
 * **중요**: 이 파일 자체는 자동 저장을 하지 않는다. `getSession`으로 읽어 로직을 실행한
 * 다음 반드시 `saveSession`으로 다시 쓰는 것은 호출자(다음 작업의 dispatch/`httpApi`
 * 계층)의 책임이다 — `saveSession`을 호출하지 않으면 이번 요청에서 일어난 변화(제출값,
 * phase 진행, 로비 상태)는 전부 사라진다.
 */
import { GameSession, type PendingSubmissionsSnapshot } from "../multiplayer/GameSession.js";
import type { SpreadsheetGateway, UuidGenerator } from "./hostInterfaces.js";
import {
  buildRoundSummaryRows,
  deserializeLiveState,
  deserializeRoundMetrics,
  LIVE_STATE_SHEET,
  PENDING_SUBMISSIONS_SHEET,
  ROUND_METRICS_SHEET,
  ROUND_SUMMARY_SHEET,
  serializeLiveState,
  serializeRoundMetrics,
  SESSIONS_SHEET,
} from "./sheetSchema.js";
import type { ParticipantId, RoundPhase } from "../types/domain.js";

/** 로비(창업 준비) 타임아웃. 로컬 서버(D-030, `DEFAULT_LOBBY_TIMEOUT_MS`)와 같은 값이지만,
 * `src/appsScript`는 `src/server`에 의존하지 않는다는 원칙(D-032)에 따라 독립적으로 둔다. */
export const DEFAULT_LOBBY_TIMEOUT_MS = 180_000;

export interface SessionEntry {
  session: GameSession;
  /** 교사 전용 수동 강제진행 토큰. 세션 생성 시 1회 발급된다. */
  teacherToken: string;
  /** 현재 phase가 시작된 시각(ms). 제출 타임아웃 판정의 기준점. */
  phaseStartedAt: number;
  /** 마지막으로 관찰한 phase. `syncPhaseTimer`가 phase 전환을 감지하는 데만 쓴다. */
  lastObservedPhase: RoundPhase;
  /** 창업 준비(로비)를 제출한 학생 id들. */
  lobbySubmittedPlayerIds: Set<ParticipantId>;
  /** 세션이 생성된 시각(ms). 로비 타임아웃 판정의 기준점. */
  lobbyStartedAt: number;
  /** 교사가 명시적으로 로비를 닫았는지. */
  lobbyClosedByTeacher: boolean;
  /** 로비가 닫히는 순간 company-turn의 `phaseStartedAt`을 한 번 리셋했는지. */
  lobbyTimerConsumed: boolean;
}

function serializeIdSet(ids: ReadonlySet<ParticipantId>): string {
  return [...ids].join(",");
}

function deserializeIdSet(value: string | undefined): Set<ParticipantId> {
  if (value === undefined || value === "") return new Set();
  return new Set(value.split(","));
}

function serializeBool(value: boolean): string {
  return value ? "true" : "false";
}

function deserializeBool(value: string | undefined): boolean {
  return value === "true";
}

function readRoundMetricsForSession(gateway: SpreadsheetGateway, sessionId: string) {
  return gateway
    .readRows(ROUND_METRICS_SHEET)
    .filter((row) => row.sessionId === sessionId)
    .map((row) => deserializeRoundMetrics(row.json!))
    .sort((a, b) => a.round - b.round);
}

/** 새 세션을 만든다. 시트에는 아직 아무것도 쓰지 않는다 — 호출자가 `saveSession`으로 처음
 * 저장해야 한다(다른 모든 변경과 동일한 hydrate→로직→flush 패턴을 유지하기 위함). */
export function createSession(
  gateway: SpreadsheetGateway,
  uuidGen: UuidGenerator,
  studentCount: number,
  rngSeed?: number,
): { sessionId: string; entry: SessionEntry } {
  const sessionId = uuidGen();
  const session = new GameSession(rngSeed ?? Date.now(), undefined, undefined, studentCount);
  const entry: SessionEntry = {
    session,
    teacherToken: uuidGen(),
    phaseStartedAt: Date.now(),
    lastObservedPhase: session.getState().currentPhase,
    lobbySubmittedPlayerIds: new Set(),
    lobbyStartedAt: Date.now(),
    lobbyClosedByTeacher: false,
    lobbyTimerConsumed: false,
  };
  return { sessionId, entry };
}

/**
 * `sessionId`에 해당하는 세션을 시트에서 읽어 `GameSession`을 재구성한다. Sessions 행,
 * LiveState 행, 그 세션의 모든 RoundMetrics 행, PendingSubmissions 행을 모두 읽어
 * `GameSession.resumeFromState(state, pending)`로 재구성한다. 어느 하나라도 없으면(세션이
 * 존재하지 않으면) `undefined`를 반환한다.
 */
export function getSession(gateway: SpreadsheetGateway, sessionId: string): SessionEntry | undefined {
  const sessionRow = gateway.findRow(SESSIONS_SHEET, "sessionId", sessionId);
  if (!sessionRow) return undefined;
  const liveStateRow = gateway.findRow(LIVE_STATE_SHEET, "sessionId", sessionId);
  if (!liveStateRow) return undefined;

  const roundMetrics = readRoundMetricsForSession(gateway, sessionId);
  const state = deserializeLiveState(liveStateRow.json!, roundMetrics);

  const pendingRow = gateway.findRow(PENDING_SUBMISSIONS_SHEET, "sessionId", sessionId);
  const pending: PendingSubmissionsSnapshot | undefined = pendingRow
    ? (JSON.parse(pendingRow.json!) as PendingSubmissionsSnapshot)
    : undefined;

  const session = GameSession.resumeFromState(state, pending);

  return {
    session,
    teacherToken: sessionRow.teacherToken!,
    phaseStartedAt: Number(sessionRow.phaseStartedAt),
    lastObservedPhase: sessionRow.lastObservedPhase as RoundPhase,
    lobbySubmittedPlayerIds: deserializeIdSet(sessionRow.lobbySubmittedPlayerIds),
    lobbyStartedAt: Number(sessionRow.lobbyStartedAt),
    lobbyClosedByTeacher: deserializeBool(sessionRow.lobbyClosedByTeacher),
    lobbyTimerConsumed: deserializeBool(sessionRow.lobbyTimerConsumed),
  };
}

/**
 * `entry`(및 그 안의 `entry.session`)의 현재 상태를 시트에 다시 쓴다. `getSession`으로 읽은
 * 뒤 로직을 실행하고 이 함수를 호출하는 것은 전적으로 호출자의 책임이다 — 이 파일은 어떤
 * 경로에서도 자동으로 이 함수를 부르지 않는다.
 */
export function saveSession(gateway: SpreadsheetGateway, sessionId: string, entry: SessionEntry): void {
  const state = entry.session.getState();

  gateway.upsertRow(LIVE_STATE_SHEET, "sessionId", sessionId, {
    sessionId,
    json: serializeLiveState(state),
  });

  const alreadyStoredRounds = new Set(
    gateway
      .readRows(ROUND_METRICS_SHEET)
      .filter((row) => row.sessionId === sessionId)
      .map((row) => row.round),
  );
  for (const metrics of state.roundMetrics) {
    const roundKey = String(metrics.round);
    if (alreadyStoredRounds.has(roundKey)) continue;
    gateway.appendRow(ROUND_METRICS_SHEET, {
      sessionId,
      round: roundKey,
      json: serializeRoundMetrics(metrics),
    });
    // 사람이 읽는 파생 데이터(엔진이 다시 읽지 않음, GOOGLE_SHEETS_ARCHITECTURE.md의
    // "교사가 확인 가능한 기록" 목표) — 같은 "새 라운드가 처음 확정된 순간"에만 append해
    // 위 ROUND_METRICS_SHEET와 정확히 같은 조건으로 중복 기록을 막는다.
    for (const row of buildRoundSummaryRows(sessionId, metrics)) {
      gateway.appendRow(ROUND_SUMMARY_SHEET, row);
    }
  }

  gateway.upsertRow(PENDING_SUBMISSIONS_SHEET, "sessionId", sessionId, {
    sessionId,
    json: JSON.stringify(entry.session.exportPendingSubmissions()),
  });

  gateway.upsertRow(SESSIONS_SHEET, "sessionId", sessionId, {
    sessionId,
    teacherToken: entry.teacherToken,
    phaseStartedAt: String(entry.phaseStartedAt),
    lastObservedPhase: entry.lastObservedPhase,
    lobbySubmittedPlayerIds: serializeIdSet(entry.lobbySubmittedPlayerIds),
    lobbyStartedAt: String(entry.lobbyStartedAt),
    lobbyClosedByTeacher: serializeBool(entry.lobbyClosedByTeacher),
    lobbyTimerConsumed: serializeBool(entry.lobbyTimerConsumed),
  });
}

/**
 * 다인원 로비(창업 준비)가 아직 열려 있는지. 교사가 명시적으로 닫았거나, 전원이
 * 제출했거나, 시간 초과(`DEFAULT_LOBBY_TIMEOUT_MS`)면 닫힌 것으로 취급한다(로컬
 * 서버 D-030과 같은 로직).
 */
export function isLobbyOpen(entry: SessionEntry): boolean {
  if (entry.lobbyClosedByTeacher) return false;
  const allPlayerIds = entry.session.getPlayers().map((p) => p.id);
  const everyoneSubmitted = allPlayerIds.every((id) => entry.lobbySubmittedPlayerIds.has(id));
  if (everyoneSubmitted) return false;
  if (Date.now() - entry.lobbyStartedAt > DEFAULT_LOBBY_TIMEOUT_MS) return false;
  return true;
}

/**
 * 로비가 방금 닫혔을 때(전원 제출 완료/교사 강제종료/시간초과 중 무엇이든) 딱 한 번만
 * company-turn의 `phaseStartedAt`을 다시 시작하고, 그때까지 `/setup`을 제출하지 않은
 * 학생을 세션의 "사람 입력을 기다려야 할 참가자" 목록에서 영구히 제거한다(D-031과 동일한
 * 패턴). 멱등이며, 처음 닫히는 순간에만 `true`를 반환한다.
 */
export function markLobbyClosedIfNeeded(entry: SessionEntry): boolean {
  if (entry.lobbyTimerConsumed) return false;
  entry.lobbyTimerConsumed = true;
  entry.phaseStartedAt = Date.now();
  entry.session.finalizeLobbyMembership(entry.lobbySubmittedPlayerIds);
  return true;
}

/**
 * 현재 phase가 `lastObservedPhase`와 다르면 타이머를 리셋한다(phase가 실제로 바뀌었을
 * 때만 — 부분 제출로는 리셋되지 않는다, D-029와 동일한 로직).
 */
export function syncPhaseTimer(entry: SessionEntry): void {
  const currentPhase = entry.session.getState().currentPhase;
  if (currentPhase !== entry.lastObservedPhase) {
    entry.phaseStartedAt = Date.now();
    entry.lastObservedPhase = currentPhase;
  }
}
