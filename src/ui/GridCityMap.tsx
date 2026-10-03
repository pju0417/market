import { useState } from "react";
import { cityActors, createGridCity as createCity, findCityRoute, roadCongestion } from "../economy/city.js";
import { DISTRICT_IDS } from "../economy/config.js";
import type { CityPoint, GameState, PlayerState, Role } from "../types/domain.js";
import { DISTRICT_LABELS } from "./labels.js";

const ROLE_NAMES: Record<Role, string> = { company: "공장", store: "가게", household: "집" };
const BUILDING_ATLAS = new URL("./assets/city-buildings-v2.png", import.meta.url).href;
const SPRITE_INDEX = { company: 0, store: 1, household: 2 };
const ZONE_COLORS = ["#c9dda8", "#c4dba3", "#d1ddb1", "#c5d8a1", "#c9d6a6", "#c1d69c"];

export function ownerName(state: GameState, ownerId: string) {
  return state.players.find((player) => player.id === ownerId)?.displayName ?? `NPC ${ownerId.match(/\d+$/)?.[0] ?? ""}`;
}

interface Props {
  state: GameState;
  player: PlayerState;
  selectedId?: string | undefined;
  activeRole?: Role | undefined;
  onSelect: (id: string) => void;
}

/** Each drawn road/parcel uses exactly the grid consumed by the cost engine. */
export function GridCityMap({ state, player, selectedId, activeRole, onSelect }: Props) {
  const [highlightOwner, setHighlightOwner] = useState("");
  const [showTraffic, setShowTraffic] = useState(true);
  const city = state.city ?? createCity(state);
  const columns = city.blockSize * 3;
  const rows = city.blockSize * 2;
  const width = (columns + rows) * 36 + 120;
  const height = (columns + rows) * 24 + 140;
  const project = ([x, y]: CityPoint): CityPoint => [(x - y) * 36 + rows * 36 + 60, (x + y) * 24 + 65];
  const polygon = (points: CityPoint[]) => points.map((point) => project(point).join(",")).join(" ");
  const actors = cityActors(state).sort((a, b) => {
    const ap = city.positions[a.id]!;
    const bp = city.positions[b.id]!;
    return ap[0] + ap[1] - bp[0] - bp[1];
  });
  const selected = actors.find((actor) => actor.id === selectedId);
  const buyerId = selected?.role === "company" ? player.storeId : selected?.role === "store" ? player.householdId : undefined;
  const route = selected && selected.ownerId !== player.id && buyerId ? findCityRoute(city, selected.id, buyerId) : undefined;
  const roads: { a: CityPoint; b: CityPoint; congestion: number }[] = [];
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    if (x < columns) roads.push({ a: [x, y], b: [x + 1, y], congestion: roadCongestion(city, [x, y], [x + 1, y]) });
    if (y < rows) roads.push({ a: [x, y], b: [x, y + 1], congestion: roadCongestion(city, [x, y], [x, y + 1]) });
  }
  return <>
    <div className="spatial-map-directory" onPointerDown={(event) => event.stopPropagation()}>
      <label>플레이어 찾기 <select value={highlightOwner} onChange={(event) => setHighlightOwner(event.target.value)}>
        <option value="">모든 플레이어 · NPC</option>
        {state.players.map((participant) => <option value={participant.id} key={participant.id}>{participant.displayName}{participant.id === player.id ? " (나)" : ""}</option>)}
      </select></label>
      <button aria-pressed={showTraffic} onClick={() => setShowTraffic((value) => !value)}>교통 {showTraffic ? "표시 중" : "표시하기"}</button>
      <span>{state.players.length}명 · 건물 {actors.length}채</span>
    </div>
    <svg className="spatial-city-svg" viewBox={`0 0 ${width} ${height}`} aria-label="모든 참가자의 건물과 운송비 계산에 사용되는 도로 지도">
      <defs>
        <clipPath id="city-building-clip"><rect x="-19" y="-31" width="38" height="38" /></clipPath>
        <pattern id="city-water" width="32" height="20" patternUnits="userSpaceOnUse"><rect width="32" height="20" fill="#7cbdc6" /><path d="M4 12h12 M20 4h8" stroke="#b5dce0" strokeWidth="1.5" /></pattern>
      </defs>
      <rect width={width} height={height} fill="url(#city-water)" opacity="0.12" />
      <polygon points={polygon([[0, 0], [columns, 0], [columns, rows], [0, rows]])} fill="#9fb88a" stroke="#adc695" strokeWidth="10" />
      {DISTRICT_IDS.map((district, index) => {
        const x = (index % 3) * city.blockSize;
        const y = Math.floor(index / 3) * city.blockSize;
        return <polygon key={district} points={polygon([[x, y], [x + city.blockSize, y], [x + city.blockSize, y + city.blockSize], [x, y + city.blockSize]])} fill={ZONE_COLORS[index]} />;
      })}
      {roads.map(({ a, b, congestion }) => {
        const start = project(a); const end = project(b);
        return <line key={`${a}:${b}`} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke={showTraffic && congestion >= 1 ? "#ce7453" : showTraffic && congestion > 0 ? "#d9b85a" : "#f2ecd8"} strokeWidth="3.5" strokeLinecap="round" />;
      })}
      {/* Gardens occupy vacant lots only; roads and occupied lots stay readable. */}
      {Array.from({ length: columns * rows }, (_, i) => {
        const x = i % columns; const y = Math.floor(i / columns);
        if (actors.some((actor) => city.positions[actor.id]?.[0] === x && city.positions[actor.id]?.[1] === y)) return null;
        const [px, py] = project([x + 0.5, y + 0.5]);
        const park = (x * 7 + y * 11) % 5 === 0;
        return <g key={`garden-${i}`} transform={`translate(${px} ${py})`} pointerEvents="none" aria-hidden="true">
          <ellipse rx="19" ry="10" fill={park ? "#a7c889" : "#bbd59d"} opacity="0.65" />
          {(x + y) % 3 !== 0 && <g><ellipse cy="3" rx="9" ry="4" fill="#607f4c" opacity="0.16"/><path d="M0 2V-9" stroke="#97764d" strokeWidth="2"/><ellipse cy="-12" rx="7" ry="10" fill="#7ca768"/><ellipse cx="-2" cy="-15" rx="5" ry="7" fill="#99bd79"/></g>}
          {park && <g><path d="M8 4l8-5" stroke="#d9be8b" strokeWidth="3" strokeLinecap="round"/><circle cx="-12" cy="3" r="2" fill="#f2d098"/><circle cx="-9" cy="5" r="1.6" fill="#f6e8b6"/></g>}
        </g>;
      })}
      {route && selected && buyerId && <polyline className="spatial-route" points={[
        [city.positions[selected.id]![0] + 0.5, city.positions[selected.id]![1] + 0.5] as CityPoint,
        ...route.points,
        [city.positions[buyerId]![0] + 0.5, city.positions[buyerId]![1] + 0.5] as CityPoint,
      ].map((point) => project(point).join(",")).join(" ")} fill="none" stroke="#287bbc" strokeWidth="5" strokeDasharray="9 5" />}
      {actors.map((actor) => {
        const point = city.positions[actor.id];
        if (!point) return null;
        const [x, y] = project([point[0] + 0.5, point[1] + 0.5]);
        const owned = actor.ownerId === player.id;
        const name = ownerName(state, actor.ownerId);
        const active = owned && actor.role === activeRole;
        const isSelected = actor.id === selectedId;
        return <g key={actor.id} transform={`translate(${x} ${y})`} role="button" tabIndex={0}
          className={`spatial-building${owned ? " owned" : ""}${isSelected ? " selected" : ""}`}
          aria-label={`${name}의 ${ROLE_NAMES[actor.role]}${active ? ", 현재 차례" : ""}`} aria-pressed={isSelected}
          opacity={highlightOwner && highlightOwner !== actor.ownerId ? 0.25 : 1}
          onClick={() => onSelect(actor.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(actor.id); } }}>
          <title>{name} · {ROLE_NAMES[actor.role]} · {DISTRICT_LABELS[actor.districtId]}</title>
          <ellipse className="building-ground" cx="0" cy="3" rx="20" ry="11" fill={owned ? "#f8f1c2" : "#69875a"} opacity={owned ? 1 : 0.3} stroke={isSelected ? "#23649b" : owned ? "#9f8745" : "none"} strokeWidth="2" />
          <g clipPath="url(#city-building-clip)" className="spatial-building-art" aria-hidden="true">
            <image href={BUILDING_ATLAS} x={-19 - SPRITE_INDEX[actor.role] * 38} y="-31" width="114" height="38" />
          </g>
          {active && <g className="building-task-badge" transform="translate(0 -40)"><rect x="-20" y="-8" width="40" height="14" rx="7" fill="#fff5cf" stroke="#bd9256" strokeWidth="0.7"/><text textAnchor="middle" y="2" fontSize="7" fill="#75532f">내 차례</text></g>}
          <text y="17" textAnchor="middle" className={`spatial-building-label${owned || isSelected || highlightOwner === actor.ownerId ? " visible" : ""}`}>{owned ? "나" : name.length > 9 ? name.slice(0, 8) + "…" : name} · {ROLE_NAMES[actor.role]}</text>
        </g>;
      })}
      {DISTRICT_IDS.map((district, index) => {
        const [x, y] = project([(index % 3) * city.blockSize + city.blockSize / 2, Math.floor(index / 3) * city.blockSize]);
        return <text key={district} x={x} y={y - 13} textAnchor="middle" className="spatial-district-label">{DISTRICT_LABELS[district]}</text>;
      })}
    </svg>
    <div className="spatial-map-legend"><span>주황 공장 · 초록 가게 · 보라 집</span><span>도로: 흰색 원활 · 노랑 통행 · 주황 혼잡</span><span>교통은 지난 라운드 운송량 기준</span></div>
  </>;
}
