/**
 * Milestone 2(Local Classroom Prototype) 세션. docs/MULTIPLAYER_DESIGN.md가 예약해 둔
 * "누가 제출했는지, 언제 phase를 넘기는지" 책임을 처음으로 구현한다 — 로컬(단일 기기,
 * 네트워크 없음) 버전이지만, phase가 실행되는 순간까지 제출된 입력을 다른 참가자에게
 * 노출하지 않는다는 담합 방지 원칙(GAME_RULES.md 2절)은 그대로 지킨다.
 *
 * D-021: 이번 범위는 학생 1명(사람)만 플레이한다. 사람이 조종하는 기업/가게/가계는 각
 * phase마다 최대 한 번 결정을 제출할 수 있고, 제출하지 않은 채 강제로 phase를 넘기면
 * (또는 사람이 조종하지 않는 나머지 모든 참여자는 애초에) 기존 봇 정책으로 자동 처리된다 —
 * NPC와 동일한 코드 경로(src/npc/decisions.ts)이므로 무한자산 등 특혜는 없다.
 *
 * GameState 자체에는 "누가 사람인가"를 담지 않는다 — 그건 세션/UI의 관심사이지 경제
 * 엔진이 알아야 할 정보가 아니다 (엔진↔UI 분리 원칙, CLAUDE.md 2절).
 */
import type { HumanDecisionSource, StoreDecisionInput } from "../engine/simulateGame.js";
import { buildInitialGameState, createPhaseHandlers } from "../engine/simulateGame.js";
import { RoundEngine } from "../engine/RoundEngine.js";
import { createRng } from "../economy/rng.js";
import type { StorageAdapter } from "../storage/StorageAdapter.js";
import type {
  CompanyDecisionInput,
  PurchaseRequestLine,
} from "../economy/humanDecisions.js";
import type {
  DistrictId,
  GameState,
  ParticipantId,
  PlayerState,
  ProductCategoryId,
  RoundPhase,
} from "../types/domain.js";

export interface BusinessSetupChoices {
  companyDistrictId: DistrictId;
  companyCategoryId: ProductCategoryId;
  storeDistrictId: DistrictId;
  storeCategoryId: ProductCategoryId;
}

export interface StepOutcome {
  round: number;
  phase: RoundPhase;
  gameOver: boolean;
}

/** 사람 입력이 필요한 phase에서, 아직 제출하지 않았는지 여부. */
const PHASES_REQUIRING_HUMAN_INPUT: readonly RoundPhase[] = ["company-turn", "store-turn", "household-turn"];

/** `StorageAdapter`에 저장할 때 쓰는 키. UI가 재사용할 수 있도록 export한다. */
export const SAVED_SESSION_STORAGE_KEY = "economy-game:session-v1";

/** 저장된 값이 실제로 GameState 모양인지 최소한으로 확인한다 (스키마가 바뀐 예전 저장분 방어). */
function isPlausibleGameState(value: unknown): value is GameState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GameState>;
  return (
    typeof candidate.currentRound === "number" &&
    typeof candidate.currentPhase === "string" &&
    Array.isArray(candidate.players) &&
    typeof candidate.companies === "object" &&
    typeof candidate.stores === "object" &&
    typeof candidate.households === "object"
  );
}

export class GameSession {
  private readonly engine: RoundEngine;
  private readonly state: GameState;
  private readonly humanPlayer: PlayerState;
  private pendingCompanyInput: CompanyDecisionInput | undefined;
  private pendingStoreRequest: StoreDecisionInput | undefined;
  private pendingHouseholdRequest: PurchaseRequestLine[] | undefined;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private advancingPromise: Promise<StepOutcome> | undefined;
  private storage: StorageAdapter | undefined;

  /**
   * resumeState를 주면 새로 만들지 않고 저장된 상태를 그대로 이어서 쓴다 (새로고침 복원용,
   * `GameSession.resumeFromState` 참고). 이 경우 rngSeed/setupChoices는 무시된다 — 이미
   * 확정된 상태와 그 안의 config.rngSeed를 그대로 쓴다.
   *
   * 주의: 재개 시 봇 결정에 쓰는 PRNG는 원래 게임과 완전히 같은 순서로 이어지지 않는다
   * (내부 시드 상태를 직렬화하지 않기 때문— 매 phase 결과까지 저장/복원하는 것은 과한
   * 설계라 판단했다). 대신 라운드 번호를 섞어 시드를 다시 만들어, 재개 직후 봇 결정이
   * 라운드 1과 완전히 똑같이 반복되는 것만 피한다. 저장 자체는 phase가 완전히 끝난 뒤의
   * 확정된 GameState만 다루므로 이 때문에 데이터 무결성이 깨지지는 않는다.
   */
  constructor(rngSeed: number = Date.now(), setupChoices?: BusinessSetupChoices, resumeState?: GameState) {
    this.state = resumeState ?? buildInitialGameState(1, rngSeed);
    const player = this.state.players[0];
    if (!player) {
      throw new Error("buildInitialGameState(1, ...) must always create exactly one player");
    }
    this.humanPlayer = player;

    if (setupChoices && !resumeState) {
      const company = this.state.companies[player.companyId]!;
      company.districtId = setupChoices.companyDistrictId;
      company.productCategoryId = setupChoices.companyCategoryId;
      const store = this.state.stores[player.storeId]!;
      store.districtId = setupChoices.storeDistrictId;
      store.specialtyCategoryId = setupChoices.storeCategoryId;
    }

    const decisionSource: HumanDecisionSource = {
      getCompanyInput: (id) => (id === this.humanPlayer.companyId ? this.pendingCompanyInput : undefined),
      getStorePurchaseRequest: (id) => (id === this.humanPlayer.storeId ? this.pendingStoreRequest : undefined),
      getHouseholdPurchaseRequest: (id) =>
        id === this.humanPlayer.householdId ? this.pendingHouseholdRequest : undefined,
    };

    const effectiveSeed = this.state.config.rngSeed;
    const rng = resumeState
      ? createRng(effectiveSeed + 1 + this.state.currentRound * 97 + this.state.roundMetrics.length)
      : createRng(effectiveSeed + 1);
    this.engine = new RoundEngine(this.state, createPhaseHandlers(rng, decisionSource));
  }

  /** 저장된 GameState로부터 세션을 이어서 만든다 (브라우저 새로고침 등으로 끊긴 게임 복원). */
  static resumeFromState(savedState: GameState): GameSession {
    return new GameSession(savedState.config.rngSeed, undefined, savedState);
  }

  /**
   * `storage`에 저장된 게임이 있으면 불러온다. 손상됐거나 스키마가 안 맞는 값은 조용히
   * 무시하고 undefined를 반환한다 (이어할 게 없는 것과 동일하게 취급).
   */
  static async loadSaved(storage: StorageAdapter): Promise<GameState | undefined> {
    const saved = await storage.get<unknown>(SAVED_SESSION_STORAGE_KEY);
    return isPlausibleGameState(saved) ? saved : undefined;
  }

  /** 이후 phase가 끝날 때마다 자동으로 storage에 저장한다. */
  enableAutoSave(storage: StorageAdapter): void {
    this.storage = storage;
  }

  /** 저장된 게임 기록을 지운다 (게임 종료, 또는 사용자가 새 게임을 명시적으로 선택했을 때). */
  static async clearSaved(storage: StorageAdapter): Promise<void> {
    await storage.delete(SAVED_SESSION_STORAGE_KEY);
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  /**
   * `state`는 매 phase마다 제자리에서(mutate) 갱신되고 절대 새 객체로 교체되지 않는다 —
   * `useSyncExternalStore`는 스냅샷 값의 참조/값 동일성으로 리렌더 여부를 판단하므로,
   * `getState()`의 반환값(항상 같은 객체 참조) 그 자체를 스냅샷으로 쓰면 변경을 놓친다.
   * 대신 이 버전 카운터를 스냅샷으로 쓰고, `getState()`는 렌더 본문에서 따로 읽는다
   * (src/ui/useGameSession.ts).
   */
  getVersion(): number {
    return this.version;
  }

  getHumanPlayer(): Readonly<PlayerState> {
    return this.humanPlayer;
  }

  /** 현재 phase가 사람 입력을 필요로 하는데 아직 제출되지 않았는가. */
  isWaitingForHumanInput(): boolean {
    switch (this.state.currentPhase) {
      case "company-turn":
        return this.pendingCompanyInput === undefined;
      case "store-turn":
        return this.pendingStoreRequest === undefined;
      case "household-turn":
        return this.pendingHouseholdRequest === undefined;
      default:
        return false;
    }
  }

  submitCompanyDecision(input: CompanyDecisionInput): void {
    this.assertPhase("company-turn");
    this.pendingCompanyInput = input;
    this.notify();
  }

  submitStoreDecision(input: StoreDecisionInput): void {
    this.assertPhase("store-turn");
    this.pendingStoreRequest = input;
    this.notify();
  }

  submitHouseholdPurchases(lines: PurchaseRequestLine[]): void {
    this.assertPhase("household-turn");
    this.pendingHouseholdRequest = lines;
    this.notify();
  }

  /**
   * 현재 phase를 실행하고 다음 phase로 넘어간다. 사람 입력이 필요한 phase인데 아직
   * 제출되지 않았다면 force=true를 넘기지 않는 한 거부한다 (한 명이라도 놓치면 그냥
   * 넘어가는 대신, "제출 안 하면 봇이 대신한다"는 것을 UI가 명시적으로 선택하게 한다).
   *
   * 재진입 방지: phase handler는 동기 코드라 await 지점이 사실상 하나뿐이라서, 이 메서드가
   * 끝나기 전에 다시 호출되면(예: React StrictMode의 effect 이중 호출, 사용자의 빠른 연타)
   * 같은 phase가 두 번 실행되어 현금이 두 번 차감/적립되는 등 상태가 오염될 수 있다
   * (code-reviewer가 실제로 재현: round-settlement가 두 번 실행되어 roundMetrics가
   * 라운드당 2건씩 쌓이는 것을 확인함). 이미 진행 중인 Promise를 그대로 돌려줘서, 겹쳐
   * 들어온 호출이 phase를 다시 실행하지 못하게 막는다.
   */
  advancePhase(force = false): Promise<StepOutcome> {
    if (this.advancingPromise) {
      return this.advancingPromise;
    }
    if (!force && this.isWaitingForHumanInput()) {
      return Promise.reject(
        new Error(`Cannot advance: waiting for human input in phase "${this.state.currentPhase}"`),
      );
    }

    // 주의: advancingPromise는 notify()를 부르기 "전"에 지워야 한다. notify()는 구독자에게
    // 동기적으로 알리고, 구독자(React의 useSyncExternalStore)가 그 자리에서 즉시 리렌더 →
    // effect 재실행 → advancePhase()를 다시 부르는 경우가 실제로 있다(다음 phase로 넘어가는
    // 정당한 재호출). 이 시점에 advancingPromise가 아직 안 지워져 있으면, "새로운 phase로
    // 넘어가려는 요청"을 "아직 안 끝난 이전 요청"으로 착각해 그대로 삼켜버려 자동 진행이
    // 멈춘다 — 처음 구현했을 때 실제로 겪은 버그다. finally()에서 지우면 이 return 문
    // 자체가 끝난 뒤에야 지워지므로 늦는다.
    const run = async (): Promise<StepOutcome> => {
      const result = await this.engine.stepPhase();
      this.pendingCompanyInput = undefined;
      this.pendingStoreRequest = undefined;
      this.pendingHouseholdRequest = undefined;
      this.advancingPromise = undefined;
      this.notify();
      await this.persist();
      return result;
    };

    this.advancingPromise = run().catch((error: unknown) => {
      this.advancingPromise = undefined;
      throw error;
    });
    return this.advancingPromise;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private assertPhase(phase: RoundPhase): void {
    if (this.state.currentPhase !== phase) {
      throw new Error(`Cannot submit for phase "${phase}" while current phase is "${this.state.currentPhase}"`);
    }
  }

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * phase가 끝난 뒤의 확정된 상태만 저장한다 (미확정 제출값은 저장 대상이 아니다,
   * docs/GOOGLE_SHEETS_ARCHITECTURE.md). storage가 없거나 저장이 실패해도 게임 진행 자체를
   * 막지 않는다 — 저장은 부가 기능이지 게임 플레이의 전제조건이 아니다.
   */
  private async persist(): Promise<void> {
    if (!this.storage) return;
    try {
      await this.storage.set(SAVED_SESSION_STORAGE_KEY, this.state);
    } catch (error) {
      console.error("Failed to save game session:", error);
    }
  }
}

export function phaseNeedsHumanInput(phase: RoundPhase): boolean {
  return PHASES_REQUIRING_HUMAN_INPUT.includes(phase);
}

export type { CompanyDecisionInput, PurchaseRequestLine, StoreDecisionInput, ParticipantId };
