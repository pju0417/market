/**
 * 순수 HTTP 요청 처리 함수 (Milestone 4 2단계). Node의 raw request/response에 의존하지
 * 않는다 — 나중에 이 저장소가 Google Apps Script Web App(`doPost`/`doGet`)으로 포팅될 때
 * `nodeAdapter.ts` 대신 Apps Script 어댑터로 감싸는 것만으로 재사용할 수 있어야 한다
 * (docs/DECISIONS.md D-028). 그래서 이 파일은 Node 전용 타입(`http.IncomingMessage` 등)을
 * import하지 않고, 테스트도 서버를 띄우지 않고 `handleApiRequest`를 직접 호출해서 검증한다.
 *
 * 응답의 상태 코드는 REST 관례를 최소한으로만 따른다(200/201/400/401/403/404) — 이 프로젝트의
 * 목적상 그 이상의 세밀한 HTTP 시맨틱은 불필요하다.
 */
import { createSession, getSession, syncPhaseTimer, type SessionEntry } from "./sessionRegistry.js";
import { DEFAULT_SUBMISSION_TIMEOUT_MS } from "./timeoutConfig.js";
import type {
  CompanyDecisionInput,
  PurchaseRequestLine,
  StoreDecisionInput,
} from "../multiplayer/GameSession.js";

export interface ApiRequest {
  method: string;
  /** 쿼리 문자열이 없는 pathname (예: "/api/sessions/abc/state"). */
  path: string;
  query: Readonly<Record<string, string>>;
  /** Node의 `IncomingMessage.headers`처럼 키가 소문자라고 가정한다. */
  headers: Readonly<Record<string, string | undefined>>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function notFound(message = "not found"): ApiResponse {
  return { status: 404, body: { error: message } };
}

function badRequest(message: string): ApiResponse {
  return { status: 400, body: { error: message } };
}

function unauthorized(message = "missing or invalid token"): ApiResponse {
  return { status: 401, body: { error: message } };
}

function forbidden(message: string): ApiResponse {
  return { status: 403, body: { error: message } };
}

export async function handleApiRequest(request: ApiRequest): Promise<ApiResponse> {
  const segments = request.path.split("/").filter((segment) => segment.length > 0);

  if (segments[0] !== "api" || segments[1] !== "sessions") {
    return notFound();
  }

  if (segments.length === 2) {
    if (request.method !== "POST") return notFound();
    return handleCreateSession(request.body);
  }

  const sessionId = segments[2]!;

  if (segments.length === 4 && segments[3] === "slots") {
    if (request.method !== "GET") return notFound();
    return handleSlots(sessionId);
  }

  if (segments.length === 4 && segments[3] === "join") {
    if (request.method !== "POST") return notFound();
    return handleJoin(sessionId, request.body);
  }

  if (segments.length === 4 && segments[3] === "state") {
    if (request.method !== "GET") return notFound();
    return handleState(sessionId, request.query);
  }

  if (segments.length === 4 && segments[3] === "force-advance") {
    if (request.method !== "POST") return notFound();
    return handleForceAdvance(sessionId, request.headers);
  }

  if (segments.length === 5 && segments[3] === "submit") {
    const role = segments[4];
    if (request.method !== "POST") return notFound();
    if (role === "company" || role === "store" || role === "household") {
      return handleSubmit(sessionId, role, request.body, request.headers);
    }
    return notFound();
  }

  return notFound();
}

function handleCreateSession(body: unknown): ApiResponse {
  if (!isRecord(body) || typeof body.studentCount !== "number" || !Number.isInteger(body.studentCount) || body.studentCount < 1) {
    return badRequest("studentCount must be a positive integer");
  }
  const rngSeed = typeof body.rngSeed === "number" ? body.rngSeed : undefined;
  const { sessionId, entry } = createSession(body.studentCount, rngSeed);
  // teacherToken은 세션 생성 응답에만 실린다 — 다른 어떤 라우트(GET /slots 등)도 이 값을
  // 다시 노출하지 않는다 (D-029, 무인증 라우트로의 유출 방지).
  return { status: 201, body: { sessionId, teacherToken: entry.teacherToken } };
}

function handleSlots(sessionId: string): ApiResponse {
  const entry = getSession(sessionId);
  if (!entry) return notFound("unknown sessionId");

  const slots = entry.session.getPlayers().map((player) => ({
    playerId: player.id,
    companyId: player.companyId,
    storeId: player.storeId,
    householdId: player.householdId,
    displayName: player.displayName,
  }));
  return { status: 200, body: slots };
}

function handleJoin(sessionId: string, body: unknown): ApiResponse {
  const entry = getSession(sessionId);
  if (!entry) return notFound("unknown sessionId");

  if (!isRecord(body) || typeof body.playerId !== "string") {
    return badRequest("playerId is required");
  }
  const player = entry.session.getPlayers().find((p) => p.id === body.playerId);
  if (!player) return notFound("unknown playerId");

  const token = entry.tokens.issue(player.id);
  return { status: 200, body: { token, player } };
}

/**
 * 담합 방지 원칙(GAME_RULES.md 2절, docs/MULTIPLAYER_DESIGN.md): 제출 마감 전 다른 참가자의
 * 제출 내용(`input`/`quantity` 등)은 이 응답 어디에도 실리지 않는다 — `GameSession.getState()`가
 * 반환하는 `GameState`에는 애초에 미확정 제출값이 담기지 않고(phase가 실제로 실행된 뒤의
 * 확정 상태만), `getUnsubmittedParticipantIds()`도 "누가 아직 제출 안 했는지"만 참가자 id로
 * 알려줄 뿐 내용은 노출하지 않는다.
 *
 * 순서 주의(D-029): 타임아웃 체크를 반드시 `since` 버전 비교보다 먼저 해야 한다. 만약
 * `since === 현재버전`일 때 즉시 `{unchanged:true}`를 반환하는 빠른 경로가 먼저 실행되면,
 * 아무도 새로 제출하지 않아 버전이 그대로인 세션은 영원히 `{unchanged:true}`만 반환하게 되어
 * 타임아웃이 절대 발동하지 않는다.
 */
async function handleState(sessionId: string, query: Readonly<Record<string, string>>): Promise<ApiResponse> {
  const entry = getSession(sessionId);
  if (!entry) return notFound("unknown sessionId");

  await checkAndApplyTimeout(entry);

  const version = entry.session.getVersion();
  const sinceRaw = query.since;
  if (sinceRaw !== undefined) {
    const since = Number(sinceRaw);
    if (Number.isFinite(since) && since === version) {
      return { status: 200, body: { unchanged: true } };
    }
  }

  const state = entry.session.getState();
  return {
    status: 200,
    body: {
      version,
      state,
      unsubmittedParticipantIds: entry.session.getUnsubmittedParticipantIds(),
      gameOver: state.currentRound > state.config.totalRounds,
    },
  };
}

/**
 * 현재 phase의 제출 마감(`phaseStartedAt + DEFAULT_SUBMISSION_TIMEOUT_MS`)이 지났고 아직
 * 사람 입력을 기다리는 중이면, 막힌 phase를 강제로 뚫은 뒤(`advancePhase(true)`) 사람 입력이
 * 필요 없는 이어지는 phase들을 조용히 드레인한다(`advanceUntilInputRequired(false)`). 이
 * 정확한 순서를 지키지 않으면 "막혀서 대기 중인 phase에는 force가 적용되지 않는" 함정에
 * 걸린다 (`GameSession.advanceUntilInputRequired`의 while 조건 참고, D-029).
 */
async function checkAndApplyTimeout(entry: SessionEntry): Promise<void> {
  syncPhaseTimer(entry);
  const deadline = entry.phaseStartedAt + DEFAULT_SUBMISSION_TIMEOUT_MS;
  if (Date.now() >= deadline && entry.session.isWaitingForHumanInput()) {
    await entry.session.advancePhase(true);
    await entry.session.advanceUntilInputRequired(false);
    syncPhaseTimer(entry);
  }
}

function handleForceAdvance(sessionId: string, headers: Readonly<Record<string, string | undefined>>): Promise<ApiResponse> {
  const entry = getSession(sessionId);
  if (!entry) return Promise.resolve(notFound("unknown sessionId"));

  const token = extractBearerToken(headers);
  if (token === undefined || token !== entry.teacherToken) {
    return Promise.resolve(unauthorized("missing or invalid teacher token"));
  }

  return doForceAdvance(entry);
}

async function doForceAdvance(entry: SessionEntry): Promise<ApiResponse> {
  const state = entry.session.getState();
  if (state.currentRound > state.config.totalRounds) {
    // 게임이 이미 끝난 세션에 강제진행을 요청하는 것은 오류라기보다는 "할 일이 없는" 상태다 —
    // 폴링/버튼 재클릭 등으로 뒤늦게 도착한 요청을 조용히 no-op으로 처리한다(D-029).
    return { status: 200, body: { ok: true, gameOver: true } };
  }

  await entry.session.advancePhase(true);
  await entry.session.advanceUntilInputRequired(false);
  syncPhaseTimer(entry);

  return { status: 200, body: { ok: true } };
}

function extractBearerToken(headers: Readonly<Record<string, string | undefined>>): string | undefined {
  const raw = headers.authorization;
  if (!raw) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1];
}

function isPurchaseRequestLine(value: unknown): value is PurchaseRequestLine {
  return isRecord(value) && typeof value.listingId === "string" && typeof value.quantity === "number";
}

function isPurchaseRequestLineArray(value: unknown): value is PurchaseRequestLine[] {
  return Array.isArray(value) && value.every(isPurchaseRequestLine);
}

function isCompanyDecisionInput(value: unknown): value is CompanyDecisionInput {
  return (
    isRecord(value) &&
    typeof value.quantity === "number" &&
    typeof value.quality === "number" &&
    typeof value.wholesalePrice === "number"
  );
}

function isStoreDecisionInput(value: unknown): value is StoreDecisionInput {
  if (!isRecord(value)) return false;
  if (!isPurchaseRequestLineArray(value.purchases)) return false;
  if (value.retailPrice !== undefined && typeof value.retailPrice !== "number") return false;
  return true;
}

async function handleSubmit(
  sessionId: string,
  role: "company" | "store" | "household",
  body: unknown,
  headers: Readonly<Record<string, string | undefined>>,
): Promise<ApiResponse> {
  const entry = getSession(sessionId);
  if (!entry) return notFound("unknown sessionId");

  const token = extractBearerToken(headers);
  const playerId = token !== undefined ? entry.tokens.resolvePlayerId(token) : undefined;
  if (playerId === undefined) return unauthorized();

  const player = entry.session.getPlayers().find((p) => p.id === playerId);
  if (!player) return unauthorized();

  if (!isRecord(body)) return badRequest("invalid request body");

  try {
    if (role === "company") {
      const companyId = body.companyId;
      if (typeof companyId !== "string" || companyId !== player.companyId) {
        return forbidden("companyId does not belong to the authenticated player");
      }
      if (!isCompanyDecisionInput(body.input)) return badRequest("invalid company decision input");
      entry.session.submitCompanyDecision(companyId, body.input);
    } else if (role === "store") {
      const storeId = body.storeId;
      if (typeof storeId !== "string" || storeId !== player.storeId) {
        return forbidden("storeId does not belong to the authenticated player");
      }
      if (!isStoreDecisionInput(body.input)) return badRequest("invalid store decision input");
      entry.session.submitStoreDecision(storeId, body.input);
    } else {
      const householdId = body.householdId;
      if (typeof householdId !== "string" || householdId !== player.householdId) {
        return forbidden("householdId does not belong to the authenticated player");
      }
      if (!isPurchaseRequestLineArray(body.lines)) return badRequest("invalid purchase lines");
      entry.session.submitHouseholdPurchases(householdId, body.lines);
    }
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : String(error));
  }

  await entry.session.advanceUntilInputRequired(false);
  // phase가 실제로 넘어갔다면(전원 제출 완료 등) 새 phase의 타이머를 시작한다. 이 제출
  // 하나만으로는 phase가 안 바뀌는 게 보통이므로(다른 참가자가 아직 남음), 그 경우
  // `syncPhaseTimer`는 아무것도 하지 않는다 — 즉 부분 제출은 마감시각을 리셋하지 않는다(D-029).
  syncPhaseTimer(entry);

  return { status: 200, body: { ok: true } };
}
