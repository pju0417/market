import { artLocation } from "../economy/artworkCity.js";
import { cityAddress } from '../economy/metropolisCity.js';
import { cityActors, cityRent, transportQuote } from "../economy/city.js";
import type { GameState, PlayerState } from "../types/domain.js";
import { RoleArtwork } from "./GameArtwork.js";
import { DISTRICT_LABELS, formatWon } from "./labels.js";
import { ownerName } from "./SpatialCityMap.js";
import { InventoryPanel } from "./screens/InventoryPanel.js";

export function CityBuildingDetails({ state, player, id }: { state: GameState; player: PlayerState; id: string }) {
  const actor = cityActors(state).find((candidate) => candidate.id === id);
  if (!actor) return <p>건물 정보를 찾을 수 없어요.</p>;
  const rent = cityRent(state, actor.id, actor.role, actor.districtId);
  const point = state.city?.positions[id];
  const recipient = actor.role === "company" ? player.storeId : player.householdId;
  const transport = actor.role !== "household" && actor.ownerId !== player.id ? transportQuote(state, actor.id, recipient, actor.role === "company" ? "wholesale" : "retail") : undefined;
  const paid = state.city?.costs[id];
  return <section className="city-location-details">
    <div className="city-location-title"><RoleArtwork role={actor.role} /><div><strong>{ownerName(state, actor.ownerId)}</strong><small>{DISTRICT_LABELS[actor.districtId]}{state.city?.metropolisLayout ? ` · ${cityAddress(state.city,id)}` : point ? state.city?.artworkLayout ? ` · 마을 ${artLocation(point).zone + 1}` : ` · 필지 ${point[0] + 1}, ${point[1] + 1}` : ""}</small></div></div>
    {state.city ? <>
      <h3>이 위치의 임대료</h3>
      <p className="location-price">{rent.total.toFixed(2)}원 <small>/ 라운드</small></p>
      <details><summary>임대료 계산 근거</summary>
        <p>상권 기준 {rent.districtBase.toFixed(2)}원 × 입지 배율 {rent.factor.toFixed(3)}</p>
        <p>도심 접근성 {(rent.accessibility * 100).toFixed(0)}% · 주변 밀도 {(rent.density * 100).toFixed(0)}% · 주변 도로 혼잡 {rent.congestion.toFixed(2)}</p>
        <p>접근성과 밀도가 높으면 임대료가 오르고, 혼잡은 접근성을 낮춰 임대료를 할인해요.</p>
      </details>
      {transport?.route && <div className="location-transport"><h3>{actor.role === "company" ? "내 가게까지 운송" : "내 집까지 운송"}</h3>
        <strong>개당 {transport.perUnit.toFixed(2)}원</strong>
        <p>도로 {transport.route.distance.toFixed(1)}블록 · 혼잡 가산 {(transport.route.congestion * 100).toFixed(0)}%<br />파란 경로는 혼잡을 고려한 최소 운송비 경로예요.</p>
      </div>}
      {paid && <p>이번 라운드 지불: 임대료 {formatWon(paid.rent)} · 운송비 {paid.transport.toFixed(2)}원</p>}
    </> : <p>이전 규칙으로 시작한 게임입니다. 새 게임부터 거리·교통 비용이 적용됩니다.</p>}
    {actor.role !== "household" && <p>남은 재고 {actor.inventoryQuantity}개</p>}
    {actor.ownerId === player.id && <InventoryPanel company={state.companies[id]} store={state.stores[id]} household={state.households[id]} round={state.currentRound} />}
    {actor.ownerId !== player.id && <p className="city-market-note">다른 플레이어의 건물은 조회만 할 수 있어요. 거래는 내 경영 패널에서 결정해요.</p>}
  </section>;
}
