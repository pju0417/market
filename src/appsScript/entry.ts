/**
 * 실제 Google Apps Script Web App 진입점 (Milestone 5 2부, D-032).
 *
 * **이 파일은 실제 Apps Script 환경 밖에서는 실행 검증이 원천적으로 불가능하다** —
 * `SpreadsheetApp`/`LockService`/`Utilities`/`ContentService`는 Apps Script 런타임에만
 * 존재하는 전역이라 vitest/Node에서 흉내 낼 수 없다. 그래서 이 파일은 의도적으로 얇게
 * 만들었다: `hostInterfaces.ts` 인터페이스에 맞춰 저 전역들을 감싸는 최소한의 어댑터
 * (`realGateway`/`realLock`/`realUuidGen`)만 구현하고, 실제 로직(라우팅/인증/락/세션
 * 하이드레이트-플러시)은 전부 `requestAdapter.ts`/`dispatch.ts`/`sessionRegistryAdapter.ts`
 * (모두 vitest로 검증됨)에 위임한다.
 *
 * 미검증 리스크 하나를 명시적으로 기록한다(D-032): Apps Script의 `doGet`/`doPost`가 `async`
 * 함수가 반환하는 Promise를 실제로 기다려주는지는 문서/커뮤니티 사례가 엇갈려 코드로 확인할
 * 방법이 없다. v1은 "지원된다"고 가정하고 진행하며, 실제 배포 시 가장 먼저 확인해야 할
 * 항목이다.
 *
 * Apps Script Web App은 `ContentService`로 만든 응답의 실제 HTTP 상태 코드를 커스터마이즈할
 * 방법이 없다(항상 200으로 내려간다) — 그래서 의도한 상태 코드(`ApiResponse.status`)를 JSON
 * 바디 안에 `status` 필드로 함께 실어 보낸다. 이후 작업(3부, Apps Script용 `sessionClient.ts`)이
 * 이 바디의 `status` 필드로 성공/실패를 판단하면 된다.
 */
import { dispatchApiRequest, type DispatchDeps } from "./dispatch.js";
import { buildApiRequestFromGet, buildApiRequestFromPost } from "./requestAdapter.js";
import { handleApiRequest } from "../server/httpApi.js";
import type { SpreadsheetGateway } from "./hostInterfaces.js";
import type { ApiResponse } from "../server/httpApi.js";

function getSheet(name: string): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(name) ?? spreadsheet.insertSheet(name);
}

function readTable(sheet: GoogleAppsScript.Spreadsheet.Sheet): { header: string[]; rows: string[][] } {
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return { header: [], rows: [] };
  const [header, ...rows] = values;
  return {
    header: (header ?? []).map((cell) => String(cell)),
    rows: rows.map((row) => row.map((cell) => String(cell))),
  };
}

function toRecord(header: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  header.forEach((key, index) => {
    record[key] = row[index] ?? "";
  });
  return record;
}

function toRow(header: string[], record: Record<string, string>): string[] {
  return header.map((key) => record[key] ?? "");
}

function ensureHeader(sheet: GoogleAppsScript.Spreadsheet.Sheet, header: string[]): void {
  if (sheet.getLastRow() === 0) sheet.appendRow(header);
}

/** `hostInterfaces.ts#SpreadsheetGateway`의 유일한 실제 구현체. 셀 단위 최적화 없이, 헤더
 * 행 + 데이터 행이라는 가장 단순한 시트 모양만 가정한다(첫 쓰기에서 헤더를 자동 생성). */
const realGateway: SpreadsheetGateway = {
  readRows(sheetName) {
    const { header, rows } = readTable(getSheet(sheetName));
    return rows.map((row) => toRecord(header, row));
  },
  upsertRow(sheetName, matchColumn, matchValue, row) {
    const sheet = getSheet(sheetName);
    ensureHeader(sheet, Object.keys(row));
    const { header, rows } = readTable(sheet);
    const columnIndex = header.indexOf(matchColumn);
    const rowIndex = columnIndex >= 0 ? rows.findIndex((r) => r[columnIndex] === matchValue) : -1;
    const values = toRow(header, row);
    if (rowIndex >= 0) {
      sheet.getRange(rowIndex + 2, 1, 1, values.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
  },
  deleteRow(sheetName, matchColumn, matchValue) {
    const sheet = getSheet(sheetName);
    const { header, rows } = readTable(sheet);
    const columnIndex = header.indexOf(matchColumn);
    if (columnIndex < 0) return;
    const rowIndex = rows.findIndex((r) => r[columnIndex] === matchValue);
    if (rowIndex >= 0) sheet.deleteRow(rowIndex + 2);
  },
  findRow(sheetName, matchColumn, matchValue) {
    const { header, rows } = readTable(getSheet(sheetName));
    const columnIndex = header.indexOf(matchColumn);
    if (columnIndex < 0) return undefined;
    const row = rows.find((r) => r[columnIndex] === matchValue);
    return row ? toRecord(header, row) : undefined;
  },
  appendRow(sheetName, row) {
    const sheet = getSheet(sheetName);
    ensureHeader(sheet, Object.keys(row));
    const { header } = readTable(sheet);
    sheet.appendRow(toRow(header, row));
  },
};

function buildDispatchDeps(): DispatchDeps {
  return {
    gateway: realGateway,
    lock: LockService.getScriptLock(),
    flush: () => SpreadsheetApp.flush(),
    uuidGen: () => Utilities.getUuid(),
    handleApiRequest,
  };
}

function respond(response: ApiResponse): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify({ status: response.status, body: response.body })).setMimeType(
    ContentService.MimeType.JSON,
  );
}

async function doGetImpl(e: GoogleAppsScript.Events.DoGet): Promise<GoogleAppsScript.Content.TextOutput> {
  const result = buildApiRequestFromGet(e);
  if (!result.ok) return respond(result.response);
  return respond(await dispatchApiRequest(buildDispatchDeps(), result.request));
}

async function doPostImpl(e: GoogleAppsScript.Events.DoPost): Promise<GoogleAppsScript.Content.TextOutput> {
  const result = buildApiRequestFromPost(e);
  if (!result.ok) return respond(result.response);
  return respond(await dispatchApiRequest(buildDispatchDeps(), result.request));
}

declare global {
  // Apps Script discovers `doGet`/`doPost` as global functions. Bundling with esbuild produces
  // an IIFE (strict mode), so a plain top-level `function doGet(e) {}` declaration would stay
  // trapped inside that closure — assigning to `globalThis` is what actually exposes it (and
  // makes the build's footer step in scripts/build-apps-script.ts unnecessary).
  var doGet: typeof doGetImpl;
  var doPost: typeof doPostImpl;
}

globalThis.doGet = doGetImpl;
globalThis.doPost = doPostImpl;
