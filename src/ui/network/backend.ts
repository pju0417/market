/**
 * 학생/교사 화면이 어느 백엔드(로컬 HTTP 서버 vs Apps Script Web App)로 통신할지를 나타내는
 * 판별 유니언 (Milestone 5 3부 화면 배선). `App.tsx`가 `NetworkBackendSelectScreen`에서 이
 * 값을 만들어 각 network 화면에 넘기고, 화면들은 `backend.kind`로 로컬/Apps Script 화면
 * 컴포넌트 중 무엇을 마운트할지 조건부 렌더링으로 분기한다(같은 컴포넌트 안에서 클라이언트
 * 타입만 바꾸지 않는다 — 두 경로의 훅이 다르므로 `react-hooks/rules-of-hooks`를 지키려면
 * 완전히 다른 컴포넌트를 마운트해야 한다).
 */
import type { SessionClient } from "./sessionClient.js";
import type { AppsScriptSessionClient } from "./appsScriptSessionClient.js";

export type NetworkBackend =
  | { kind: "local-server"; client: SessionClient }
  | { kind: "apps-script"; client: AppsScriptSessionClient };
