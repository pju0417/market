import { useRef, useState } from "react";
import type { CartCheckout, CartLine, CartReceipt, GameState, ProductCategoryId } from "../../types/domain.js";
import { cityRent, deliveredListings } from "../../economy/city.js";
import { COSTS, MIN_ROUND_FOR_ADVERTISING, MIN_ROUND_FOR_INDUSTRY_ACTIONS, NPC_STORE_SPECIALTY_DEVIATION_RULES, PRODUCT_CATEGORIES } from "../../economy/config.js";
import { incomeEventBudgetMultiplier } from "../../economy/incomeEvent.js";
import { eligibleRetailListingsForHousehold, eligibleWholesaleListingsForStore } from "../../economy/market.js";
import type { DecisionSubmitter } from "../network/DecisionSubmitter.js";
import { ApiError } from "../network/sessionClient.js";
import { ownerName } from "../GridCityMap.js";
import { CATEGORY_LABELS } from "../labels.js";
import { RoleArtwork } from "../GameArtwork.js";
import { MarketEventBanner } from "./MarketEventBanner.js";
import { IncomeEventBanner } from "./IncomeEventBanner.js";
import { TrendEventBanner } from "./TrendEventBanner.js";

const formatWon = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

interface Props {
  session: DecisionSubmitter; state: GameState; role: "store" | "household";
  participantId: string; onSubmitted: () => void; disabled: boolean;
}

export function ShoppingTurnScreen({ session, state, role, participantId, onSubmitted, disabled }: Props) {
  const store = role === "store" ? state.stores[participantId]! : undefined;
  const household = role === "household" ? state.households[participantId]! : undefined;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState<ProductCategoryId>("food");
  const [sort, setSort] = useState("price");
  const [retailPrice, setRetailPrice] = useState(store?.retailPrice ?? 0);
  const [sellingCategory, setSellingCategory] = useState<ProductCategoryId | "">("");
  const [advertise, setAdvertise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");
  const [localReceipts, setLocalReceipts] = useState<CartReceipt[]>([]);
  const receipt = localReceipts[localReceipts.length - 1];
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<CartCheckout | undefined>(undefined);
  const inFlight = useRef(false);
  const prepared = state.shopping?.prepared[participantId] === true || receipt !== undefined;
  const baseCategory = store?.currentSellingCategoryId ?? store?.specialtyCategoryId;
  const effectiveCategory = sellingCategory || baseCategory;
  const categoryCooldown = store?.lastSellingCategoryChangeRound != null && state.currentRound - store.lastSellingCategoryChangeRound < NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds;
  const listings = store
    ? deliveredListings(state, participantId, eligibleWholesaleListingsForStore(store, state.wholesaleListings, state.companies)).filter(l => l.categoryId === effectiveCategory)
    : deliveredListings(state, participantId, eligibleRetailListingsForHousehold(household!, state.retailListings, state.stores));
  const receipts = Object.values(state.shopping?.receipts ?? {}).filter(r => r.participantId === participantId && r.round === state.currentRound);
  const receiptNotSynced = receipt !== undefined && !receipts.some(r => r.requestId === receipt.requestId);
  const purchasedUnits = (state.shopping?.units[participantId] ?? 0) + localReceipts.filter(local => !receipts.some(saved => saved.requestId === local.requestId)).reduce((sum, local) => sum + local.units, 0);
  const cash = receiptNotSynced ? receipt.remainingCash : store?.ledger.cash ?? household!.ledger.cash;
  const fixedCost = store ? COSTS.baseLaborCostStore + cityRent(state, participantId, "store", store.districtId).total : cityRent(state, participantId, "household").total;
  const income = household ? household.budgetPerRound * incomeEventBudgetMultiplier(state.currentRound) : 0;
  const adCost = !prepared && advertise && state.currentRound >= MIN_ROUND_FOR_ADVERTISING ? COSTS.advertisingCostPerRound : 0;
  const budget = prepared ? cash : Math.max(0, cash + income - fixedCost - adCost);
  const units = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const invalidCart = cart.some(line => {
    const listing = listings.find(l => l.id === line.listingId);
    return !listing || listing.quantityAvailable < line.quantity || Math.abs(listing.price - line.unitPrice) > 0.000001;
  });
  const needsPrice = !!store && (store.inventoryQuantity > 0 || purchasedUnits > 0 || units > 0) && retailPrice <= 0;
  const locked = busy || ended || disabled || uncertain;
  const categoryListings = listings.filter(l => store || l.categoryId === category).sort((a, b) => sort === "price" ? a.price - b.price : b.quality - a.quality);

  function changeQuantity(id: string, quantity: number) {
    if (locked) return;
    setError("");
    setCart(current => current.flatMap(line => line.listingId !== id ? [line] : quantity > 0 ? [{ ...line, quantity: Math.floor(quantity) }] : []));
  }

  async function checkout() {
    if (inFlight.current || ended || disabled) return;
    inFlight.current = true; setBusy(true); setError("");
    pending.current ??= {
      requestId: crypto.randomUUID(), round: state.currentRound, lines: cart.map(line => ({ ...line })),
      ...(store ? { retailPrice, ...(!prepared && sellingCategory ? { sellingCategoryId: sellingCategory } : {}), ...(!prepared ? { advertise } : {}) } : {}),
    };
    try {
      const result = await session.checkoutCart(role, participantId, pending.current);
      setLocalReceipts(current => current.some(r => r.requestId === result.requestId) ? current : [...current, result]); setCart([]); pending.current = undefined; setUncertain(false);
    } catch (err) {
      const definitive = err instanceof ApiError ? err.status >= 400 && err.status < 500 : !(err instanceof TypeError);
      if (definitive) { pending.current = undefined; setUncertain(false); }
      else setUncertain(true);
      setError(definitive ? (err instanceof Error ? err.message : String(err)) : "결제 결과를 확인하지 못했어요.");
      if (!definitive) setError("결제 결과를 아직 확인하지 못했어요. ‘결제 결과 다시 확인’을 눌러 주세요. 같은 주문이 중복 결제되지는 않아요.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function endTurn() {
    if (locked || cart.length > 0 || needsPrice || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (store) await session.submitStoreDecision(participantId, { retailPrice, ...(!prepared && sellingCategory ? { sellingCategoryId: sellingCategory } : {}), ...(!prepared ? { advertise } : {}) });
      else await session.submitHouseholdPurchases(participantId, []);
      setEnded(true); onSubmitted();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <>
    <MarketEventBanner state={state} role={role} /><IncomeEventBanner state={state} role={role} /><TrendEventBanner state={state} role={role} />
    <div className={`card card-role-${role} shopping-turn`}>
      <h2 className="card-title"><RoleArtwork role={role} />{store ? "기업 활동 ② 매입·판매" : "가계 활동 · 장보기"}</h2>
      <p className="hint">{store ? "가게도 상품을 판매하는 기업이에요. 물건을 들여오고 판매 가격을 정해 보세요." : "필요한 물건을 장바구니에 담아 보세요. 한 라운드에 총 6개까지 살 수 있어요."}</p>
      <div className="shopping-wallet"><span>쓸 수 있는 돈 <strong>{formatWon(budget)}</strong></span><span>이번 턴 구매 {purchasedUnits}개</span></div>
      {(ended || disabled) && <p className="turn-waiting" role="status">턴을 종료했어요. 모두 마칠 때까지 도시를 둘러볼 수 있어요.</p>}
      {store && <label className="field"><span className="field-label">우리 가게 판매 가격 · 1개당</span><input type="number" min={0} step={0.1} value={retailPrice} disabled={locked} onChange={e => setRetailPrice(Math.max(0, Number(e.target.value)))} /></label>}
      {store && !prepared && state.currentRound >= MIN_ROUND_FOR_INDUSTRY_ACTIONS && <details className="turn-secondary-details"><summary>판매 업종·광고 설정</summary>
        <label className="field">판매 업종<select value={sellingCategory} disabled={locked || cart.length > 0 || categoryCooldown} onChange={e => setSellingCategory(e.target.value as ProductCategoryId | "")}><option value="">현재 업종 유지</option>{PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}</select></label>
        <p className="hint">업종 변경은 기존 재고를 폐기하며 변경 대기 기간이 적용돼요. 첫 결제 후에는 이번 턴 설정이 확정돼요.</p>
        {state.currentRound >= MIN_ROUND_FOR_ADVERTISING && <label><input type="checkbox" checked={advertise} disabled={locked} onChange={e => setAdvertise(e.target.checked)} /> 광고하기 · {formatWon(COSTS.advertisingCostPerRound)}</label>}
      </details>}
      {needsPrice && <p role="status">상품을 판매하려면 판매 가격을 0원보다 높게 정해 주세요.</p>}
      {!store && <nav className="purchase-category-tabs" aria-label="상품 종류">{PRODUCT_CATEGORIES.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{CATEGORY_LABELS[c]}</button>)}</nav>}
      <label className="field offer-sort">상품 정렬<select value={sort} onChange={e => setSort(e.target.value)}><option value="price">가격 낮은 순</option><option value="quality">품질 높은 순</option></select></label>
      <p className="hint">운송비 포함 가격 · 다른 참가자의 구매는 약 5초 간격으로 확인해요. 담기만 하면 재고가 예약되지는 않아요.</p>
      <div className="shopping-shelves">{categoryListings.map(listing => {
        const sellerId = "companyId" in listing ? listing.companyId : listing.storeId;
        const seller = store ? state.companies[sellerId] : state.stores[sellerId];
        const amount = cart.find(line => line.listingId === listing.id)?.quantity ?? 0;
        return <article className="shopping-product" key={listing.id}>
          <span className="shopping-product-icon" aria-hidden="true">{{ food: "🥖", apparel: "👕", electronics: "💻", toys: "🧸" }[listing.categoryId]}</span>
          <div><strong>{CATEGORY_LABELS[listing.categoryId]}</strong><small>{ownerName(state, seller?.ownerId ?? "")}</small></div>
          <strong>{formatWon(listing.price)} / 개</strong><small>품질 {Math.round(listing.quality * 100)}점 · 재고 {listing.quantityAvailable}개</small>
          {listing.transportCostPerUnit !== undefined && <small>운송비 {formatWon(listing.transportCostPerUnit)} 포함</small>}
          <button className="secondary" disabled={locked || amount >= listing.quantityAvailable || (!store && units + purchasedUnits >= 6)} onClick={() => setCart(current => amount ? current.map(line => line.listingId === listing.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { listingId: listing.id, quantity: 1, unitPrice: listing.price }])}>{listing.quantityAvailable <= 0 ? "품절" : amount ? `하나 더 담기 · ${amount}개 담음` : "장바구니에 담기"}</button>
        </article>;
      })}</div>
      {categoryListings.length === 0 && <p className="empty-note">현재 이 종류의 상품이 없어요.</p>}
      <section className="shopping-basket" aria-label="장바구니"><h3>🛒 내 장바구니 · {units}개</h3>
        {cart.length === 0 && <p className="hint">상품의 ‘장바구니에 담기’를 눌러 주세요.</p>}
        {cart.map(line => {
          const listing = listings.find(l => l.id === line.listingId);
          const sellerId = listing ? ("companyId" in listing ? listing.companyId : listing.storeId) : "";
          const seller = store ? state.companies[sellerId] : state.stores[sellerId];
          return <div className="shopping-basket-line" key={line.listingId}><div><strong>{listing ? CATEGORY_LABELS[listing.categoryId] : "판매 종료 상품"}</strong><small>{ownerName(state, seller?.ownerId ?? "")} · {formatWon(line.unitPrice)} / 개</small></div><div className="shopping-quantity"><button aria-label="수량 줄이기" disabled={locked} onClick={() => changeQuantity(line.listingId, line.quantity - 1)}>−</button><span>{line.quantity}</span><button aria-label="수량 늘리기" disabled={locked || !listing || line.quantity >= listing.quantityAvailable || (!store && units + purchasedUnits >= 6)} onClick={() => changeQuantity(line.listingId, line.quantity + 1)}>+</button></div><strong>{formatWon(line.quantity * line.unitPrice)}</strong><button className="ghost" disabled={locked} onClick={() => changeQuantity(line.listingId, 0)}>빼기</button></div>;
        })}
        {invalidCart && <p role="alert">재고나 가격이 바뀌었어요. 부족한 상품을 빼거나 다시 담아 주세요.</p>}
      </section>
      {receipt && <p className="shopping-receipt" role="status">✓ {receipt.units}개 · {formatWon(receipt.total)} 결제 완료. 더 구매하거나 턴을 종료할 수 있어요.</p>}
      <div className="decision-action-bar"><div className="decision-budget"><strong>결제 금액 {formatWon(total)}</strong><span>결제 후 남는 돈 {formatWon(budget - total)}</span></div>
        <div className="shopping-actions"><button className="primary" disabled={busy || ended || disabled || (!uncertain && (cart.length === 0 || invalidCart || total > budget || (!store && purchasedUnits + units > 6)))} onClick={() => void checkout()}>{busy ? "처리 중…" : uncertain ? "결제 결과 다시 확인" : "장바구니 결제"}</button><button className="secondary" disabled={locked || cart.length > 0 || needsPrice} onClick={() => void endTurn()}>{ended || disabled ? "턴 종료 완료" : "턴 종료"}</button></div>
        {cart.length > 0 && <small>결제하거나 장바구니를 비우면 턴을 종료할 수 있어요.</small>}
        {error && <p className="shopping-error" role="alert">{error}</p>}
      </div>
    </div>
  </>;
}
