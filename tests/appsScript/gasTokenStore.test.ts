import { describe, expect, it } from "vitest";
import { issueToken, resolvePlayerId } from "../../src/appsScript/gasTokenStore.js";
import type { SpreadsheetGateway } from "../../src/appsScript/hostInterfaces.js";

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

function makeUuidGen() {
  let counter = 0;
  return () => `token-${counter++}`;
}

describe("appsScript/gasTokenStore", () => {
  it("issues a token that resolves back to the same playerId within the same session", () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();

    const token = issueToken(gateway, uuidGen, "session-1", "player-a");

    expect(resolvePlayerId(gateway, "session-1", token)).toBe("player-a");
  });

  it("does not resolve a token issued for a different session (session-scoped)", () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();

    const token = issueToken(gateway, uuidGen, "session-1", "player-a");

    expect(resolvePlayerId(gateway, "session-2", token)).toBeUndefined();
  });

  it("returns undefined for an unknown token", () => {
    const gateway = new FakeSpreadsheetGateway();
    expect(resolvePlayerId(gateway, "session-1", "no-such-token")).toBeUndefined();
  });

  it("loose join: re-issuing for the same playerId adds a new token without invalidating the old one", () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();

    const first = issueToken(gateway, uuidGen, "session-1", "player-a");
    const second = issueToken(gateway, uuidGen, "session-1", "player-a");

    expect(first).not.toBe(second);
    expect(resolvePlayerId(gateway, "session-1", first)).toBe("player-a");
    expect(resolvePlayerId(gateway, "session-1", second)).toBe("player-a");
  });
});
