/**
 * 학급 규모별(1/5/10/20명) Headless Simulator 실행 요약. docs/TODO.md Milestone 1이
 * 기본 검증 대상으로 지정한 학급 규모를 한 번에 확인한다.
 *
 * 사용법: npm run simulate:class
 */
import { simulateGame } from "../src/engine/simulateGame.js";

const CLASS_SIZES = [1, 5, 10, 20];
const SEED = 42;

async function main(): Promise<void> {
  for (const studentCount of CLASS_SIZES) {
    const { state } = await simulateGame(studentCount, SEED);
    const companies = Object.values(state.companies);
    const stores = Object.values(state.stores);

    const avgCompanyProfit =
      companies.reduce((sum, c) => sum + c.ledger.cumulativeProfit, 0) / companies.length;
    const avgStoreProfit = stores.reduce((sum, s) => sum + s.ledger.cumulativeProfit, 0) / stores.length;
    const survivingCompanies = companies.filter((c) => c.ledger.cash > 0).length;
    const survivingStores = stores.filter((s) => s.ledger.cash > 0).length;
    const lastRound = state.roundMetrics.at(-1);

    console.log(
      `students=${studentCount}: rounds=${state.roundMetrics.length} ` +
        `companies=${companies.length}(survive ${survivingCompanies}) stores=${stores.length}(survive ${survivingStores}) ` +
        `avgCompanyProfit=${avgCompanyProfit.toFixed(1)} avgStoreProfit=${avgStoreProfit.toFixed(1)} ` +
        `finalSatisfaction=${lastRound ? lastRound.averageHouseholdSatisfaction.toFixed(2) : "n/a"}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
