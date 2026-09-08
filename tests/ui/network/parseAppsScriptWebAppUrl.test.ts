import { describe, expect, it } from "vitest";
import { looksLikeExecUrl, parseAppsScriptWebAppUrl } from "../../../src/ui/network/parseAppsScriptWebAppUrl.js";

describe("parseAppsScriptWebAppUrl", () => {
  it("rejects an empty string", () => {
    expect(parseAppsScriptWebAppUrl("")).toEqual({ ok: false, reason: expect.any(String) });
  });

  it("rejects a whitespace-only string", () => {
    expect(parseAppsScriptWebAppUrl("   ")).toEqual({ ok: false, reason: expect.any(String) });
  });

  it("rejects a non-https scheme", () => {
    expect(parseAppsScriptWebAppUrl("http://script.google.com/macros/s/AKfycb.../exec")).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it("rejects garbage input", () => {
    expect(parseAppsScriptWebAppUrl("not a url at all")).toEqual({ ok: false, reason: expect.any(String) });
  });

  it("accepts a well-formed exec URL", () => {
    const result = parseAppsScriptWebAppUrl("https://script.google.com/macros/s/AKfycbXYZ/exec");
    expect(result).toEqual({ ok: true, url: "https://script.google.com/macros/s/AKfycbXYZ/exec" });
  });

  it("accepts an https URL without the /exec suffix (soft check only)", () => {
    const result = parseAppsScriptWebAppUrl("https://script.google.com/macros/s/AKfycbXYZ");
    expect(result).toEqual({ ok: true, url: "https://script.google.com/macros/s/AKfycbXYZ" });
  });

  it("trims surrounding whitespace before validating", () => {
    const result = parseAppsScriptWebAppUrl("  https://script.google.com/macros/s/AKfycbXYZ/exec  ");
    expect(result).toEqual({ ok: true, url: "https://script.google.com/macros/s/AKfycbXYZ/exec" });
  });
});

describe("looksLikeExecUrl", () => {
  it("returns true for URLs ending in /exec", () => {
    expect(looksLikeExecUrl("https://script.google.com/macros/s/AKfycbXYZ/exec")).toBe(true);
  });

  it("returns false for URLs not ending in /exec", () => {
    expect(looksLikeExecUrl("https://script.google.com/macros/s/AKfycbXYZ")).toBe(false);
  });
});
