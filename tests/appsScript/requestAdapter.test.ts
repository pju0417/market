import { describe, expect, it } from "vitest";
import {
  buildApiRequestFromGet,
  buildApiRequestFromPost,
  type GasGetEvent,
  type GasPostEvent,
} from "../../src/appsScript/requestAdapter.js";

describe("appsScript/requestAdapter", () => {
  describe("buildApiRequestFromGet", () => {
    it("converts e.parameter into an ApiRequest, splitting out path/token from the query", () => {
      const e: GasGetEvent = {
        parameter: { path: "/api/sessions/ABC123/state", since: "5", token: "tok-1" },
      };

      const result = buildApiRequestFromGet(e);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.request.method).toBe("GET");
      expect(result.request.path).toBe("/api/sessions/ABC123/state");
      expect(result.request.query).toEqual({ since: "5" });
      expect(result.request.headers.authorization).toBe("Bearer tok-1");
    });

    it("omits the authorization header entirely when no token is present", () => {
      const e: GasGetEvent = { parameter: { path: "/api/sessions/ABC123/slots" } };

      const result = buildApiRequestFromGet(e);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.request.headers.authorization).toBeUndefined();
      expect(result.request.query).toEqual({});
    });

    it("returns a 400 response when path is missing", () => {
      const result = buildApiRequestFromGet({ parameter: { since: "5" } });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(400);
    });

    it("returns a 400 response when e.parameter itself is missing", () => {
      const result = buildApiRequestFromGet({});

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(400);
    });
  });

  describe("buildApiRequestFromPost", () => {
    it("converts e.postData.contents into an ApiRequest with path/token/body", () => {
      const e: GasPostEvent = {
        postData: {
          contents: JSON.stringify({
            path: "/api/sessions/ABC123/submit/company",
            token: "tok-1",
            body: { companyId: "co-1", input: { quantity: 10, quality: 3, wholesalePrice: 100 } },
          }),
        },
      };

      const result = buildApiRequestFromPost(e);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.request.method).toBe("POST");
      expect(result.request.path).toBe("/api/sessions/ABC123/submit/company");
      expect(result.request.headers.authorization).toBe("Bearer tok-1");
      expect(result.request.body).toEqual({
        companyId: "co-1",
        input: { quantity: 10, quality: 3, wholesalePrice: 100 },
      });
    });

    it("omits the authorization header when no token is present in the body", () => {
      const e: GasPostEvent = {
        postData: { contents: JSON.stringify({ path: "/api/sessions", body: { studentCount: 5 } }) },
      };

      const result = buildApiRequestFromPost(e);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.request.headers.authorization).toBeUndefined();
    });

    it("returns a 400 response when postData.contents is missing", () => {
      const result = buildApiRequestFromPost({});

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(400);
    });

    it("returns a 400 response when postData.contents is not valid JSON", () => {
      const result = buildApiRequestFromPost({ postData: { contents: "{not json" } });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(400);
    });

    it("returns a 400 response when the parsed body has no string path field", () => {
      const result = buildApiRequestFromPost({ postData: { contents: JSON.stringify({ token: "tok-1" }) } });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(400);
    });
  });
});
