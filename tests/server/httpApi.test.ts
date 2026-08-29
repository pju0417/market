import { describe, expect, it } from "vitest";
import { handleApiRequest, type ApiRequest } from "../../src/server/httpApi.js";

function req(partial: Partial<ApiRequest> & Pick<ApiRequest, "method" | "path">): ApiRequest {
  return { query: {}, headers: {}, ...partial };
}

async function createTestSession(studentCount = 2): Promise<string> {
  const response = await handleApiRequest(
    req({ method: "POST", path: "/api/sessions", body: { studentCount, rngSeed: 1 } }),
  );
  expect(response.status).toBe(201);
  return (response.body as { sessionId: string }).sessionId;
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
    const sessionId = await createTestSession(2);
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
    const sessionId = await createTestSession(2);

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
    const sessionId = await createTestSession(2);
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
    const sessionId = await createTestSession(2);
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
    const sessionId = await createTestSession(2);
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
    const sessionId = await createTestSession(2);
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
    const sessionId = await createTestSession(2);

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
      const sessionId = await createTestSession(2);
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
    const sessionId = await createTestSession(2);
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
