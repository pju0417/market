import { describe, expect, it, vi } from "vitest";
import { dispatchApiRequest, type DispatchDeps, type HandleApiRequestFn } from "../../src/appsScript/dispatch.js";
import type { LockLike, SpreadsheetGateway, UuidGenerator } from "../../src/appsScript/hostInterfaces.js";
import { handleApiRequest } from "../../src/server/httpApi.js";
import type { ApiRequest } from "../../src/server/httpApi.js";

class FakeLock implements LockLike {
  waitLockCalls = 0;
  releaseLockCalls = 0;
  private readonly shouldTimeout: boolean;

  constructor(shouldTimeout = false) {
    this.shouldTimeout = shouldTimeout;
  }

  waitLock(_timeoutMs: number): void {
    this.waitLockCalls++;
    if (this.shouldTimeout) {
      throw new Error("could not acquire lock within timeout");
    }
  }

  releaseLock(): void {
    this.releaseLockCalls++;
  }
}

class FakeSpreadsheetGateway implements SpreadsheetGateway {
  private readonly sheets = new Map<string, Record<string, string>[]>();

  private rows(sheetName: string): Record<string, string>[] {
    let rows = this.sheets.get(sheetName);
    if (!rows) {
      rows = [];
      this.sheets.set(sheetName, rows);
    }
    return rows;
  }

  readRows(sheetName: string): Record<string, string>[] {
    return this.rows(sheetName).map((row) => ({ ...row }));
  }

  upsertRow(sheetName: string, matchColumn: string, matchValue: string, row: Record<string, string>): void {
    const rows = this.rows(sheetName);
    const index = rows.findIndex((r) => r[matchColumn] === matchValue);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }

  deleteRow(sheetName: string, matchColumn: string, matchValue: string): void {
    const rows = this.rows(sheetName);
    const index = rows.findIndex((r) => r[matchColumn] === matchValue);
    if (index >= 0) rows.splice(index, 1);
  }

  findRow(sheetName: string, matchColumn: string, matchValue: string): Record<string, string> | undefined {
    return this.rows(sheetName).find((r) => r[matchColumn] === matchValue);
  }

  appendRow(sheetName: string, row: Record<string, string>): void {
    this.rows(sheetName).push(row);
  }
}

function makeUuidGen(): UuidGenerator {
  let counter = 0;
  return () => `id-${counter++}`;
}

function makeDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    gateway: new FakeSpreadsheetGateway(),
    lock: new FakeLock(),
    uuidGen: makeUuidGen(),
    handleApiRequest: (async () => ({ status: 200, body: { ok: true } })) as HandleApiRequestFn,
    ...overrides,
  };
}

const noopRequest: ApiRequest = { method: "GET", path: "/api/sessions/does-not-exist/slots", query: {}, headers: {} };

describe("appsScript/dispatch", () => {
  it("acquires the lock, runs the handler, and releases the lock on success", async () => {
    const lock = new FakeLock();
    const handler = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const deps = makeDeps({ lock, handleApiRequest: handler as HandleApiRequestFn });

    const response = await dispatchApiRequest(deps, noopRequest);

    expect(response).toEqual({ status: 200, body: { ok: true } });
    expect(lock.waitLockCalls).toBe(1);
    expect(lock.releaseLockCalls).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("responds 503 without calling the handler or releasing the lock when the lock times out", async () => {
    const lock = new FakeLock(true);
    const handler = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const deps = makeDeps({ lock, handleApiRequest: handler as HandleApiRequestFn });

    const response = await dispatchApiRequest(deps, noopRequest);

    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(lock.releaseLockCalls).toBe(0);
  });

  it("releases the lock and responds 500 when the handler throws", async () => {
    const lock = new FakeLock();
    const deps = makeDeps({
      lock,
      handleApiRequest: (async () => {
        throw new Error("boom");
      }) as HandleApiRequestFn,
    });

    const response = await dispatchApiRequest(deps, noopRequest);

    expect(response.status).toBe(500);
    expect(lock.releaseLockCalls).toBe(1);
  });

  it("routes a real create-session request through the real handleApiRequest", async () => {
    const deps = makeDeps({ handleApiRequest });

    const response = await dispatchApiRequest(deps, {
      method: "POST",
      path: "/api/sessions",
      query: {},
      headers: {},
      body: { studentCount: 1, rngSeed: 1 },
    });

    expect(response.status).toBe(201);
    const body = response.body as { sessionId: string; teacherToken: string };
    expect(typeof body.sessionId).toBe("string");
    expect(typeof body.teacherToken).toBe("string");
  });

  it("returns a 404 for an unknown route via the real handleApiRequest", async () => {
    const deps = makeDeps({ handleApiRequest });

    const response = await dispatchApiRequest(deps, {
      method: "GET",
      path: "/api/unknown",
      query: {},
      headers: {},
    });

    expect(response.status).toBe(404);
  });
});
