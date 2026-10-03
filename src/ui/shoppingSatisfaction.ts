import type { CartLine, GameState, RetailListing } from "../types/domain.js";
import { ESSENTIAL_CATEGORY_IDS, essentialSatisfactionPenalty } from "../economy/config.js";
import { eligibleRetailListingsForHousehold } from "../economy/market.js";

/** Preview the existing engine formula, including purchases already made this turn. */
export function shoppingSatisfaction(state: GameState, id: string, cart: CartLine[], listings: RetailListing[]) {
  const household = state.households[id]!;
  const acc = state.roundAccounting;
  let quality = acc?.householdQualityUnits?.[id] ?? 0;
  let units = acc?.householdUnitsBought[id] ?? 0;
  const categories = { ...acc?.householdCategoryUnits?.[id] };
  for (const line of cart) {
    const listing = listings.find(l => l.id === line.listingId);
    if (!listing) continue;
    quality += listing.quality * line.quantity;
    units += line.quantity;
    categories[listing.categoryId] = (categories[listing.categoryId] ?? 0) + line.quantity;
  }
  const available = eligibleRetailListingsForHousehold(household, acc?.roundStartRetailListings ?? state.retailListings, state.stores);
  const missed = ESSENTIAL_CATEGORY_IDS.filter(c => !categories[c] && available.some(l => l.categoryId === c && l.quantityAvailable > 0));
  const round = Math.max(0, (units > 0 ? quality / units : 0) - missed.reduce((s,c) => s + essentialSatisfactionPenalty(c), 0));
  const base = acc?.householdBaseSatisfaction?.[id] ?? household.satisfactionScore;
  return { round: round * 100, cumulative: (base * 0.7 + round * 0.3) * 100, missed };
}
