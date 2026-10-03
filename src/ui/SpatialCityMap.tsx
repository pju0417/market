import { DISTRICT_LABELS } from "./labels.js";
import { useEffect, useRef, useState } from 'react';
import type { GameState, PlayerState, Role } from '../types/domain.js';
import { cityActors, findCityRoute, roadCongestion } from '../economy/city.js';
import { ART_LOTS, ART_NODES, ART_EDGES, ART_STRIDE, artLocation } from '../economy/artworkCity.js';
import { GridCityMap } from './GridCityMap.js';
import { MetropolisMap } from './MetropolisMap.js';
export { ownerName } from './GridCityMap.js';
import { ownerName } from './GridCityMap.js';
const ART = new URL('./assets/city-map-v1.png',import.meta.url).href;
const ROLES = {company:'공장',store:'가게',household:'집'};
interface Props {state:GameState;player:PlayerState;selectedId?:string|undefined;activeRole?:Role|undefined;onSelect:(id:string)=>void}
export function SpatialCityMap(props:Props){
  return props.state.city?.metropolisLayout ? <MetropolisMap {...props}/> : props.state.city?.artworkLayout ? <PaintedCity {...props}/> : <GridCityMap {...props}/>;
}
function PaintedCity({state,player,selectedId,activeRole,onSelect}:Props){
  const city=state.city!;
  const world = useRef<SVGSVGElement>(null);
  const columns = Math.ceil(Math.sqrt(city.blockSize));
  const rows = Math.ceil(city.blockSize / columns);
  const origin = (zone: number) => { const row=Math.floor(zone/columns); return [(row%2 ? columns-1-zone%columns : zone%columns)*1696+80,row*1184+80]; };
  function focusElement(element: Element | null) {
    const viewport=world.current?.closest('.city-map-viewport');
    if(!viewport || !element)return;
    const target=element.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
    viewport.scrollTo({left:viewport.scrollLeft+target.left-frame.left-(frame.width-target.width)/2,top:viewport.scrollTop+target.top-frame.top-(frame.height-target.height)/2,behavior:'smooth'});
  }
  const goToZone=(zone:number)=>focusElement(world.current?.querySelector(`[data-zone="${zone}"]`) ?? null);
  useEffect(()=>{
    const id=selectedId ?? player.companyId;
    focusElement(world.current?.querySelector(`[data-building="${id}"]`) ?? null);
  },[selectedId,player.companyId]);
  const [traffic,setTraffic]=useState(false);
  const actors=cityActors(state);
  const selected=actors.find(a=>a.id===selectedId);
  const buyerId=selected?.role==='company'?player.storeId:selected?.role==='store'?player.householdId:undefined;
  const route=selected&&buyerId&&selected.ownerId!==player.id?findCityRoute(city,selected.id,buyerId):undefined;

  const choose=(id:string)=>{onSelect(id);focusElement(world.current?.querySelector(`[data-building="${id}"]`) ?? null);};
  return <>
    <div className="painted-directory">
      <label>구역으로 이동 <select value="" onChange={e=>goToZone(Number(e.target.value))}><option value="" disabled>도시 구역 선택</option>{Array.from({length:city.blockSize},(_,i)=><option key={i} value={i}>{city.zoneDistricts?.[i] ? DISTRICT_LABELS[city.zoneDistricts[i]!] : "마을"} {i+1}</option>)}</select></label>
      <label>건물 찾기 <select value="" onChange={e=>choose(e.target.value)}><option value="" disabled>플레이어 · 건물 선택</option>{actors.map(a=><option value={a.id} key={a.id}>{ownerName(state,a.ownerId)} · {ROLES[a.role]} · 마을 {artLocation(city.positions[a.id]!).zone+1}</option>)}</select></label>
      <button onClick={()=>setTraffic(v=>!v)} aria-pressed={traffic}>교통 {traffic?'숨기기':'보기'}</button>
      <span>하나의 도시 · {city.blockSize}구역 · {actors.length}채</span>
    </div>
    <svg ref={world} className="painted-city-svg continuous-city" style={{width:`calc(${columns * 1100}px * var(--city-zoom, 1))`}} viewBox={`0 0 ${columns*1696+160} ${rows*1184+160}`} aria-label="모든 플레이어가 함께 사용하는 전체 도시. 드래그해서 구역 사이를 이동하세요">
      <rect width="100%" height="100%" fill="#acc895"/>
      {Array.from({length:city.blockSize-1},(_,i)=>{
        const a=origin(i),b=origin(i+1);const ax=a[0]!+1061,ay=a[1]!+74,bx=b[0]!+1061,by=b[1]!+74;
        const side=a[0]!+1600;
        const d=a[1]===b[1]?`M${ax},${ay} V${a[1]!-40} H${bx} V${by}`:`M${ax},${ay} V${a[1]!-40} H${side} V${b[1]!-40} H${bx} V${by}`;
        const onRoute=route?.points.some((p,j)=>j>0&&Math.min(Math.floor(p[0]/ART_STRIDE),Math.floor(route.points[j-1]![0]/ART_STRIDE))===i&&Math.abs(Math.floor(p[0]/ART_STRIDE)-Math.floor(route.points[j-1]![0]/ART_STRIDE))===1);
        return <g key={`connection-${i}`} pointerEvents="none"><path d={d} fill="none" stroke="#8ca779" strokeWidth="36" strokeLinejoin="round"/><path d={d} fill="none" stroke="#eee0b8" strokeWidth="24" strokeLinejoin="round"/>{onRoute&&<path d={d} fill="none" stroke="#176dac" strokeWidth="8" strokeDasharray="14 9"/>}</g>;
      })}
      {Array.from({length:city.blockSize},(_,zone)=>{
        const offset=origin(zone);
        const visible=actors.filter(a=>artLocation(city.positions[a.id]!).zone===zone);
        return <g key={zone} transform={`translate(${offset[0]} ${offset[1]})`}>
      <rect data-zone={zone} width="1536" height="1024" fill="#c3d6a6"/>

      <image href={ART} width="1536" height="1024"/>
      {traffic&&ART_EDGES.map(([a,b])=>{const p=ART_NODES[a]!,q=ART_NODES[b]!;const load=roadCongestion(city,[p[0]+zone*ART_STRIDE,p[1]],[q[0]+zone*ART_STRIDE,q[1]]);return <path key={`${a}-${b}`} d={`M${p}L${q}`} fill="none" stroke={load>=1?'#e87343':load>0?'#edc664':'#7eac85'} strokeWidth="7" opacity="0.7" pointerEvents="none"/>;})}
      {route?.points.slice(1).map((b,i)=>{const a=route.points[i]!;if(Math.floor(a[0]/ART_STRIDE)!==zone||Math.floor(b[0]/ART_STRIDE)!==zone)return null;return <path key={i} d={`M${a[0]-zone*ART_STRIDE},${a[1]}L${b[0]-zone*ART_STRIDE},${b[1]}`} fill="none" stroke="#176dac" strokeWidth="8" strokeDasharray="14 9" pointerEvents="none"/>;})}
      {visible.map(actor=>{
        const {lot}=artLocation(city.positions[actor.id]!);const spot=ART_LOTS[lot]!;const [x,y]=spot.center;const [w,h]=spot.size;const own=actor.ownerId===player.id;const active=own&&actor.role===activeRole;
        return <g key={actor.id} data-building={actor.id} role="button" tabIndex={0} aria-label={`${ownerName(state,actor.ownerId)}의 ${ROLES[actor.role]}`} aria-pressed={actor.id===selectedId} className={`painted-building ${own?'owned':''} ${actor.id===selectedId?'selected':''}`} onClick={()=>onSelect(actor.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(actor.id);}}}>
          <title>{ownerName(state,actor.ownerId)} · {ROLES[actor.role]}</title>
          <rect className="painted-hit" x={x-w/2} y={y-h/2} width={w} height={h} rx="24"/>
          <g className={`painted-label ${own||actor.id===selectedId?'always':''}`} transform={`translate(${x} ${y+h/2+8})`} pointerEvents="none"><rect x="-65" y="-15" width="130" height="28" rx="14"/><text textAnchor="middle" y="4">{own?'내':ownerName(state,actor.ownerId)} {ROLES[actor.role]}</text></g>
          {active&&<g transform={`translate(${x} ${y-h/2-10})`} pointerEvents="none"><rect x="-38" y="-15" width="76" height="28" rx="14" fill="#fff3c4"/><text textAnchor="middle" y="4" fontSize="14" fill="#745424">지금 내 차례</text></g>}
        </g>;
      })}
      <g transform="translate(1080 57)" className="painted-gateway"><rect x="-110" y="-23" width="220" height="33" rx="16" fill="#fff9e6e8"/><text textAnchor="middle" fontSize="15" fill="#345849">구역 연결 도로 · 5블록</text></g>
      <g transform="translate(200 52)" pointerEvents="none"><rect x="-150" y="-28" width="300" height="52" rx="24" fill="#fff9e9ed"/><text textAnchor="middle" y="6" fontSize="22" fill="#34523e">{city.zoneDistricts?.[zone] ? DISTRICT_LABELS[city.zoneDistricts[zone]!] : '마을'} · {zone+1}구역</text></g>
      </g>;
      })}
    </svg>
    <div className="painted-caption">지도를 드래그해서 도시를 둘러보세요. 모든 구역이 하나의 지도에 연결되어 있어요. 건물 찾기와 구역 이동은 지도 위 해당 위치로 이동합니다.</div>
  </>;
}

