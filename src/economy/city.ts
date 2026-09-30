import { artworkRoute, artworkRentInputs } from "./artworkCity.js";
import { createMetropolis } from './metropolisCity.js';
import { CITY_RULES, COSTS, DISTRICT_IDS, DISTRICTS } from "./config.js";
import { createRng, shuffle } from "./rng.js";
import type { CityPoint, CityState, DistrictId, GameState, ParticipantId, RetailListing, Role, WholesaleListing } from "../types/domain.js";

export function cityActors(state: GameState) {
  return [
    ...Object.values(state.companies).map((actor) => ({ ...actor, role: "company" as const })),
    ...Object.values(state.stores).map((actor) => ({ ...actor, role: "store" as const })),
    ...Object.values(state.households).map((actor) => ({ ...actor, districtId: "residential" as const, role: "household" as const })),
  ];
}

/** Server builds one deterministic map after lobby choices; never from viewport/player perspective. */
export function createGridCity(state: GameState): CityState {
  const actors = cityActors(state).sort((a, b) => a.id.localeCompare(b.id, "en"));
  const groups = DISTRICT_IDS.map((district) => actors.filter((actor) => actor.districtId === district));
  const blockSize = Math.max(CITY_RULES.minBlockSize, Math.ceil(Math.sqrt(Math.max(...groups.map((group) => group.length)))));
  const positions: CityState["positions"] = {};
  const rng = createRng(state.config.rngSeed + 7103);
  groups.forEach((group, index) => {
    const lots = shuffle(rng, Array.from({ length: blockSize * blockSize }, (_, slot) => slot));
    group.forEach((actor, slot) => {
      const lot = lots[slot]!;
      positions[actor.id] = [(index % 3) * blockSize + lot % blockSize, Math.floor(index / 3) * blockSize + Math.floor(lot / blockSize)];
    });
  });
  return { version: 1, blockSize, positions, trafficRound: state.currentRound, traffic: {}, roadLoads: {}, costs: {} };
}

export function createCity(state: GameState): CityState { return createMetropolis(state); }

export function prepareCityRound(state: GameState): void {
  const city = state.city;
  if (!city || city.trafficRound === state.currentRound || state.currentRound > state.config.totalRounds) return;
  city.traffic = city.roadLoads;
  city.roadLoads = {};
  city.costs = {};
  city.trafficRound = state.currentRound;
}

export function roadKey(a: CityPoint, b: CityPoint): string {
  const left = a.join(",");
  const right = b.join(",");
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

export function roadCongestion(city: CityState, a: CityPoint, b: CityPoint): number {
  return Math.min(CITY_RULES.maxCongestion, (city.traffic[roadKey(a, b)] ?? 0) / CITY_RULES.roadCapacity);
}

export interface CityRoute { points: CityPoint[]; distance: number; weightedDistance: number; congestion: number }
const routes = new WeakMap<CityState, { traffic: CityState["traffic"]; cache: Map<string, CityRoute> }>();

/** Dijkstra over the displayed orthogonal roads. Congested routes may be bypassed. */
export function findCityRoute(city: CityState, fromId: string, toId: string): CityRoute | undefined {
  if (city.artworkLayout || city.metropolisLayout) return artworkRoute(city, fromId, toId);
  const start = city.positions[fromId];
  const end = city.positions[toId];
  if (!start || !end) return undefined;
  let memo = routes.get(city);
  if (!memo || memo.traffic !== city.traffic) {
    memo = { traffic: city.traffic, cache: new Map() };
    routes.set(city, memo);
  }
  const cacheKey = `${fromId}:${start}|${toId}:${end}`;
  const cached = memo.cache.get(cacheKey);
  if (cached) return cached;
  const width = city.blockSize * 3;
  const height = city.blockSize * 2;
  const stride = width + 1;
  const size = stride * (height + 1);
  const source = start[1] * stride + start[0];
  const target = end[1] * stride + end[0];
  const distance = Array<number>(size).fill(Infinity);
  const previous = Array<number>(size).fill(-1);
  const heap: [number, number][] = [];
  function push(item: [number, number]) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= item[0]) break;
      heap[i] = heap[p]!;
      i = p;
    }
    heap[i] = item;
  }
  function pop(): [number, number] {
    const root = heap[0]!;
    const tail = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]![0] < heap[child]![0]) child++;
        if (heap[child]![0] >= tail[0]) break;
        heap[i] = heap[child]!;
        i = child;
      }
      heap[i] = tail;
    }
    return root;
  }
  distance[source] = 0;
  push([0, source]);
  while (heap.length) {
    const [cost, node] = pop();
    if (cost !== distance[node]) continue;
    if (node === target) break;
    const x = node % stride;
    const y = Math.floor(node / stride);
    const neighbors: CityPoint[] = [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]];
    for (const next of neighbors) {
      if (next[0] < 0 || next[0] > width || next[1] < 0 || next[1] > height) continue;
      const id = next[1] * stride + next[0];
      const candidate = cost + 1 + roadCongestion(city, [x, y], next);
      if (candidate < distance[id]!) {
        distance[id] = candidate;
        previous[id] = node;
        push([candidate, id]);
      }
    }
  }
  const points: CityPoint[] = [];
  for (let id = target; id !== -1; id = previous[id]!) points.push([id % stride, Math.floor(id / stride)]);
  points.reverse();
  // Half-block driveway at both ends is charged and drawn in the map overlay.
  const blocks = points.length;
  const weightedDistance = distance[target]! + 1;
  const result = { points, distance: blocks, weightedDistance, congestion: weightedDistance / blocks - 1 };
  memo.cache.set(cacheKey, result);
  return result;
}

export function transportQuote(state: GameState, fromId: string, toId: string, market: "wholesale" | "retail") {
  const route = state.city ? findCityRoute(state.city, fromId, toId) : undefined;
  const base = market === "wholesale" ? CITY_RULES.wholesaleBaseFee : CITY_RULES.retailBaseFee;
  const rate = market === "wholesale" ? CITY_RULES.wholesalePerBlock : CITY_RULES.retailPerBlock;
  return { route, perUnit: route ? Math.round((base + rate * route.weightedDistance) * 100) / 100 : 0 };
}

/** Quote copies only: stored market prices remain seller prices; all buyers pay transport separately. */
export function deliveredListings<L extends WholesaleListing | RetailListing>(state: GameState, buyerId: string, listings: readonly L[]): L[] {
  if (!state.city) return [...listings];
  return listings.map((listing) => {
    const wholesale = "companyId" in listing;
    const sellerId = wholesale ? listing.companyId : listing.storeId;
    const quote = transportQuote(state, sellerId, buyerId, wholesale ? "wholesale" : "retail");
    if (!quote.route) throw new Error(`City route missing: ${sellerId} → ${buyerId}`);
    const goodsPrice = listing.goodsPrice ?? listing.price;
    return { ...listing, goodsPrice, transportCostPerUnit: quote.perUnit, price: goodsPrice + quote.perUnit };
  });
}

export function recordTransport(state: GameState, fromId: string, toId: string, quantity: number, market: "wholesale" | "retail"): void {
  if (!state.city) return;
  const { route, perUnit } = transportQuote(state, fromId, toId, market);
  if (!route) throw new Error("Missing route during settlement");
  for (let i = 1; i < route.points.length; i++) {
    const key = roadKey(route.points[i - 1]!, route.points[i]!);
    state.city.roadLoads[key] = (state.city.roadLoads[key] ?? 0) + quantity;
  }
  const costs = state.city.costs[toId] ??= { rent: 0, transport: 0 };
  costs.transport += quantity * perUnit;
}

export function cityRent(state: GameState, id: ParticipantId, role: Role, districtId: DistrictId = "residential") {
  const base = role === "company" ? COSTS.baseRentCompany : role === "store" ? COSTS.baseRentStore : CITY_RULES.householdBaseRent;
  const districtBase = base * DISTRICTS[districtId].rentMultiplier;
  const city = state.city;
  const point = city?.positions[id];
  if (!city || !point) return { total: role === "household" ? 0 : districtBase, districtBase, accessibility: 0, density: 0, congestion: 0, factor: 1 };
  if (city.artworkLayout || city.metropolisLayout) {
    const { accessibility, density, congestion } = artworkRentInputs(city, id);
    const factor = (CITY_RULES.rentBaseFactor + CITY_RULES.rentAccessWeight * accessibility + CITY_RULES.rentDensityWeight * density) / (1 + CITY_RULES.rentCongestionDiscount * congestion);
    return { total: Math.round(districtBase * factor * 100) / 100, districtBase, accessibility, density, congestion, factor };
  }
  const width = city.blockSize * 3;
  const height = city.blockSize * 2;
  const distance = Math.abs(point[0] + 0.5 - width / 2) + Math.abs(point[1] + 0.5 - height / 2);
  const accessibility = Math.max(0, 1 - distance / ((width + height) / 2));
  const neighbors = Object.entries(city.positions).filter(([otherId, p]) => otherId !== id && Math.abs(p[0] - point[0]) + Math.abs(p[1] - point[1]) <= CITY_RULES.neighborhoodRadius).length;
  const density = Math.min(1, neighbors / CITY_RULES.neighborhoodCapacity);
  const adjacent: CityPoint[] = [[point[0] + 1, point[1]], [point[0], point[1] + 1], [point[0] - 1, point[1]], [point[0], point[1] - 1]];
  const valid = adjacent.filter(([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height);
  const congestion = valid.reduce((sum, p) => sum + roadCongestion(city, point, p), 0) / valid.length;
  const factor = (CITY_RULES.rentBaseFactor + CITY_RULES.rentAccessWeight * accessibility + CITY_RULES.rentDensityWeight * density) / (1 + CITY_RULES.rentCongestionDiscount * congestion);
  return { total: Math.round(districtBase * factor * 100) / 100, districtBase, accessibility, density, congestion, factor };
}

