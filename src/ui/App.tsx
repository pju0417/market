import { useEffect, useRef, useState } from "react";
import type { BusinessSetupChoices } from "../multiplayer/GameSession.js";
import { GameSession } from "../multiplayer/GameSession.js";
import { LocalStorageAdapter } from "../storage/LocalStorageAdapter.js";
import type { GameState, RoundPhase } from "../types/domain.js";
import "./App.css";
import { villageArtwork } from "./GameArtwork.js";
import { CityGameLayout } from "./CityGameLayout.js";
import type { PlayerSlot } from "./network/sessionClient.js";
import type { NetworkBackend } from "./network/backend.js";
import { AppsScriptNetworkGameScreen } from "./screens/AppsScriptNetworkGameScreen.js";
import { AppsScriptNetworkJoinScreen } from "./screens/AppsScriptNetworkJoinScreen.js";
import { AppsScriptNetworkLobbyScreen } from "./screens/AppsScriptNetworkLobbyScreen.js";
import { AppsScriptTeacherSessionScreen } from "./screens/AppsScriptTeacherSessionScreen.js";
import { CompanyTurnScreen } from "./screens/CompanyTurnScreen.js";
import { GameOverScreen } from "./screens/GameOverScreen.js";
import { HouseholdTurnScreen } from "./screens/HouseholdTurnScreen.js";
import { NetworkBackendSelectScreen } from "./screens/NetworkBackendSelectScreen.js";
import { NetworkGameScreen } from "./screens/NetworkGameScreen.js";
import { NetworkJoinScreen } from "./screens/NetworkJoinScreen.js";
import { NetworkLobbyScreen } from "./screens/NetworkLobbyScreen.js";
import { ResumePromptScreen } from "./screens/ResumePromptScreen.js";
import { RoundResultScreen } from "./screens/RoundResultScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import { StoreTurnScreen } from "./screens/StoreTurnScreen.js";
import { TeacherOverviewScreen } from "./screens/TeacherOverviewScreen.js";
import { TeacherSessionScreen } from "./screens/TeacherSessionScreen.js";
import { useGameSession, type GameInit } from "./useGameSession.js";

/** 사람이 결정할 게 없는 phase — 조용히 자동으로 다음 단계로 넘어간다. */
const SILENT_AUTO_PHASES: ReadonlySet<RoundPhase> = new Set([
  "company-settlement",
  "wholesale-market-update",
  "store-settlement",
  "retail-market-update",
  "npc-consumer-behavior",
  "round-settlement",
]);

function newStorage(): LocalStorageAdapter {
  return new LocalStorageAdapter(window.localStorage);
}

type Screen =
  | { kind: "checking" }
  | { kind: "resume-prompt"; savedState: GameState }
  | { kind: "setup" }
  | { kind: "playing"; init: GameInit; key: number };

/** 기존 로컬 1인 플레이 경로 (Milestone 4 4-b 이전의 `App` 그대로, 순수 이동). */
function LocalGameFlow() {
  const [screen, setScreen] = useState<Screen>({ kind: "checking" });

  // 마운트 시 저장된 게임이 있는지 한 번 확인한다. 이미 끝난 게임(라운드가 다 지난 저장분)은
  // 이어할 이유가 없으므로 조용히 지우고 창업 준비로 보낸다.
  useEffect(() => {
    let cancelled = false;
    GameSession.loadSaved(newStorage())
      .then((saved) => {
        if (cancelled) return;
        if (saved && saved.currentRound <= saved.config.totalRounds) {
          setScreen({ kind: "resume-prompt", savedState: saved });
        } else {
          if (saved) void GameSession.clearSaved(newStorage());
          setScreen({ kind: "setup" });
        }
      })
      .catch(() => {
        if (!cancelled) setScreen({ kind: "setup" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goToSetup = () => setScreen({ kind: "setup" });

  const restartFromScratch = () => {
    void GameSession.clearSaved(newStorage());
    goToSetup();
  };

  return (
    <>
      {screen.kind === "checking" && <div className="auto-advance">불러오는 중…</div>}

      {screen.kind === "resume-prompt" && (
        <ResumePromptScreen
          savedState={screen.savedState}
          onResume={() =>
            setScreen({
              kind: "playing",
              init: { resumeState: screen.savedState },
              key: screen.savedState.config.rngSeed,
            })
          }
          onNewGame={() => {
            void GameSession.clearSaved(newStorage());
            goToSetup();
          }}
        />
      )}

      {screen.kind === "setup" && (
        <SetupScreen
          onStart={(choices: BusinessSetupChoices, timeoutSettings) => {
            const rngSeed = Date.now();
            setScreen({
              kind: "playing",
              init: { rngSeed, choices, ...(timeoutSettings !== undefined && { timeoutSettings }) },
              key: rngSeed,
            });
          }}
        />
      )}

      {screen.kind === "playing" && (
        <GameScreen key={screen.key} init={screen.init} onRestart={restartFromScratch} />
      )}
    </>
  );
}

function GameScreen({ init, onRestart }: { init: GameInit; onRestart: () => void }) {
  const { session, state, version } = useGameSession(init);
  const player = session.getHumanPlayer();
  const gameOver = state.currentRound > state.config.totalRounds;
  const phase = state.currentPhase;
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [teacherViewOpen, setTeacherViewOpen] = useState(false);

  const advance = (force = false) => {
    setIsAdvancing(true);
    session
      .advancePhase(force)
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        setIsAdvancing(false);
      });
  };

  // 조용한 phase는 자동으로 넘어간다. React StrictMode는 개발 모드에서 effect를 일부러
  // 두 번 실행해 이런 부수효과 버그를 잡아내는데(https://react.dev), GameSession.advancePhase()
  // 자체가 겹치는 호출을 하나로 묶어 처리하므로(재진입 방지) 실제 상태 오염은 없다 — 이
  // version 체크는 그 위에 더해, 같은 버전에 대해 두 번째로 시도조차 하지 않게 하는
  // 방어적 장치다.
  const lastAutoAdvancedVersion = useRef(-1);
  useEffect(() => {
    if (gameOver) return;
    if (!SILENT_AUTO_PHASES.has(phase) || session.isWaitingForHumanInput()) return;
    const version = session.getVersion();
    if (lastAutoAdvancedVersion.current === version) return;
    lastAutoAdvancedVersion.current = version;
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advance는 매 렌더 새로 만들어지는 안정적이지 않은 클로저이고, 여기서 실제로 필요한 의존성은 phase/gameOver/session뿐이다.
  }, [phase, gameOver, session]);

  return (
    <>
      <div style={{ display: teacherViewOpen ? "none" : undefined }}>
        <CityGameLayout state={state} player={player} teacherControl={
          <button className="secondary" onClick={() => setTeacherViewOpen(true)}>
            👩‍🏫 교사 화면 보기
          </button>
        }>

        {gameOver && <GameOverScreen state={state} player={player} onRestart={onRestart} />}

        {!gameOver && phase === "company-turn" && (
          <CompanyTurnScreen
            session={session}
            state={state}
            version={version}
            company={state.companies[player.companyId]!}
            onSubmitted={() => advance()}
            disabled={isAdvancing}
          />
        )}

        {!gameOver && phase === "store-turn" && (
          <StoreTurnScreen
            session={session}
            state={state}
            version={version}
            store={state.stores[player.storeId]!}
            companies={state.companies}
            onSubmitted={() => advance()}
            disabled={isAdvancing}
          />
        )}

        {!gameOver && phase === "household-turn" && (
          <HouseholdTurnScreen
            session={session}
            state={state}
            version={version}
            household={state.households[player.householdId]!}
            stores={state.stores}
            onSubmitted={() => advance()}
            disabled={isAdvancing}
          />
        )}

        {!gameOver && phase === "round-result" && (
          <RoundResultScreen
            state={state}
            player={player}
            isLastRound={state.currentRound === state.config.totalRounds}
            onNext={() => {
              session.acknowledgeRoundResult(player.id);
              advance();
            }}
            disabled={isAdvancing}
          />
        )}

        {!gameOver && SILENT_AUTO_PHASES.has(phase) && (
          <div className="auto-advance">시장을 정리하고 있어요…</div>
        )}
        </CityGameLayout>
      </div>

      {teacherViewOpen && (
        <TeacherOverviewScreen state={state} onClose={() => setTeacherViewOpen(false)} />
      )}
    </>
  );
}

type TopMode =
  | { kind: "mode-select" }
  | { kind: "local" }
  | { kind: "network-backend-select" }
  | { kind: "network-role-select"; backend: NetworkBackend }
  | { kind: "network-teacher"; backend: NetworkBackend }
  | { kind: "network-join"; backend: NetworkBackend }
  | { kind: "network-lobby"; backend: NetworkBackend; sessionId: string; token: string; slot: PlayerSlot }
  | { kind: "network-playing"; backend: NetworkBackend; sessionId: string; token: string; slot: PlayerSlot };

export function App() {
  const [mode, setMode] = useState<TopMode>({ kind: "mode-select" });

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-logo-icon" aria-hidden="true">🏙️</span>
        <h1>시장경제 체험 게임</h1>
      </header>

      {mode.kind === "mode-select" && (
        <div className="title-screen">
          <img className="village-artwork" src={villageArtwork}
            alt="물건을 만드는 기업, 물건을 파는 가게, 생활에 필요한 물건을 사는 가계가 모인 경제 마을"
            width={1536} height={1024} />
          <p className="title-tagline">만들고, 팔고, 사면서 시장을 배워요!</p>
          <div className="mode-cards">
            <button className="mode-card mode-card-solo" onClick={() => setMode({ kind: "local" })}>
              <span className="mode-card-icon" aria-hidden="true">🎮</span>
              <span className="mode-card-title">혼자 하기</span>
              <span className="mode-card-desc">나 혼자 기업·가게·가계를 모두 운영해요</span>
            </button>
            <button className="mode-card mode-card-team" onClick={() => setMode({ kind: "network-backend-select" })}>
              <span className="mode-card-icon" aria-hidden="true">👫</span>
              <span className="mode-card-title">함께 하기</span>
              <span className="mode-card-desc">친구들과 같은 시장에서 겨뤄요</span>
            </button>
          </div>
        </div>
      )}

      {mode.kind === "local" && <LocalGameFlow />}

      {mode.kind === "network-backend-select" && (
        <NetworkBackendSelectScreen onSelect={(backend) => setMode({ kind: "network-role-select", backend })} />
      )}

      {mode.kind === "network-role-select" && (
        <div className="card">
          <button
            className="primary"
            onClick={() => setMode({ kind: "network-teacher", backend: mode.backend })}
            style={{ marginRight: 12 }}
          >
            교사로 세션 만들기
          </button>
          <button className="secondary" onClick={() => setMode({ kind: "network-join", backend: mode.backend })}>
            학생으로 참가
          </button>
        </div>
      )}

      {mode.kind === "network-teacher" && mode.backend.kind === "local-server" && (
        <TeacherSessionScreen client={mode.backend.client} />
      )}
      {mode.kind === "network-teacher" && mode.backend.kind === "apps-script" && (
        <AppsScriptTeacherSessionScreen client={mode.backend.client} />
      )}

      {mode.kind === "network-join" && mode.backend.kind === "local-server" && (
        <NetworkJoinScreen
          client={mode.backend.client}
          onJoined={({ sessionId, token, slot }) =>
            setMode({ kind: "network-lobby", backend: mode.backend, sessionId, token, slot })
          }
        />
      )}
      {mode.kind === "network-join" && mode.backend.kind === "apps-script" && (
        <AppsScriptNetworkJoinScreen
          client={mode.backend.client}
          onJoined={({ sessionId, token, slot }) =>
            setMode({ kind: "network-lobby", backend: mode.backend, sessionId, token, slot })
          }
        />
      )}

      {mode.kind === "network-lobby" && mode.backend.kind === "local-server" && (
        <NetworkLobbyScreen
          client={mode.backend.client}
          sessionId={mode.sessionId}
          token={mode.token}
          slot={mode.slot}
          onLobbyClosed={() =>
            setMode({ kind: "network-playing", backend: mode.backend, sessionId: mode.sessionId, token: mode.token, slot: mode.slot })
          }
        />
      )}
      {mode.kind === "network-lobby" && mode.backend.kind === "apps-script" && (
        <AppsScriptNetworkLobbyScreen
          client={mode.backend.client}
          sessionId={mode.sessionId}
          token={mode.token}
          slot={mode.slot}
          onLobbyClosed={() =>
            setMode({ kind: "network-playing", backend: mode.backend, sessionId: mode.sessionId, token: mode.token, slot: mode.slot })
          }
        />
      )}

      {mode.kind === "network-playing" && mode.backend.kind === "local-server" && (
        <NetworkGameScreen client={mode.backend.client} sessionId={mode.sessionId} token={mode.token} slot={mode.slot} />
      )}
      {mode.kind === "network-playing" && mode.backend.kind === "apps-script" && (
        <AppsScriptNetworkGameScreen client={mode.backend.client} sessionId={mode.sessionId} token={mode.token} slot={mode.slot} />
      )}
    </div>
  );
}
