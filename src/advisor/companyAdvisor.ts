/**
 * 기업 턴 규칙 기반 전략 비서 (docs/ADVISOR_RULES.md, Milestone 3 1단계).
 *
 * 생성형 AI를 쓰지 않고, 이미 economy 모듈이 계산해 둔 값(직전 라운드 지표, 도매시장
 * 매물 스냅샷, 업종 유사도/전환비용 공식)을 그대로 읽어 요약·해석만 한다 — 새로운 경제
 * 공식을 여기서 만들지 않는다.
 *
 * 중요한 타이밍 제약: 기업 턴 화면이 뜨는 시점에는 이번 라운드 도매시장이 아직 갱신되지
 * 않았다. state.wholesaleListings는 "지난 라운드 마감 시점 시세 스냅샷"이며(1라운드에는
 * 비어있음), state.roundMetrics.at(-1)은 "직전 라운드 확정 실적"이다. 둘 다 "이번 라운드
 * 실시간 값"이 아니라는 점을 조언 문구에서도 분명히 한다.
 */
import { categorySimilarity, COSTS, industrySwitchCost, PRODUCT_CATEGORIES } from "../economy/config.js";
import { computeCategoryAverages, computeCompetitorCount } from "../economy/marketStats.js";
import type { GameState, ParticipantId, ProductCategoryId } from "../types/domain.js";
import { DEFAULT_ADVISOR_RULES, type AdvisorRules } from "./rules.js";
import { CATEGORY_NAMES_KO, formatPercent, formatWon } from "./shared.js";
import type { AdviceOption, CauseHypothesis, TurnAdvice } from "./types.js";

export function analyzeCompanyTurn(
  state: GameState,
  companyId: ParticipantId,
  rules: AdvisorRules = DEFAULT_ADVISOR_RULES,
): TurnAdvice {
  const company = state.companies[companyId];
  if (company === undefined) {
    throw new Error(`analyzeCompanyTurn: unknown companyId "${companyId}"`);
  }

  const categoryId = company.productCategoryId;
  const lastMetrics = state.roundMetrics.at(-1);
  const hasHistory = lastMetrics !== undefined && companyId in lastMetrics.companyProfit;

  const history = hasHistory
    ? {
        profit: lastMetrics!.companyProfit[companyId] ?? 0,
        marketShare: lastMetrics!.companyMarketShare[companyId] ?? 0,
        unitsProduced: lastMetrics!.companyUnitsProduced[companyId] ?? 0,
        unitsSoldWholesale: lastMetrics!.companyUnitsSoldWholesale[companyId] ?? 0,
        revenue: lastMetrics!.companyRevenue[companyId] ?? 0,
      }
    : undefined;

  const marketAverages = categoryId !== null ? computeCategoryAverages(state.wholesaleListings, categoryId) : undefined;
  const competitorCount = categoryId !== null ? computeCompetitorCount(state.companies, categoryId, companyId) : 0;

  const dataAvailability: TurnAdvice["dataAvailability"] =
    history === undefined && marketAverages === undefined
      ? "no-history"
      : history === undefined || marketAverages === undefined
        ? "partial"
        : "full";

  const situationSummary: string[] = [];
  situationSummary.push(
    `현재 재고는 ${Math.round(company.inventoryQuantity)}개, 현재 도매가는 ${formatWon(company.lastWholesalePrice)}입니다.`,
  );

  if (history !== undefined) {
    situationSummary.push(
      `직전 라운드에는 ${Math.round(history.unitsProduced)}개를 생산했고, 도매시장에서는 (이월 재고 포함) 총 ` +
        `${Math.round(history.unitsSoldWholesale)}개를 판매해 순이익 ${formatWon(history.profit)}, ` +
        `도매시장 점유율 ${formatPercent(history.marketShare)}를 기록했습니다.`,
    );
  } else {
    situationSummary.push("아직 참고할 직전 라운드 실적이 없습니다 (첫 라운드).");
  }

  if (marketAverages !== undefined) {
    situationSummary.push(
      `지난 라운드 마감 기준 같은 업종 시장 평균가는 ${formatWon(marketAverages.averagePrice)}, 평균 품질은 ${marketAverages.averageQuality.toFixed(2)}입니다 ` +
        `(매물 ${marketAverages.listingCount}건 기준). 당신의 품질은 ${company.quality.toFixed(2)}입니다.`,
    );
  } else {
    situationSummary.push("아직 참고할 같은 업종의 시장 시세 데이터가 없습니다 (첫 라운드이거나 지난 라운드에 매물이 없었습니다).");
  }

  if (state.currentRound >= rules.competitionFocusMinRound) {
    situationSummary.push(
      `${rules.competitionFocusMinRound}라운드부터는 가격과 품질 경쟁이 중요해지는 단계입니다. 위 시장 평균가·평균 품질과 비교해 내 도매가와 품질을 어떻게 가져갈지 판단해볼 시점입니다.`,
    );
  }

  const causeHypotheses: CauseHypothesis[] = [];

  const inventoryCarryoverRatio =
    history !== undefined && history.unitsProduced > 0 ? company.inventoryQuantity / history.unitsProduced : undefined;
  if (inventoryCarryoverRatio !== undefined && inventoryCarryoverRatio >= rules.highInventoryCarryoverRatio) {
    causeHypotheses.push({
      id: "high-inventory-carryover",
      description: "생산한 물량의 상당 부분이 팔리지 않고 재고로 남아있을 수 있습니다.",
      evidence:
        `현재 이월 재고는 ${Math.round(company.inventoryQuantity)}개입니다. 직전 라운드에는 ` +
        `${Math.round(history!.unitsProduced)}개를 생산해 (이월 재고 포함) ${Math.round(history!.unitsSoldWholesale)}개를 판매했습니다.`,
    });
  }

  let priceVsMarket: "high" | "low" | "normal" | undefined;
  if (marketAverages !== undefined && marketAverages.averagePrice > 0) {
    const priceRatio = company.lastWholesalePrice / marketAverages.averagePrice;
    if (priceRatio >= rules.highPriceVsMarketRatio) {
      priceVsMarket = "high";
      causeHypotheses.push({
        id: "price-above-market",
        description: "시장 평균가보다 비싸게 팔고 있어 판매율이 낮을 수 있습니다.",
        evidence: `시장 평균 도매가 ${formatWon(marketAverages.averagePrice)} 대비 당신의 가격은 ${formatWon(company.lastWholesalePrice)}입니다.`,
      });
    } else if (priceRatio <= rules.lowPriceVsMarketRatio) {
      priceVsMarket = "low";
      causeHypotheses.push({
        id: "price-below-market",
        description: "시장 평균가보다 싸게 팔고 있어 이익률이 낮을 수 있습니다.",
        evidence: `시장 평균 도매가 ${formatWon(marketAverages.averagePrice)} 대비 당신의 가격은 ${formatWon(company.lastWholesalePrice)}입니다.`,
      });
    } else {
      priceVsMarket = "normal";
    }
  }

  if (marketAverages !== undefined && marketAverages.averageQuality - company.quality >= rules.lowQualityGapVsMarket) {
    causeHypotheses.push({
      id: "quality-below-market",
      description: "시장 평균보다 품질이 낮아 가격 경쟁력이 떨어질 수 있습니다.",
      evidence: `시장 평균 품질 ${marketAverages.averageQuality.toFixed(2)} 대비 당신의 품질은 ${company.quality.toFixed(2)}입니다.`,
    });
  }

  if (history !== undefined && history.profit <= rules.negativeProfitThreshold) {
    causeHypotheses.push({
      id: "negative-profit",
      description: "직전 라운드에 적자를 기록했습니다.",
      evidence: `직전 라운드 순이익은 ${formatWon(history.profit)}입니다.`,
    });
  } else if (history !== undefined && history.revenue > 0 && history.profit / history.revenue <= rules.lowProfitMarginRatio) {
    causeHypotheses.push({
      id: "low-profit-margin",
      description: "매출은 있지만 남는 이익이 적을 수 있습니다.",
      evidence: `직전 라운드 도매 매출 ${formatWon(history.revenue)} 대비 순이익은 ${formatWon(history.profit)}입니다.`,
    });
  }

  if (categoryId !== null && competitorCount >= rules.highCompetitorCount) {
    causeHypotheses.push({
      id: "high-competition",
      description: "같은 업종의 경쟁 기업이 많아 판매 경쟁이 치열할 수 있습니다.",
      evidence: `같은 업종(${CATEGORY_NAMES_KO[categoryId]})을 파는 다른 기업이 ${competitorCount}곳 있습니다.`,
    });
  }

  const switchSuggestion = categoryId !== null ? findSwitchSuggestion(categoryId, rules) : undefined;

  const options: AdviceOption[] = [
    buildProductionOption(inventoryCarryoverRatio, rules, company.inventoryQuantity),
    buildPriceOption(priceVsMarket, marketAverages, company.lastWholesalePrice),
    categoryId !== null && competitorCount >= rules.highCompetitorCount && switchSuggestion !== undefined
      ? buildSwitchOption(categoryId, switchSuggestion)
      : buildMaintainOption(),
  ];

  return { dataAvailability, situationSummary, causeHypotheses, options };
}

function buildProductionOption(
  inventoryCarryoverRatio: number | undefined,
  rules: AdvisorRules,
  inventoryQuantity: number,
): AdviceOption {
  if (inventoryCarryoverRatio !== undefined && inventoryCarryoverRatio >= rules.highInventoryCarryoverRatio) {
    return {
      id: "reduce-production",
      title: "생산량을 줄인다",
      pros: [
        `현재 이월 재고가 ${Math.round(inventoryQuantity)}개로 많이 쌓여 있어, 생산량을 줄이면 재고 부담과 유통비를 줄일 수 있습니다.`,
      ],
      risks: ["생산량을 너무 줄이면 다음 라운드 판매 기회 자체가 줄어들 수 있습니다."],
    };
  }
  return {
    id: "increase-production",
    title: "생산량을 늘린다",
    pros: ["시장점유율을 더 늘릴 여지가 있습니다."],
    risks: ["다 팔리지 않으면 재고가 쌓여 다음 라운드 유통비·보관 부담이 커집니다."],
  };
}

function buildPriceOption(
  priceVsMarket: "high" | "low" | "normal" | undefined,
  marketAverages: { averagePrice: number } | undefined,
  currentPrice: number,
): AdviceOption {
  if (priceVsMarket === "high" && marketAverages !== undefined) {
    return {
      id: "lower-price",
      title: "도매가를 낮춘다",
      pros: [`시장 평균가(${formatWon(marketAverages.averagePrice)})에 가까워지면 가게들이 더 많이 사갈 가능성이 있습니다.`],
      risks: ["가격을 낮추면 개당 이익이 줄어 전체 이익률이 더 나빠질 수 있습니다."],
    };
  }
  if (priceVsMarket === "low" && marketAverages !== undefined) {
    return {
      id: "raise-price",
      title: "도매가를 높인다",
      pros: [`시장 평균가(${formatWon(marketAverages.averagePrice)})보다 낮게 팔고 있던 만큼, 가격을 올려도 여지가 있어 이익률을 개선할 수 있습니다.`],
      risks: ["가격을 너무 올리면 시장 평균보다 비싸져 판매율이 떨어질 수 있습니다."],
    };
  }
  return {
    id: "keep-price",
    title: "현재 가격을 유지한다",
    pros: [`현재 가격(${formatWon(currentPrice)})이 시장 시세와 크게 다르지 않아 안정적인 판매를 기대할 수 있습니다.`],
    risks: ["가격 변화를 시도하지 않으면 더 나은 매출 기회를 놓칠 수 있습니다."],
  };
}

function buildMaintainOption(): AdviceOption {
  return {
    id: "maintain-strategy",
    title: "현재 전략을 유지한다",
    pros: ["운영 방식을 바꾸지 않아 안정적으로 다음 라운드를 준비할 수 있습니다."],
    risks: ["경쟁 기업이 전략을 바꾸면 상대적으로 뒤처질 위험이 있습니다."],
  };
}

interface SwitchSuggestion {
  targetCategoryId: ProductCategoryId;
  cost: number;
  similarity: number;
}

/** 현재 업종과 가장 유사도가 높은(=전환비용이 가장 낮은) 다른 업종을 찾는다. 임계값 이하일 때만 반환한다. */
function findSwitchSuggestion(categoryId: ProductCategoryId, rules: AdvisorRules): SwitchSuggestion | undefined {
  let best: SwitchSuggestion | undefined;
  for (const candidate of PRODUCT_CATEGORIES) {
    if (candidate === categoryId) continue;
    const cost = industrySwitchCost(categoryId, candidate);
    const similarity = categorySimilarity(categoryId, candidate);
    if (best === undefined || cost < best.cost) {
      best = { targetCategoryId: candidate, cost, similarity };
    }
  }
  if (best === undefined || best.cost / COSTS.industrySwitchBaseCost > rules.industrySwitchCostRatioForSuggestion) {
    return undefined;
  }
  return best;
}

function buildSwitchOption(currentCategoryId: ProductCategoryId, suggestion: SwitchSuggestion): AdviceOption {
  return {
    id: "consider-industry-switch",
    title: `${CATEGORY_NAMES_KO[suggestion.targetCategoryId]} 업종으로 확장/전환을 검토한다`,
    pros: [
      `현재 업종(${CATEGORY_NAMES_KO[currentCategoryId]})은 경쟁이 치열한 편이고, ${CATEGORY_NAMES_KO[suggestion.targetCategoryId]}은(는) 유사도가 높아(전환비용 ${formatWon(suggestion.cost)}) 비교적 적은 부담으로 옮겨갈 수 있습니다.`,
    ],
    risks: [`전환비용 ${formatWon(suggestion.cost)}이 즉시 발생하고, 새 시장에서 다시 자리 잡아야 하는 위험이 있습니다.`],
  };
}
