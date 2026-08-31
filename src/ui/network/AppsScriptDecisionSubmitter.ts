/**
 * `DecisionSubmitter`를 `AppsScriptSessionClient`로 구현하는 얇은 어댑터 (Milestone 5 3부,
 * D-032). `NetworkDecisionSubmitter.ts`(HTTP 서버용)와 동일한 모양이며, 세 턴 화면이 두 경로
 * (로컬 HTTP 서버 / Apps Script Web App) 모두에서 동일한 인터페이스로 제출할 수 있게 한다.
 */
import type { ParticipantId } from "../../types/domain.js";
import type { CompanyDecisionInput, PurchaseRequestLine, StoreDecisionInput } from "../../multiplayer/GameSession.js";
import type { DecisionSubmitter } from "./DecisionSubmitter.js";
import type { AppsScriptSessionClient } from "./appsScriptSessionClient.js";

export class AppsScriptDecisionSubmitter implements DecisionSubmitter {
  constructor(
    private readonly client: AppsScriptSessionClient,
    private readonly sessionId: string,
    private readonly token: string,
  ) {}

  async submitCompanyDecision(companyId: ParticipantId, input: CompanyDecisionInput): Promise<void> {
    await this.client.submitCompany(this.sessionId, this.token, companyId, input);
  }

  async submitStoreDecision(storeId: ParticipantId, input: StoreDecisionInput): Promise<void> {
    const purchases = [...input.purchases];
    await this.client.submitStore(
      this.sessionId,
      this.token,
      storeId,
      input.retailPrice === undefined ? { purchases } : { purchases, retailPrice: input.retailPrice },
    );
  }

  async submitHouseholdPurchases(householdId: ParticipantId, lines: PurchaseRequestLine[]): Promise<void> {
    await this.client.submitHousehold(this.sessionId, this.token, householdId, lines);
  }
}
