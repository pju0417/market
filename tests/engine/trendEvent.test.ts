/**
 * Milestone 6 제안 C (docs/DECISIONS.md D-039): 헤드리스 시뮬레이터로 6라운드에 유행 카테고리
 * 소매 매물이 실제로 더 팔리는 경향이 있는지 확인한다. 단위 테스트(순수 함수 자체)는
 * tests/economy/trendEvent.test.ts, tests/npc/decisions.test.ts,
 * tests/economy/humanDecisions.test.ts에 있다 — 여기서는 엔진 전체를 통과했을 때의 방향성만
 * 확인한다.
 */
import { describe, expect, it } from "vitest";
import { getActiveTrendEvent } from "../../src/economy/trendEvent.js";
import { simulateGame } from "../../src/engine/simulateGame.js";

describe("trend event increases round-6 sell-through for the trend category (Milestone 6 제안 C, D-039)", () => {
  it("the trend category's round-6 retail sell-through rate exceeds its own baseline rate from non-event rounds (4/5/7), in most seeds", async () => {
    // Comparing a category's round-6 rate against *itself* in other rounds (rather than against
    // other categories in the same round) isolates the trend bonus's effect from unrelated
    // per-category noise (differing base demand, strategy mix, essential-category bonuses, etc.).
    const seeds = Array.from({ length: 20 }, (_, i) => 1000 + i);
    let trendAboveBaselineCount = 0;
    let comparableSeedCount = 0;

    for (const seed of seeds) {
      const { state } = await simulateGame(10, seed);
      const trendEvent = getActiveTrendEvent(seed, 6)!;

      const sellThroughFor = (round: number): number | undefined => {
        const metrics = state.roundMetrics.find((m) => m.round === round);
        const summary = metrics?.retailCategoryClearing[trendEvent.categoryId];
        if (summary === undefined || summary.totalListed === 0) return undefined;
        return summary.totalSold / summary.totalListed;
      };

      const trendRoundRate = sellThroughFor(6);
      const baselineRates = [4, 5, 7].map(sellThroughFor).filter((r): r is number => r !== undefined);
      if (trendRoundRate === undefined || baselineRates.length === 0) continue;

      const averageBaselineRate = baselineRates.reduce((sum, r) => sum + r, 0) / baselineRates.length;
      comparableSeedCount += 1;
      if (trendRoundRate >= averageBaselineRate) trendAboveBaselineCount += 1;
    }

    expect(comparableSeedCount).toBeGreaterThan(0);
    // Not a guarantee every single seed favors the trend category (supply/strategy noise), but the
    // 0.1 scoring bonus should tip the balance in most seeds.
    expect(trendAboveBaselineCount).toBeGreaterThanOrEqual(Math.ceil(comparableSeedCount * 0.6));
  });
});
