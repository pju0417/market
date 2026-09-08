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
import {
  createSession,
  getSession,
  isLobbyOpen,
  markLobbyClosedIfNeeded,
  syncPhaseTimer,
  type SessionEntry,
} from "./sessionRegistry.js";
import { DEFAULT_SERVER_SUBMISSION_TIMEOUT_SETTINGS } from "./timeoutConfig.js";
import { DISTRICT_IDS, PRODUCT_CATEGORIES } from "../economy/config.js";
import type {
  AutoFillPreference,
  BusinessSetupChoices,
  CategoryPurchaseRequest,
  CompanyDecisionInput,
  PriorityPurchasePick,
  StoreDecisionInput,
  StorePurchaseRequest,
  SubmissionTimeoutSettings,
} from "../multiplayer/GameSession.js";
import type { DistrictId, ProductCategoryId } from "../types/domain.js";

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

  if (segments.length === 4 && segments[3] === "acknowledge-round-result") {
    if (request.method !== "POST") return notFound();
    return handleAcknowledgeRoundResult(sessionId, request.headers);
  }

  if (segments.length === 4 && segments[3] === "setup") {
    if (request.method !== "POST") return notFound();
    return handleSetup(sessionId, request.body, request.headers);
  }

  if (segments.length === 4 && segments[3] === "close-lobby") {
    if (request.method !== "POST") return notFound();
    return handleCloseLobby(sessionId, request.headers);
  }

  return notFound();
}

/**
 * 세 필드 모두 선택적이다 (구매 매칭 알고리즘 재설계 Stage 2) — 하나라도 있으면 나머지도
 * `sessionRegistry.createSession`의 서버 기본값이 아니라 이 요청에서 명시적으로 채운 값을
 * 써야 하므로, 세 필드를 하나로 묶어 "제출 제한시간 설정을 아예 안 보냈는지"를 한 번에
 * 판단한다. `enabled`가 없으면 `npcGraduatedEntryEnabled`가 있어도 무시하지 않고 그대로
 * 함께 반영한다(교사가 "제한시간은 기본값 그대로 두고 순차진입만 끄고 싶다"는 조합도
 * 유효한 요청이기 때문) — 다만 개별 필드가 없으면 서버 기본값(D-029 기존 배포)에서 그
 * 필드만 가져와 채운다.
 */
function isValidTimeoutSettingsBody(
  body: Record<string, unknown>,
): body is Record<string, unknown> & {
  submissionTimeoutEnabled?: boolean;
  submissionTimeoutMs?: number;
  npcGraduatedEntryEnabled?: boolean;
} {
  if (body.submissionTimeoutEnabled !== undefined && typeof body.submissionTimeoutEnabled !== "boolean") return false;
  if (body.submissionTimeoutMs !== undefined && typeof body.submissionTimeoutMs !== "number") return false;
  if (body.npcGraduatedEntryEnabled !== undefined && typeof body.npcGraduatedEntryEnabled !== "boolean") return false;
  return true;
}

function handleCreateSession(body: unknown): ApiResponse {
  if (!isRecord(body) || typeof body.studentCount !== "number" || !Number.isInteger(body.studentCount) || body.studentCount < 1) {
    return badRequest("studentCount must be a positive integer");
  }
  if (!isValidTimeoutSettingsBody(body)) {
    return badRequest("invalid submission timeout settings");
  }
  const rngSeed = typeof body.rngSeed === "number" ? body.rngSeed : undefined;

  const hasTimeoutOverride =
    body.submissionTimeoutEnabled !== undefined ||
    body.submissionTimeoutMs !== undefined ||
    body.npcGraduatedEntryEnabled !== undefined;
  const timeoutSettings: SubmissionTimeoutSettings | undefined = hasTimeoutOverride
    ? {
        enabled: body.submissionTimeoutEnabled ?? DEFAULT_SERVER_SUBMISSION_TIMEOUT_SETTINGS.enabled,
        timeoutMs: body.submissionTimeoutMs ?? DEFAULT_SERVER_SUBMISSION_TIMEOUT_SETTINGS.timeoutMs,
        npcGraduatedEntryEnabled:
          body.npcGraduatedEntryEnabled ?? DEFAULT_SERVER_SUBMISSION_TIMEOUT_SETTINGS.npcGraduatedEntryEnabled,
      }
    : undefined;

  const { sessionId, entry } = createSession(body.studentCount, rngSeed, timeoutSettings);
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
  const lobbyOpen = isLobbyOpen(entry);
  return {
    status: 200,
    body: {
      version,
      state,
      unsubmittedParticipantIds: entry.session.getUnsubmittedParticipantIds(),
      gameOver: state.currentRound > state.config.totalRounds,
      // 구매 매칭 알고리즘 재설계 Stage 2(D-036)에서 세션별 제출 타임아웃이 생겼는데,
      // `GET /state` 응답이 이 값을 노출하지 않아 `NetworkSessionMonitor.tsx`(확인용 화면)가
      // 여전히 고정 상수 `DEFAULT_SUBMISSION_TIMEOUT_MS`(120초)로만 카운트다운을 그려
      // 교사가 커스텀 시간을 설정하거나 타임아웃을 꺼도 화면에는 반영되지 않던 버그를
      // 실제 브라우저 다인원 검증 중 발견해 함께 고쳤다 — 서버가 실제 세션 설정을 그대로
      // 실어 보낸다.
      submissionTimeout: entry.session.getSubmissionTimeoutSettings(),
      lobby: {
        open: lobbyOpen,
        unsubmittedPlayerIds: lobbyOpen
          ? entry.session
              .getPlayers()
              .map((p) => p.id)
              .filter((id) => !entry.lobbySubmittedPlayerIds.has(id))
          : [],
      },
    },
  };
}

/**
 * 현재 phase의 제출 마감(`phaseStartedAt + entry.session.getSubmissionTimeoutSettings().timeoutMs`)
 * 이 지났고 아직 사람 입력을 기다리는 중이면, 막힌 phase를 강제로 뚫은 뒤(`advancePhase(true)`)
 * 사람 입력이 필요 없는 이어지는 phase들을 조용히 드레인한다(`advanceUntilInputRequired(false)`).
 * 이 정확한 순서를 지키지 않으면 "막혀서 대기 중인 phase에는 force가 적용되지 않는" 함정에
 * 걸린다 (`GameSession.advanceUntilInputRequired`의 while 조건 참고, D-029).
 *
 * 구매 매칭 알고리즘 재설계 Stage 2: 마감시간과 활성화 여부는 이제 고정 상수
 * (`DEFAULT_SUBMISSION_TIMEOUT_MS`)가 아니라 `entry.session.getSubmissionTimeoutSettings()`
 * (교사가 세션 생성 시 설정한 값, 생략 시 `DEFAULT_SERVER_SUBMISSION_TIMEOUT_SETTINGS`)를
 * 따른다 — `enabled: false`면 이 함수는 폴링 하드 타임아웃 강제진행을 아예 건너뛴다(교사의
 * 수동 강제진행 `/force-advance`는 이 설정과 무관하게 그대로 유효하다).
 *
 * round-result phase는 예외다 (D-030): 라운드 결과를 읽는 시간에 제출 타임아웃과 같은 리듬을
 * 강제로 상속시키지 않기 위해 자동 강제진행을 건너뛴다 — 교사의 수동 강제진행
 * (`/force-advance`)은 이 함수와 무관하게 그대로 유효하다.
 *
 * 다인원 로비(창업 준비, D-030 4단계)가 열려있는 동안도 예외다 — code-reviewer가 발견한
 * 버그: 로비 타임아웃(180초, `DEFAULT_LOBBY_TIMEOUT_MS`)이 제출 타임아웃(120초)보다 길어서,
 * 로비가 120초 넘게 걸리면 `phaseStartedAt`(세션 생성 시각부터 흐름)이 로비가 아직 열려있는
 * 도중에 이미 지나가 버려 이 함수가 company-turn을 봇 폴백으로 강제진행해버렸다 — 그 결과
 * 로비 화면은 여전히 "열려있음"을 보여주는데 실제로는 학생들이 창업 준비를 마칠 기회조차
 * 없이 게임이 진행되고, 그 뒤엔 `applyBusinessSetupChoices`가 "라운드 1 기업 턴 실행 후"라는
 * 이유로 영구히 거부되는 버그가 있었다. 로비가 열려있는 동안은 강제진행을 아예 건너뛴다.
 * 로비가 실제로 닫히는 순간(전원 제출 완료·교사 강제종료)에는 `handleSetup`/`handleCloseLobby`가
 * 이미 `markLobbyClosedIfNeeded`로 그 즉시 `phaseStartedAt`을 다시 시작해두므로, 실제
 * company-turn 제출 시간이 로비 대기 시간을 상속하지 않는다 — 여기서의 호출은 아무도
 * 명시적으로 닫지 않고 로비 자체가 시간초과로 조용히 닫히는 경우를 위한 안전망이다.
 */
async function checkAndApplyTimeout(entry: SessionEntry): Promise<void> {
  syncPhaseTimer(entry);
  if (entry.session.getState().currentPhase === "round-result") return;

  if (isLobbyOpen(entry)) return;
  // 안전망 경로(시간초과로 조용히 닫힌 경우)에서만 실제로 리셋이 일어난다 — 그 경우
  // `entry.session`은 전혀 안 바뀌었으므로 `bumpVersion()`으로 직접 알려야 `since` 폴링이
  // 이 변화를 놓치지 않는다(code-reviewer 발견 버그, 아래 handleCloseLobby 주석도 참고).
  if (markLobbyClosedIfNeeded(entry)) entry.session.bumpVersion();

  const timeoutSettings = entry.session.getSubmissionTimeoutSettings();
  if (!timeoutSettings.enabled) return;

  const deadline = entry.phaseStartedAt + timeoutSettings.timeoutMs;
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

  // 로비(창업 준비)가 아직 안 닫혔으면 먼저 닫는다 (code-reviewer 1차 발견 버그 + 2차 리뷰에서
  // 재발견된 순서 결함 수정): 처음엔 `if (isLobbyOpen(entry))`로 게이트를 걸었는데, 이게
  // 틀렸다 — 로비의 벽시계 타임아웃(180초)이 이미 지났지만 아직 아무 폴링도 안 들어와
  // `markLobbyClosedIfNeeded`가 한 번도 안 불린 상태에서는 `isLobbyOpen(entry)`가 이미
  // `false`를 반환해버린다(순수 `Date.now()` 비교라서). 그러면 이 블록 전체를 건너뛰고
  // `finalizeLobbyMembership` 없이 곧바로 `advancePhase(true)`가 company-turn을 실행시켜
  // 버리고, 그 뒤 처음 들어오는 폴링이 `checkAndApplyTimeout`을 통해 뒤늦게
  // `markLobbyClosedIfNeeded`를 호출하면 이미 company-turn을 지나친 뒤라
  // `finalizeLobbyMembership`의 "라운드 1 기업 턴 실행 전"이라는 전제가 깨져 예외를 던지고
  // (그 세션은 이후 유령 학생을 영영 못 거른다). 그래서 `isLobbyOpen` 여부로 게이트를 걸지
  // 않고 **항상 먼저 시도**한다 — `markLobbyClosedIfNeeded`/`lobbyTimerConsumed` 자체의
  // 멱등성 가드가 이미 닫힌 로비에 대한 중복 호출을 안전하게 막아준다
  // (`checkAndApplyTimeout`이 이미 쓰는 것과 같은 무조건 시도 패턴).
  entry.lobbyClosedByTeacher = true;
  if (markLobbyClosedIfNeeded(entry)) entry.session.bumpVersion();

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

function isPriorityPurchasePick(value: unknown): value is PriorityPurchasePick {
  return isRecord(value) && typeof value.listingId === "string" && typeof value.quantity === "number" && value.quantity > 0;
}

/** 최대 3개, listingId 중복 없음 (구매 매칭 알고리즘 재설계 Stage 1의 1~3순위 계약). */
function isPriorityPurchasePickArray(value: unknown): value is PriorityPurchasePick[] {
  if (!Array.isArray(value) || value.length > 3 || !value.every(isPriorityPurchasePick)) return false;
  const listingIds = value.map((pick: PriorityPurchasePick) => pick.listingId);
  return new Set(listingIds).size === listingIds.length;
}

function isAutoFillPreference(value: unknown): value is AutoFillPreference {
  return value === "price" || value === "quality";
}

/** `StorePurchaseRequest`/`CategoryPurchaseRequest`가 공유하는 필드만 검증한다. */
function hasValidPurchaseRequestFields(value: Record<string, unknown>): boolean {
  if (!isPriorityPurchasePickArray(value.priorityPicks)) return false;
  if (typeof value.maxQuantity !== "number" || value.maxQuantity < 0) return false;
  if (value.maxUnitPrice !== undefined && (typeof value.maxUnitPrice !== "number" || value.maxUnitPrice < 0)) return false;
  if (value.autoFillPreference !== undefined && !isAutoFillPreference(value.autoFillPreference)) return false;
  return true;
}

function isStorePurchaseRequest(value: unknown): value is StorePurchaseRequest {
  return isRecord(value) && hasValidPurchaseRequestFields(value);
}

function isCategoryPurchaseRequest(value: unknown): value is CategoryPurchaseRequest {
  return isRecord(value) && isProductCategoryId(value.categoryId) && hasValidPurchaseRequestFields(value);
}

function isCategoryPurchaseRequestArray(value: unknown): value is CategoryPurchaseRequest[] {
  return Array.isArray(value) && value.every(isCategoryPurchaseRequest);
}

function isCompanyDecisionInput(value: unknown): value is CompanyDecisionInput {
  if (
    !(
      isRecord(value) &&
      typeof value.quantity === "number" &&
      typeof value.quality === "number" &&
      typeof value.wholesalePrice === "number"
    )
  ) {
    return false;
  }
  if (value.switchToCategoryId !== undefined && !isProductCategoryId(value.switchToCategoryId)) return false;
  return true;
}

function isStoreDecisionInput(value: unknown): value is StoreDecisionInput {
  if (!isRecord(value)) return false;
  if (value.purchaseRequest !== undefined && !isStorePurchaseRequest(value.purchaseRequest)) return false;
  if (value.retailPrice !== undefined && typeof value.retailPrice !== "number") return false;
  if (value.sellingCategoryId !== undefined && !isProductCategoryId(value.sellingCategoryId)) return false;
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

  // 로비(창업 준비)가 아직 열려 있는 동안에는 아무도 기업 결정을 제출할 수 없다 (Milestone 4
  // 4단계, D-030) — store/household 제출은 자연히 기업 턴이 끝난 뒤에나 도달하므로 이 가드가
  // 필요 없다.
  if (role === "company" && isLobbyOpen(entry)) {
    return badRequest("business setup not finished yet");
  }

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
      if (!isCategoryPurchaseRequestArray(body.requests)) return badRequest("invalid purchase requests");
      entry.session.submitHouseholdPurchases(householdId, body.requests);
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

/**
 * round-result phase에서 이 학생이 결과를 확인했음을 표시한다 (D-030). 토큰이 이미
 * playerId로 직접 resolve되므로(`submit/*`와 달리 body의 id와 대조할 필요 없음) 인증은
 * 토큰 존재/유효성만 확인한다.
 */
async function handleAcknowledgeRoundResult(
  sessionId: string,
  headers: Readonly<Record<string, string | undefined>>,
): Promise<ApiResponse> {
  const entry = getSession(sessionId);
  if (!entry) return notFound("unknown sessionId");

  const token = extractBearerToken(headers);
  const playerId = token !== undefined ? entry.tokens.resolvePlayerId(token) : undefined;
  if (playerId === undefined) return unauthorized();

  try {
    entry.session.acknowledgeRoundResult(playerId);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : String(error));
  }

  await entry.session.advanceUntilInputRequired(false);
  syncPhaseTimer(entry);

  return { status: 200, body: { ok: true } };
}

function isDistrictId(value: unknown): value is DistrictId {
  return typeof value === "string" && (DISTRICT_IDS as readonly string[]).includes(value);
}

function isProductCategoryId(value: unknown): value is ProductCategoryId {
  return typeof value === "string" && (PRODUCT_CATEGORIES as readonly string[]).includes(value);
}

function isBusinessSetupChoices(value: unknown): value is BusinessSetupChoices {
  return (
    isRecord(value) &&
    isDistrictId(value.companyDistrictId) &&
    isProductCategoryId(value.companyCategoryId) &&
    isDistrictId(value.storeDistrictId) &&
    isProductCategoryId(value.storeCategoryId)
  );
}

/**
 * 학생 한 명의 창업 준비(상권/업종 선택)를 제출한다 (Milestone 4 4단계, D-030). 로비가 이미
 * 닫혔으면(전원 제출 완료/교사가 닫음/시간 초과) 더 이상 받지 않는다.
 */
async function handleSetup(
  sessionId: string,
  body: unknown,
  headers: Readonly<Record<string, string | undefined>>,
): Promise<ApiResponse> {
  const entry = getSession(sessionId);
  if (!entry) return notFound("unknown sessionId");

  const token = extractBearerToken(headers);
  const playerId = token !== undefined ? entry.tokens.resolvePlayerId(token) : undefined;
  if (playerId === undefined) return unauthorized();

  if (!isBusinessSetupChoices(body)) return badRequest("invalid business setup choices");

  if (!isLobbyOpen(entry)) return badRequest("lobby already closed");

  try {
    entry.session.applyBusinessSetupChoices(playerId, body);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : String(error));
  }

  entry.lobbySubmittedPlayerIds.add(playerId);
  // 이 제출로 전원이 로비를 마쳤다면, 그 즉시(다음 폴링을 기다리지 않고) company-turn의
  // 제출 시계를 다시 시작한다 — 로비 대기 시간이 상속되지 않도록 한다(위 checkAndApplyTimeout
  // 주석 참고).
  if (!isLobbyOpen(entry)) markLobbyClosedIfNeeded(entry);

  return { status: 200, body: { ok: true } };
}

/**
 * 교사가 다인원 로비를 명시적으로 닫는다 (Milestone 4 4단계, D-030). 이미 닫혀 있어도(전원
 * 제출/시간 초과/이전 호출) 안전하게 다시 호출할 수 있는 no-op 200이다.
 */
function handleCloseLobby(
  sessionId: string,
  headers: Readonly<Record<string, string | undefined>>,
): ApiResponse {
  const entry = getSession(sessionId);
  if (!entry) return notFound("unknown sessionId");

  const token = extractBearerToken(headers);
  if (token === undefined || token !== entry.teacherToken) {
    return unauthorized("missing or invalid teacher token");
  }

  entry.lobbyClosedByTeacher = true;
  // 교사가 로비를 명시적으로 닫는 그 즉시 company-turn의 제출 시계를 다시 시작한다(위
  // checkAndApplyTimeout 주석 참고). `GameSession` 상태 자체는 안 바뀌므로, `bumpVersion()`을
  // 직접 불러 폴링 중인 학생 클라이언트가 이 변화를 놓치지 않게 한다(code-reviewer 발견 버그
  // — 이게 없으면 `since` 기반 폴링은 로비가 닫힌 사실을 영원히 못 보고 대기 화면에 멈춘다).
  if (markLobbyClosedIfNeeded(entry)) entry.session.bumpVersion();

  return { status: 200, body: { ok: true } };
}
