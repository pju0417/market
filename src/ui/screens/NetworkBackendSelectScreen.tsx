import { useState } from "react";
import { SessionClient } from "../network/sessionClient.js";
import { AppsScriptSessionClient } from "../network/appsScriptSessionClient.js";
import type { NetworkBackend } from "../network/backend.js";
import { looksLikeExecUrl, parseAppsScriptWebAppUrl } from "../network/parseAppsScriptWebAppUrl.js";

interface Props {
  onSelect: (backend: NetworkBackend) => void;
}

/**
 * "함께 하기"를 고른 뒤 어떤 서버로 통신할지 고르는 화면 (Milestone 5 3부 화면 배선).
 *
 * "같은 Wi-Fi/기기의 로컬 서버"가 기존 동작(Milestone 4까지)과 동일한 기본 선택이고,
 * "Apps Script 웹앱 URL로 접속"은 교사가 `docs/APPS_SCRIPT_DEPLOYMENT.md` 절차로 배포해
 * 받은 `.../exec` URL을 입력하는 새 경로다.
 */
export function NetworkBackendSelectScreen({ onSelect }: Props) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  function handleConfirmUrl(): void {
    const result = parseAppsScriptWebAppUrl(url);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(undefined);
    onSelect({ kind: "apps-script", client: new AppsScriptSessionClient(result.url) });
  }

  if (showUrlInput) {
    return (
      <div className="card">
        <h2>Apps Script 웹앱 URL로 접속</h2>
        <p className="empty-note">
          선생님이 배포 가이드(docs/APPS_SCRIPT_DEPLOYMENT.md)에 따라 발급받은 <code>.../exec</code> 주소를
          붙여넣으세요.
        </p>
        <label className="field">
          <span className="field-label">웹앱 URL</span>
          <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
        </label>
        {url.trim().length > 0 && !looksLikeExecUrl(url.trim()) && (
          <p className="empty-note">보통 이 주소는 /exec로 끝나요. 다시 한번 확인해보세요.</p>
        )}
        {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}
        <button className="primary" onClick={handleConfirmUrl} style={{ marginRight: 12 }}>
          확인
        </button>
        <button className="secondary" onClick={() => setShowUrlInput(false)}>
          뒤로
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>어떤 서버로 접속할까요?</h2>
      <button
        className="primary"
        style={{ marginRight: 12 }}
        onClick={() => onSelect({ kind: "local-server", client: new SessionClient() })}
      >
        같은 Wi-Fi/기기의 로컬 서버
      </button>
      <button className="secondary" onClick={() => setShowUrlInput(true)}>
        Apps Script 웹앱 URL로 접속
      </button>
    </div>
  );
}
