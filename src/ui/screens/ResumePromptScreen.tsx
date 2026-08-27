import type { GameState } from "../../types/domain.js";
import { PHASE_LABELS } from "../labels.js";

interface Props {
  savedState: GameState;
  onResume: () => void;
  onNewGame: () => void;
}

/** 새로고침 등으로 끊긴 게임이 저장돼 있을 때, 이어할지 새로 시작할지 먼저 묻는다. */
export function ResumePromptScreen({ savedState, onResume, onNewGame }: Props) {
  return (
    <div className="card">
      <h2>이어할 게임이 있어요</h2>
      <p style={{ color: "#6b7280", fontSize: 14 }}>
        {savedState.currentRound}/{savedState.config.totalRounds}라운드 · {PHASE_LABELS[savedState.currentPhase]}
        까지 진행된 게임이 저장돼 있어요.
      </p>
      <button className="primary" onClick={onResume}>
        이어하기
      </button>
      <button className="secondary" onClick={onNewGame} style={{ width: "100%", marginTop: 10 }}>
        새로 시작하기
      </button>
    </div>
  );
}
