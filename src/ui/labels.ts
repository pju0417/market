import type { TurnAdvice } from "../advisor/types.js";
import type { DistrictId, ParticipantKind, ProductCategoryId, RoundPhase } from "../types/domain.js";

export const DISTRICT_LABELS: Record<DistrictId, string> = {
  "school-area": "학교 주변",
  residential: "주택가",
  downtown: "중심상권",
  upscale: "고급상권",
  industrial: "공업지역",
  outskirts: "외곽",
};

export const PARTICIPANT_KIND_LABELS: Record<ParticipantKind, string> = {
  student: "학생",
  npc: "NPC",
};

export const CATEGORY_LABELS: Record<ProductCategoryId, string> = {
  food: "식품",
  apparel: "의류",
  electronics: "전자제품",
  toys: "장난감",
};

export const PHASE_LABELS: Record<RoundPhase, string> = {
  "company-turn": "기업 턴",
  "company-settlement": "기업 턴 결과 확정",
  "wholesale-market-update": "도매시장 갱신",
  "store-turn": "가게 턴",
  "store-settlement": "가게 턴 결과 확정",
  "retail-market-update": "소비시장 갱신",
  "household-turn": "가계 턴",
  "npc-consumer-behavior": "NPC 소비자 활동",
  "round-settlement": "라운드 정산",
  "round-result": "라운드 결과",
};

export const ADVICE_DATA_AVAILABILITY_NOTES: Record<TurnAdvice["dataAvailability"], string> = {
  "no-history": "1라운드라 참고할 지난 실적이 아직 없어요. 지금 보이는 정보만으로 살펴본 조언이에요.",
  partial: "일부 정보만 참고했어요 — 아직 확인되지 않은 부분도 있어요.",
  full: "지난 라운드 실적과 시장 시세를 함께 참고한 조언이에요.",
};

export function formatWon(amount: number): string {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}
