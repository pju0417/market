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

export interface SessionEntry {
  session: GameSession;
  tokens: TokenStore;
}

const sessions = new Map<string, SessionEntry>();

export function createSession(studentCount: number, rngSeed?: number): { sessionId: string; entry: SessionEntry } {
  const sessionId = randomUUID();
  const session = new GameSession(rngSeed ?? Date.now(), undefined, undefined, studentCount);
  const entry: SessionEntry = { session, tokens: new TokenStore() };
  sessions.set(sessionId, entry);
  return { sessionId, entry };
}

export function getSession(sessionId: string): SessionEntry | undefined {
  return sessions.get(sessionId);
}
