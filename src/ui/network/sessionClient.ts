/**
 * `src/server/httpApi.ts`의 HTTP API를 감싸는 얇은 래퍼 (Milestone 4 3단계 확인용).
 *
 * DOM에 의존하지 않고 `fetch` 구현을 주입받게 만들어(생성자 인자) 서버 없이도 테스트할 수
 * 있게 한다. 기존 로컬 1인 플레이 경로(App.tsx, useGameSession.ts, 세 턴 화면)는 이 파일을
 * 전혀 쓰지 않는다 — `NetworkSessionMonitor.tsx`와 함께 4단계(다인원 로비)에서 재사용할
 * 기반으로 미리 만들어 둔다.
 */
import type { GameState, ParticipantId } from "../../types/domain.js";
import type { BusinessSetupChoices } from "../../multiplayer/GameSession.js";

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
}

export type PollResult = StateResult | { unchanged: true };

export interface PurchaseRequestLine {
  listingId: string;
  quantity: number;
}

export interface CompanyDecisionInput {
  quantity: number;
  quality: number;
  wholesalePrice: number;
}

export interface StoreDecisionInput {
  purchases: PurchaseRequestLine[];
  retailPrice?: number;
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

  createSession(studentCount: number, rngSeed?: number): Promise<CreateSessionResult> {
    return this.request<CreateSessionResult>("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentCount, rngSeed }),
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
    lines: PurchaseRequestLine[],
  ): Promise<{ ok: true }> {
    return this.request(`/api/sessions/${sessionId}/submit/household`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ householdId, lines }),
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
