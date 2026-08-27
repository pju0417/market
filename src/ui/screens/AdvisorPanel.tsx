import type { TurnAdvice } from "../../advisor/types.js";
import { ADVICE_DATA_AVAILABILITY_NOTES } from "../labels.js";

interface Props {
  advice: TurnAdvice;
}

/** 규칙 기반 전략 비서의 조언을 보여주는 순수 프레젠테이션 컴포넌트. 정답을 지시하지 않으므로
 * options 카드는 전부 동일한 스타일로 나열한다 (docs/ADVISOR_RULES.md). */
export function AdvisorPanel({ advice }: Props) {
  return (
    <div className="advisor-panel">
      <p className="empty-note">{ADVICE_DATA_AVAILABILITY_NOTES[advice.dataAvailability]}</p>

      <h3>지금 상황</h3>
      <ul>
        {advice.situationSummary.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>

      <h3>원인으로 볼 수 있는 것</h3>
      {advice.causeHypotheses.length === 0 ? (
        <p className="empty-note">특별히 눈에 띄는 신호는 없어요.</p>
      ) : (
        advice.causeHypotheses.map((cause) => (
          <div className="advisor-cause" key={cause.id}>
            <p className="advisor-cause-description">{cause.description}</p>
            <p className="advisor-cause-evidence">근거: {cause.evidence}</p>
          </div>
        ))
      )}

      <h3>선택할 수 있는 전략</h3>
      <div className="advisor-options">
        {advice.options.map((option) => (
          <div className="advisor-option" key={option.id}>
            <p className="advisor-option-title">{option.title}</p>
            <div className="advisor-option-columns">
              <div>
                <p className="advisor-option-column-label">장점</p>
                <ul>
                  {option.pros.map((pro, index) => (
                    <li key={index}>{pro}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="advisor-option-column-label">위험</p>
                <ul>
                  {option.risks.map((risk, index) => (
                    <li key={index}>{risk}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
