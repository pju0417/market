import { describe, expect, it } from "vitest";
import { simulateGame } from "../../src/engine/simulateGame.js";

/**
 * Milestone 1 smoke test: 학생 수가 달라져도(1/5/10/20명, NPC 자동 보충 포함) 실제 경제
 * 엔진이 7라운드를 끝까지 완주하는지 확인한다. 구체적인 밸런스 품질은 economy-reviewer의
 * 검토 대상이며, 여기서는 완주 여부와 기본 데이터 무결성만 확인한다.
 */
describe("smoke: full economy simulation completes 7 rounds for various class sizes", () => {
  it.each([1, 5, 10, 20])("studentCount=%i", async (studentCount) => {
    const { state } = await simulateGame(studentCount, 12345);

    expect(state.roundMetrics).toHaveLength(7);
    expect(state.currentRound).toBe(8);
    expect(state.players).toHaveLength(studentCount);
  });
});
