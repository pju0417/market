import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest, type ApiRequest } from "../../src/server/httpApi.js";
import { getSession } from "../../src/server/sessionRegistry.js";
import { DEFAULT_SUBMISSION_TIMEOUT_MS } from "../../src/server/timeoutConfig.js";

function req(partial: Partial<ApiRequest> & Pick<ApiRequest, "method" | "path">): ApiRequest {
  return { query: {}, headers: {}, ...partial };
}

async function createTestSession(studentCount = 2): Promise<{ sessionId: string; teacherToken: string }> {
  const response = await handleApiRequest(
    req({ method: "POST", path: "/api/sessions", body: { studentCount, rngSeed: 1 } }),
  );
  expect(response.status).toBe(201);
  const body = response.body as { sessionId: string; teacherToken: string };
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
