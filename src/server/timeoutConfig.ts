import type { SubmissionTimeoutSettings } from "../multiplayer/GameSession.js";

/**
 * 제출 타임아웃 정책 값 (Milestone 4 3단계). 경제 밸런스 수치(수요/가격/NPC 등)가 아니라
 * "진행 리듬" 값이므로 `src/economy/config.ts`가 아니라 서버 계층 자체에 둔다.
 *
 * docs/DECISIONS.md D-029 참고 — v1 잠정값이며 플레이테스트로 조정 가능하다.
 *
 * 주의(구매 매칭 알고리즘 재설계 Stage 2): 이 값은 `checkAndApplyTimeout`(서버가 막힌 phase를
 * 강제로 뚫는 폴링 타임아웃)에만 쓰인다 — `GameSession` 내부의 `timeoutSettings.timeoutMs`
 * (엔진의 NPC 순차진입 처리 순서 계산 기준점)와는 의도적으로 분리된 별개의 값이다. 교사가
 * 세션 생성 시 넘긴 `submissionTimeoutMs`는 후자에만 반영되고, 이 상수 자체는 바뀌지 않는다.
 */
export const DEFAULT_SUBMISSION_TIMEOUT_MS = 120_000;

/** 다인원 로비(창업 준비) 대기 타임아웃 (Milestone 4 4단계, 사용자 확정값 — D-030 참고). */
export const DEFAULT_LOBBY_TIMEOUT_MS = 180_000;

/**
 * 교사가 세션 생성 시 제출 제한시간 설정을 아예 넘기지 않았을 때 쓰는 서버 기본값 (구매 매칭
 * 알고리즘 재설계 Stage 2). `GameSession.DEFAULT_LOCAL_SUBMISSION_TIMEOUT_SETTINGS`(로컬 1인
 * 플레이 기본값, enabled=false)와 다르다 — 다인원 서버 세션은 D-029가 이미 확정한 대로
 * 기본적으로 제출 제한시간을 켠 채(enabled=true) 시작해야 기존 배포와 하위호환된다.
 */
export const DEFAULT_SERVER_SUBMISSION_TIMEOUT_SETTINGS: SubmissionTimeoutSettings = {
  enabled: true,
  timeoutMs: DEFAULT_SUBMISSION_TIMEOUT_MS,
  npcGraduatedEntryEnabled: true,
};
