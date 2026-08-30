/**
 * Apps Script용 참가자 토큰 발급/조회 (Milestone 5 1부, D-032). `src/server/tokenStore.ts`
 * (참고만 함, 그대로 베끼지 않음)와 같은 역할이지만, Apps Script는 요청마다 상태가 사라지는
 * 무상태 모델이므로 인메모리 `Map` 대신 `TOKENS_SHEET` 탭에 직접 읽고 쓴다. `join`은
 * 로컬 버전과 마찬가지로 loose join이다 — 같은 playerId로 여러 번 발급해도 매번 새 토큰을
 * 추가만 하고 기존 토큰을 무효화하지 않는다.
 */
import type { SpreadsheetGateway, UuidGenerator } from "./hostInterfaces.js";
import { TOKENS_SHEET } from "./sheetSchema.js";
import type { ParticipantId } from "../types/domain.js";

/** 새 토큰을 발급해 `TOKENS_SHEET`에 추가하고, 그 토큰 문자열을 반환한다. */
export function issueToken(
  gateway: SpreadsheetGateway,
  uuidGen: UuidGenerator,
  sessionId: string,
  playerId: ParticipantId,
): string {
  const token = uuidGen();
  gateway.appendRow(TOKENS_SHEET, { sessionId, playerId, token });
  return token;
}

/** 토큰이 이 세션(`sessionId`) 안에서 대표하는 학생의 `PlayerState.id`. 존재하지 않거나
 * 다른 세션의 토큰이면 `undefined`. */
export function resolvePlayerId(
  gateway: SpreadsheetGateway,
  sessionId: string,
  token: string,
): ParticipantId | undefined {
  const row = gateway
    .readRows(TOKENS_SHEET)
    .find((r) => r.sessionId === sessionId && r.token === token);
  return row?.playerId;
}
