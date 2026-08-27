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

  describe("stepPhase", () => {
    it("executes exactly one phase and advances currentPhase", async () => {
      const state = makeEmptyGameState();
      const engine = new RoundEngine(state);

      const result = await engine.stepPhase();

      expect(result).toEqual({ round: 1, phase: "company-turn", gameOver: false });
      expect(state.currentPhase).toBe("company-settlement");
      expect(state.currentRound).toBe(1);
    });

    it("rolls over to the next round after the last phase", async () => {
      const state = makeEmptyGameState();
      state.config = { ...state.config, totalRounds: 7 };
      const engine = new RoundEngine(state);

      for (let i = 0; i < ROUND_PHASES.length - 1; i += 1) {
        await engine.stepPhase();
      }
      const result = await engine.stepPhase();

      expect(result).toEqual({ round: 1, phase: "round-result", gameOver: false });
      expect(state.currentRound).toBe(2);
      expect(state.currentPhase).toBe("company-turn");
    });

    it("reports gameOver on the last phase of the last round and leaves state inspectable", async () => {
      const state = makeEmptyGameState();
      const engine = new RoundEngine(state);
      const totalSteps = ROUND_PHASES.length * state.config.totalRounds;

      let lastResult;
      for (let i = 0; i < totalSteps; i += 1) {
        lastResult = await engine.stepPhase();
      }

      expect(lastResult).toEqual({ round: 7, phase: "round-result", gameOver: true });
      expect(state.currentRound).toBe(8);
      expect(state.currentPhase).toBe("round-result");
    });

    it("throws if called again after the game has ended", async () => {
      const state = makeEmptyGameState();
      const engine = new RoundEngine(state);
      const totalSteps = ROUND_PHASES.length * state.config.totalRounds;
      for (let i = 0; i < totalSteps; i += 1) {
        await engine.stepPhase();
      }

      await expect(engine.stepPhase()).rejects.toThrow();
    });

    it("produces the exact same final state as runGame() when stepped the equivalent number of times", async () => {
      const seenA: string[] = [];
      const stateA = makeEmptyGameState();
      const engineA = new RoundEngine(stateA, {
        "store-turn": (s) => {
          seenA.push(`${s.currentRound}:${s.currentPhase}`);
        },
      });
      await engineA.runGame();

      const seenB: string[] = [];
      const stateB = makeEmptyGameState();
      const engineB = new RoundEngine(stateB, {
        "store-turn": (s) => {
          seenB.push(`${s.currentRound}:${s.currentPhase}`);
        },
      });
      const totalSteps = ROUND_PHASES.length * stateB.config.totalRounds;
      for (let i = 0; i < totalSteps; i += 1) {
        await engineB.stepPhase();
      }

      expect(stateB).toEqual(stateA);
      expect(seenB).toEqual(seenA);
    });
  });
});
