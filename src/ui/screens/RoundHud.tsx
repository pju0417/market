interface Props {
  round: number;
  totalRounds: number;
  phaseLabel: string;
}

/** 상단 라운드 진행 HUD: "N/7 라운드" + 칸 진행 바 + 현재 단계 이름. 표시 전용. */
export function RoundHud({ round, totalRounds, phaseLabel }: Props) {
  const steps = Array.from({ length: totalRounds }, (_, i) => i + 1);
  return (
    <div className="round-hud">
      <div className="round-hud-top">
        <span className="round-hud-round">
          <span aria-hidden="true">🚩</span> {round}/{totalRounds}라운드
        </span>
        <span className="round-hud-phase">{phaseLabel}</span>
      </div>
      <div
        className="round-hud-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalRounds}
        aria-valuenow={round}
        aria-label={`${totalRounds}라운드 중 ${round}라운드`}
      >
        {steps.map((step) => (
          <span
            key={step}
            className={`round-hud-step${step < round ? " done" : ""}${step === round ? " current" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
