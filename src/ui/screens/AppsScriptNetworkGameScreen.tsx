import { useMemo, useState } from "react";
import type { PlayerSlot } from "../network/sessionClient.js";
import type { AppsScriptSessionClient } from "../network/appsScriptSessionClient.js";
import { translateNetworkError } from "../network/errorMessages.js";
import { AppsScriptDecisionSubmitter } from "../network/AppsScriptDecisionSubmitter.js";
import { useAppsScriptGameSession } from "../network/useAppsScriptGameSession.js";
import { PHASE_LABELS } from "../labels.js";
import type { PlayerState } from "../../types/domain.js";
import { CompanyTurnScreen } from "./CompanyTurnScreen.js";
import { StoreTurnScreen } from "./StoreTurnScreen.js";
import { HouseholdTurnScreen } from "./HouseholdTurnScreen.js";
import { RoundResultScreen } from "./RoundResultScreen.js";
import { GameOverScreen } from "./GameOverScreen.js";

interface Props {
  client: AppsScriptSessionClient;
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

/** `NetworkGameScreen.tsx`의 Apps Script 자매 화면 (Milestone 5 3부 화면 배선). 클라이언트
 * 타입/제출기/폴링 훅만 다르고 phase 분기 로직은 동일하다. */
export function AppsScriptNetworkGameScreen({ client, sessionId, token, slot }: Props) {
  const { stateResult, error } = useAppsScriptGameSession(client, sessionId);
  const submitter = useMemo(() => new AppsScriptDecisionSubmitter(client, sessionId, token), [client, sessionId, token]);
  const [ackError, setAckError] = useState<string | undefined>(undefined);
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
        <p className="round-badge" style={{ display: "inline-block", marginBottom: 16 }}>
          {state.currentRound}/{state.config.totalRounds}라운드 · {PHASE_LABELS[phase]}
        </p>
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
