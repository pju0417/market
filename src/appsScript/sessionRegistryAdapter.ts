/**
 * `src/server/httpApi.ts`가 내부적으로 import하는 `./sessionRegistry.js`를 대신할 수 있도록,
 * 그 파일과 정확히 같은 이름/호출 시그니처의 값들을 내보내는 어댑터 (Milestone 5 2부,
 * D-032). `scripts/build-apps-script.ts`가 esbuild `onResolve` 훅으로 `httpApi.ts`의
 * `./sessionRegistry.js` 임포트를 이 파일로 치환한다 — `httpApi.ts` 소스는 한 글자도 바뀌지
 * 않는다(이 alias는 esbuild 번들링 시점에만 적용되고, `npm run typecheck`/vitest에는 전혀
 * 영향을 주지 않는다 — `httpApi.ts`는 계속 진짜 `src/server/sessionRegistry.ts`를 참조한
 * 채로 타입체크된다).
 *
 * Apps Script는 요청마다 실행 컨텍스트가 사라지므로(`gasSessionStore.ts` 참고), 이 어댑터는
 * `createSession`/`getSession`이 호출될 때마다 시트에서 읽어 세션을 구성하고, 요청이 끝나면
 * (`dispatch.ts`가 호출하는 `flushSessionRegistryAdapter`) 다시 시트에 쓴다. 이 프로젝트의
 * API는 한 요청이 세션을 최대 하나만 다룬다는 전제(`createSession`/`getSession`을 한 번만
 * 호출)를 따르므로, "이번 요청에서 마지막으로 다룬 세션 하나"만 기억했다가 flush하는 것으로
 * 충분하다.
 *
 * **실제 시트 왕복 동작 자체는 이 프로젝트에서 검증할 수 없다** — esbuild alias는 빌드
 * 시점에만 적용되고 vitest에는 적용되지 않으므로, 로컬 테스트는 이 어댑터의 함수를 가짜
 * `SpreadsheetGateway`로 직접 호출해 로직만 검증할 뿐(`tests/appsScript/sessionRegistryAdapter.test.ts`),
 * 진짜 `httpApi.ts`와 함께 번들된 상태에서 동작하는지는 실제 Apps Script 배포 전까지 확인
 * 불가능하다.
 */
import type { GameSession, SubmissionTimeoutSettings } from "../multiplayer/GameSession.js";
import type { SpreadsheetGateway, UuidGenerator } from "./hostInterfaces.js";
import * as gasSessionStore from "./gasSessionStore.js";
import { issueToken, resolvePlayerId } from "./gasTokenStore.js";
import type { ParticipantId, RoundPhase } from "../types/domain.js";

/** `src/server/tokenStore.ts`의 `TokenStore`와 구조적으로 동일한 메서드만 노출한다. */
export interface TokenBridge {
  issue(playerId: ParticipantId): string;
  resolvePlayerId(token: string): ParticipantId | undefined;
}

/** `src/server/sessionRegistry.ts`의 `SessionEntry`와 같은 필드 이름/의미를 갖는다
 * (`tokens`만 `TokenStore` 인스턴스 대신 시트 기반 `TokenBridge`). */
export interface SessionEntry {
  session: GameSession;
  tokens: TokenBridge;
  teacherToken: string;
  phaseStartedAt: number;
  lastObservedPhase: RoundPhase;
  lobbySubmittedPlayerIds: Set<ParticipantId>;
  lobbyStartedAt: number;
  lobbyClosedByTeacher: boolean;
  lobbyTimerConsumed: boolean;
}

let configuredGateway: SpreadsheetGateway | undefined;
let configuredUuidGen: UuidGenerator | undefined;
/** 이번 요청에서 마지막으로 다룬 세션. `configureSessionRegistryAdapter`가 매 요청 시작마다
 * 초기화하고, `createSession`/`getSession`이 호출될 때마다 갱신된다. */
let lastTouchedSession: { sessionId: string; entry: SessionEntry } | undefined;

/** `dispatch.ts`가 요청 하나를 처리하기 직전에 호출해, 이번 요청에서 쓸 게이트웨이/uuid
 * 생성기를 주입하고 이전 요청의 흔적을 지운다. */
export function configureSessionRegistryAdapter(gateway: SpreadsheetGateway, uuidGen: UuidGenerator): void {
  configuredGateway = gateway;
  configuredUuidGen = uuidGen;
  lastTouchedSession = undefined;
}

/** `dispatch.ts`가 `handleApiRequest` 호출이 끝난 직후 호출해, 이번 요청에서 다룬 세션을
 * (있다면) 시트에 다시 쓴다. */
export function flushSessionRegistryAdapter(): void {
  if (configuredGateway && lastTouchedSession) {
    gasSessionStore.saveSession(configuredGateway, lastTouchedSession.sessionId, toGasEntry(lastTouchedSession.entry));
  }
  lastTouchedSession = undefined;
}

function requireGateway(): SpreadsheetGateway {
  if (!configuredGateway) {
    throw new Error("sessionRegistryAdapter is not configured — call configureSessionRegistryAdapter first");
  }
  return configuredGateway;
}

function requireUuidGen(): UuidGenerator {
  if (!configuredUuidGen) {
    throw new Error("sessionRegistryAdapter is not configured — call configureSessionRegistryAdapter first");
  }
  return configuredUuidGen;
}

function toGasEntry(entry: SessionEntry): gasSessionStore.SessionEntry {
  return {
    session: entry.session,
    teacherToken: entry.teacherToken,
    phaseStartedAt: entry.phaseStartedAt,
    lastObservedPhase: entry.lastObservedPhase,
    lobbySubmittedPlayerIds: entry.lobbySubmittedPlayerIds,
    lobbyStartedAt: entry.lobbyStartedAt,
    lobbyClosedByTeacher: entry.lobbyClosedByTeacher,
    lobbyTimerConsumed: entry.lobbyTimerConsumed,
  };
}

function wrapEntry(sessionId: string, gasEntry: gasSessionStore.SessionEntry): SessionEntry {
  const gateway = requireGateway();
  const uuidGen = requireUuidGen();
  const entry: SessionEntry = {
    ...gasEntry,
    tokens: {
      issue: (playerId) => issueToken(gateway, uuidGen, sessionId, playerId),
      resolvePlayerId: (token) => resolvePlayerId(gateway, sessionId, token),
    },
  };
  lastTouchedSession = { sessionId, entry };
  return entry;
}

/**
 * `timeoutSettings`를 반드시 `gasSessionStore.createSession`까지 전달해야 한다 —
 * 이 세 번째 인자를 빠뜨리면(구매 매칭 알고리즘 재설계 Stage 2, code-reviewer가 실제
 * 번들 산출물에서 재현해 발견한 critical 버그) `httpApi.ts`가 교사 설정을 넘겨도 esbuild가
 * 이 어댑터로 alias한 시점에 조용히 버려지고, 모든 Apps Script 세션이
 * `GameSession`의 로컬 1인 플레이 기본값(`enabled: false`)으로 떨어져 제출 타임아웃
 * 강제진행이 아예 작동하지 않게 된다.
 */
export function createSession(
  studentCount: number,
  rngSeed?: number,
  timeoutSettings?: SubmissionTimeoutSettings,
): { sessionId: string; entry: SessionEntry } {
  const gateway = requireGateway();
  const uuidGen = requireUuidGen();
  const { sessionId, entry: gasEntry } = gasSessionStore.createSession(gateway, uuidGen, studentCount, rngSeed, timeoutSettings);
  return { sessionId, entry: wrapEntry(sessionId, gasEntry) };
}

export function getSession(sessionId: string): SessionEntry | undefined {
  const gateway = requireGateway();
  const gasEntry = gasSessionStore.getSession(gateway, sessionId);
  if (!gasEntry) return undefined;
  return wrapEntry(sessionId, gasEntry);
}

export function isLobbyOpen(entry: SessionEntry): boolean {
  return gasSessionStore.isLobbyOpen(entry);
}

export function markLobbyClosedIfNeeded(entry: SessionEntry): boolean {
  return gasSessionStore.markLobbyClosedIfNeeded(entry);
}

export function syncPhaseTimer(entry: SessionEntry): void {
  gasSessionStore.syncPhaseTimer(entry);
}
