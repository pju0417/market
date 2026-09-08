import { useMemo, useState } from "react";
import { analyzeCompanyTurn } from "../../advisor/companyAdvisor.js";
import { companyUnitCost, industrySwitchCost, MIN_ROUND_FOR_INDUSTRY_ACTIONS, PRODUCT_CATEGORIES } from "../../economy/config.js";
import { getActiveMarketEvent, marketEventCostMultiplierFor } from "../../economy/marketEvents.js";
import type { DecisionSubmitter } from "../network/DecisionSubmitter.js";
import type { CompanyState, GameState, ProductCategoryId } from "../../types/domain.js";
import { CATEGORY_LABELS, DISTRICT_LABELS, formatWon } from "../labels.js";
import {
  computeAvailableCash,
  computeCompanyFixedCost,
  computeMaxAffordable,
  computeProductionCost,
  isOverBudget,
} from "../turnCalculations.js";
import { AdvisorPanel } from "./AdvisorPanel.js";
import { IncomeEventBanner } from "./IncomeEventBanner.js";
import { MarketEventBanner } from "./MarketEventBanner.js";

interface Props {
  session: DecisionSubmitter;
  state: GameState;
  version: number;
  company: CompanyState;
  onSubmitted: () => void;
  /** phase 진행이 이미 실행 중일 때 true — 중복 제출을 막는다. */
  disabled?: boolean;
}

/** 기업 턴: 생산량, 품질, 도매 판매가격을 정한다 (docs/GAME_RULES.md 1절). */
export function CompanyTurnScreen({ session, state, version, company, onSubmitted, disabled = false }: Props) {
  const fixedCost = computeCompanyFixedCost(company.districtId);
  const availableCash = computeAvailableCash(company.ledger.cash, fixedCost);
  const initialUnitCost = company.productCategoryId ? companyUnitCost(company.productCategoryId, company.districtId) : 0;
  const initialMaxAffordable = computeMaxAffordable(availableCash, initialUnitCost);

  const [quantity, setQuantity] = useState(Math.min(20, initialMaxAffordable));
  const [quality, setQuality] = useState(0.5);
  const [wholesalePrice, setWholesalePrice] = useState(Number((initialUnitCost * 1.4).toFixed(1)));
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [switchToCategoryId, setSwitchToCategoryId] = useState<ProductCategoryId | "">("");

  const canSwitchIndustry = state.currentRound >= MIN_ROUND_FOR_INDUSTRY_ACTIONS;
  const willSwitchIndustry = switchToCategoryId !== "" && switchToCategoryId !== company.productCategoryId;
  const switchCost =
    willSwitchIndustry && company.productCategoryId !== null
      ? industrySwitchCost(company.productCategoryId, switchToCategoryId as ProductCategoryId)
      : 0;
  const switchUnaffordable = willSwitchIndustry && switchCost > availableCash;

  // 서버(runCompanyTurn)는 업종 전환을 먼저 적용해 전환비용을 차감한 뒤, 남은 현금과 새
  // 카테고리 단가로 생산량을 계산한다(resolveCompanyIndustrySwitch → resolveCompanyDecision
  // 순서, src/engine/simulateGame.ts). 미리보기도 같은 순서로 계산해야 실제 제출 결과와
  // 어긋나지 않는다.
  const effectiveProductCategoryId = switchToCategoryId !== "" ? switchToCategoryId : company.productCategoryId;
  // 서버는 전환 처리가 끝난 "이후" 카테고리로 시장 변화 이벤트 배율을 판정한다
  // (getActiveMarketEvent + marketEventCostMultiplierFor, src/engine/simulateGame.ts) — 미리보기도
  // 같은 판정을 반영해야 실제 제출 결과와 어긋나지 않는다 (Milestone 6, docs/DECISIONS.md D-035,
  // D-033 Major 재발 방지).
  const marketEvent = getActiveMarketEvent(state.config.rngSeed, state.currentRound);
  const costMultiplier = effectiveProductCategoryId
    ? marketEventCostMultiplierFor(effectiveProductCategoryId, marketEvent)
    : 1;
  const unitCost = effectiveProductCategoryId
    ? companyUnitCost(effectiveProductCategoryId, company.districtId) * costMultiplier
    : 0;
  const cashAfterSwitch = Math.max(0, availableCash - switchCost);
  const maxAffordable = computeMaxAffordable(cashAfterSwitch, unitCost);

  const productionCost = useMemo(() => computeProductionCost(quantity, unitCost), [quantity, unitCost]);
  const overBudget = isOverBudget(productionCost, cashAfterSwitch);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- state는 제자리에서 mutate되어 참조가 안 바뀌므로, 실제 변경 감지는 session의 version 카운터로 한다.
  const advice = useMemo(() => analyzeCompanyTurn(state, company.id), [version, company.id]);

  return (
    <>
    <MarketEventBanner state={state} role="company" />
    <IncomeEventBanner state={state} role="company" />
    <div className="card">
      <h2>기업 턴</h2>
      <div className="stat-row">
        <span className="label">현재 보유 현금</span>
        <span className="value">{formatWon(company.ledger.cash)}</span>
      </div>
      <div className="stat-row">
        <span className="label">이번 라운드 고정비 (인건비+임대료, {DISTRICT_LABELS[company.districtId]})</span>
        <span className="value">-{formatWon(fixedCost)}</span>
      </div>
      <div className="stat-row">
        <span className="label">고정비 낸 뒤 남는 돈</span>
        <span className="value">{formatWon(availableCash)}</span>
      </div>
      <div className="stat-row">
        <span className="label">현재 재고</span>
        <span className="value">
          {Math.round(company.inventoryQuantity)}개 (품질 {(company.quality * 100).toFixed(0)}점)
        </span>
      </div>
      <div className="stat-row">
        <span className="label">생산 품목</span>
        <span className="value">{company.productCategoryId ? CATEGORY_LABELS[company.productCategoryId] : "-"}</span>
      </div>
      <div className="stat-row">
        <span className="label">개당 생산단가</span>
        <span className="value">{formatWon(unitCost)}</span>
      </div>

      {canSwitchIndustry && (
        <div className="field">
          <span className="field-label">업종 전환 (4라운드부터 가능)</span>
          <select
            value={switchToCategoryId}
            onChange={(e) => setSwitchToCategoryId(e.target.value as ProductCategoryId | "")}
          >
            <option value="">전환 안 함 (현재: {company.productCategoryId ? CATEGORY_LABELS[company.productCategoryId] : "-"})</option>
            {PRODUCT_CATEGORIES.filter((categoryId) => categoryId !== company.productCategoryId).map((categoryId) => (
              <option key={categoryId} value={categoryId}>
                {CATEGORY_LABELS[categoryId]}
              </option>
            ))}
          </select>
          {willSwitchIndustry && (
            <>
              <p style={{ fontSize: 14 }}>
                전환 비용 {formatWon(switchCost)}이 현금에서 먼저 차감되고, 남은 {formatWon(cashAfterSwitch)}으로
                새 품목을 생산해요 — 아래 생산단가/최대 수량은 이미 이 순서를 반영한 값입니다.
              </p>
              <p style={{ color: "#dc2626", fontSize: 14 }}>
                전환하면 남은 재고와 품질이 모두 사라져요 — 보상 없이 즉시 폐기됩니다.
              </p>
              {switchUnaffordable && (
                <p style={{ color: "#dc2626", fontSize: 14 }}>전환 비용이 가진 돈보다 많아 전환할 수 없어요.</p>
              )}
            </>
          )}
        </div>
      )}

      <label className="field">
        <span className="field-label">생산량 (최대 {maxAffordable}개까지 살 수 있어요)</span>
        <input
          type="number"
          min={0}
          max={maxAffordable}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
        />
      </label>

      <label className="field">
        <span className="field-label">품질 목표: {(quality * 100).toFixed(0)}점 (높을수록 생산비/가격에 영향)</span>
        <input type="range" min={0} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
      </label>

      <label className="field">
        <span className="field-label">도매 판매가격 (개당)</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={wholesalePrice}
          onChange={(e) => setWholesalePrice(Math.max(0, Number(e.target.value)))}
        />
      </label>

      <div className="stat-row">
        <span className="label">이번 생산에 드는 돈</span>
        <span className="value">{formatWon(productionCost)}</span>
      </div>
      {overBudget && (
        <p style={{ color: "#dc2626", fontSize: 14 }}>생산량을 줄여야 해요 — 가진 돈보다 많이 쓸 수 없어요.</p>
      )}

      <button
        className="primary"
        disabled={disabled || overBudget || company.productCategoryId === null || switchUnaffordable}
        onClick={() => {
          setSubmitError(undefined);
          const input = willSwitchIndustry
            ? { quantity, quality, wholesalePrice, switchToCategoryId: switchToCategoryId as ProductCategoryId }
            : { quantity, quality, wholesalePrice };
          Promise.resolve(session.submitCompanyDecision(company.id, input))
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
