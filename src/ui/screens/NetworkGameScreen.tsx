import { useMemo, useState } from "react";
import type { PlayerSlot, SessionClient } from "../network/sessionClient.js";
import { translateNetworkError } from "../network/errorMessages.js";
import { NetworkDecisionSubmitter } from "../network/NetworkDecisionSubmitter.js";
import { useNetworkGameSession } from "../network/useNetworkGameSession.js";
import { PHASE_LABELS } from "../labels.js";
import type { PlayerState } from "../../types/domain.js";
import { CompanyTurnScreen } from "./CompanyTurnScreen.js";
import { StoreTurnScreen } from "./StoreTurnScreen.js";
import { HouseholdTurnScreen } from "./HouseholdTurnScreen.js";
import { RoundResultScreen } from "./RoundResultScreen.js";
import { GameOverScreen } from "./GameOverScreen.js";
import { RoundHud } from "./RoundHud.js";

interface Props {
  client: SessionClient;
  sessionId: string;
  token: string;
  slot: PlayerSlot;
}

/** phase별로 사람이 결정할 게 없는 조용한 단계 — App.tsx의 SILENT_AUTO_PHASES와 같은 표시를 쓴다. */
const SILENT_PHASES: ReadonlySet<string> = new Set([
  "company-settlement",
  "wholesale-market-update",
  "store-settlement",
  "retail-market-update",
  "npc-consumer-behavior",
  "round-settlement",
]);

/** 네트워크 세션의 실제 게임 화면 (Milestone 4 4-b). 로컬 GameScreen과 같은 phase 분기를 하되,
 * 제출은 서버로 보내고 phase 전환은 서버 폴링 결과로만 관찰한다. */
export function NetworkGameScreen({ client, sessionId, token, slot }: Props) {
  const { stateResult, error } = useNetworkGameSession(client, sessionId);
  const submitter = useMemo(() => new NetworkDecisionSubmitter(client, sessionId, token), [client, sessionId, token]);
  const [ackError, setAckError] = useState<string | undefined>(undefined);
  // 이 학생이 이미 확인 버튼을 누른 라운드 번호. 폴링 간격(최대 3초) 동안 다른 참가자를
  // 기다리며 같은 화면이 계속 보이는데, 그 사이 버튼을 또 누르면 서버가 이미 다음 phase로
  // 넘어간 경우(전원 확인 완료) `acknowledgeRoundResult`가 phase 불일치 예외를 던져 원문
  // 에러 문구가 그대로 노출된다(code-reviewer 발견) — 한 번 누르면 그 라운드에 대해서는
  // 버튼을 비활성화해 중복 클릭을 막는다. 실패하면 다시 누를 수 있게 되돌린다.
  const [ackedForRound, setAckedForRound] = useState<number | undefined>(undefined);

  if (!stateResult) {
    return (
      <div className="card">
        <p className="empty-note">상태를 불러오는 중...</p>
        {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}
      </div>
    );
  }

  const { state, version, gameOver } = stateResult;
  const player: PlayerState = { id: slot.playerId, ...slot };
  const phase = state.currentPhase;

  return (
    <>
      {error && (
        <div className="card">
          <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>
        </div>
      )}

      {!gameOver && (
        <RoundHud round={state.currentRound} totalRounds={state.config.totalRounds} phaseLabel={PHASE_LABELS[phase]} />
      )}

      {gameOver && <GameOverScreen state={state} player={player} onRestart={() => window.location.reload()} />}

      {!gameOver && phase === "company-turn" && (
        <CompanyTurnScreen
          session={submitter}
          state={state}
          version={version}
          company={state.companies[slot.companyId]!}
          onSubmitted={() => {}}
        />
      )}

      {!gameOver && phase === "store-turn" && (
        <StoreTurnScreen
          session={submitter}
          state={state}
          version={version}
          store={state.stores[slot.storeId]!}
          companies={state.companies}
          onSubmitted={() => {}}
        />
      )}

      {!gameOver && phase === "household-turn" && (
        <HouseholdTurnScreen
          session={submitter}
          state={state}
          version={version}
          household={state.households[slot.householdId]!}
          stores={state.stores}
          onSubmitted={() => {}}
        />
      )}

      {!gameOver && phase === "round-result" && (
        <>
          <RoundResultScreen
            state={state}
            player={player}
            isLastRound={state.currentRound === state.config.totalRounds}
            onNext={() => {
              setAckError(undefined);
              setAckedForRound(state.currentRound);
              client.acknowledgeRoundResult(sessionId, token).catch((err: unknown) => {
                setAckError(translateNetworkError(err));
                setAckedForRound(undefined);
              });
            }}
            disabled={ackedForRound === state.currentRound}
          />
          {ackError && <p style={{ color: "#dc2626", fontSize: 14 }}>{ackError}</p>}
        </>
      )}

      {!gameOver && SILENT_PHASES.has(phase) && <div className="auto-advance">시장을 정리하고 있어요…</div>}
    </>
  );
}
