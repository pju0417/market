import { useState } from "react";
import type { PlayerSlot } from "../network/sessionClient.js";
import type { AppsScriptSessionClient } from "../network/appsScriptSessionClient.js";
import { translateNetworkError } from "../network/errorMessages.js";

export const NETWORK_JOIN_STORAGE_KEY = "economy-game:network-join";

interface Props {
  client: AppsScriptSessionClient;
  onJoined: (result: { sessionId: string; token: string; slot: PlayerSlot }) => void;
}

/** `NetworkJoinScreen.tsx`의 Apps Script 자매 화면 (Milestone 5 3부 화면 배선). 클라이언트
 * 타입만 다르고 로직은 동일하다 — 두 클라이언트가 같은 public 메서드 시그니처를 갖는다. */
export function AppsScriptNetworkJoinScreen({ client, onJoined }: Props) {
  const [sessionId, setSessionId] = useState("");
  const [slots, setSlots] = useState<PlayerSlot[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  function handleFindSlots(): void {
    setError(undefined);
    client
      .getSlots(sessionId)
      .then((result) => setSlots(result))
      .catch((err: unknown) => setError(translateNetworkError(err)));
  }

  function handleJoin(slot: PlayerSlot): void {
    setError(undefined);
    client
      .join(sessionId, slot.playerId)
      .then((result) => {
        window.sessionStorage.setItem(
          NETWORK_JOIN_STORAGE_KEY,
          JSON.stringify({ sessionId, token: result.token, slot: result.player }),
        );
        onJoined({ sessionId, token: result.token, slot: result.player });
      })
      .catch((err: unknown) => setError(translateNetworkError(err)));
  }

  return (
    <div className="card">
      <h2>참가하기 (학생)</h2>
      <label className="field">
        <span className="field-label">세션 번호</span>
        <input type="text" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
      </label>
      <button className="primary" onClick={handleFindSlots} disabled={sessionId.length === 0}>
        참가하기
      </button>
      {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}

      {slots && (
        <>
          <h3>내 이름을 선택하세요</h3>
          {slots.map((slot) => (
            <button className="secondary" key={slot.playerId} style={{ display: "block", marginBottom: 8 }} onClick={() => handleJoin(slot)}>
              {slot.displayName}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
