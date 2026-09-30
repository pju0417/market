import type { CartCheckout, CartReceipt } from "../../types/domain.js";
/**
 * `DecisionSubmitter`를 `AppsScriptSessionClient`로 구현하는 얇은 어댑터 (Milestone 5 3부,
 * D-032). `NetworkDecisionSubmitter.ts`(HTTP 서버용)와 동일한 모양이며, 세 턴 화면이 두 경로
 * (로컬 HTTP 서버 / Apps Script Web App) 모두에서 동일한 인터페이스로 제출할 수 있게 한다.
 */
import type { ParticipantId, ProductCategoryId } from "../../types/domain.js";
import type { CategoryPurchaseRequest, CompanyDecisionInput, StoreDecisionInput, StorePurchaseRequest } from "../../multiplayer/GameSession.js";
import type { DecisionSubmitter } from "./DecisionSubmitter.js";
import type { AppsScriptSessionClient } from "./appsScriptSessionClient.js";

export class AppsScriptDecisionSubmitter implements DecisionSubmitter {
  constructor(
    private readonly client: AppsScriptSessionClient,
    private readonly sessionId: string,
    private readonly token: string,
  ) {}

  checkoutCart(role: "store" | "household", id: string, cart: CartCheckout): Promise<CartReceipt> {
    return this.client.checkoutCart(this.sessionId, this.token, role, id, cart);
  }

  async submitCompanyDecision(companyId: ParticipantId, input: CompanyDecisionInput): Promise<void> {
    await this.client.submitCompany(this.sessionId, this.token, companyId, input);
  }

  async submitStoreDecision(storeId: ParticipantId, input: StoreDecisionInput): Promise<void> {
    const payload: {
      purchaseRequest?: StorePurchaseRequest;
      retailPrice?: number;
      sellingCategoryId?: ProductCategoryId;
      advertise?: boolean;
    } = {};
    if (input.purchaseRequest !== undefined) payload.purchaseRequest = input.purchaseRequest;
    if (input.retailPrice !== undefined) payload.retailPrice = input.retailPrice;
    if (input.sellingCategoryId !== undefined) payload.sellingCategoryId = input.sellingCategoryId;
    if (input.advertise !== undefined) payload.advertise = input.advertise;
    await this.client.submitStore(this.sessionId, this.token, storeId, payload);
  }

  async submitHouseholdPurchases(householdId: ParticipantId, requests: CategoryPurchaseRequest[]): Promise<void> {
    await this.client.submitHousehold(this.sessionId, this.token, householdId, requests);
  }
}
