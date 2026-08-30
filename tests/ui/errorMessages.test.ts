import { describe, expect, it } from "vitest";
import { translateNetworkError } from "../../src/ui/network/errorMessages.js";
import { ApiError } from "../../src/ui/network/sessionClient.js";

describe("translateNetworkError", () => {
  it("translates known server error strings to Korean guidance", () => {
    expect(translateNetworkError(new Error("unknown sessionId"))).toBe(
      "그 세션 번호를 찾을 수 없어요. 번호를 다시 확인해주세요.",
    );
    expect(translateNetworkError(new Error("unknown playerId"))).toBe("그 이름을 찾을 수 없어요.");
    expect(translateNetworkError(new Error("lobby already closed"))).toBe(
      "이미 다른 학생들이 준비를 마쳐서 창업 준비 시간이 끝났어요.",
    );
    expect(translateNetworkError(new Error("missing or invalid token"))).toBe("로그인이 만료됐어요. 다시 참가해주세요.");
    expect(translateNetworkError(new Error("missing or invalid teacher token"))).toBe(
      "로그인이 만료됐어요. 다시 참가해주세요.",
    );
    expect(translateNetworkError(new Error("business setup not finished yet"))).toBe(
      "아직 창업 준비가 안 끝났어요. 잠시만 기다려주세요.",
    );
  });

  it("falls back to the original message for unknown errors", () => {
    expect(translateNetworkError(new Error("something totally unexpected"))).toBe("something totally unexpected");
    expect(translateNetworkError("plain string error")).toBe("plain string error");
  });

  it("uses ApiError's message, which is populated from the server's { error } body", () => {
    const apiError = new ApiError(400, { error: "lobby already closed" });
    expect(translateNetworkError(apiError)).toBe("이미 다른 학생들이 준비를 마쳐서 창업 준비 시간이 끝났어요.");
  });

  it("ApiError falls back to a generic status message when the body has no error string", () => {
    const apiError = new ApiError(500, { unexpected: true });
    expect(apiError.message).toBe("API request failed with status 500");
  });
});
