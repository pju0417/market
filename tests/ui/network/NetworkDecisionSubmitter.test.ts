/**
 * `NetworkDecisionSubmitter`가 실제로 SessionClient(HTTP)에 넘기는 요청 바디를 검증한다
 * (구매 매칭 알고리즘 재설계 Stage 2 — 네트워크 계약 회귀 테스트). `AppsScriptDecisionSubmitter.test.ts`와
 * 같은 필드 조합을 검증한다 — 한쪽만 고치면 로컬 서버/Apps Script 경로 중 하나가 조용히
 * 깨지므로, 두 파일을 항상 함께 유지해야 한다.
 */
import { describe, expect, it } from "vitest";
import { SessionClient, type FetchLike } from "../../../src/ui/network/sessionClient.js";
import { NetworkDecisionSubmitter } from "../../../src/ui/network/NetworkDecisionSubmitter.js";

function stubFetch(): { fetchImpl: FetchLike; calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  const fetchImpl: FetchLike = async (_input, init) => {
    calls.push(init ?? {});
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return { fetchImpl, calls };
}

function decodeBody(init: RequestInit): unknown {
  return JSON.parse(init.body as string);
}

describe("NetworkDecisionSubmitter", () => {
  it("submits company decisions to the company submit path", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new SessionClient("http://example.test", fetchImpl);
    const submitter = new NetworkDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitCompanyDecision("company-1", { quantity: 10, quality: 0.5, wholesalePrice: 100 });

    expect(decodeBody(calls[0]!)).toEqual({
      companyId: "company-1",
      input: { quantity: 10, quality: 0.5, wholesalePrice: 100 },
    });
  });

  it("submits company decisions including switchToCategoryId when provided (Milestone 6, D-033)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new SessionClient("http://example.test", fetchImpl);
    const submitter = new NetworkDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitCompanyDecision("company-1", {
      quantity: 10,
      quality: 0.5,
      wholesalePrice: 100,
      switchToCategoryId: "toys",
    });

    expect(decodeBody(calls[0]!)).toEqual({
      companyId: "company-1",
      input: { quantity: 10, quality: 0.5, wholesalePrice: 100, switchToCategoryId: "toys" },
    });
  });

  it("submits store decisions including purchaseRequest and retailPrice when provided (구매 매칭 알고리즘 재설계 Stage 2)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new SessionClient("http://example.test", fetchImpl);
    const submitter = new NetworkDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", {
      purchaseRequest: {
        priorityPicks: [{ listingId: "listing-1", quantity: 2 }],
        maxQuantity: 5,
        maxUnitPrice: 1000,
        autoFillPreference: "quality",
      },
      retailPrice: 500,
    });

    expect(decodeBody(calls[0]!)).toEqual({
      storeId: "store-1",
      input: {
        purchaseRequest: {
          priorityPicks: [{ listingId: "listing-1", quantity: 2 }],
          maxQuantity: 5,
          maxUnitPrice: 1000,
          autoFillPreference: "quality",
        },
        retailPrice: 500,
      },
    });
  });

  it("submits store decisions including sellingCategoryId when provided (Milestone 6, D-033)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new SessionClient("http://example.test", fetchImpl);
    const submitter = new NetworkDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", {
      purchaseRequest: { priorityPicks: [{ listingId: "listing-1", quantity: 2 }], maxQuantity: 2 },
      retailPrice: 500,
      sellingCategoryId: "toys",
    });

    expect(decodeBody(calls[0]!)).toEqual({
      storeId: "store-1",
      input: {
        purchaseRequest: { priorityPicks: [{ listingId: "listing-1", quantity: 2 }], maxQuantity: 2 },
        retailPrice: 500,
        sellingCategoryId: "toys",
      },
    });
  });

  it("omits purchaseRequest, retailPrice and sellingCategoryId entirely when not provided", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new SessionClient("http://example.test", fetchImpl);
    const submitter = new NetworkDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", {});

    const body = decodeBody(calls[0]!) as { storeId: string; input: Record<string, unknown> };
    expect(body).toEqual({ storeId: "store-1", input: {} });
    expect(Object.keys(body.input)).not.toContain("purchaseRequest");
    expect(Object.keys(body.input)).not.toContain("retailPrice");
    expect(Object.keys(body.input)).not.toContain("sellingCategoryId");
  });

  it("submits company decisions including advertise when provided (Milestone 6, D-040)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new SessionClient("http://example.test", fetchImpl);
    const submitter = new NetworkDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitCompanyDecision("company-1", { quantity: 10, quality: 0.5, wholesalePrice: 100, advertise: true });

    expect(decodeBody(calls[0]!)).toEqual({
      companyId: "company-1",
      input: { quantity: 10, quality: 0.5, wholesalePrice: 100, advertise: true },
    });
  });

  it("submits store decisions including advertise when provided, and omits it when not (Milestone 6, D-040)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new SessionClient("http://example.test", fetchImpl);
    const submitter = new NetworkDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", { advertise: true });
    expect(decodeBody(calls[0]!)).toEqual({ storeId: "store-1", input: { advertise: true } });

    await submitter.submitStoreDecision("store-1", {});
    const body = decodeBody(calls[1]!) as { storeId: string; input: Record<string, unknown> };
    expect(Object.keys(body.input)).not.toContain("advertise");
  });

  it("submits household purchase requests to the household submit path", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new SessionClient("http://example.test", fetchImpl);
    const submitter = new NetworkDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitHouseholdPurchases("household-1", [
      { categoryId: "food", priorityPicks: [{ listingId: "listing-2", quantity: 3 }], maxQuantity: 3 },
    ]);

    expect(decodeBody(calls[0]!)).toEqual({
      householdId: "household-1",
      requests: [{ categoryId: "food", priorityPicks: [{ listingId: "listing-2", quantity: 3 }], maxQuantity: 3 }],
    });
  });
});
