/**
 * 네트워크 세션을 폴링하는 훅 (Milestone 4 4-b). `NetworkSessionMonitor.tsx`가 이미 쓰는
 * 폴링 패턴(useState+useEffect+setInterval, `since` 버전 추적)을 그대로 따른다. 로컬 전용
 * `useGameSession.ts`(useSyncExternalStore 기반)와는 완전히 별도이며 서로 의존하지 않는다.
 */
import { useEffect, useState } from "react";
import type { SessionClient, StateResult } from "./sessionClient.js";

const POLL_INTERVAL_MS = 3_000;

export function useNetworkGameSession(
  client: SessionClient,
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
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
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
