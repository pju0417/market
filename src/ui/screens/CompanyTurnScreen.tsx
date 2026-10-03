import { BeginnerGuide } from "./BeginnerGuide.js";
import { useMemo, useState } from "react";
import { RoleArtwork } from "../GameArtwork.js";
import { analyzeCompanyTurn } from "../../advisor/companyAdvisor.js";
import {
  companyUnitCost,
  COSTS,
  industrySwitchCost,
  MIN_ROUND_FOR_ADVERTISING,
  MIN_ROUND_FOR_INDUSTRY_ACTIONS,
  PRODUCT_CATEGORIES,
} from "../../economy/config.js";
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
import { TrendEventBanner } from "./TrendEventBanner.js";
import { InventoryPanel } from "./InventoryPanel.js";

interface Props {
  session: DecisionSubmitter;
  state: GameState;
  version: number;
  company: CompanyState;
  onSubmitted: () => void;
  /** phase 진행이 이미 실행 중일 때 true — 중복 제출을 막는다. */
  disabled?: boolean;
}

/** 공장 턴: 생산량, 품질, 도매 판매가격을 정한다 (docs/GAME_RULES.md 1절). */
export function CompanyTurnScreen({ session, state, version, company, onSubmitted, disabled = false }: Props) {
  const fixedCost = computeCompanyFixedCost(company.districtId, state, company.id);
  const availableCash = computeAvailableCash(company.ledger.cash, fixedCost);
  const initialUnitCost = company.productCategoryId ? companyUnitCost(company.productCategoryId, company.districtId) : 0;
  const initialMaxAffordable = computeMaxAffordable(availableCash, initialUnitCost);

  const [quantity, setQuantity] = useState(Math.min(20, initialMaxAffordable));
  const [quality, setQuality] = useState(0.5);
  const [wholesalePrice, setWholesalePrice] = useState(Number((initialUnitCost * 1.4).toFixed(1)));
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [switchToCategoryId, setSwitchToCategoryId] = useState<ProductCategoryId | "">("");
  const [advertise, setAdvertise] = useState(false);

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
    ? companyUnitCost(effectiveProductCategoryId, company.districtId, quality) * costMultiplier
    : 0;
  const cashAfterSwitch = Math.max(0, availableCash - switchCost);

  // 서버(runCompanyTurn)는 업종 전환 다음, 생산 결정보다 먼저 광고비를 차감한다(Milestone 6,
  // docs/DECISIONS.md D-040) — 미리보기도 같은 순서로 계산해야 실제 제출 결과와 어긋나지
  // 않는다(D-033류 재발 방지).
  const canAdvertise = state.currentRound >= MIN_ROUND_FOR_ADVERTISING;
  const adCost = canAdvertise && advertise ? COSTS.advertisingCostPerRound : 0;
  const adUnaffordable = adCost > 0 && adCost > cashAfterSwitch;
  const cashAfterAd = Math.max(0, cashAfterSwitch - (adUnaffordable ? 0 : adCost));

  const maxAffordable = computeMaxAffordable(cashAfterAd, unitCost);

  const productionCost = useMemo(() => computeProductionCost(quantity, unitCost), [quantity, unitCost]);
  const overBudget = isOverBudget(productionCost, cashAfterAd);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- state는 제자리에서 mutate되어 참조가 안 바뀌므로, 실제 변경 감지는 session의 version 카운터로 한다.
  const advice = useMemo(() => analyzeCompanyTurn(state, company.id), [version, company.id]);

  return (
    <>
    <MarketEventBanner state={state} role="company" />
    <IncomeEventBanner state={state} role="company" />
    <TrendEventBanner state={state} role="company" />
    <div className="card card-role-company">
      <h2 className="card-title">
        <RoleArtwork role="company" /> 공장 운영 · 생산
      </h2>


      <BeginnerGuide topic="company" />
      <label className="field">
        <span className="field-label">생산량 (최대 {maxAffordable}개까지 만들 수 있어요)</span>
        <input
          type="number"
          min={0}
          max={maxAffordable}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
        />
      </label>
      <label className="field production-slider">
        <span className="field-label">생산량 조절 · {quantity}개</span>
        <input type="range" min={0} max={maxAffordable} step={1} value={Math.min(quantity, maxAffordable)}
          onChange={(event) => setQuantity(Number(event.target.value))} />
        <span className="production-scale"><span>0개</span><span>{maxAffordable}개</span></span>
      </label>

      <label className="field">
        <span className="field-label">품질 목표: {(quality * 100).toFixed(0)}점 · 생산 단가 {unitCost.toFixed(2)}원/개</span>
        <input type="range" min={0} max={1} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
        <span className="hint">품질을 높이면 생산비도 올라가요. 50점이 기준이며, 0점은 25% 저렴하고 100점은 25% 비싸요. 판매 가격은 직접 정해요.</span>
      </label>

      <label className="field">
        <span className="field-label">가게에 판매할 가격 · 개당 (도매)</span>
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

      <InventoryPanel company={company} round={state.currentRound} />
      <details className="decision-details"><summary>자금·재고·비용 자세히 보기</summary>
      <div className="hud-chips">
        <span className="hud-chip">
          <span aria-hidden="true">💰</span> 현재 보유 현금 <strong>{formatWon(company.ledger.cash)}</strong>
        </span>
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

      </details>
      <details className="decision-details"><summary>추가 설정 · 업종 변경·광고</summary>
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

      {canAdvertise && (
        <div className="field">
          <label className="field-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={advertise} onChange={(e) => setAdvertise(e.target.checked)} />
            광고하기 (라운드당 {formatWon(COSTS.advertisingCostPerRound)}, 도매 매입 우선순위가 올라가요)
          </label>
          {adUnaffordable && (
            <p style={{ color: "#dc2626", fontSize: 14 }}>광고비가 가진 돈보다 많아 광고할 수 없어요.</p>
          )}
        </div>
      )}

      </details>
      <div className="decision-action-bar"><div className="decision-budget" aria-live="polite"><span>{quantity}개 생산 · 품질 {(quality*100).toFixed(0)}점 · 판매 {wholesalePrice.toFixed(2)}원/개</span><strong>생산 예정 {formatWon(productionCost)}</strong><span>고정비·추가비용·생산비를 뺀 잔액 {formatWon(cashAfterAd-productionCost)}</span></div>
      <button
        className="primary"
        disabled={disabled || ending || overBudget || company.productCategoryId === null || switchUnaffordable || adUnaffordable}
        onClick={() => {
          setSubmitError(undefined);
          setEnding(true);
          const input = {
            quantity,
            quality,
            wholesalePrice,
            ...(willSwitchIndustry ? { switchToCategoryId: switchToCategoryId as ProductCategoryId } : {}),
            ...(advertise ? { advertise: true } : {}),
          };
          Promise.resolve(session.submitCompanyDecision(company.id, input))
            .then(() => onSubmitted())
            .catch((err: unknown) => { setEnding(false); setSubmitError(err instanceof Error ? err.message : String(err)); });
        }}
      >
        생산 계획 확정 · 턴 종료
      </button>
      {(disabled || ending) && <p role="status">턴 종료를 요청했어요. 모두 마치면 다음 활동이 시작돼요.</p>}
      {submitError && <p style={{ color: "#dc2626", fontSize: 14 }}>{submitError}</p>}
      </div>
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
