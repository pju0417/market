import { useState } from "react";
import type { SubmissionTimeoutSettings } from "../../multiplayer/GameSession.js";
import type { SessionClient } from "../network/sessionClient.js";
import { translateNetworkError } from "../network/errorMessages.js";
import { NetworkSessionMonitor, storeTeacherToken } from "./NetworkSessionMonitor.js";

interface Props {
  client: SessionClient;
}

/**
 * 교사가 네트워크 세션을 만들고 진행 상황을 지켜보는 화면 (Milestone 4 4-b).
 *
 * 구매 매칭 알고리즘 재설계 Stage 2: "고급 설정"(기본 닫힘)에서 제출 제한시간/NPC 순차진입
 * 여부를 정할 수 있다. 아무것도 안 건드리면 서버 기본값
 * (`DEFAULT_SERVER_SUBMISSION_TIMEOUT_SETTINGS`, D-029 기존 배포와 하위호환)이 그대로
 * 쓰이므로 세션 생성 API에 아무 값도 안 보낸다.
 */
export function TeacherSessionScreen({ client }: Props) {
  const [studentCount, setStudentCount] = useState(4);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [timeoutEnabled, setTimeoutEnabled] = useState(false);
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
      <NetworkSessionMonitor sessionId={sessionId} />
    </div>
  );
}
