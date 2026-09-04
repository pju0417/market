/**
 * 사람이 직접 입력한 결정을 봇 결정과 같은 모양(CompanyProductionDecision, PurchaseLine[])
 * 으로 변환하고, 봇과 동일한 제약(가용 현금 이내, 실제 매물만)을 강제한다. 자기 거래 금지는
 * 호출자가 eligibleListings를 미리 걸러서 넘겨주는 것을 기대하지만, 이 함수도 companies/stores로
 * 판매자 소유자를 직접 재검증하므로 eligibleListings가 어떤 이유로든 필터링을 놓쳐도 자기거래는
 * 통과하지 않는다.
 *
 * 중요: 가격은 절대 사람 입력을 그대로 믿지 않는다 — 도매/소매 구매의 실제 단가는 항상
 * 매물(listing)에 기록된 값으로 다시 계산한다. 사람이 조작 가능한 클라이언트 입력값으로
 * 가격을 정하면 현금이 음수가 되는 등 데이터 무결성이 깨질 수 있다 (src/economy/settlement.ts
 * 의 chargeDiscretionary는 의도적으로 clamp하지 않으므로, 이런 버그는 바로 테스트에서
 * 드러나야 한다).
 *
 * humanInput이 undefined면 항상 기존 봇 정책(src/npc/decisions.ts)으로 그대로 위임한다 —
 * 이 파일은 봇 로직을 대체하지 않고, 사람이 입력했을 때만 끼어드는 얇은 층이다. 단, 가게 쪽
 * 구매 함수(resolveStorePurchases)는 예외다 — 구매 매칭 알고리즘 재설계(Stage 1) 이후, 봇
 * 위임 여부는 엔진 레벨(src/engine/simulateGame.ts의 runStoreTurn)이 decisionSource 자체의
 * 존재 여부로만 판단하고, resolveStorePurchases는 request가 undefined여도 봇으로 위임하지
 * 않고 "안 삼"으로 처리한다 (resolveCompanyIndustrySwitch가 이미 쓰는 것과 같은 패턴 — 사람이
 * 실제로 제출했지만 이번 카테고리는 안 사기로 한 것과, 아예 제출 자체가 없어 봇이 대신해야
 * 하는 것을 구분해야 하기 때문). resolveHouseholdPurchases는 이 예외에 포함되지 않는다 —
 * requests가 undefined면 여전히 기존 계약 그대로 봇 정책(decideHouseholdPurchases)에
 * 위임하고, requests가 빈 배열일 때만(사람이 실제로 제출했지만 카테고리를 하나도 요청하지
 * 않음) "안 삼"으로 처리한다.
 *
 * 구매 매칭 알고리즘 재설계(Stage 1): 가게/가계의 구매는 이제 "1~3순위 수동 지정 +
 * 부족분 자동배분(안전망)"으로 처리한다. 낮은 수준의 정렬/그리디 채움은
 * src/economy/purchaseMatching.ts의 allocateCategoryPurchase가, 수동 지정(1단계) +
 * 자동배분(2단계) 오케스트레이션은 이 파일의 resolveSingleCategoryPurchase(비-export)가 맡는다.
 */
import {
  companyUnitCost,
  ESSENTIAL_CATEGORY_IDS,
  HUMAN_AUTO_FILL_QUALITY_WEIGHT,
  industrySwitchCost,
  MIN_ROUND_FOR_INDUSTRY_ACTIONS,
  NPC_STORE_SPECIALTY_DEVIATION_RULES,
  PRODUCT_CATEGORIES,
  specialtyMismatchPenalty,
} from "./config.js";
import { allocateCategoryPurchase } from "./purchaseMatching.js";
import { chargeDiscretionary } from "./settlement.js";
import {
  decideCompanyProduction,
  decideHouseholdPurchases,
  scoreListingForBuyer,
  MAX_HOUSEHOLD_PURCHASE_UNITS,
  type CompanyProductionDecision,
  type HouseholdPurchaseDecision,
  type PurchaseLine,
  type StorePurchaseDecision,
} from "../npc/decisions.js";
import type { Rng } from "./rng.js";
import type {
  CompanyState,
  HouseholdState,
  ParticipantId,
  ProductCategoryId,
  RetailListing,
  StoreState,
  WholesaleListing,
} from "../types/domain.js";

/** 자동배분(안전망) 정렬 기준. 생략 시 "price". */
export type AutoFillPreference = "price" | "quality";

/** 1~3순위 수동 지정 한 건 (이전 이름 PurchaseRequestLine — 모양은 그대로 {listingId, quantity}). */
export interface PriorityPurchasePick {
  listingId: string;
  quantity: number;
}

/** 가게의 도매 매입 요청. 가게는 이번 라운드 판매 카테고리가 하나뿐이므로 categoryId가 없다. */
export interface StorePurchaseRequest {
  /** 순위=배열 순서. 최대 3개(초과분은 앞 3개만 사용). */
  priorityPicks: PriorityPurchasePick[];
  /** 이 카테고리에서 이번 라운드 사고 싶은 "총" 수량(1~3순위 포함). */
  maxQuantity: number;
  /** 1~3순위 밖 자동배분에만 적용되는 상한가. 생략=무제한. */
  maxUnitPrice?: number;
  /** 생략="price". */
  autoFillPreference?: AutoFillPreference;
}

/** 가계의 소매 구매 요청. 최대 4개 카테고리(food/apparel/electronics/toys)를 한 턴에 선언 가능. */
export interface CategoryPurchaseRequest {
  categoryId: ProductCategoryId;
  priorityPicks: PriorityPurchasePick[];
  maxQuantity: number;
  maxUnitPrice?: number;
  autoFillPreference?: AutoFillPreference;
}

export interface CompanyDecisionInput {
  quantity: number;
  quality: number;
  wholesalePrice: number;
  /**
   * 학생이 이번 라운드에 업종을 전환하고 싶을 때만 넣는다 (Milestone 6, docs/DECISIONS.md
   * D-033). 값이 없으면 "전환하지 않기로 선택"으로 취급한다 — resolveCompanyDecision이
   * 아니라 runCompanyTurn(src/engine/simulateGame.ts)이 사람 입력이 아예 없을 때만 NPC 전환
   * 로직을 대신 호출하므로, 이 필드를 생략한 것과 humanInput 자체가 undefined인 것은 다르게
   * 취급된다.
   */
  switchToCategoryId?: ProductCategoryId;
}

export function resolveCompanyDecision(
  company: CompanyState,
  availableCash: number,
  humanInput: CompanyDecisionInput | undefined,
  rng: Rng,
  costMultiplier = 1,
): CompanyProductionDecision | null {
  if (humanInput === undefined) {
    return decideCompanyProduction(company, availableCash, rng, costMultiplier);
  }
  const categoryId = company.productCategoryId;
  if (categoryId === null) {
    return null;
  }
  const unitCost = companyUnitCost(categoryId, company.districtId) * costMultiplier;
  const affordableQuantity = Math.floor(Math.max(0, availableCash) / unitCost);
  const quantity = Math.max(0, Math.min(Math.floor(humanInput.quantity), affordableQuantity));
  const quality = Math.min(1, Math.max(0, humanInput.quality));
  const wholesalePrice = Math.max(0, humanInput.wholesalePrice);

  return { categoryId, quantity, quality, wholesalePrice, unitCost, productionCost: quantity * unitCost };
}

/**
 * 학생이 업종 전환을 요청했을 때만 적용한다 (Milestone 6, B안 — 재고 유무는 게이팅 조건에
 * 넣지 않는다). `company.ledger.cash`는 호출 시점에 이미 이번 라운드 고정비가 차감된
 * 상태여야 한다(runCompanyTurn이 applyFixedCosts 이후에 이 함수를 호출한다) — 그 값을
 * "가용 현금"으로 그대로 쓴다. 조건 미달(라운드 미달/동일 카테고리/잔액 부족/카테고리 미배정)
 * 이면 아무것도 하지 않고 조용히 무시한다(에러 아님). 전환이 확정되면 그 자리에서 비용을
 * 차감하고 재고/품질을 0으로 리셋한다 — 보상 없이 즉시 폐기(B안).
 *
 * 사람 전환에는 NPC와 달리 쿨다운을 두지 않는다 — 학생이 실제로 감당 가능한 비용
 * (industrySwitchCost)만 내면 매 라운드도 다시 전환할 수 있다. 다만 이 호출이
 * lastIndustrySwitchRound를 갱신하므로, 이후 이 기업이 사람 입력 없이 봇으로 넘어가는
 * 라운드가 생기면 NPC 쿨다운(decideCompanyIndustrySwitch)은 이 값을 그대로 존중한다.
 */
export function resolveCompanyIndustrySwitch(
  company: CompanyState,
  currentRound: number,
  switchToCategoryId: ProductCategoryId | undefined,
): void {
  if (switchToCategoryId === undefined) return;
  if (currentRound < MIN_ROUND_FOR_INDUSTRY_ACTIONS) return;
  if (company.productCategoryId === null || company.productCategoryId === switchToCategoryId) return;

  const cost = industrySwitchCost(company.productCategoryId, switchToCategoryId);
  if (cost > company.ledger.cash) return;

  chargeDiscretionary(company.ledger, cost);
  company.productCategoryId = switchToCategoryId;
  company.inventoryQuantity = 0;
  company.quality = 0;
  company.lastIndustrySwitchRound = currentRound;
}

/**
 * 학생이 이번 라운드 판매 카테고리 변경을 요청했을 때만 적용한다 (Milestone 6). 가게 쪽은
 * specialtyMismatchPenalty가 소비 측(가계 매력도)에서만 적용되므로 즉시 차감되는 비용이
 * 없다 — 대신 기업과 동일한 쿨다운(NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds)을
 * lastSellingCategoryChangeRound 기준으로 적용한다. 조건 미달이면 조용히 무시한다.
 */
export function resolveStoreCategorySwitch(
  store: StoreState,
  currentRound: number,
  sellingCategoryId: ProductCategoryId | undefined,
): void {
  if (sellingCategoryId === undefined) return;
  if (currentRound < MIN_ROUND_FOR_INDUSTRY_ACTIONS) return;

  const currentCategory = store.currentSellingCategoryId ?? store.specialtyCategoryId;
  if (currentCategory === sellingCategoryId) return;
  if (
    store.lastSellingCategoryChangeRound !== null &&
    currentRound - store.lastSellingCategoryChangeRound < NPC_STORE_SPECIALTY_DEVIATION_RULES.cooldownRounds
  ) {
    return;
  }

  store.currentSellingCategoryId = sellingCategoryId;
  store.inventoryQuantity = 0;
  store.inventoryQuality = 0;
  store.lastSellingCategoryChangeRound = currentRound;
}

/**
 * 1~3순위 수동 지정(1단계) + 부족분 자동배분(2단계, 안전망)을 오케스트레이션하는 함수.
 * 가게(WholesaleListing/CompanyState)와 가계(RetailListing/StoreState) 양쪽 호출부가
 * 공유한다 — 두 경우 모두 "listing → 판매자 소유자 → 자기거래 방어적 재검증"이라는 같은
 * 모양의 절차이기 때문이다. `ownersLookup`으로 companies가 오면 가게 매입(리스팅에
 * `companyId`가 있음), stores가 오면 가계 구매(리스팅에 `storeId`가 있음)로 판단한다 — 이
 * 구분은 리스팅 자체의 모양("companyId" in listing)으로만 결정하며, 별도 플래그를 받지 않는다.
 *
 * export된 이유(구매 매칭 알고리즘 재설계 Stage 2): `src/ui/turnCalculations.ts`의
 * `previewCategoryPurchase`가 화면 실시간 미리보기 계산에 이 함수를 그대로 재사용한다 —
 * 서버가 실제로 쓰는 계산과 화면 미리보기 계산이 갈라지면(D-033류 재발) 화면에 보이는
 * 숫자와 실제 처리 결과가 달라질 수 있으므로, 미리보기 전용으로 그대로 노출한다.
 *
 * eligible은 이미 자기 거래 필터(및 호출자가 필요하면 카테고리 필터)까지 적용된 상태여야
 * 한다 — 이 함수는 그 위에 판매자 소유자 재검증만 방어적으로 추가한다 (D-005/D-006).
 *
 * 1단계는 `maxUnitPrice`를 적용하지 않는다(학생이 이미 가격을 보고 고른 매물이므로). 2단계
 * 자동배분만 `maxUnitPrice`(생략 시 무제한) 안에서, `autoFillPreference`에 따라 품질 우선
 * (scoreListingForBuyer 기반) 또는 가격 우선(allocateCategoryPurchase의 기본 정렬)으로 채운다.
 *
 * `unitBudget`(호출자가 관리하는, 여러 카테고리가 공유할 수도 있는 잔여 수량)과
 * `request.maxQuantity`(이 카테고리 자체의 상한) 중 더 작은 쪽을 정수로 내림한
 * `categoryUnitBudget`을 1단계 클램핑부터 일관되게 사용한다 — 학생 입력(`pick.quantity`,
 * `maxQuantity`)이 비정수여도 최종 확정 수량은 항상 정수이고(D-027류 재발 방지), 카테고리별
 * 상한도 1단계 수동 지정 단계부터 실제로 강제된다(2단계 부족분 계산에만 적용되던 이전 버그 수정).
 */
export function resolveSingleCategoryPurchase(
  eligible: readonly (WholesaleListing | RetailListing)[],
  ownersLookup: Readonly<Record<ParticipantId, CompanyState>> | Readonly<Record<ParticipantId, StoreState>>,
  ownerIdOfBuyer: ParticipantId,
  request: StorePurchaseRequest | CategoryPurchaseRequest,
  cashBudget: number,
  unitBudget: number,
  rng: Rng,
): { purchases: PurchaseLine[]; spentCash: number; spentUnits: number } {
  const isValidSeller = (listing: WholesaleListing | RetailListing): boolean => {
    const sellerId = "companyId" in listing ? listing.companyId : listing.storeId;
    const seller = ownersLookup[sellerId];
    return seller !== undefined && seller.ownerId !== ownerIdOfBuyer;
  };

  const categoryUnitBudget = Math.max(0, Math.floor(Math.min(unitBudget, request.maxQuantity)));

  const purchases: PurchaseLine[] = [];
  let remainingCash = cashBudget;
  let remainingCategoryUnits = categoryUnitBudget;
  const usedListingIds = new Set<string>();

  for (const pick of request.priorityPicks.slice(0, 3)) {
    const listing = eligible.find((l) => l.id === pick.listingId);
    if (listing === undefined) continue;
    if (!isValidSeller(listing)) continue; // 자기거래/미확인 판매자 방어적 거부
    const affordable = Math.floor(remainingCash / listing.price);
    const quantity = Math.max(
      0,
      Math.min(Math.floor(pick.quantity), listing.quantityAvailable, affordable, remainingCategoryUnits),
    );
    if (quantity <= 0) continue;
    purchases.push({ listingId: listing.id, quantity, unitPrice: listing.price });
    remainingCash -= quantity * listing.price;
    remainingCategoryUnits -= quantity;
    usedListingIds.add(listing.id);
  }

  const shortfall = remainingCategoryUnits;
  const maxUnitPrice = request.maxUnitPrice ?? Infinity;
  // eligible은 호출자가 이미 자기거래를 걸러 넘겨주는 것을 기대하지만, 자동배분(2단계)도
  // 1단계와 동일하게 방어적으로 재검증한다 — 호출자의 필터링이 어떤 이유로든 자기거래/삭제된
  // 참여자의 매물을 놓쳐도, 안전망 자체가 그 매물을 다시 골라 사는 일이 없도록 한다(D-005/D-006).
  const candidates = eligible.filter((l) => !usedListingIds.has(l.id) && isValidSeller(l));

  const scoreFn =
    request.autoFillPreference === "quality"
      ? (listing: WholesaleListing | RetailListing): number => {
          if ("companyId" in listing) {
            return scoreListingForBuyer(listing.price, listing.quality, listing.categoryId, HUMAN_AUTO_FILL_QUALITY_WEIGHT, rng, 0);
          }
          const sellingStore = (ownersLookup as Readonly<Record<ParticipantId, StoreState>>)[listing.storeId];
          const adjustment =
            sellingStore !== undefined && sellingStore.specialtyCategoryId !== null
              ? -specialtyMismatchPenalty(sellingStore.specialtyCategoryId, listing.categoryId)
              : 0;
          return scoreListingForBuyer(listing.price, listing.quality, listing.categoryId, HUMAN_AUTO_FILL_QUALITY_WEIGHT, rng, adjustment);
        }
      : undefined;

  const autoPurchases = allocateCategoryPurchase(candidates, shortfall, maxUnitPrice, remainingCash, rng, scoreFn);
  for (const purchase of autoPurchases) {
    purchases.push(purchase);
    remainingCash -= purchase.quantity * purchase.unitPrice;
    remainingCategoryUnits -= purchase.quantity;
  }

  return {
    purchases,
    spentCash: cashBudget - remainingCash,
    spentUnits: categoryUnitBudget - remainingCategoryUnits,
  };
}

/**
 * `request`가 `undefined`면 "이 카테고리에서 안 삼"으로 처리한다 — 봇으로 위임하지 않는다
 * (파일 상단 docstring의 계약 정정 참고). 봇 위임 여부는 엔진(runStoreTurn)이
 * `decisionSource?.getStorePurchaseRequest(id)` 자체가 `undefined`인지로만 판단한다.
 *
 * eligibleListings는 이미 자기 거래 금지 필터(src/economy/market.ts)가 적용된 상태여야
 * 한다 — 전문 업종(이번 라운드 판매 카테고리) 필터는 이 함수가 직접 적용한다(사람 가게도
 * 봇과 마찬가지로 `store.currentSellingCategoryId ?? store.specialtyCategoryId` 안에서만
 * 매입한다). companies는 매물의 실제 판매자 소유자를 재확인하는 데 쓴다 — eligibleListings가
 * 필터링을 놓치더라도 자기 거래(D-005)는 여기서 다시 막힌다.
 */
export function resolveStorePurchases(
  store: StoreState,
  availableCash: number,
  eligibleListings: readonly WholesaleListing[],
  companies: Readonly<Record<ParticipantId, CompanyState>>,
  request: StorePurchaseRequest | undefined,
  rng: Rng,
): StorePurchaseDecision {
  const effective: StorePurchaseRequest = request ?? { priorityPicks: [], maxQuantity: 0 };
  const sellingCategoryId = store.currentSellingCategoryId ?? store.specialtyCategoryId;
  const eligibleForCategory = eligibleListings.filter((l) => l.categoryId === sellingCategoryId);

  const result = resolveSingleCategoryPurchase(
    eligibleForCategory,
    companies,
    store.ownerId,
    effective,
    availableCash,
    effective.maxQuantity,
    rng,
  );
  return { purchases: result.purchases };
}

/** 식품→의류(필수 소비, ESSENTIAL_CATEGORY_IDS 순서) → 그 외 PRODUCT_CATEGORIES 순서로 요청을 재정렬한다. */
function orderCategoriesByFixedPriority(
  requests: readonly CategoryPurchaseRequest[],
): CategoryPurchaseRequest[] {
  const byCategory = new Map(requests.map((request) => [request.categoryId, request]));
  const fixedOrder = [
    ...ESSENTIAL_CATEGORY_IDS,
    ...PRODUCT_CATEGORIES.filter((categoryId) => !ESSENTIAL_CATEGORY_IDS.includes(categoryId)),
  ];
  const ordered: CategoryPurchaseRequest[] = [];
  for (const categoryId of fixedOrder) {
    const request = byCategory.get(categoryId);
    if (request !== undefined) ordered.push(request);
  }
  return ordered;
}

/**
 * `requests`가 `undefined`면 기존과 동일하게 봇 정책(decideHouseholdPurchases)으로 위임한다 —
 * `requests`가 빈 배열이면(사람이 실제로 제출했지만 카테고리를 하나도 요청하지 않음) "아무 것도
 * 안 삼"으로 처리한다(이 구분은 Stage 1 이전부터 성립하던 기존 계약 그대로다).
 *
 * eligibleListings는 이미 자기 거래 금지 필터(src/economy/market.ts)가 적용된 상태여야
 * 한다. stores는 매물의 실제 판매자 소유자를 재확인하는 데 쓴다 — eligibleListings가
 * 필터링을 놓치더라도 자기 거래(D-006)는 여기서 다시 막힌다.
 *
 * 카테고리는 식품→의류→그 외 순서로 처리하며, 한 카테고리에서 다 쓰지 못한 현금/수량 예산은
 * 다음 카테고리로 그대로 이어진다(가계 전체 예산은 카테고리별로 나뉘어 있지 않다).
 */
export function resolveHouseholdPurchases(
  household: HouseholdState,
  availableCash: number,
  eligibleListings: readonly RetailListing[],
  stores: Readonly<Record<ParticipantId, StoreState>>,
  requests: readonly CategoryPurchaseRequest[] | undefined,
  rng: Rng,
): HouseholdPurchaseDecision {
  if (requests === undefined) {
    return decideHouseholdPurchases(household, availableCash, eligibleListings, stores, rng);
  }

  const ordered = orderCategoriesByFixedPriority(requests);
  const purchases: PurchaseLine[] = [];
  let remainingCash = availableCash;
  let remainingUnits = MAX_HOUSEHOLD_PURCHASE_UNITS;

  for (const request of ordered) {
    const eligibleForCategory = eligibleListings.filter((l) => l.categoryId === request.categoryId);
    const result = resolveSingleCategoryPurchase(
      eligibleForCategory,
      stores,
      household.ownerId,
      request,
      remainingCash,
      remainingUnits,
      rng,
    );
    purchases.push(...result.purchases);
    remainingCash -= result.spentCash;
    remainingUnits -= result.spentUnits;
  }

  return { purchases };
}
