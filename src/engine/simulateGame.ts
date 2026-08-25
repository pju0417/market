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
  DISTRICTS,
  DISTRICT_IDS,
  PRODUCT_CATEGORIES,
  STORE_STRATEGY_PRESETS,
} from "../economy/config.js";
import { eligibleRetailListingsForHousehold, eligibleWholesaleListingsForStore, blendQuality } from "../economy/market.js";
import { createRng, rngPick, shuffle, type Rng } from "../economy/rng.js";
import { applyFixedCosts, chargeDiscretionary, credit } from "../economy/settlement.js";
import { planNpcBackfill } from "../npc/backfill.js";
import { decideCompanyProduction, decideHouseholdPurchases, decideStorePurchases } from "../npc/decisions.js";
import type {
  CompanyState,
  GameState,
  HouseholdState,
  ParticipantId,
  ProductCategoryId,
  RoundMetrics,
  StoreState,
} from "../types/domain.js";
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
    };

    stores[storeId] = {
      id: storeId,
      ownerId: playerId,
      kind: "student",
      districtId: DISTRICT_IDS[(i + 2) % DISTRICT_IDS.length]!,
      ledger: makeLedger(COSTS.initialCashStore),
      strategyId: rngPick(rng, ALL_STRATEGIES),
      specialtyCategoryId: storeCategory,
      inventoryQuantity: 0,
      inventoryQuality: 0,
      retailPrice: 0,
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
      inventoryQuantity: 0,
      inventoryQuality: 0,
      retailPrice: 0,
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

interface RoundAccumulator {
  cashSnapshotCompany: Record<ParticipantId, number>;
  cashSnapshotStore: Record<ParticipantId, number>;
  wholesaleRevenueByCompany: Record<ParticipantId, number>;
  retailRevenueByStore: Record<ParticipantId, number>;
  wholesaleVolume: number;
  wholesaleValue: number;
  retailVolume: number;
  retailValue: number;
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
  };
}

/** 학생/NPC를 구분하지 않고 모든 참여자를 규칙 기반으로 자동 진행시키는 phase handler 세트. */
export function createAutoPlayPhaseHandlers(rng: Rng): PhaseHandlers {
  let acc = freshAccumulator();

  function runCompanyTurn(state: GameState): void {
    acc = freshAccumulator();
    for (const company of Object.values(state.companies)) {
      acc.cashSnapshotCompany[company.id] = company.ledger.cash;
      const district = DISTRICTS[company.districtId];
      applyFixedCosts(company.ledger, COSTS.baseLaborCostCompany, COSTS.baseRentCompany * district.rentMultiplier);

      const decision = decideCompanyProduction(company, company.ledger.cash, rng);
      if (decision === null || decision.quantity <= 0) continue;

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

  function runStoreTurn(state: GameState): void {
    const orderedStoreIds = shuffle(rng, Object.keys(state.stores));
    for (const storeId of orderedStoreIds) {
      const store = state.stores[storeId]!;
      const district = DISTRICTS[store.districtId];
      applyFixedCosts(store.ledger, COSTS.baseLaborCostStore, COSTS.baseRentStore * district.rentMultiplier);

      const eligible = eligibleWholesaleListingsForStore(store, state.wholesaleListings, state.companies);
      const decision = decideStorePurchases(store, store.ledger.cash, eligible, rng);
      if (decision.purchases.length === 0) continue;

      let totalCost = 0;
      let totalQty = 0;
      for (const purchase of decision.purchases) {
        const listing = state.wholesaleListings.find((l) => l.id === purchase.listingId);
        const company = listing ? state.companies[listing.companyId] : undefined;
        if (!listing || !company) continue;

        const cost = purchase.quantity * purchase.unitPrice;
        chargeDiscretionary(store.ledger, cost);
        const distributionCost = purchase.quantity * COSTS.wholesaleDistributionCostPerUnit;
        credit(company.ledger, cost - distributionCost);

        acc.wholesaleRevenueByCompany[company.id] = (acc.wholesaleRevenueByCompany[company.id] ?? 0) + cost;
        acc.wholesaleVolume += purchase.quantity;
        acc.wholesaleValue += cost;

        store.inventoryQuality = blendQuality(store.inventoryQuantity, store.inventoryQuality, purchase.quantity, listing.quality);
        store.inventoryQuantity += purchase.quantity;
        listing.quantityAvailable -= purchase.quantity;
        company.inventoryQuantity -= purchase.quantity;

        totalCost += cost;
        totalQty += purchase.quantity;
      }

      if (totalQty > 0) {
        const preset = STORE_STRATEGY_PRESETS[store.strategyId];
        store.retailPrice = (totalCost / totalQty) * preset.priceMarkup;
      }
    }
  }

  function runRetailMarketUpdate(state: GameState): void {
    state.retailListings = [];
    for (const store of Object.values(state.stores)) {
      if (store.inventoryQuantity > 0 && store.specialtyCategoryId !== null && store.retailPrice > 0) {
        state.retailListings.push({
          id: `rl-r${state.currentRound}-${store.id}`,
          storeId: store.id,
          categoryId: store.specialtyCategoryId,
          quantityAvailable: store.inventoryQuantity,
          quality: store.inventoryQuality,
          price: store.retailPrice,
        });
      }
    }
  }

  function runConsumerPurchases(state: GameState, householdIds: readonly ParticipantId[]): void {
    const orderedIds = shuffle(rng, householdIds);
    for (const householdId of orderedIds) {
      const household = state.households[householdId]!;
      credit(household.ledger, household.budgetPerRound);

      const eligible = eligibleRetailListingsForHousehold(household, state.retailListings, state.stores);
      const decision = decideHouseholdPurchases(household, household.ledger.cash, eligible, rng);

      let qualityUnits = 0;
      let unitsBought = 0;
      for (const purchase of decision.purchases) {
        const listing = state.retailListings.find((l) => l.id === purchase.listingId);
        const store = listing ? state.stores[listing.storeId] : undefined;
        if (!listing || !store) continue;

        const cost = purchase.quantity * purchase.unitPrice;
        chargeDiscretionary(household.ledger, cost);
        const distributionCost = purchase.quantity * COSTS.retailDistributionCostPerUnit;
        credit(store.ledger, cost - distributionCost);

        acc.retailRevenueByStore[store.id] = (acc.retailRevenueByStore[store.id] ?? 0) + cost;
        acc.retailVolume += purchase.quantity;
        acc.retailValue += cost;

        listing.quantityAvailable -= purchase.quantity;
        store.inventoryQuantity -= purchase.quantity;
        qualityUnits += listing.quality * purchase.quantity;
        unitsBought += purchase.quantity;
      }

      const roundSatisfaction = unitsBought > 0 ? qualityUnits / unitsBought : 0;
      household.satisfactionScore = household.satisfactionScore * 0.7 + roundSatisfaction * 0.3;
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

    const metrics: RoundMetrics = {
      round: state.currentRound,
      companyProfit,
      storeProfit,
      companyMarketShare,
      storeMarketShare,
      totalWholesaleVolume: acc.wholesaleVolume,
      totalWholesaleValue: acc.wholesaleValue,
      totalRetailVolume: acc.retailVolume,
      totalRetailValue: acc.retailValue,
      averageHouseholdSatisfaction,
    };
    state.roundMetrics.push(metrics);
  }

  return {
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
