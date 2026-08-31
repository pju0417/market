import { describe, expect, it } from "vitest";
import { AppsScriptSessionClient } from "../../../src/ui/network/appsScriptSessionClient.js";
import { ApiError, type FetchLike } from "../../../src/ui/network/sessionClient.js";
import { translateNetworkError } from "../../../src/ui/network/errorMessages.js";
import { buildApiRequestFromPost } from "../../../src/appsScript/requestAdapter.js";

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

/** 모든 호출에 같은 JSON 바디를 돌려주는 가짜 fetch. `envelope`는 그대로 응답 바디가 되고,
 * `httpStatus`는 실제 HTTP 상태 코드로 쓰인다(Apps Script는 항상 200을 내려보내지만, 방어
 * 경로 테스트를 위해 다른 값도 넣을 수 있게 둔다). */
function stubFetch(envelope: unknown, httpStatus = 200): { fetchImpl: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(envelope), { status: httpStatus });
  };
  return { fetchImpl, calls };
}

const WEB_APP_URL = "https://script.google.com/macros/s/XYZ/exec";

describe("AppsScriptSessionClient", () => {
  describe("GET requests", () => {
    it("carry path and since as query params on the bare webAppUrl with no custom headers", async () => {
      const { fetchImpl, calls } = stubFetch({ status: 200, body: { version: 1 } });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await client.getState("SESSION1", 5);

      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      const url = new URL(call.url);
      expect(`${url.origin}${url.pathname}`).toBe(WEB_APP_URL);
      expect(url.searchParams.get("path")).toBe("/api/sessions/SESSION1/state");
      expect(url.searchParams.get("since")).toBe("5");
      expect(call.init).toBeUndefined();
    });

    it("omit the since query param entirely when not provided", async () => {
      const { fetchImpl, calls } = stubFetch({ status: 200, body: [] });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await client.getSlots("SESSION1");

      const url = new URL(calls[0]!.url);
      expect(url.searchParams.get("path")).toBe("/api/sessions/SESSION1/slots");
      expect(url.searchParams.has("since")).toBe(false);
    });
  });

  describe("POST requests", () => {
    it("always target the bare webAppUrl with a text/plain header and a {path, token, body} JSON payload", async () => {
      const { fetchImpl, calls } = stubFetch({ status: 200, body: { ok: true } });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await client.submitCompany("SESSION1", "tok-1", "company-1", { quantity: 10, quality: 3, wholesalePrice: 100 });

      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.url).toBe(WEB_APP_URL);
      expect(call.init?.method).toBe("POST");
      expect(call.init?.headers).toEqual({ "content-type": "text/plain;charset=utf-8" });

      const rawBody = call.init?.body;
      expect(typeof rawBody).toBe("string");

      // 계약 자체를 검증한다: 이 바디가 실제로 requestAdapter의 파서를 통과해 기대한
      // ApiRequest가 되는지까지 확인한다.
      const result = buildApiRequestFromPost({ postData: { contents: rawBody as string } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.request.method).toBe("POST");
      expect(result.request.path).toBe("/api/sessions/SESSION1/submit/company");
      expect(result.request.headers.authorization).toBe("Bearer tok-1");
      expect(result.request.body).toEqual({
        companyId: "company-1",
        input: { quantity: 10, quality: 3, wholesalePrice: 100 },
      });
    });

    it("send {path, token} with no body key for bodyless requests like forceAdvance", async () => {
      const { fetchImpl, calls } = stubFetch({ status: 200, body: { ok: true } });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await client.forceAdvance("SESSION1", "teacher-tok");

      const parsed = JSON.parse(calls[0]!.init!.body as string) as Record<string, unknown>;
      expect(parsed).toEqual({ path: "/api/sessions/SESSION1/force-advance", token: "teacher-tok" });
      expect(Object.keys(parsed)).not.toContain("body");
    });

    it("send {path, token} with no body key for bodyless requests like closeLobby", async () => {
      const { fetchImpl, calls } = stubFetch({ status: 200, body: { ok: true } });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await client.closeLobby("SESSION1", "teacher-tok");

      const parsed = JSON.parse(calls[0]!.init!.body as string) as Record<string, unknown>;
      expect(parsed).toEqual({ path: "/api/sessions/SESSION1/close-lobby", token: "teacher-tok" });
      expect(Object.keys(parsed)).not.toContain("body");
    });
  });

  describe("response envelope handling", () => {
    it("unwraps a {status: 200, body} envelope to body", async () => {
      const { fetchImpl } = stubFetch({ status: 200, body: { hello: "world" } });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await expect(client.getSlots("S1")).resolves.toEqual({ hello: "world" });
    });

    it("unwraps a {status: 201, body} envelope to body", async () => {
      const { fetchImpl } = stubFetch({ status: 201, body: { sessionId: "S1", teacherToken: "tt" } });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await expect(client.createSession(4)).resolves.toEqual({ sessionId: "S1", teacherToken: "tt" });
    });

    it.each([400, 401, 403, 404, 503])("throws an ApiError carrying the embedded status/message for a %i envelope", async (status) => {
      const { fetchImpl } = stubFetch({ status, body: { error: "unknown sessionId" } });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await expect(client.getSlots("S1")).rejects.toMatchObject({ status, message: "unknown sessionId" });
    });

    it("throws ApiErrors that translateNetworkError still recognizes", async () => {
      const { fetchImpl } = stubFetch({ status: 400, body: { error: "lobby already closed" } });
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      let caught: unknown;
      try {
        await client.getSlots("S1");
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApiError);
      expect(translateNetworkError(caught)).toBe("이미 다른 학생들이 준비를 마쳐서 창업 준비 시간이 끝났어요.");
    });

    it("throws when the parsed response is not a {status, body} envelope (defensive path)", async () => {
      const { fetchImpl } = stubFetch({ foo: "bar" }, 502);
      const client = new AppsScriptSessionClient(WEB_APP_URL, fetchImpl);

      await expect(client.getSlots("S1")).rejects.toMatchObject({ status: 502, body: { foo: "bar" } });
    });
  });
});
