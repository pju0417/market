import { useState } from "react";
import type { SessionClient } from "../network/sessionClient.js";
import { NetworkSessionMonitor, storeTeacherToken } from "./NetworkSessionMonitor.js";

interface Props {
  client: SessionClient;
}

/** 교사가 네트워크 세션을 만들고 진행 상황을 지켜보는 화면 (Milestone 4 4-b). */
export function TeacherSessionScreen({ client }: Props) {
  const [studentCount, setStudentCount] = useState(4);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [teacherToken, setTeacherToken] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  function handleCreate(): void {
    setError(undefined);
    client
      .createSession(studentCount)
      .then((result) => {
        setSessionId(result.sessionId);
        setTeacherToken(result.teacherToken);
        storeTeacherToken(result.sessionId, result.teacherToken);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }

  function handleCloseLobby(): void {
    if (!sessionId || !teacherToken) return;
    setError(undefined);
    client.closeLobby(sessionId, teacherToken).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
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
      <NetworkSessionMonitor sessionId={sessionId} />
    </div>
  );
}
