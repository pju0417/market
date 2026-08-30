/**
 * 여러 GameSession을 동시에 들 수 있는 레지스트리 (Milestone 4 2단계).
 *
 * 교사 1명당 세션 1개인지, 여러 학급을 동시에 지원해야 하는지는 아직 정해지지 않았다 —
 * `Map` 기반으로 만들어 두면 구현 비용이 거의 안 들면서, 나중에 단일 세션으로 좁히는 것도
 * 쉬우므로 이 방식을 택했다(사용자 확정 선택지 2번).
 */
import { randomUUID } from "node:crypto";
import { GameSession } from "../multiplayer/GameSession.js";
import { TokenStore } from "./tokenStore.js";
import { DEFAULT_LOBBY_TIMEOUT_MS } from "./timeoutConfig.js";
import type { ParticipantId, RoundPhase } from "../types/domain.js";

export interface SessionEntry {
  session: GameSession;
  tokens: TokenStore;
  /** 교사 전용 수동 강제진행 토큰. 세션 생성 시 1회 발급되고, `POST /api/sessions`의 응답에만
   * 노출된다 — 재조회 엔드포인트(`GET /slots` 등)에는 절대 실리지 않는다 (D-029). */
  teacherToken: string;
  /** 현재 phase가 시작된 시각(ms). 제출 타임아웃 판정의 기준점. */
  phaseStartedAt: number;
  /** 마지막으로 관찰한 phase. `syncPhaseTimer`가 phase 전환을 감지하는 데만 쓴다. */
  lastObservedPhase: RoundPhase;
  /** 창업 준비(로비)를 제출한 학생 id들 (Milestone 4 4단계, D-030). */
  lobbySubmittedPlayerIds: Set<ParticipantId>;
  /** 세션이 생성된 시각(ms). 로비 타임아웃(`DEFAULT_LOBBY_TIMEOUT_MS`) 판정의 기준점. */
  lobbyStartedAt: number;
  /** 교사가 `/close-lobby`로 명시적으로 로비를 닫았는지. 전원 제출/시간초과와 무관하게
   * 이 값이 true면 `isLobbyOpen`은 무조건 false를 반환한다. */
  lobbyClosedByTeacher: boolean;
  /**
   * 로비가 닫히는 순간 company-turn의 `phaseStartedAt`을 한 번 리셋했는지 (Milestone 4
   * 4단계, code-reviewer 발견 버그 수정). 로비 타임아웃(180초)이 제출 타임아웃(120초)보다
   * 길어서, 로비가 오래 걸리면 `phaseStartedAt`(세션 생성 시각부터 흐름)이 로비가 닫히기도
   * 전에 이미 지나가 버려 학생들이 창업 준비를 마칠 기회조차 없이 봇으로 대체되는 문제가
   * 있었다 — `checkAndApplyTimeout`이 로비가 열려있는 동안은 강제진행을 아예 건너뛰고, 로비가
   * 닫히는 바로 그 순간 이 플래그로 한 번만 시계를 다시 시작한다.
   */
  lobbyTimerConsumed: boolean;
}

const sessions = new Map<string, SessionEntry>();

/**
 * 세션 코드에 쓰는 문자 집합 (Milestone 4 6단계(2부)). 대문자+숫자에서 헷갈리기 쉬운
 * 0/O, 1/I를 제외했다 — 초등학생이 교사가 불러주는 코드를 손으로 입력해야 하므로, 참가자
 * 인증 토큰(`randomUUID`, 사람이 안 보고 안 타이핑함)과 달리 짧고 오타 나기 어려운 값이어야
 * 한다. 경제 로직/게임 규칙과 무관한 UX 개선이라 CLAUDE.md 4절 기준 자동 수정 대상이다.
 */
const SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SESSION_CODE_LENGTH = 6;
const MAX_SESSION_CODE_ATTEMPTS = 50;

function generateSessionCode(): string {
  let code = "";
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    code += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
  }
  return code;
}

function generateUniqueSessionId(): string {
  for (let attempt = 0; attempt < MAX_SESSION_CODE_ATTEMPTS; attempt++) {
    const candidate = generateSessionCode();
    if (!sessions.has(candidate)) return candidate;
  }
  throw new Error("failed to generate a unique session code after max attempts");
}

export function createSession(studentCount: number, rngSeed?: number): { sessionId: string; entry: SessionEntry } {
  const sessionId = generateUniqueSessionId();
  const session = new GameSession(rngSeed ?? Date.now(), undefined, undefined, studentCount);
  const entry: SessionEntry = {
    session,
    tokens: new TokenStore(),
    teacherToken: randomUUID(),
    phaseStartedAt: Date.now(),
    lastObservedPhase: session.getState().currentPhase,
    lobbySubmittedPlayerIds: new Set(),
    lobbyStartedAt: Date.now(),
    lobbyClosedByTeacher: false,
    lobbyTimerConsumed: false,
  };
  sessions.set(sessionId, entry);
  return { sessionId, entry };
}

/**
 * 다인원 로비(창업 준비)가 아직 열려 있는지. 전원이 제출했거나(`lobbySubmittedPlayerIds`가
 * 이 세션의 학생 전원을 포함), 교사가 명시적으로 닫았거나(`lobbyClosedByTeacher`), 시간
 * 초과(`DEFAULT_LOBBY_TIMEOUT_MS`)면 닫힌 것으로 취급한다 (D-030).
 */
export function isLobbyOpen(entry: SessionEntry): boolean {
  if (entry.lobbyClosedByTeacher) return false;
  const allPlayerIds = entry.session.getPlayers().map((p) => p.id);
  const everyoneSubmitted = allPlayerIds.every((id) => entry.lobbySubmittedPlayerIds.has(id));
  if (everyoneSubmitted) return false;
  if (Date.now() - entry.lobbyStartedAt > DEFAULT_LOBBY_TIMEOUT_MS) return false;
  return true;
}

export function getSession(sessionId: string): SessionEntry | undefined {
  return sessions.get(sessionId);
}

/**
 * 로비가 방금 닫혔을 때(전원 제출 완료/교사 강제종료/시간초과 중 무엇이든) 딱 한 번만
 * company-turn의 `phaseStartedAt`을 다시 시작한다 — 그렇지 않으면 로비 대기 시간이 그대로
 * 제출 타임아웃 시계에 상속돼, 로비가 오래 걸릴수록 실제 제출 시간이 줄어드는 버그가 생긴다
 * (Milestone 4 4단계, code-reviewer 발견 — `src/server/httpApi.ts`의 `checkAndApplyTimeout`
 * 주석 참고). 로비를 실제로 닫는 지점(`/setup`의 마지막 제출, `/close-lobby`)에서 즉시
 * 호출해 정확한 시점에 리셋하고, `checkAndApplyTimeout`에서도 안전망으로 호출해 시간초과로만
 * 조용히 닫히는 경우(아무도 명시적으로 닫지 않은 경우)까지 커버한다. `lobbyTimerConsumed`
 * 가드 덕분에 두 번째 이후 호출은 아무 일도 하지 않는다.
 *
 * 이제 `phaseStartedAt` 리셋뿐 아니라 학생 멤버십(누구를 사람으로 계속 기다릴지)도 이
 * 시점에 확정한다(Milestone 4 6단계): 로비가 닫히는 그 순간까지 `/setup`을 제출하지 않은
 * 학생을 `entry.session.finalizeLobbyMembership(entry.lobbySubmittedPlayerIds)`로 세션의
 * "사람 입력을 기다려야 할 참가자" 목록에서 제거한다. 이 함수가 "로비가 방금 실제로 닫힌
 * 순간"을 정확히 한 번 감지하는 유일한 지점이므로, 실제 호출부 4곳
 * (`handleSetup`/`handleCloseLobby`/`checkAndApplyTimeout` 안전망/`doForceAdvance`) 전부
 * 이 함수 하나만 거치면 자동으로 적용되고, 각 호출부를 개별로 수정할 필요가 없다.
 *
 * 반환값(`true`면 이번 호출로 실제로 로비가 닫힌 시점을 처음 관찰한 것)은 호출자가
 * `entry.session.bumpVersion()`을 불러야 하는지 판단하는 데 쓴다 — 전원 제출로 자연히
 * 닫히는 경우(`applyBusinessSetupChoices`가 이미 매번 `notify()`를 부름)는 별도 처리가
 * 필요 없지만, 교사가 명시적으로 닫거나(`/close-lobby`) 시간초과로 조용히 닫히는 경우는
 * `GameSession` 상태 자체가 안 바뀌어 `since` 기반 폴링이 그 변화를 놓칠 수 있다(code-reviewer
 * 발견 버그).
 */
export function markLobbyClosedIfNeeded(entry: SessionEntry): boolean {
  if (entry.lobbyTimerConsumed) return false;
  entry.lobbyTimerConsumed = true;
  entry.phaseStartedAt = Date.now();
  entry.session.finalizeLobbyMembership(entry.lobbySubmittedPlayerIds);
  return true;
}

/**
 * 현재 phase가 `lastObservedPhase`와 다르면 타이머를 리셋한다 (phase가 실제로 바뀌었을
 * 때만). 부분 제출(`submitCompanyDecision` 등)은 phase를 바꾸지 않으므로 이 함수를 호출해도
 * 아무 일도 일어나지 않는다 — 그렇지 않으면 참가자가 반복 제출로 다른 참가자의 타임아웃을
 * 무한정 늦출 수 있다 (D-029).
 */
export function syncPhaseTimer(entry: SessionEntry): void {
  const currentPhase = entry.session.getState().currentPhase;
  if (currentPhase !== entry.lastObservedPhase) {
    entry.phaseStartedAt = Date.now();
    entry.lastObservedPhase = currentPhase;
  }
}
