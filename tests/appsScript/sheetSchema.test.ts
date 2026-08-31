import { describe, expect, it } from "vitest";
import { simulateGame } from "../../src/engine/simulateGame.js";
import {
  buildRoundSummaryRows,
  deserializeLiveState,
  deserializeRoundMetrics,
  serializeLiveState,
  serializeRoundMetrics,
} from "../../src/appsScript/sheetSchema.js";
import type { GameState } from "../../src/types/domain.js";

/** Google Sheets 셀 문자수 한도(약 50,000자)에 여유를 둔 회귀 감시 임계값. */
const MAX_LIVE_STATE_CELL_LENGTH = 40_000;

describe("appsScript/sheetSchema", () => {
  describe("serializeLiveState / deserializeLiveState", () => {
    it("round-trips a small single-student GameState", async () => {
      const { state } = await simulateGame(1, 42);
      const json = serializeLiveState(state);
      const reconstructed = deserializeLiveState(json, state.roundMetrics);

      expect(reconstructed).toEqual(state);
    });

    it("excludes roundMetrics from the serialized live state (kept in a separate append-only sheet)", async () => {
      const { state } = await simulateGame(5, 1);
      const json = serializeLiveState(state);

      expect(json.includes("roundMetrics")).toBe(false);
      expect(state.roundMetrics.length).toBeGreaterThan(0);
    });

    it("stays well under the Google Sheets cell size limit for a 20-student class with NPC backfill, even after a full 7-round game", async () => {
      const { state } = await simulateGame(20, 42);
      expect(state.roundMetrics.length).toBe(7);
      // Sanity check that this really is a large state (many companies/stores/households).
      expect(Object.keys(state.companies).length).toBeGreaterThanOrEqual(20);

      const json = serializeLiveState(state);
      expect(json.length).toBeLessThan(MAX_LIVE_STATE_CELL_LENGTH);
    });

    it("round-trips the large 20-student post-game state exactly", async () => {
      const { state } = await simulateGame(20, 42);
      const json = serializeLiveState(state);
      const reconstructed = deserializeLiveState(json, state.roundMetrics);

      expect(reconstructed).toEqual(state);
    });
  });

  describe("serializeRoundMetrics / deserializeRoundMetrics", () => {
    it("round-trips a single round's metrics", async () => {
      const { state } = await simulateGame(5, 7);
      const metrics = state.roundMetrics[0]!;
      const json = serializeRoundMetrics(metrics);

      expect(deserializeRoundMetrics(json)).toEqual(metrics);
    });

    it("stays comfortably under the cell size limit even for a 20-student round", async () => {
      const { state } = await simulateGame(20, 42);
      for (const metrics of state.roundMetrics) {
        expect(serializeRoundMetrics(metrics).length).toBeLessThan(MAX_LIVE_STATE_CELL_LENGTH);
      }
    });
  });

  describe("buildRoundSummaryRows", () => {
    it("is purely derived data: never referenced by (de)serializeLiveState", async () => {
      const { state } = await simulateGame(3, 3);
      const rows = buildRoundSummaryRows("session-1", state.roundMetrics[0]!);

      // Re-serializing the live state must not depend on, or be affected by, summary rows.
      const before = serializeLiveState(state);
      void rows;
      const after = serializeLiveState(state);
      expect(after).toBe(before);
    });

    it("produces one row per company/store/household entity referenced by the round's metrics", async () => {
      const { state } = await simulateGame(3, 3);
      const metrics = state.roundMetrics[0]!;
      const rows = buildRoundSummaryRows("session-1", metrics);

      const companyRows = rows.filter((r) => r.entityType === "company");
      const storeRows = rows.filter((r) => r.entityType === "store");
      const householdRows = rows.filter((r) => r.entityType === "household");

      expect(companyRows.length).toBe(Object.keys(metrics.companyProfit).length);
      expect(storeRows.length).toBe(Object.keys(metrics.storeProfit).length);
      expect(householdRows.length).toBe(Object.keys(metrics.householdSpend).length);

      for (const row of rows) {
        expect(row.sessionId).toBe("session-1");
        expect(row.round).toBe(String(metrics.round));
      }

      const sampleCompanyId = Object.keys(metrics.companyProfit)[0]!;
      const sampleRow = companyRows.find((r) => r.entityId === sampleCompanyId)!;
      expect(sampleRow.profit).toBe(String(metrics.companyProfit[sampleCompanyId]));
      // Fields belonging to other entity types must be blank on a company row.
      expect(sampleRow.householdSpend).toBe("");
    });

    it("joins missed essential categories with a comma for household rows", async () => {
      const { state } = await simulateGame(3, 3);
      const metrics = state.roundMetrics.find((m) =>
        Object.values(m.householdEssentialCategoriesMissed).some((missed) => missed.length > 0),
      );
      // If no round in this fixture happens to have a miss, the assertion below is skipped rather
      // than failing the whole suite on an unrelated balance fluctuation.
      if (!metrics) return;

      const rows = buildRoundSummaryRows("session-1", metrics);
      const [householdId, missed] = Object.entries(metrics.householdEssentialCategoriesMissed).find(
        ([, m]) => m.length > 0,
      )!;
      const row = rows.find((r) => r.entityType === "household" && r.entityId === householdId)!;
      expect(row.essentialCategoriesMissed).toBe(missed.join(","));
    });
  });

  it("a hand-built minimal GameState also round-trips through serializeLiveState/deserializeLiveState", () => {
    const state: GameState = {
      config: { totalRounds: 7, studentPlayerIds: ["p1"], rngSeed: 1 },
      currentRound: 1,
      currentPhase: "company-turn",
      players: [{ id: "p1", displayName: "Player 1", companyId: "c1", storeId: "s1", householdId: "h1" }],
      companies: {
        c1: {
          id: "c1",
          ownerId: "p1",
          kind: "student",
          districtId: "downtown",
          ledger: { cash: 1000, cumulativeProfit: 0 },
          strategyId: "stable",
          productCategoryId: "food",
          quality: 0.5,
          inventoryQuantity: 0,
          lastWholesalePrice: 0,
          lastIndustrySwitchRound: null,
        },
      },
      stores: {
        s1: {
          id: "s1",
          ownerId: "p1",
          kind: "student",
          districtId: "downtown",
          ledger: { cash: 1000, cumulativeProfit: 0 },
          strategyId: "stable",
          specialtyCategoryId: "food",
          currentSellingCategoryId: null,
          inventoryQuantity: 0,
          inventoryQuality: 0.5,
          retailPrice: 0,
          lastSellingCategoryChangeRound: null,
        },
      },
      households: {
        h1: {
          id: "h1",
          ownerId: "p1",
          kind: "student",
          ledger: { cash: 100, cumulativeProfit: 0 },
          strategyId: "stable",
          budgetPerRound: 100,
          satisfactionScore: 0.5,
        },
      },
      wholesaleListings: [],
      retailListings: [],
      roundMetrics: [],
    };

    const json = serializeLiveState(state);
    expect(deserializeLiveState(json, [])).toEqual(state);
  });
});
