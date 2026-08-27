/**
 * 기업/가게/가계의 고정비·가용현금·예산 계산. 원래 src/ui/turnCalculations.ts에 있었으나,
 * UI에 의존하지 않는 economy 엔진 모듈(예: src/advisor)도 같은 계산을 재사용해야 해서 이
 * 파일로 옮겼다 — src/ui/turnCalculations.ts는 이 파일의 함수들을 그대로 re-export한다.
 */
import { COSTS, DISTRICTS } from "./config.js";
import type { DistrictId } from "../types/domain.js";

/** 지정한 상권의 고정비(인건비+임대료)를 계산한다. 기업/가게 공통 패턴, 기준값만 다르다. */
function computeFixedCost(districtId: DistrictId, baseLaborCost: number, baseRentCost: number): number {
  const district = DISTRICTS[districtId];
  return baseLaborCost + baseRentCost * district.rentMultiplier;
}

export function computeCompanyFixedCost(districtId: DistrictId): number {
  return computeFixedCost(districtId, COSTS.baseLaborCostCompany, COSTS.baseRentCompany);
}

export function computeStoreFixedCost(districtId: DistrictId): number {
  return computeFixedCost(districtId, COSTS.baseLaborCostStore, COSTS.baseRentStore);
}

/** 고정비를 낸 뒤 남는 현금. 음수가 되지 않도록 0으로 clamp한다. */
export function computeAvailableCash(cash: number, fixedCost: number): number {
  return Math.max(0, cash - fixedCost);
}

export function computeHouseholdTotalBudget(cash: number, budgetPerRound: number): number {
  return cash + budgetPerRound;
}
