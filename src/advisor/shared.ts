/**
 * companyAdvisor.ts와 storeAdvisor.ts가 공통으로 쓰는 표시용 헬퍼. UI(src/ui/labels.ts)에
 * 의존하지 않기 위해(CLAUDE.md 2절) advisor 전용으로 따로 둔다 — src/ui의 동명 상수와
 * 내용이 겹치더라도 계층 경계(economy 엔진은 ui에 의존 불가)를 지키기 위한 의도적 중복이다.
 */
import type { DistrictId, ProductCategoryId } from "../types/domain.js";

export const CATEGORY_NAMES_KO: Record<ProductCategoryId, string> = {
  food: "식품",
  apparel: "의류",
  electronics: "전자제품",
  toys: "장난감",
};

export const DISTRICT_NAMES_KO: Record<DistrictId, string> = {
  "school-area": "학교 주변",
  residential: "주택가",
  downtown: "중심상권",
  upscale: "고급상권",
  industrial: "공업지역",
  outskirts: "외곽",
};

export function formatWon(amount: number): string {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
