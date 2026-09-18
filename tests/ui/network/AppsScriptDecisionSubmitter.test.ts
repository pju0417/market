import { describe, expect, it } from "vitest";
import { AppsScriptSessionClient } from "../../../src/ui/network/appsScriptSessionClient.js";
import { AppsScriptDecisionSubmitter } from "../../../src/ui/network/AppsScriptDecisionSubmitter.js";
import type { FetchLike } from "../../../src/ui/network/sessionClient.js";
import { buildApiRequestFromPost, type RequestAdapterResult } from "../../../src/appsScript/requestAdapter.js";

const WEB_APP_URL = "https://script.google.com/macros/s/XYZ/exec";

function stubFetch(): { fetchImpl: FetchLike; calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  const fetchImpl: FetchLike = async (_input, init) => {
    calls.push(init ?? {});
    return new Response(JSON.stringify({ status: 200, body: { ok: true } }), { status: 200 });
  };
  return { fetchImpl, calls };
}

function decodeRequest(init: RequestInit): RequestAdapterResult {
  return buildApiRequestFromPost({ postData: { contents: init.body as string } });
}

describe("AppsScriptDecisionSubmitter", () => {
  it("submits company decisions to the company submit path", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitCompanyDecision("company-1", { quantity: 10, quality: 3, wholesalePrice: 100 });

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.path).toBe("/api/sessions/SESSION1/submit/company");
    expect(result.request.headers.authorization).toBe("Bearer tok-1");
    expect(result.request.body).toEqual({
      companyId: "company-1",
      input: { quantity: 10, quality: 3, wholesalePrice: 100 },
    });
  });

  it("submits store decisions including purchaseRequest and retailPrice when provided (구매 매칭 알고리즘 재설계 Stage 2)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", {
      purchaseRequest: { priorityPicks: [{ listingId: "listing-1", quantity: 2 }], maxQuantity: 2 },
      retailPrice: 500,
    });

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.path).toBe("/api/sessions/SESSION1/submit/store");
    expect(result.request.body).toEqual({
      storeId: "store-1",
      input: {
        purchaseRequest: { priorityPicks: [{ listingId: "listing-1", quantity: 2 }], maxQuantity: 2 },
        retailPrice: 500,
      },
    });
  });

  it("omits purchaseRequest and retailPrice entirely when not provided", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", {});

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.request.body as { storeId: string; input: Record<string, unknown> };
    expect(body).toEqual({ storeId: "store-1", input: {} });
    expect(Object.keys(body.input)).not.toContain("purchaseRequest");
    expect(Object.keys(body.input)).not.toContain("retailPrice");
  });

  it("submits store decisions including sellingCategoryId when provided (Milestone 6, D-033)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", {
      purchaseRequest: { priorityPicks: [{ listingId: "listing-1", quantity: 2 }], maxQuantity: 2 },
      retailPrice: 500,
      sellingCategoryId: "toys",
    });

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.body).toEqual({
      storeId: "store-1",
      input: {
        purchaseRequest: { priorityPicks: [{ listingId: "listing-1", quantity: 2 }], maxQuantity: 2 },
        retailPrice: 500,
        sellingCategoryId: "toys",
      },
    });
  });

  it("omits sellingCategoryId entirely when not provided", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", {
      purchaseRequest: { priorityPicks: [{ listingId: "listing-1", quantity: 2 }], maxQuantity: 2 },
    });

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.request.body as { storeId: string; input: Record<string, unknown> };
    expect(Object.keys(body.input)).not.toContain("sellingCategoryId");
  });

  it("submits company decisions including switchToCategoryId when provided (Milestone 6, D-033)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitCompanyDecision("company-1", { quantity: 10, quality: 0.5, wholesalePrice: 100, switchToCategoryId: "toys" });

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.body).toEqual({
      companyId: "company-1",
      input: { quantity: 10, quality: 0.5, wholesalePrice: 100, switchToCategoryId: "toys" },
    });
  });

  it("submits company decisions including advertise when provided (Milestone 6, D-040)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitCompanyDecision("company-1", { quantity: 10, quality: 0.5, wholesalePrice: 100, advertise: true });

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.body).toEqual({
      companyId: "company-1",
      input: { quantity: 10, quality: 0.5, wholesalePrice: 100, advertise: true },
    });
  });

  it("submits store decisions including advertise when provided, and omits it when not (Milestone 6, D-040)", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", { advertise: true });
    const withAdvertise = decodeRequest(calls[0]!);
    expect(withAdvertise.ok).toBe(true);
    if (withAdvertise.ok) {
      expect(withAdvertise.request.body).toEqual({ storeId: "store-1", input: { advertise: true } });
    }

    await submitter.submitStoreDecision("store-1", {});
    const withoutAdvertise = decodeRequest(calls[1]!);
    expect(withoutAdvertise.ok).toBe(true);
    if (withoutAdvertise.ok) {
      const body = withoutAdvertise.request.body as { storeId: string; input: Record<string, unknown> };
      expect(Object.keys(body.input)).not.toContain("advertise");
    }
  });

  it("submits household purchase requests to the household submit path", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitHouseholdPurchases("household-1", [
      { categoryId: "food", priorityPicks: [{ listingId: "listing-2", quantity: 3 }], maxQuantity: 3 },
    ]);

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.path).toBe("/api/sessions/SESSION1/submit/household");
    expect(result.request.body).toEqual({
      householdId: "household-1",
      requests: [{ categoryId: "food", priorityPicks: [{ listingId: "listing-2", quantity: 3 }], maxQuantity: 3 }],
    });
  });
});
