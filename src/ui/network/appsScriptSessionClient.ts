/**
 * `src/appsScript/entry.ts`(Google Apps Script Web App)를 감싸는 `SessionClient`의 자매
 * 클라이언트 (Milestone 5 3부, D-032). Apps Script Web App은 모든 요청이 같은 `.../exec`
 * URL로 들어오고 커스텀 HTTP 헤더/경로 세그먼트 라우팅을 지원하지 않으므로, `sessionClient.ts`처럼
 * REST 경로/헤더로 라우팅하지 않고 `path`/`token`/`body`를 쿼리 파라미터(GET) 또는 JSON 바디(POST)에
 * 실어 보낸다 (`src/appsScript/requestAdapter.ts` 참고).
 *
 * 주의(cross-reference): 아래 `unwrap()`이 가정하는 `{ status, body }` 응답 봉투 형태는
 * `src/appsScript/entry.ts`의 `respond()`와 강하게 결합돼 있다 — 그쪽이 바뀌면 이 파일도 같이
 * 바꿔야 한다.
 */
import type {
  CompanyDecisionInput,
  CreateSessionResult,
  FetchLike,
  JoinResult,
  PlayerSlot,
  PollResult,
  PurchaseRequestLine,
  StoreDecisionInput,
} from "./sessionClient.js";
import { ApiError } from "./sessionClient.js";
import type { ParticipantId } from "../../types/domain.js";
import type { BusinessSetupChoices } from "../../multiplayer/GameSession.js";

function isEnvelope(value: unknown): value is { status: number; body: unknown } {
  return typeof value === "object" && value !== null && "status" in value && typeof (value as { status: unknown }).status === "number";
}

export class AppsScriptSessionClient {
  constructor(
    private readonly webAppUrl: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {}

  private async getRequest<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const params = new URLSearchParams({ path, ...query });
    const response = await this.fetchImpl(`${this.webAppUrl}?${params}`);
    return this.unwrap<T>(response);
  }

  private async postRequest<T>(path: string, token?: string, body?: unknown): Promise<T> {
    const payload: { path: string; token?: string; body?: unknown } = { path };
    if (token !== undefined) payload.token = token;
    if (body !== undefined) payload.body = body;

    const response = await this.fetchImpl(this.webAppUrl, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return this.unwrap<T>(response);
  }

  private async unwrap<T>(response: Response): Promise<T> {
    const parsed = (await response.json()) as unknown;
    if (!isEnvelope(parsed)) {
      throw new ApiError(response.status, parsed);
    }
    if (parsed.status < 200 || parsed.status >= 300) {
      throw new ApiError(parsed.status, parsed.body);
    }
    return parsed.body as T;
  }

  createSession(studentCount: number, rngSeed?: number): Promise<CreateSessionResult> {
    return this.postRequest<CreateSessionResult>("/api/sessions", undefined, { studentCount, rngSeed });
  }

  getSlots(sessionId: string): Promise<PlayerSlot[]> {
    return this.getRequest<PlayerSlot[]>(`/api/sessions/${sessionId}/slots`);
  }

  join(sessionId: string, playerId: string): Promise<JoinResult> {
    return this.postRequest<JoinResult>(`/api/sessions/${sessionId}/join`, undefined, { playerId });
  }

  getState(sessionId: string, since?: number): Promise<PollResult> {
    const query = since !== undefined ? { since: String(since) } : {};
    return this.getRequest<PollResult>(`/api/sessions/${sessionId}/state`, query);
  }

  submitCompany(
    sessionId: string,
    token: string,
    companyId: ParticipantId,
    input: CompanyDecisionInput,
  ): Promise<{ ok: true }> {
    return this.postRequest(`/api/sessions/${sessionId}/submit/company`, token, { companyId, input });
  }

  submitStore(sessionId: string, token: string, storeId: ParticipantId, input: StoreDecisionInput): Promise<{ ok: true }> {
    return this.postRequest(`/api/sessions/${sessionId}/submit/store`, token, { storeId, input });
  }

  submitHousehold(
    sessionId: string,
    token: string,
    householdId: ParticipantId,
    lines: PurchaseRequestLine[],
  ): Promise<{ ok: true }> {
    return this.postRequest(`/api/sessions/${sessionId}/submit/household`, token, { householdId, lines });
  }

  /** 교사 전용 수동 강제진행. `teacherToken`은 세션 생성 응답에서만 받을 수 있다 (D-029). */
  forceAdvance(sessionId: string, teacherToken: string): Promise<{ ok: true; gameOver?: boolean }> {
    return this.postRequest(`/api/sessions/${sessionId}/force-advance`, teacherToken);
  }

  /** 창업 준비(상권/업종 선택) 제출. 로비가 이미 닫혀 있으면 서버가 400을 반환한다 (D-030). */
  setupBusinessChoices(sessionId: string, token: string, choices: BusinessSetupChoices): Promise<{ ok: true }> {
    return this.postRequest(`/api/sessions/${sessionId}/setup`, token, choices);
  }

  /** 교사 전용 로비 닫기. `teacherToken`은 세션 생성 응답에서만 받을 수 있다 (D-029). */
  closeLobby(sessionId: string, teacherToken: string): Promise<{ ok: true }> {
    return this.postRequest(`/api/sessions/${sessionId}/close-lobby`, teacherToken);
  }

  /** 라운드 결과 확인(ack). 전원이 확인해야 다음 라운드로 넘어간다 (D-030). */
  acknowledgeRoundResult(sessionId: string, token: string): Promise<{ ok: true }> {
    return this.postRequest(`/api/sessions/${sessionId}/acknowledge-round-result`, token);
  }
}
