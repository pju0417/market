import { describe, expect, it } from "vitest";
import { simulateGame } from "../../src/engine/simulateGame.js";

/**
 * Milestone 1 데이터 무결성 검증. docs/TODO.md가 감지 대상으로 지정한 이상상황 중
 * 단위/통합 테스트로 확인 가능한 항목(음수 재고, 보유 현금 이상 사용)을 다룬다.
 * 시장 쏠림/독점 여부 같은 밸런스 신호는 scripts/validate-economy.ts + economy-reviewer의
 * 몫이며 여기서는 다루지 않는다.
 */
describe("economy simulation data integrity", () => {
  it.each([1, 5, 10, 20])("studentCount=%i: no negative cash or inventory after 7 rounds", async (studentCount) => {
    const { state } = await simulateGame(studentCount, 2024);

    for (const company of Object.values(state.companies)) {
      expect(company.ledger.cash).toBeGreaterThanOrEqual(0);
      expect(company.inventoryQuantity).toBeGreaterThanOrEqual(0);
    }
    for (const store of Object.values(state.stores)) {
      expect(store.ledger.cash).toBeGreaterThanOrEqual(0);
      expect(store.inventoryQuantity).toBeGreaterThanOrEqual(0);
    }
    for (const household of Object.values(state.households)) {
      expect(household.ledger.cash).toBeGreaterThanOrEqual(0);
    }
    for (const listing of [...state.wholesaleListings, ...state.retailListings]) {
      expect(listing.quantityAvailable).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic for a given rngSeed", async () => {
    const runA = await simulateGame(8, 555);
    const runB = await simulateGame(8, 555);

    expect(JSON.stringify(runA.state.roundMetrics)).toBe(JSON.stringify(runB.state.roundMetrics));
  });

  it("produces different outcomes for different seeds (sanity check that randomness is actually used)", async () => {
    const runA = await simulateGame(8, 1);
    const runB = await simulateGame(8, 2);

    expect(JSON.stringify(runA.state.roundMetrics)).not.toBe(JSON.stringify(runB.state.roundMetrics));
  });

  it("never lets a company or store buy from itself (D-005, D-006 hold across a full game)", async () => {
    const { state } = await simulateGame(6, 99);

    for (const player of state.players) {
      const company = state.companies[player.companyId]!;
      const store = state.stores[player.storeId]!;
      const household = state.households[player.householdId]!;
      expect(company.ownerId).toBe(store.ownerId);
      expect(store.ownerId).toBe(household.ownerId);
    }
    // 실제 자기 거래 차단은 src/economy/market.ts의 eligibility 필터가 구조적으로
    // 보장한다 (tests/economy/market.test.ts). 여기서는 소유 관계 자체가 게임 내내
    // 안정적으로 유지되는지만 확인한다.
  });
});
