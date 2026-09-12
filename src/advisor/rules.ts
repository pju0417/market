/**
 * 전략 비서(기업 턴 + 가게 턴) 분석에 쓰는 임계값 모음 (docs/ADVISOR_RULES.md).
 *
 * src/economy/config.ts와 같은 원칙을 따른다: 로직에 숫자를 하드코딩하지 않고 여기 상수로
 * 모아 둔다. 아래 수치들은 "상식적으로 그럴듯한" 초기값이며 economy-reviewer의 플레이테스트
 * 검토를 거쳐 조정될 것을 전제로 한다 — 최종 밸런스가 아니다. 공식(수요/가격/전환비용 등)
 * 자체는 여기서 새로 만들지 않는다 — 이미 economy 모듈이 계산한 값을 어떤 기준으로
 * "경고할지/제안할지"만 여기서 정한다.
 */
export interface AdvisorRules {
  /**
   * 재고율(carry-over inventory ÷ 직전 라운드 생산량)이 이 값 이상이면 "재고 과잉" 원인
   * 후보를 제시한다. 0.5 = 만든 것의 절반 이상이 안 팔리고 남았다는 뜻으로, 초등학생도
   * "반 넘게 못 팔았다"는 감각으로 이해하기 쉬운 눈금이라 골랐다.
   */
  highInventoryCarryoverRatio: number;
  /**
   * 내 도매가가 시장 평균가의 이 배율보다 높으면 "비싸게 팔고 있다" 후보를 제시한다.
   * 1.2 = 시장 평균보다 20% 이상 비싸다. ±20%는 이 프로젝트의 다른 배율형 임계값들과
   * 맞춘 값이다.
   */
  highPriceVsMarketRatio: number;
  /** 내 도매가가 시장 평균가의 이 배율보다 낮으면 "싸게 팔고 있다" 후보를 제시한다. */
  lowPriceVsMarketRatio: number;
  /**
   * 내 품질이 시장 평균 품질보다 이 값(절대 차이, 0~1 스케일) 이상 낮으면 "품질 열위" 후보를
   * 제시한다. 품질은 0~1 스케일이므로 0.15는 눈에 띄는 차이 수준으로 잡았다.
   */
  lowQualityGapVsMarket: number;
  /** 직전 라운드 순이익이 이 값 이하(기본 0)면 "적자" 후보를 제시한다. */
  negativeProfitThreshold: number;
  /**
   * 직전 라운드 도매 매출 대비 순이익 비율이 이 값 이하면 "이익률이 낮다" 후보를 제시한다.
   * 0.1 = 매출의 10% 이하만 남긴다는 뜻.
   */
  lowProfitMarginRatio: number;
  /**
   * 같은 업종을 파는 경쟁 기업 수가 이 값 이상이면 "경쟁이 치열하다" 후보를 제시한다.
   * NPC_TARGETS.minCompaniesPerCategory(=2, 나 자신 제외 최소 1곳)보다 확실히 붐빈다고
   * 볼 수 있는 지점으로 3을 잡았다.
   */
  highCompetitorCount: number;
  /**
   * (다른 카테고리로의) 업종 전환 비용이 COSTS.industrySwitchBaseCost 대비 이 비율 이하이면
   * (=그 카테고리와 유사도가 충분히 높으면) "업종 확장을 고려해볼 만하다" 선택지를 제시한다.
   * 0.6 이하 = 유사도 0.4 이상. src/economy/config.ts의 CATEGORY_SIMILARITY 표에서 완전
   * 무관한 업종 조합(유사도 0.1~0.3)은 걸러내고, 그나마 관련 있는 조합(예: 전자제품↔장난감
   * 0.5, 의류↔장난감 0.4)만 "고려해볼 만하다"로 남기기 위해 이 지점으로 잡았다. 이 값을
   * 너무 낮추면(=비율을 너무 높이면) 사실상 무관한 업종 전환까지 가볍게 권하게 되어
   * "정답을 지시하지 않는다"는 원칙과 멀어질 위험이 있다.
   */
  industrySwitchCostRatioForSuggestion: number;

  /**
   * 가게 재고가 이 값 이하이면 "품절" 원인 후보를 제시한다 (Milestone 3 2단계, 가게 턴).
   * 재고는 정수 단위 거래로만 늘고 줄어들어야 하므로 정상적인 게임 진행에서는 항상 정확히
   * 0이 되지만, 부동소수점 누적 오차로 아주 작은 양수(예: 1e-9)가 남을 수 있어 0이 아니라
   * 이 임계값을 둔다.
   */
  outOfStockThreshold: number;
  /**
   * 개당 마진율(=(소매가-평균 매입가)÷소매가)이 이 값 이하면 "이익률이 낮다" 후보를 제시한다.
   * 기업 턴의 lowProfitMarginRatio(0.1, 매출 대비 순이익)보다 조금 넉넉하게 0.15로 잡았다 —
   * 가게는 개당 매입원가만 반영한 단순 마진이라 인건비·임대료 등 다른 고정비를 아직 차감하지
   * 않은 값이므로, 기업 쪽 지표보다 다소 높은 눈금이 아니면 거의 항상 걸리게 된다.
   */
  lowUnitMarginRatio: number;
  /**
   * 직전 라운드 매입 지출 중 최대 단일 공급처 비중이 이 값 이상이면 "공급처 편중" 후보를
   * 제시한다. 0.8 = 매입의 80% 이상을 한 기업에서 샀다는 뜻으로, 그 기업이 이번 라운드
   * 가격을 올리거나 재고가 없으면 타격이 크다고 볼 수 있는 지점으로 잡았다. 이 후보는
   * 시장에 실제 대안 공급처가 있을 때만(computeCategoryAverages(...).listingCount >= 2)
   * 제시한다 — 대안이 아예 없으면 "편중"이 아니라 그냥 "선택지가 하나뿐"인 것이기 때문이다.
   */
  highSupplierConcentrationRatio: number;
  /**
   * 같은 전문 업종을 가진 경쟁 가게 수가 이 값 이상이면 "경쟁이 치열하다" 후보를 제시한다.
   * 기업 턴의 highCompetitorCount와 같은 값(3)을 써서 두 턴의 "경쟁 심함" 감각을 맞췄다.
   */
  highStoreCompetitorCount: number;
  /**
   * 내 소매가가 (직전 라운드 마감 기준) 시장 평균 소매가의 이 배율보다 높으면 "비싸게
   * 팔고 있다" 후보를 제시한다. 기업 턴의 highPriceVsMarketRatio와 동일한 1.2(±20%)를
   * 재사용해 두 턴의 가격 민감도 기준을 일치시켰다.
   */
  highRetailPriceVsMarketRatio: number;
  /** 내 소매가가 시장 평균 소매가의 이 배율보다 낮으면 "싸게 팔고 있다" 후보를 제시한다. */
  lowRetailPriceVsMarketRatio: number;
  /**
   * (인건비+임대료로 계산되는) 고정비가 현재 보유 현금의 이 비율 이상이면 "고정비 부담이
   * 크다" 후보를 제시한다. 0.5 = 고정비만으로 현금의 절반 이상이 나간다는 뜻으로, 초등학생도
   * "가진 돈의 반 넘게 고정비로 나간다"는 감각으로 이해하기 쉬운 눈금이라 잡았다 (기업 턴의
   * highInventoryCarryoverRatio=0.5와 같은 "절반" 기준을 재사용).
   */
  highFixedCostToCashRatio: number;

  /**
   * 가계 만족도 점수(satisfactionScore, 0~1)가 이 값 이하이면 "만족도가 낮다" 후보를
   * 제시한다 (Milestone 3 3단계, 가계 턴). 0.4 = 절반에 못 미치는 수준으로, 초등학생도
   * "반도 안 된다"는 감각으로 이해하기 쉬운 눈금이라 잡았다.
   */
  householdLowSatisfactionThreshold: number;
  /**
   * 직전 라운드에 구매한 서로 다른 카테고리 수가 이 값 이하이면 "소비가 편중되어 있다" 후보의
   * 근거 중 하나로 쓴다. 1 = 카테고리 하나에서만 샀다는 뜻이다.
   */
  householdLowCategoryDiversityCount: number;
  /**
   * 직전 라운드 지출 중 최대 단일 카테고리 비중이 이 값 이상이면 "소비가 편중되어 있다"
   * 후보를 제시한다. store 쪽 highSupplierConcentrationRatio(0.8)와 같은 스케일을 재사용해
   * "편중" 감각을 다른 턴과 맞췄다.
   */
  householdHighCategorySpendShareRatio: number;
  /**
   * 직전 라운드 지출이 직전 라운드 가용예산(저축+용돈) 대비 이 비율 이상이면 "저축이 거의
   * 없다" 후보를 제시한다. 0.9 = 가진 돈의 90% 이상을 다 썼다는 뜻이다.
   */
  householdHighBudgetUsageRatio: number;
  /**
   * 직전 라운드 지출이 직전 라운드 가용예산 대비 이 비율 이하이면 "예산을 안 써서 만족도가
   * 낮을 수 있다" 후보를 제시한다. 0.2 = 가진 돈의 20% 이하만 썼다는 뜻이다.
   */
  householdLowBudgetUsageRatio: number;

  /**
   * 이 라운드부터 기업/가게 턴 비서가 "가격·품질 경쟁 전략" 안내 문장을 situationSummary에
   * 추가한다. docs/ROUND_FLOW.md의 5라운드 커리큘럼 단계에 맞춘 값이며, 이 값은
   * economy/config.ts의 MIN_ROUND_FOR_INDUSTRY_ACTIONS(실제 업종전환/전문이탈판매 메커니즘
   * 게이트)와는 무관하다 — 어떤 메커니즘도 열거나 잠그지 않고, 이미 1라운드부터 가능했던
   * 가격/품질 결정(D-022)을 바라보는 관점만 짚어준다.
   */
  competitionFocusMinRound: number;
  /**
   * 이 라운드부터 가게 턴 비서가 "전문화도 경쟁 전략의 한 축"이라는 안내 문장을
   * situationSummary에 추가한다. docs/ROUND_FLOW.md의 5라운드 커리큘럼("전문화") 단계에
   * 맞춘 값이며, economy/config.ts의 MIN_ROUND_FOR_INDUSTRY_ACTIONS(전문 업종 이탈 판매가
   * 실제로 가능해지는 라운드, D-033)와는 무관하다 — 이미 4라운드부터 가능했던 전문 업종
   * 유지/이탈 선택을 "경쟁 전략"의 관점으로 짚어줄 뿐, 새 메커니즘을 열거나 잠그지 않는다.
   */
  specialtyFocusMinRound: number;
}

export const DEFAULT_ADVISOR_RULES: AdvisorRules = {
  highInventoryCarryoverRatio: 0.5,
  highPriceVsMarketRatio: 1.2,
  lowPriceVsMarketRatio: 0.8,
  lowQualityGapVsMarket: 0.15,
  negativeProfitThreshold: 0,
  lowProfitMarginRatio: 0.1,
  highCompetitorCount: 3,
  industrySwitchCostRatioForSuggestion: 0.6,
  outOfStockThreshold: 1e-6,
  lowUnitMarginRatio: 0.15,
  highSupplierConcentrationRatio: 0.8,
  highStoreCompetitorCount: 3,
  highRetailPriceVsMarketRatio: 1.2,
  lowRetailPriceVsMarketRatio: 0.8,
  highFixedCostToCashRatio: 0.5,
  householdLowSatisfactionThreshold: 0.4,
  householdLowCategoryDiversityCount: 1,
  householdHighCategorySpendShareRatio: 0.8,
  householdHighBudgetUsageRatio: 0.9,
  householdLowBudgetUsageRatio: 0.2,
  competitionFocusMinRound: 5,
  specialtyFocusMinRound: 5,
};
