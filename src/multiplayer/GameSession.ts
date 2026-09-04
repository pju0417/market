/**
 * Milestone 2(Local Classroom Prototype) 세션. docs/MULTIPLAYER_DESIGN.md가 예약해 둔
 * "누가 제출했는지, 언제 phase를 넘기는지" 책임을 처음으로 구현한다 — 로컬(단일 기기,
 * 네트워크 없음) 버전이지만, phase가 실행되는 순간까지 제출된 입력을 다른 참가자에게
 * 노출하지 않는다는 담합 방지 원칙(GAME_RULES.md 2절)은 그대로 지킨다.
 *
 * D-021 → Milestone 4 1단계: 처음에는 학생 1명(사람)만 지원했지만, 이제 `studentCount`로
 * 여러 학생을 같은 세션에서 동시에 조종할 수 있다(여전히 네트워크 없음 — 한 기기/프로세스
 * 안에서 여러 참가자의 제출을 모아 두는 구조). 각 학생이 조종하는 기업/가게/가계는 각
 * phase마다 최대 한 번 결정을 제출할 수 있고, 제출하지 않은 채 강제로 phase를 넘기면
 * (또는 사람이 조종하지 않는 나머지 모든 참여자는 애초에) 기존 봇 정책으로 자동 처리된다 —
 * NPC와 동일한 코드 경로(src/npc/decisions.ts)이므로 무한자산 등 특혜는 없다.
 *
 * GameState 자체에는 "누가 사람인가"를 담지 않는다 — 그건 세션/UI의 관심사이지 경제
 * 엔진이 알아야 할 정보가 아니다 (엔진↔UI 분리 원칙, CLAUDE.md 2절).
 */
import type { HumanDecisionSource, StoreDecisionInput, SubmissionTimeoutSettings } from "../engine/simulateGame.js";
import { buildInitialGameState, createPhaseHandlers } from "../engine/simulateGame.js";
import { RoundEngine } from "../engine/RoundEngine.js";
import { createRng } from "../economy/rng.js";
import type { StorageAdapter } from "../storage/StorageAdapter.js";
import type {
  CategoryPurchaseRequest,
  CompanyDecisionInput,
} from "../economy/humanDecisions.js";
import type {
  DistrictId,
  GameState,
  ParticipantId,
  PlayerState,
  ProductCategoryId,
  RoundPhase,
} from "../types/domain.js";

/**
 * 로컬(단일 기기, 1인 플레이 포함) 세션의 제출 제한시간 기본값 (구매 매칭 알고리즘 재설계
 * Stage 1). 사용자 확정: 로컬 플레이는 기본적으로 제한시간을 끈다(enabled=false) — 그래도
 * "사람 실제 시각순 먼저 + NPC 셔플 순서 나중"이라는 처리 순서 자체는 유지된다
 * (orderBuyersForTurn, src/engine/simulateGame.ts 참고). Stage 2부터 생성자가 선택적
 * `timeoutSettings` 인자를 받으므로, 이 상수는 그 인자를 생략했을 때만 쓰이는 기본값이다
 * (`src/ui/screens/SetupScreen.tsx`의 로컬 1인 플레이 "고급 설정"도 기본 선택값을 이와
 * 맞춘다).
 */
export const DEFAULT_LOCAL_SUBMISSION_TIMEOUT_SETTINGS: SubmissionTimeoutSettings = {
  enabled: false,
  timeoutMs: 120_000,
  npcGraduatedEntryEnabled: true,
};

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

/**
 * `GameSession`이 phase 진행 중 메모리에만 들고 있는 버퍼링된 제출값과 로비 확정 상태의
 * 스냅숏 (Milestone 5, D-032). Apps Script처럼 요청마다 인스턴스가 통째로 사라지는 무상태
 * 실행 환경에서, 이 값들을 외부(시트)에 저장했다가 다음 요청에서 복원하기 위한 것이다.
 * `GameState`(엔진이 아는 것) 자체에는 이 정보를 넣지 않는다 — "GameState는 누가 사람인지
 * 담지 않는다"는 기존 원칙과 일관되게 별도 타입으로 관리한다.
 */
export interface PendingSubmissionsSnapshot {
  companyInputs: Record<ParticipantId, CompanyDecisionInput>;
  storeRequests: Record<ParticipantId, StoreDecisionInput>;
  householdRequests: Record<ParticipantId, CategoryPurchaseRequest[]>;
  acknowledgedRoundResultPlayerIds: ParticipantId[];
  humanPlayerIds: ParticipantId[];
  lobbyMembershipFinalized: boolean;
  /** 구매 매칭 알고리즘 재설계 Stage 1: 이번 phase에서 각 참여자의 제출이 접수된 시각(ms). */
  storeRequestReceivedAt: Record<ParticipantId, number>;
  householdRequestReceivedAt: Record<ParticipantId, number>;
  /** 현재 phase가 시작된 시각(ms). */
  phaseStartedAt: number;
}

/** 사람 입력이 필요한 phase에서, 아직 제출하지 않았는지 여부. */
const PHASES_REQUIRING_HUMAN_INPUT: readonly RoundPhase[] = [
  "company-turn",
  "store-turn",
  "household-turn",
  "round-result",
];

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
  /** 이 세션에서 사람이 조종하는 전원. `GameState.players`는 애초에 학생(사람) 참가자만
   * 담으므로(NPC는 별도 레코드), 생성 시점에는 `this.humanPlayers === this.state.players`
   * (같은 참조)이지만, `finalizeLobbyMembership` 호출 후에는 `this.humanPlayers`가 그
   * 부분집합(새 배열)이 될 수 있다(Milestone 4 6단계) — `readonly`가 아닌 것도 그래서다.
   * `GameState.players`/`companies`/`stores`/`households`의 `kind` 필드는 절대 안 바뀐다 —
   * 유령이 된 참가자는 엔진 입장에서는 여전히 `kind:"student"`이고, 단지 이 세션이 더 이상
   * 그의 제출을 기다리지 않을 뿐이다. */
  private humanPlayers: readonly PlayerState[];
  private readonly pendingCompanyInputs = new Map<ParticipantId, CompanyDecisionInput>();
  private readonly pendingStoreRequests = new Map<ParticipantId, StoreDecisionInput>();
  private readonly pendingHouseholdRequests = new Map<ParticipantId, CategoryPurchaseRequest[]>();
  /** round-result phase에서 각 학생이 결과를 확인(ack)했는지 (D-030: 라운드 결과만은
   * 전원이 확인해야 다음 라운드로 진행하는 국지적 예외). */
  private readonly acknowledgedRoundResultPlayerIds = new Set<ParticipantId>();
  private readonly listeners = new Set<() => void>();
  /** `finalizeLobbyMembership`이 이미 호출됐는지 (한 세션 안에서 한 번만 유효). */
  private lobbyMembershipFinalized = false;
  private version = 0;
  private advancingPromise: Promise<StepOutcome> | undefined;
  private storage: StorageAdapter | undefined;
  /** 구매 매칭 알고리즘 재설계 Stage 1: 각 참여자의 이번 phase 제출 접수 시각(ms). */
  private readonly storeRequestReceivedAt = new Map<ParticipantId, number>();
  private readonly householdRequestReceivedAt = new Map<ParticipantId, number>();
  /** 현재 phase가 시작된 시각(ms) — orderBuyersForTurn의 NPC 순차진입 계산 기준점. */
  private phaseStartedAt: number;
  private readonly timeoutSettings: SubmissionTimeoutSettings;

  /**
   * resumeState를 주면 새로 만들지 않고 저장된 상태를 그대로 이어서 쓴다 (새로고침 복원용,
   * `GameSession.resumeFromState` 참고). 이 경우 rngSeed/setupChoices/studentCount는
   * 무시된다 — 이미 확정된 상태와 그 안의 config.rngSeed, 그리고 저장된 `players` 배열을
   * 그대로 쓴다.
   *
   * 주의: 재개 시 봇 결정에 쓰는 PRNG는 원래 게임과 완전히 같은 순서로 이어지지 않는다
   * (내부 시드 상태를 직렬화하지 않기 때문— 매 phase 결과까지 저장/복원하는 것은 과한
   * 설계라 판단했다). 대신 라운드 번호를 섞어 시드를 다시 만들어, 재개 직후 봇 결정이
   * 라운드 1과 완전히 똑같이 반복되는 것만 피한다. 저장 자체는 phase가 완전히 끝난 뒤의
   * 확정된 GameState만 다루므로 이 때문에 데이터 무결성이 깨지지는 않는다.
   *
   * `studentCount`는 맨 뒤에 기본값 1로 추가했다 — 기존 호출부 `new GameSession(seed)`,
   * `new GameSession(seed, choices)`가 자리/의미를 그대로 유지하면서 계속 동작해야 하기
   * 때문이다(중간에 끼워 넣으면 기존 호출의 인자 의미가 바뀐다). `BusinessSetupChoices`는
   * 아직 "단일 플레이어가 자기 창업을 고른다"는 모양 그대로다 — 여러 학생 각자의 창업
   * 준비 UI/데이터 모델은 Milestone 4 다음 단계(다인원 로비)에서 다룬다. 따라서
   * `studentCount > 1`일 때는 setupChoices를 아예 적용하지 않고 엔진의 기본 배정
   * (buildInitialGameState의 카테고리/상권 순환 배정)을 그대로 쓴다 — 특정 학생 한 명에게만
   * 적용하면 나머지 학생과 취급이 달라져 오히려 혼란스럽다고 판단했다.
   *
   * `pending`은 맨 뒤에 추가했다(Milestone 5, D-032) — Apps Script 환경에서 이전 요청이
   * 내보낸 `PendingSubmissionsSnapshot`(제출 버퍼 + 로비 확정 상태)을 그대로 복원해 이어서
   * 쓰기 위한 것으로, 보통 `resumeState`와 함께 쓰인다. 생략하면(기존 모든 호출부가 그렇듯)
   * 완전히 빈 제출 버퍼로 시작하는 기존 동작 그대로다.
   *
   * `timeoutSettings`는 맨 뒤에 추가했다(구매 매칭 알고리즘 재설계 Stage 2) — 교사가 세션
   * 생성 시 제출 제한시간/NPC 순차진입 여부를 직접 정할 수 있게 한 것으로, 생략하면(기존
   * 모든 호출부가 그렇듯) `DEFAULT_LOCAL_SUBMISSION_TIMEOUT_SETTINGS`(로컬 1인 플레이 기본값,
   * Stage 1 그대로)를 쓴다.
   */
  constructor(
    rngSeed: number = Date.now(),
    setupChoices?: BusinessSetupChoices,
    resumeState?: GameState,
    studentCount: number = 1,
    pending?: PendingSubmissionsSnapshot,
    timeoutSettings?: SubmissionTimeoutSettings,
  ) {
    this.state = resumeState ?? buildInitialGameState(studentCount, rngSeed);
    this.humanPlayers = this.state.players;
    if (this.humanPlayers.length === 0) {
      throw new Error("GameSession requires at least one human player");
    }

    this.phaseStartedAt = Date.now();
    // `pending.phaseStartedAt`은 아래 restorePendingSubmissions에서 별도로 복원한다.
    this.timeoutSettings = timeoutSettings ?? DEFAULT_LOCAL_SUBMISSION_TIMEOUT_SETTINGS;

    if (setupChoices && !resumeState && this.humanPlayers.length === 1) {
      this.applyBusinessSetupChoices(this.humanPlayers[0]!.id, setupChoices);
    }

    if (pending) {
      this.restorePendingSubmissions(pending);
    }

    const decisionSource: HumanDecisionSource = {
      getCompanyInput: (id) => this.pendingCompanyInputs.get(id),
      getStorePurchaseRequest: (id) => this.pendingStoreRequests.get(id),
      getHouseholdPurchaseRequest: (id) => this.pendingHouseholdRequests.get(id),
      getStoreSubmissionReceivedAt: (id) => this.storeRequestReceivedAt.get(id),
      getHouseholdSubmissionReceivedAt: (id) => this.householdRequestReceivedAt.get(id),
      getPhaseStartedAt: () => this.phaseStartedAt,
      getSubmissionTimeoutSettings: () => this.timeoutSettings,
    };

    const effectiveSeed = this.state.config.rngSeed;
    const rng = resumeState
      ? createRng(effectiveSeed + 1 + this.state.currentRound * 97 + this.state.roundMetrics.length)
      : createRng(effectiveSeed + 1);
    this.engine = new RoundEngine(this.state, createPhaseHandlers(rng, decisionSource));
  }

  /**
   * 저장된 GameState로부터 세션을 이어서 만든다 (브라우저 새로고침 등으로 끊긴 게임 복원).
   * `pending`을 생략하면 기존 호출부(로컬 서버의 새로고침 복원 경로 포함)와 완전히 동일하게
   * 빈 제출 버퍼로 재개한다 — Apps Script 세션 저장소(Milestone 5)만 `pending`을 넘겨
   * 라운드 도중 버퍼링된 제출값과 로비 확정 상태까지 이어서 복원한다.
   *
   * `timeoutSettings`도 생략 가능하다(구매 매칭 알고리즘 재설계 Stage 2) — 생략하면
   * 생성자와 동일하게 `DEFAULT_LOCAL_SUBMISSION_TIMEOUT_SETTINGS`를 쓴다.
   */
  static resumeFromState(
    savedState: GameState,
    pending?: PendingSubmissionsSnapshot,
    timeoutSettings?: SubmissionTimeoutSettings,
  ): GameSession {
    return new GameSession(savedState.config.rngSeed, undefined, savedState, 1, pending, timeoutSettings);
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

  /**
   * `playerId`가 조종하는 회사/가게의 창업 준비(상권/업종)를 적용한다 (Milestone 4 4단계:
   * 다인원 로비). 생성자의 단일 플레이어 전용 로직을 임의의 학생 1명 단위로 일반화한 것 —
   * 라운드 1의 기업 턴이 아직 실행되지 않았을 때만 허용한다(그 이후에는 창업 준비를 바꿀
   * 자연스러운 이유가 없고, 이미 진행 중인 라운드의 배정을 뒤늦게 바꾸면 그 라운드의 다른
   * 결정과 정합이 깨진다).
   */
  applyBusinessSetupChoices(playerId: ParticipantId, choices: BusinessSetupChoices): void {
    if (!(this.state.currentRound === 1 && this.state.currentPhase === "company-turn")) {
      throw new Error(
        "Business setup choices can only be applied before round 1's company-turn has been executed",
      );
    }
    const player = this.humanPlayers.find((p) => p.id === playerId);
    if (!player) {
      throw new Error(`Unknown or non-human playerId "${playerId}"`);
    }
    const company = this.state.companies[player.companyId]!;
    company.districtId = choices.companyDistrictId;
    company.productCategoryId = choices.companyCategoryId;
    const store = this.state.stores[player.storeId]!;
    store.districtId = choices.storeDistrictId;
    store.specialtyCategoryId = choices.storeCategoryId;
    this.notify();
  }

  /**
   * 로비가 실제로 닫히는 순간(src/server/sessionRegistry.ts의 markLobbyClosedIfNeeded에서만
   * 호출됨) 호출된다 — 그때까지 창업 준비(/setup)를 제출하지 않은 학생을 이 순간부터 더
   * 이상 "사람 입력을 기다려야 할 참가자"로 취급하지 않게 한다(Milestone 4 6단계). 이 메서드는
   * GameState(players/companies/stores/households, kind 필드 포함)를 전혀 건드리지 않는다 —
   * 제출이 계속 없는 참가자를 자동으로 봇 정책으로 대체하는 기존 메커니즘
   * (resolveCompanyDecision 등, decisionSource가 undefined를 반환하면 자동 발동)을 그대로
   * 재사용할 뿐이다. 한 번 제외되면 그 게임 안에서는 영구적이다(재접속해도 사람으로 복귀
   * 불가 — 토큰은 유효하지만 이 세션의 humanPlayers에 더 이상 없으므로 제출/ack 시도는
   * 401로 거부된다).
   */
  finalizeLobbyMembership(setupSubmittedPlayerIds: ReadonlySet<ParticipantId>): void {
    if (!(this.state.currentRound === 1 && this.state.currentPhase === "company-turn")) {
      throw new Error(
        "finalizeLobbyMembership can only be called before round 1's company-turn has been executed",
      );
    }
    if (this.lobbyMembershipFinalized) return;
    this.lobbyMembershipFinalized = true;

    const remaining = this.humanPlayers.filter((p) => setupSubmittedPlayerIds.has(p.id));
    if (remaining.length === this.humanPlayers.length) return;
    this.humanPlayers = remaining;
    this.notify();
  }

  /**
   * 생성자에서만 호출된다(Milestone 5, D-032) — `pending`으로 받은 스냅숏을 내부 Map/Set/
   * `humanPlayers`에 주입해 복원한다. `humanPlayerIds`는 `this.state.players`(항상 세션
   * 생성 시점의 전체 학생 목록을 담는, `finalizeLobbyMembership`이 지나도 바뀌지 않는 배열)
   * 에서 id로 다시 찾아 재구성한다 — 유령 처리(D-031)로 이미 제외된 학생이 있었다면
   * `humanPlayerIds`가 그 부분집합이므로 자연히 다시 제외된 채로 복원된다.
   */
  private restorePendingSubmissions(pending: PendingSubmissionsSnapshot): void {
    for (const [companyId, input] of Object.entries(pending.companyInputs)) {
      this.pendingCompanyInputs.set(companyId, input);
    }
    for (const [storeId, input] of Object.entries(pending.storeRequests)) {
      this.pendingStoreRequests.set(storeId, input);
    }
    for (const [householdId, lines] of Object.entries(pending.householdRequests)) {
      this.pendingHouseholdRequests.set(householdId, lines);
    }
    for (const playerId of pending.acknowledgedRoundResultPlayerIds) {
      this.acknowledgedRoundResultPlayerIds.add(playerId);
    }
    for (const [storeId, receivedAt] of Object.entries(pending.storeRequestReceivedAt ?? {})) {
      this.storeRequestReceivedAt.set(storeId, receivedAt);
    }
    for (const [householdId, receivedAt] of Object.entries(pending.householdRequestReceivedAt ?? {})) {
      this.householdRequestReceivedAt.set(householdId, receivedAt);
    }
    if (pending.phaseStartedAt !== undefined) {
      this.phaseStartedAt = pending.phaseStartedAt;
    }
    this.lobbyMembershipFinalized = pending.lobbyMembershipFinalized;
    this.humanPlayers = pending.humanPlayerIds
      .map((id) => this.state.players.find((p) => p.id === id))
      .filter((player): player is PlayerState => player !== undefined);
  }

  /**
   * 현재 버퍼링된 제출값과 로비 확정 상태를 스냅숏으로 내보낸다(Milestone 5, D-032). Apps
   * Script처럼 요청이 끝나면 이 인스턴스가 사라지는 환경에서, 다음 요청이
   * `GameSession.resumeFromState(state, 이 값)`으로 이어받기 위한 것이다.
   */
  exportPendingSubmissions(): PendingSubmissionsSnapshot {
    return {
      companyInputs: Object.fromEntries(this.pendingCompanyInputs),
      storeRequests: Object.fromEntries(this.pendingStoreRequests),
      householdRequests: Object.fromEntries(this.pendingHouseholdRequests),
      acknowledgedRoundResultPlayerIds: [...this.acknowledgedRoundResultPlayerIds],
      humanPlayerIds: this.humanPlayers.map((p) => p.id),
      lobbyMembershipFinalized: this.lobbyMembershipFinalized,
      storeRequestReceivedAt: Object.fromEntries(this.storeRequestReceivedAt),
      householdRequestReceivedAt: Object.fromEntries(this.householdRequestReceivedAt),
      phaseStartedAt: this.phaseStartedAt,
    };
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  /**
   * 게임 상태 자체는 안 바뀌었지만 구독자에게 "뭔가 바뀌었다"고 알려야 할 때 쓴다
   * (Milestone 4 4단계, code-reviewer 발견 버그 수정). 다인원 로비(창업 준비) 상태는
   * `GameSession` 바깥의 서버 레지스트리(`src/server/sessionRegistry.ts`)에 있어 이 버전
   * 카운터에 자동으로 반영되지 않는다 — 교사가 "로비 지금 닫기"를 누르거나 로비가 시간초과로
   * 조용히 닫히면, `GameSession`은 전혀 안 바뀌었으므로 `notify()`가 저절로 불릴 일이 없다.
   * `?since=버전` 폴링이 그 시점을 놓치면, 아직 창업 준비를 못 낸 학생은 "로비가 닫혔다"는
   * 사실을 영원히 못 보고 대기 화면에 멈추게 된다 — 서버가 그런 지점에서 이 메서드를 호출해
   * 폴링 클라이언트에게 "다시 조회해라"고 알린다.
   */
  bumpVersion(): void {
    this.notify();
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

  /**
   * 이 세션의 제출 제한시간 설정 (구매 매칭 알고리즘 재설계 Stage 2). 서버 계층
   * (`src/server/httpApi.ts`의 `checkAndApplyTimeout`)이 폴링 기반 하드 타임아웃
   * 강제진행의 실제 마감시간·활성화 여부를 판단할 때 이 값을 읽어야 한다 — 교사가
   * 세션 생성 시 넘긴 값이 여기 그대로 반영돼 있으므로, 서버가 별도의 고정 상수
   * (`DEFAULT_SUBMISSION_TIMEOUT_MS`)만 참조하면 교사 설정이 실제 강제진행 시점에
   * 반영되지 않는 불일치가 생긴다.
   */
  getSubmissionTimeoutSettings(): SubmissionTimeoutSettings {
    return this.timeoutSettings;
  }

  /**
   * @deprecated 다인원(`studentCount > 1`) 세션에서는 어떤 학생을 가리키는지 모호하므로
   * 쓰지 마라 — 대신 `getPlayers()`로 전원을 받아 화면/참가자별로 다뤄라. 이 세션이 정확히
   * 학생 1명짜리일 때만 그 학생을 반환한다. 다인원인데도 이 메서드가 조용히 첫 번째 학생을
   * 반환하면, 호출부가 실수로 그 한 명만 계속 조종하는 버그를 알아채기 어렵다고 판단해
   * 명시적으로 에러를 던진다.
   */
  getHumanPlayer(): Readonly<PlayerState> {
    if (this.humanPlayers.length !== 1) {
      throw new Error(
        `getHumanPlayer() only supports a single-human session (this session has ${this.humanPlayers.length}); use getPlayers() instead`,
      );
    }
    return this.humanPlayers[0]!;
  }

  /** 이 세션에서 사람이 조종하는 학생 전원. 다인원 UI(로비, 참가자별 화면 라우팅 등)는 이걸 써야 한다. */
  getPlayers(): readonly PlayerState[] {
    return this.humanPlayers;
  }

  /** 현재 phase에 필요한 제출 중 아직 안 된 게 있는지. 사람 입력이 필요 없는 phase는 항상 false. */
  isWaitingForHumanInput(): boolean {
    return this.getUnsubmittedParticipantIds().length > 0;
  }

  /**
   * 현재 phase에서 제출이 필요한데 아직 제출하지 않은 참가자 id 목록. 사람 입력이 필요 없는
   * phase에서는 항상 빈 배열이다. 지금은 `isWaitingForHumanInput()`의 근거로만 쓰이지만,
   * 향후 "누가 아직 제출 안 했는지" 보여주는 UI나 제출 타임아웃 로직(Milestone 4 3단계)이
   * 이 메서드를 그대로 재사용할 수 있도록 미리 만들어 둔다.
   */
  getUnsubmittedParticipantIds(): ParticipantId[] {
    switch (this.state.currentPhase) {
      case "company-turn":
        return this.humanPlayers.map((p) => p.companyId).filter((id) => !this.pendingCompanyInputs.has(id));
      case "store-turn":
        return this.humanPlayers.map((p) => p.storeId).filter((id) => !this.pendingStoreRequests.has(id));
      case "household-turn":
        return this.humanPlayers.map((p) => p.householdId).filter((id) => !this.pendingHouseholdRequests.has(id));
      case "round-result":
        return this.humanPlayers.map((p) => p.id).filter((id) => !this.acknowledgedRoundResultPlayerIds.has(id));
      default:
        return [];
    }
  }

  submitCompanyDecision(companyId: ParticipantId, input: CompanyDecisionInput): void {
    this.assertPhase("company-turn");
    if (!this.humanPlayers.some((p) => p.companyId === companyId)) {
      throw new Error(`Unknown or non-human companyId "${companyId}"`);
    }
    this.pendingCompanyInputs.set(companyId, input);
    this.notify();
  }

  submitStoreDecision(storeId: ParticipantId, input: StoreDecisionInput): void {
    this.assertPhase("store-turn");
    if (!this.humanPlayers.some((p) => p.storeId === storeId)) {
      throw new Error(`Unknown or non-human storeId "${storeId}"`);
    }
    this.pendingStoreRequests.set(storeId, input);
    this.storeRequestReceivedAt.set(storeId, Date.now());
    this.notify();
  }

  submitHouseholdPurchases(householdId: ParticipantId, requests: CategoryPurchaseRequest[]): void {
    this.assertPhase("household-turn");
    if (!this.humanPlayers.some((p) => p.householdId === householdId)) {
      throw new Error(`Unknown or non-human householdId "${householdId}"`);
    }
    this.pendingHouseholdRequests.set(householdId, requests);
    this.householdRequestReceivedAt.set(householdId, Date.now());
    this.notify();
  }

  /**
   * round-result phase에서 이 학생이 결과를 확인했음을 표시한다 (D-030). 결정값을 담는
   * 다른 `submit*` 메서드와 달리 값 없이 "확인함" 여부만 기록한다.
   */
  acknowledgeRoundResult(playerId: ParticipantId): void {
    this.assertPhase("round-result");
    if (!this.humanPlayers.some((p) => p.id === playerId)) {
      throw new Error(`Unknown or non-human playerId "${playerId}"`);
    }
    this.acknowledgedRoundResultPlayerIds.add(playerId);
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
      this.pendingCompanyInputs.clear();
      this.pendingStoreRequests.clear();
      this.pendingHouseholdRequests.clear();
      this.acknowledgedRoundResultPlayerIds.clear();
      this.storeRequestReceivedAt.clear();
      this.householdRequestReceivedAt.clear();
      // advancePhase() 호출 자체가 항상 "한 phase 실행 + 다음 phase로 전환"을 의미하므로,
      // "phase가 실제로 바뀌었을 때만" 갱신하는 가드는 필요 없다 — 매번 무조건 갱신한다.
      this.phaseStartedAt = Date.now();
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

  /**
   * 사람 입력이 필요 없는 phase를 자동으로 끝까지 진행한다(Milestone 4 2단계: 로컬 폴링
   * 서버가 클라이언트 없이 조용한 phase를 드레인하기 위한 것 — `src/ui/App.tsx`의
   * `SILENT_AUTO_PHASES` 정책과 같은 결과를 만들지만, 그 UI 이펙트 경로는 이 메서드를 쓰지
   * 않고 그대로 둔다). 현재 phase가 사람 입력을 기다리는 중이면(`isWaitingForHumanInput()`)
   * 아무것도 하지 않고 즉시 반환한다 — `force`는 그 다음부터 만나는 phase에마다 적용된다.
   */
  async advanceUntilInputRequired(force = false): Promise<void> {
    while (!this.isGameOver() && !this.isWaitingForHumanInput()) {
      await this.advancePhase(force);
    }
  }

  private isGameOver(): boolean {
    return this.state.currentRound > this.state.config.totalRounds;
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

export type { AutoFillPreference, PriorityPurchasePick, StorePurchaseRequest } from "../economy/humanDecisions.js";
export type { CategoryPurchaseRequest, CompanyDecisionInput, ParticipantId, StoreDecisionInput, SubmissionTimeoutSettings };
