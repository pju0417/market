/**
 * `scripts/build-apps-script.ts`를 실제로 실행해 Apps Script에 붙여넣을 수 있는 번들이
 * 만들어지는지 확인한다 (Milestone 5 2부, D-032). Apps Script는 ES 모듈/CommonJS를 지원하지
 * 않으므로, 산출물에 `import`/`export`/`require` 토큰이 전혀 남아있지 않아야 하고
 * `doGet`/`doPost`가 전역에서 호출 가능한 함수여야 한다.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { buildAppsScript } from "../../scripts/build-apps-script.js";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import { deliveredListings } from "../../src/economy/city.js";
import { eligibleWholesaleListingsForStore } from "../../src/economy/market.js";
import type { GameState } from "../../src/types/domain.js";

let bundle = "";
let outfile = "";

beforeAll(async () => {
  const result = await buildAppsScript();
  outfile = result.outfile;
  expect(result.errorCount).toBe(0);
  bundle = readFileSync(outfile, "utf8");
}, 60_000);

describe("scripts/build-apps-script.ts", () => {
  it("returns synchronous TextOutput and advances persisted games under the lock", () => {
    class Sheet {
      rows: string[][] = [];
      getDataRange() { return { getValues: () => this.rows.map((row) => [...row]) }; }
      getLastRow() { return this.rows.length; }
      appendRow(row: string[]) { this.rows.push([...row]); }
      deleteRow(index: number) { this.rows.splice(index - 1, 1); }
      getRange(index: number) { return { setValues: (rows: string[][]) => { this.rows[index - 1] = [...rows[0]!]; } }; }
    }
    const sheets = new Map<string, Sheet>();
    let locked = false;
    let flushes = 0;
    const host = {
      SpreadsheetApp: {
        getActiveSpreadsheet: () => ({
          getSheetByName: (name: string) => sheets.get(name),
          insertSheet: (name: string) => { const sheet = new Sheet(); sheets.set(name, sheet); return sheet; },
        }),
        flush: () => { expect(locked).toBe(true); flushes++; },
      },
      LockService: { getScriptLock: () => ({
        waitLock: () => { expect(locked).toBe(false); locked = true; },
        releaseLock: () => { locked = false; },
      }) },
      Utilities: { getUuid: randomUUID },
      ContentService: {
        MimeType: { JSON: "application/json" },
        createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
      },
    };
    type Response = { status: number; body: Record<string, unknown> };
    function request(method: "GET" | "POST", path: string, body?: unknown, token?: string): Response {
      // Each Apps Script invocation receives a fresh JS context, sharing only Sheets.
      const context = { ...host, doGet: undefined, doPost: undefined };
      runInNewContext(bundle, context);
      const handler = context[method === "GET" ? "doGet" : "doPost"] as unknown as (event: unknown) => { text: string };
      const output = handler(method === "GET" ? { parameter: { path } } :
        { postData: { contents: JSON.stringify({ path, body, token }) } });
      expect(output).not.toHaveProperty("then");
      expect(locked).toBe(false);
      return JSON.parse(output.text) as Response;
    }
    expect(request("GET", "/api/sessions/missing/slots").status).toBe(404);
    const created = request("POST", "/api/sessions", { studentCount: 1, rngSeed: 42 });
    expect(created.status).toBe(201);
    const base = `/api/sessions/${String(created.body.sessionId)}`;
    const teacher = String(created.body.teacherToken);
    const joined = request("POST", `${base}/join`, { playerId: "student-1" });
    const token = String(joined.body.token);
    expect(request("POST", `${base}/setup`, {
      companyDistrictId: "industrial", companyCategoryId: "electronics",
      storeDistrictId: "downtown", storeCategoryId: "toys",
    }, token).status).toBe(200);
    expect(request("POST", `${base}/close-lobby`, {}, teacher).status).toBe(200);
    expect(request("POST", `${base}/force-advance`, {}).status).toBe(401);
    expect(request("POST", `${base}/force-advance`, {}, teacher).status).toBe(200);
    const state = request("GET", `${base}/state`).body.state as GameState;
    const store = Object.values(state.stores).find((s) => s.kind === "student")!;
    const listing = deliveredListings(state, store.id,
      eligibleWholesaleListingsForStore(store, state.wholesaleListings, state.companies))
      .find((l) => l.categoryId === store.specialtyCategoryId && l.quantityAvailable > 0)!;
    const cartBody = { storeId: store.id, cart: { requestId: "bundle-cart", round: 1, retailPrice: 20,
      lines: [{ listingId: listing.id, quantity: 1, unitPrice: listing.price }] } };
    const receipt = request("POST", `${base}/submit/store`, cartBody, token);
    expect(receipt.status).toBe(200);
    expect(request("POST", `${base}/submit/store`, cartBody, token)).toEqual(receipt);
    const afterCart = request("GET", `${base}/state`).body.state as GameState;
    expect(afterCart.currentPhase).toBe("store-turn");
    expect(afterCart.stores[store.id]!.ledger.cash).toBeLessThan(store.ledger.cash);
    for (let step = 0; step < 27; step++) {
      const result = request("POST", `${base}/force-advance`, {}, teacher);
      expect(result.status, JSON.stringify(result)).toBe(200);
    }
    expect(flushes).toBeGreaterThan(28);
    expect(bundle).not.toMatch(/\basync\s+function/);
  });
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


