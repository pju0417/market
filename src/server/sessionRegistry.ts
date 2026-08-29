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
import type { RoundPhase } from "../types/domain.js";

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
}

const sessions = new Map<string, SessionEntry>();

export function createSession(studentCount: number, rngSeed?: number): { sessionId: string; entry: SessionEntry } {
  const sessionId = randomUUID();
  const session = new GameSession(rngSeed ?? Date.now(), undefined, undefined, studentCount);
  const entry: SessionEntry = {
    session,
    tokens: new TokenStore(),
    teacherToken: randomUUID(),
    phaseStartedAt: Date.now(),
    lastObservedPhase: session.getState().currentPhase,
  };
  sessions.set(sessionId, entry);
  return { sessionId, entry };
}

export function getSession(sessionId: string): SessionEntry | undefined {
  return sessions.get(sessionId);
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
