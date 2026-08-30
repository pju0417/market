import { useEffect, useState } from "react";
import type { BusinessSetupChoices } from "../../multiplayer/GameSession.js";
import type { PlayerSlot, SessionClient } from "../network/sessionClient.js";
import { translateNetworkError } from "../network/errorMessages.js";
import { useNetworkGameSession } from "../network/useNetworkGameSession.js";
import { SetupScreen } from "./SetupScreen.js";

interface Props {
  client: SessionClient;
  sessionId: string;
  token: string;
  slot: PlayerSlot;
  onLobbyClosed: () => void;
}

/** 창업 준비를 제출하고, 로비가 닫힐 때까지 다른 학생들을 기다리는 화면 (Milestone 4 4-b, D-030). */
export function NetworkLobbyScreen({ client, sessionId, token, slot, onLobbyClosed }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [slots, setSlots] = useState<PlayerSlot[]>([]);
  const { stateResult } = useNetworkGameSession(client, sessionId);

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
