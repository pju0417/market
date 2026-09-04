import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest, type ApiRequest } from "../../src/server/httpApi.js";
import { getSession } from "../../src/server/sessionRegistry.js";
import { DEFAULT_LOBBY_TIMEOUT_MS, DEFAULT_SUBMISSION_TIMEOUT_MS } from "../../src/server/timeoutConfig.js";

async function driveToRoundResult(sessionId: string): Promise<void> {
  const entry = getSession(sessionId);
  if (!entry) throw new Error("expected session to exist");
  while (entry.session.getState().currentPhase !== "round-result") {
    await entry.session.advancePhase(true);
  }
}

function req(partial: Partial<ApiRequest> & Pick<ApiRequest, "method" | "path">): ApiRequest {
  return { query: {}, headers: {}, ...partial };
}

/**
 * Milestone 4 4단계(D-030): company 제출은 로비가 닫히기 전까지 거부된다. 이 헬퍼를 쓰는
 * 대부분의 기존 테스트는 로비 자체를 검증하려는 게 아니라 그 이후의 제출/폴링/타임아웃
 * 동작을 검증하려는 것이므로, 기본값으로 세션 생성 직후 모든 학생이 실제로 /setup을 제출한
 * 뒤(Milestone 4 6단계 이후에는 이게 실제 클라이언트 흐름과도 일치한다 — `NetworkLobbyScreen`은
 * /setup을 건너뛸 방법을 제공하지 않는다) 교사 토큰으로 로비를 닫는다. 그렇지 않으면
 * `finalizeLobbyMembership`이 "아무도 /setup을 제출하지 않았다"고 보고 전원을 유령으로
 * 제외해버려, 이 헬퍼로 만든 세션에서 곧바로 `submit/company` 등을 부르는 기존 테스트 대부분이
 * 401로 깨진다. 로비 자체(제출 현황, 미완료 학생 등)를 검증하는 테스트만 `closeLobby: false`로
 * 열어 둔 채로 받아 직접 제어한다.
 */
async function createTestSession(
  studentCount = 2,
  options: {
    closeLobby?: boolean;
    submissionTimeoutEnabled?: boolean;
    submissionTimeoutMs?: number;
    npcGraduatedEntryEnabled?: boolean;
  } = {},
): Promise<{ sessionId: string; teacherToken: string }> {
  const response = await handleApiRequest(
    req({
      method: "POST",
      path: "/api/sessions",
      body: {
        studentCount,
        rngSeed: 1,
        ...(options.submissionTimeoutEnabled !== undefined && { submissionTimeoutEnabled: options.submissionTimeoutEnabled }),
        ...(options.submissionTimeoutMs !== undefined && { submissionTimeoutMs: options.submissionTimeoutMs }),
        ...(options.npcGraduatedEntryEnabled !== undefined && { npcGraduatedEntryEnabled: options.npcGraduatedEntryEnabled }),
      },
    }),
  );
  expect(response.status).toBe(201);
  const body = response.body as { sessionId: string; teacherToken: string };

  if (options.closeLobby !== false) {
    for (let i = 1; i <= studentCount; i++) {
      const join = await handleApiRequest(
        req({ method: "POST", path: `/api/sessions/${body.sessionId}/join`, body: { playerId: `student-${i}` } }),
      );
      const { token } = join.body as { token: string };
      const setup = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${body.sessionId}/setup`,
        query: {},
        headers: { authorization: `Bearer ${token}` },
        body: {
          companyDistrictId: "industrial",
          companyCategoryId: "electronics",
          storeDistrictId: "downtown",
          storeCategoryId: "toys",
        },
      });
      expect(setup.status).toBe(200);
    }

    const closeLobby = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${body.sessionId}/close-lobby`,
      query: {},
      headers: { authorization: `Bearer ${body.teacherToken}` },
    });
    expect(closeLobby.status).toBe(200);
  }

  return { sessionId: body.sessionId, teacherToken: body.teacherToken };
}

describe("handleApiRequest (Milestone 4 2단계, no real server)", () => {
  it("creates a session and returns a sessionId", async () => {
    const response = await handleApiRequest(
      req({ method: "POST", path: "/api/sessions", body: { studentCount: 2, rngSeed: 1 } }),
    );
    expect(response.status).toBe(201);
    expect(typeof (response.body as { sessionId: string }).sessionId).toBe("string");
  });

  it("returns a short, unambiguous session code instead of a 36-character UUID (Milestone 4 6단계(2부))", async () => {
    const response = await handleApiRequest(
      req({ method: "POST", path: "/api/sessions", body: { studentCount: 2, rngSeed: 1 } }),
    );
    const { sessionId, teacherToken } = response.body as { sessionId: string; teacherToken: string };
    // 6-character code, uppercase letters/digits only, excluding easily-confused 0/O and 1/I.
    expect(sessionId).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    // teacherToken must remain a long, unguessable UUID (student-facing sessionId is the only
    // value that got shortened; participant/teacher tokens are never typed by hand).
    expect(teacherToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects session creation with a non-positive-integer studentCount", async () => {
    const response = await handleApiRequest(req({ method: "POST", path: "/api/sessions", body: { studentCount: 0 } }));
    expect(response.status).toBe(400);

    const response2 = await handleApiRequest(req({ method: "POST", path: "/api/sessions", body: {} }));
    expect(response2.status).toBe(400);
  });

  it("lists slots for a session", async () => {
    const { sessionId } = await createTestSession(2);
    const response = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/slots` }));
    expect(response.status).toBe(200);
    const slots = response.body as Array<{ playerId: string; companyId: string; storeId: string; householdId: string }>;
    expect(slots).toHaveLength(2);
    expect(slots[0]!.playerId).toBe("student-1");
    expect(slots[1]!.playerId).toBe("student-2");
  });

  it("returns 404 for an unknown sessionId on every session-scoped route", async () => {
    const missing = "no-such-session";
    await expect(handleApiRequest(req({ method: "GET", path: `/api/sessions/${missing}/slots` }))).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      handleApiRequest(req({ method: "POST", path: `/api/sessions/${missing}/join`, body: { playerId: "student-1" } })),
    ).resolves.toMatchObject({ status: 404 });
    await expect(handleApiRequest(req({ method: "GET", path: `/api/sessions/${missing}/state` }))).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      handleApiRequest({
        method: "POST",
        path: `/api/sessions/${missing}/submit/company`,
        query: {},
        headers: { authorization: "Bearer nope" },
        body: { companyId: "x", input: { quantity: 1, quality: 0.5, wholesalePrice: 1 } },
      }),
    ).resolves.toMatchObject({ status: 404 });
  });

  it("returns 404 for unknown routes", async () => {
    const response = await handleApiRequest(req({ method: "GET", path: "/api/nope" }));
    expect(response.status).toBe(404);
  });

  it("joins a known player and rejects an unknown playerId", async () => {
    const { sessionId } = await createTestSession(2);

    const joinResponse = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    expect(joinResponse.status).toBe(200);
    const { token, player } = joinResponse.body as { token: string; player: { id: string; companyId: string } };
    expect(typeof token).toBe("string");
    expect(player.id).toBe("student-1");

    const unknownJoin = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "no-such-player" } }),
    );
    expect(unknownJoin.status).toBe(404);
  });

  it("loose join: rejoining the same playerId issues a new token without invalidating the old one", async () => {
    const { sessionId } = await createTestSession(2);
    const join = () =>
      handleApiRequest(req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }));

    const first = (await join()).body as { token: string };
    const second = (await join()).body as { token: string };
    expect(first.token).not.toBe(second.token);

    // Both tokens still work for a submission (neither was invalidated by the other).
    const submitWith = (token: string) =>
      handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/submit/company`,
        query: {},
        headers: { authorization: `Bearer ${token}` },
        body: { companyId: "student-1-company", input: { quantity: 1, quality: 0.5, wholesalePrice: 1 } },
      });

    expect((await submitWith(first.token)).status).toBe(200);
  });

  it("rejects submissions without a valid bearer token", async () => {
    const { sessionId } = await createTestSession(2);
    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: {},
      body: { companyId: "student-1-company", input: { quantity: 1, quality: 0.5, wholesalePrice: 1 } },
    });
    expect(response.status).toBe(401);
  });

  it("rejects a submission attempting to act as a different player's company", async () => {
    const { sessionId } = await createTestSession(2);
    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token } = joinA.body as { token: string };

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      // student-1's token, but trying to submit as student-2's company.
      body: { companyId: "student-2-company", input: { quantity: 1, quality: 0.5, wholesalePrice: 1 } },
    });
    expect(response.status).toBe(403);
  });

  it("rejects malformed decision input with 400 instead of crashing", async () => {
    const { sessionId } = await createTestSession(2);
    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token } = joinA.body as { token: string };

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { companyId: "student-1-company", input: { quantity: "not-a-number" } },
    });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid switchToCategoryId with 400 (Milestone 6, D-033)", async () => {
    const { sessionId } = await createTestSession(2);
    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token } = joinA.body as { token: string };

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: {
        companyId: "student-1-company",
        input: { quantity: 1, quality: 0.5, wholesalePrice: 1, switchToCategoryId: "not-a-real-category" },
      },
    });
    expect(response.status).toBe(400);
  });

  it("accepts a valid switchToCategoryId on submit/company (Milestone 6, D-033)", async () => {
    const { sessionId } = await createTestSession(2);
    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token } = joinA.body as { token: string };

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: {
        companyId: "student-1-company",
        input: { quantity: 1, quality: 0.5, wholesalePrice: 1, switchToCategoryId: "toys" },
      },
    });
    expect(response.status).toBe(200);
  });

  it("rejects an invalid sellingCategoryId on submit/store with 400 (Milestone 6, D-033)", async () => {
    const { sessionId } = await createTestSession(2);
    const tokenFor = async (playerId: string) => {
      const join = await handleApiRequest(req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId } }));
      return (join.body as { token: string }).token;
    };
    const tokenA = await tokenFor("student-1");
    const tokenB = await tokenFor("student-2");
    const companyInput = { quantity: 5, quality: 0.5, wholesalePrice: 8 };

    for (const [token, playerId] of [
      [tokenA, "student-1"],
      [tokenB, "student-2"],
    ] as const) {
      const submit = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/submit/company`,
        query: {},
        headers: { authorization: `Bearer ${token}` },
        body: { companyId: `${playerId}-company`, input: companyInput },
      });
      expect(submit.status).toBe(200);
    }

    const stateAfter = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    expect((stateAfter.body as { state: { currentPhase: string } }).state.currentPhase).toBe("store-turn");

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/store`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: { storeId: "student-1-store", input: { purchases: [], sellingCategoryId: "not-a-real-category" } },
    });
    expect(response.status).toBe(400);
  });

  it("polling with ?since=<current version> reports unchanged, and a fresh submission bumps the version", async () => {
    const { sessionId } = await createTestSession(2);

    const state1 = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    expect(state1.status).toBe(200);
    const { version } = state1.body as { version: number };

    const unchanged = await handleApiRequest(
      req({ method: "GET", path: `/api/sessions/${sessionId}/state`, query: { since: String(version) } }),
    );
    expect(unchanged.body).toEqual({ unchanged: true });

    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token } = joinA.body as { token: string };
    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { companyId: "student-1-company", input: { quantity: 5, quality: 0.5, wholesalePrice: 8 } },
    });

    const state2 = await handleApiRequest(
      req({ method: "GET", path: `/api/sessions/${sessionId}/state`, query: { since: String(version) } }),
    );
    expect(state2.body).not.toEqual({ unchanged: true });
    expect((state2.body as { version: number }).version).toBeGreaterThan(version);
  });

  it(
    "collusion guard: after one player submits, another player's poll response never exposes " +
      "the submitted quantity/price anywhere in the payload",
    async () => {
      const { sessionId } = await createTestSession(2);
      const joinA = await handleApiRequest(
        req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
      );
      const { token } = joinA.body as { token: string };

      const secretWholesalePrice = 987654;
      await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/submit/company`,
        query: {},
        headers: { authorization: `Bearer ${token}` },
        body: { companyId: "student-1-company", input: { quantity: 42424242, quality: 0.5, wholesalePrice: secretWholesalePrice } },
      });

      const pollAsB = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const serialized = JSON.stringify(pollAsB.body);
      expect(serialized).not.toContain("42424242");
      expect(serialized).not.toContain(String(secretWholesalePrice));

      // The unsubmitted list should still report student-2's company as pending — that's
      // metadata about who hasn't submitted, not a leak of what student-1 submitted.
      const body = pollAsB.body as { unsubmittedParticipantIds: string[] };
      expect(body.unsubmittedParticipantIds).toEqual(["student-2-company"]);
    },
  );

  it("auto-drains silent phases via advanceUntilInputRequired once every participant has submitted", async () => {
    const { sessionId } = await createTestSession(2);
    const tokenFor = async (playerId: string) => {
      const join = await handleApiRequest(req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId } }));
      return (join.body as { token: string; player: { companyId: string } }).token;
    };
    const companyIdFor = (playerId: string) => `${playerId}-company`;

    const tokenA = await tokenFor("student-1");
    const tokenB = await tokenFor("student-2");
    const input = { quantity: 5, quality: 0.5, wholesalePrice: 8 };

    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: { companyId: companyIdFor("student-1"), input },
    });

    const midState = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    expect((midState.body as { state: { currentPhase: string } }).state.currentPhase).toBe("company-turn");

    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${tokenB}` },
      body: { companyId: companyIdFor("student-2"), input },
    });

    const finalState = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    // Once both companies submit, company-settlement/wholesale-market-update need no human
    // input, so advanceUntilInputRequired() should have drained straight through to store-turn.
    expect((finalState.body as { state: { currentPhase: string } }).state.currentPhase).toBe("store-turn");
  });
});

describe("submission timeout and force-advance (Milestone 4 3단계, D-029)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("issues a teacherToken on session creation and never leaks it via GET /slots", async () => {
    const { sessionId, teacherToken } = await createTestSession(2);
    expect(typeof teacherToken).toBe("string");

    const slots = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/slots` }));
    expect(JSON.stringify(slots.body)).not.toContain(teacherToken);

    const state = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    expect(JSON.stringify(state.body)).not.toContain(teacherToken);
  });

  it("rejects force-advance without a valid teacherToken (missing or player token), accepts the real teacherToken", async () => {
    const { sessionId, teacherToken } = await createTestSession(2);
    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token: playerToken } = joinA.body as { token: string };

    const noToken = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/force-advance`,
      query: {},
      headers: {},
    });
    expect(noToken.status).toBe(401);

    const withPlayerToken = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/force-advance`,
      query: {},
      headers: { authorization: `Bearer ${playerToken}` },
    });
    expect(withPlayerToken.status).toBe(401);

    const withTeacherToken = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/force-advance`,
      query: {},
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    expect(withTeacherToken.status).toBe(200);
  });

  it("force-advance actually drains an unsubmitted company-turn via the bot fallback (phase really moves on)", async () => {
    const { sessionId, teacherToken } = await createTestSession(2);

    const before = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    expect((before.body as { state: { currentPhase: string } }).state.currentPhase).toBe("company-turn");

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/force-advance`,
      query: {},
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    expect(response.status).toBe(200);

    const after = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    // Nobody submitted, so both companies were bot-backfilled by the forced phase, and the
    // following silent phases (settlement, wholesale market update) auto-drain — the phase
    // must have actually moved on to store-turn, not stayed stuck at company-turn.
    expect((after.body as { state: { currentPhase: string } }).state.currentPhase).toBe("store-turn");
  });

  it("force-advance on an already-finished game is a no-op 200 (does not error)", async () => {
    const { sessionId, teacherToken } = await createTestSession(1);
    const advance = () =>
      handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/force-advance`,
        query: {},
        headers: { authorization: `Bearer ${teacherToken}` },
      });
    const isGameOver = async () => {
      const state = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      return (state.body as { gameOver: boolean }).gameOver;
    };

    let guard = 0;
    while (!(await isGameOver()) && guard < 50) {
      const response = await advance();
      expect(response.status).toBe(200);
      guard += 1;
    }
    expect(await isGameOver()).toBe(true);

    const noop = await advance();
    expect(noop.status).toBe(200);
    expect(noop.body).toEqual({ ok: true, gameOver: true });
  });

  it(
    "auto-force-advances once the deadline passes even when the polling client always sends " +
      "since=<its own stale version> (order-bug regression: timeout check must run before the " +
      "since fast-path, otherwise a session nobody submits to would report unchanged forever)",
    async () => {
      const { sessionId } = await createTestSession(2);

      const initial = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const { version } = initial.body as { version: number };
      const pollWithStaleSince = () =>
        handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state`, query: { since: String(version) } }));

      const beforeDeadline = await pollWithStaleSince();
      expect(beforeDeadline.body).toEqual({ unchanged: true });

      vi.advanceTimersByTime(DEFAULT_SUBMISSION_TIMEOUT_MS + 1_000);

      const afterDeadline = await pollWithStaleSince();
      expect(afterDeadline.body).not.toEqual({ unchanged: true });
      const body = afterDeadline.body as { version: number; state: { currentPhase: string } };
      expect(body.version).toBeGreaterThan(version);
      // company-turn (nobody submitted) got force-advanced, then settlement/wholesale-update
      // silently drained, landing on store-turn.
      expect(body.state.currentPhase).toBe("store-turn");
    },
  );

  it("honors a real just-in-time submission instead of overwriting it with the bot fallback once the deadline passes", async () => {
    const { sessionId } = await createTestSession(2);
    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token: tokenA } = joinA.body as { token: string };

    const distinctiveWholesalePrice = 12345;
    vi.advanceTimersByTime(DEFAULT_SUBMISSION_TIMEOUT_MS - 1_000);
    const submitA = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: { companyId: "student-1-company", input: { quantity: 7, quality: 0.5, wholesalePrice: distinctiveWholesalePrice } },
    });
    expect(submitA.status).toBe(200);

    // student-2 never submits; push past the original deadline and let the next poll force-advance.
    vi.advanceTimersByTime(2_000);
    const after = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    const state = (
      after.body as { state: { wholesaleListings: Array<{ companyId: string; price: number }> } }
    ).state;
    const listingForA = state.wholesaleListings.find((listing) => listing.companyId === "student-1-company");
    expect(listingForA?.price).toBe(distinctiveWholesalePrice);
  });

  it(
    "honors a teacher-configured submissionTimeoutMs instead of the fixed DEFAULT_SUBMISSION_TIMEOUT_MS " +
      "(구매 매칭 알고리즘 재설계 Stage 2 — checkAndApplyTimeout must read GameSession.getSubmissionTimeoutSettings())",
    async () => {
      const customTimeoutMs = 5_000;
      const { sessionId } = await createTestSession(2, { submissionTimeoutMs: customTimeoutMs });

      // Well short of the custom deadline: nothing should force-advance yet.
      vi.advanceTimersByTime(customTimeoutMs - 1_000);
      const beforeDeadline = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      expect((beforeDeadline.body as { state: { currentPhase: string } }).state.currentPhase).toBe("company-turn");

      // Past the custom (short) deadline but still well under the old fixed 120s default —
      // if this were still hardcoded to DEFAULT_SUBMISSION_TIMEOUT_MS, this would fail.
      vi.advanceTimersByTime(2_000);
      const afterDeadline = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      expect((afterDeadline.body as { state: { currentPhase: string } }).state.currentPhase).toBe("store-turn");
    },
  );

  it(
    "never force-advances when the teacher disabled the submission timeout (submissionTimeoutEnabled: false)",
    async () => {
      const { sessionId } = await createTestSession(2, { submissionTimeoutEnabled: false });

      // Push far past the old fixed default (120s) — with the timeout disabled, nobody should
      // ever be force-advanced by polling alone.
      vi.advanceTimersByTime(DEFAULT_SUBMISSION_TIMEOUT_MS * 10);
      const state = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      expect((state.body as { state: { currentPhase: string } }).state.currentPhase).toBe("company-turn");
    },
  );

  it("does not reset phaseStartedAt on partial/repeated submissions (cannot be used to extend other players' deadline)", async () => {
    const { sessionId } = await createTestSession(2);
    const entry = getSession(sessionId);
    if (!entry) throw new Error("expected session to exist");
    const initialPhaseStartedAt = entry.phaseStartedAt;

    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token } = joinA.body as { token: string };

    vi.advanceTimersByTime(5_000);
    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { companyId: "student-1-company", input: { quantity: 1, quality: 0.5, wholesalePrice: 1 } },
    });
    expect(entry.phaseStartedAt).toBe(initialPhaseStartedAt);

    vi.advanceTimersByTime(5_000);
    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { companyId: "student-1-company", input: { quantity: 2, quality: 0.5, wholesalePrice: 2 } },
    });
    expect(entry.phaseStartedAt).toBe(initialPhaseStartedAt);
  });
});

describe("POST /api/sessions/:id/acknowledge-round-result (Milestone 4 4-a, D-030)", () => {
  it("rejects a missing or unrecognized bearer token with 401", async () => {
    const { sessionId } = await createTestSession(2);
    await driveToRoundResult(sessionId);

    const noToken = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/acknowledge-round-result`,
      query: {},
      headers: {},
    });
    expect(noToken.status).toBe(401);

    const badToken = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/acknowledge-round-result`,
      query: {},
      headers: { authorization: "Bearer no-such-token" },
    });
    expect(badToken.status).toBe(401);
  });

  it("returns 400 when the current phase isn't round-result", async () => {
    const { sessionId } = await createTestSession(2);
    // Fresh session starts at company-turn, not round-result.
    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token } = joinA.body as { token: string };

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/acknowledge-round-result`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(400);
  });

  it("acknowledges successfully (200) and blocks advancement until every player has acknowledged", async () => {
    const { sessionId } = await createTestSession(2);
    await driveToRoundResult(sessionId);

    const joinA = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-1" } }),
    );
    const { token: tokenA } = joinA.body as { token: string };
    const joinB = await handleApiRequest(
      req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId: "student-2" } }),
    );
    const { token: tokenB } = joinB.body as { token: string };

    const ackA = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/acknowledge-round-result`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(ackA.status).toBe(200);
    expect(ackA.body).toEqual({ ok: true });

    // Only one of two players acknowledged — still stuck at round-result, round 1.
    const midState = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    const mid = (midState.body as { state: { currentPhase: string; currentRound: number } }).state;
    expect(mid.currentPhase).toBe("round-result");
    expect(mid.currentRound).toBe(1);

    const ackB = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/acknowledge-round-result`,
      query: {},
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(ackB.status).toBe(200);

    // Both acknowledged — the session should have auto-drained into round 2's company-turn.
    const finalState = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    const final = (finalState.body as { state: { currentPhase: string; currentRound: number } }).state;
    expect(final.currentPhase).toBe("company-turn");
    expect(final.currentRound).toBe(2);
  });

  it("does not auto-force-advance round-result on submission timeout (only a manual teacher force-advance can), while other phases still auto-force-advance", async () => {
    vi.useFakeTimers();
    try {
      const { sessionId, teacherToken } = await createTestSession(2);
      await driveToRoundResult(sessionId);

      vi.advanceTimersByTime(DEFAULT_SUBMISSION_TIMEOUT_MS + 1_000);
      const polled = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const polledState = (polled.body as { state: { currentPhase: string; currentRound: number } }).state;
      // No auto force-advance out of round-result even though the submission timeout elapsed.
      expect(polledState.currentPhase).toBe("round-result");
      expect(polledState.currentRound).toBe(1);

      // The teacher's manual force-advance still works in round-result.
      const forceAdvance = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/force-advance`,
        query: {},
        headers: { authorization: `Bearer ${teacherToken}` },
      });
      expect(forceAdvance.status).toBe(200);

      const afterForce = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const afterForceState = (afterForce.body as { state: { currentPhase: string; currentRound: number } }).state;
      expect(afterForceState.currentPhase).toBe("company-turn");
      expect(afterForceState.currentRound).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("regression: other phases (e.g. company-turn) still auto-force-advance on submission timeout", async () => {
    vi.useFakeTimers();
    try {
      const { sessionId } = await createTestSession(2);

      const before = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      expect((before.body as { state: { currentPhase: string } }).state.currentPhase).toBe("company-turn");

      vi.advanceTimersByTime(DEFAULT_SUBMISSION_TIMEOUT_MS + 1_000);
      const after = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      expect((after.body as { state: { currentPhase: string } }).state.currentPhase).toBe("store-turn");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("POST /api/sessions/:id/setup and /close-lobby (Milestone 4 4단계 서버 부분, D-030)", () => {
  function validChoices() {
    return {
      companyDistrictId: "industrial",
      companyCategoryId: "electronics",
      storeDistrictId: "downtown",
      storeCategoryId: "toys",
    };
  }

  async function joinAndGetToken(sessionId: string, playerId: string): Promise<string> {
    const join = await handleApiRequest(req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId } }));
    return (join.body as { token: string }).token;
  }

  it("rejects /setup without a valid bearer token (401)", async () => {
    const { sessionId } = await createTestSession(2, { closeLobby: false });

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/setup`,
      query: {},
      headers: {},
      body: validChoices(),
    });
    expect(response.status).toBe(401);
  });

  it("rejects /setup with an invalid districtId/categoryId (400)", async () => {
    const { sessionId } = await createTestSession(2, { closeLobby: false });
    const token = await joinAndGetToken(sessionId, "student-1");

    const response = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/setup`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: { ...validChoices(), companyDistrictId: "not-a-real-district" },
    });
    expect(response.status).toBe(400);
  });

  it("applies a valid /setup (200) and updates that student's company/store, and blocks submit/company while the lobby is still open", async () => {
    const { sessionId } = await createTestSession(2, { closeLobby: false });
    const tokenA = await joinAndGetToken(sessionId, "student-1");

    const setupResponse = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/setup`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: validChoices(),
    });
    expect(setupResponse.status).toBe(200);

    const state = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    const gameState = (state.body as { state: { companies: Record<string, { districtId: string; productCategoryId: string }>; stores: Record<string, { districtId: string; specialtyCategoryId: string }> } }).state;
    expect(gameState.companies["student-1-company"]!.districtId).toBe("industrial");
    expect(gameState.companies["student-1-company"]!.productCategoryId).toBe("electronics");
    expect(gameState.stores["student-1-store"]!.districtId).toBe("downtown");
    expect(gameState.stores["student-1-store"]!.specialtyCategoryId).toBe("toys");

    // Only one of two students has finished setup, so the lobby is still open and company
    // submissions must be rejected (even from the student who already finished setup).
    const submitAttempt = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: { companyId: "student-1-company", input: { quantity: 5, quality: 0.5, wholesalePrice: 8 } },
    });
    expect(submitAttempt.status).toBe(400);
  });

  it("once every student has submitted /setup, the lobby closes on its own and submit/company is accepted", async () => {
    const { sessionId } = await createTestSession(2, { closeLobby: false });
    const tokenA = await joinAndGetToken(sessionId, "student-1");
    const tokenB = await joinAndGetToken(sessionId, "student-2");

    for (const token of [tokenA, tokenB]) {
      const response = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/setup`,
        query: {},
        headers: { authorization: `Bearer ${token}` },
        body: validChoices(),
      });
      expect(response.status).toBe(200);
    }

    const submit = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: { companyId: "student-1-company", input: { quantity: 5, quality: 0.5, wholesalePrice: 8 } },
    });
    expect(submit.status).toBe(200);
  });

  it("rejects /setup once the lobby has already closed (400)", async () => {
    const { sessionId, teacherToken } = await createTestSession(2, { closeLobby: false });
    const token = await joinAndGetToken(sessionId, "student-1");

    const closeLobby = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/close-lobby`,
      query: {},
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    expect(closeLobby.status).toBe(200);

    const setupResponse = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/setup`,
      query: {},
      headers: { authorization: `Bearer ${token}` },
      body: validChoices(),
    });
    expect(setupResponse.status).toBe(400);
  });

  it("rejects /close-lobby with a missing or player token (401), accepts the teacher token (200), and a repeat call is a harmless no-op (200)", async () => {
    const { sessionId, teacherToken } = await createTestSession(2, { closeLobby: false });
    const playerToken = await joinAndGetToken(sessionId, "student-1");

    const noToken = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/close-lobby`,
      query: {},
      headers: {},
    });
    expect(noToken.status).toBe(401);

    const withPlayerToken = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/close-lobby`,
      query: {},
      headers: { authorization: `Bearer ${playerToken}` },
    });
    expect(withPlayerToken.status).toBe(401);

    const withTeacherToken = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/close-lobby`,
      query: {},
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    expect(withTeacherToken.status).toBe(200);

    const repeat = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/close-lobby`,
      query: {},
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    expect(repeat.status).toBe(200);
  });

  it("GET /state reports an accurate lobby field (open + unsubmittedPlayerIds) while the lobby is open, and reports closed once it closes", async () => {
    const { sessionId, teacherToken } = await createTestSession(2, { closeLobby: false });
    const tokenA = await joinAndGetToken(sessionId, "student-1");

    const beforeSetup = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    const beforeLobby = (beforeSetup.body as { lobby: { open: boolean; unsubmittedPlayerIds: string[] } }).lobby;
    expect(beforeLobby.open).toBe(true);
    expect(beforeLobby.unsubmittedPlayerIds.sort()).toEqual(["student-1", "student-2"]);

    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/setup`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: validChoices(),
    });

    const afterOneSetup = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    const midLobby = (afterOneSetup.body as { lobby: { open: boolean; unsubmittedPlayerIds: string[] } }).lobby;
    expect(midLobby.open).toBe(true);
    expect(midLobby.unsubmittedPlayerIds).toEqual(["student-2"]);

    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/close-lobby`,
      query: {},
      headers: { authorization: `Bearer ${teacherToken}` },
    });

    const afterClose = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    const closedLobby = (afterClose.body as { lobby: { open: boolean; unsubmittedPlayerIds: string[] } }).lobby;
    expect(closedLobby.open).toBe(false);
    expect(closedLobby.unsubmittedPlayerIds).toEqual([]);
  });

  it(
    "regression: closing the lobby bumps GameSession's version, so a since-based poll doesn't " +
      "miss it (code-reviewer-found bug — GameSession itself never changes when the lobby closes " +
      "via /close-lobby, so a polling client using `since=<pre-close version>` would otherwise get " +
      "{unchanged:true} forever and never learn the lobby closed)",
    async () => {
      const { sessionId, teacherToken } = await createTestSession(2, { closeLobby: false });

      const before = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const { version } = before.body as { version: number };
      expect((before.body as { lobby: { open: boolean } }).lobby.open).toBe(true);

      await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/close-lobby`,
        query: {},
        headers: { authorization: `Bearer ${teacherToken}` },
      });

      const polled = await handleApiRequest(
        req({ method: "GET", path: `/api/sessions/${sessionId}/state`, query: { since: String(version) } }),
      );
      expect(polled.body).not.toEqual({ unchanged: true });
      expect((polled.body as { lobby: { open: boolean } }).lobby.open).toBe(false);
    },
  );

  it(
    "regression: force-advance while the lobby is still open closes the lobby first instead of " +
      "bypassing it (code-reviewer-found bug — previously force-advance ran company-turn with bot " +
      "fallback while GET /state kept reporting lobby.open:true forever, permanently locking out " +
      "students who hadn't finished /setup yet, since applyBusinessSetupChoices rejects once " +
      "round 1's company-turn has executed)",
    async () => {
      const { sessionId, teacherToken } = await createTestSession(2, { closeLobby: false });
      // Join before force-advance so this token is one that was already valid while the lobby
      // was still open — Milestone 4 6단계 also permanently excludes anyone who never finished
      // /setup by the time the lobby actually closes, so a *fresh* join attempted after the fact
      // would itself be rejected (that's covered by a dedicated test below) and would obscure
      // what this regression test is actually about: that the late /setup itself gets an honest
      // "lobby already closed" business-logic rejection rather than looking stuck.
      const lateToken = await joinAndGetToken(sessionId, "student-2");

      const before = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const beforeBody = before.body as { lobby: { open: boolean }; state: { currentPhase: string } };
      expect(beforeBody.lobby.open).toBe(true);
      expect(beforeBody.state.currentPhase).toBe("company-turn");

      const forceAdvance = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/force-advance`,
        query: {},
        headers: { authorization: `Bearer ${teacherToken}` },
      });
      expect(forceAdvance.status).toBe(200);

      const after = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const afterBody = after.body as { lobby: { open: boolean } };
      // The old bug: this stayed `true` forever even though the phase had already moved on.
      expect(afterBody.lobby.open).toBe(false);

      // A student who hadn't finished /setup yet gets an honest "lobby already closed" — not
      // silently accepted, and not stuck behind a lobby.open:true lie.
      const lateSetup = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/setup`,
        query: {},
        headers: { authorization: `Bearer ${lateToken}` },
        body: validChoices(),
      });
      expect(lateSetup.status).toBe(400);
    },
  );

  it("auto-closes the lobby once DEFAULT_LOBBY_TIMEOUT_MS elapses, even without a teacher close-lobby call", async () => {
    // Deliberately does not use vi.useFakeTimers()/advanceTimersByTime(): advancing time by
    // DEFAULT_LOBBY_TIMEOUT_MS (180s) would also blow past DEFAULT_SUBMISSION_TIMEOUT_MS (120s)
    // for the still-current company-turn phase, entangling this lobby-only test with the
    // unrelated submission-timeout auto-force-advance. Instead, backdate `lobbyStartedAt`
    // directly (this file already imports `getSession` for this kind of internal-state check).
    const { sessionId } = await createTestSession(2, { closeLobby: false });
    // student-1 actually finishes /setup before the timeout; student-2 never does. This mirrors
    // the realistic case the timeout is meant to handle (a genuine no-show), and — since
    // Milestone 4 6단계 permanently excludes anyone who never finished /setup by the time the
    // lobby closes — keeps at least one real human player in the session so this test still
    // exercises the timer arithmetic it's meant to (a session with zero remaining human players
    // has nothing left for `isWaitingForHumanInput()` to wait on, which is a different, degenerate
    // scenario covered separately).
    const tokenA = await joinAndGetToken(sessionId, "student-1");
    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/setup`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: validChoices(),
    });
    const tokenB = await joinAndGetToken(sessionId, "student-2");
    const entry = getSession(sessionId);
    if (!entry) throw new Error("expected session to exist");

    const before = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    expect((before.body as { lobby: { open: boolean } }).lobby.open).toBe(true);

    entry.lobbyStartedAt = Date.now() - (DEFAULT_LOBBY_TIMEOUT_MS + 1_000);

    const after = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
    expect((after.body as { lobby: { open: boolean } }).lobby.open).toBe(false);

    // Once the lobby has timed out, the student who actually finished /setup can submit normally
    // (not stuck forever).
    const submit = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: { companyId: "student-1-company", input: { quantity: 5, quality: 0.5, wholesalePrice: 8 } },
    });
    expect(submit.status).toBe(200);

    // student-2 never finished /setup before the lobby timed out — Milestone 4 6단계: permanently
    // excluded, so their (still technically valid, pre-timeout) token is rejected too.
    const ghostSubmit = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/submit/company`,
      query: {},
      headers: { authorization: `Bearer ${tokenB}` },
      body: { companyId: "student-2-company", input: { quantity: 5, quality: 0.5, wholesalePrice: 8 } },
    });
    expect(ghostSubmit.status).toBe(401);
  });

  it(
    "regression: a lobby that runs past DEFAULT_SUBMISSION_TIMEOUT_MS (120s) but closes before " +
      "DEFAULT_LOBBY_TIMEOUT_MS (180s) does not force-advance company-turn while still open, and " +
      "gives a fresh 120s window starting from the moment the lobby actually closes (not from " +
      "session creation) — code-reviewer-found bug, previously the lobby wait time was silently " +
      "inherited by the submission clock, so a slow-but-legitimate lobby could force-advance " +
      "students out of company-turn (permanently locking them out of /setup) before they ever got " +
      "a real chance to submit.",
    async () => {
      vi.useFakeTimers();
      try {
        const { sessionId, teacherToken } = await createTestSession(2, { closeLobby: false });
        // student-1 finishes /setup so at least one real human player remains in the session once
        // the lobby closes (Milestone 4 6단계 permanently excludes anyone who never finished
        // /setup) — otherwise `isWaitingForHumanInput()` would have nobody left to wait on and
        // the deadline-based auto-force-advance this test exercises would never fire, which is a
        // different, degenerate scenario unrelated to what's being tested here (timer arithmetic).
        const tokenA = await joinAndGetToken(sessionId, "student-1");
        await handleApiRequest({
          method: "POST",
          path: `/api/sessions/${sessionId}/setup`,
          query: {},
          headers: { authorization: `Bearer ${tokenA}` },
          body: validChoices(),
        });

        // Lobby runs long (130s) — past the 120s submission timeout, but still under the 180s
        // lobby timeout. student-2 never finishes setup.
        vi.advanceTimersByTime(130_000);
        const whileLobbyOpen = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
        const lobbyStillOpen = (whileLobbyOpen.body as { lobby: { open: boolean }; state: { currentPhase: string } }).lobby;
        expect(lobbyStillOpen.open).toBe(true);
        // The old bug: this would already have force-advanced to store-turn here.
        expect((whileLobbyOpen.body as { state: { currentPhase: string } }).state.currentPhase).toBe("company-turn");

        // Teacher closes the lobby now, at t=130s.
        const closeLobby = await handleApiRequest({
          method: "POST",
          path: `/api/sessions/${sessionId}/close-lobby`,
          query: {},
          headers: { authorization: `Bearer ${teacherToken}` },
        });
        expect(closeLobby.status).toBe(200);

        // Immediately after closing (still t=130s), company-turn must not already be considered
        // overdue — the fresh window starts now, not at session creation (t=0).
        const justAfterClose = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
        expect((justAfterClose.body as { state: { currentPhase: string } }).state.currentPhase).toBe("company-turn");

        // 119s after the lobby closed (t=249s): still within the fresh 120s window.
        vi.advanceTimersByTime(119_000);
        const justBeforeDeadline = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
        expect((justBeforeDeadline.body as { state: { currentPhase: string } }).state.currentPhase).toBe("company-turn");

        // 121s after the lobby closed (t=251s): the fresh window has now elapsed, so the usual
        // auto-force-advance behavior applies (unrelated to the lobby anymore).
        vi.advanceTimersByTime(2_000);
        const afterDeadline = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
        expect((afterDeadline.body as { state: { currentPhase: string } }).state.currentPhase).not.toBe("company-turn");
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

describe("Milestone 4 6단계: 로비 종료 시점에 미제출 학생을 영구히 제외 (GameSession.finalizeLobbyMembership)", () => {
  function validChoices() {
    return {
      companyDistrictId: "industrial",
      companyCategoryId: "electronics",
      storeDistrictId: "downtown",
      storeCategoryId: "toys",
    };
  }

  async function joinAndGetToken(sessionId: string, playerId: string): Promise<string> {
    const join = await handleApiRequest(req({ method: "POST", path: `/api/sessions/${sessionId}/join`, body: { playerId } }));
    return (join.body as { token: string }).token;
  }

  it(
    "once the teacher closes the lobby with only 1 of 3 students having submitted /setup, that " +
      "student alone can drive submit/company forward, round-result's unsubmittedParticipantIds " +
      "no longer lists the other two, and that student's lone acknowledge-round-result advances " +
      "the game to round 2 without any teacher force-advance",
    async () => {
      const { sessionId, teacherToken } = await createTestSession(3, { closeLobby: false });
      const tokenA = await joinAndGetToken(sessionId, "student-1");
      await joinAndGetToken(sessionId, "student-2"); // joins but never submits /setup
      await joinAndGetToken(sessionId, "student-3"); // joins but never submits /setup

      const setupA = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/setup`,
        query: {},
        headers: { authorization: `Bearer ${tokenA}` },
        body: validChoices(),
      });
      expect(setupA.status).toBe(200);

      const closeLobby = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/close-lobby`,
        query: {},
        headers: { authorization: `Bearer ${teacherToken}` },
      });
      expect(closeLobby.status).toBe(200);

      const submit = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/submit/company`,
        query: {},
        headers: { authorization: `Bearer ${tokenA}` },
        body: { companyId: "student-1-company", input: { quantity: 5, quality: 0.5, wholesalePrice: 8 } },
      });
      expect(submit.status).toBe(200);

      // Only the submitting student was ever waited on — the phase already moved on.
      const afterCompanyTurn = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      expect((afterCompanyTurn.body as { state: { currentPhase: string } }).state.currentPhase).not.toBe("company-turn");

      await driveToRoundResult(sessionId);
      const roundResultState = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const unsubmitted = (roundResultState.body as { unsubmittedParticipantIds: string[] }).unsubmittedParticipantIds;
      expect(unsubmitted).toEqual(["student-1"]);
      expect(unsubmitted).not.toContain("student-2");
      expect(unsubmitted).not.toContain("student-3");

      const ack = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/acknowledge-round-result`,
        query: {},
        headers: { authorization: `Bearer ${tokenA}` },
      });
      expect(ack.status).toBe(200);

      const afterAck = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      const afterAckState = (afterAck.body as { state: { currentPhase: string; currentRound: number } }).state;
      expect(afterAckState.currentRound).toBe(2);
      expect(afterAckState.currentPhase).toBe("company-turn");
    },
  );

  it(
    "a ghost student's token (joined but never submitted /setup before the lobby closed) is " +
      "rejected on a late submit/company, and on a late acknowledge-round-result",
    async () => {
      const { sessionId, teacherToken } = await createTestSession(3, { closeLobby: false });
      const tokenA = await joinAndGetToken(sessionId, "student-1");
      await joinAndGetToken(sessionId, "student-2");
      const ghostToken = await joinAndGetToken(sessionId, "student-3");

      await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/setup`,
        query: {},
        headers: { authorization: `Bearer ${tokenA}` },
        body: validChoices(),
      });

      await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/close-lobby`,
        query: {},
        headers: { authorization: `Bearer ${teacherToken}` },
      });

      const ghostSubmit = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/submit/company`,
        query: {},
        headers: { authorization: `Bearer ${ghostToken}` },
        body: { companyId: "student-3-company", input: { quantity: 5, quality: 0.5, wholesalePrice: 8 } },
      });
      // The token is still recognized by the token store (it was legitimately issued at /join),
      // but this session no longer treats "student-3" as a human player it waits on — the
      // existing submit/company guard (`entry.session.getPlayers().find(...)`) rejects it exactly
      // like an unrecognized token.
      expect(ghostSubmit.status).toBe(401);

      await driveToRoundResult(sessionId);
      const ghostAck = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/acknowledge-round-result`,
        query: {},
        headers: { authorization: `Bearer ${ghostToken}` },
      });
      // acknowledge-round-result resolves the token to a playerId directly and only then asks
      // GameSession to record the ack, so a ghost's rejection surfaces as a 400 (GameSession
      // throwing "unknown or non-human playerId") rather than submit/company's 401 — both reject
      // the ghost, just via slightly different codepaths already present before this change.
      expect(ghostAck.status).toBe(400);
    },
  );

  it("doForceAdvance (teacher force-advance) closing a still-open lobby also finalizes ghost membership", async () => {
    const { sessionId, teacherToken } = await createTestSession(3, { closeLobby: false });
    const tokenA = await joinAndGetToken(sessionId, "student-1");
    await joinAndGetToken(sessionId, "student-2");

    await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/setup`,
      query: {},
      headers: { authorization: `Bearer ${tokenA}` },
      body: validChoices(),
    });

    const forceAdvance = await handleApiRequest({
      method: "POST",
      path: `/api/sessions/${sessionId}/force-advance`,
      query: {},
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    expect(forceAdvance.status).toBe(200);

    const entry = getSession(sessionId);
    if (!entry) throw new Error("expected session to exist");
    // student-2 and student-3 never finished /setup before the teacher forced the lobby closed —
    // they must no longer be part of this session's human players.
    expect(entry.session.getPlayers().map((p) => p.id).sort()).toEqual(["student-1"]);
  });

  it(
    "regression: force-advance called after the lobby's wall-clock timeout has elapsed but " +
      "before any GET /state poll has ever run does not crash and still finalizes ghost " +
      "membership (code-reviewer 2차 발견 — isLobbyOpen() already returns false once the " +
      "180s timeout has elapsed, purely from a Date.now() comparison, even though " +
      "markLobbyClosedIfNeeded/finalizeLobbyMembership was never actually called yet; gating " +
      "doForceAdvance's finalize attempt behind `if (isLobbyOpen(entry))` skipped it entirely " +
      "and let advancePhase(true) run company-turn first, so the next markLobbyClosedIfNeeded " +
      "call — from any later poll — threw because finalizeLobbyMembership's precondition " +
      "(still round 1's company-turn) no longer held, and the ghost was never excluded)",
    async () => {
      const { sessionId, teacherToken } = await createTestSession(2, { closeLobby: false });
      const tokenA = await joinAndGetToken(sessionId, "student-1");
      await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/setup`,
        query: {},
        headers: { authorization: `Bearer ${tokenA}` },
        body: validChoices(),
      });
      // student-2 never joins/submits /setup.

      const entry = getSession(sessionId);
      if (!entry) throw new Error("expected session to exist");
      entry.lobbyStartedAt = Date.now() - (DEFAULT_LOBBY_TIMEOUT_MS + 1_000);
      // Crucially: no GET /state (or any other request) happens here — lobbyTimerConsumed is
      // still false, even though isLobbyOpen(entry) would already report false due to the
      // elapsed wall clock. force-advance is the very first request since the timeout elapsed.

      const forceAdvance = await handleApiRequest({
        method: "POST",
        path: `/api/sessions/${sessionId}/force-advance`,
        query: {},
        headers: { authorization: `Bearer ${teacherToken}` },
      });
      expect(forceAdvance.status).toBe(200);

      // The old bug: this next call would throw an uncaught error (finalizeLobbyMembership's
      // "before round 1's company-turn" precondition already violated by advancePhase(true)
      // having run without ever finalizing membership first).
      const afterForceAdvance = await handleApiRequest(req({ method: "GET", path: `/api/sessions/${sessionId}/state` }));
      expect(afterForceAdvance.status).toBe(200);

      // student-2 never finished /setup — must have been excluded, not left as a permanent
      // human ghost for the rest of the game.
      expect(entry.session.getPlayers().map((p) => p.id)).toEqual(["student-1"]);
    },
  );
});
