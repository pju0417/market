/**
 * 구매 매칭 알고리즘 재설계 Stage 1: orderBuyersForTurn 단위 테스트. 통합 동작(실제
 * runStoreTurn/runConsumerPurchases 안에서 호출되는 맥락)은 tests/engine/simulateGameMetrics.test.ts,
 * tests/multiplayer/gameSession.test.ts에서 이미 검증한다 — 여기서는 정렬/그룹핑 로직 자체에 집중한다.
 */
import { describe, expect, it } from "vitest";
import { orderBuyersForTurn, type HumanDecisionSource, type SubmissionTimeoutSettings } from "../../src/engine/simulateGame.js";
import { createRng, shuffle } from "../../src/economy/rng.js";

function makeDecisionSource(overrides: Partial<HumanDecisionSource> = {}): HumanDecisionSource {
  return {
    getCompanyInput: () => undefined,
    getStorePurchaseRequest: () => undefined,
    getHouseholdPurchaseRequest: () => undefined,
    getStoreSubmissionReceivedAt: () => undefined,
    getHouseholdSubmissionReceivedAt: () => undefined,
    getPhaseStartedAt: () => 0,
    getSubmissionTimeoutSettings: (): SubmissionTimeoutSettings => ({
      enabled: false,
      timeoutMs: 100_000,
      npcGraduatedEntryEnabled: false,
    }),
    ...overrides,
  };
}

describe("orderBuyersForTurn", () => {
  it("is byte-identical to shuffle(rng, ids) — same output, same rng consumption — when decisionSource is undefined (headless simulator regression gate)", () => {
    const ids = ["a", "b", "c", "d", "e"];

    const rngForShuffle = createRng(123);
    const expected = shuffle(rngForShuffle, ids);
    const restAfterShuffle = rngForShuffle();

    const rngForOrder = createRng(123);
    const actual = orderBuyersForTurn(ids, rngForOrder, undefined, () => false, () => undefined);
    const restAfterOrder = rngForOrder();

    expect(actual).toEqual(expected);
    expect(restAfterOrder).toBe(restAfterShuffle); // same number of rng() draws consumed
  });

  it("processes all-submitted ids in ascending submission-time order when no one is unsubmitted", () => {
    const ids = ["a", "b", "c"];
    const receivedAt: Record<string, number> = { a: 300, b: 100, c: 200 };
    const decisionSource = makeDecisionSource();

    const ordered = orderBuyersForTurn(
      ids,
      createRng(1),
      decisionSource,
      () => true,
      (id) => receivedAt[id],
    );

    expect(ordered).toEqual(["b", "c", "a"]);
  });

  it("places submitted humans (by submission time) before unsubmitted/NPC ids (shuffled) when graduated entry is off", () => {
    const ids = ["npc-1", "npc-2", "human-late", "human-early"];
    const receivedAt: Record<string, number> = { "human-late": 500, "human-early": 100 };
    const decisionSource = makeDecisionSource({
      getSubmissionTimeoutSettings: () => ({ enabled: false, timeoutMs: 100_000, npcGraduatedEntryEnabled: false }),
    });

    const ordered = orderBuyersForTurn(
      ids,
      createRng(7),
      decisionSource,
      (id) => id.startsWith("human"),
      (id) => receivedAt[id],
    );

    expect(ordered.slice(0, 2)).toEqual(["human-early", "human-late"]);
    expect(new Set(ordered.slice(2))).toEqual(new Set(["npc-1", "npc-2"]));
  });

  it("does not use graduated entry when enabled=false, even if npcGraduatedEntryEnabled=true (submitted-first, rest shuffled)", () => {
    const ids = ["npc-1", "human-a"];
    const decisionSource = makeDecisionSource({
      getSubmissionTimeoutSettings: () => ({ enabled: false, timeoutMs: 100_000, npcGraduatedEntryEnabled: true }),
    });

    const ordered = orderBuyersForTurn(
      ids,
      createRng(1),
      decisionSource,
      (id) => id === "human-a",
      (id) => (id === "human-a" ? 999_999 : undefined), // even a very late human submission still sorts before NPCs
    );

    expect(ordered).toEqual(["human-a", "npc-1"]);
  });

  it("does not use graduated entry when npcGraduatedEntryEnabled=false, even if enabled=true", () => {
    const ids = ["npc-1", "human-a"];
    const decisionSource = makeDecisionSource({
      getSubmissionTimeoutSettings: () => ({ enabled: true, timeoutMs: 100_000, npcGraduatedEntryEnabled: false }),
    });

    const ordered = orderBuyersForTurn(
      ids,
      createRng(1),
      decisionSource,
      (id) => id === "human-a",
      (id) => (id === "human-a" ? 999_999 : undefined),
    );

    expect(ordered).toEqual(["human-a", "npc-1"]);
  });

  it("uses graduated entry (virtual NPC submission times spread across the back half of the window) only when both enabled and npcGraduatedEntryEnabled are true", () => {
    const ids = ["npc-1", "human-a"];
    // timeoutMs=100000, start ratio 0.5 => virtual window is [50000, 100000). A human submitting
    // very early (at t=10000, well before the virtual window even starts) must still sort first.
    const decisionSource = makeDecisionSource({
      getPhaseStartedAt: () => 0,
      getSubmissionTimeoutSettings: () => ({ enabled: true, timeoutMs: 100_000, npcGraduatedEntryEnabled: true }),
    });

    const ordered = orderBuyersForTurn(
      ids,
      createRng(1),
      decisionSource,
      (id) => id === "human-a",
      (id) => (id === "human-a" ? 10_000 : undefined),
    );

    expect(ordered).toEqual(["human-a", "npc-1"]);
  });

  it("lets an NPC's virtual submission time (graduated entry) beat an extremely late human submission", () => {
    const ids = ["npc-1", "human-a"];
    const decisionSource = makeDecisionSource({
      getPhaseStartedAt: () => 0,
      getSubmissionTimeoutSettings: () => ({ enabled: true, timeoutMs: 100_000, npcGraduatedEntryEnabled: true }),
    });

    // npc-1's virtual time falls in [50000, 100000); a human submitting at t=99999 (right at the
    // deadline) is later than the earliest possible virtual NPC time.
    const ordered = orderBuyersForTurn(
      ids,
      createRng(1),
      decisionSource,
      (id) => id === "human-a",
      (id) => (id === "human-a" ? 99_999 : undefined),
    );

    expect(ordered).toEqual(["npc-1", "human-a"]);
  });

  it("spreads multiple NPCs' virtual times evenly starting exactly at the 50% ratio boundary, in their shuffled order", () => {
    // With 2 NPCs and no submitted humans, virtual times are windowStart + windowDuration*(i/2)
    // for i in {0, 1} -- i.e. exactly at the 50% boundary and at 75%. Since there's nothing to
    // compare them against, the final order should just be the shuffled order of npc ids
    // (their relative virtual times preserve shuffle order).
    const ids = ["npc-1", "npc-2"];
    const decisionSource = makeDecisionSource({
      getPhaseStartedAt: () => 0,
      getSubmissionTimeoutSettings: () => ({ enabled: true, timeoutMs: 100_000, npcGraduatedEntryEnabled: true }),
    });

    const shuffledExpectation = shuffle(createRng(55), ids);
    const ordered = orderBuyersForTurn(ids, createRng(55), decisionSource, () => false, () => undefined);

    expect(ordered).toEqual(shuffledExpectation);
  });

  it("does not divide by zero when there are no unsubmitted ids (graduated entry enabled, but shuffledRest is empty)", () => {
    const ids = ["human-a", "human-b"];
    const decisionSource = makeDecisionSource({
      getSubmissionTimeoutSettings: () => ({ enabled: true, timeoutMs: 100_000, npcGraduatedEntryEnabled: true }),
    });

    const ordered = orderBuyersForTurn(
      ids,
      createRng(1),
      decisionSource,
      () => true,
      (id) => (id === "human-a" ? 10 : 20),
    );

    expect(ordered).toEqual(["human-a", "human-b"]);
  });

  it("does not crash and returns all ids in shuffled order when everyone is unsubmitted (graduated entry enabled)", () => {
    const ids = ["npc-1", "npc-2", "npc-3"];
    const decisionSource = makeDecisionSource({
      getSubmissionTimeoutSettings: () => ({ enabled: true, timeoutMs: 100_000, npcGraduatedEntryEnabled: true }),
    });

    const ordered = orderBuyersForTurn(ids, createRng(9), decisionSource, () => false, () => undefined);

    expect(new Set(ordered)).toEqual(new Set(ids));
    expect(ordered).toHaveLength(3);
  });
});
