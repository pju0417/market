import { describe, expect, it } from "vitest";
import {
  createSession,
  getSession,
  isLobbyOpen,
  markLobbyClosedIfNeeded,
  saveSession,
  syncPhaseTimer,
  type SessionEntry,
} from "../../src/appsScript/gasSessionStore.js";
import type { SpreadsheetGateway, UuidGenerator } from "../../src/appsScript/hostInterfaces.js";

/**
 * 인메모리 `SpreadsheetGateway` 테스트 더블. 실제 시트처럼 "행 = 컬럼명→문자열 값" 모양을
 * 그대로 흉내 내되, 진짜 스프레드시트/Google API는 전혀 쓰지 않는다. 이 객체 하나를 여러
 * `getSession`/`saveSession` 호출에 계속 넘기는 것으로 "같은 실제 시트를 가리키는 서로 다른
 * (무상태) Apps Script 요청"을 시뮬레이션한다.
 */
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
    if (index >= 0) {
      rows[index] = row;
    } else {
      rows.push(row);
    }
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

describe("appsScript/gasSessionStore", () => {
  it("persists a created session so a brand-new hydrate (simulating a fresh Apps Script request) sees it", () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();

    const { sessionId, entry } = createSession(gateway, uuidGen, 3, 42);
    saveSession(gateway, sessionId, entry);

    // Simulate a brand new request: nothing but the gateway (and sessionId) survives.
    const reloaded = getSession(gateway, sessionId);
    expect(reloaded).toBeDefined();
    expect(reloaded!.teacherToken).toBe(entry.teacherToken);
    expect(reloaded!.session.getState().currentRound).toBe(1);
    expect(reloaded!.session.getState().currentPhase).toBe("company-turn");
    expect(reloaded!.session.getPlayers()).toHaveLength(3);
    expect(reloaded!.lobbyClosedByTeacher).toBe(false);
    expect(reloaded!.lobbyTimerConsumed).toBe(false);
  });

  it(
    "defaults to DEFAULT_GAS_SUBMISSION_TIMEOUT_SETTINGS (enabled) when createSession is called " +
      "without timeoutSettings, and this survives a hydrate round-trip (구매 매칭 알고리즘 재설계 " +
      "Stage 2 — code-reviewer critical bug: Apps Script sessions were silently dropping the " +
      "server-appropriate default and falling back to GameSession's local single-player default)",
    () => {
      const gateway = new FakeSpreadsheetGateway();
      const uuidGen = makeUuidGen();

      const { sessionId, entry } = createSession(gateway, uuidGen, 2, 1);
      expect(entry.session.getSubmissionTimeoutSettings()).toEqual({
        enabled: true,
        timeoutMs: 120_000,
        npcGraduatedEntryEnabled: true,
      });
      saveSession(gateway, sessionId, entry);

      const reloaded = getSession(gateway, sessionId)!;
      expect(reloaded.session.getSubmissionTimeoutSettings()).toEqual({
        enabled: true,
        timeoutMs: 120_000,
        npcGraduatedEntryEnabled: true,
      });
    },
  );

  it("persists an explicitly-provided (non-default) timeoutSettings through a hydrate round-trip", () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();
    const customTimeoutSettings = { enabled: false, timeoutMs: 5_000, npcGraduatedEntryEnabled: false };

    const { sessionId, entry } = createSession(gateway, uuidGen, 2, 1, customTimeoutSettings);
    expect(entry.session.getSubmissionTimeoutSettings()).toEqual(customTimeoutSettings);
    saveSession(gateway, sessionId, entry);

    // Simulate a brand new Apps Script request: only the gateway/sessionId survive.
    const reloaded = getSession(gateway, sessionId)!;
    expect(reloaded.session.getSubmissionTimeoutSettings()).toEqual(customTimeoutSettings);
  });

  it("returns undefined for an unknown sessionId", () => {
    const gateway = new FakeSpreadsheetGateway();
    expect(getSession(gateway, "does-not-exist")).toBeUndefined();
  });

  it("excludes students who never submitted /setup once the lobby closes, and this survives a hydrate/flush round-trip (D-031 parity)", () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();

    const { sessionId, entry } = createSession(gateway, uuidGen, 3, 1);
    const [playerA, playerB, playerC] = entry.session.getPlayers();
    saveSession(gateway, sessionId, entry);

    // "Request 1": only playerA and playerB submit /setup.
    const req1 = getSession(gateway, sessionId)!;
    req1.session.applyBusinessSetupChoices(playerA!.id, {
      companyDistrictId: "industrial",
      companyCategoryId: "electronics",
      storeDistrictId: "downtown",
      storeCategoryId: "toys",
    });
    req1.lobbySubmittedPlayerIds.add(playerA!.id);
    saveSession(gateway, sessionId, req1);

    const req2 = getSession(gateway, sessionId)!;
    req2.session.applyBusinessSetupChoices(playerB!.id, {
      companyDistrictId: "residential",
      companyCategoryId: "food",
      storeDistrictId: "school-area",
      storeCategoryId: "apparel",
    });
    req2.lobbySubmittedPlayerIds.add(playerB!.id);
    saveSession(gateway, sessionId, req2);

    // "Request 3": teacher closes the lobby before playerC ever submits /setup.
    const req3 = getSession(gateway, sessionId)!;
    req3.lobbyClosedByTeacher = true;
    expect(isLobbyOpen(req3)).toBe(false);
    const justClosed = markLobbyClosedIfNeeded(req3);
    expect(justClosed).toBe(true);
    saveSession(gateway, sessionId, req3);

    // "Request 4": ghost student (playerC) must be permanently excluded, even after a fresh hydrate.
    const req4 = getSession(gateway, sessionId)!;
    expect(req4.session.getPlayers().map((p) => p.id).sort()).toEqual([playerA!.id, playerB!.id].sort());
    expect(req4.session.getUnsubmittedParticipantIds()).not.toContain(playerC!.companyId);
    expect(() =>
      req4.session.submitCompanyDecision(playerC!.companyId, { quantity: 5, quality: 0.5, wholesalePrice: 8 }),
    ).toThrow();
    // The two real students can still finish company-turn without waiting on the ghost.
    req4.session.submitCompanyDecision(playerA!.companyId, { quantity: 5, quality: 0.5, wholesalePrice: 8 });
    req4.session.submitCompanyDecision(playerB!.companyId, { quantity: 5, quality: 0.5, wholesalePrice: 8 });
    expect(req4.session.isWaitingForHumanInput()).toBe(false);
  });

  it("round-trips buffered company submissions across a save/hydrate cycle without losing them", async () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();

    const { sessionId, entry } = createSession(gateway, uuidGen, 2, 5);
    const [playerA, playerB] = entry.session.getPlayers();
    saveSession(gateway, sessionId, entry);

    // "Request 1": only playerA submits their company decision this phase.
    const req1 = getSession(gateway, sessionId)!;
    req1.session.submitCompanyDecision(playerA!.companyId, { quantity: 8, quality: 0.6, wholesalePrice: 9 });
    saveSession(gateway, sessionId, req1);

    // "Request 2": a completely fresh hydrate must still see playerA's submission buffered,
    // and must still be waiting only on playerB.
    const req2 = getSession(gateway, sessionId)!;
    expect(req2.session.getUnsubmittedParticipantIds()).toEqual([playerB!.companyId]);
    req2.session.submitCompanyDecision(playerB!.companyId, { quantity: 6, quality: 0.4, wholesalePrice: 7 });
    expect(req2.session.isWaitingForHumanInput()).toBe(false);

    const outcome = await req2.session.advancePhase();
    expect(outcome.phase).toBe("company-turn");
    saveSession(gateway, sessionId, req2);

    // "Request 3": the phase actually advanced and the pending buffer was cleared for the new phase.
    const req3 = getSession(gateway, sessionId)!;
    expect(req3.session.getState().currentPhase).toBe("company-settlement");
    syncPhaseTimer(req3);
    saveSession(gateway, sessionId, req3);
  });

  it("appends exactly one RoundMetrics row per completed round, never rewriting past rounds", async () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();
    const { sessionId, entry } = createSession(gateway, uuidGen, 1, 9);
    saveSession(gateway, sessionId, entry);

    let current: SessionEntry = getSession(gateway, sessionId)!;
    for (let i = 0; i < 12 && current.session.getState().currentRound === 1; i++) {
      await current.session.advancePhase(true);
      saveSession(gateway, sessionId, current);
      current = getSession(gateway, sessionId)!;
    }

    const roundMetricsRowCount = gateway.readRows("RoundMetrics").filter((r) => r.sessionId === sessionId).length;
    expect(roundMetricsRowCount).toBe(1);
    expect(current.session.getState().roundMetrics).toHaveLength(1);
  });

  it("also appends human-readable RoundSummary rows exactly once per round (write-only derived data, GOOGLE_SHEETS_ARCHITECTURE.md's teacher-visible-record goal)", async () => {
    const gateway = new FakeSpreadsheetGateway();
    const uuidGen = makeUuidGen();
    const { sessionId, entry } = createSession(gateway, uuidGen, 1, 9);
    saveSession(gateway, sessionId, entry);

    let current: SessionEntry = getSession(gateway, sessionId)!;
    for (let i = 0; i < 12 && current.session.getState().currentRound === 1; i++) {
      await current.session.advancePhase(true);
      saveSession(gateway, sessionId, current);
      current = getSession(gateway, sessionId)!;
    }

    const summaryRows = gateway.readRows("RoundSummary").filter((r) => r.sessionId === sessionId);
    expect(summaryRows.length).toBeGreaterThan(0);
    expect(summaryRows.every((r) => r.round === "1")).toBe(true);

    // Re-saving without a new round completing must not duplicate the summary rows.
    saveSession(gateway, sessionId, current);
    const summaryRowsAfterResave = gateway.readRows("RoundSummary").filter((r) => r.sessionId === sessionId);
    expect(summaryRowsAfterResave).toHaveLength(summaryRows.length);
  });
});
