/**
 * `scripts/build-apps-script.ts`를 실제로 실행해 Apps Script에 붙여넣을 수 있는 번들이
 * 만들어지는지 확인한다 (Milestone 5 2부, D-032). Apps Script는 ES 모듈/CommonJS를 지원하지
 * 않으므로, 산출물에 `import`/`export`/`require` 토큰이 전혀 남아있지 않아야 하고
 * `doGet`/`doPost`가 전역에서 호출 가능한 함수여야 한다.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { buildAppsScript } from "../../scripts/build-apps-script.js";

let bundle = "";
let outfile = "";

beforeAll(async () => {
  const result = await buildAppsScript();
  outfile = result.outfile;
  expect(result.errorCount).toBe(0);
  bundle = readFileSync(outfile, "utf8");
}, 60_000);

describe("scripts/build-apps-script.ts", () => {
  it("produces dist/apps-script/Code.gs.js", () => {
    expect(existsSync(outfile)).toBe(true);
    expect(bundle.length).toBeGreaterThan(0);
  });

  it("contains no ES module / CommonJS tokens (Apps Script does not support them)", () => {
    expect(/\bimport\b/.test(bundle)).toBe(false);
    expect(/\bexport\b/.test(bundle)).toBe(false);
    expect(/\brequire\(/.test(bundle)).toBe(false);
  });

  it("exposes doGet/doPost as globals", () => {
    expect(/globalThis\.doGet\s*=/.test(bundle)).toBe(true);
    expect(/globalThis\.doPost\s*=/.test(bundle)).toBe(true);
  });

  it("is wrapped as an IIFE (no bare top-level statements expected by a module system)", () => {
    const withoutUseStrict = bundle.trimStart().replace(/^"use strict";\s*/, "");
    expect(withoutUseStrict.startsWith("(()")).toBe(true);
  });
});
