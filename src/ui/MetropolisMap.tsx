import { useEffect, useRef, useState } from 'react';
import type { GameState, PlayerState, Role } from '../types/domain.js';
import { CITY_BUILDINGS, CITY_DISTRICTS, CITY_GRAPH_NODES as CITY_NODES, CITY_GRAPH_EDGES as CITY_EDGES, cityAddress } from '../economy/metropolisCity.js';
import { cityActors, findCityRoute, roadCongestion } from '../economy/city.js';
import { ownerName } from './GridCityMap.js';
import { DISTRICT_LABELS } from './labels.js';

const ART = new URL('./assets/metropolis-modern-v5.png',import.meta.url).href;
const ROLES = {company:'공장',store:'가게',household:'집'};
interface Props {state:GameState;player:PlayerState;selectedId?:string|undefined;activeRole?:Role|undefined;onSelect:(id:string)=>void}

export function MetropolisMap({state,player,selectedId,onSelect}:Props) {
  const city=state.city!;
  const world=useRef<SVGSVGElement>(null);
  const [districts,setDistricts]=useState(true);
  const [traffic,setTraffic]=useState(false);
  const [clarity,setClarity]=useState(true);
  const actors=cityActors(state);
  const ownBuildings=CITY_BUILDINGS.filter((_,index)=>actors.some(a=>a.ownerId===player.id&&city.addresses?.[a.id]?.building===index));
  const selected=actors.find(a=>a.id===selectedId);
  const buildingId=selectedId?city.addresses?.[selectedId]?.building:undefined;
  const tenants=actors.filter(a=>city.addresses?.[a.id]?.building===buildingId);
  function focus(selector:string) {
    const viewport=world.current?.closest('.city-map-viewport'),element=world.current?.querySelector(selector);
    if(!viewport||!element)return;
    const target=element.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
    viewport.scrollTo({left:viewport.scrollLeft+target.left-frame.left-(frame.width-target.width)/2,top:viewport.scrollTop+target.top-frame.top-(frame.height-target.height)/2,behavior:'smooth'});
  }
  useEffect(()=>{focus(buildingId!==undefined?`[data-city-building="${buildingId}"]`:'[data-city-district="downtown"]');},[buildingId]);
  const buyer=selected?.role==='company'?player.storeId:selected?.role==='store'?player.householdId:undefined;
  const route=selected&&buyer&&selected.ownerId!==player.id?findCityRoute(city,selected.id,buyer):undefined;
  const choose=(id:string)=>{onSelect(id);const address=city.addresses?.[id];if(address)focus(`[data-city-building="${address.building}"]`);};
  return <>
    <div className="painted-directory metropolis-directory">
      <label>구역으로 이동 <select value="" onChange={e=>focus(`[data-city-district="${e.target.value}"]`)}><option value="" disabled>도시 둘러보기</option>{CITY_DISTRICTS.map(d=><option key={d.id} value={d.id}>{DISTRICT_LABELS[d.id]}</option>)}</select></label>
      <label>건물 찾기 <select value={selectedId??''} onChange={e=>choose(e.target.value)}><option value="" disabled>플레이어 · 건물 선택</option>{actors.map(a=><option key={a.id} value={a.id}>{ownerName(state,a.ownerId)} · {ROLES[a.role]} · {cityAddress(city,a.id)}</option>)}</select></label>
      <button aria-pressed={districts} onClick={()=>setDistricts(v=>!v)}>구역 {districts?'숨기기':'보기'}</button>
      <button aria-pressed={traffic} onClick={()=>setTraffic(v=>!v)}>교통 {traffic?'숨기기':'보기'}</button>
      <button aria-pressed={clarity} onClick={()=>setClarity(v=>!v)}>건물·도로 강조 {clarity?'켜짐':'꺼짐'}</button>
      {tenants.length>1&&<label>선택 건물의 입주자 <select value={selectedId??''} onChange={e=>choose(e.target.value)}>{tenants.map(a=><option key={a.id} value={a.id}>{city.addresses![a.id]!.unit}호 · {ownerName(state,a.ownerId)} {ROLES[a.role]}</option>)}</select></label>}
    </div>
    <svg ref={world} className="painted-city-svg continuous-city metropolis-world" style={{width:'calc(1900px * var(--city-zoom, 1))'}} viewBox="0 0 1536 1024" aria-label="하나의 공동 도시. 여섯 구역의 건물을 선택하고 드래그로 이동할 수 있습니다">
      <image href={ART} width="1536" height="1024" className={clarity?'metropolis-art-clear':undefined}/>
      {CITY_DISTRICTS.map(d=><g key={d.id} pointerEvents="none">
        {districts&&<polygon points={d.boundary} fill={d.color} fillOpacity=".06" stroke={d.color} strokeOpacity=".8" strokeWidth="2" strokeDasharray="9 7"/>}
        <circle data-city-district={d.id} cx={d.center[0]} cy={d.center[1]} r="1" fill="none"/>
      </g>)}
      {traffic&&CITY_EDGES.map(([a,b])=>{const p=CITY_NODES[a]!,q=CITY_NODES[b]!,load=roadCongestion(city,p,q);return <path key={`${a}-${b}`} d={`M${p}L${q}`} stroke={load>=1?'#de6143':load>0?'#d5a324':'#328f78'} strokeWidth="5" opacity=".8" pointerEvents="none"/>;})}
      {route&&<polyline points={route.points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#fff" strokeWidth="9" strokeLinejoin="round" pointerEvents="none"/>}
      {route&&<polyline points={route.points.map(p=>p.join(',')).join(' ')} fill="none" stroke="#176dac" strokeWidth="5" strokeDasharray="10 6" strokeLinejoin="round" pointerEvents="none"/>}
      {CITY_BUILDINGS.map((building,index)=>{
        if(index<2)return null;
        const occupants=actors.filter(a=>city.addresses?.[a.id]?.building===index);
        const own=occupants.filter(a=>a.ownerId===player.id);
        const target=own[0]??occupants[0];
        const [x,y]=building.center;
        const active=index===buildingId;
        const label=own.length?own.map(a=>`내 ${ROLES[a.role]}`).join(' · '):`${building.name} · ${occupants.length}곳 입주`;
        const color=target?.role==='company'?'#985015':target?.role==='store'?'#22684e':'#715499';
        const pinClear=ownBuildings.every(b=>Math.abs(x+26-b.center[0])>105||Math.abs(y-35-(b.center[1]+44))>32);
        return <g key={index} data-city-building={index} className={`painted-building ${own.length?'owned':''} ${active?'selected':''}`} role={target?'button':undefined} tabIndex={target?0:undefined} aria-label={`${building.name}, ${occupants.map(a=>`${ownerName(state,a.ownerId)}의 ${ROLES[a.role]} ${city.addresses![a.id]!.unit}호`).join(', ')||'빈 건물'}`} aria-pressed={target?active:undefined} onClick={()=>target&&choose(target.id)} onKeyDown={e=>{if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose(target.id);}}}>
          <title>{building.name} · {occupants.length?`${occupants.length}개 공간 입주`:'입주 가능한 건물'}</title>
          <rect className="painted-hit" x={x-40} y={y-37} width="80" height="72" rx="16"/>
          {target&&clarity&&!own.length&&pinClear&&<g transform={`translate(${x+26} ${y-35})`} className="metropolis-role-pin" pointerEvents="none"><rect x="-22" y="-12" width="44" height="24" rx="7" fill={color} stroke="#fffdf0" strokeWidth="2"/><text textAnchor="middle" y="5" fill="white" fontSize="13" fontWeight="700">{ROLES[target.role]}</text></g>}
          {target&&<g className={`painted-label ${own.length||active?'always':''}`} transform={`translate(${x} ${y+44})`} pointerEvents="none"><rect x="-77" y="-15" width="154" height="30" rx="9" style={{fill:own.length?'#204e43':'#fffdf3',stroke:'#fffdf3',strokeWidth:2}}/><text textAnchor="middle" y="5" style={{fontSize:14,fill:own.length?'#ffffff':'#294435'}}>{label}</text></g>}
        </g>;
      })}
      <g transform="translate(230 175)" pointerEvents="none" aria-label="학교 · 공공시설"><rect x="-55" y="-15" width="110" height="28" rx="10" fill="#f5f1e7" stroke="#758782"/><text textAnchor="middle" y="4" fill="#3c514b" fontSize="13">학교 · 공공시설</text></g>
      {districts&&CITY_DISTRICTS.map(d=><g key={d.id} transform={`translate(${d.center[0]} ${d.center[1]+55})`} className="metropolis-district-label" pointerEvents="none"><rect x="-60" y="-16" width="120" height="30" rx="15" fill="#fff9e9" stroke={d.color} strokeWidth="2"/><text textAnchor="middle" y="4" fill="#34523e" fontSize="14">{DISTRICT_LABELS[d.id]}</text></g>)}
    </svg>
    <div className="painted-caption">강과 도로가 이어지는 하나의 도시입니다. 드래그로 이동하고 건물을 눌러 입주자를 확인하세요. 같은 건물의 공장·가게·집은 호실로 구분합니다.</div>
  </>;
}
