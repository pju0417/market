/**
 * Milestone 6 제안 A (docs/DECISIONS.md D-037): 소비자 소득 변화 이벤트("불황") 순수 함수
 * 단위 테스트.
 */
import { describe, expect, it } from "vitest";
import { INCOME_EVENT_BUDGET_MULTIPLIER } from "../../src/economy/config.js";
import { incomeEventBudgetMultiplier, isIncomeEventActive } from "../../src/economy/incomeEvent.js";

describe("isIncomeEventActive", () => {
  it("is inactive for rounds 1 through 6", () => {
    for (const round of [1, 2, 3, 4, 5, 6]) {
      expect(isIncomeEventActive(round)).toBe(false);
    }
  });

  it("is active for round 7", () => {
    expect(isIncomeEventActive(7)).toBe(true);
  });

  it("is inactive after round 7", () => {
    for (const round of [8, 9]) {
      expect(isIncomeEventActive(round)).toBe(false);
    }
  });
});

describe("incomeEventBudgetMultiplier", () => {
  it("returns 1 outside round 7", () => {
    for (const round of [1, 2, 3, 4, 5, 6, 8]) {
      expect(incomeEventBudgetMultiplier(round)).toBe(1);
    }
  });

  it("returns the configured multiplier (0.7) on round 7", () => {
    expect(incomeEventBudgetMultiplier(7)).toBe(INCOME_EVENT_BUDGET_MULTIPLIER);
    expect(incomeEventBudgetMultiplier(7)).toBe(0.7);
  });
});
