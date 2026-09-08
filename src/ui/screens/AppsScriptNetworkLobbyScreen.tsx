import { useEffect, useState } from "react";
import type { BusinessSetupChoices } from "../../multiplayer/GameSession.js";
import type { PlayerSlot } from "../network/sessionClient.js";
import type { AppsScriptSessionClient } from "../network/appsScriptSessionClient.js";
import { translateNetworkError } from "../network/errorMessages.js";
import { useAppsScriptGameSession } from "../network/useAppsScriptGameSession.js";
import { SetupScreen } from "./SetupScreen.js";

interface Props {
  client: AppsScriptSessionClient;
  sessionId: string;
  token: string;
  slot: PlayerSlot;
  onLobbyClosed: () => void;
}

/** `NetworkLobbyScreen.tsx`의 Apps Script 자매 화면 (Milestone 5 3부 화면 배선). 클라이언트
 * 타입과 폴링 훅만 다르고 로직은 동일하다. */
export function AppsScriptNetworkLobbyScreen({ client, sessionId, token, slot, onLobbyClosed }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [slots, setSlots] = useState<PlayerSlot[]>([]);
  const { stateResult } = useAppsScriptGameSession(client, sessionId);

  useEffect(() => {
    let cancelled = false;
    client
      .getSlots(sessionId)
      .then((result) => {
        if (!cancelled) setSlots(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, sessionId]);

  useEffect(() => {
    if (stateResult && !stateResult.lobby.open) onLobbyClosed();
  }, [stateResult, onLobbyClosed]);

  if (!submitted) {
    return (
      <SetupScreen
        onStart={(choices: BusinessSetupChoices) => {
          setError(undefined);
          client
            .setupBusinessChoices(sessionId, token, choices)
            .then(() => setSubmitted(true))
            .catch((err: unknown) => setError(translateNetworkError(err)));
        }}
      />
    );
  }

  const waitingNames = (stateResult?.lobby.unsubmittedPlayerIds ?? [])
    .map((playerId) => slots.find((s) => s.playerId === playerId)?.displayName ?? playerId)
    .filter((name) => name !== slot.displayName);

  return (
    <div className="card">
      <h2>{slot.displayName}님, 준비 완료!</h2>
      <p className="empty-note">다른 학생들이 창업 준비를 마칠 때까지 기다려요.</p>
      {waitingNames.length > 0 && <p>기다리는 중: {waitingNames.join(", ")}</p>}
      {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}
    </div>
  );
}
