/**
 * `useNetworkGameSession.ts`의 Apps Script 자매 훅 (Milestone 5 3부 화면 배선). 폴링 로직은
 * 완전히 동일하고, 클라이언트 타입만 `AppsScriptSessionClient`로 교체한다. `StateResult`/
 * `translateNetworkError`는 로컬 서버용과 동일한 것을 그대로 재사용한다 — 두 클라이언트의
 * `getState` 응답 모양(`StateResult`)이 같기 때문이다.
 */
import { useEffect, useState } from "react";
import type { AppsScriptSessionClient } from "./appsScriptSessionClient.js";
import type { StateResult } from "./sessionClient.js";
import { translateNetworkError } from "./errorMessages.js";

const POLL_INTERVAL_MS = 3_000;

export function useAppsScriptGameSession(
  client: AppsScriptSessionClient,
  sessionId: string,
): { stateResult: StateResult | undefined; error: string | undefined } {
  const [stateResult, setStateResult] = useState<StateResult | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let sinceVersion: number | undefined;

    async function poll(): Promise<void> {
      try {
        const result = await client.getState(sessionId, sinceVersion);
        if (cancelled) return;
        if (!("unchanged" in result)) {
          sinceVersion = result.version;
          setStateResult(result);
        }
        setError(undefined);
      } catch (err) {
        if (!cancelled) setError(translateNetworkError(err));
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [client, sessionId]);

  return { stateResult, error };
}
