/**
 * `GET /slots`가 반환하는 참가자 목록과 `GET /state`의 `unsubmittedParticipantIds` + 현재
 * phase를 조합해 "아직 제출 안 한 참가자" 목록을 계산하는 순수 함수 (Milestone 4 3단계
 * 확인용). DOM/React에 의존하지 않아 `NetworkSessionMonitor.tsx` 없이도 단독 테스트할 수
 * 있다.
 */
import type { ParticipantId, RoundPhase } from "../../types/domain.js";
import type { PlayerSlot } from "./sessionClient.js";

/** 각 phase가 어떤 종류의 참가자 id(회사/가게/가정)로 제출을 요구하는지. 사람 입력이
 * 필요 없는 phase(정산/시장 갱신 등)는 여기 없다 — 그런 phase에서는 항상 빈 배열을 반환한다. */
const PARTICIPANT_ID_FIELD_BY_PHASE: Partial<Record<RoundPhase, keyof PlayerSlot>> = {
  "company-turn": "companyId",
  "store-turn": "storeId",
  "household-turn": "householdId",
  "round-result": "playerId",
};

export interface UnsubmittedParticipant {
  playerId: string;
  displayName: string;
  participantId: ParticipantId;
}

export function computeUnsubmittedParticipants(
  slots: readonly PlayerSlot[],
  unsubmittedParticipantIds: readonly ParticipantId[],
  currentPhase: RoundPhase,
): UnsubmittedParticipant[] {
  const field = PARTICIPANT_ID_FIELD_BY_PHASE[currentPhase];
  if (!field) return [];

  const unsubmittedSet = new Set(unsubmittedParticipantIds);
  return slots
    .filter((slot) => unsubmittedSet.has(slot[field] as ParticipantId))
    .map((slot) => ({
      playerId: slot.playerId,
      displayName: slot.displayName,
      participantId: slot[field] as ParticipantId,
    }));
}
