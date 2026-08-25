import { describe, expect, it } from "vitest";
import { ROUND_PHASES, RoundEngine } from "../../src/engine/RoundEngine.js";
import type { GameState } from "../../src/types/domain.js";

function makeEmptyGameState(): GameState {
  return {
    config: { totalRounds: 7, studentPlayerIds: [], rngSeed: 1 },
    currentRound: 1,
    currentPhase: "company-turn",
    players: [],
    companies: {},
    stores: {},
    households: {},
    wholesaleListings: [],
    retailListings: [],
    roundMetrics: [],
  };
}

describe("RoundEngine", () => {
  it("runs all phases in the fixed order for one round", async () => {
    const state = makeEmptyGameState();
    const engine = new RoundEngine(state);

    const executed = await engine.runRound();

    expect(executed).toEqual(ROUND_PHASES);
  });

  it("invokes the injected handler for each phase with the current state", async () => {
    const state = makeEmptyGameState();
    const seenPhases: string[] = [];
    const engine = new RoundEngine(state, {
      "company-turn": (s) => {
        seenPhases.push(s.currentPhase);
      },
      "round-result": (s) => {
        seenPhases.push(s.currentPhase);
      },
    });

    await engine.runRound();

    expect(seenPhases).toEqual(["company-turn", "round-result"]);
  });

  it("runs exactly config.totalRounds rounds and stops", async () => {
    const state = makeEmptyGameState();
    let roundCount = 0;
    const engine = new RoundEngine(state, {
      "company-turn": () => {
        roundCount += 1;
      },
    });

    await engine.runGame();

    expect(roundCount).toBe(7);
    expect(state.currentRound).toBe(8);
  });
});
