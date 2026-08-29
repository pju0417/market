/**
 * 제출 타임아웃 정책 값 (Milestone 4 3단계). 경제 밸런스 수치(수요/가격/NPC 등)가 아니라
 * "진행 리듬" 값이므로 `src/economy/config.ts`가 아니라 서버 계층 자체에 둔다.
 *
 * docs/DECISIONS.md D-029 참고 — v1 잠정값이며 플레이테스트로 조정 가능하다.
 */
export const DEFAULT_SUBMISSION_TIMEOUT_MS = 120_000;

/** 다인원 로비(창업 준비) 대기 타임아웃 (Milestone 4 4단계, 사용자 확정값 — D-030 참고). */
export const DEFAULT_LOBBY_TIMEOUT_MS = 180_000;
