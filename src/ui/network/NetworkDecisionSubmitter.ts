/**
 * `DecisionSubmitter`를 `SessionClient`(HTTP)로 구현하는 얇은 어댑터 (Milestone 4 4-b).
 * 세 턴 화면은 이 클래스를 통해 로컬 `GameSession`과 동일한 모양으로 네트워크 세션에 제출한다.
 */
import type { ParticipantId, ProductCategoryId } from "../../types/domain.js";
import type { CompanyDecisionInput, PurchaseRequestLine, StoreDecisionInput } from "../../multiplayer/GameSession.js";
import type { DecisionSubmitter } from "./DecisionSubmitter.js";
import type { SessionClient } from "./sessionClient.js";

export class NetworkDecisionSubmitter implements DecisionSubmitter {
  constructor(
    private readonly client: SessionClient,
    private readonly sessionId: string,
    private readonly token: string,
  ) {}

  async submitCompanyDecision(companyId: ParticipantId, input: CompanyDecisionInput): Promise<void> {
    await this.client.submitCompany(this.sessionId, this.token, companyId, input);
  }

  async submitStoreDecision(storeId: ParticipantId, input: StoreDecisionInput): Promise<void> {
    const purchases = [...input.purchases];
    const payload: { purchases: PurchaseRequestLine[]; retailPrice?: number; sellingCategoryId?: ProductCategoryId } = {
      purchases,
    };
    if (input.retailPrice !== undefined) payload.retailPrice = input.retailPrice;
    if (input.sellingCategoryId !== undefined) payload.sellingCategoryId = input.sellingCategoryId;
    await this.client.submitStore(this.sessionId, this.token, storeId, payload);
  }

  async submitHouseholdPurchases(householdId: ParticipantId, lines: PurchaseRequestLine[]): Promise<void> {
    await this.client.submitHousehold(this.sessionId, this.token, householdId, lines);
  }
}
