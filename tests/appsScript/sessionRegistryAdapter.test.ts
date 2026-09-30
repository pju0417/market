/**
 * 구매 매칭 알고리즘 재설계 Stage 2 — code-reviewer가 실제 esbuild 번들 산출물에서 재현해
 * 발견한 critical 버그의 회귀 테스트: `src/server/httpApi.ts`가 세션 생성 시
 * `createSession(studentCount, rngSeed, timeoutSettings)`를 3개 인자로 호출하는데,
 * `sessionRegistryAdapter.createSession`이 `timeoutSettings`를 받지 않으면(2개 인자만
 * 받으면) JS는 초과 인자를 조용히 버린다 — 타입체크도 이 파일을 `httpApi.ts`의 실제
 * import 대상과 대조 검증하지 않으므로(esbuild alias가 번들링 시점에만 적용됨, 이 파일
 * 자신의 문서 주석 참고) 컴파일 단계에서도 이 불일치를 못 잡는다. 이 테스트는
 * `sessionRegistryAdapter.ts`를 직접 호출해 `timeoutSettings`가 실제로
 * `gasSessionStore.createSession`까지 전달되고, 시트 왕복(무상태 Apps Script 재현) 후에도
 * 유지되는지 확인한다 — 이 파일이 생기기 전까지는 `sessionRegistryAdapter.ts`를 직접
 * 검증하는 테스트가 전혀 없었다.
 */
import { describe, expect, it } from "vitest";
import {
  configureSessionRegistryAdapter,
  createSession,
  flushSessionRegistryAdapter,
  getSession,
} from "../../src/appsScript/sessionRegistryAdapter.js";
import type { SpreadsheetGateway, UuidGenerator } from "../../src/appsScript/hostInterfaces.js";

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
    const row = this.rows(sheetName).find((r) => r[matchColumn] === matchValue);
    return row ? { ...row } : undefined;
  }

  appendRow(sheetName: string, row: Record<string, string>): void {
    this.rows(sheetName).push(row);
  }
}

function makeUuidGen(): UuidGenerator {
  let counter = 0;
  return () => `uuid-${counter++}`;
}

describe("appsScript/sessionRegistryAdapter", () => {
  it(
    "forwards timeoutSettings through to the underlying GameSession, and this survives a " +
      "fresh-request hydrate (configure → getSession) — the exact bug found in the bundled output",
    () => {
      const gateway = new FakeSpreadsheetGateway();
      const uuidGen = makeUuidGen();
      const customTimeoutSettings = { enabled: false, timeoutMs: 5_000, npcGraduatedEntryEnabled: false };

      configureSessionRegistryAdapter(gateway, uuidGen);
      const { sessionId, entry } = createSession(2, 1, customTimeoutSettings);
      expect(entry.session.getSubmissionTimeoutSettings()).toEqual(customTimeoutSettings);
      flushSessionRegistryAdapter();

      // Simulate a brand-new Apps Script request: reconfigure with the same gateway (nothing
      // else survives) and hydrate the session fresh.
      configureSessionRegistryAdapter(gateway, uuidGen);
      const reloaded = getSession(sessionId);
      expect(reloaded).toBeDefined();
      expect(reloaded!.session.getSubmissionTimeoutSettings()).toEqual(customTimeoutSettings);
    },
  );

  it("defaults to the disabled, 120s, npc-graduated-entry server settings when timeoutSettings is omitted", () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();

    configureSessionRegistryAdapter(gateway, uuidGen);
    const { entry } = createSession(2, 1);
    expect(entry.session.getSubmissionTimeoutSettings()).toEqual({
      enabled: false,
      timeoutMs: 120_000,
      npcGraduatedEntryEnabled: true,
    });
  });
});
