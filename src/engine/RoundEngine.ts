import type { GameState, RoundPhase } from "../types/domain.js";
import { prepareCityRound } from "../economy/city.js";

/**
 * docs/ROUND_FLOW.md 에 정의된 고정 순서. 임의로 순서를 바꾸거나 단계를 생략하지 않는다.
 * 문서의 11번째 단계("다음 라운드 시작")는 라운드 내부 단계가 아니라 라운드 간 전환이므로
 * 여기에는 포함하지 않는다 — 그 전환은 RoundEngine.runGame()이 담당한다.
 */
export const ROUND_PHASES: readonly RoundPhase[] = [
  "company-turn",
  "company-settlement",
  "wholesale-market-update",
  "store-turn",
  "store-settlement",
  "retail-market-update",
  "household-turn",
  "npc-consumer-behavior",
  "round-settlement",
  "round-result",
];

export type PhaseHandler = (state: GameState) => void | Promise<void>;

/**
 * 각 단계의 실제 경제 로직은 economy/npc/advisor 모듈이 구현해 주입한다.
 * 이번 단계에서는 핸들러를 비워두면 아무 계산도 하지 않는 no-op 골격으로 동작한다
 * (docs/ECONOMY_ENGINE.md 참고 — 실제 공식은 Milestone 1에서 채운다).
 */
export type PhaseHandlers = Partial<Record<RoundPhase, PhaseHandler>>;

/**
 * 라운드 진행 오케스트레이터. "언제 무엇을 실행하는가"만 책임지고,
 * "무엇을 어떻게 계산하는가"는 주입된 핸들러에 위임한다.
 */
export class RoundEngine {
  constructor(
    private readonly state: GameState,
    private readonly handlers: PhaseHandlers = {},
  ) {}

  getState(): Readonly<GameState> {
    return this.state;
  }

  /** 한 라운드(라운드 내부 10단계)를 순서대로 실행한다. */
  async runRound(): Promise<RoundPhase[]> {
    prepareCityRound(this.state);
    const executed: RoundPhase[] = [];
    for (const phase of ROUND_PHASES) {
      this.state.currentPhase = phase;
      const handler = this.handlers[phase];
      if (handler) {
        await handler(this.state);
      }
      executed.push(phase);
    }
    return executed;
  }

  /** config.totalRounds 만큼 라운드를 반복 실행한다. */
  async runGame(): Promise<void> {
    while (this.state.currentRound <= this.state.config.totalRounds) {
      await this.runRound();
      this.state.currentRound += 1;
      prepareCityRound(this.state);
    }
  }

  /**
   * 현재 phase 하나만 실행하고 멈춘다. UI가 사람의 입력을 기다렸다가 phase를 한 단계씩
   * 진행시켜야 하는 Milestone 2(Local Classroom Prototype)를 위한 것이다 — runRound()/
   * runGame()은 헤드리스 시뮬레이터가 계속 쓰는 완전 동기 실행 경로이므로 건드리지 않는다.
   *
   * ROUND_PHASES.length * config.totalRounds번 반복 호출하면 runGame() 한 번과 정확히
   * 같은 최종 상태가 되어야 한다 (tests/engine/roundEngine.test.ts가 이를 검증한다).
   */
  async stepPhase(): Promise<{ round: number; phase: RoundPhase; gameOver: boolean }> {
    if (this.state.currentRound > this.state.config.totalRounds) {
      throw new Error("stepPhase() called after the game has already ended");
    }

    const executedRound = this.state.currentRound;
    const executedPhase = this.state.currentPhase;
    const handler = this.handlers[executedPhase];
    if (handler) {
      await handler(this.state);
    }

    const index = ROUND_PHASES.indexOf(executedPhase);
    const isLastPhaseOfRound = index === ROUND_PHASES.length - 1;
    if (isLastPhaseOfRound) {
      this.state.currentRound += 1;
      prepareCityRound(this.state);
      if (this.state.currentRound <= this.state.config.totalRounds) {
        this.state.currentPhase = ROUND_PHASES[0]!;
      }
      // 게임이 끝났다면 currentPhase는 마지막으로 실행된 phase("round-result")에 머문다 —
      // runGame()의 최종 상태(currentRound === totalRounds+1)와 동일하게 맞추기 위함.
    } else {
      this.state.currentPhase = ROUND_PHASES[index + 1]!;
    }

    return { round: executedRound, phase: executedPhase, gameOver: this.state.currentRound > this.state.config.totalRounds };
  }
}
