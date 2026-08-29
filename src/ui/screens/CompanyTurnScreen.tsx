import { useMemo, useState } from "react";
import { analyzeCompanyTurn } from "../../advisor/companyAdvisor.js";
import { companyUnitCost } from "../../economy/config.js";
import type { DecisionSubmitter } from "../network/DecisionSubmitter.js";
import type { CompanyState, GameState } from "../../types/domain.js";
import { CATEGORY_LABELS, DISTRICT_LABELS, formatWon } from "../labels.js";
import {
  computeAvailableCash,
  computeCompanyFixedCost,
  computeMaxAffordable,
  computeProductionCost,
  isOverBudget,
} from "../turnCalculations.js";
import { AdvisorPanel } from "./AdvisorPanel.js";

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
  const unitCost = company.productCategoryId ? companyUnitCost(company.productCategoryId, company.districtId) : 0;
  const maxAffordable = computeMaxAffordable(availableCash, unitCost);

  const [quantity, setQuantity] = useState(Math.min(20, maxAffordable));
  const [quality, setQuality] = useState(0.5);
  const [wholesalePrice, setWholesalePrice] = useState(Number((unitCost * 1.4).toFixed(1)));
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const productionCost = useMemo(() => computeProductionCost(quantity, unitCost), [quantity, unitCost]);
  const overBudget = isOverBudget(productionCost, availableCash);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- state는 제자리에서 mutate되어 참조가 안 바뀌므로, 실제 변경 감지는 session의 version 카운터로 한다.
  const advice = useMemo(() => analyzeCompanyTurn(state, company.id), [version, company.id]);

  return (
    <>
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
        disabled={disabled || overBudget || company.productCategoryId === null}
        onClick={() => {
          setSubmitError(undefined);
          Promise.resolve(session.submitCompanyDecision(company.id, { quantity, quality, wholesalePrice }))
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
