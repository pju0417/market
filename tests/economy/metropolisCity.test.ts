import { describe, it, expect } from 'vitest';
import { buildInitialGameState, createAutoPlayPhaseHandlers } from '../../src/engine/simulateGame.js';
import { cityActors, createCity, findCityRoute, roadKey, recordTransport, prepareCityRound, cityRent } from '../../src/economy/city.js';
import { relocateSchoolTenants, CITY_BUILDINGS, CITY_NODES, CITY_GRAPH_NODES, CITY_GRAPH_EDGES } from '../../src/economy/metropolisCity.js';
import { RoundEngine } from '../../src/engine/RoundEngine.js';
import { createRng } from '../../src/economy/rng.js';
import { serializeLiveState, deserializeLiveState } from '../../src/appsScript/sheetSchema.js';

describe('single shared metropolis',()=>{
  it('relocates legacy school tenants without losing units or costs',()=>{
    const state=buildInitialGameState(5,42);const city=createCity(state);
    const ids=Object.keys(city.addresses!);
    city.addresses![ids[0]!]={building:0,unit:1};city.addresses![ids[1]!]={building:1,unit:1};
    city.costs[ids[0]!]={rent:10,transport:2};
    relocateSchoolTenants(city);
    expect(Object.values(city.addresses!).every(a=>a.building>1)).toBe(true);
    expect(new Set(Object.values(city.addresses!).map(a=>`${a.building}:${a.unit}`)).size).toBe(ids.length);
    expect(city.costs[ids[0]!]).toEqual({rent:10,transport:2});
    expect(findCityRoute(city,ids[0]!,ids[1]!)).toBeDefined();
    const snapshot=JSON.stringify(city);relocateSchoolTenants(city);expect(JSON.stringify(city)).toBe(snapshot);
  });
  it.each([1,5,20,40])('assigns %i players unique units in six neighborhoods of one fixed city',count=>{
    const state=buildInitialGameState(count,42);state.city=createCity(state);const city=state.city;
    expect(city.metropolisLayout).toBe(true);expect(city.blockSize).toBe(6);expect(createCity(state)).toEqual(city);
    const actors=cityActors(state),addresses=city.addresses!;
    expect(Object.keys(addresses)).toHaveLength(actors.length);
    expect(new Set(Object.values(addresses).map(a=>`${a.building}:${a.unit}`)).size).toBe(actors.length);
    const roads=new Set(CITY_GRAPH_EDGES.map(([a,b])=>roadKey(CITY_GRAPH_NODES[a]!,CITY_GRAPH_NODES[b]!)));
    for(const actor of actors){
      const address=addresses[actor.id]!,building=CITY_BUILDINGS[address.building]!;
      expect(address.building).toBeGreaterThan(1);
      expect(building.district).toBe(actor.districtId);
      expect(city.positions[actor.id]).toEqual(CITY_GRAPH_NODES[CITY_NODES.length+address.building]);
      const route=findCityRoute(city,actor.id,actors[0]!.id)!;expect(route).toBeDefined();
      route.points.slice(1).forEach((p,i)=>expect(roads.has(roadKey(route.points[i]!,p))).toBe(true));
      expect(Number.isFinite(cityRent(state,actor.id,actor.role,actor.districtId).total)).toBe(true);
    }
    const before=findCityRoute(city,'student-1-company','student-1-store')!;
    recordTransport(state,'student-1-company','student-1-store',50,'wholesale');state.currentRound++;prepareCityRound(state);
    expect(findCityRoute(city,'student-1-company','student-1-store')!.weightedDistance).toBeGreaterThan(before.weightedDistance);
  });
  it.each([1,5,20,40])('runs seven rounds with %i players and preserves every address through storage',async count=>{
    const state=buildInitialGameState(count,42);state.city=createCity(state);
    await new RoundEngine(state,createAutoPlayPhaseHandlers(createRng(43))).runGame();
    expect(state.roundMetrics).toHaveLength(7);
    for(const actor of cityActors(state)){expect(Number.isFinite(actor.ledger.cash)).toBe(true);expect(actor.ledger.cash).toBeGreaterThanOrEqual(0);if('inventoryQuantity' in actor)expect(actor.inventoryQuantity).toBeGreaterThanOrEqual(0);}
    const json=serializeLiveState(state);
    // Sheets deployment is validated for 20 students; larger local games still round-trip.
    if(count<=20)expect(json.length).toBeLessThan(50000);
    expect(deserializeLiveState(json,state.roundMetrics)).toEqual(state);
  },60000);
});
