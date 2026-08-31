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

  it("submits store decisions including retailPrice when provided", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", {
      purchases: [{ listingId: "listing-1", quantity: 2 }],
      retailPrice: 500,
    });

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.path).toBe("/api/sessions/SESSION1/submit/store");
    expect(result.request.body).toEqual({
      storeId: "store-1",
      input: { purchases: [{ listingId: "listing-1", quantity: 2 }], retailPrice: 500 },
    });
  });

  it("omits retailPrice entirely when not provided", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitStoreDecision("store-1", { purchases: [{ listingId: "listing-1", quantity: 2 }] });

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.request.body as { storeId: string; input: Record<string, unknown> };
    expect(body).toEqual({ storeId: "store-1", input: { purchases: [{ listingId: "listing-1", quantity: 2 }] } });
    expect(Object.keys(body.input)).not.toContain("retailPrice");
  });

  it("submits household purchases to the household submit path", async () => {
    const { fetchImpl, calls } = stubFetch();
    const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);
    const submitter = new AppsScriptDecisionSubmitter(client, "SESSION1", "tok-1");

    await submitter.submitHouseholdPurchases("household-1", [{ listingId: "listing-2", quantity: 3 }]);

    const result = decodeRequest(calls[0]!);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.path).toBe("/api/sessions/SESSION1/submit/household");
    expect(result.request.body).toEqual({
      householdId: "household-1",
      lines: [{ listingId: "listing-2", quantity: 3 }],
    });
  });
});
