import type { CityPoint, CityState, DistrictId, GameState } from '../types/domain.js';
import { cityActors } from './city.js';

// One painting, one coordinate system. Districts are neighborhoods, not map tiles.
export const CITY_DISTRICTS: { id: DistrictId; center: CityPoint; boundary: string; color: string }[] = [
  {id:'school-area',center:[250,210],boundary:'0,65 390,65 440,210 395,400 0,425',color:'#469caf'},
  {id:'residential',center:[660,250],boundary:'390,65 905,110 870,350 685,390 570,440 395,400 440,210',color:'#7b9c57'},
  {id:'upscale',center:[1120,255],boundary:'905,110 1250,60 1370,170 1320,435 1020,440 870,350',color:'#9c7fba'},
  {id:'downtown',center:[730,505],boundary:'395,400 570,440 685,390 870,350 1020,440 1180,560 1010,650 780,620 565,665 390,580',color:'#dbab50'},
  {id:'industrial',center:[250,565],boundary:'0,425 395,400 390,580 565,665 435,760 85,735 0,600',color:'#c98659'},
  {id:'outskirts',center:[1130,775],boundary:'1320,435 1485,480 1536,1024 430,1024 435,760 565,665 780,620 1010,650 1180,560',color:'#70a77a'},
];

// Street junctions and bends traced over visible streets on metropolis-v3.png.
export const CITY_NODES: CityPoint[] = [
  [418,112],[449,205],[375,242],[231,303],[182,265],[97,253],[120,365],[228,377],
  [323,420],[373,463],[390,539],[482,623],[385,682],[265,703],[144,661],
  [564,250],[551,290],[471,306],[456,348],[585,342],[643,386],[687,327],
  [788,270],[868,227],[855,333],[949,397],[1014,414],[1080,352],[1153,346],[1262,303],
  [1339,300],[1329,226],[1289,154],[1167,152],[1028,157],[915,137],[846,180],
  [975,528],[1101,516],[1173,510],[1208,572],[1150,614],[1283,645],[1315,680],
  [1235,727],[1178,795],[1193,853],[1310,924],[1095,939],[1058,877],[960,818],
  [816,758],[856,697],[886,648],[1005,615],[783,607],[621,600],[584,556],[635,477],
  [723,469],[803,505],[790,555],[730,587],[672,567],[653,517],[546,505],[523,473],
  [609,421],[561,395],[743,379],[856,451],[1236,396],[1254,482],
];
export const CITY_EDGES: [number,number][] = [
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,3],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13],[13,14],[14,10],
  [1,15],[15,16],[16,17],[17,2],[17,18],[18,8],[18,19],[19,16],[19,20],[20,21],[21,22],[22,23],[23,24],[24,21],
  [24,25],[25,26],[26,27],[27,28],[28,29],[29,30],[30,31],[31,32],[32,33],[33,34],[34,35],[35,36],[36,23],[36,22],
  [26,37],[37,38],[38,39],[39,40],[40,41],[41,42],[42,43],[43,44],[44,45],[45,46],[46,47],[46,48],[48,49],[49,50],[50,51],[51,52],[52,53],[53,54],[54,41],[54,38],
  [53,55],[55,56],[56,11],[56,57],[57,58],[58,59],[59,60],[60,61],[61,62],[62,63],[63,64],[64,58],[62,55],[64,57],
  [57,65],[65,10],[65,66],[66,9],[66,67],[67,68],[68,18],[68,19],[67,20],[20,69],[69,24],[59,69],[60,70],[70,25],[70,37],[37,61],[29,71],[71,72],[72,39],
];

interface CityBuilding { district: DistrictId; center: CityPoint; entrance: number; name: string }
export const CITY_BUILDINGS: CityBuilding[] = [
  {district:'school-area',center:[138,225],entrance:4,name:'학교길 1'},
  {district:'school-area',center:[185,179],entrance:4,name:'학교길 2'},
  {district:'school-area',center:[70,331],entrance:6,name:'학교길 3'},
  {district:'school-area',center:[312,310],entrance:7,name:'학교길 4'},
  {district:'school-area',center:[367,358],entrance:8,name:'학교길 5'},
  {district:'residential',center:[498,159],entrance:1,name:'벚꽃길 1'},
  {district:'residential',center:[568,188],entrance:15,name:'벚꽃길 2'},
  {district:'residential',center:[497,257],entrance:17,name:'벚꽃길 3'},
  {district:'residential',center:[659,259],entrance:19,name:'벚꽃길 4'},
  {district:'residential',center:[710,199],entrance:22,name:'벚꽃길 5'},
  {district:'residential',center:[785,151],entrance:36,name:'벚꽃길 6'},
  {district:'residential',center:[805,233],entrance:22,name:'벚꽃길 7'},
  {district:'residential',center:[754,317],entrance:21,name:'벚꽃길 8'},
  {district:'upscale',center:[975,198],entrance:34,name:'강변길 1'},
  {district:'upscale',center:[1112,116],entrance:33,name:'강변길 2'},
  {district:'upscale',center:[1050,261],entrance:27,name:'강변길 3'},
  {district:'upscale',center:[1206,247],entrance:29,name:'강변길 4'},
  {district:'upscale',center:[909,295],entrance:24,name:'강변길 5'},
  {district:'upscale',center:[975,348],entrance:25,name:'강변길 6'},
  {district:'downtown',center:[516,370],entrance:68,name:'중앙로 1'},
  {district:'downtown',center:[627,374],entrance:67,name:'중앙로 2'},
  {district:'downtown',center:[445,416],entrance:9,name:'중앙로 3'},
  {district:'downtown',center:[481,454],entrance:66,name:'중앙로 4'},
  {district:'downtown',center:[590,496],entrance:65,name:'중앙로 5'},
  {district:'downtown',center:[745,419],entrance:59,name:'중앙로 6'},
  {district:'downtown',center:[853,429],entrance:70,name:'중앙로 7'},
  {district:'downtown',center:[993,457],entrance:37,name:'중앙로 8'},
  {district:'downtown',center:[914,512],entrance:37,name:'중앙로 9'},
  {district:'downtown',center:[1070,511],entrance:38,name:'중앙로 10'},
  {district:'industrial',center:[174,490],entrance:10,name:'공방로 1'},
  {district:'industrial',center:[245,524],entrance:10,name:'공방로 2'},
  {district:'industrial',center:[92,530],entrance:14,name:'공방로 3'},
  {district:'industrial',center:[353,589],entrance:11,name:'공방로 4'},
  {district:'industrial',center:[210,640],entrance:13,name:'공방로 5'},
  {district:'industrial',center:[433,526],entrance:10,name:'공방로 6'},
  {district:'outskirts',center:[1137,447],entrance:39,name:'들녘길 1'},
  {district:'outskirts',center:[1248,470],entrance:72,name:'들녘길 2'},
  {district:'outskirts',center:[1173,657],entrance:42,name:'들녘길 3'},
  {district:'outskirts',center:[1419,711],entrance:43,name:'들녘길 4'},
  {district:'outskirts',center:[940,744],entrance:51,name:'들녘길 5'},
  {district:'outskirts',center:[1040,850],entrance:49,name:'들녘길 6'},
  {district:'outskirts',center:[876,601],entrance:53,name:'들녘길 7'},
];

// Each building has its own frontage; tenants share that entrance. Short access
// lanes join the street graph so two nearby buildings never have zero distance.
export const CITY_GRAPH_NODES: CityPoint[] = [...CITY_NODES, ...CITY_BUILDINGS.map((b):CityPoint=>[b.center[0],b.center[1]+35])];
export const CITY_GRAPH_EDGES: [number,number][] = [...CITY_EDGES, ...CITY_BUILDINGS.map((b,i):[number,number]=>[b.entrance,CITY_NODES.length+i])];

export function createMetropolis(state: GameState): CityState {
  const positions: CityState['positions'] = {}, addresses: NonNullable<CityState['addresses']> = {};
  const occupancy = CITY_BUILDINGS.map(()=>0);
  for (const actor of cityActors(state).sort((a,b)=>a.id.localeCompare(b.id,'en'))) {
    const candidates = CITY_BUILDINGS.map((building,index)=>({building,index})).filter(({building,index})=>index>1&&building.district===actor.districtId);
    const {index} = candidates.reduce((a,b)=>occupancy[a.index]!<=occupancy[b.index]! ? a : b);
    addresses[actor.id] = {building:index,unit:++occupancy[index]!};
    positions[actor.id] = [...CITY_GRAPH_NODES[CITY_NODES.length+index]!] as CityPoint;
  }
  return {version:1,metropolisLayout:true,addresses,blockSize:6,positions,trafficRound:state.currentRound,traffic:{},roadLoads:{},costs:{}};
}

/** The modern painting's first two lots belong to the school campus, not businesses. */
export function relocateSchoolTenants(city: CityState | undefined): void {
  if(!city?.metropolisLayout || !city.addresses)return;
  for(const [id,address] of Object.entries(city.addresses)) {
    if(address.building>1)continue;
    const candidates=[2,3,4];
    const count=(building:number)=>Object.values(city.addresses!).filter(a=>a.building===building).length;
    const building=candidates.reduce((a,b)=>count(a)<=count(b)?a:b);
    const unit=Math.max(0,...Object.values(city.addresses).filter(a=>a.building===building).map(a=>a.unit))+1;
    city.addresses[id]={building,unit};
    city.positions[id]=[...CITY_GRAPH_NODES[CITY_NODES.length+building]!] as CityPoint;
  }
}

export function cityAddress(city: CityState,id: string) {
  const address=city.addresses?.[id];
  return address ? `${CITY_BUILDINGS[address.building]!.name} · ${address.unit}호` : '';
}
