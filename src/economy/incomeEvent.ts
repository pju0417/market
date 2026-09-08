/**
 * 소비자 소득 변화 이벤트("불황", Milestone 6 제안 A, docs/DECISIONS.md D-037). 7라운드에
 * 항상 발생하며, 그 라운드 모든 가계(학생+NPC)의 라운드 용돈에 배율(INCOME_EVENT_BUDGET_MULTIPLIER)을
 * 곱한다. 원자재비 이벤트(marketEvents.ts)와 달리 카테고리 대상이 없어(모든 카테고리에 균일 적용)
 * rng를 전혀 쓰지 않는다 — 발생 여부 자체가 라운드 번호로만 결정되는 순수 게이트다.
 */
import { INCOME_EVENT_BUDGET_MULTIPLIER, INCOME_EVENT_ROUNDS } from "./config.js";

export function isIncomeEventActive(round: number): boolean {
  return INCOME_EVENT_ROUNDS.includes(round);
}

/** 활성 라운드면 INCOME_EVENT_BUDGET_MULTIPLIER, 아니면 1. */
export function incomeEventBudgetMultiplier(round: number): number {
  return isIncomeEventActive(round) ? INCOME_EVENT_BUDGET_MULTIPLIER : 1;
}
