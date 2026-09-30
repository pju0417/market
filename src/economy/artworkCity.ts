import { DISTRICT_IDS } from "./config.js";
import { CITY_GRAPH_NODES, CITY_GRAPH_EDGES } from './metropolisCity.js';
import type { CityPoint, CityState, GameState } from '../types/domain.js';
import { roadCongestion, type CityRoute } from './city.js';

/** Pixel coordinates on the unmodified 1536 × 1024 painting. */
export const ART_LOTS = [
  { role: 'company', center: [310, 411], door: [390, 523], size: [370, 260] },
  { role: 'store', center: [786, 495], door: [776, 607], size: [260, 200] },
  { role: 'household', center: [1200, 419], door: [1150, 544], size: [245, 210] },
  { role: 'household', center: [292, 161], door: [320, 233], size: [115, 120] },
  { role: 'household', center: [463, 213], door: [456, 285], size: [135, 125] },
  { role: 'household', center: [681, 292], door: [673, 358], size: [115, 120] },
  { role: 'household', center: [908, 348], door: [894, 407], size: [120, 120] },
  { role: 'household', center: [1210, 275], door: [1190, 338], size: [115, 110] },
  { role: 'household', center: [1068, 612], door: [1050, 690], size: [115, 125] },
  { role: 'household', center: [1328, 686], door: [1290, 754], size: [130, 110] },
  { role: 'household', center: [994, 780], door: [955, 852], size: [130, 130] },
] as const;
// Junctions and bends hand traced on visible paved roads, including bridge approach.
export const ART_NODES: CityPoint[] = [[320,233],[456,285],[539,316],[645,202],[800,247],[850,277],[673,358],[638,393],[755,386],[894,407],[975,437],[1040,335],[1116,219],[976,173],[1016,123],[1061,74],[1150,544],[1005,530],[914,661],[776,607],[526,529],[448,612],[475,734],[637,800],[790,850],[832,771],[1050,690],[1177,733],[1290,754],[1344,592],[1190,338],[1357,292],[390,523],[955,852],[892,151],[818,235]];
export const ART_EDGES: [number,number][] = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,8],[8,6],[6,2],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,34],[34,35],[35,4],[13,14],[14,15],[10,17],[17,16],[17,18],[18,19],[19,20],[20,7],[20,21],[21,22],[22,23],[23,24],[24,25],[25,18],[18,26],[26,27],[27,28],[27,29],[29,16],[11,30],[30,31],[31,29],[32,21],[32,20],[33,25],[33,27]];
export const ART_STRIDE = 1800;
export function artLocation(point: CityPoint) {
  const zone = Math.floor(point[0] / ART_STRIDE);
  const lot = ART_LOTS.findIndex((item) => item.door[0] === point[0] - zone * ART_STRIDE && item.door[1] === point[1]);
  return { zone, lot };
}
export function createArtworkCity(state: GameState): CityState {
  const companies = Object.values(state.companies).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const stores = Object.values(state.stores).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const homes = Object.values(state.households).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const positions: CityState['positions'] = {};
  const zoneDistricts: NonNullable<CityState['zoneDistricts']> = [];
  const place = (id: string, zone: number, lot: number) => { const p = ART_LOTS[lot]!.door; positions[id] = [zone * ART_STRIDE + p[0], p[1]]; };
  for(const district of DISTRICT_IDS){
    const c=companies.filter(a=>a.districtId===district),s=stores.filter(a=>a.districtId===district),h=district==='residential'?homes:[];
    const count=Math.max(c.length,s.length,Math.ceil(h.length/9));const offset=zoneDistricts.length;
    for(let i=0;i<count;i++)zoneDistricts.push(district);
    c.forEach((a,i)=>place(a.id,offset+i,0));s.forEach((a,i)=>place(a.id,offset+i,1));h.forEach((a,i)=>place(a.id,offset+i%count,2+Math.floor(i/count)));
  }
  return {version:1, artworkLayout:true,zoneDistricts,blockSize:zoneDistricts.length,positions,trafficRound:state.currentRound,traffic:{},roadLoads:{},costs:{}};

}
export function artworkGraph(city: CityState) {
  if (city.metropolisLayout) return {nodes:CITY_GRAPH_NODES,edges:CITY_GRAPH_EDGES};
  const nodes: CityPoint[] = []; const edges: [number,number][] = [];
  for(let zone=0;zone<city.blockSize;zone++) {
    const offset=nodes.length;
    nodes.push(...ART_NODES.map(([x,y]):CityPoint=>[x+zone*ART_STRIDE,y]));
    edges.push(...ART_EDGES.map(([a,b]):[number,number]=>[a+offset,b+offset]));
    if(zone>0) edges.push([offset-ART_NODES.length+15,offset+15]);
  }
  return {nodes,edges};
}
const routeCache = new WeakMap<CityState, { traffic: CityState["traffic"]; routes: Map<string, CityRoute> }>();
function segmentLength(a: CityPoint,b: CityPoint){return Math.floor(a[0]/ART_STRIDE)!==Math.floor(b[0]/ART_STRIDE)?5:Math.hypot(a[0]-b[0],a[1]-b[1])/100;}
export function artworkRoute(city: CityState, from: string, to: string): CityRoute | undefined {
  const start=city.positions[from], end=city.positions[to]; if(!start||!end)return undefined;
  let memo=routeCache.get(city); if(!memo||memo.traffic!==city.traffic){memo={traffic:city.traffic,routes:new Map()};routeCache.set(city,memo);}
  const key=`${start}|${end}`;const cached=memo.routes.get(key);if(cached)return cached;
  const {nodes,edges}=artworkGraph(city);
  const index=(p:CityPoint)=>nodes.findIndex(n=>n[0]===p[0]&&n[1]===p[1]);
  const source=index(start),target=index(end); if(source<0||target<0)return undefined;
  const adj=nodes.map(()=>[] as number[]); for(const [a,b] of edges){adj[a]!.push(b);adj[b]!.push(a);}
  const costs=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),visited=new Set<number>(); costs[source]=0;
  while(visited.size<nodes.length){
    let current=-1; for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(current<0||costs[i]!<costs[current]!))current=i;
    if(current<0||!Number.isFinite(costs[current]!)||current===target)break;
    visited.add(current);
    for(const next of adj[current]!){const a=nodes[current]!,b=nodes[next]!; const length=segmentLength(a,b); const cost=costs[current]!+length*(1+roadCongestion(city,a,b)); if(cost<costs[next]!){costs[next]=cost;prev[next]=current;}}
  }
  if(!Number.isFinite(costs[target]!))return undefined;
  const points:CityPoint[]=[];for(let i=target;i!==-1;i=prev[i]!)points.push(nodes[i]!);points.reverse();
  const distance=points.slice(1).reduce((sum,p,i)=>sum+segmentLength(points[i]!,p),0);
  const result={points,distance,weightedDistance:costs[target]!,congestion:distance?costs[target]!/distance-1:0};memo.routes.set(key,result);return result;
}
export function artworkRentInputs(city:CityState,id:string){
  const point=city.positions[id]!;const zone=city.metropolisLayout?0:artLocation(point).zone; const local:CityPoint=[point[0]-zone*ART_STRIDE,point[1]];
  const plaza=city.metropolisLayout?[720,515]:[776,607];
  const accessibility=Math.max(0,1-Math.hypot(local[0]-plaza[0]!,local[1]-plaza[1]!)/1000);
  const density=Math.min(1,Object.entries(city.positions).filter(([other,p])=>other!==id&&Math.hypot(p[0]-point[0],p[1]-point[1])<350).length/6);
  const {nodes,edges}=artworkGraph(city);const adjacent=edges.filter(([a,b])=>[nodes[a],nodes[b]].some(p=>p![0]===point[0]&&p![1]===point[1]));
  const congestion=adjacent.reduce((sum,[a,b])=>sum+roadCongestion(city,nodes[a]!,nodes[b]!),0)/Math.max(1,adjacent.length);
  return {accessibility,density,congestion};
}
