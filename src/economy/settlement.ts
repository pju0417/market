/**
 * 원장(Ledger) 조작 헬퍼. "보유 현금 이상 사용 금지"를 두 가지 다른 방식으로 강제한다:
 *
 * - 고정비(인건비/임대료)는 `chargeCapped`로 낸다 — 낼 돈이 부족하면 낼 수 있는 만큼만 내고
 *   현금은 0에서 멈춘다. 자금난으로 고정비를 다 못 내는 상황은 버그가 아니라 게임에서
 *   실제로 일어날 수 있는 정상 시나리오다 (기업 생존율 지표로 관찰 대상, docs/TODO.md).
 * - 생산/매입/구매 같은 재량 지출은 애초에 `availableCash`를 넘지 않도록
 *   src/npc/decisions.ts가 수량을 계산해야 한다. 여기서는 그 지출을 그대로(clamp 없이)
 *   차감한다 — 만약 결정 로직에 버그가 있어 예산을 넘겨 썼다면 현금이 음수가 되어
 *   테스트(불변조건 검사)에서 바로 드러나야 하며, 조용히 clamp로 감춰서는 안 된다.
 */
import type { Ledger } from "../types/domain.js";

/** 낼 수 있는 만큼만 낸다. 실제로 차감된 금액을 반환한다. */
export function chargeCapped(ledger: Ledger, amount: number): number {
  const paid = Math.min(Math.max(amount, 0), ledger.cash);
  ledger.cash -= paid;
  return paid;
}

/** 재량 지출. 예산을 넘지 않는다는 보장은 호출자(decision 함수)의 책임이다. */
export function chargeDiscretionary(ledger: Ledger, amount: number): void {
  ledger.cash -= amount;
}

export function credit(ledger: Ledger, amount: number): void {
  ledger.cash += amount;
}

export interface FixedCostResult {
  laborPaid: number;
  rentPaid: number;
  totalPaid: number;
}

export function applyFixedCosts(ledger: Ledger, laborCost: number, rentCost: number): FixedCostResult {
  const laborPaid = chargeCapped(ledger, laborCost);
  const rentPaid = chargeCapped(ledger, rentCost);
  return { laborPaid, rentPaid, totalPaid: laborPaid + rentPaid };
}
