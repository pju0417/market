import { useMemo, useState } from "react";
import { analyzeHouseholdTurn } from "../../advisor/householdAdvisor.js";
import { ESSENTIAL_CATEGORY_IDS, PRODUCT_CATEGORIES } from "../../economy/config.js";
import type { AutoFillPreference, CategoryPurchaseRequest, PriorityPurchasePick } from "../../economy/humanDecisions.js";
import { eligibleRetailListingsForHousehold } from "../../economy/market.js";
import { createRng } from "../../economy/rng.js";
import { MAX_HOUSEHOLD_PURCHASE_UNITS } from "../../npc/decisions.js";
import type { DecisionSubmitter } from "../network/DecisionSubmitter.js";
import type { GameState, HouseholdState, ParticipantId, ProductCategoryId, RetailListing, StoreState } from "../../types/domain.js";
import { CATEGORY_LABELS, formatWon } from "../labels.js";
import { computeHouseholdTotalBudget, filterEligibleRetailListings, previewCategoryPurchase } from "../turnCalculations.js";
import { AdvisorPanel } from "./AdvisorPanel.js";
import { MarketEventBanner } from "./MarketEventBanner.js";

const FIXED_CATEGORY_ORDER: readonly ProductCategoryId[] = [
  ...ESSENTIAL_CATEGORY_IDS,
  ...PRODUCT_CATEGORIES.filter((categoryId) => !ESSENTIAL_CATEGORY_IDS.includes(categoryId)),
];

interface Props {
  session: DecisionSubmitter;
  state: GameState;
  version: number;
  household: HouseholdState;
  stores: Record<ParticipantId, StoreState>;
  onSubmitted: () => void;
  disabled?: boolean;
}

/**
 * 가계 턴: 여러 가게의 상품을 비교해 실제로 구매한다 (docs/GAME_RULES.md 1절).
 *
 * 구매 매칭 개편(D-036) — 카테고리별로 "1~3순위 수동 지정 + 부족분 자동배분"으로 결정한다.
 * 전체 6개 상한(MAX_HOUSEHOLD_PURCHASE_UNITS)과 예산은 식품→의류→그 외
 * (FIXED_CATEGORY_ORDER, 서버의 orderCategoriesByFixedPriority와 동일한 순서) 순으로
 * 카테고리를 넘어 이어진다 — 화면 미리보기도 서버와 동일한 순서로 같은 함수
 * (previewCategoryPurchase)를 순차 호출해 정확히 같은 숫자를 보여준다.
 */
export function HouseholdTurnScreen({ session, state, version, household, stores, onSubmitted, disabled = false }: Props) {
  const totalBudget = computeHouseholdTotalBudget(household.ledger.cash, household.budgetPerRound);

  const eligibleAll = filterEligibleRetailListings(eligibleRetailListingsForHousehold(household, state.retailListings, stores));
  const eligibleByCategory: Partial<Record<ProductCategoryId, RetailListing[]>> = {};
  for (const categoryId of PRODUCT_CATEGORIES) {
    eligibleByCategory[categoryId] = eligibleAll.filter((l) => l.categoryId === categoryId);
  }
  const categoriesWithListings = FIXED_CATEGORY_ORDER.filter((c) => (eligibleByCategory[c]?.length ?? 0) > 0);

  const [picksByCategory, setPicksByCategory] = useState<Partial<Record<ProductCategoryId, PriorityPurchasePick[]>>>({});
  const [pendingQty, setPendingQty] = useState<Record<string, number>>({});
  const [maxQuantityByCategory, setMaxQuantityByCategory] = useState<Partial<Record<ProductCategoryId, number>>>({});
  const [maxUnitPriceInputByCategory, setMaxUnitPriceInputByCategory] = useState<Partial<Record<ProductCategoryId, string>>>({});
  const [autoFillPreferenceByCategory, setAutoFillPreferenceByCategory] = useState<Partial<Record<ProductCategoryId, AutoFillPreference>>>({});
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const picksFor = (c: ProductCategoryId): PriorityPurchasePick[] => picksByCategory[c] ?? [];
  const maxQuantityFor = (c: ProductCategoryId): number => maxQuantityByCategory[c] ?? 0;
  const maxUnitPriceInputFor = (c: ProductCategoryId): string => maxUnitPriceInputByCategory[c] ?? "";
  const autoFillPreferenceFor = (c: ProductCategoryId): AutoFillPreference => autoFillPreferenceByCategory[c] ?? "price";

  const requests: CategoryPurchaseRequest[] = categoriesWithListings.map((categoryId) => {
    const maxUnitPriceInput = maxUnitPriceInputFor(categoryId).trim();
    const maxUnitPrice = maxUnitPriceInput === "" ? undefined : Math.max(0, Number(maxUnitPriceInput));
    return {
      categoryId,
      priorityPicks: picksFor(categoryId),
      maxQuantity: maxQuantityFor(categoryId),
      autoFillPreference: autoFillPreferenceFor(categoryId),
      ...(maxUnitPrice !== undefined ? { maxUnitPrice } : {}),
    };
  });

  const rng = createRng(1);
  const previewByCategory: Partial<Record<ProductCategoryId, ReturnType<typeof previewCategoryPurchase>>> = {};
  let remainingCash = totalBudget;
  let remainingUnits = MAX_HOUSEHOLD_PURCHASE_UNITS;
  for (const request of requests) {
    const preview = previewCategoryPurchase(
      eligibleByCategory[request.categoryId] ?? [],
      stores,
      household.ownerId,
      request,
      remainingCash,
      remainingUnits,
      rng,
    );
    previewByCategory[request.categoryId] = preview;
    remainingCash -= preview.spentCash;
    remainingUnits -= preview.spentUnits;
  }
  const totalUnits = MAX_HOUSEHOLD_PURCHASE_UNITS - remainingUnits;
  const totalCost = totalBudget - remainingCash;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- state는 제자리에서 mutate되어 참조가 안 바뀌므로, 실제 변경 감지는 session의 version 카운터로 한다.
  const advice = useMemo(() => analyzeHouseholdTurn(state, household.id), [version, household.id]);

  function addPriorityPick(categoryId: ProductCategoryId, listingId: string) {
    const current = picksFor(categoryId);
    if (current.length >= 3) return;
    const quantity = Math.max(1, pendingQty[listingId] ?? 1);
    setPicksByCategory((prev) => ({ ...prev, [categoryId]: [...current, { listingId, quantity }] }));
  }

  function removePriorityPick(categoryId: ProductCategoryId, listingId: string) {
    setPicksByCategory((prev) => ({ ...prev, [categoryId]: picksFor(categoryId).filter((p) => p.listingId !== listingId) }));
  }

  return (
    <>
    <MarketEventBanner state={state} role="household" />
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

      {categoriesWithListings.length > 0 && (
        <div className="info-badge">
          📋 여러 카테고리를 한꺼번에 사면 {FIXED_CATEGORY_ORDER.filter((c) => categoriesWithListings.includes(c))
            .map((c) => CATEGORY_LABELS[c])
            .join(" → ")}{" "}
          순서로 예산이 먼저 배정돼요. (전체 한도 {totalUnits}/{MAX_HOUSEHOLD_PURCHASE_UNITS}개)
        </div>
      )}

      {categoriesWithListings.length === 0 && <p className="empty-note">지금 살 수 있는 물건이 없어요.</p>}

      {categoriesWithListings.map((categoryId) => {
        const listings = eligibleByCategory[categoryId] ?? [];
        const picks = picksFor(categoryId);
        const pickedIds = new Set(picks.map((p) => p.listingId));
        const preview = previewByCategory[categoryId];
        const priorityResults = preview?.purchases.filter((p) => pickedIds.has(p.listingId)) ?? [];
        const autoResults = preview?.purchases.filter((p) => !pickedIds.has(p.listingId)) ?? [];

        return (
          <div key={categoryId} className="auto-fill-section">
            <h3>{CATEGORY_LABELS[categoryId]}</h3>

            {picks.length > 0 && (
              <div className="priority-pick-list">
                {picks.map((pick, index) => {
                  const listing = listings.find((l) => l.id === pick.listingId);
                  return (
                    <div className="priority-pick-item" key={pick.listingId}>
                      <span className="priority-badge">{index + 1}</span>
                      <span style={{ flex: 1 }}>
                        {listing ? `${formatWon(listing.price)}/개 · 품질 ${(listing.quality * 100).toFixed(0)}점` : "매물 없음"}
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={pick.quantity}
                        onChange={(e) => {
                          const quantity = Math.max(1, Number(e.target.value));
                          setPicksByCategory((prev) => ({
                            ...prev,
                            [categoryId]: picksFor(categoryId).map((p) => (p.listingId === pick.listingId ? { ...p, quantity } : p)),
                          }));
                        }}
                      />
                      <button className="ghost" onClick={() => removePriorityPick(categoryId, pick.listingId)}>
                        빼기
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {listings
              .filter((listing) => !pickedIds.has(listing.id))
              .map((listing) => (
                <div className="listing-row" key={listing.id}>
                  <div className="listing-info">
                    {formatWon(listing.price)} / 개 · 품질 {(listing.quality * 100).toFixed(0)}점 · 최대{" "}
                    {Math.floor(listing.quantityAvailable)}개
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={listing.quantityAvailable}
                    value={pendingQty[listing.id] ?? 1}
                    onChange={(e) => setPendingQty((prev) => ({ ...prev, [listing.id]: Math.max(1, Number(e.target.value)) }))}
                  />
                  <button className="secondary" disabled={picks.length >= 3} onClick={() => addPriorityPick(categoryId, listing.id)}>
                    {picks.length + 1}순위로 담기
                  </button>
                </div>
              ))}
            {picks.length >= 3 && <p className="submit-hint">이미 3개를 골랐어요, 먼저 하나를 빼야 담을 수 있어요.</p>}

            <span className="field-label">그래도 부족하면</span>
            <p className="hint">1~3순위 밖에서 부족한 만큼 채울 때, 어떤 걸 먼저 볼지 골라요.</p>
            <label className="field">
              <span className="field-label">이 카테고리에서 이번 라운드 사고 싶은 총 수량</span>
              <input
                type="number"
                min={0}
                value={maxQuantityFor(categoryId)}
                onChange={(e) =>
                  setMaxQuantityByCategory((prev) => ({ ...prev, [categoryId]: Math.max(0, Number(e.target.value)) }))
                }
              />
            </label>
            <label className="field">
              <span className="field-label">자동배분에만 적용되는 최대 단가 (비워두면 얼마든지 사드려요)</span>
              <input
                type="number"
                min={0}
                value={maxUnitPriceInputFor(categoryId)}
                onChange={(e) => setMaxUnitPriceInputByCategory((prev) => ({ ...prev, [categoryId]: e.target.value }))}
                placeholder="무제한"
              />
            </label>
            <label className="field">
              <span className="field-label">자동배분 기준</span>
              <select
                value={autoFillPreferenceFor(categoryId)}
                onChange={(e) =>
                  setAutoFillPreferenceByCategory((prev) => ({ ...prev, [categoryId]: e.target.value as AutoFillPreference }))
                }
              >
                <option value="price">가격이 쌀수록 좋아요 (기본)</option>
                <option value="quality">품질이 좋을수록 좋아요</option>
              </select>
            </label>

            <div className="preview-box">
              {priorityResults.map((p, i) => (
                <div key={p.listingId}>
                  {i + 1}순위: {p.quantity}개 ({formatWon(p.quantity * p.unitPrice)})
                </div>
              ))}
              {autoResults.length > 0 && (
                <div>자동배분: {autoResults.map((p) => `${p.quantity}개(${formatWon(p.quantity * p.unitPrice)})`).join(" + ")}</div>
              )}
              <div>
                합계 {preview?.spentUnits ?? 0}개, {formatWon(preview?.spentCash ?? 0)}
              </div>
            </div>
          </div>
        );
      })}

      <div className="stat-row">
        <span className="label">
          이번 소비 총액 ({totalUnits}/{MAX_HOUSEHOLD_PURCHASE_UNITS}개)
        </span>
        <span className="value">{formatWon(totalCost)}</span>
      </div>

      <p className="submit-hint">먼저 결정을 제출할수록 원하는 물건을 먼저 살 수 있어요.</p>
      <p className="submit-hint">급하게 제출하면 실수로 잘못된 값을 낼 수 있어요 — 제출 전 한 번 더 확인하세요.</p>

      <button
        className="primary"
        disabled={disabled}
        onClick={() => {
          setSubmitError(undefined);
          Promise.resolve(session.submitHouseholdPurchases(household.id, requests))
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
