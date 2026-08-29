import { useMemo, useState } from "react";
import { analyzeStoreTurn } from "../../advisor/storeAdvisor.js";
import { eligibleWholesaleListingsForStore } from "../../economy/market.js";
import type { DecisionSubmitter } from "../network/DecisionSubmitter.js";
import type { CompanyState, GameState, ParticipantId, StoreState } from "../../types/domain.js";
import { CATEGORY_LABELS, DISTRICT_LABELS, formatWon } from "../labels.js";
import {
  computeAvailableCash,
  computeStoreFixedCost,
  computeTotalCost,
  filterEligibleWholesaleListings,
  isOverBudget,
} from "../turnCalculations.js";
import { AdvisorPanel } from "./AdvisorPanel.js";

interface Props {
  session: DecisionSubmitter;
  state: GameState;
  version: number;
  store: StoreState;
  companies: Record<ParticipantId, CompanyState>;
  onSubmitted: () => void;
  disabled?: boolean;
}

/** 가게 턴: 도매시장에서 상품을 비교해 매입하고(D-004), 소매 판매가격을 정한다. */
export function StoreTurnScreen({ session, state, version, store, companies, onSubmitted, disabled = false }: Props) {
  const fixedCost = computeStoreFixedCost(store.districtId);
  const availableCash = computeAvailableCash(store.ledger.cash, fixedCost);

  const eligible = useMemo(
    () =>
      filterEligibleWholesaleListings(
        eligibleWholesaleListingsForStore(store, state.wholesaleListings, companies),
        store.specialtyCategoryId,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- state는 제자리에서 mutate되어 참조가 안 바뀌므로, 실제 변경 감지는 session의 version 카운터로 한다.
    [version, store.id],
  );

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [retailPrice, setRetailPrice] = useState(store.retailPrice > 0 ? store.retailPrice : 0);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const totalCost = computeTotalCost(eligible, quantities);
  const overBudget = isOverBudget(totalCost, availableCash);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- state는 제자리에서 mutate되어 참조가 안 바뀌므로, 실제 변경 감지는 session의 version 카운터로 한다.
  const advice = useMemo(() => analyzeStoreTurn(state, store.id), [version, store.id]);

  return (
    <>
    <div className="card">
      <h2>가게 턴</h2>
      <div className="stat-row">
        <span className="label">현재 보유 현금</span>
        <span className="value">{formatWon(store.ledger.cash)}</span>
      </div>
      <div className="stat-row">
        <span className="label">이번 라운드 고정비 ({DISTRICT_LABELS[store.districtId]})</span>
        <span className="value">-{formatWon(fixedCost)}</span>
      </div>
      <div className="stat-row">
        <span className="label">고정비 낸 뒤 남는 돈</span>
        <span className="value">{formatWon(availableCash)}</span>
      </div>
      <div className="stat-row">
        <span className="label">현재 재고</span>
        <span className="value">
          {Math.round(store.inventoryQuantity)}개 (품질 {(store.inventoryQuality * 100).toFixed(0)}점)
        </span>
      </div>
      <div className="stat-row">
        <span className="label">전문 업종</span>
        <span className="value">{store.specialtyCategoryId ? CATEGORY_LABELS[store.specialtyCategoryId] : "-"}</span>
      </div>

      <h3>도매시장 매물</h3>
      {eligible.length === 0 && <p className="empty-note">지금 살 수 있는 물건이 없어요.</p>}
      {eligible.map((listing) => (
        <div className="listing-row" key={listing.id}>
          <div className="listing-info">
            {formatWon(listing.price)} / 개 · 품질 {(listing.quality * 100).toFixed(0)}점 · 최대{" "}
            {Math.floor(listing.quantityAvailable)}개
          </div>
          <input
            type="number"
            min={0}
            max={listing.quantityAvailable}
            value={quantities[listing.id] ?? 0}
            onChange={(e) =>
              setQuantities((prev) => ({ ...prev, [listing.id]: Math.max(0, Number(e.target.value)) }))
            }
          />
        </div>
      ))}

      <div className="stat-row">
        <span className="label">이번 매입에 드는 돈</span>
        <span className="value">{formatWon(totalCost)}</span>
      </div>
      {overBudget && <p style={{ color: "#dc2626", fontSize: 14 }}>매입 수량을 줄여야 해요.</p>}

      <label className="field">
        <span className="field-label">소매 판매가격 (개당)</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={retailPrice}
          onChange={(e) => setRetailPrice(Math.max(0, Number(e.target.value)))}
        />
      </label>

      <button
        className="primary"
        disabled={disabled || overBudget}
        onClick={() => {
          const purchases = eligible
            .map((listing) => ({ listingId: listing.id, quantity: quantities[listing.id] ?? 0 }))
            .filter((line) => line.quantity > 0);
          setSubmitError(undefined);
          Promise.resolve(session.submitStoreDecision(store.id, { purchases, retailPrice }))
            .then(() => onSubmitted())
            .catch((err: unknown) => setSubmitError(err instanceof Error ? err.message : String(err)));
        }}
      >
        결정 제출하기
      </button>
      {submitError && <p style={{ color: "#dc2626", fontSize: 14 }}>{submitError}</p>}
    </div>

    <div className="card">
      <button className="secondary" onClick={() => setAdvisorOpen((prev) => !prev)}>
        {advisorOpen ? "비서 의견 닫기" : "비서 의견 보기"}
      </button>
      {advisorOpen && <AdvisorPanel advice={advice} />}
    </div>
    </>
  );
}
