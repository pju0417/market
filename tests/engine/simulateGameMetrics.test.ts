/**
 * Milestone 3 1단계(전략 비서)가 의존하는 RoundMetrics 신규 계측 필드
 * (companyUnitsProduced / companyUnitsSoldWholesale / companyRevenue /
 * storeUnitsPurchased / storeWholesaleSpend / storeUnitsSoldRetail / storeRevenue)가
 * 실제 시뮬레이션 중간 상태와 정확히 일치하는지 손으로 계산 가능한 소규모 시나리오로 검증한다.
 *
 * 특히 "이번 라운드 생산량"과 "이번 라운드 도매 판매량"은 서로 다른 것을 센다 —
 * 재고가 이월되면 판매량이 생산량보다 커질 수도, 작을 수도 있다. 이 구분이 실제로
 * 지켜지는지 2라운드에 걸쳐 확인한다.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../../src/economy/rng.js";
import { RoundEngine } from "../../src/engine/RoundEngine.js";
import { buildInitialGameState, createPhaseHandlers, type HumanDecisionSource } from "../../src/engine/simulateGame.js";
import type { RetailListing } from "../../src/types/domain.js";

describe("simulateGame RoundMetrics instrumentation", () => {
  it("distinguishes unitsProduced from unitsSoldWholesale across a carryover round, and matches store-side purchase metrics exactly", async () => {
    const state = buildInitialGameState(2, 12345);
    const companyId = "student-1-company";
    const storeId = "student-2-store";
    // 두 참여자의 업종/전문분야를 강제로 맞춰서(자기거래는 아니므로 규칙 위반 없음) 손으로
    // 계산 가능한 시나리오를 만든다.
    state.companies[companyId]!.productCategoryId = "food";
    state.stores[storeId]!.specialtyCategoryId = "food";
    // 다른 모든 가게는 "food" 전문이 아니게 만든다 (NPC 백필 포함) — 그렇지 않으면 다른
    // "food" 전문 가게(봇)도 같은 매물을 사가서 손으로 계산한 판매량과 어긋난다.
    for (const store of Object.values(state.stores)) {
      if (store.id !== storeId && store.specialtyCategoryId === "food") {
        store.specialtyCategoryId = "toys";
      }
    }

    let round = 1;
    const decisionSource: HumanDecisionSource = {
      getCompanyInput: (id) => {
        if (id !== companyId) return undefined;
        if (round === 1) return { quantity: 10, quality: 0.8, wholesalePrice: 5 };
        if (round === 2) return { quantity: 5, quality: 0.8, wholesalePrice: 5 };
        return undefined;
      },
      getStorePurchaseRequest: (id) => {
        if (id !== storeId) return undefined;
        // round 1: 10개 생산 중 6개만 매입 -> 4개 재고 이월.
        if (round === 1) return { purchases: [{ listingId: `wl-r1-${companyId}`, quantity: 6 }] };
        // round 2: 이번 라운드 생산은 5개뿐이지만, 이월 재고(4개)까지 합쳐 9개를 전부 매입.
        if (round === 2) return { purchases: [{ listingId: `wl-r2-${companyId}`, quantity: 9 }] };
        return undefined;
      },
      getHouseholdPurchaseRequest: () => undefined,
    };

    const rng = createRng(999);
    const engine = new RoundEngine(state, createPhaseHandlers(rng, decisionSource));

    await engine.runRound();
    const m1 = state.roundMetrics[0]!;
    expect(m1.companyUnitsProduced[companyId]).toBe(10);
    expect(m1.companyUnitsSoldWholesale[companyId]).toBe(6);
    expect(m1.companyRevenue[companyId]).toBe(30); // 6개 * 5원
    expect(state.companies[companyId]!.inventoryQuantity).toBe(4); // 10 - 6 이월
    expect(m1.storeUnitsPurchased[storeId]).toBe(6);
    expect(m1.storeWholesaleSpend[storeId]).toBe(30);

    // RoundEngine.runRound()은 라운드 번호를 스스로 올리지 않는다 (runGame()/stepPhase()만
    // 올린다) — 손으로 두 번째 라운드를 밟으려면 직접 증가시켜야 한다. 이는 wl-r{round}- 라는
    // listing id 규칙과도 맞춰야 하는 부분이라 실수하기 쉬웠다.
    state.currentRound += 1;
    round = 2;
    await engine.runRound();
    const m2 = state.roundMetrics[1]!;
    expect(m2.companyUnitsProduced[companyId]).toBe(5); // 이번 라운드 생산량만
    // 이번 라운드 판매량(9)이 이번 라운드 생산량(5)보다 크다 — 이월 재고 덕분. 두 지표가
    // 서로 다른 것을 세고 있다는 것을 보여주는 핵심 단언.
    expect(m2.companyUnitsSoldWholesale[companyId]).toBe(9);
    expect(m2.companyRevenue[companyId]).toBe(45); // 9개 * 5원
    expect(state.companies[companyId]!.inventoryQuantity).toBe(0); // 4 + 5 - 9
    expect(m2.storeUnitsPurchased[storeId]).toBe(9);
    expect(m2.storeWholesaleSpend[storeId]).toBe(45);
  });

  it("storeRevenue/storeUnitsSoldRetail invariant holds for every store every round across class sizes (property check over a full game)", async () => {
    for (const studentCount of [1, 5, 10]) {
      const state = buildInitialGameState(studentCount, 777 + studentCount);
      const rng = createRng(778 + studentCount);
      const engine = new RoundEngine(state, createPhaseHandlers(rng));
      await engine.runGame();

      for (const metrics of state.roundMetrics) {
        for (const store of Object.values(state.stores)) {
          const units = metrics.storeUnitsSoldRetail[store.id] ?? 0;
          const revenue = metrics.storeRevenue[store.id] ?? 0;
          // 재고 없음/판매 없음이면 매출도 0이어야 한다 (음수 재고, 유령 매출 방지).
          if (units === 0) {
            expect(revenue).toBe(0);
          } else {
            expect(revenue).toBeGreaterThan(0);
          }
          expect(units).toBeGreaterThanOrEqual(0);
          expect(revenue).toBeGreaterThanOrEqual(0);
        }
        for (const company of Object.values(state.companies)) {
          const produced = metrics.companyUnitsProduced[company.id] ?? 0;
          const sold = metrics.companyUnitsSoldWholesale[company.id] ?? 0;
          const revenue = metrics.companyRevenue[company.id] ?? 0;
          expect(produced).toBeGreaterThanOrEqual(0);
          expect(sold).toBeGreaterThanOrEqual(0);
          if (sold === 0) {
            expect(revenue).toBe(0);
          } else {
            expect(revenue).toBeGreaterThan(0);
          }
        }
      }
      // 최종 재고는 절대 음수가 될 수 없다 (데이터 무결성).
      for (const company of Object.values(state.companies)) {
        expect(company.inventoryQuantity).toBeGreaterThanOrEqual(0);
      }
      for (const store of Object.values(state.stores)) {
        expect(store.inventoryQuantity).toBeGreaterThanOrEqual(0);
      }
    }
  });

  describe("storeSupplierCount / storeTopSupplierSpendShare (tester-added hand calc, D-005/D-006 adjacent metric)", () => {
    function isolatedThreeStudentState(seed: number) {
      const state = buildInitialGameState(3, seed);
      const companyAId = "student-1-company";
      const companyBId = "student-2-company";
      const targetStoreId = "student-3-store";

      state.companies[companyAId]!.productCategoryId = "food";
      state.companies[companyBId]!.productCategoryId = "food";
      state.stores[targetStoreId]!.specialtyCategoryId = "food";

      // 다른 가게들이 같은 매물을 먼저 사가지 않도록(턴 순서가 shuffle되므로) 격리한다 —
      // 기존 파일 상단 시나리오와 동일한 기법.
      for (const store of Object.values(state.stores)) {
        if (store.id !== targetStoreId && store.specialtyCategoryId === "food") {
          store.specialtyCategoryId = "toys";
        }
      }
      // 다른 기업이 우연히 food로 생산해 시장에 끼어들어도(봇 결정) 이번 테스트가 보는 것은
      // "target store가 실제로 지불한 companyId별 지출"뿐이므로 영향 없음 — 다만 명확성을
      // 위해 세 번째 기업도 다른 업종으로 고정한다.
      state.companies["student-3-company"]!.productCategoryId = "toys";

      return { state, companyAId, companyBId, targetStoreId };
    }

    it("computes supplierCount=2 and topSupplierSpendShare correctly when the store buys from two companies (6 units @5 from A, 4 units @4 from B)", async () => {
      const { state, companyAId, companyBId, targetStoreId } = isolatedThreeStudentState(31001);

      const decisionSource: HumanDecisionSource = {
        getCompanyInput: (id) => {
          if (id === companyAId) return { quantity: 20, quality: 0.8, wholesalePrice: 5 };
          if (id === companyBId) return { quantity: 20, quality: 0.7, wholesalePrice: 4 };
          return undefined;
        },
        getStorePurchaseRequest: (id) => {
          if (id !== targetStoreId) return undefined;
          return {
            purchases: [
              { listingId: `wl-r1-${companyAId}`, quantity: 6 },
              { listingId: `wl-r1-${companyBId}`, quantity: 4 },
            ],
          };
        },
        getHouseholdPurchaseRequest: () => undefined,
      };

      const rng = createRng(31002);
      const engine = new RoundEngine(state, createPhaseHandlers(rng, decisionSource));
      await engine.runRound();

      const m1 = state.roundMetrics[0]!;
      // 손계산: A에서 6개*5원=30원, B에서 4개*4원=16원, 총 46원. 최대 공급처(A) 비중 = 30/46.
      expect(m1.storeUnitsPurchased[targetStoreId]).toBe(10);
      expect(m1.storeWholesaleSpend[targetStoreId]).toBe(46);
      expect(m1.storeSupplierCount[targetStoreId]).toBe(2);
      expect(m1.storeTopSupplierSpendShare[targetStoreId]).toBeCloseTo(30 / 46, 10);
    });

    it("computes supplierCount=1 and topSupplierSpendShare=1.0 when the store buys from a single company only", async () => {
      const { state, companyAId, companyBId, targetStoreId } = isolatedThreeStudentState(31003);

      const decisionSource: HumanDecisionSource = {
        getCompanyInput: (id) => {
          if (id === companyAId) return { quantity: 20, quality: 0.8, wholesalePrice: 5 };
          if (id === companyBId) return { quantity: 20, quality: 0.7, wholesalePrice: 4 };
          return undefined;
        },
        getStorePurchaseRequest: (id) => {
          if (id !== targetStoreId) return undefined;
          return { purchases: [{ listingId: `wl-r1-${companyAId}`, quantity: 6 }] };
        },
        getHouseholdPurchaseRequest: () => undefined,
      };

      const rng = createRng(31004);
      const engine = new RoundEngine(state, createPhaseHandlers(rng, decisionSource));
      await engine.runRound();

      const m1 = state.roundMetrics[0]!;
      expect(m1.storeUnitsPurchased[targetStoreId]).toBe(6);
      expect(m1.storeWholesaleSpend[targetStoreId]).toBe(30);
      expect(m1.storeSupplierCount[targetStoreId]).toBe(1);
      expect(m1.storeTopSupplierSpendShare[targetStoreId]).toBe(1);
    });

    it("computes supplierCount=0 and topSupplierSpendShare=0 when the store buys nothing at all", async () => {
      const { state, companyAId, companyBId, targetStoreId } = isolatedThreeStudentState(31005);

      const decisionSource: HumanDecisionSource = {
        getCompanyInput: (id) => {
          if (id === companyAId) return { quantity: 20, quality: 0.8, wholesalePrice: 5 };
          if (id === companyBId) return { quantity: 20, quality: 0.7, wholesalePrice: 4 };
          return undefined;
        },
        getStorePurchaseRequest: (id) => {
          if (id !== targetStoreId) return undefined;
          return { purchases: [] };
        },
        getHouseholdPurchaseRequest: () => undefined,
      };

      const rng = createRng(31006);
      const engine = new RoundEngine(state, createPhaseHandlers(rng, decisionSource));
      await engine.runRound();

      const m1 = state.roundMetrics[0]!;
      expect(m1.storeUnitsPurchased[targetStoreId]).toBe(0);
      expect(m1.storeWholesaleSpend[targetStoreId]).toBe(0);
      expect(m1.storeSupplierCount[targetStoreId]).toBe(0);
      expect(m1.storeTopSupplierSpendShare[targetStoreId]).toBe(0);
    });
  });

  describe("household essential-category satisfaction penalty and consumption metrics (D-024)", () => {
    /**
     * These scenarios drive only the "household-turn" + "round-settlement" handlers directly
     * (skipping company/store phases) so we can hand-build state.retailListings and fully
     * control what "was available in the market" without NPC interference. studentCount=1
     * means only the target household is processed by "household-turn" (NPC households are
     * only processed by "npc-consumer-behavior", which we never call).
     */
    function setup(seed: number) {
      const state = buildInitialGameState(1, seed);
      const householdId = "student-1-household";
      const sellerStoreId = Object.values(state.stores).find((s) => s.kind === "npc")!.id;
      return { state, householdId, sellerStoreId };
    }

    function listing(
      id: string,
      storeId: string,
      categoryId: RetailListing["categoryId"],
      overrides: Partial<RetailListing> = {},
    ): RetailListing {
      return { id, storeId, categoryId, quantityAvailable: 10, quality: 0.5, price: 5, ...overrides };
    }

    it("flags only food as missed when food is available but the household buys something else instead", async () => {
      const { state, householdId, sellerStoreId } = setup(41001);
      state.retailListings = [
        listing("rl-food", sellerStoreId, "food", { price: 5, quality: 0.9 }),
        listing("rl-toys", sellerStoreId, "toys", { price: 5, quality: 1.0 }),
      ];
      const decisionSource: HumanDecisionSource = {
        getCompanyInput: () => undefined,
        getStorePurchaseRequest: () => undefined,
        getHouseholdPurchaseRequest: (id) =>
          id === householdId ? [{ listingId: "rl-toys", quantity: 1 }] : undefined,
      };

      const rng = createRng(41002);
      const handlers = createPhaseHandlers(rng, decisionSource);
      await handlers["household-turn"]!(state);
      await handlers["round-settlement"]!(state);

      const m1 = state.roundMetrics[0]!;
      expect(m1.householdEssentialCategoriesMissed[householdId]).toEqual(["food"]);
      expect(m1.householdSpend[householdId]).toBe(5);
      expect(m1.householdUnitsBought[householdId]).toBe(1);
      expect(m1.householdCategoryCount[householdId]).toBe(1);
      expect(m1.householdTopCategorySpendShare[householdId]).toBe(1);

      // hand calc: rawSatisfaction = 1.0 (bought only quality-1.0 toys), penalty = 0.2 (food
      // missed only, apparel exempt because it was never listed) => roundSatisfaction = 0.8,
      // satisfactionScore = 0*0.7 + 0.8*0.3 = 0.24.
      expect(state.households[householdId]!.satisfactionScore).toBeCloseTo(0.24, 10);
    });

    it("flags both food and apparel as missed when both are available but the household buys neither (penalty sums to 0.30)", async () => {
      const { state, householdId, sellerStoreId } = setup(41003);
      state.retailListings = [
        listing("rl-food", sellerStoreId, "food", { price: 5, quality: 0.9 }),
        listing("rl-apparel", sellerStoreId, "apparel", { price: 5, quality: 0.9 }),
        listing("rl-toys", sellerStoreId, "toys", { price: 5, quality: 1.0 }),
      ];
      const decisionSource: HumanDecisionSource = {
        getCompanyInput: () => undefined,
        getStorePurchaseRequest: () => undefined,
        getHouseholdPurchaseRequest: (id) =>
          id === householdId ? [{ listingId: "rl-toys", quantity: 1 }] : undefined,
      };

      const rng = createRng(41004);
      const handlers = createPhaseHandlers(rng, decisionSource);
      await handlers["household-turn"]!(state);
      await handlers["round-settlement"]!(state);

      const m1 = state.roundMetrics[0]!;
      expect(m1.householdEssentialCategoriesMissed[householdId]!.sort()).toEqual(["apparel", "food"]);

      // hand calc: rawSatisfaction = 1.0, penalty = 0.2 (food) + 0.1 (apparel) = 0.3 =>
      // roundSatisfaction = 0.7, satisfactionScore = 0*0.7 + 0.7*0.3 = 0.21.
      expect(state.households[householdId]!.satisfactionScore).toBeCloseTo(0.21, 10);
    });

    it("does NOT flag food as missed when no food listing exists in the market at all (exemption)", async () => {
      const { state, householdId, sellerStoreId } = setup(41005);
      state.retailListings = [listing("rl-toys", sellerStoreId, "toys", { price: 5, quality: 1.0 })];
      const decisionSource: HumanDecisionSource = {
        getCompanyInput: () => undefined,
        getStorePurchaseRequest: () => undefined,
        getHouseholdPurchaseRequest: (id) =>
          id === householdId ? [{ listingId: "rl-toys", quantity: 1 }] : undefined,
      };

      const rng = createRng(41006);
      const handlers = createPhaseHandlers(rng, decisionSource);
      await handlers["household-turn"]!(state);
      await handlers["round-settlement"]!(state);

      const m1 = state.roundMetrics[0]!;
      expect(m1.householdEssentialCategoriesMissed[householdId]).toEqual([]);
      // hand calc: rawSatisfaction = 1.0, penalty = 0 (both essentials exempt) =>
      // roundSatisfaction = 1.0, satisfactionScore = 0*0.7 + 1.0*0.3 = 0.3.
      expect(state.households[householdId]!.satisfactionScore).toBeCloseTo(0.3, 10);
    });

    it("also does not flag food as unavailable-turned-missed when the only food listing has zero remaining stock", async () => {
      const { state, householdId, sellerStoreId } = setup(41007);
      state.retailListings = [
        listing("rl-food-empty", sellerStoreId, "food", { price: 5, quality: 0.9, quantityAvailable: 0 }),
        listing("rl-toys", sellerStoreId, "toys", { price: 5, quality: 1.0 }),
      ];
      const decisionSource: HumanDecisionSource = {
        getCompanyInput: () => undefined,
        getStorePurchaseRequest: () => undefined,
        getHouseholdPurchaseRequest: (id) =>
          id === householdId ? [{ listingId: "rl-toys", quantity: 1 }] : undefined,
      };

      const rng = createRng(41008);
      const handlers = createPhaseHandlers(rng, decisionSource);
      await handlers["household-turn"]!(state);
      await handlers["round-settlement"]!(state);

      const m1 = state.roundMetrics[0]!;
      expect(m1.householdEssentialCategoriesMissed[householdId]).toEqual([]);
    });

    it("computes householdSpend/UnitsBought/CategoryCount/TopCategorySpendShare correctly for a multi-category purchase", async () => {
      const { state, householdId, sellerStoreId } = setup(41009);
      state.retailListings = [
        listing("rl-food", sellerStoreId, "food", { price: 5, quality: 0.5 }),
        listing("rl-apparel", sellerStoreId, "apparel", { price: 3, quality: 0.5 }),
        listing("rl-toys", sellerStoreId, "toys", { price: 2, quality: 0.5 }),
      ];
      const decisionSource: HumanDecisionSource = {
        getCompanyInput: () => undefined,
        getStorePurchaseRequest: () => undefined,
        getHouseholdPurchaseRequest: (id) =>
          id === householdId
            ? [
                { listingId: "rl-food", quantity: 2 }, // 2 * 5 = 10
                { listingId: "rl-apparel", quantity: 1 }, // 1 * 3 = 3
              ]
            : undefined,
      };

      const rng = createRng(41010);
      const handlers = createPhaseHandlers(rng, decisionSource);
      await handlers["household-turn"]!(state);
      await handlers["round-settlement"]!(state);

      const m1 = state.roundMetrics[0]!;
      expect(m1.householdSpend[householdId]).toBe(13);
      expect(m1.householdUnitsBought[householdId]).toBe(3);
      expect(m1.householdCategoryCount[householdId]).toBe(2);
      expect(m1.householdTopCategorySpendShare[householdId]).toBeCloseTo(10 / 13, 10);
      // Both essentials were actually purchased, so neither should be flagged as missed.
      expect(m1.householdEssentialCategoriesMissed[householdId]).toEqual([]);
    });
  });

  describe("D-026: essential-category penalty judged from a round-start supply snapshot, not live stock", () => {
    it(
      "still flags a later-processed household as having missed food when an earlier-processed " +
        "household already bought the only food listing in the same round",
      async () => {
        const state = buildInitialGameState(2, 51001);
        const student1HouseholdId = "student-1-household";
        const npcHouseholdId = Object.values(state.households).find((h) => h.kind === "npc")!.id;
        const sellerStoreId = Object.values(state.stores).find((s) => s.kind === "npc")!.id;

        state.retailListings = [
          { id: "rl-scarce-food", storeId: sellerStoreId, categoryId: "food", quantityAvailable: 1, quality: 0.5, price: 5 },
        ];

        const decisionSource: HumanDecisionSource = {
          getCompanyInput: () => undefined,
          getStorePurchaseRequest: () => undefined,
          // student-1's household buys the single food unit during "household-turn" (processed
          // before "npc-consumer-behavior" in round order); everyone else (student-2's household,
          // and every NPC household including npcHouseholdId) explicitly requests nothing, so the
          // scenario is fully deterministic regardless of shuffle order.
          getHouseholdPurchaseRequest: (id) =>
            id === student1HouseholdId ? [{ listingId: "rl-scarce-food", quantity: 1 }] : [],
        };

        const rng = createRng(51002);
        const handlers = createPhaseHandlers(rng, decisionSource);
        // Round order (docs/ROUND_FLOW.md): "household-turn" runs before "npc-consumer-behavior".
        // By the time npc-consumer-behavior processes npcHouseholdId, the live
        // state.retailListings entry for "rl-scarce-food" already has quantityAvailable === 0
        // (student-1 depleted it) — D-026's fix means the penalty judgement must still use the
        // round-start snapshot (taken before student-1 was processed) and flag npcHouseholdId.
        await handlers["household-turn"]!(state);
        expect(state.retailListings.find((l) => l.id === "rl-scarce-food")!.quantityAvailable).toBe(0);
        await handlers["npc-consumer-behavior"]!(state);
        await handlers["round-settlement"]!(state);

        const m1 = state.roundMetrics[0]!;
        expect(m1.householdEssentialCategoriesMissed[student1HouseholdId]).toEqual([]);
        expect(m1.householdEssentialCategoriesMissed[npcHouseholdId]).toContain("food");
      },
    );
  });
});
