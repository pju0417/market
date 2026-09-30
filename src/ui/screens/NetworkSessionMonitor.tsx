import { useEffect, useMemo, useRef, useState } from "react";
import { SessionClient, type FetchLike, type PlayerSlot, type StateResult } from "../network/sessionClient.js";
import { translateNetworkError } from "../network/errorMessages.js";
import { computeUnsubmittedParticipants } from "../network/submissionStatus.js";
import { PHASE_LABELS } from "../labels.js";

/**
 * Milestone 4 3단계("제출 타임아웃, 제출현황 UI, 담합 방지 재검증") 확인용 최소 컴포넌트다.
 *
 * 중요: 기존 로컬 1인 플레이 경로(App.tsx, useGameSession.ts, CompanyTurnScreen/
 * StoreTurnScreen/HouseholdTurnScreen)와 완전히 분리되어 있고, 이번 단계에서는 그 화면들에
 * 배선하지 않는다 — 다인원 로비(Milestone 4 4단계)에서 이 컴포넌트를 재사용할 예정이다
 * (docs/DECISIONS.md D-029).
 *
 * 교사 토큰은 `sessionStorage`에 저장한다(`localStorage`가 아님 — 탭 간 세션/토큰 공유를
 * 막고, `LocalStorageAdapter`가 쓰는 고정 키와 충돌하지 않기 위함).
 */

const POLL_INTERVAL_MS = 5_000;
const CLOCK_TICK_MS = 1_000;

function teacherTokenStorageKey(sessionId: string): string {
  return `economy-game:network-monitor:teacher-token:${sessionId}`;
}

/** 4단계에서 join 직후 교사 토큰을 저장할 때 재사용할 수 있도록 export한다. */
export function storeTeacherToken(sessionId: string, teacherToken: string): void {
  window.sessionStorage.setItem(teacherTokenStorageKey(sessionId), teacherToken);
}

function loadTeacherToken(sessionId: string): string | undefined {
  return window.sessionStorage.getItem(teacherTokenStorageKey(sessionId)) ?? undefined;
}

/** 이 컴포넌트가 실제로 호출하는 메서드만 담은 최소 구조적 타입 (Milestone 5 3부 화면 배선).
 * `SessionClient`와 `AppsScriptSessionClient` 양쪽 모두 이 타입을 구조적으로 만족하므로, 교사가
 * 어느 백엔드로 세션을 만들었는지에 따라 그 클라이언트를 그대로 넘길 수 있다. */
export interface SessionMonitorClient {
  getSlots(sessionId: string): Promise<PlayerSlot[]>;
  getState(sessionId: string, since?: number): ReturnType<SessionClient["getState"]>;
  forceAdvance(sessionId: string, teacherToken: string): Promise<{ ok: true; gameOver?: boolean }>;
}

interface Props {
  sessionId: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** 생략하면 기존 그대로 내부에서 로컬 서버용 `SessionClient`를 새로 만든다 — 이 prop은
   * Apps Script 백엔드 등 다른 클라이언트를 써야 하는 화면(`AppsScriptTeacherSessionScreen`)만
   * 넘긴다. `TeacherSessionScreen.tsx`(로컬 서버 전용)는 이 prop을 넘기지 않으므로 동작이
   * 한 글자도 바뀌지 않는다. */
  client?: SessionMonitorClient;
}

export function NetworkSessionMonitor({ sessionId, baseUrl = "", fetchImpl, client: injectedClient }: Props) {
  const localClient = useMemo(() => new SessionClient(baseUrl, fetchImpl), [baseUrl, fetchImpl]);
  const client = injectedClient ?? localClient;
  const [slots, setSlots] = useState<PlayerSlot[]>([]);
  const [stateResult, setStateResult] = useState<StateResult | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [teacherToken] = useState<string | undefined>(() => loadTeacherToken(sessionId));
  // 서버는 phase 시작 "시각"(phaseStartedAt) 자체를 API로 노출하지 않으므로, 이 값은 "이
  // 화면이 phase 전환을 처음 관찰한 시각" 기준의 추정치다 — 실제 타임아웃 판정은 서버
  // (`sessionRegistry.syncPhaseTimer`)가 별도로 하고, 이 카운트다운은 참고용 표시일 뿐이다.
  // 다만 얼마짜리 타임아웃인지/활성화 여부는(D-036부터 세션마다 다를 수 있음)
  // `GET /state`의 `submissionTimeout`을 그대로 쓴다 — 예전에는 고정 상수
  // `DEFAULT_SUBMISSION_TIMEOUT_MS`(120초)를 항상 표시해, 교사가 커스텀 시간을 설정하거나
  // 타임아웃 자체를 꺼도 화면에는 반영되지 않는 버그가 있었다(실제 다인원 브라우저 검증
  // 중 발견).
  const phaseObservedAtRef = useRef<{ phase: string; observedAt: number } | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    client
      .getSlots(sessionId)
      .then((result) => {
        if (!cancelled) setSlots(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(translateNetworkError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionId]);

  useEffect(() => {
    let cancelled = false;
    let sinceVersion: number | undefined;
    let inFlight = false;

    async function poll(): Promise<void> {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const result = await client.getState(sessionId, sinceVersion);
        if (cancelled) return;
        if (!("unchanged" in result)) {
          sinceVersion = result.version;
          setStateResult(result);
        }
      } catch (err) {
        if (!cancelled) setError(translateNetworkError(err));
      } finally {
        inFlight = false;
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [client, sessionId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  const currentPhase = stateResult?.state.currentPhase;
  if (currentPhase !== undefined && phaseObservedAtRef.current?.phase !== currentPhase) {
    phaseObservedAtRef.current = { phase: currentPhase, observedAt: Date.now() };
  }

  const timeoutSettings = stateResult?.submissionTimeout;
  const remainingMs =
    phaseObservedAtRef.current && timeoutSettings?.enabled
      ? Math.max(0, timeoutSettings.timeoutMs - (now - phaseObservedAtRef.current.observedAt))
      : undefined;

  const unsubmitted = stateResult
    ? computeUnsubmittedParticipants(slots, stateResult.unsubmittedParticipantIds, stateResult.state.currentPhase)
    : [];

  async function handleForceAdvance(): Promise<void> {
    if (!teacherToken) return;
    try {
      await client.forceAdvance(sessionId, teacherToken);
    } catch (err) {
      setError(translateNetworkError(err));
    }
  }

  return (
    <div className="card">
      <h2>네트워크 세션 모니터 (확인용)</h2>
      {error && <p className="empty-note">{error}</p>}
      {!stateResult ? (
        <p className="empty-note">상태를 불러오는 중...</p>
      ) : (
        <>
          <p>
            현재 단계: <strong>{PHASE_LABELS[stateResult.state.currentPhase]}</strong> ({stateResult.state.currentRound}
            라운드)
          </p>
          {timeoutSettings && !timeoutSettings.enabled && <p>제출 제한시간: 사용 안 함</p>}
          {remainingMs !== undefined && <p>남은 시간(추정): {Math.ceil(remainingMs / 1000)}초</p>}
          <p>
            제출 현황:{" "}
            {stateResult.gameOver
              ? "게임 종료"
              : unsubmitted.length === 0
                ? "전원 제출 완료"
                : `미제출 ${unsubmitted.length}명 (${unsubmitted.map((p) => p.displayName).join(", ")})`}
          </p>
          {!stateResult.gameOver && stateResult.lobby.open && (
            <p className="empty-note">
              로비가 아직 열려있어요 — "지금 진행"은 로비가 닫힌 뒤에 쓸 수 있어요. 서두르려면
              교사 화면의 "로비 지금 닫기"를 먼저 눌러주세요.
            </p>
          )}
          {teacherToken && !stateResult.gameOver && !stateResult.lobby.open && (
            <button className="secondary" onClick={() => void handleForceAdvance()}>
              지금 진행
            </button>
          )}
        </>
      )}
    </div>
  );
}
