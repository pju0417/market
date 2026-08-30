/**
 * Apps Script 전역 서비스(`SpreadsheetApp`/`LockService`/`Utilities` 등)를 감싸는 narrow
 * interface 모음 (Milestone 5 1부, D-032). 실제 Apps Script 타입은 여기서 import하지
 * 않는다 — 이 인터페이스들은 나중에 (1) 실제 `SpreadsheetApp` 등을 감싸는 구현체와,
 * (2) vitest에서 쓰는 인메모리 테스트 더블 양쪽에 그대로 맞아야 한다. 실제 구현
 * (`entry.ts` 등)은 다음 작업에서 다룬다 — 이 파일은 타입 계약만 정의한다.
 */

/**
 * 시트 하나(스프레드시트 전체가 아니라 여러 탭)에 대한 행 단위 CRUD 게이트웨이.
 * 이 프로젝트의 저장 패턴(phase당 제출을 모아 정산한 뒤 확정된 상태만 저장)에서는 세밀한
 * 셀 단위 접근이 필요 없으므로, "탭 이름 + 매치 컬럼/값" 수준의 행 단위 연산만 노출한다.
 */
export interface SpreadsheetGateway {
  /** 시트 탭 하나에서 행 전체를 읽는다. 헤더 행 제외, 각 행은 컬럼명→값 객체. */
  readRows(sheetName: string): Record<string, string>[];
  /** 특정 조건(예: sessionId 일치)의 행 하나를 찾아 업데이트하거나, 없으면 새로 추가한다. */
  upsertRow(sheetName: string, matchColumn: string, matchValue: string, row: Record<string, string>): void;
  /** 조건에 맞는 행을 찾아 삭제한다(없으면 아무 일도 안 함). */
  deleteRow(sheetName: string, matchColumn: string, matchValue: string): void;
  /** 조건에 맞는 행 하나를 찾아 반환한다(없으면 undefined). */
  findRow(sheetName: string, matchColumn: string, matchValue: string): Record<string, string> | undefined;
  /** append-only 탭(RoundMetricsJson 등)에 새 행을 추가만 한다(중복 검사 없음). */
  appendRow(sheetName: string, row: Record<string, string>): void;
}

/** `LockService.getScriptLock()`을 감싸는 interface (동시 쓰기 방지, D-032 4항). */
export interface LockLike {
  /** 락을 얻을 때까지 기다린다. `timeoutMs` 안에 얻지 못하면 throw한다. */
  waitLock(timeoutMs: number): void;
  releaseLock(): void;
}

/** 세션/토큰 id 생성기. Apps Script에는 `node:crypto`가 없어 주입 방식으로 분리한다. */
export type UuidGenerator = () => string;
