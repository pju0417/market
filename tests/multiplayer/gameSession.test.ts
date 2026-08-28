import { describe, expect, it } from "vitest";
import { GameSession, SAVED_SESSION_STORAGE_KEY } from "../../src/multiplayer/GameSession.js";
import { MemoryStorageAdapter } from "../../src/storage/MemoryStorageAdapter.js";

describe("GameSession (D-021: single human player)", () => {
  it("creates exactly one human player plus NPC backfill", () => {
    const session = new GameSession(1);
    const state = session.getState();

    expect(state.players).toHaveLength(1);
    expect(session.getHumanPlayer().id).toBe(state.players[0]!.id);
    expect(Object.keys(state.companies).length).toBeGreaterThan(1);
  });

  it("applies business setup choices to the human player's company and store", () => {
    const session = new GameSession(1, {
      companyDistrictId: "industrial",
      companyCategoryId: "electronics",
      storeDistrictId: "downtown",
      storeCategoryId: "toys",
    });
    const state = session.getState();
    const player = session.getHumanPlayer();

    expect(state.companies[player.companyId]!.districtId).toBe("industrial");
    expect(state.companies[player.companyId]!.productCategoryId).toBe("electronics");
    expect(state.stores[player.storeId]!.districtId).toBe("downtown");
    expect(state.stores[player.storeId]!.specialtyCategoryId).toBe("toys");
  });

  it("blocks advancing past company-turn until the human submits (unless forced)", async () => {
    const session = new GameSession(1);

    expect(session.isWaitingForHumanInput()).toBe(true);
    await expect(session.advancePhase()).rejects.toThrow();

    const result = await session.advancePhase(true);
    expect(result.phase).toBe("company-turn");
  });

  it("advances immediately once the human submits a decision", async () => {
    const session = new GameSession(1);
    session.submitCompanyDecision({ quantity: 10, quality: 0.5, wholesalePrice: 8 });

    expect(session.isWaitingForHumanInput()).toBe(false);
    const result = await session.advancePhase();

    expect(result.phase).toBe("company-turn");
    expect(session.getState().currentPhase).toBe("company-settlement");
  });

  it("rejects a submission for the wrong phase", () => {
    const session = new GameSession(1);

    expect(() => session.submitStoreDecision({ purchases: [] })).toThrow();
  });

  it("lets the human set an explicit retail price, even with zero purchases this round", async () => {
    const session = new GameSession(1);
    session.submitCompanyDecision({ quantity: 10, quality: 0.5, wholesalePrice: 8 });
    await session.advancePhase(); // company-turn
    await session.advancePhase(true); // company-settlement
    await session.advancePhase(true); // wholesale-market-update

    expect(session.getState().currentPhase).toBe("store-turn");
    session.submitStoreDecision({ purchases: [], retailPrice: 12.5 });
    await session.advancePhase();

    const player = session.getHumanPlayer();
    expect(session.getState().stores[player.storeId]!.retailPrice).toBe(12.5);
  });

  it("clears pending submissions after advancing, so the next round needs a fresh submission", async () => {
    const session = new GameSession(1);
    session.submitCompanyDecision({ quantity: 5, quality: 0.5, wholesalePrice: 8 });
    await session.advancePhase();

    // company-settlement phase does not require input; force through the rest with bots
    // to reach company-turn of round 2, then confirm it's waiting for input again.
    let outcome = await session.advancePhase(true); // company-settlement
    while (!outcome.gameOver && session.getState().currentPhase !== "company-turn") {
      outcome = await session.advancePhase(true);
    }

    expect(session.getState().currentPhase).toBe("company-turn");
    expect(session.isWaitingForHumanInput()).toBe(true);
  });

  it("bumps getVersion() on every mutating call (submit*/advancePhase) — guardrail for useMemo([version, ...]) callers in the UI", async () => {
    // src/ui/screens/{Company,Store,Household}TurnScreen.tsx memoize advisor output and eligible
    // listings on `version` instead of `state` (GameState is mutated in place and never
    // replaced, so its reference never changes — see docs/TODO.md's useMemo reference-identity
    // note). That only works if every state-mutating entry point below bumps the version; if a
    // future method forgets to call notify(), those memos would silently go stale.
    const session = new GameSession(1);
    let version = session.getVersion();

    session.submitCompanyDecision({ quantity: 5, quality: 0.5, wholesalePrice: 8 });
    expect(session.getVersion()).toBeGreaterThan(version);
    version = session.getVersion();

    await session.advancePhase(); // company-turn -> company-settlement
    expect(session.getVersion()).toBeGreaterThan(version);
    version = session.getVersion();

    await session.advancePhase(true); // company-settlement -> wholesale-market-update
    await session.advancePhase(true); // -> store-turn
    expect(session.getState().currentPhase).toBe("store-turn");
    version = session.getVersion();

    session.submitStoreDecision({ purchases: [], retailPrice: 10 });
    expect(session.getVersion()).toBeGreaterThan(version);
    version = session.getVersion();

    await session.advancePhase(); // store-turn -> store-settlement
    await session.advancePhase(true); // -> retail-market-update
    await session.advancePhase(true); // -> household-turn
    expect(session.getState().currentPhase).toBe("household-turn");
    version = session.getVersion();

    session.submitHouseholdPurchases([]);
    expect(session.getVersion()).toBeGreaterThan(version);
  });

  it("notifies subscribers on submission and on phase advance", async () => {
    const session = new GameSession(1);
    let notifications = 0;
    const unsubscribe = session.subscribe(() => {
      notifications += 1;
    });

    session.submitCompanyDecision({ quantity: 1, quality: 0.5, wholesalePrice: 8 });
    await session.advancePhase();

    expect(notifications).toBe(2);
    unsubscribe();
  });

  it("reaches gameOver after playing through with the human always forcing bot fallback", async () => {
    const session = new GameSession(1);
    let outcome = await session.advancePhase(true);
    while (!outcome.gameOver) {
      outcome = await session.advancePhase(true);
    }

    expect(session.getState().roundMetrics).toHaveLength(7);
  });

  it("dedupes overlapping advancePhase() calls instead of executing the phase twice (regression: React StrictMode double-invoke)", async () => {
    const session = new GameSession(1);
    session.submitCompanyDecision({ quantity: 10, quality: 0.5, wholesalePrice: 8 });

    // Two overlapping calls, neither awaited before the other starts — this is exactly what
    // React StrictMode's deliberate double effect-invocation produces in development.
    const first = session.advancePhase();
    const second = session.advancePhase();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    // company-turn only ran once: currentPhase advanced by exactly one step, not two.
    expect(session.getState().currentPhase).toBe("company-settlement");
  });

  it("does not duplicate roundMetrics when a silent phase is advanced twice concurrently", async () => {
    const session = new GameSession(1);
    let outcome = await session.advancePhase(true);
    // Drive to round-settlement (the phase right before round-result) so we can fire an
    // overlapping pair right at the point that pushes a RoundMetrics entry.
    while (!outcome.gameOver && session.getState().currentPhase !== "round-settlement") {
      outcome = await session.advancePhase(true);
    }
    expect(session.getState().currentPhase).toBe("round-settlement");

    const first = session.advancePhase(true);
    const second = session.advancePhase(true);
    await Promise.all([first, second]);

    expect(session.getState().roundMetrics).toHaveLength(1);
  });

  it("lets a subscriber that synchronously re-calls advancePhase() (as the UI's auto-advance effect does via useSyncExternalStore) cascade through every silent phase instead of stalling", async () => {
    // Regression: advancingPromise used to only clear in a trailing .finally(), which ran
    // strictly after notify() had already synchronously re-entered advancePhase() for the
    // *next* phase from inside this very subscriber — that legitimate follow-up call saw a
    // stale in-flight promise and was silently swallowed, so the UI froze on the first silent
    // phase after any human submission. This subscriber pattern is exactly what
    // src/ui/App.tsx's auto-advance effect does in practice.
    const session = new GameSession(1);
    session.submitCompanyDecision({ quantity: 10, quality: 0.5, wholesalePrice: 8 });

    const silentPhases = new Set([
      "company-settlement",
      "wholesale-market-update",
      "store-settlement",
      "retail-market-update",
      "npc-consumer-behavior",
      "round-settlement",
    ]);
    let lastAutoAdvancedVersion = -1;
    session.subscribe(() => {
      const phase = session.getState().currentPhase;
      if (!silentPhases.has(phase) || session.isWaitingForHumanInput()) return;
      const version = session.getVersion();
      if (lastAutoAdvancedVersion === version) return;
      lastAutoAdvancedVersion = version;
      void session.advancePhase();
    });

    await session.advancePhase(); // the human's own submit-triggered call
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the reentrant chain settle

    expect(session.getState().currentPhase).toBe("store-turn");
  });

  it("never lets the human's company/store buy from itself even when forced through every phase", async () => {
    const session = new GameSession(7);
    let outcome = await session.advancePhase(true);
    while (!outcome.gameOver) {
      outcome = await session.advancePhase(true);
    }
    const state = session.getState();
    const player = session.getHumanPlayer();

    for (const company of Object.values(state.companies)) {
      expect(company.ledger.cash).toBeGreaterThanOrEqual(0);
    }
    expect(state.companies[player.companyId]!.ownerId).toBe(state.stores[player.storeId]!.ownerId);
  });
});

describe("GameSession persistence (LocalStorageAdapter wiring)", () => {
  it("loadSaved returns undefined when nothing has been saved", async () => {
    const storage = new MemoryStorageAdapter();

    await expect(GameSession.loadSaved(storage)).resolves.toBeUndefined();
  });

  it("loadSaved returns undefined for a value that doesn't look like a GameState", async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set(SAVED_SESSION_STORAGE_KEY, { not: "a game state" });

    await expect(GameSession.loadSaved(storage)).resolves.toBeUndefined();
  });

  it("autosaves the confirmed state after each advancePhase(), not before", async () => {
    const storage = new MemoryStorageAdapter();
    const session = new GameSession(1);
    session.enableAutoSave(storage);

    session.submitCompanyDecision({ quantity: 5, quality: 0.5, wholesalePrice: 8 });
    // Nothing persisted yet — only a pending submission, no phase has completed.
    await expect(storage.get(SAVED_SESSION_STORAGE_KEY)).resolves.toBeUndefined();

    await session.advancePhase();

    const saved = await GameSession.loadSaved(storage);
    expect(saved?.currentPhase).toBe("company-settlement");
  });

  it("resumeFromState continues a saved game instead of starting over", async () => {
    const storage = new MemoryStorageAdapter();
    const original = new GameSession(1);
    original.enableAutoSave(storage);
    let outcome = await original.advancePhase(true);
    while (!outcome.gameOver && original.getState().currentPhase !== "round-result") {
      outcome = await original.advancePhase(true);
    }
    expect(original.getState().currentRound).toBe(1);
    expect(original.getState().currentPhase).toBe("round-result");

    const saved = await GameSession.loadSaved(storage);
    const resumed = GameSession.resumeFromState(saved!);

    expect(resumed.getState().currentRound).toBe(1);
    expect(resumed.getState().currentPhase).toBe("round-result");
    expect(resumed.getState().roundMetrics).toEqual(original.getState().roundMetrics);
    expect(resumed.getHumanPlayer().id).toBe(original.getHumanPlayer().id);

    // The resumed session can keep playing normally from where it left off.
    const next = await resumed.advancePhase(true);
    expect(next.gameOver).toBe(false);
    expect(resumed.getState().currentRound).toBe(2);
  });

  it("clearSaved removes the saved game", async () => {
    const storage = new MemoryStorageAdapter();
    const session = new GameSession(1);
    session.enableAutoSave(storage);
    await session.advancePhase(true);
    await expect(GameSession.loadSaved(storage)).resolves.not.toBeUndefined();

    await GameSession.clearSaved(storage);

    await expect(GameSession.loadSaved(storage)).resolves.toBeUndefined();
  });

  it("a session without enableAutoSave never writes to storage", async () => {
    const storage = new MemoryStorageAdapter();
    const session = new GameSession(1);
    session.submitCompanyDecision({ quantity: 5, quality: 0.5, wholesalePrice: 8 });
    await session.advancePhase();

    await expect(GameSession.loadSaved(storage)).resolves.toBeUndefined();
  });
});
