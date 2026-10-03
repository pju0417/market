import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { GameState, PlayerState, Role } from "../types/domain.js";
import { CATEGORY_LABELS, DISTRICT_LABELS, formatWon, PHASE_LABELS } from "./labels.js";
import { RoleArtwork } from "./GameArtwork.js";
import { SpatialCityMap, ownerName } from "./SpatialCityMap.js";
import { CityBuildingDetails } from "./CityBuildingDetails.js";
import { cityActors } from "../economy/city.js";
import "./CityGameLayout.css";

export const cityMapArtwork = new URL("./assets/city-map-v1.png", import.meta.url).href;

const ROLES: readonly Role[] = ["company", "store", "household"];
const NAMES: Record<Role, string> = { company: "공장 운영", store: "가게 운영", household: "내 가정" };
const TASKS: Record<Role, string> = { company: "생산 계획 세우기", store: "상품 들여와 판매하기", household: "필요한 물건 고르기" };
const GUIDES: Record<Role, string> = {
  company: "지도에서 내 공장을 눌러 생산량과 가격을 정해요.",
  store: "지도에서 내 가게를 눌러 다른 공장의 상품을 비교해요.",
  household: "지도에서 내 집을 눌러 예산에 맞게 장을 봐요.",
};
type Selection = Role | "market" | "results" | "neighbor" | null;

interface Props {
  state: GameState;
  player: PlayerState;
  children: ReactNode;
  teacherControl?: ReactNode;
}

/** A map-first shell around the existing decision screens. No simulation rules live here. */
export function CityGameLayout({ state, player, children, teacherControl }: Props) {
  const phase = state.currentPhase;
  const gameOver = state.currentRound > state.config.totalRounds;
  const activeRole = !gameOver ? ROLES.find((role) => phase === `${role}-turn`) : undefined;
  const phaseKey = `${state.currentRound}:${phase}`;
  const isResult = gameOver || phase === "round-result";
  const [selection, setSelection] = useState<{ key: string; value: Selection }>({ key: "", value: null });
  const selected = selection.key === phaseKey ? selection.value : isResult ? "results" : activeRole ?? null;
  const [zoom, setZoom] = useState(state.city?.metropolisLayout ? Math.max(0.75, Math.min(1.25, window.innerWidth / 1900)) : 1);
  const [market, setMarket] = useState<"wholesale" | "retail">("wholesale");
  const [inspectedBuilding, setInspectedBuilding] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const inspectorTitle = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const panelId = useId();
  const company = state.companies[player.companyId]!;
  const store = state.stores[player.storeId]!;
  const household = state.households[player.householdId]!;
  const wallet: Record<Role, number> = { company: company.ledger.cash, store: store.ledger.cash, household: household.ledger.cash };
  const details: Record<Role, string> = {
    company: `${DISTRICT_LABELS[company.districtId]} · 재고 ${Math.floor(company.inventoryQuantity)}개`,
    store: `${DISTRICT_LABELS[store.districtId]} · 재고 ${Math.floor(store.inventoryQuantity)}개`,
    household: `생활 만족도 ${(household.satisfactionScore * 100).toFixed(0)}점`,
  };
  const products = market === "wholesale" ? state.wholesaleListings : state.retailListings;
  const availableProducts = products.filter((item) => item.quantityAvailable > 0);
  const latest = state.roundMetrics.at(-1);
  const showDecisions = selected === activeRole || selected === "results";
  const ownIds: Record<Role, string> = { company: player.companyId, store: player.storeId, household: player.householdId };
  const selectedBuildingId = selected === "neighbor" ? inspectedBuilding : selected && ROLES.includes(selected as Role) ? ownIds[selected as Role] : undefined;
  const neighbor = selected === "neighbor" ? cityActors(state).find((actor) => actor.id === inspectedBuilding) : undefined;

  function open(value: Selection) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelection({ key: phaseKey, value });
  }
  function close() {
    setSelection({ key: phaseKey, value: null });
    previousFocus.current?.focus();
  }
  function selectBuilding(id: string) {
    const ownRole = ROLES.find((role) => ownIds[role] === id);
    if (ownRole) open(ownRole);
    else { setInspectedBuilding(id); open("neighbor"); }
  }
  useEffect(() => {
    if (selected) inspectorTitle.current?.focus({ preventScroll: true });
    inspectorTitle.current?.closest('aside')?.querySelector('.city-inspector-content')?.scrollTo({top:0});
  }, [selected, phaseKey]);

  return (
    <section className="city-workspace" aria-label="우리 동네 경제 도시">
      <header className="city-topbar">
        <div className="city-brand"><span aria-hidden="true">◈</span><div><small>우리 손으로 움직이는</small><strong>경제 마을</strong></div></div>
        <div className="city-wallets">
          {([{ name: "내 기업", roles: ["company", "store"] }, { name: "내 가정 · 가계", roles: ["household"] }] as {name: string; roles: Role[]}[]).map(group => <section className="city-wallet-group" aria-label={group.name} key={group.name}><strong className="economic-group-label">{group.name}</strong><div>
          {group.roles.map((role) => <button key={role} className={`city-wallet ${role}`} onClick={() => open(role)} aria-label={`${NAMES[role]} 자금 ${formatWon(wallet[role])}, 건물 보기`}>
            <RoleArtwork role={role} /><span>{role === "household" ? "가정 저축" : `${NAMES[role]} 자금`}</span><strong>{formatWon(wallet[role])}</strong>
          </button>)}
          </div></section>)}
        </div>
        <div className="city-round"><small>라운드</small><strong>{Math.min(state.currentRound, state.config.totalRounds)} <span>/ {state.config.totalRounds}</span></strong></div>
        {teacherControl && <div className="city-teacher">{teacherControl}</div>}
      </header>

      <div className="city-playfield">
        <div className="city-map-viewport" ref={viewport} tabIndex={0} aria-label="경제 마을 지도. 건물을 선택하세요. 확대 후 스크롤하거나 드래그해 이동할 수 있어요."
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as Element).closest("button, [role=button], select, label, input")) return;
            const node = event.currentTarget;
            drag.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop };
            node.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
            event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
          }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
          <div className="city-map-canvas" style={{ width: `${zoom * 100}%`, ["--city-zoom" as string]: zoom }}>
            <SpatialCityMap state={state} player={player} selectedId={selectedBuildingId} activeRole={activeRole} onSelect={selectBuilding} />
          </div>
        </div>

        <div className="city-mission" aria-live="polite">
          <span className="city-eyebrow">{gameOver ? "도시 운영 완료" : "오늘의 미션"}</span>
          <h2>{activeRole ? TASKS[activeRole] : isResult ? "우리 마을의 변화 확인하기" : "시장이 움직이고 있어요"}</h2>
          <p>{activeRole ? GUIDES[activeRole] : isResult ? "이번 선택이 어떤 결과를 만들었는지 살펴봐요." : PHASE_LABELS[phase]}</p>
          {(activeRole || isResult) && <button onClick={() => open(activeRole ?? "results")}>{activeRole ? "건물 열기" : "결과 보기"} <span aria-hidden="true">↗</span></button>}
        </div>

        <div className="city-map-tools" aria-label="지도 조작">
          <button aria-label="지도 축소" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} disabled={zoom <= 0.25}>−</button>
          <output aria-label="지도 배율">{Math.round(zoom * 100)}%</output>
          <button aria-label="지도 확대" onClick={() => setZoom((value) => Math.min(2, value + 0.25))} disabled={zoom >= 2}>+</button>
          <button onClick={() => { const v=viewport.current; setZoom(state.city?.metropolisLayout && v ? Math.max(.25,Math.min(v.clientWidth/1900,(v.clientHeight-95)/(1900*2/3))) : 1); v?.scrollTo({ left: 0, top: 0 }); }}>도시 전체</button>
        </div>

        <aside id={panelId} className={`city-inspector${selected ? " is-open" : ""}`} aria-label="건물 경영 패널" hidden={!selected}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
          <div className="city-inspector-heading">
            <h2 tabIndex={-1} ref={inspectorTitle}>{selected === "market" ? "우리 마을 시장" : selected === "results" ? "도시 운영 보고서" : selected === "neighbor" ? `${neighbor ? ownerName(state, neighbor.ownerId) : "이웃"}의 건물` : selected ? NAMES[selected] : "건물"}</h2>
            <button aria-label="경영 패널 닫기" onClick={close}>×</button>
          </div>
          <div className="city-inspector-content">
            {activeRole && !showDecisions && <button className="secondary decision-return" onClick={()=>open(activeRole)}>← 내 결정으로 돌아가기</button>}
            {selectedBuildingId && !showDecisions && <CityBuildingDetails state={state} player={player} id={selectedBuildingId} />}
            {/* Keep the active form mounted when browsing the map, preserving unsubmitted choices. */}
            <div hidden={!showDecisions}>{children}</div>
            {selectedBuildingId && showDecisions && <details className="decision-details"><summary>건물 위치·임대료 계산 자세히 보기</summary><CityBuildingDetails state={state} player={player} id={selectedBuildingId} /></details>}
            {selected && ROLES.includes(selected as Role) && selected !== activeRole && <div className="city-building-summary">
              <RoleArtwork role={selected as Role} />
              <h3>{NAMES[selected as Role]}</h3><p>{details[selected as Role]}</p>
              <div className="city-summary-value"><span>{selected === "household" ? "저축" : "보유 자금"}</span><strong>{formatWon(wallet[selected as Role])}</strong></div>
              <p>{gameOver ? "도시 운영을 마쳤어요. 보고서에서 최종 결과를 확인해요." : "건물마다 맡은 일이 달라요. 생산 → 판매 → 소비 순서로 운영해요."}</p>
              <button className="primary" onClick={() => open(activeRole ?? (isResult ? "results" : "market"))}>{activeRole ? `${NAMES[activeRole]}에서 계속하기` : isResult ? "보고서 보기" : "시장 보기"}</button>
            </div>}
            {selected === "market" && <div className="city-market">
              <p>다른 생산자와 판매자도 함께 참여하는 시장이에요.</p>
              <div className="city-market-tabs" aria-label="시장 종류">
                <button aria-pressed={market === "wholesale"} onClick={() => setMarket("wholesale")}>도매시장</button>
                <button aria-pressed={market === "retail"} onClick={() => setMarket("retail")}>소매시장</button>
              </div>
              <p className="city-market-note">{market === "wholesale" ? "공장이 만들고, 가게가 사요." : "가게가 팔고, 가정이 사요."} 상품 가격(운송비 제외)이며 내 매물도 포함돼요. 구매 화면에서는 내 위치까지의 운송비를 더해요.</p>
              {Object.entries(CATEGORY_LABELS).map(([category, name]) => {
                const listings = availableProducts.filter((item) => item.categoryId === category);
                const quantity = listings.reduce((sum, item) => sum + item.quantityAvailable, 0);
                return <div className="city-product" key={category}><span className={`city-product-symbol ${category}`} aria-hidden="true">{category === "food" ? "●" : category === "apparel" ? "◆" : category === "electronics" ? "▣" : "★"}</span><div><strong>{name}</strong><small>{listings.length ? `${formatWon(Math.min(...listings.map((item) => item.price)))}부터 · 매물 ${listings.length}건` : "현재 매물 없음"}</small></div><b>{Math.floor(quantity)}<small>개</small></b></div>;
              })}
              <p className="city-market-note">거래는 현재 차례의 경영 패널에서 결정해요. 내 공장·가게와 직접 거래할 수는 없어요.</p>
              {activeRole && <button className="primary" onClick={() => open(activeRole)}>{TASKS[activeRole]} ↗</button>}
            </div>}
          </div>
        </aside>
      </div>

      <footer className="city-dock">
        <nav className="city-role-nav" aria-label="경제 활동 순서">
          {([{ name: "내 기업", roles: ["company", "store"] }, { name: "내 가정 · 가계", roles: ["household"] }] as {name: string; roles: Role[]}[]).map(group => <div className="city-role-group" role="group" aria-label={group.name} key={group.name}><strong className="economic-group-label">{group.name}</strong><div>
          {group.roles.map((role) => <button key={role} className={activeRole === role ? "is-current" : ""} aria-current={activeRole === role ? "step" : undefined} onClick={() => open(role)}>
            <span className={`city-step ${role}`}>{ROLES.indexOf(role) + 1}</span><span><strong>{NAMES[role]}</strong><small>{role === "company" ? "가게에 판매(도매)" : role === "store" ? "소비자에게 판매(소매)" : "구매·소비"}</small></span>{activeRole === role && <span className="city-current-dot" aria-label="현재 차례" />}
          </button>)}
          </div></div>)}
        </nav>
        <div className="city-economic-pulse"><span className="city-pulse-icon" aria-hidden="true">▥</span><div><small>{latest ? `${latest.round}라운드 거래 기록` : "우리 마을 참여 현황"}</small><strong>{latest ? `도매 ${Math.round(latest.totalWholesaleVolume)}개 · 소매 ${Math.round(latest.totalRetailVolume)}개` : `공장 ${Object.keys(state.companies).length}곳 · 가게 ${Object.keys(state.stores).length}곳`}</strong></div></div>
        <button className="city-market-shortcut" onClick={() => open(activeRole === "store" || activeRole === "household" ? activeRole : "market")}>{activeRole === "store" || activeRole === "household" ? "상품 비교·구매 ↗" : "시장 보기 ↗"}</button>
      </footer>
    </section>
  );
}
