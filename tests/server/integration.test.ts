import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiRequestListener } from "../../src/server/nodeAdapter.js";

/**
 * `http.createServer(nodeAdapter(...)).listen(0)` + Node 전역 `fetch`로 실제 TCP를 거치는
 * 통합 테스트 (Milestone 4 2단계 architect 계획). `tests/server/httpApi.test.ts`가 이미
 * `handleApiRequest`를 서버 없이 검증하므로, 여기서는 "실제로 두 클라이언트가 TCP 위에서
 * join → submit → poll을 왕복하며 라운드가 정산되는지"만 확인한다.
 */

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(createApiRequestListener());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function postJson(path: string, body: unknown, token?: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
}

interface JoinResult {
  token: string;
  player: { id: string; companyId: string; storeId: string; householdId: string };
}

describe("Milestone 4 2단계 integration: real TCP server, two virtual student clients", () => {
  it("lets two students join, submit each phase's decisions, and reach round settlement", async () => {
    const created = await postJson("/api/sessions", { studentCount: 2, rngSeed: 7 });
    expect(created.status).toBe(201);
    const { sessionId } = created.body as { sessionId: string };

    const slotsResponse = await getJson(`/api/sessions/${sessionId}/slots`);
    expect(slotsResponse.status).toBe(200);
    const slots = slotsResponse.body as Array<{ playerId: string }>;
    expect(slots).toHaveLength(2);

    const joinA = await postJson(`/api/sessions/${sessionId}/join`, { playerId: "student-1" });
    const joinB = await postJson(`/api/sessions/${sessionId}/join`, { playerId: "student-2" });
    expect(joinA.status).toBe(200);
    expect(joinB.status).toBe(200);
    const { token: tokenA, player: playerA } = joinA.body as JoinResult;
    const { token: tokenB, player: playerB } = joinB.body as JoinResult;

    // Wrong-player submission attempt is rejected: A's token cannot submit for B's company.
    const spoofAttempt = await postJson(
      `/api/sessions/${sessionId}/submit/company`,
      { companyId: playerB.companyId, input: { quantity: 5, quality: 0.5, wholesalePrice: 8 } },
      tokenA,
    );
    expect(spoofAttempt.status).toBe(403);

    const stateBeforeAnySubmit = await getJson(`/api/sessions/${sessionId}/state`);
    const versionBefore = (stateBeforeAnySubmit.body as { version: number }).version;

    const submitA = await postJson(
      `/api/sessions/${sessionId}/submit/company`,
      { companyId: playerA.companyId, input: { quantity: 12, quality: 0.6, wholesalePrice: 9 } },
      tokenA,
    );
    expect(submitA.status).toBe(200);

    const pollAfterA = await getJson(`/api/sessions/${sessionId}/state`);
    const afterA = pollAfterA.body as { version: number; state: { currentPhase: string } };
    expect(afterA.version).toBeGreaterThan(versionBefore);
    // Still company-turn: student-2 hasn't submitted yet, so the phase hasn't advanced.
    expect(afterA.state.currentPhase).toBe("company-turn");
    // Collusion guard: B's own submission content must never leak in this shared poll response.
    expect(JSON.stringify(pollAfterA.body)).not.toContain('"wholesalePrice":9');

    const submitB = await postJson(
      `/api/sessions/${sessionId}/submit/company`,
      { companyId: playerB.companyId, input: { quantity: 10, quality: 0.5, wholesalePrice: 7 } },
      tokenB,
    );
    expect(submitB.status).toBe(200);

    const pollAfterBoth = await getJson(`/api/sessions/${sessionId}/state`);
    const afterBoth = pollAfterBoth.body as { state: { currentPhase: string } };
    // Both companies submitted, so company-settlement/wholesale-market-update (no human input
    // needed) should have been auto-drained straight through to store-turn.
    expect(afterBoth.state.currentPhase).toBe("store-turn");

    const submitStoreA = await postJson(
      `/api/sessions/${sessionId}/submit/store`,
      { storeId: playerA.storeId, input: { purchases: [], retailPrice: 15 } },
      tokenA,
    );
    expect(submitStoreA.status).toBe(200);
    const submitStoreB = await postJson(
      `/api/sessions/${sessionId}/submit/store`,
      { storeId: playerB.storeId, input: { purchases: [], retailPrice: 15 } },
      tokenB,
    );
    expect(submitStoreB.status).toBe(200);

    const afterStores = await getJson(`/api/sessions/${sessionId}/state`);
    expect((afterStores.body as { state: { currentPhase: string } }).state.currentPhase).toBe("household-turn");

    const submitHouseholdA = await postJson(
      `/api/sessions/${sessionId}/submit/household`,
      { householdId: playerA.householdId, lines: [] },
      tokenA,
    );
    expect(submitHouseholdA.status).toBe(200);
    const submitHouseholdB = await postJson(
      `/api/sessions/${sessionId}/submit/household`,
      { householdId: playerB.householdId, lines: [] },
      tokenB,
    );
    expect(submitHouseholdB.status).toBe(200);

    const afterHouseholds = await getJson(`/api/sessions/${sessionId}/state`);
    const final = afterHouseholds.body as {
      state: { currentPhase: string; currentRound: number; roundMetrics: unknown[] };
      unsubmittedParticipantIds: string[];
      gameOver: boolean;
    };
    // npc-consumer-behavior/round-settlement need no human input either, so this should have
    // drained all the way to round 2's company-turn (or further) with round 1 settled.
    expect(final.state.roundMetrics).toHaveLength(1);
    expect(final.state.currentPhase).toBe("company-turn");
    expect(final.state.currentRound).toBe(2);
    expect(final.gameOver).toBe(false);
    expect(final.unsubmittedParticipantIds.sort()).toEqual([playerA.companyId, playerB.companyId].sort());
  });

  it("rejects a submission with no token and an unknown-session request with 404", async () => {
    const created = await postJson("/api/sessions", { studentCount: 1 });
    const { sessionId } = created.body as { sessionId: string };
    const join = await postJson(`/api/sessions/${sessionId}/join`, { playerId: "student-1" });
    const { player } = join.body as JoinResult;

    const noToken = await postJson(`/api/sessions/${sessionId}/submit/company`, {
      companyId: player.companyId,
      input: { quantity: 1, quality: 0.5, wholesalePrice: 1 },
    });
    expect(noToken.status).toBe(401);

    const unknownSession = await getJson(`/api/sessions/does-not-exist/state`);
    expect(unknownSession.status).toBe(404);
  });

  it("handles two participants submitting genuinely concurrently over real TCP without duplicate or lost settlement (Milestone 4 3단계)", async () => {
    const created = await postJson("/api/sessions", { studentCount: 2, rngSeed: 11 });
    const { sessionId } = created.body as { sessionId: string };

    const joinA = await postJson(`/api/sessions/${sessionId}/join`, { playerId: "student-1" });
    const joinB = await postJson(`/api/sessions/${sessionId}/join`, { playerId: "student-2" });
    const { token: tokenA, player: playerA } = joinA.body as JoinResult;
    const { token: tokenB, player: playerB } = joinB.body as JoinResult;

    // Fire both submissions at the same time (Promise.all) instead of sequentially, to exercise
    // whatever concurrency exists in the real Node event loop/TCP stack.
    const [submitA, submitB] = await Promise.all([
      postJson(
        `/api/sessions/${sessionId}/submit/company`,
        { companyId: playerA.companyId, input: { quantity: 12, quality: 0.6, wholesalePrice: 9 } },
        tokenA,
      ),
      postJson(
        `/api/sessions/${sessionId}/submit/company`,
        { companyId: playerB.companyId, input: { quantity: 10, quality: 0.5, wholesalePrice: 7 } },
        tokenB,
      ),
    ]);
    expect(submitA.status).toBe(200);
    expect(submitB.status).toBe(200);

    const afterBoth = await getJson(`/api/sessions/${sessionId}/state`);
    const state = (
      afterBoth.body as {
        state: { currentPhase: string; wholesaleListings: Array<{ companyId: string; price: number; quantityAvailable: number }> };
      }
    ).state;
    // Neither submission was lost, and the phase advanced exactly once (not stuck, not double
    // advanced past store-turn) — both companies' listings must be present with their own values.
    expect(state.currentPhase).toBe("store-turn");
    const listingA = state.wholesaleListings.find((listing) => listing.companyId === playerA.companyId);
    const listingB = state.wholesaleListings.find((listing) => listing.companyId === playerB.companyId);
    expect(listingA).toMatchObject({ price: 9, quantityAvailable: 12 });
    expect(listingB).toMatchObject({ price: 7, quantityAvailable: 10 });

    // No duplicate settlement: continue through store/household turns and confirm exactly one
    // round of metrics was recorded, not two (which would indicate a double-run phase).
    const submitStoreA = await postJson(
      `/api/sessions/${sessionId}/submit/store`,
      { storeId: playerA.storeId, input: { purchases: [], retailPrice: 15 } },
      tokenA,
    );
    const submitStoreB = await postJson(
      `/api/sessions/${sessionId}/submit/store`,
      { storeId: playerB.storeId, input: { purchases: [], retailPrice: 15 } },
      tokenB,
    );
    expect(submitStoreA.status).toBe(200);
    expect(submitStoreB.status).toBe(200);

    const [submitHouseholdA, submitHouseholdB] = await Promise.all([
      postJson(`/api/sessions/${sessionId}/submit/household`, { householdId: playerA.householdId, lines: [] }, tokenA),
      postJson(`/api/sessions/${sessionId}/submit/household`, { householdId: playerB.householdId, lines: [] }, tokenB),
    ]);
    expect(submitHouseholdA.status).toBe(200);
    expect(submitHouseholdB.status).toBe(200);

    const final = await getJson(`/api/sessions/${sessionId}/state`);
    const finalState = (final.body as { state: { roundMetrics: unknown[]; currentRound: number } }).state;
    expect(finalState.roundMetrics).toHaveLength(1);
    expect(finalState.currentRound).toBe(2);
  });
});
