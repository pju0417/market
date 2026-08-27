/**
 * 전략 비서 출력 타입 (docs/ADVISOR_RULES.md). 정답을 지시하지 않고, 현재 상황 설명 +
 * 원인 후보 + 2~3개의 선택지(각각 장점/위험)를 제공하는 구조를 그대로 타입으로 표현한다.
 */

/** 학생이 고를 수 있는 전략 선택지 하나. title은 "이렇게 하면"이지, "이렇게 해라"가 아니다. */
export interface AdviceOption {
  id: string;
  title: string;
  pros: string[];
  risks: string[];
}

/** 관찰된 현상에 대한 원인 후보. 확정적 진단이 아니라 "~일 수 있다" 수준의 가설이다. */
export interface CauseHypothesis {
  id: string;
  description: string;
  /** 이 가설을 뒷받침하는 근거(실제 수치를 담은 문장). */
  evidence: string;
}

export interface TurnAdvice {
  /**
   * 이번 조언이 어느 정도의 데이터에 근거했는지: "no-history"는 참고할 직전 라운드 지표가
   * 전혀 없는 경우(1라운드), "partial"은 일부만 있는 경우(예: 시장 시세는 없지만 직전 라운드
   * 손익은 있음), "full"은 둘 다 있는 경우다.
   */
  dataAvailability: "no-history" | "partial" | "full";
  situationSummary: string[];
  causeHypotheses: CauseHypothesis[];
  /** 항상 2~3개. */
  options: AdviceOption[];
}
