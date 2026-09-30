/**
 * Headless Economy Simulator (Milestone 1) 진입점.
 *
 * 사람 입력 없이 학생 소유 참여자와 NPC를 모두 규칙 기반 정책(src/npc/decisions.ts)으로
 * 자동 진행시켜 7라운드를 완주한다. Milestone 2에서 실제 UI가 생기면, 학생 소유
 * 참여자에 한해 여기서 쓰는 자동 결정 대신 실제 입력을 주입하도록 교체하면 된다
 * (엔진/시장/정산 로직은 그대로 재사용 가능하도록 설계했다).
 */
import {
  ALL_STRATEGIES,
  COSTS,
  DISTRICT_IDS,
  ESSENTIAL_CATEGORY_IDS,
  essentialSatisfactionPenalty,
  PRODUCT_CATEGORIES,
  STORE_STRATEGY_PRESETS,
} from "../economy/config.js";
import { incomeEventBudgetMultiplier } from "../economy/incomeEvent.js";
import { cityRent, deliveredListings, recordTransport } from "../economy/city.js";
import { eligibleRetailListingsForHousehold, eligibleWholesaleListingsForStore, blendQuality } from "../economy/market.js";
import { getActiveMarketEvent, marketEventCostMultiplierFor } from "../economy/marketEvents.js";
import { getActiveTrendEvent } from "../economy/trendEvent.js";
import { computeCategoryClearingSummary } from "../economy/marketStats.js";
import { createRng, rngPick, shuffle, type Rng } from "../economy/rng.js";
import { applyFixedCosts, chargeCapped, chargeDiscretionary, credit } from "../economy/settlement.js";
import {
  resolveCompanyAdvertising,
  resolveCompanyDecision,
  resolveCompanyIndustrySwitch,
  resolveHouseholdPurchases,
  resolveStoreAdvertising,
  resolveStoreCategorySwitch,
  resolveStorePurchases,
  type CategoryPurchaseRequest,
  type CompanyDecisionInput,
  type StorePurchaseRequest,
} from "../economy/humanDecisions.js";
import {
  decideCompanyAdvertising,
  decideCompanyIndustrySwitch,
  decideCompanyMarketEventSwitch,
  MAX_HOUSEHOLD_PURCHASE_UNITS,
  decideStoreAdvertising,
  decideStorePurchases,
  decideStoreSpecialtyDeviation,
} from "../npc/decisions.js";
import { planNpcBackfill } from "../npc/backfill.js";
import type {
  RoundAccumulator,
  CategoryClearingSummary,
  CompanyState,
  GameState,
  HouseholdState,
  ParticipantId,
  ProductCategoryId,
  RoundMetrics,
  StoreState,
} from "../types/domain.js";
import { validateCart } from "../economy/cart.js";
import type { CartCheckout, CartLine } from "../types/domain.js";
import { PhaseHandlers, RoundEngine } from "./RoundEngine.js";

function makeLedger(cash: number) {
  return { cash, cumulativeProfit: 0 };
}

/** 학생 소유 기업/가게/가계와 NPC 기업/가게/소비자를 모두 채운 초기 GameState를 만든다. */
export function buildInitialGameState(studentCount: number, rngSeed: number): GameState {
  if (studentCount < 1) {
    throw new Error("studentCount must be at least 1");
  }
  const rng = createRng(rngSeed);

  const players: GameState["players"] = [];
  const companies: Record<ParticipantId, CompanyState> = {};
  const stores: Record<ParticipantId, StoreState> = {};
  const households: Record<ParticipantId, HouseholdState> = {};
  const studentCompanyCategories: ProductCategoryId[] = [];
  const studentStoreCategories: ProductCategoryId[] = [];

  for (let i = 0; i < studentCount; i += 1) {
    const playerId = `student-${i + 1}`;
    const companyId = `${playerId}-company`;
    const storeId = `${playerId}-store`;
    const householdId = `${playerId}-household`;

    const companyCategory = PRODUCT_CATEGORIES[i % PRODUCT_CATEGORIES.length]!;
    const storeCategory = PRODUCT_CATEGORIES[(i + 1) % PRODUCT_CATEGORIES.length]!;
    studentCompanyCategories.push(companyCategory);
    studentStoreCategories.push(storeCategory);

    players.push({ id: playerId, displayName: `Student ${i + 1}`, companyId, storeId, householdId });

    companies[companyId] = {
      id: companyId,
      ownerId: playerId,
      kind: "student",
      districtId: DISTRICT_IDS[i % DISTRICT_IDS.length]!,
      ledger: makeLedger(COSTS.initialCashCompany),
      strategyId: rngPick(rng, ALL_STRATEGIES),
      productCategoryId: companyCategory,
      quality: 0,
      inventoryQuantity: 0,
      lastWholesalePrice: 0,
      lastIndustrySwitchRound: null,
      isAdvertisingActive: false,
    };

    stores[storeId] = {
      id: storeId,
      ownerId: playerId,
      kind: "student",
      districtId: DISTRICT_IDS[(i + 2) % DISTRICT_IDS.length]!,
      ledger: makeLedger(COSTS.initialCashStore),
      strategyId: rngPick(rng, ALL_STRATEGIES),
      specialtyCategoryId: storeCategory,
      currentSellingCategoryId: null,
      inventoryQuantity: 0,
      inventoryQuality: 0,
      retailPrice: 0,
      lastSellingCategoryChangeRound: null,
      isAdvertisingActive: false,
    };

    households[householdId] = {
      id: householdId,
      ownerId: playerId,
      kind: "student",
      ledger: makeLedger(0),
      strategyId: rngPick(rng, ALL_STRATEGIES),
      budgetPerRound: COSTS.householdBudgetPerRound,
      satisfactionScore: 0,
    };
  }

  const plan = planNpcBackfill(studentCount, studentCompanyCategories, studentStoreCategories, rng);

  plan.npcCompanies.forEach((slot, index) => {
    const id = `npc-company-${index + 1}`;
    companies[id] = {
      id,
      ownerId: id,
      kind: "npc",
      districtId: slot.districtId,
      ledger: makeLedger(COSTS.initialCashCompany),
      strategyId: slot.strategyId,
      productCategoryId: slot.categoryId,
      quality: 0,
      inventoryQuantity: 0,
      lastWholesalePrice: 0,
      lastIndustrySwitchRound: null,
      isAdvertisingActive: false,
    };
  });

  plan.npcStores.forEach((slot, index) => {
    const id = `npc-store-${index + 1}`;
    stores[id] = {
      id,
      ownerId: id,
      kind: "npc",
      districtId: slot.districtId,
      ledger: makeLedger(COSTS.initialCashStore),
      strategyId: slot.strategyId,
      specialtyCategoryId: slot.categoryId,
      currentSellingCategoryId: null,
      inventoryQuantity: 0,
      inventoryQuality: 0,
      retailPrice: 0,
      lastSellingCategoryChangeRound: null,
      isAdvertisingActive: false,
    };
  });

  plan.npcConsumers.forEach((slot, index) => {
    const id = `npc-consumer-${index + 1}`;
    households[id] = {
      id,
      ownerId: id,
      kind: "npc",
      ledger: makeLedger(0),
      strategyId: slot.strategyId,
      budgetPerRound: COSTS.householdBudgetPerRound,
      satisfactionScore: 0,
    };
  });

  return {
    config: { totalRounds: 7, studentPlayerIds: players.map((p) => p.id), rngSeed },
    currentRound: 1,
    currentPhase: "company-turn",
    players,
    companies,
    stores,
    households,
    wholesaleListings: [],
    retailListings: [],
    roundMetrics: [],
  };
}


function freshAccumulator(): RoundAccumulator {
  return {
    cashSnapshotCompany: {},
    cashSnapshotStore: {},
    wholesaleRevenueByCompany: {},
    retailRevenueByStore: {},
    wholesaleVolume: 0,
    wholesaleValue: 0,
    retailVolume: 0,
    retailValue: 0,
    companyUnitsProduced: {},
    companyUnitsSoldWholesale: {},
    storeUnitsPurchased: {},
    storeWholesaleSpend: {},
    storeUnitsSoldRetail: {},
    storeSpendByCompany: {},
    householdSpend: {},
    householdUnitsBought: {},
    householdSpendByCategory: {},
    householdEssentialCategoriesMissed: {},
    roundStartRetailListings: null,
    roundStartWholesaleListings: null,
  };
}

/**
 * 사람이 특정 참여자를 대신 조종할 때 쓰는 결정 소스. 함수가 undefined를 반환하면(또는
 * decisionSource 자체가 없으면) 항상 기존 봇 정책으로 그대로 넘어간다 — 즉, decisionSource를
 * 주지 않는 `createAutoPlayPhaseHandlers(rng)` 호출은 이 변경 전과 완전히 동일하게 동작한다
 * (tests/simulation의 결정론 회귀 테스트, scripts/simulate-class.ts 출력 비교로 확인).
 */
export interface StoreDecisionInput {
  /**
   * 구매 매칭 알고리즘 재설계(Stage 1) — 생략하면 이번 라운드 도매 매입 자체를 하지 않는다
   * ("안 삼", 봇 위임이 아니다). 봇 위임 여부는 이 StoreDecisionInput 객체 자체(=이 가게의
   * getStorePurchaseRequest 반환값)가 undefined인지로만 결정된다 — 사람이 실제로 제출했지만
   * 이 필드만 비운 경우는 "이번 라운드는 안 사기로 선택"이다.
   */
  purchaseRequest?: StorePurchaseRequest;
  /** 사람이 직접 정한 소매 판매가 (docs/GAME_RULES.md 1절). 생략하면 기존 자동 계산을 쓴다. */
  retailPrice?: number;
  /**
   * 학생이 이번 라운드 판매 카테고리를 바꾸고 싶을 때만 넣는다 (Milestone 6,
   * docs/DECISIONS.md D-033). 생략하면 "변경하지 않기로 선택"으로 취급한다 —
   * CompanyDecisionInput.switchToCategoryId와 동일한 원칙(humanInput 자체가 undefined인
   * 경우에만 봇 전환 로직이 대신 실행된다).
   */
  sellingCategoryId?: ProductCategoryId;
  /**
   * 학생이 이번 라운드 광고를 신청하고 싶을 때만 넣는다 (Milestone 6, docs/DECISIONS.md
   * D-040). 생략하거나 false면 "광고 안 함"이며, MIN_ROUND_FOR_ADVERTISING 미만이면 어차피
   * 무시된다.
   */
  advertise?: boolean;
}

/**
 * 제출 제한시간(선택적) + NPC 순차진입 설정 (구매 매칭 알고리즘 재설계 Stage 1). 이번 Stage는
 * 교사가 UI로 이 값을 바꾸는 것까지는 다루지 않는다 — src/multiplayer/GameSession.ts가
 * 하드코딩된 기본값(DEFAULT_LOCAL_SUBMISSION_TIMEOUT_SETTINGS)만 제공한다.
 */
export interface SubmissionTimeoutSettings {
  enabled: boolean;
  timeoutMs: number;
  npcGraduatedEntryEnabled: boolean;
}

/**
 * NPC 순차진입 윈도우가 시작되는 지점(phase 시작 후 timeoutMs에 대한 비율). v1 고정
 * 잠정값 — 교사 설정 대상이 아니다(CLAUDE.md 4절 승인 절차 없이 조정하지 않는다).
 */
export const NPC_GRADUATED_ENTRY_START_RATIO = 0.5;

export interface HumanDecisionSource {
  getCompanyInput(companyId: ParticipantId): CompanyDecisionInput | undefined;
  getStorePurchaseRequest(storeId: ParticipantId): StoreDecisionInput | undefined;
  getHouseholdPurchaseRequest(householdId: ParticipantId): readonly CategoryPurchaseRequest[] | undefined;
  /** 이 참여자의 이번 phase 제출이 실제로 접수된 시각(ms). 제출이 없었으면 undefined. */
  getStoreSubmissionReceivedAt(storeId: ParticipantId): number | undefined;
  getHouseholdSubmissionReceivedAt(householdId: ParticipantId): number | undefined;
  /** 현재 phase가 시작된 시각(ms) — NPC 순차진입 가상 시각 계산의 기준점. */
  getPhaseStartedAt(): number;
  getSubmissionTimeoutSettings(): SubmissionTimeoutSettings;
}

/**
 * 가게/가계 턴의 참여자 처리 순서를 정한다 (구매 매칭 알고리즘 재설계 Stage 1). 실제 시장처럼
 * "먼저 제출한 사람이 유리하다"는 원칙을 구현한다:
 * - `decisionSource`가 아예 없으면(헤드리스 시뮬레이터 경로) 기존과 완전히 동일하게 순수
 *   `shuffle`만 쓴다 — 이 분기는 반드시 무변경으로 유지해야 한다(회귀 게이트).
 * - 사람 중 실제로 제출한 참여자는 제출 시각 오름차순으로 먼저 처리한다.
 * - 제출하지 않은 나머지(주로 NPC, 또는 제출 안 한 사람)는 셔플한 뒤, "NPC 순차진입"이 꺼져
 *   있으면(설정 자체가 꺼졌거나 `npcGraduatedEntryEnabled=false`) 셔플 순서 그대로 제출자
 *   다음에 배치한다. 켜져 있으면 phase 시작 후 `timeoutMs * NPC_GRADUATED_ENTRY_START_RATIO`
 *   시점부터 `timeoutMs`까지 균등하게 퍼진 "가상 제출 시각"을 부여해, 실제 제출 시각과 함께
 *   전체를 다시 시각순으로 정렬한다(즉, 아주 늦게 제출한 사람보다 일찍 진입한 NPC가 앞설 수도
 *   있다).
 * - "제출 제한시간을 끔"(`enabled=false`)도 순서 개념 자체를 없애지 않는다 — 사람 실제 시각순
 *   먼저 + NPC 셔플 순서 나중이라는 동일한 분기를 그대로 탄다(사용자 확정 사항).
 */
export function orderBuyersForTurn<Id extends ParticipantId>(
  ids: readonly Id[],
  rng: Rng,
  decisionSource: HumanDecisionSource | undefined,
  hasHumanSubmission: (id: Id) => boolean,
  submissionReceivedAt: (id: Id) => number | undefined,
): Id[] {
  if (decisionSource === undefined) {
    return shuffle(rng, ids);
  }

  const submitted: Id[] = [];
  const rest: Id[] = [];
  for (const id of ids) {
    (hasHumanSubmission(id) ? submitted : rest).push(id);
  }
  const shuffledRest = shuffle(rng, rest);

  const settings = decisionSource.getSubmissionTimeoutSettings();
  const useGraduatedEntry = settings.enabled && settings.npcGraduatedEntryEnabled && shuffledRest.length > 0;

  if (!useGraduatedEntry) {
    submitted.sort((a, b) => (submissionReceivedAt(a) ?? Infinity) - (submissionReceivedAt(b) ?? Infinity));
    return [...submitted, ...shuffledRest];
  }

  const phaseStartedAt = decisionSource.getPhaseStartedAt();
  const windowStart = phaseStartedAt + settings.timeoutMs * NPC_GRADUATED_ENTRY_START_RATIO;
  const windowDuration = settings.timeoutMs * (1 - NPC_GRADUATED_ENTRY_START_RATIO);
  const virtualAt = new Map<Id, number>(
    shuffledRest.map((id, index) => [id, windowStart + windowDuration * (index / shuffledRest.length)]),
  );
  const merged = [...submitted, ...shuffledRest];
  merged.sort((a, b) => (submissionReceivedAt(a) ?? virtualAt.get(a)!) - (submissionReceivedAt(b) ?? virtualAt.get(b)!));
  return merged;
}

/**
 * 참여자별로 사람 입력이 있으면 그것을, 없으면 규칙 기반 봇 정책을 쓰는 phase handler 세트.
 * `decisionSource`를 생략하면 전원이 봇으로 자동 진행된다 (Milestone 1 헤드리스 시뮬레이터가
 * 쓰는 경로, `createAutoPlayPhaseHandlers`가 이 형태로 호출한다). Milestone 2의
 * `src/multiplayer/GameSession`은 `decisionSource`를 넘겨 특정 참여자만 사람이 조종하게 한다.
 */
export function createPhaseHandlers(rng: Rng, decisionSource?: HumanDecisionSource) {
  let acc = freshAccumulator();

  function runCompanyTurn(state: GameState): void {
    acc = freshAccumulator();
    state.shopping = { round: state.currentRound, prepared: {}, units: {}, receipts: {} };
    for (const company of Object.values(state.companies)) {
      acc.cashSnapshotCompany[company.id] = company.ledger.cash;
      const fixed = applyFixedCosts(company.ledger, COSTS.baseLaborCostCompany, cityRent(state, company.id, "company", company.districtId).total);
      if (state.city) (state.city.costs[company.id] ??= { rent: 0, transport: 0 }).rent += fixed.rentPaid;

      // 업종 전환은 생산 결정보다 먼저 처리한다 — 전환이 확정되면 그 즉시 productCategoryId가
      // 바뀌고 재고/현금이 조정되므로, 이어지는 resolveCompanyDecision은 새 카테고리의 단가로
      // 생산량을 계산한다. 사람 입력이 아예 없는 완전 봇 참가자만 NPC 전환 로직을 탄다 — 사람이
      // 생산 입력은 냈지만 switchToCategoryId를 비운 경우는 resolveCompanyIndustrySwitch가
      // "전환하지 않기로 선택"으로 조용히 무시한다(봇이 학생의 선택을 뒤집지 않는다).
      //
      // 시장 변화 이벤트(Milestone 6 제안 C, docs/DECISIONS.md D-035) 대상 카테고리에 속한
      // 완전 봇 기업은 D-033의 확률적 전환 대신 결정론적 손익비교 전환(decideCompanyMarketEventSwitch)
      // 을 탄다 — 두 봇 전환 로직은 상호 배타적으로만 호출해야 한다(동시 호출 시 이중 전환/이중
      // 비용 차감 버그가 난다).
      const humanInput = decisionSource?.getCompanyInput(company.id);
      const marketEvent = getActiveMarketEvent(state.config.rngSeed, state.currentRound);
      if (humanInput === undefined) {
        if (marketEvent !== undefined && company.productCategoryId === marketEvent.categoryId) {
          decideCompanyMarketEventSwitch(company, state, marketEvent);
        } else {
          decideCompanyIndustrySwitch(company, state, rng);
        }
      } else {
        resolveCompanyIndustrySwitch(company, state.currentRound, humanInput.switchToCategoryId);
      }

      // 전환 처리가 끝난 "이후" 카테고리로 배율을 판정한다 — 전환해서 이벤트 카테고리를
      // 벗어났다면 배율은 자연히 1이 된다. marketEvent 자체는 순수 함수 결과라 재계산해도
      // 값이 같으므로 위에서 구한 값을 그대로 재사용한다.
      const costMultiplier =
        company.productCategoryId !== null
          ? marketEventCostMultiplierFor(company.productCategoryId, marketEvent)
          : 1;

      // 광고(Milestone 6, docs/DECISIONS.md D-040)는 업종 전환 다음, 생산 결정보다 먼저
      // 처리한다 — resolveCompanyDecision이 광고비 차감 "이후"의 company.ledger.cash를 읽어야
      // 생산량 계산에 광고비가 반영된다(순서가 핵심, D-033류 재발 방지). chargeDiscretionary가
      // 원장을 직접 mutate하므로 별도로 값을 전달할 필요는 없다.
      if (humanInput === undefined) {
        decideCompanyAdvertising(company, state.currentRound);
      } else {
        resolveCompanyAdvertising(company, state.currentRound, humanInput.advertise);
      }

      const decision = resolveCompanyDecision(company, company.ledger.cash, humanInput, rng, costMultiplier);
      if (decision === null || decision.quantity <= 0) continue;

      acc.companyUnitsProduced[company.id] = (acc.companyUnitsProduced[company.id] ?? 0) + decision.quantity;
      chargeDiscretionary(company.ledger, decision.productionCost);
      company.quality = blendQuality(company.inventoryQuantity, company.quality, decision.quantity, decision.quality);
      company.inventoryQuantity += decision.quantity;
      company.lastWholesalePrice = decision.wholesalePrice;
    }
    for (const store of Object.values(state.stores)) {
      acc.cashSnapshotStore[store.id] = store.ledger.cash;
    }
  }

  function runWholesaleMarketUpdate(state: GameState): void {
    state.wholesaleListings = [];
    for (const company of Object.values(state.companies)) {
      if (company.inventoryQuantity > 0 && company.productCategoryId !== null) {
        state.wholesaleListings.push({
          id: `wl-r${state.currentRound}-${company.id}`,
          companyId: company.id,
          categoryId: company.productCategoryId,
          quantityAvailable: company.inventoryQuantity,
          quality: company.quality,
          price: company.lastWholesalePrice,
        });
      }
    }
  }

  function runStoreTurn(state: GameState, cart?: { id: ParticipantId; checkout: CartCheckout }): void {
    if (acc.roundStartWholesaleListings === null) {
      acc.roundStartWholesaleListings = state.wholesaleListings.map((l) => ({ ...l }));
    }

    const orderedStoreIds = orderBuyersForTurn(
      Object.keys(state.stores),
      rng,
      decisionSource,
      (id) => decisionSource?.getStorePurchaseRequest(id) !== undefined,
      (id) => decisionSource?.getStoreSubmissionReceivedAt(id),
    );
    for (const storeId of cart ? [cart.id] : orderedStoreIds) {
      const store = state.stores[storeId]!;
      const prepared = state.shopping?.prepared[storeId] === true;
      const requested: StoreDecisionInput | undefined = cart ? cart.checkout : decisionSource?.getStorePurchaseRequest(store.id);
      if (prepared && !cart) {
        if (requested?.retailPrice !== undefined) store.retailPrice = Math.max(0, requested.retailPrice);
        continue;
      }
      if (!prepared) {
        const fixed = applyFixedCosts(store.ledger, COSTS.baseLaborCostStore, cityRent(state, store.id, "store", store.districtId).total);
        if (state.city) (state.city.costs[store.id] ??= { rent: 0, transport: 0 }).rent += fixed.rentPaid;

        // 판매 카테고리 변경(전문 업종 이탈)도 매입보다 먼저 처리한다 — 변경이 확정되면 그 즉시
        // currentSellingCategoryId가 바뀌고 재고가 리셋되므로, 이어지는 매입은 새 카테고리
        // 기준으로 이뤄진다. 사람 입력이 아예 없는 완전 봇 참가자만 NPC 전환 로직을 탄다(위
        // 기업 전환과 같은 원칙).
        if (requested === undefined) {
          decideStoreSpecialtyDeviation(store, state, rng);
        } else {
          resolveStoreCategorySwitch(store, state.currentRound, requested.sellingCategoryId);
        }

        // 광고(Milestone 6, docs/DECISIONS.md D-040)는 판매 카테고리 변경 다음, 매입 결정보다
        // 먼저 처리한다 — 기업 턴과 같은 순서 원칙(광고비 차감 이후의 store.ledger.cash를
        // 매입 예산으로 쓴다).
        if (requested === undefined) {
          decideStoreAdvertising(store, state.currentRound);
        } else {
          resolveStoreAdvertising(store, state.currentRound, requested.advertise);
        }

      }
      const eligible = deliveredListings(state, store.id, eligibleWholesaleListingsForStore(store, state.wholesaleListings, state.companies));
      // 봇 위임 여부는 requested(=이 가게의 StoreDecisionInput) 자체가 undefined인지로만
      // 판단한다 — requested가 있는데 purchaseRequest만 비어 있으면(사람이 실제로 제출했지만
      // 이번 라운드는 안 사기로 함) resolveStorePurchases가 "안 삼"으로 처리하며, 봇으로
      // 위임하지 않는다 (구매 매칭 알고리즘 재설계 Stage 1, 계약 정정).
      const decision = cart
        ? { purchases: validateCart(cart.checkout.lines, eligible.filter(l => l.categoryId === (store.currentSellingCategoryId ?? store.specialtyCategoryId)), store.ledger.cash) }
        : requested === undefined
          ? decideStorePurchases(store, store.ledger.cash, eligible, state.companies, rng)
          : resolveStorePurchases(store, store.ledger.cash, eligible, state.companies, requested.purchaseRequest, rng);

      if (cart && state.shopping) state.shopping.prepared[storeId] = true;
      let totalCost = 0;
      let totalQty = 0;
      for (const purchase of decision.purchases) {
        const listing = state.wholesaleListings.find((l) => l.id === purchase.listingId);
        const company = listing ? state.companies[listing.companyId] : undefined;
        if (!listing || !company) continue;

        const cost = purchase.quantity * purchase.unitPrice;
        chargeDiscretionary(store.ledger, cost);
        const goodsRevenue = purchase.quantity * listing.price;
        const distributionCost = state.city ? 0 : purchase.quantity * COSTS.wholesaleDistributionCostPerUnit;
        credit(company.ledger, goodsRevenue - distributionCost);
        recordTransport(state, company.id, store.id, purchase.quantity, "wholesale");

        acc.wholesaleRevenueByCompany[company.id] = (acc.wholesaleRevenueByCompany[company.id] ?? 0) + goodsRevenue;
        acc.wholesaleVolume += purchase.quantity;
        acc.wholesaleValue += goodsRevenue;
        acc.companyUnitsSoldWholesale[company.id] = (acc.companyUnitsSoldWholesale[company.id] ?? 0) + purchase.quantity;
        const spendByCompany = (acc.storeSpendByCompany[store.id] ??= {});
        spendByCompany[company.id] = (spendByCompany[company.id] ?? 0) + cost;

        store.inventoryQuality = blendQuality(store.inventoryQuantity, store.inventoryQuality, purchase.quantity, listing.quality);
        store.inventoryQuantity += purchase.quantity;
        listing.quantityAvailable -= purchase.quantity;
        company.inventoryQuantity -= purchase.quantity;

        totalCost += cost;
        totalQty += purchase.quantity;
      }

      if (totalQty > 0) {
        acc.storeUnitsPurchased[store.id] = (acc.storeUnitsPurchased[store.id] ?? 0) + totalQty;
        acc.storeWholesaleSpend[store.id] = (acc.storeWholesaleSpend[store.id] ?? 0) + totalCost;
      }

      // 사람이 직접 판매가격을 정했다면(가게의 핵심 결정, docs/GAME_RULES.md 1절) 그 값을
      // 그대로 쓴다 — 이번 라운드 매입이 없었어도(기존 재고 재가격 책정) 적용된다. 값을
      // 주지 않았으면(봇은 항상 여기 해당) 기존 자동 계산(매입원가×전략 마크업)을 쓴다 —
      // 헤드리스 시뮬레이터 회귀 없음.
      const humanRetailPrice = requested?.retailPrice;
      if (humanRetailPrice !== undefined) {
        store.retailPrice = Math.max(0, humanRetailPrice);
      } else if (totalQty > 0) {
        const preset = STORE_STRATEGY_PRESETS[store.strategyId];
        store.retailPrice = (totalCost / totalQty) * preset.priceMarkup;
      }
    }
  }

  function runRetailMarketUpdate(state: GameState): void {
    state.retailListings = [];
    for (const store of Object.values(state.stores)) {
      const sellingCategoryId = store.currentSellingCategoryId ?? store.specialtyCategoryId;
      if (store.inventoryQuantity > 0 && sellingCategoryId !== null && store.retailPrice > 0) {
        state.retailListings.push({
          id: `rl-r${state.currentRound}-${store.id}`,
          storeId: store.id,
          categoryId: sellingCategoryId,
          quantityAvailable: store.inventoryQuantity,
          quality: store.inventoryQuality,
          price: store.retailPrice,
        });
      }
    }
  }

  function runConsumerPurchases(state: GameState, householdIds: readonly ParticipantId[], cart?: CartLine[]): void {
    if (acc.roundStartRetailListings === null) {
      acc.roundStartRetailListings = state.retailListings.map((l) => ({ ...l }));
    }
    const roundStartListings = acc.roundStartRetailListings;
    const trendEvent = getActiveTrendEvent(state.config.rngSeed, state.currentRound);

    const orderedIds = orderBuyersForTurn(
      householdIds,
      rng,
      decisionSource,
      (id) => decisionSource?.getHouseholdPurchaseRequest(id) !== undefined,
      (id) => decisionSource?.getHouseholdSubmissionReceivedAt(id),
    );
    for (const householdId of orderedIds) {
      const household = state.households[householdId]!;
      const prepared = state.shopping?.prepared[householdId] === true;
      if (prepared && !cart) continue;
      if (!prepared) {
        credit(household.ledger, household.budgetPerRound * incomeEventBudgetMultiplier(state.currentRound));
        if (state.city) {
          const rent = chargeCapped(household.ledger, cityRent(state, household.id, "household").total);
          (state.city.costs[household.id] ??= { rent: 0, transport: 0 }).rent += rent;
        }

      }
      const eligible = deliveredListings(state, household.id, eligibleRetailListingsForHousehold(household, state.retailListings, state.stores));
      const requested = decisionSource?.getHouseholdPurchaseRequest(household.id);
      const decision = cart ? { purchases: validateCart(cart, eligible, household.ledger.cash, MAX_HOUSEHOLD_PURCHASE_UNITS - (state.shopping?.units[householdId] ?? 0)) } : resolveHouseholdPurchases(
        household,
        household.ledger.cash,
        eligible,
        state.stores,
        requested,
        rng,
        trendEvent,
      );

      if (cart && state.shopping) state.shopping.prepared[householdId] = true;
      const qualityHistory = (acc.householdQualityUnits ??= {});
      const categoryHistory = (acc.householdCategoryUnits ??= {});
      const satisfactionHistory = (acc.householdBaseSatisfaction ??= {});
      satisfactionHistory[householdId] ??= household.satisfactionScore;
      let qualityUnits = qualityHistory[householdId] ?? 0;
      let unitsBought = 0;
      const unitsByCategory: Partial<Record<ProductCategoryId, number>> = categoryHistory[householdId] ?? {};
      for (const purchase of decision.purchases) {
        const listing = state.retailListings.find((l) => l.id === purchase.listingId);
        const store = listing ? state.stores[listing.storeId] : undefined;
        if (!listing || !store) continue;

        const cost = purchase.quantity * purchase.unitPrice;
        chargeDiscretionary(household.ledger, cost);
        const goodsRevenue = purchase.quantity * listing.price;
        const distributionCost = state.city ? 0 : purchase.quantity * COSTS.retailDistributionCostPerUnit;
        credit(store.ledger, goodsRevenue - distributionCost);
        recordTransport(state, store.id, household.id, purchase.quantity, "retail");

        acc.retailRevenueByStore[store.id] = (acc.retailRevenueByStore[store.id] ?? 0) + goodsRevenue;
        acc.retailVolume += purchase.quantity;
        acc.retailValue += goodsRevenue;
        acc.storeUnitsSoldRetail[store.id] = (acc.storeUnitsSoldRetail[store.id] ?? 0) + purchase.quantity;

        listing.quantityAvailable -= purchase.quantity;
        store.inventoryQuantity -= purchase.quantity;
        qualityUnits += listing.quality * purchase.quantity;
        unitsBought += purchase.quantity;

        acc.householdSpend[householdId] = (acc.householdSpend[householdId] ?? 0) + cost;
        unitsByCategory[listing.categoryId] = (unitsByCategory[listing.categoryId] ?? 0) + purchase.quantity;
        const spendByCategory = (acc.householdSpendByCategory[householdId] ??= {});
        spendByCategory[listing.categoryId] = (spendByCategory[listing.categoryId] ?? 0) + cost;
      }

      acc.householdUnitsBought[householdId] = (acc.householdUnitsBought[householdId] ?? 0) + unitsBought;

      qualityHistory[householdId] = qualityUnits;
      categoryHistory[householdId] = unitsByCategory;
      const allUnits = acc.householdUnitsBought[householdId] ?? 0;
      const rawSatisfaction = allUnits > 0 ? qualityUnits / allUnits : 0;
      let essentialPenalty = 0;
      const missedEssentialCategories: ProductCategoryId[] = [];
      const eligibleAtRoundStart = eligibleRetailListingsForHousehold(household, roundStartListings, state.stores);
      for (const categoryId of ESSENTIAL_CATEGORY_IDS) {
        const wasAvailable = eligibleAtRoundStart.some((l) => l.categoryId === categoryId && l.quantityAvailable > 0);
        const bought = unitsByCategory[categoryId] ?? 0;
        if (wasAvailable && bought <= 0) {
          essentialPenalty += essentialSatisfactionPenalty(categoryId);
          missedEssentialCategories.push(categoryId);
        }
      }
      const roundSatisfaction = Math.max(0, rawSatisfaction - essentialPenalty);
      household.satisfactionScore = satisfactionHistory[householdId]! * 0.7 + roundSatisfaction * 0.3;
      acc.householdEssentialCategoriesMissed[householdId] = missedEssentialCategories;
    }
  }

  function runRoundSettlement(state: GameState): void {
    const companyProfit: Record<ParticipantId, number> = {};
    const companyMarketShare: Record<ParticipantId, number> = {};
    for (const company of Object.values(state.companies)) {
      const before = acc.cashSnapshotCompany[company.id] ?? company.ledger.cash;
      const delta = company.ledger.cash - before;
      companyProfit[company.id] = delta;
      company.ledger.cumulativeProfit += delta;
      const revenue = acc.wholesaleRevenueByCompany[company.id] ?? 0;
      companyMarketShare[company.id] = acc.wholesaleValue > 0 ? revenue / acc.wholesaleValue : 0;
    }

    const storeProfit: Record<ParticipantId, number> = {};
    const storeMarketShare: Record<ParticipantId, number> = {};
    for (const store of Object.values(state.stores)) {
      const before = acc.cashSnapshotStore[store.id] ?? store.ledger.cash;
      const delta = store.ledger.cash - before;
      storeProfit[store.id] = delta;
      store.ledger.cumulativeProfit += delta;
      const revenue = acc.retailRevenueByStore[store.id] ?? 0;
      storeMarketShare[store.id] = acc.retailValue > 0 ? revenue / acc.retailValue : 0;
    }

    const householdValues = Object.values(state.households);
    const averageHouseholdSatisfaction =
      householdValues.length > 0
        ? householdValues.reduce((sum, h) => sum + h.satisfactionScore, 0) / householdValues.length
        : 0;

    const companyUnitsProduced: Record<ParticipantId, number> = {};
    const companyUnitsSoldWholesale: Record<ParticipantId, number> = {};
    const companyRevenue: Record<ParticipantId, number> = {};
    for (const company of Object.values(state.companies)) {
      companyUnitsProduced[company.id] = acc.companyUnitsProduced[company.id] ?? 0;
      companyUnitsSoldWholesale[company.id] = acc.companyUnitsSoldWholesale[company.id] ?? 0;
      companyRevenue[company.id] = acc.wholesaleRevenueByCompany[company.id] ?? 0;
    }

    const storeUnitsPurchased: Record<ParticipantId, number> = {};
    const storeWholesaleSpend: Record<ParticipantId, number> = {};
    const storeUnitsSoldRetail: Record<ParticipantId, number> = {};
    const storeRevenue: Record<ParticipantId, number> = {};
    const storeSupplierCount: Record<ParticipantId, number> = {};
    const storeTopSupplierSpendShare: Record<ParticipantId, number> = {};
    for (const store of Object.values(state.stores)) {
      storeUnitsPurchased[store.id] = acc.storeUnitsPurchased[store.id] ?? 0;
      storeWholesaleSpend[store.id] = acc.storeWholesaleSpend[store.id] ?? 0;
      storeUnitsSoldRetail[store.id] = acc.storeUnitsSoldRetail[store.id] ?? 0;
      storeRevenue[store.id] = acc.retailRevenueByStore[store.id] ?? 0;

      const spendByCompany = acc.storeSpendByCompany[store.id];
      const spends = spendByCompany !== undefined ? Object.values(spendByCompany) : [];
      const totalSpend = spends.reduce((sum, spend) => sum + spend, 0);
      storeSupplierCount[store.id] = spends.length;
      storeTopSupplierSpendShare[store.id] = totalSpend > 0 ? Math.max(...spends) / totalSpend : 0;
    }

    const householdSpend: Record<ParticipantId, number> = {};
    const householdUnitsBought: Record<ParticipantId, number> = {};
    const householdCategoryCount: Record<ParticipantId, number> = {};
    const householdTopCategorySpendShare: Record<ParticipantId, number> = {};
    const householdEssentialCategoriesMissed: Record<ParticipantId, ProductCategoryId[]> = {};
    for (const household of Object.values(state.households)) {
      householdSpend[household.id] = acc.householdSpend[household.id] ?? 0;
      householdUnitsBought[household.id] = acc.householdUnitsBought[household.id] ?? 0;

      const spendByCategory = acc.householdSpendByCategory[household.id];
      const categorySpends = spendByCategory !== undefined ? Object.values(spendByCategory) : [];
      const totalCategorySpend = categorySpends.reduce((sum, spend) => sum + (spend ?? 0), 0);
      householdCategoryCount[household.id] = spendByCategory !== undefined ? Object.keys(spendByCategory).length : 0;
      householdTopCategorySpendShare[household.id] =
        totalCategorySpend > 0 ? Math.max(...categorySpends.map((spend) => spend ?? 0)) / totalCategorySpend : 0;

      householdEssentialCategoriesMissed[household.id] = acc.householdEssentialCategoriesMissed[household.id] ?? [];
    }

    // 구매 매칭 알고리즘 재설계 Stage 1: 도매/소매 매물 스냅샷(라운드 시작 시점) 대 현재
    // 상태를 카테고리별로 비교한 시세 청산 요약. 새 수요/가격 공식이 아니라 스냅샷 비교만
    // 한다 (src/economy/marketStats.ts의 computeCategoryClearingSummary).
    const wholesaleBefore = acc.roundStartWholesaleListings ?? [];
    const retailBefore = acc.roundStartRetailListings ?? [];
    const wholesaleCategoryClearing: Partial<Record<ProductCategoryId, CategoryClearingSummary>> = {};
    const retailCategoryClearing: Partial<Record<ProductCategoryId, CategoryClearingSummary>> = {};
    for (const categoryId of PRODUCT_CATEGORIES) {
      const wholesaleSummary = computeCategoryClearingSummary(wholesaleBefore, state.wholesaleListings, categoryId);
      if (wholesaleSummary !== undefined) wholesaleCategoryClearing[categoryId] = wholesaleSummary;
      const retailSummary = computeCategoryClearingSummary(retailBefore, state.retailListings, categoryId);
      if (retailSummary !== undefined) retailCategoryClearing[categoryId] = retailSummary;
    }

    const metrics: RoundMetrics = {
      round: state.currentRound,
      ...(state.city ? { locationCosts: JSON.parse(JSON.stringify(state.city.costs)) as NonNullable<RoundMetrics["locationCosts"]> } : {}),
      companyProfit,
      storeProfit,
      companyMarketShare,
      storeMarketShare,
      totalWholesaleVolume: acc.wholesaleVolume,
      totalWholesaleValue: acc.wholesaleValue,
      totalRetailVolume: acc.retailVolume,
      totalRetailValue: acc.retailValue,
      averageHouseholdSatisfaction,
      companyUnitsProduced,
      companyUnitsSoldWholesale,
      companyRevenue,
      storeUnitsPurchased,
      storeWholesaleSpend,
      storeUnitsSoldRetail,
      storeRevenue,
      storeSupplierCount,
      storeTopSupplierSpendShare,
      householdSpend,
      householdUnitsBought,
      householdCategoryCount,
      householdTopCategorySpendShare,
      householdEssentialCategoriesMissed,
      wholesaleCategoryClearing,
      retailCategoryClearing,
    };
    state.roundMetrics.push(metrics);
  }

  function accounted(state: GameState, action: () => void): void {
    acc = state.roundAccounting ?? acc;
    action();
    state.roundAccounting = acc;
  }
  const handlers: PhaseHandlers = {
    "company-turn": runCompanyTurn,
    "wholesale-market-update": runWholesaleMarketUpdate,
    "store-turn": runStoreTurn,
    "retail-market-update": runRetailMarketUpdate,
    "household-turn": (state) => runConsumerPurchases(state, state.players.map((p) => p.householdId)),
    "npc-consumer-behavior": (state) =>
      runConsumerPurchases(
        state,
        Object.values(state.households)
          .filter((h) => h.kind === "npc")
          .map((h) => h.id),
      ),
    "round-settlement": runRoundSettlement,
  };
  for (const phase of Object.keys(handlers) as (keyof PhaseHandlers)[]) {
    const handler = handlers[phase]!;
    handlers[phase] = state => {
      accounted(state, () => handler(state));
      if (phase === "round-settlement") delete state.roundAccounting;
    };
  }
  return Object.assign(handlers, {
    checkoutStore: (state: GameState, id: ParticipantId, checkout: CartCheckout) => accounted(state, () => runStoreTurn(state, { id, checkout })),
    checkoutHousehold: (state: GameState, id: ParticipantId, checkout: CartCheckout) => accounted(state, () => runConsumerPurchases(state, [id], checkout.lines)),
  });
}

/**
 * 학생/NPC를 구분하지 않고 전원을 규칙 기반으로 자동 진행시키는 phase handler 세트.
 * `createPhaseHandlers(rng)`를 decisionSource 없이 호출하는 것과 완전히 동일하다 — 기존
 * 호출부(simulateGame, 이 함수를 직접 쓰던 코드)를 바꾸지 않기 위해 이름을 그대로 유지한다.
 */
export function createAutoPlayPhaseHandlers(rng: Rng): PhaseHandlers {
  return createPhaseHandlers(rng);
}

export interface SimulationResult {
  state: GameState;
}

/** Milestone 1 진입점: 학생 수만 지정하면 7라운드를 끝까지 자동 실행한다. */
export async function simulateGame(studentCount: number, rngSeed = 42): Promise<SimulationResult> {
  const state = buildInitialGameState(studentCount, rngSeed);
  const rng = createRng(rngSeed + 1);
  const engine = new RoundEngine(state, createAutoPlayPhaseHandlers(rng));
  await engine.runGame();
  return { state };
}
