import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/multiplayer/GameSession.js";
import { deliveredListings } from "../../src/economy/city.js";
import { eligibleRetailListingsForHousehold, eligibleWholesaleListingsForStore } from "../../src/economy/market.js";
import { deserializeLiveState, serializeLiveState } from "../../src/appsScript/sheetSchema.js";
import type { CartCheckout, GameState } from "../../src/types/domain.js";
import { shoppingSatisfaction } from "../../src/ui/shoppingSatisfaction.js";
import { blendedInventoryCost } from "../../src/economy/inventoryCost.js";

async function storesReady(count = 2) {
  const session = new GameSession(42, undefined, undefined, count);
  session.enableCityEconomy();
  for (const player of session.getPlayers()) session.submitCompanyDecision(player.companyId, { quantity: 20, quality: 0.8, wholesalePrice: 2 });
  await session.advanceUntilInputRequired();
  return session;
}

function cartFor(session: GameSession, role: "store" | "household", id: string, requestId: string, quantity = 1): CartCheckout {
  const state = session.getState();
  const store = state.stores[id];
  const listings = role === "store"
    ? deliveredListings(state, id, eligibleWholesaleListingsForStore(store!, state.wholesaleListings, state.companies)).filter(l => l.categoryId === (store!.currentSellingCategoryId ?? store!.specialtyCategoryId) && l.quantityAvailable >= quantity)
    : deliveredListings(state, id, eligibleRetailListingsForHousehold(state.households[id]!, state.retailListings, state.stores)).filter(l => l.quantityAvailable >= quantity);
  const listing = listings.sort((a, b) => a.price - b.price)[0]!;
  expect(listing).toBeDefined();
  return { requestId, round: state.currentRound, retailPrice: 5, lines: [{ listingId: listing.id, quantity, unitPrice: listing.price }] };
}

describe("immediate shopping cart and explicit turn completion", () => {
  it("tracks historical stock cost and previews exactly the satisfaction committed by successive checkouts", async () => {
    const session = await storesReady(1);
    const player = session.getPlayers()[0]!;
    expect(session.getState().companies[player.companyId]!.inventoryUnitCost).toBeGreaterThan(0);
    const first = cartFor(session, "store", player.storeId, "cost-1", 2);
    session.checkoutCart("store", player.storeId, first);
    const second = cartFor(session, "store", player.storeId, "cost-2", 1);
    session.checkoutCart("store", player.storeId, second);
    const expectedCost = (2 * first.lines[0]!.unitPrice + second.lines[0]!.unitPrice) / 3;
    expect(session.getState().stores[player.storeId]!.inventoryUnitCost).toBeCloseTo(expectedCost);
    session.submitStoreDecision(player.storeId, { retailPrice: 10 });
    await session.advanceUntilInputRequired();
    for (let i = 0; i < 2; i++) {
      const cart = cartFor(session, "household", player.householdId, `satisfaction-${i}`);
      const state = session.getState();
      const preview = shoppingSatisfaction(state, player.householdId, cart.lines, state.retailListings);
      session.checkoutCart("household", player.householdId, cart);
      expect(session.getState().households[player.householdId]!.satisfactionScore * 100).toBeCloseTo(preview.cumulative);
    }
    const state = session.getState();
    const restored = deserializeLiveState(serializeLiveState(state), state.roundMetrics);
    expect(restored.stores[player.storeId]!.inventoryUnitCost).toBeCloseTo(expectedCost);
    expect(restored.households[player.householdId]!.purchases).toEqual(state.households[player.householdId]!.purchases);
    expect(restored.households[player.householdId]!.purchases).toHaveLength(2);
    expect(blendedInventoryCost(3, undefined, 2, 40)).toBeUndefined();
    expect(blendedInventoryCost(0, undefined, 2, 40)).toBe(20);
  });
  it.each([1, 5, 20])("completes seven cart-based rounds with %i students and per-action hydration", async count => {
    let session = await storesReady(count);
    const restore = () => {
      const state = session.getState();
      session = GameSession.resumeFromState(deserializeLiveState(serializeLiveState(state), state.roundMetrics), session.exportPendingSubmissions());
    };
    let order = 0;
    while (session.getState().currentRound <= 7) {
      const phase = session.getState().currentPhase;
      for (const player of session.getPlayers()) {
        if (phase === "company-turn") {
          session.submitCompanyDecision(player.companyId, { quantity: 20, quality: 0.6, wholesalePrice: 4 });
        } else if (phase === "store-turn" || phase === "household-turn") {
          const state = session.getState();
          const store = state.stores[player.storeId]!;
          const household = state.households[player.householdId]!;
          const role = phase === "store-turn" ? "store" : "household";
          const id = role === "store" ? store.id : household.id;
          const listings = role === "store"
            ? deliveredListings(state, id, eligibleWholesaleListingsForStore(store, state.wholesaleListings, state.companies)).filter(l => l.categoryId === store.specialtyCategoryId)
            : deliveredListings(state, id, eligibleRetailListingsForHousehold(household, state.retailListings, state.stores));
          const listing = listings.find(l => l.quantityAvailable > 0);
          if (listing) {
            try {
              session.checkoutCart(role, id, { requestId: `order-${order++}`, round: state.currentRound, retailPrice: 8, lines: [{ listingId: listing.id, quantity: 1, unitPrice: listing.price }] });
            } catch (error) {
              // Insolvent actors may abstain; all other errors must fail this scenario.
              expect(String(error)).toContain("가진 돈이 부족");
            }
            restore();
          }
          if (role === "store") session.submitStoreDecision(id, { retailPrice: 8 });
          else session.submitHouseholdPurchases(id, []);
        } else if (phase === "round-result") session.acknowledgeRoundResult(player.id);
        restore();
      }
      await session.advanceUntilInputRequired();
      for (const actor of [...Object.values(session.getState().companies), ...Object.values(session.getState().stores), ...Object.values(session.getState().households)]) {
        expect(Number.isFinite(actor.ledger.cash)).toBe(true);
        expect(actor.ledger.cash).toBeGreaterThanOrEqual(0);
        if ("inventoryQuantity" in actor) expect(actor.inventoryQuantity).toBeGreaterThanOrEqual(0);
      }
    }
    expect(session.getState().roundMetrics).toHaveLength(7);
    expect(session.getState().roundMetrics.every(m => Number.isFinite(m.totalRetailValue))).toBe(true);
  }, 60_000);

  it("charges immediately, retries once, allows another purchase, and waits for every end-turn", async () => {
    const session = await storesReady();
    const [a, b] = session.getPlayers();
    const cart = cartFor(session, "store", a!.storeId, "order-1");
    const before = JSON.stringify(session.getState());
    const receipt = session.checkoutCart("store", a!.storeId, cart);
    expect(JSON.stringify(session.getState())).not.toBe(before);
    expect(session.getState().currentPhase).toBe("store-turn");
    expect(session.getUnsubmittedParticipantIds()).toContain(a!.storeId);
    const committed = JSON.stringify(session.getState());
    expect(session.checkoutCart("store", a!.storeId, cart)).toEqual(receipt);
    expect(JSON.stringify(session.getState())).toBe(committed);
    const second = session.checkoutCart("store", a!.storeId, cartFor(session, "store", a!.storeId, "order-2"));
    expect(receipt.remainingCash - second.remainingCash).toBeCloseTo(second.total);
    session.submitStoreDecision(a!.storeId, { retailPrice: 7 });
    await session.advanceUntilInputRequired();
    expect(session.getState().currentPhase).toBe("store-turn");
    expect(() => session.checkoutCart("store", a!.storeId, cartFor(session, "store", a!.storeId, "after-end"))).toThrow("턴을 종료");
    session.submitStoreDecision(b!.storeId, { retailPrice: 7 });
    await session.advanceUntilInputRequired();
    expect(session.getState().currentPhase).toBe("household-turn");
    expect(session.getState().stores[a!.storeId]!.ledger.cash).toBeCloseTo(second.remainingCash);
    expect(session.getState().stores[a!.storeId]!.retailPrice).toBe(7);
  });

  it("rejects the whole cart when one line is unavailable and does not apply costs or income", async () => {
    const session = await storesReady(); const id = session.getPlayers()[0]!.storeId;
    const cart = cartFor(session, "store", id, "bad");
    cart.lines.push({ listingId: "missing", quantity: 1, unitPrice: 1 });
    const before = JSON.stringify(session.getState());
    expect(() => session.checkoutCart("store", id, cart)).toThrow("재고");
    expect(JSON.stringify(session.getState())).toBe(before);
  });

  it("rechecks last-unit stock for two competing buyers", async () => {
    const session = await storesReady(); const [a, b] = session.getPlayers();
    const state = session.getState() as GameState;
    state.stores[b!.storeId]!.specialtyCategoryId = state.stores[a!.storeId]!.specialtyCategoryId;
    const first = cartFor(session, "store", a!.storeId, "last-a");
    const listing = state.wholesaleListings.find(l => l.id === first.lines[0]!.listingId)!;
    // Pick an NPC supplier so both students are eligible.
    const npc = state.wholesaleListings.find(l => state.companies[l.companyId]!.kind === "npc" && l.categoryId === state.stores[a!.storeId]!.specialtyCategoryId)!;
    expect(listing).toBeDefined(); expect(npc).toBeDefined();
    npc.quantityAvailable = 1; state.companies[npc.companyId]!.inventoryQuantity = 1;
    const make = (id: string, requestId: string) => ({ requestId, round: 1, lines: [{ listingId: npc.id, quantity: 1, unitPrice: deliveredListings(state, id, [npc])[0]!.price }] });
    const requestB = make(b!.storeId, "last-b");
    session.checkoutCart("store", a!.storeId, make(a!.storeId, "last-a"));
    const before = JSON.stringify(session.getState());
    expect(() => session.checkoutCart("store", b!.storeId, requestB)).toThrow("재고");
    expect(JSON.stringify(session.getState())).toBe(before);
  });

  it("persists accounting and receipts, gives household income once, caps repeated purchases at six", async () => {
    let session = await storesReady();
    for (const p of session.getPlayers()) session.submitStoreDecision(p.storeId, { retailPrice: 5 });
    await session.advanceUntilInputRequired();
    const player = session.getPlayers()[0]!;
    const firstCart = cartFor(session, "household", player.householdId, "h1", 2);
    const first = session.checkoutCart("household", player.householdId, firstCart);
    const saved = session.getState();
    session = GameSession.resumeFromState(deserializeLiveState(serializeLiveState(saved), saved.roundMetrics), session.exportPendingSubmissions());
    expect(session.checkoutCart("household", player.householdId, firstCart)).toEqual(first);
    const second = session.checkoutCart("household", player.householdId, cartFor(session, "household", player.householdId, "h2", 4));
    expect(first.remainingCash - second.remainingCash).toBeCloseTo(second.total);
    expect(() => session.checkoutCart("household", player.householdId, cartFor(session, "household", player.householdId, "h3"))).toThrow("6개");
    for (const p of session.getPlayers()) session.submitHouseholdPurchases(p.householdId, []);
    await session.advanceUntilInputRequired();
    expect(session.getState().currentPhase).toBe("round-result");
    const metrics = session.getState().roundMetrics[0]!;
    expect(metrics.householdUnitsBought[player.householdId]).toBe(6);
    expect(metrics.householdSpend[player.householdId]).toBeCloseTo(first.total + second.total);
    expect(session.getState().households[player.householdId]!.ledger.cash).toBeCloseTo(second.remainingCash);
  });
});
