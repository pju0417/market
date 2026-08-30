/**
 * 네트워크 화면(참가/로비/게임/교사 세션 화면 등)에서 서버 에러 문자열을 초등학생이 읽을 수
 * 있는 한국어 안내로 바꿔주는 순수 함수 (Milestone 4 6단계(2부), CLAUDE.md 4절 UX 개선).
 *
 * `src/server/httpApi.ts`가 던지는 몇 가지 흔한 영문 에러 메시지만 매핑한다 — 완벽한 커버리지를
 * 노리지 않으며, 매핑에 없는 메시지는 원문(가급적 `ApiError`가 이미 서버 `error` 문자열을 담고
 * 있으므로 "status 400" 같은 문구보다는 나은 상태)을 그대로 반환하는 폴백을 둔다. 로컬 1인
 * 플레이 경로(App.tsx, 세 턴 화면의 로컬 에러 처리)는 이 함수를 쓰지 않는다.
 */

const KNOWN_ERROR_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ["unknown sessionId", "그 세션 번호를 찾을 수 없어요. 번호를 다시 확인해주세요."],
  ["unknown playerId", "그 이름을 찾을 수 없어요."],
  ["lobby already closed", "이미 다른 학생들이 준비를 마쳐서 창업 준비 시간이 끝났어요."],
  ["missing or invalid teacher token", "로그인이 만료됐어요. 다시 참가해주세요."],
  ["missing or invalid token", "로그인이 만료됐어요. 다시 참가해주세요."],
  ["business setup not finished yet", "아직 창업 준비가 안 끝났어요. 잠시만 기다려주세요."],
];

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function translateNetworkError(error: unknown): string {
  const message = extractMessage(error);
  for (const [known, translated] of KNOWN_ERROR_MESSAGES) {
    if (message === known) return translated;
  }
  return message;
}
