import type { CompanyState, StoreState, HouseholdState } from "../../types/domain.js";
import { CATEGORY_LABELS } from "../labels.js";
export const money = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

export function InventoryPanel({ company, store, household, round }: { company?: CompanyState | undefined; store?: StoreState | undefined; household?: HouseholdState | undefined; round: number }) {
  const stock = company ?? store;
  const category = company?.productCategoryId ?? store?.currentSellingCategoryId ?? store?.specialtyCategoryId;
  if (stock) return <section className="turn-inventory" aria-label="현재 재고와 원가"><h3>📦 현재 재고</h3>
    <strong>{category ? CATEGORY_LABELS[category] : "상품"} · {stock.inventoryQuantity}개</strong>
    {stock.inventoryQuantity > 0 ? <><p>개당 평균 {company ? "생산 원가" : "매입 원가"}: <b>{stock.inventoryUnitCost === undefined ? "이전 기록 없음" : money(stock.inventoryUnitCost)}</b></p>
      {stock.inventoryUnitCost !== undefined && <p>남은 재고 원가 합계: {money(stock.inventoryQuantity * stock.inventoryUnitCost)}</p>}</> : <p>아직 보유한 상품이 없어요.</p>}
    <small>{company ? "생산에 직접 쓴 돈 기준이며 인건비·임대료·광고비는 별도예요." : "매입 당시 운송비를 포함한 수량 가중평균이에요. 인건비·임대료는 별도예요."}</small>
  </section>;
  const purchases = household?.purchases?.filter(p => p.round === round) ?? [];
  return <section className="turn-inventory" aria-label="구매한 물건과 구매 가격"><h3>🛍️ 이번 턴 구매한 물건</h3>
    {purchases.length ? purchases.map((p,i) => <p key={i}>{CATEGORY_LABELS[p.categoryId]} {p.quantity}개 · 개당 {money(p.unitCost)} · 총 {money(p.unitCost * p.quantity)}</p>) : <p>아직 구매 기록이 없어요.</p>}
    <small>운송비를 포함해 실제로 결제한 가격이에요. 구매한 물건은 소비되며 판매 재고로 남지 않아요.</small>
  </section>;
}
