/**
 * 가계 턴 규칙 기반 전략 비서 (docs/ADVISOR_RULES.md, Milestone 3 3단계).
 *
 * company/storeAdvisor.ts와 같은 원칙을 따른다: 생성형 AI를 쓰지 않고, 이미 economy 모듈이
 * 계산해 둔 값(직전 라운드 지표, 소비시장 매물 스냅샷, 필수 소비 판정)을 그대로 읽어
 * 요약·해석만 한다 — 새로운 경제 공식을 여기서 만들지 않는다.
 *
 * 타이밍: state.retailListings는 가계 턴 시점에는 "이번 라운드 실시간" 매물이다(가게 턴에서
 * 막 갱신됨, 지연 없음). state.roundMetrics.at(-1)은 "직전 라운드 확정 실적"이다.
 *
 * "직전 라운드 가용예산"은 별도로 저장되지 않으므로, 현재 보유 현금(직전 라운드 소비 이후,
 * 이번 라운드 용돈 지급 이전 값)에 직전 라운드 지출을 다시 더해 역산한다 — household-turn
 * phase는 매 라운드 (1) budgetPerRound 지급 → (2) 지출 순서로 진행하므로
 * `cash_now = availableBudgetLastRound - spendLastRound`가 항상 성립한다.
 */
import { computeHouseholdTotalBudget } from "../economy/costs.js";
import { HOUSEHOLD_STRATEGY_PRESETS } from "../economy/config.js";
import { incomeEventBudgetMultiplier } from "../economy/incomeEvent.js";
import { eligibleRetailListingsForHousehold } from "../economy/market.js";
import type { GameState, ParticipantId } from "../types/domain.js";
import { DEFAULT_ADVISOR_RULES, type AdvisorRules } from "./rules.js";
import { formatPercent, formatWon } from "./shared.js";
import type { AdviceOption, CauseHypothesis, TurnAdvice } from "./types.js";

export function analyzeHouseholdTurn(
  state: GameState,
  householdId: ParticipantId,
  rules: AdvisorRules = DEFAULT_ADVISOR_RULES,
): TurnAdvice {
  const household = state.households[householdId];
  if (household === undefined) {
    throw new Error(`analyzeHouseholdTurn: unknown householdId "${householdId}"`);
  }

  const effectiveBudgetPerRound = household.budgetPerRound * incomeEventBudgetMultiplier(state.currentRound);
  const totalBudget = computeHouseholdTotalBudget(household.ledger.cash, effectiveBudgetPerRound);
  const eligible = eligibleRetailListingsForHousehold(household, state.retailListings, state.stores);

  const lastMetrics = state.roundMetrics.at(-1);
  const hasHistory = lastMetrics !== undefined && householdId in lastMetrics.householdSpend;

  const history = hasHistory
    ? {
        spend: lastMetrics!.householdSpend[householdId] ?? 0,
        unitsBought: lastMetrics!.householdUnitsBought[householdId] ?? 0,
        categoryCount: lastMetrics!.householdCategoryCount[householdId] ?? 0,
        topCategorySpendShare: lastMetrics!.householdTopCategorySpendShare[householdId] ?? 0,
        essentialCategoriesMissed: lastMetrics!.householdEssentialCategoriesMissed[householdId] ?? [],
      }
    : undefined;

  const dataAvailability: TurnAdvice["dataAvailability"] =
    history === undefined && eligible.length === 0
      ? "no-history"
      : history === undefined || eligible.length === 0
        ? "partial"
        : "full";

  const situationSummary: string[] = [];
  situationSummary.push(
    `현재 보유 현금(저축)은 ${formatWon(household.ledger.cash)}이며, 이번 라운드 받을 용돈(${formatWon(effectiveBudgetPerRound)})을 더하면 ` +
      `이번 라운드 쓸 수 있는 돈은 ${formatWon(totalBudget)}입니다.`,
  );

  if (history !== undefined) {
    situationSummary.push(
      `직전 라운드에는 ${Math.round(history.unitsBought)}개를 구매(지출 ${formatWon(history.spend)})했고, ` +
        `현재 만족도는 ${formatPercent(household.satisfactionScore)}입니다.`,
    );
  } else {
    situationSummary.push("아직 참고할 직전 라운드 실적이 없습니다 (첫 라운드).");
  }

  if (eligible.length > 0) {
    const prices = eligible.map((listing) => listing.price);
    const qualities = eligible.map((listing) => listing.quality);
    situationSummary.push(
      `지금 매대에는 ${eligible.length}건의 상품이 있습니다 (가격 ${formatWon(Math.min(...prices))}~${formatWon(Math.max(...prices))}, ` +
        `품질 ${Math.min(...qualities).toFixed(2)}~${Math.max(...qualities).toFixed(2)}).`,
    );
  } else {
    situationSummary.push("지금은 살 수 있는 물건이 없어요.");
  }

  const preset = HOUSEHOLD_STRATEGY_PRESETS[household.strategyId];
  situationSummary.push(
    `현재 소비 성향은 가격 민감도 ${preset.priceSensitivity.toFixed(2)}, 품질 민감도 ${preset.qualitySensitivity.toFixed(2)}입니다.`,
  );

  const causeHypotheses: CauseHypothesis[] = [];

  const missedFood = history !== undefined && history.essentialCategoriesMissed.includes("food");
  if (missedFood) {
    causeHypotheses.push({
      id: "missed-essential-food",
      description: "지난 라운드에 식품을 하나도 사지 못했습니다. 식품은 특히 중요한 필수 소비라 만족도에 영향이 클 수 있습니다.",
      evidence: "직전 라운드 소비시장에 식품 매물이 있었지만 구매 내역에는 식품이 없었습니다.",
    });
  }

  const missedApparel = history !== undefined && history.essentialCategoriesMissed.includes("apparel");
  if (missedApparel) {
    causeHypotheses.push({
      id: "missed-essential-apparel",
      description: "지난 라운드에 의류를 하나도 사지 못했습니다. 만족도에 다소 영향을 줄 수 있습니다.",
      evidence: "직전 라운드 소비시장에 의류 매물이 있었지만 구매 내역에는 의류가 없었습니다.",
    });
  }

  if (household.satisfactionScore <= rules.householdLowSatisfactionThreshold) {
    causeHypotheses.push({
      id: "low-satisfaction",
      description: "현재 만족도가 낮은 편입니다.",
      evidence: `현재 만족도는 ${formatPercent(household.satisfactionScore)}입니다.`,
    });
  }

  const distinctMarketCategories = new Set(eligible.map((listing) => listing.categoryId)).size;
  const hasAlternativeCategories = distinctMarketCategories >= 2;
  const isConsumptionConcentrated =
    history !== undefined &&
    hasAlternativeCategories &&
    (history.categoryCount <= rules.householdLowCategoryDiversityCount ||
      history.topCategorySpendShare >= rules.householdHighCategorySpendShareRatio);
  if (isConsumptionConcentrated) {
    causeHypotheses.push({
      id: "low-consumption-diversity",
      description: "소비가 특정 카테고리에 편중되어 있을 수 있습니다.",
      evidence:
        `직전 라운드에는 ${history!.categoryCount}개 카테고리에서만 구매했고, 그중 최대 카테고리가 지출의 ` +
        `${formatPercent(history!.topCategorySpendShare)}를 차지했습니다.`,
    });
  }

  let budgetUsage: "high" | "low" | "normal" | undefined;
  let availableBudgetLastRound: number | undefined;
  if (history !== undefined) {
    availableBudgetLastRound = household.ledger.cash + history.spend;
    if (availableBudgetLastRound > 0) {
      const usageRatio = history.spend / availableBudgetLastRound;
      if (usageRatio >= rules.householdHighBudgetUsageRatio) {
        budgetUsage = "high";
        causeHypotheses.push({
          id: "high-budget-usage",
          description: "가진 돈을 거의 다 써서 저축이 거의 남지 않았을 수 있습니다.",
          evidence: `직전 라운드에는 쓸 수 있는 돈 ${formatWon(availableBudgetLastRound)} 중 ${formatWon(history.spend)}를 지출했습니다.`,
        });
      } else if (usageRatio <= rules.householdLowBudgetUsageRatio) {
        budgetUsage = "low";
        causeHypotheses.push({
          id: "low-budget-usage",
          description: "예산을 많이 남겨두어 만족도를 더 높일 여지가 있을 수 있습니다.",
          evidence: `직전 라운드에는 쓸 수 있는 돈 ${formatWon(availableBudgetLastRound)} 중 ${formatWon(history.spend)}만 지출했습니다.`,
        });
      } else {
        budgetUsage = "normal";
      }
    }
  }

  const options: AdviceOption[] = [
    buildBudgetOption(budgetUsage, availableBudgetLastRound, history?.spend),
    buildEssentialOption(missedFood, missedApparel),
    buildDiversityOption(isConsumptionConcentrated),
  ];

  return { dataAvailability, situationSummary, causeHypotheses, options };
}

function buildBudgetOption(
  budgetUsage: "high" | "low" | "normal" | undefined,
  availableBudgetLastRound: number | undefined,
  spendLastRound: number | undefined,
): AdviceOption {
  if (budgetUsage === "high" && availableBudgetLastRound !== undefined && spendLastRound !== undefined) {
    return {
      id: "reduce-spending",
      title: "소비를 줄이고 저축을 늘려본다",
      pros: [
        `직전 라운드에 쓸 수 있는 돈 ${formatWon(availableBudgetLastRound)} 중 ${formatWon(spendLastRound)}를 지출했는데, 소비를 줄이면 다음 라운드에 쓸 여유 자금을 확보할 수 있습니다.`,
      ],
      risks: ["이번 라운드 만족도가 낮아질 수 있습니다."],
    };
  }
  if (budgetUsage === "low" && availableBudgetLastRound !== undefined && spendLastRound !== undefined) {
    return {
      id: "use-more-budget",
      title: "예산을 더 활용해본다",
      pros: [
        `직전 라운드에 쓸 수 있는 돈 ${formatWon(availableBudgetLastRound)} 중 ${formatWon(spendLastRound)}만 지출했는데, 예산을 더 활용하면 만족도를 높일 여지가 있습니다.`,
      ],
      risks: ["저축이 줄어듭니다."],
    };
  }
  return {
    id: "maintain-budget",
    title: "지금처럼 예산을 사용한다",
    pros: ["현재 소비 습관을 유지하면 안정적으로 다음 라운드를 준비할 수 있습니다."],
    risks: ["예산 사용 방식을 바꾸지 않으면 만족도를 더 높일 기회를 놓칠 수 있습니다."],
  };
}

function buildEssentialOption(missedFood: boolean, missedApparel: boolean): AdviceOption {
  if (missedFood || missedApparel) {
    return {
      id: "prioritize-essentials",
      title: "식품/의류(필수 소비)를 우선 고려해본다",
      pros: ["만족도 페널티를 피할 수 있습니다."],
      risks: ["다른 카테고리에 쓸 예산이 줄어듭니다."],
    };
  }
  return {
    id: "maintain-essential-consumption",
    title: "지금처럼 소비 구성을 유지한다",
    pros: ["필수 소비를 이미 잘 챙기고 있어 안정적입니다."],
    risks: ["다른 변화 없이는 만족도가 크게 달라지지 않을 수 있습니다."],
  };
}

function buildDiversityOption(isConsumptionConcentrated: boolean): AdviceOption {
  if (isConsumptionConcentrated) {
    return {
      id: "diversify-consumption",
      title: "다른 카테고리 상품도 함께 비교해본다",
      pros: ["다양한 필요를 골고루 충족할 수 있습니다."],
      risks: ["예산이 나뉘어 카테고리별로 더 저렴하거나 낮은 품질을 골라야 할 수 있습니다."],
    };
  }
  return {
    id: "maintain-diversity",
    title: "지금처럼 소비한다",
    pros: ["소비가 골고루 이루어지고 있어 안정적입니다."],
    risks: ["새로운 상품을 시도하지 않으면 더 나은 선택을 놓칠 수 있습니다."],
  };
}
