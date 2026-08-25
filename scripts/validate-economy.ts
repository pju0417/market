/**
 * Milestone 1 economy validation.
 *
 * "코드가 오류 없이 실행되는 것"과 "게임이 의도대로 작동하는 것"은 다른 검증이다
 * (CLAUDE.md). 이 스크립트는 데이터 무결성(버그) 항목은 실패로 처리하고, 시장 쏠림 같은
 * 밸런스 신호는 economy-reviewer가 볼 수 있도록 보고만 하고 실패 처리하지 않는다.
 *
 * 사용법: npm run validate:economy
 */
import { simulateGame } from "../src/engine/simulateGame.js";
import type { GameState } from "../src/types/domain.js";

const CLASS_SIZES = [1, 5, 10, 20];
const SEEDS = [1, 42, 999];

interface IntegrityViolation {
  scenario: string;
  message: string;
}

function checkIntegrity(state: GameState, scenario: string): IntegrityViolation[] {
  const violations: IntegrityViolation[] = [];

  for (const company of Object.values(state.companies)) {
    if (company.ledger.cash < 0) {
      violations.push({ scenario, message: `company ${company.id} has negative cash: ${company.ledger.cash}` });
    }
    if (company.inventoryQuantity < 0) {
      violations.push({ scenario, message: `company ${company.id} has negative inventory: ${company.inventoryQuantity}` });
    }
  }
  for (const store of Object.values(state.stores)) {
    if (store.ledger.cash < 0) {
      violations.push({ scenario, message: `store ${store.id} has negative cash: ${store.ledger.cash}` });
    }
    if (store.inventoryQuantity < 0) {
      violations.push({ scenario, message: `store ${store.id} has negative inventory: ${store.inventoryQuantity}` });
    }
  }
  for (const household of Object.values(state.households)) {
    if (household.ledger.cash < 0) {
      violations.push({ scenario, message: `household ${household.id} has negative cash: ${household.ledger.cash}` });
    }
  }
  for (const listing of state.wholesaleListings) {
    if (listing.quantityAvailable < 0) {
      violations.push({ scenario, message: `wholesale listing ${listing.id} has negative quantity` });
    }
  }
  for (const listing of state.retailListings) {
    if (listing.quantityAvailable < 0) {
      violations.push({ scenario, message: `retail listing ${listing.id} has negative quantity` });
    }
  }

  return violations;
}

/** 마지막 라운드 도매/소매 시장에서 가장 큰 점유율 (1에 가까울수록 독점에 가깝다). */
function maxMarketShare(state: GameState): { wholesale: number; retail: number } {
  const last = state.roundMetrics.at(-1);
  if (!last) return { wholesale: 0, retail: 0 };
  const wholesale = Math.max(0, ...Object.values(last.companyMarketShare));
  const retail = Math.max(0, ...Object.values(last.storeMarketShare));
  return { wholesale, retail };
}

async function main(): Promise<void> {
  const allViolations: IntegrityViolation[] = [];

  for (const studentCount of CLASS_SIZES) {
    for (const seed of SEEDS) {
      const scenario = `students=${studentCount} seed=${seed}`;
      const { state } = await simulateGame(studentCount, seed);
      allViolations.push(...checkIntegrity(state, scenario));

      const npcCompanyCount = Object.values(state.companies).filter((c) => c.kind === "npc").length;
      const npcStoreCount = Object.values(state.stores).filter((s) => s.kind === "npc").length;
      const share = maxMarketShare(state);
      console.log(
        `[${scenario}] npcCompanies=${npcCompanyCount} npcStores=${npcStoreCount} ` +
          `maxWholesaleShare=${share.wholesale.toFixed(2)} maxRetailShare=${share.retail.toFixed(2)}`,
      );
    }
  }

  const seedA = await simulateGame(5, 777);
  const seedB = await simulateGame(5, 777);
  const deterministic = JSON.stringify(seedA.state.roundMetrics) === JSON.stringify(seedB.state.roundMetrics);
  console.log(`[determinism] same seed produces identical round metrics: ${deterministic}`);
  if (!deterministic) {
    allViolations.push({ scenario: "determinism", message: "same rngSeed produced different results" });
  }

  if (allViolations.length > 0) {
    console.error(`\n${allViolations.length} data-integrity violation(s) found:`);
    for (const v of allViolations) {
      console.error(`  [${v.scenario}] ${v.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\nNo data-integrity violations found. Market concentration numbers above are for " +
      "economy-reviewer's judgment, not a pass/fail check.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
