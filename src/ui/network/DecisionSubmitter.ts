/**
 * 로컬 `GameSession`과 네트워크 `NetworkDecisionSubmitter`가 공통으로 만족하는 좁은 인터페이스
 * (Milestone 4 4-b). 세 턴 화면(CompanyTurnScreen/StoreTurnScreen/HouseholdTurnScreen)은
 * 구체 타입 대신 이 인터페이스에만 의존해, 로컬/네트워크 두 경로에서 그대로 재사용된다.
 *
 * `GameSession`의 `submitCompanyDecision`/`submitStoreDecision`/`submitHouseholdPurchases`는
 * 동기 함수(반환값 void)이고, `NetworkDecisionSubmitter`의 동명 메서드는 `Promise<void>`를
 * 반환한다 — 반환 타입을 `void | Promise<void>`로 두어 양쪽 모두 구조적으로 이 인터페이스를
 * 만족하게 한다.
 */
import type { ParticipantId } from "../../types/domain.js";
import type { CompanyDecisionInput, PurchaseRequestLine, StoreDecisionInput } from "../../multiplayer/GameSession.js";

export interface DecisionSubmitter {
  submitCompanyDecision(companyId: ParticipantId, input: CompanyDecisionInput): void | Promise<void>;
  submitStoreDecision(storeId: ParticipantId, input: StoreDecisionInput): void | Promise<void>;
  submitHouseholdPurchases(householdId: ParticipantId, lines: PurchaseRequestLine[]): void | Promise<void>;
}
