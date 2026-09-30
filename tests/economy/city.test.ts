import { CITY_BUILDINGS } from "../../src/economy/metropolisCity.js";
import { describe, expect, it } from "vitest";
import { buildInitialGameState, createAutoPlayPhaseHandlers, createPhaseHandlers } from "../../src/engine/simulateGame.js";
import { RoundEngine } from "../../src/engine/RoundEngine.js";
import { cityActors, cityRent, createGridCity as createCity, deliveredListings, findCityRoute, prepareCityRound, recordTransport, roadKey, transportQuote } from "../../src/economy/city.js";
import { createRng } from "../../src/economy/rng.js";
import { COSTS } from "../../src/economy/config.js";
import { computeStoreFixedCost } from "../../src/economy/costs.js";
import { previewCategoryPurchase } from "../../src/ui/turnCalculations.js";
import { serializeLiveState, deserializeLiveState } from "../../src/appsScript/sheetSchema.js";
import { GameSession } from "../../src/multiplayer/GameSession.js";
import type { WholesaleListing } from "../../src/types/domain.js";

function cityGame(count = 2, seed = 42) {
  const state = buildInitialGameState(count, seed);
  state.city = createCity(state);
  return state;
}

describe("shared city geography and economics", () => {
  it.each([1, 5, 10, 20, 40])("assigns every student/NPC building a unique lot for %i students", (count) => {
    const state = cityGame(count);
    const positions = state.city!.positions;
    expect(Object.keys(positions)).toHaveLength(cityActors(state).length);
    expect(new Set(Object.values(positions).map((point) => point.join(","))).size).toBe(Object.keys(positions).length);
    expect(createCity(state)).toEqual(state.city);
    for (const player of state.players) for (const id of [player.companyId, player.storeId, player.householdId]) expect(positions[id]).toBeDefined();
  });

  it("keeps every building in the district selected in the lobby", () => {
    const session = new GameSession(9, undefined, undefined, 2);
    session.enableCityEconomy();
    session.applyBusinessSetupChoices("student-2", { companyDistrictId: "industrial", companyCategoryId: "food", storeDistrictId: "upscale", storeCategoryId: "food" });
    const city = session.getState().city!;
    expect(CITY_BUILDINGS[city.addresses!["student-2-company"]!.building]!.district).toBe('industrial');
    expect(CITY_BUILDINGS[city.addresses!["student-2-store"]!.building]!.district).toBe('upscale');
    const resumed = GameSession.resumeFromState(JSON.parse(JSON.stringify(session.getState())));
    expect(resumed.getState().city).toEqual(city);
  });

  it("charges greater road distance more and uses contiguous road segments", () => {
    const state = cityGame();
    state.city!.positions = { a: [0, 0], b: [1, 0], c: [5, 0] };
    const near = transportQuote(state, "a", "b", "wholesale");
    const far = transportQuote(state, "a", "c", "wholesale");
    expect(far.perUnit).toBeGreaterThan(near.perUnit);
    expect(far.route!.distance).toBe(6);
    far.route!.points.slice(1).forEach((point, index) => {
      const before = far.route!.points[index]!;
      expect(Math.abs(point[0] - before[0]) + Math.abs(point[1] - before[1])).toBe(1);
    });
    expect(findCityRoute(state.city!, "missing", "b")).toBeUndefined();
  });

  it("uses actual shipments next round, never moving the current quoted price during submissions", () => {
    const state = cityGame();
    state.city!.positions = { a: [0, 0], b: [1, 0] };
    const before = transportQuote(state, "a", "b", "wholesale");
    recordTransport(state, "a", "b", 48, "wholesale");
    expect(transportQuote(state, "a", "b", "wholesale")).toEqual(before);
    expect(state.city!.roadLoads[roadKey([0, 0], [1, 0])]).toBe(48);
    expect(state.city!.costs.b!.transport).toBeCloseTo(before.perUnit * 48);
    state.currentRound++;
    prepareCityRound(state);
    expect(transportQuote(state, "a", "b", "wholesale").perUnit).toBeGreaterThan(before.perUnit);
    expect(state.city!.roadLoads).toEqual({});
    const frozen = JSON.stringify(state.city);
    prepareCityRound(state);
    expect(JSON.stringify(state.city)).toBe(frozen);
  });

  it("avoids a congested direct road when a detour costs less", () => {
    const state = cityGame();
    state.city!.positions = { a: [0, 0], b: [3, 0] };
    for (let x = 0; x < 3; x++) state.city!.traffic[roadKey([x, 0], [x + 1, 0])] = 100;
    const route = findCityRoute(state.city!, "a", "b")!;
    expect(route.points.some(([, y]) => y === 1)).toBe(true);
    expect(route.weightedDistance).toBeLessThan(10);
  });

  it("derives rent from position, density and local traffic instead of the district name alone", () => {
    const state = cityGame();
    const city = state.city!;
    city.positions = { a: [0, 0] };
    const edge = cityRent(state, "a", "store", "downtown");
    city.positions.a = [Math.floor(city.blockSize * 1.5), city.blockSize];
    const central = cityRent(state, "a", "store", "downtown");
    expect(central.total).toBeGreaterThan(edge.total);
    const [x, y] = city.positions.a;
    city.positions.b = [x + 1, y];
    const dense = cityRent(state, "a", "store", "downtown");
    expect(dense.total).toBeGreaterThan(central.total);
    city.traffic[roadKey([x, y], [x + 1, y])] = 100;
    expect(cityRent(state, "a", "store", "downtown").total).toBeLessThan(dense.total);
  });

  it("uses the same delivered-price budget in the preview and settlement, paying the seller only the goods price", async () => {
    const state = cityGame();
    const store = state.stores["student-1-store"]!;
    const company = state.companies["student-2-company"]!;
    state.stores = { [store.id]: store };
    store.specialtyCategoryId = "food";
    company.inventoryQuantity = 20;
    const listing: WholesaleListing = { id: "test-lot", companyId: company.id, categoryId: "food", price: 10, quality: 0.5, quantityAvailable: 20 };
    state.wholesaleListings = [listing];
    const quotes = deliveredListings(state, store.id, state.wholesaleListings);
    const request = { priorityPicks: [{ listingId: listing.id, quantity: 3 }], maxQuantity: 3 };
    const fixedCost = computeStoreFixedCost(store.districtId, state, store.id);
    store.ledger.cash = fixedCost + quotes[0]!.price * 2 + 0.01;
    const preview = previewCategoryPurchase(quotes, state.companies, store.ownerId, request, store.ledger.cash - fixedCost, 3, createRng(1));
    expect(preview.spentUnits).toBe(2);
    const sellerBefore = company.ledger.cash;
    const buyerBefore = store.ledger.cash;
    const handlers = createPhaseHandlers(createRng(1), {
      getCompanyInput: () => undefined,
      getStorePurchaseRequest: () => ({ purchaseRequest: request, retailPrice: 15 }),
      getHouseholdPurchaseRequest: () => undefined,
      getStoreSubmissionReceivedAt: () => 1,
      getHouseholdSubmissionReceivedAt: () => undefined,
      getPhaseStartedAt: () => 0,
      getSubmissionTimeoutSettings: () => ({ enabled: false, timeoutMs: 120000, npcGraduatedEntryEnabled: false }),
    });
    await handlers["store-turn"]!(state);
    expect(store.inventoryQuantity).toBe(2);
    expect(store.ledger.cash).toBeCloseTo(buyerBefore - fixedCost - preview.spentCash);
    expect(company.ledger.cash - sellerBefore).toBeCloseTo(20);
    expect(state.city!.costs[store.id]!.transport).toBeCloseTo(2 * quotes[0]!.transportCostPerUnit!);
    expect(listing.price).toBe(10);
    expect(deliveredListings(state, store.id, quotes)[0]!.price).toBe(quotes[0]!.price);
  });

  it("preserves legacy fixed rent and zero buyer freight without a city", () => {
    const state = buildInitialGameState(1, 1);
    expect(cityRent(state, "anything", "household").total).toBe(0);
    expect(cityRent(state, "anything", "company", "industrial").total).toBe(COSTS.baseRentCompany * 0.7);
    expect(transportQuote(state, "a", "b", "retail").perUnit).toBe(0);
  });

  it.each([1, 5, 10, 20].flatMap((count) => [1, 42, 999].map((seed) => [count, seed] as const)))("completes 7 spatial rounds for %i students seed %i with consistent snapshots and no negative money/inventory", async (count, seed) => {
    const state = cityGame(count, seed);
    const initialPositions = JSON.stringify(state.city!.positions);
    const engine = new RoundEngine(state, createAutoPlayPhaseHandlers(createRng(seed + 1)));
    await engine.runGame();
    expect(state.roundMetrics).toHaveLength(7);
    expect(JSON.stringify(state.city!.positions)).toBe(initialPositions);
    for (const actor of cityActors(state)) {
      expect(Number.isFinite(actor.ledger.cash)).toBe(true);
      expect(actor.ledger.cash).toBeGreaterThanOrEqual(0);
      if (actor.role !== "household") expect(actor.inventoryQuantity).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(state.city!.traffic).length).toBeGreaterThan(0);
    const json = serializeLiveState(state);
    expect(json.length).toBeLessThan(50000);
    expect(deserializeLiveState(json, state.roundMetrics)).toEqual(state);
    const restored = GameSession.resumeFromState(deserializeLiveState(json, state.roundMetrics));
    expect(restored.getState().city).toEqual(state.city);
    expect(state.roundMetrics.every((metrics) => metrics.locationCosts !== undefined)).toBe(true);
  });
});
