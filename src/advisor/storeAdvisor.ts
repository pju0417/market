/**
 * 가게 턴 규칙 기반 전략 비서 (docs/ADVISOR_RULES.md, Milestone 3 2단계).
 *
 * companyAdvisor.ts와 같은 원칙을 따른다: 생성형 AI를 쓰지 않고, 이미 economy 모듈이
 * 계산해 둔 값(직전 라운드 지표, 도매/소매 시장 매물 스냅샷, 상권 임대료 배율)을 그대로
 * 읽어 요약·해석만 한다 — 새로운 경제 공식을 여기서 만들지 않는다.
 *
 * 중요한 타이밍 제약(기업 턴과 대칭이지만 방향이 반대):
 * - state.wholesaleListings는 가게 턴 시점에는 "이번 라운드 실시간" 매물이다(기업 턴에서
 *   막 갱신됨, 지연 없음).
 * - state.retailListings는 가게 턴 시점에는 아직 이번 라운드 소비시장이 갱신되지 않았으므로
 *   "직전 라운드 마감 시점 시세 스냅샷"이다(1라운드에는 비어있음).
 * - state.roundMetrics.at(-1)은 "직전 라운드 확정 실적"이다.
 *
 * 또한 DISTRICTS[...].storeSuitability는 실제 소비자 매칭 로직(src/npc/decisions.ts의
 * scoreListingForBuyer)에서 쓰이지 않는다 — 상권은 임대료(고정비)에만 영향을 주고 판매
 * 매력도에는 영향을 주지 않는 상태다(문서-코드 불일치, 이 파일이 고칠 범위가 아니다). 이
 * 파일은 상권을 "이 상권이라 잘 팔릴 것"이라는 인과적 조언으로 쓰지 않고, 임대료 배율이라는
 * 사실 정보로만 언급한다.
 */
import { DISTRICTS } from "../economy/config.js";
import { computeStoreFixedCost } from "../economy/costs.js";
import { computeCategoryAverages, computeStoreCompetitorCount } from "../economy/marketStats.js";
import type { GameState, ParticipantId } from "../types/domain.js";
import { DEFAULT_ADVISOR_RULES, type AdvisorRules } from "./rules.js";
import { CATEGORY_NAMES_KO, DISTRICT_NAMES_KO, formatPercent, formatWon } from "./shared.js";
import type { AdviceOption, CauseHypothesis, TurnAdvice } from "./types.js";

export function analyzeStoreTurn(
  state: GameState,
  storeId: ParticipantId,
  rules: AdvisorRules = DEFAULT_ADVISOR_RULES,
): TurnAdvice {
  const store = state.stores[storeId];
  if (store === undefined) {
    throw new Error(`analyzeStoreTurn: unknown storeId "${storeId}"`);
  }

  const categoryId = store.currentSellingCategoryId ?? store.specialtyCategoryId;
  const lastMetrics = state.roundMetrics.at(-1);
  const hasHistory = lastMetrics !== undefined && storeId in lastMetrics.storeProfit;

  const history = hasHistory
    ? {
        profit: lastMetrics!.storeProfit[storeId] ?? 0,
        marketShare: lastMetrics!.storeMarketShare[storeId] ?? 0,
        unitsPurchased: lastMetrics!.storeUnitsPurchased[storeId] ?? 0,
        wholesaleSpend: lastMetrics!.storeWholesaleSpend[storeId] ?? 0,
        unitsSoldRetail: lastMetrics!.storeUnitsSoldRetail[storeId] ?? 0,
        revenue: lastMetrics!.storeRevenue[storeId] ?? 0,
        supplierCount: lastMetrics!.storeSupplierCount[storeId] ?? 0,
        topSupplierSpendShare: lastMetrics!.storeTopSupplierSpendShare[storeId] ?? 0,
      }
    : undefined;

  const wholesaleAverages = categoryId !== null ? computeCategoryAverages(state.wholesaleListings, categoryId) : undefined;
  const retailAverages = categoryId !== null ? computeCategoryAverages(state.retailListings, categoryId) : undefined;
  const storeCompetitorCount = categoryId !== null ? computeStoreCompetitorCount(state.stores, categoryId, storeId) : 0;

  const hasAnyMarketData = wholesaleAverages !== undefined || retailAverages !== undefined;
  const hasFullMarketData = wholesaleAverages !== undefined && retailAverages !== undefined;

  const dataAvailability: TurnAdvice["dataAvailability"] =
    history === undefined && !hasAnyMarketData ? "no-history" : history === undefined || !hasFullMarketData ? "partial" : "full";

  const situationSummary: string[] = [];

  if (store.retailPrice > 0) {
    situationSummary.push(
      `현재 재고는 ${Math.round(store.inventoryQuantity)}개, 품질은 ${store.inventoryQuality.toFixed(2)}이며, 현재 소매가는 ${formatWon(store.retailPrice)}입니다.`,
    );
  } else {
    situationSummary.push(
      `현재 재고는 ${Math.round(store.inventoryQuantity)}개, 품질은 ${store.inventoryQuality.toFixed(2)}입니다. 아직 소매가를 정하지 않았습니다.`,
    );
  }

  if (history !== undefined) {
    situationSummary.push(
      `직전 라운드에는 ${Math.round(history.unitsPurchased)}개를 매입(매입액 ${formatWon(history.wholesaleSpend)})해 ` +
        `${Math.round(history.unitsSoldRetail)}개를 판매, 순이익 ${formatWon(history.profit)}, ` +
        `소매시장 점유율 ${formatPercent(history.marketShare)}를 기록했습니다.`,
    );
  } else {
    situationSummary.push("아직 참고할 직전 라운드 실적이 없습니다 (첫 라운드).");
  }

  if (wholesaleAverages !== undefined) {
    situationSummary.push(
      `이번 라운드 도매시장의 실시간 평균가는 ${formatWon(wholesaleAverages.averagePrice)}, 평균 품질은 ${wholesaleAverages.averageQuality.toFixed(2)}입니다 ` +
        `(매물 ${wholesaleAverages.listingCount}건 기준).`,
    );
  } else {
    situationSummary.push("이번 라운드에는 같은 업종의 도매 매물이 없습니다.");
  }

  if (retailAverages !== undefined) {
    situationSummary.push(
      `직전 라운드 마감 기준 같은 업종 소매시장 평균가는 ${formatWon(retailAverages.averagePrice)}, 평균 품질은 ${retailAverages.averageQuality.toFixed(2)}입니다 ` +
        `(매물 ${retailAverages.listingCount}건 기준).`,
    );
  } else {
    situationSummary.push("아직 참고할 소매시장 마감 시세가 없습니다 (첫 라운드이거나 지난 라운드에 매물이 없었습니다).");
  }

  if (state.currentRound >= rules.competitionFocusMinRound) {
    situationSummary.push(
      `${rules.competitionFocusMinRound}라운드부터는 가격과 품질 경쟁이 중요해지는 단계입니다. 소매가뿐 아니라 어떤 품질의 상품을 매입해서 팔지도 경쟁력에 영향을 줄 수 있습니다.`,
    );
  }

  if (categoryId !== null) {
    if (categoryId === store.specialtyCategoryId) {
      situationSummary.push(`현재 전문 업종(${CATEGORY_NAMES_KO[categoryId]}) 안에서 매입·판매하고 있습니다.`);
    } else {
      situationSummary.push(
        `현재 전문 업종(${store.specialtyCategoryId !== null ? CATEGORY_NAMES_KO[store.specialtyCategoryId] : "-"})을 벗어나 ` +
          `${CATEGORY_NAMES_KO[categoryId]}를 판매하고 있습니다 (4라운드부터 가능, 소비자 매력도 페널티가 적용됩니다).`,
      );
    }
  } else {
    situationSummary.push("아직 전문 업종을 정하지 않았습니다.");
  }

  if (state.currentRound >= rules.specialtyFocusMinRound) {
    situationSummary.push(
      `${rules.specialtyFocusMinRound}라운드부터는 전문화도 경쟁 전략의 한 축입니다. 전문 업종을 계속 지키면 소비자 매력도 페널티 없이 안정적으로 판매할 수 있고, ` +
        "다른 업종으로 이탈하면 다른 시장 상황을 노려볼 수 있지만 소비자 매력도 페널티가 적용됩니다.",
    );
  }

  const district = DISTRICTS[store.districtId];
  situationSummary.push(
    `현재 상권(${DISTRICT_NAMES_KO[store.districtId]})의 임대료 배율은 ${district.rentMultiplier.toFixed(1)}배입니다 ` +
      "(상권은 임대료 등 고정비에만 영향을 주며, 판매량에 직접 영향을 주지는 않습니다).",
  );

  const causeHypotheses: CauseHypothesis[] = [];

  const isOutOfStock = store.inventoryQuantity <= rules.outOfStockThreshold;
  if (isOutOfStock) {
    if (history !== undefined && history.unitsSoldRetail > 0) {
      causeHypotheses.push({
        id: "out-of-stock",
        description: "재고가 없어 이번 라운드에는 팔 물건이 없습니다 (매진 자체는 나쁜 신호가 아닙니다).",
        evidence: `직전 라운드에 매입한 재고가 모두 판매되어(${Math.round(history.unitsSoldRetail)}개 판매) 현재 재고가 없습니다.`,
      });
    } else {
      causeHypotheses.push({
        id: "out-of-stock",
        description: "아직 매입한 재고가 없어 판매할 물건이 없습니다.",
        evidence: "현재 재고는 0개입니다.",
      });
    }
  }

  if (
    history !== undefined &&
    history.unitsPurchased > 0 &&
    history.wholesaleSpend > 0 &&
    store.retailPrice > 0
  ) {
    const avgUnitCost = history.wholesaleSpend / history.unitsPurchased;
    const marginRatio = (store.retailPrice - avgUnitCost) / store.retailPrice;
    if (marginRatio < 0) {
      causeHypotheses.push({
        id: "negative-unit-margin",
        description: "평균 매입가보다 낮은 가격에 팔고 있어 팔수록 손해를 볼 수 있습니다.",
        evidence: `직전 라운드 평균 매입가는 약 ${formatWon(avgUnitCost)}인데, 현재 소매가는 ${formatWon(store.retailPrice)}입니다.`,
      });
    } else if (marginRatio <= rules.lowUnitMarginRatio) {
      causeHypotheses.push({
        id: "low-unit-margin",
        description: "개당 남기는 이익이 크지 않을 수 있습니다.",
        evidence: `직전 라운드 평균 매입가는 약 ${formatWon(avgUnitCost)}이고, 현재 소매가는 ${formatWon(store.retailPrice)}입니다.`,
      });
    }
  }

  let retailPriceVsMarket: "high" | "low" | "normal" | undefined;
  if (retailAverages !== undefined && retailAverages.averagePrice > 0 && store.retailPrice > 0) {
    const priceRatio = store.retailPrice / retailAverages.averagePrice;
    if (priceRatio >= rules.highRetailPriceVsMarketRatio) {
      retailPriceVsMarket = "high";
      causeHypotheses.push({
        id: "retail-price-above-market",
        description: "시장 평균 소매가보다 비싸게 팔고 있어 판매율이 낮을 수 있습니다.",
        evidence: `시장 평균 소매가 ${formatWon(retailAverages.averagePrice)} 대비 당신의 소매가는 ${formatWon(store.retailPrice)}입니다.`,
      });
    } else if (priceRatio <= rules.lowRetailPriceVsMarketRatio) {
      retailPriceVsMarket = "low";
      causeHypotheses.push({
        id: "retail-price-below-market",
        description: "시장 평균 소매가보다 싸게 팔고 있어 이익률이 낮을 수 있습니다.",
        evidence: `시장 평균 소매가 ${formatWon(retailAverages.averagePrice)} 대비 당신의 소매가는 ${formatWon(store.retailPrice)}입니다.`,
      });
    } else {
      retailPriceVsMarket = "normal";
    }
  }

  const hasAlternativeSuppliers = wholesaleAverages !== undefined && wholesaleAverages.listingCount >= 2;
  const isSupplierConcentrated =
    history !== undefined && history.topSupplierSpendShare >= rules.highSupplierConcentrationRatio && hasAlternativeSuppliers;
  if (isSupplierConcentrated) {
    causeHypotheses.push({
      id: "high-supplier-concentration",
      description: "매입을 특정 기업 한 곳에 크게 의존하고 있을 수 있습니다.",
      evidence: `직전 라운드 매입 지출의 ${formatPercent(history!.topSupplierSpendShare)}가 한 공급 기업에 집중되었습니다 (공급처 ${history!.supplierCount}곳 이용).`,
    });
  }

  if (categoryId !== null && storeCompetitorCount >= rules.highStoreCompetitorCount) {
    causeHypotheses.push({
      id: "high-store-competition",
      description: "같은 업종을 파는 경쟁 가게가 많아 판매 경쟁이 치열할 수 있습니다.",
      evidence: `같은 업종(${CATEGORY_NAMES_KO[categoryId]})을 파는 다른 가게가 ${storeCompetitorCount}곳 있습니다.`,
    });
  }

  const fixedCost = computeStoreFixedCost(store.districtId);
  const cash = store.ledger.cash;
  const isFixedCostBurdenHigh = cash > 0 ? fixedCost / cash >= rules.highFixedCostToCashRatio : fixedCost > 0;
  if (isFixedCostBurdenHigh) {
    causeHypotheses.push({
      id: "high-fixed-cost-burden",
      description: "인건비·임대료 등 고정비가 보유 현금에 비해 부담스러운 수준일 수 있습니다.",
      evidence:
        cash > 0
          ? `현재 보유 현금 ${formatWon(cash)} 대비 이번 라운드 고정비는 ${formatWon(fixedCost)}입니다.`
          : `현재 보유 현금이 ${formatWon(cash)}으로 부족한데, 이번 라운드 고정비는 ${formatWon(fixedCost)}입니다.`,
    });
  }

  const isOverstocked =
    history !== undefined && history.unitsPurchased > 0 && store.inventoryQuantity / history.unitsPurchased >= rules.highInventoryCarryoverRatio;

  const options: AdviceOption[] = [
    buildPurchaseOption(isOutOfStock, isOverstocked, store.inventoryQuantity),
    buildPriceOption(store.retailPrice, retailPriceVsMarket, retailAverages),
    hasAlternativeSuppliers && isSupplierConcentrated
      ? buildDiversifySuppliersOption(history!.topSupplierSpendShare, wholesaleAverages!.listingCount)
      : buildMaintainOption(),
  ];

  return { dataAvailability, situationSummary, causeHypotheses, options };
}

function buildPurchaseOption(isOutOfStock: boolean, isOverstocked: boolean, inventoryQuantity: number): AdviceOption {
  if (isOverstocked) {
    return {
      id: "reduce-purchase",
      title: "매입량을 줄인다",
      pros: [`현재 재고가 ${Math.round(inventoryQuantity)}개로 많이 남아 있어, 매입량을 줄이면 재고 부담을 줄일 수 있습니다.`],
      risks: ["매입량을 너무 줄이면 다음 라운드에 팔 물건이 부족해질 수 있습니다."],
    };
  }
  if (isOutOfStock) {
    return {
      id: "increase-purchase",
      title: "매입량을 늘린다",
      pros: ["현재 재고가 없어, 매입량을 늘리면 다음 라운드에 판매할 물건을 확보할 수 있습니다."],
      risks: ["매입량을 너무 늘리면 다 팔리지 않을 경우 재고 부담과 현금 지출이 커집니다."],
    };
  }
  return {
    id: "increase-purchase",
    title: "매입량을 늘린다",
    pros: ["소매시장 점유율을 더 늘릴 여지가 있습니다."],
    risks: ["다 팔리지 않으면 재고가 쌓여 다음 라운드 자금 여력이 줄어들 수 있습니다."],
  };
}

function buildPriceOption(
  currentPrice: number,
  retailPriceVsMarket: "high" | "low" | "normal" | undefined,
  retailAverages: { averagePrice: number } | undefined,
): AdviceOption {
  if (currentPrice <= 0) {
    return {
      id: "set-price",
      title: "소매가를 정한다",
      pros:
        retailAverages !== undefined
          ? [`아직 소매가를 정하지 않아 판매가 불가능합니다. 시장 평균 소매가(${formatWon(retailAverages.averagePrice)})를 참고해 정할 수 있습니다.`]
          : ["아직 소매가를 정하지 않아 판매가 불가능합니다. 매입원가를 참고해 정할 수 있습니다."],
      risks: ["가격을 정하지 않으면 이번 라운드에도 판매할 수 없습니다."],
    };
  }
  if (retailPriceVsMarket === "high" && retailAverages !== undefined) {
    return {
      id: "lower-price",
      title: "소매가를 낮춘다",
      pros: [`시장 평균 소매가(${formatWon(retailAverages.averagePrice)})에 가까워지면 가계가 더 많이 살 가능성이 있습니다.`],
      risks: ["가격을 낮추면 개당 이익이 줄어 전체 이익률이 더 나빠질 수 있습니다."],
    };
  }
  if (retailPriceVsMarket === "low" && retailAverages !== undefined) {
    return {
      id: "raise-price",
      title: "소매가를 높인다",
      pros: [`시장 평균 소매가(${formatWon(retailAverages.averagePrice)})보다 낮게 팔고 있던 만큼, 가격을 올려도 여지가 있어 이익률을 개선할 수 있습니다.`],
      risks: ["가격을 너무 올리면 시장 평균보다 비싸져 판매율이 떨어질 수 있습니다."],
    };
  }
  return {
    id: "keep-price",
    title: "현재 가격을 유지한다",
    pros: [`현재 소매가(${formatWon(currentPrice)})가 시장 시세와 크게 다르지 않아 안정적인 판매를 기대할 수 있습니다.`],
    risks: ["가격 변화를 시도하지 않으면 더 나은 매출 기회를 놓칠 수 있습니다."],
  };
}

function buildMaintainOption(): AdviceOption {
  return {
    id: "maintain-strategy",
    title: "현재 전략을 유지한다",
    pros: ["운영 방식을 바꾸지 않아 안정적으로 다음 라운드를 준비할 수 있습니다."],
    risks: ["경쟁 가게가 전략을 바꾸면 상대적으로 뒤처질 위험이 있습니다."],
  };
}

function buildDiversifySuppliersOption(topSupplierSpendShare: number, alternativeListingCount: number): AdviceOption {
  return {
    id: "diversify-suppliers",
    title: "다른 공급처도 검토한다",
    pros: [
      `직전 라운드 매입의 ${formatPercent(topSupplierSpendShare)}가 한 기업에 몰려 있었는데, 이번 라운드 도매시장에는 비교해볼 다른 매물이 ${alternativeListingCount}건 있습니다.`,
    ],
    risks: ["공급처를 바꾸면 가격이나 품질이 기존과 달라질 수 있어 다시 비교하는 데 시간이 걸릴 수 있습니다."],
  };
}
