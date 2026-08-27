import { useCallback, useState, useSyncExternalStore } from "react";
import { GameSession, type BusinessSetupChoices } from "../multiplayer/GameSession.js";
import { LocalStorageAdapter } from "../storage/LocalStorageAdapter.js";
import type { GameState } from "../types/domain.js";

export type GameInit = { rngSeed: number; choices: BusinessSetupChoices } | { resumeState: GameState };

/**
 * `GameSession`(경제 엔진 계층)이 유일한 진실 공급원이다 — 이 훅은 구독만 하고 상태를
 * 복제하지 않는다 (docs/DECISIONS.md D-020, "UI는 useSyncExternalStore로 구독만 한다").
 *
 * 중요: `GameState`는 phase마다 제자리에서 갱신되고 새 객체로 교체되지 않으므로,
 * `session.getState()`를 스냅샷 값으로 직접 쓰면 참조가 항상 같아 React가 변경을 못
 * 감지한다. 그래서 `session.getVersion()`(매 변경마다 증가하는 카운터)을 스냅샷으로 쓰고,
 * 실제 상태는 리렌더된 함수 본문에서 `session.getState()`로 따로 읽는다.
 *
 * `init`은 세션을 처음 만들 때만 쓰이고, 이후 값이 바뀌어도 세션을 다시 만들지 않는다
 * (게임 중간에 창업 조건이 바뀌면 안 되므로) — lazy useState 초기화가 이를 보장한다.
 * 세션이 만들어지면 항상 `window.localStorage`로 자동 저장을 켠다 (Milestone 2).
 */
export function useGameSession(init: GameInit) {
  const [session] = useState(() => {
    const s = "resumeState" in init ? GameSession.resumeFromState(init.resumeState) : new GameSession(init.rngSeed, init.choices);
    s.enableAutoSave(new LocalStorageAdapter(window.localStorage));
    return s;
  });
  const subscribe = useCallback((onChange: () => void) => session.subscribe(onChange), [session]);
  const getVersion = useCallback(() => session.getVersion(), [session]);
  useSyncExternalStore(subscribe, getVersion);

  return { session, state: session.getState() };
}
