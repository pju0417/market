/**
 * Apps Script Web App(`doGet`/`doPost`) 이벤트 객체를 `src/server/httpApi.ts`가 기대하는
 * `ApiRequest`로 조립하는 순수 함수 (Milestone 5 2부, D-032).
 *
 * Apps Script Web App은 커스텀 HTTP 헤더나 URL 경로 세그먼트 라우팅을 지원하지 않는다(모든
 * 요청이 같은 `.../exec` URL로 들어옴) — 그래서 `path`와 인증 토큰을 헤더/URL이 아니라
 * 요청 바디(POST) 또는 쿼리 파라미터(GET)의 명시적 필드로 실어 나른다:
 *
 * - GET: `e.parameter = { path: "/api/sessions/ABC123/state", since: "5", token?: "..." }`.
 *   `path`/`token`을 꺼내고, 나머지 키는 그대로 `ApiRequest.query`가 된다.
 * - POST: `e.postData.contents`가 `{ path, token?, body? }` 모양의 JSON 문자열이다.
 *
 * 이 파일은 실제 `GoogleAppsScript.*` 전역 타입을 import하지 않는다 — 구조적으로 호환되는
 * narrow 타입(`GasGetEvent`/`GasPostEvent`)만 정의해서, 이 저장소의 기본 tsconfig로도(즉
 * `tsconfig.appsScript.json` 없이도) 타입체크되고 vitest에서 그대로 단위 테스트할 수 있다
 * (실제 Apps Script 전역 타입 참조는 `entry.ts`에만 있다).
 */
import type { ApiRequest, ApiResponse } from "../server/httpApi.js";

/** `GoogleAppsScript.Events.DoGet`과 구조적으로 호환되는 최소 타입. */
export interface GasGetEvent {
  parameter?: Record<string, string>;
}

/** `GoogleAppsScript.Events.DoPost`와 구조적으로 호환되는 최소 타입. */
export interface GasPostEvent {
  postData?: { contents?: string };
}

export type RequestAdapterResult = { ok: true; request: ApiRequest } | { ok: false; response: ApiResponse };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function badRequest(message: string): RequestAdapterResult {
  return { ok: false, response: { status: 400, body: { error: message } } };
}

/** `httpApi.ts`의 `extractBearerToken`이 기대하는 `"Bearer <token>"` 형태로 감싼다. */
function buildAuthorizationHeader(token: string | undefined): Record<string, string | undefined> {
  return { authorization: token !== undefined ? `Bearer ${token}` : undefined };
}

/** GET 요청: `e.parameter`에서 `path`/`token`을 꺼내고, 나머지는 쿼리 파라미터로 그대로 넘긴다. */
export function buildApiRequestFromGet(e: GasGetEvent): RequestAdapterResult {
  const parameter = e.parameter ?? {};
  const { path, token, ...query } = parameter;
  if (typeof path !== "string" || path.length === 0) {
    return badRequest("missing required 'path' query parameter");
  }

  return {
    ok: true,
    request: {
      method: "GET",
      path,
      query,
      headers: buildAuthorizationHeader(token),
    },
  };
}

interface ParsedGasPostBody {
  path: string;
  token?: string;
  body?: unknown;
}

function isParsedGasPostBody(value: unknown): value is ParsedGasPostBody {
  if (!isRecord(value)) return false;
  if (typeof value.path !== "string" || value.path.length === 0) return false;
  if (value.token !== undefined && typeof value.token !== "string") return false;
  return true;
}

/** POST 요청: `e.postData.contents`(JSON 문자열)를 파싱해 `path`/`token`/`body`를 꺼낸다. */
export function buildApiRequestFromPost(e: GasPostEvent): RequestAdapterResult {
  const raw = e.postData?.contents;
  if (raw === undefined || raw.length === 0) {
    return badRequest("missing request body");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return badRequest("invalid JSON body");
  }

  if (!isParsedGasPostBody(parsed)) {
    return badRequest("request body must be a JSON object with a string 'path' field");
  }

  return {
    ok: true,
    request: {
      method: "POST",
      path: parsed.path,
      query: {},
      headers: buildAuthorizationHeader(parsed.token),
      body: parsed.body,
    },
  };
}
