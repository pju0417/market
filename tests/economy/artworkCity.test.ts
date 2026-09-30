import {describe,it,expect} from 'vitest';
import {buildInitialGameState,createAutoPlayPhaseHandlers} from '../../src/engine/simulateGame.js';
import {cityActors,findCityRoute,recordTransport,prepareCityRound,roadKey} from '../../src/economy/city.js';
import {createArtworkCity as createCity,ART_LOTS,artLocation,artworkGraph} from '../../src/economy/artworkCity.js';
import {RoundEngine} from '../../src/engine/RoundEngine.js';
import {createRng} from '../../src/economy/rng.js';
import {serializeLiveState,deserializeLiveState} from '../../src/appsScript/sheetSchema.js';
describe('painted map geometry',()=>{
  it.each([1,20,40])('assigns %i players unique real buildings and connected roads',count=>{
    const state=buildInitialGameState(count,42);state.city=createCity(state);const city=state.city;
    expect(new Set(Object.values(city.positions).map(p=>p.join(','))).size).toBe(cityActors(state).length);
    for(const a of cityActors(state)){const loc=artLocation(city.positions[a.id]!);expect(ART_LOTS[loc.lot]!.role).toBe(a.role);expect(city.zoneDistricts![loc.zone]).toBe(a.districtId);}
    const route=findCityRoute(city,'student-1-company','student-1-store')!;expect(route.distance).toBeGreaterThan(0);
    const {nodes,edges}=artworkGraph(city);const keys=new Set(edges.map(([a,b])=>roadKey(nodes[a]!,nodes[b]!)));
    route.points.slice(1).forEach((p,i)=>expect(keys.has(roadKey(route.points[i]!,p))).toBe(true));
    const before=route.weightedDistance;recordTransport(state,'student-1-company','student-1-store',50,'wholesale');state.currentRound++;prepareCityRound(state);
    expect(findCityRoute(city,'student-1-company','student-1-store')!.weightedDistance).toBeGreaterThan(before);
  });
  it.each([1,5,20])('finishes seven rounds for %i players and restores the painted map',async count=>{
    const state=buildInitialGameState(count,42);state.city=createCity(state);
    await new RoundEngine(state,createAutoPlayPhaseHandlers(createRng(43))).runGame();
    expect(state.roundMetrics).toHaveLength(7);for(const a of cityActors(state)){expect(Number.isFinite(a.ledger.cash)).toBe(true);expect(a.ledger.cash).toBeGreaterThanOrEqual(0);}
    const json=serializeLiveState(state);expect(json.length).toBeLessThan(50000);expect(deserializeLiveState(json,state.roundMetrics)).toEqual(state);
  },60000);
});
