import type { CartCheckout, CartReceipt } from "../../types/domain.js";
/**
 * `src/server/httpApi.ts`의 HTTP API를 감싸는 얇은 래퍼 (Milestone 4 3단계 확인용).
 *
 * DOM에 의존하지 않고 `fetch` 구현을 주입받게 만들어(생성자 인자) 서버 없이도 테스트할 수
 * 있게 한다. 기존 로컬 1인 플레이 경로(App.tsx, useGameSession.ts, 세 턴 화면)는 이 파일을
 * 전혀 쓰지 않는다 — `NetworkSessionMonitor.tsx`와 함께 4단계(다인원 로비)에서 재사용할
 * 기반으로 미리 만들어 둔다.
 */
import type { GameState, ParticipantId, ProductCategoryId } from "../../types/domain.js";
import type { BusinessSetupChoices, SubmissionTimeoutSettings } from "../../multiplayer/GameSession.js";

export interface CreateSessionResult {
  sessionId: string;
  /** 세션 생성 응답에만 실린다 — 재조회 엔드포인트는 절대 이 값을 다시 노출하지 않는다 (D-029). */
  teacherToken: string;
}

export interface PlayerSlot {
  playerId: string;
  companyId: ParticipantId;
  storeId: ParticipantId;
  householdId: ParticipantId;
  displayName: string;
}

export interface JoinResult {
  token: string;
  player: PlayerSlot;
}

export interface StateResult {
  version: number;
  state: GameState;
  unsubmittedParticipantIds: ParticipantId[];
  gameOver: boolean;
  lobby: { open: boolean; unsubmittedPlayerIds: string[] };
  /** 이 세션에 실제로 적용 중인 제출 타임아웃 설정 (D-036). `NetworkSessionMonitor.tsx`가
   * 고정 상수 대신 이 값으로 카운트다운/활성 여부를 표시한다. */
  submissionTimeout: SubmissionTimeoutSettings;
}

export type PollResult = StateResult | { unchanged: true };

/** 자동배분(안전망) 정렬 기준. 생략 시 "price" (구매 매칭 알고리즘 재설계 Stage 1). */
export type AutoFillPreference = "price" | "quality";

/** 1~3순위 수동 지정 한 건. */
export interface PriorityPurchasePick {
  listingId: string;
  quantity: number;
}

/** 가게의 도매 매입 요청 (구매 매칭 알고리즘 재설계 Stage 1). `src/economy/humanDecisions.ts`의
 * 동명 타입과 모양이 같다 — 네트워크 경계를 넘어야 해서 이 파일이 독립적으로 재선언한다. */
export interface StorePurchaseRequest {
  priorityPicks: PriorityPurchasePick[];
  maxQuantity: number;
  maxUnitPrice?: number;
  autoFillPreference?: AutoFillPreference;
}

/** 가정의 소매 구매 요청. 최대 4개 카테고리를 한 턴에 선언 가능. */
export interface CategoryPurchaseRequest extends StorePurchaseRequest {
  categoryId: ProductCategoryId;
}

export interface CompanyDecisionInput {
  quantity: number;
  quality: number;
  wholesalePrice: number;
  /** 업종 전환 요청 (Milestone 6). 생략하면 "전환하지 않기로 선택"으로 취급된다. */
  switchToCategoryId?: ProductCategoryId;
  /** 광고 신청 (Milestone 6, docs/DECISIONS.md D-040). 생략/false면 "광고 안 함". */
  advertise?: boolean;
}

export interface StoreDecisionInput {
  /** 생략하면 이번 라운드 도매 매입 자체를 하지 않는다("안 삼", 봇 위임이 아니다). */
  purchaseRequest?: StorePurchaseRequest;
  retailPrice?: number;
  /** 판매 카테고리 변경 요청 (Milestone 6). 생략하면 "변경하지 않기로 선택"으로 취급된다. */
  sellingCategoryId?: ProductCategoryId;
  /** 광고 신청 (Milestone 6, docs/DECISIONS.md D-040). 생략/false면 "광고 안 함". */
  advertise?: boolean;
}

export type FetchLike = typeof fetch;

/** `body`가 `{ error: string }` 형태이면 그 문자열을, 아니면 `undefined`를 반환한다. */
function extractServerErrorMessage(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "error" in body) {
    const value = (body as { error: unknown }).error;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(extractServerErrorMessage(body) ?? `API request failed with status ${status}`);
  }
}

export class SessionClient {
  constructor(
    private readonly baseUrl: string = "",
    // 기본값은 반드시 globalThis에 바인딩해야 한다 — `this.fetchImpl(...)`로 메서드 호출하듯
    // 부르면 네이티브 fetch는 자신의 realm(window/globalThis)이 아닌 `this`(SessionClient
    // 인스턴스)로 호출된 것으로 보고 "Illegal invocation"을 던진다(주입 가능한 fake fetch를
    // 쓰는 테스트는 `this` 바인딩을 신경 쓰지 않아 이 버그를 못 잡는다 — 실제 브라우저에서만
    // 재현됨).
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const body = (await response.json()) as unknown;
    if (!response.ok) {
      throw new ApiError(response.status, body);
    }
    return body as T;
  }

  /**
   * `timeoutSettings`는 선택적이다(구매 매칭 알고리즘 재설계 Stage 2) — 생략하면 서버가
   * 다인원 세션 기본값(`DEFAULT_SERVER_SUBMISSION_TIMEOUT_SETTINGS`, D-029 기존 배포와
   * 하위호환)을 쓴다.
   */
  createSession(studentCount: number, rngSeed?: number, timeoutSettings?: SubmissionTimeoutSettings): Promise<CreateSessionResult> {
    return this.request<CreateSessionResult>("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        studentCount,
        rngSeed,
        ...(timeoutSettings
          ? {
              submissionTimeoutEnabled: timeoutSettings.enabled,
              submissionTimeoutMs: timeoutSettings.timeoutMs,
              npcGraduatedEntryEnabled: timeoutSettings.npcGraduatedEntryEnabled,
            }
          : {}),
      }),
    });
  }

  getSlots(sessionId: string): Promise<PlayerSlot[]> {
    return this.request<PlayerSlot[]>(`/api/sessions/${sessionId}/slots`);
  }

  join(sessionId: string, playerId: string): Promise<JoinResult> {
    return this.request<JoinResult>(`/api/sessions/${sessionId}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
  }

  getState(sessionId: string, since?: number): Promise<PollResult> {
    const query = since !== undefined ? `?since=${since}` : "";
    return this.request<PollResult>(`/api/sessions/${sessionId}/state${query}`);
  }

  checkoutCart(sessionId: string, token: string, role: "store" | "household", id: string, cart: CartCheckout): Promise<CartReceipt> {
    return this.request(`/api/sessions/${sessionId}/submit/${role}`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ [role + "Id"]: id, cart }),
    });
  }

  submitCompany(
    sessionId: string,
    token: string,
    companyId: ParticipantId,
    input: CompanyDecisionInput,
  ): Promise<{ ok: true }> {
    return this.request(`/api/sessions/${sessionId}/submit/company`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId, input }),
    });
  }

  submitStore(sessionId: string, token: string, storeId: ParticipantId, input: StoreDecisionInput): Promise<{ ok: true }> {
    return this.request(`/api/sessions/${sessionId}/submit/store`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, input }),
    });
  }

  submitHousehold(
    sessionId: string,
    token: string,
    householdId: ParticipantId,
    requests: CategoryPurchaseRequest[],
  ): Promise<{ ok: true }> {
    return this.request(`/api/sessions/${sessionId}/submit/household`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ householdId, requests }),
    });
  }

  /** 교사 전용 수동 강제진행. `teacherToken`은 세션 생성 응답에서만 받을 수 있다 (D-029). */
  forceAdvance(sessionId: string, teacherToken: string): Promise<{ ok: true; gameOver?: boolean }> {
    return this.request(`/api/sessions/${sessionId}/force-advance`, {
      method: "POST",
      headers: { authorization: `Bearer ${teacherToken}` },
    });
  }

  /** 창업 준비(상권/업종 선택) 제출. 로비가 이미 닫혀 있으면 서버가 400을 반환한다 (D-030). */
  setupBusinessChoices(sessionId: string, token: string, choices: BusinessSetupChoices): Promise<{ ok: true }> {
    return this.request(`/api/sessions/${sessionId}/setup`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(choices),
    });
  }

  /** 교사 전용 로비 닫기. `teacherToken`은 세션 생성 응답에서만 받을 수 있다 (D-029). */
  closeLobby(sessionId: string, teacherToken: string): Promise<{ ok: true }> {
    return this.request(`/api/sessions/${sessionId}/close-lobby`, {
      method: "POST",
      headers: { authorization: `Bearer ${teacherToken}` },
    });
  }

  /** 라운드 결과 확인(ack). 전원이 확인해야 다음 라운드로 넘어간다 (D-030). */
  acknowledgeRoundResult(sessionId: string, token: string): Promise<{ ok: true }> {
    return this.request(`/api/sessions/${sessionId}/acknowledge-round-result`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  }
}
