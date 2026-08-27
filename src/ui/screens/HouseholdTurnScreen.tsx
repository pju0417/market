import { useMemo, useState } from "react";
import { analyzeHouseholdTurn } from "../../advisor/householdAdvisor.js";
import { eligibleRetailListingsForHousehold } from "../../economy/market.js";
import { MAX_HOUSEHOLD_PURCHASE_UNITS } from "../../npc/decisions.js";
import type { GameSession } from "../../multiplayer/GameSession.js";
import type { GameState, HouseholdState, ParticipantId, StoreState } from "../../types/domain.js";
import { CATEGORY_LABELS, formatWon } from "../labels.js";
import {
  computeHouseholdTotalBudget,
  computeTotalCost,
  filterEligibleRetailListings,
  isOverBudget,
  sumQuantities,
} from "../turnCalculations.js";
import { AdvisorPanel } from "./AdvisorPanel.js";

interface Props {
  session: GameSession;
  state: GameState;
  household: HouseholdState;
  stores: Record<ParticipantId, StoreState>;
  onSubmitted: () => void;
  disabled?: boolean;
}

/** 가계 턴: 여러 가게의 상품을 비교해 실제로 구매한다 (docs/GAME_RULES.md 1절). */
export function HouseholdTurnScreen({ session, state, household, stores, onSubmitted, disabled = false }: Props) {
  const totalBudget = computeHouseholdTotalBudget(household.ledger.cash, household.budgetPerRound);

  const eligible = useMemo(
    () => filterEligibleRetailListings(eligibleRetailListingsForHousehold(household, state.retailListings, stores)),
    [household, state.retailListings, stores],
  );

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const totalUnits = sumQuantities(quantities);
  const totalCost = computeTotalCost(eligible, quantities);
  const overBudget = isOverBudget(totalCost, totalBudget);
  const overUnits = totalUnits > MAX_HOUSEHOLD_PURCHASE_UNITS;
  const advice = useMemo(() => analyzeHouseholdTurn(state, household.id), [state, household.id]);

  return (
    <>
    <div className="card">
      <h2>가계 턴</h2>
      <div className="stat-row">
        <span className="label">저축</span>
        <span className="value">{formatWon(household.ledger.cash)}</span>
      </div>
      <div className="stat-row">
        <span className="label">이번 라운드 받을 용돈</span>
        <span className="value">+{formatWon(household.budgetPerRound)}</span>
      </div>
      <div className="stat-row">
        <span className="label">이번 라운드 쓸 수 있는 돈</span>
        <span className="value">{formatWon(totalBudget)}</span>
      </div>

      <h3>가게 매대</h3>
      {eligible.length === 0 && <p className="empty-note">지금 살 수 있는 물건이 없어요.</p>}
      {eligible.map((listing) => (
        <div className="listing-row" key={listing.id}>
          <div className="listing-info">
            {CATEGORY_LABELS[listing.categoryId]} · {formatWon(listing.price)} / 개 · 품질{" "}
            {(listing.quality * 100).toFixed(0)}점 · 최대 {Math.floor(listing.quantityAvailable)}개
          </div>
          <input
            type="number"
            min={0}
            max={Math.min(listing.quantityAvailable, MAX_HOUSEHOLD_PURCHASE_UNITS)}
            value={quantities[listing.id] ?? 0}
            onChange={(e) =>
              setQuantities((prev) => ({ ...prev, [listing.id]: Math.max(0, Number(e.target.value)) }))
            }
          />
        </div>
      ))}

      <div className="stat-row">
        <span className="label">이번 소비 총액 ({totalUnits}/{MAX_HOUSEHOLD_PURCHASE_UNITS}개)</span>
        <span className="value">{formatWon(totalCost)}</span>
      </div>
      {overBudget && <p style={{ color: "#dc2626", fontSize: 14 }}>가진 돈보다 많이 살 수 없어요.</p>}
      {overUnits && (
        <p style={{ color: "#dc2626", fontSize: 14 }}>
          한 라운드에 최대 {MAX_HOUSEHOLD_PURCHASE_UNITS}개까지만 살 수 있어요.
        </p>
      )}

      <button
        className="primary"
        disabled={disabled || overBudget || overUnits}
        onClick={() => {
          const purchases = eligible
            .map((listing) => ({ listingId: listing.id, quantity: quantities[listing.id] ?? 0 }))
            .filter((line) => line.quantity > 0);
          session.submitHouseholdPurchases(purchases);
          onSubmitted();
        }}
      >
        결정 제출하기
      </button>
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
