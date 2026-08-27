/**
 * 전략 비서(analyzeStoreTurn)를 실제 헤드리스 시뮬레이션 위에서 굴려보는 통합 테스트.
 * companyAdvisorSimulation.test.ts와 같은 구조 — 손으로 만든 GameState 조각이 아니라 진짜
 * buildInitialGameState + RoundEngine으로 만들어진 "있을 수 있는 모든 실제 상태"에 대해
 * 크래시/NaN/undefined 노출/옵션 개수 위반이 없는지 학급 규모(1/5/10/20명)와 전체 7라운드에
 * 걸쳐 확인한다.
 */
import { describe, expect, it } from "vitest";
import { analyzeStoreTurn } from "../../src/advisor/storeAdvisor.js";
import { createRng } from "../../src/economy/rng.js";
import { RoundEngine } from "../../src/engine/RoundEngine.js";
import { buildInitialGameState, createAutoPlayPhaseHandlers } from "../../src/engine/simulateGame.js";
import type { GameState } from "../../src/types/domain.js";

function assertWellFormed(state: GameState, storeId: string, roundLabel: string): void {
  const advice = analyzeStoreTurn(state, storeId);

  expect(advice.options.length, `${roundLabel} ${storeId} options count`).toBeGreaterThanOrEqual(2);
  expect(advice.options.length, `${roundLabel} ${storeId} options count`).toBeLessThanOrEqual(3);

  const allText = [
    ...advice.situationSummary,
    ...advice.causeHypotheses.flatMap((h) => [h.description, h.evidence]),
    ...advice.options.flatMap((o) => [o.title, ...o.pros, ...o.risks]),
  ];

  for (const line of allText) {
    expect(typeof line, `${roundLabel} ${storeId} advice text type`).toBe("string");
    expect(line, `${roundLabel} ${storeId} advice text should not leak "undefined"`).not.toMatch(/undefined/);
    expect(line, `${roundLabel} ${storeId} advice text should not leak "NaN"`).not.toMatch(/NaN/);
    expect(line, `${roundLabel} ${storeId} advice text should not leak "null"`).not.toMatch(/\bnull\b/);
  }

  for (const option of advice.options) {
    expect(option.pros.length, `${roundLabel} ${storeId} option ${option.id} pros`).toBeGreaterThan(0);
    expect(option.risks.length, `${roundLabel} ${storeId} option ${option.id} risks`).toBeGreaterThan(0);
  }
}

describe("analyzeStoreTurn over full simulated games", () => {
  it.each([1, 5, 10, 20])(
    "does not crash or leak NaN/undefined for any store, any round, with %i student(s)",
    async (studentCount) => {
      const seed = 6000 + studentCount;
      const state = buildInitialGameState(studentCount, seed);
      const rng = createRng(seed + 1);
      const engine = new RoundEngine(state, createAutoPlayPhaseHandlers(rng));

      // 1라운드 시작 시점(라운드 지표/시장 시세가 전혀 없는 상태)에도 안전해야 한다.
      for (const storeId of Object.keys(state.stores)) {
        assertWellFormed(state, storeId, "round-1-before-any-phase");
      }

      const totalRounds = state.config.totalRounds;
      for (let round = 1; round <= totalRounds; round += 1) {
        await engine.runRound();
        state.currentRound = round + 1;
        if (round + 1 <= totalRounds) {
          state.currentPhase = "company-turn";
        }
        // 라운드가 정산된 직후, 다음 가게 턴 시점의 상태를 기준으로 모든 가게(학생+NPC)에
        // 대해 조언을 생성해본다.
        for (const storeId of Object.keys(state.stores)) {
          assertWellFormed(state, storeId, `after-round-${round}`);
        }
      }
    },
  );
});
