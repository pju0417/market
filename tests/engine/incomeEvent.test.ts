/**
 * Milestone 6 제안 A (docs/DECISIONS.md D-037): 소비자 소득 변화 이벤트("불황")가 실제로
 * 가계 라운드 용돈 크레딧에 반영되는지에 집중하는 통합 테스트. 순수 함수 자체의 단위 테스트는
 * tests/economy/incomeEvent.test.ts에 있다.
 */
import { describe, expect, it } from "vitest";
import { COSTS, INCOME_EVENT_BUDGET_MULTIPLIER } from "../../src/economy/config.js";
import { buildInitialGameState, createPhaseHandlers, type HumanDecisionSource } from "../../src/engine/simulateGame.js";

const noopDecisionSource: HumanDecisionSource = {
  getCompanyInput: () => undefined,
  getStorePurchaseRequest: () => undefined,
  getHouseholdPurchaseRequest: () => undefined,
  getStoreSubmissionReceivedAt: () => undefined,
  getHouseholdSubmissionReceivedAt: () => undefined,
  getPhaseStartedAt: () => 0,
  getSubmissionTimeoutSettings: () => ({ enabled: false, timeoutMs: 120_000, npcGraduatedEntryEnabled: true }),
};

describe("household-turn: income event budget multiplier (Milestone 6, D-037)", () => {
  it("credits the full budgetPerRound in round 6 (no income event that round)", async () => {
    const state = buildInitialGameState(1, 1);
    const household = state.households["student-1-household"]!;
    household.ledger.cash = 0;
    state.currentRound = 6;

    const handlers = createPhaseHandlers(() => 0.5, noopDecisionSource);
    await handlers["household-turn"]!(state);

    expect(household.ledger.cash).toBe(COSTS.householdBudgetPerRound);
  });

  it("credits only budgetPerRound * 0.7 in round 7 (income event active)", async () => {
    const state = buildInitialGameState(1, 1);
    const household = state.households["student-1-household"]!;
    household.ledger.cash = 0;
    state.currentRound = 7;

    const handlers = createPhaseHandlers(() => 0.5, noopDecisionSource);
    await handlers["household-turn"]!(state);

    expect(household.ledger.cash).toBeCloseTo(COSTS.householdBudgetPerRound * INCOME_EVENT_BUDGET_MULTIPLIER, 10);
    expect(household.ledger.cash).toBeCloseTo(70, 10);
  });
});
