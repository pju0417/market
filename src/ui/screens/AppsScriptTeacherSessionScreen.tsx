import { useState } from "react";
import type { SubmissionTimeoutSettings } from "../../multiplayer/GameSession.js";
import type { AppsScriptSessionClient } from "../network/appsScriptSessionClient.js";
import { translateNetworkError } from "../network/errorMessages.js";
import { NetworkSessionMonitor, storeTeacherToken } from "./NetworkSessionMonitor.js";

interface Props {
  client: AppsScriptSessionClient;
}

/** `TeacherSessionScreen.tsx`의 Apps Script 자매 화면 (Milestone 5 3부 화면 배선). 클라이언트
 * 타입만 다르고 로직은 동일하며, `NetworkSessionMonitor`에 이 클라이언트를 그대로 넘겨 로컬
 * 서버가 아니라 Apps Script Web App을 폴링하게 한다. */
export function AppsScriptTeacherSessionScreen({ client }: Props) {
  const [studentCount, setStudentCount] = useState(4);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [timeoutEnabled, setTimeoutEnabled] = useState(true);
  const [timeoutSeconds, setTimeoutSeconds] = useState(120);
  const [npcGraduatedEntryEnabled, setNpcGraduatedEntryEnabled] = useState(true);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [teacherToken, setTeacherToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  function handleCreate(): void {
    setError(undefined);
    const timeoutSettings: SubmissionTimeoutSettings = {
      enabled: timeoutEnabled,
      timeoutMs: Math.max(30, timeoutSeconds) * 1000,
      npcGraduatedEntryEnabled,
    };
    client
      .createSession(studentCount, undefined, timeoutSettings)
      .then((result) => {
        setSessionId(result.sessionId);
        setTeacherToken(result.teacherToken);
        storeTeacherToken(result.sessionId, result.teacherToken);
      })
      .catch((err: unknown) => setError(translateNetworkError(err)));
  }

  function handleCloseLobby(): void {
    if (!sessionId || !teacherToken) return;
    setError(undefined);
    client.closeLobby(sessionId, teacherToken).catch((err: unknown) => setError(translateNetworkError(err)));
  }

  if (!sessionId) {
    return (
      <div className="card">
        <h2>세션 만들기 (교사)</h2>
        <label className="field">
          <span className="field-label">학생 수</span>
          <input
            type="number"
            min={1}
            value={studentCount}
            onChange={(e) => setStudentCount(Math.max(1, Number(e.target.value)))}
          />
        </label>

        <button className="ghost" onClick={() => setAdvancedOpen((prev) => !prev)}>
          고급 설정 {advancedOpen ? "▾" : "▸"}
        </button>
        {advancedOpen && (
          <div className="auto-fill-section">
            <label className="field">
              <span className="field-label">
                <input type="checkbox" checked={timeoutEnabled} onChange={(e) => setTimeoutEnabled(e.target.checked)} /> 제출
                제한시간 사용
              </span>
            </label>
            {timeoutEnabled && (
              <label className="field">
                <span className="field-label">제출 제한시간 (초)</span>
                <input
                  type="number"
                  min={30}
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(Math.max(30, Number(e.target.value)))}
                />
              </label>
            )}
            {timeoutEnabled && (
              <label className="field">
                <span className="field-label">
                  <input
                    type="checkbox"
                    checked={npcGraduatedEntryEnabled}
                    onChange={(e) => setNpcGraduatedEntryEnabled(e.target.checked)}
                  />{" "}
                  NPC가 시간 지나면 차례로 끼어들게 하기
                </span>
              </label>
            )}
          </div>
        )}

        <button className="primary" onClick={handleCreate}>
          세션 만들기
        </button>
        {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <h2>세션 번호</h2>
      <p style={{ fontSize: 32, fontWeight: 700 }}>{sessionId}</p>
      <p style={{ color: "#6b7280", fontSize: 14 }}>이 번호를 학생들에게 불러주세요.</p>
      <button className="secondary" onClick={handleCloseLobby}>
        로비 지금 닫기
      </button>
      {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}
      <NetworkSessionMonitor sessionId={sessionId} client={client} />
    </div>
  );
}
