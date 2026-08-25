/**
 * Milestone 1 — Headless Economy Simulator.
 *
 * 사람 입력 없이 학생 소유 참여자 + NPC를 규칙 기반으로 자동 진행시켜 7라운드를 실행하고,
 * 라운드별 핵심 지표를 출력한다. 실제 밸런스 평가는 economy-reviewer의 몫이며, 이 스크립트는
 * "엔진이 실제로 끝까지 도는가 + 무슨 일이 있었는가"를 보여주는 용도다.
 *
 * 사용법:
 *   npm run simulate                (기본 5명)
 *   npm run simulate:smoke          (기본 5명, 요약 한 줄만 출력)
 *   npx tsx scripts/simulate-7-rounds.ts --players=10 --seed=7
 */
import { simulateGame } from "../src/engine/simulateGame.js";

function parseArgs(argv: string[]): { players: number; seed: number; smoke: boolean } {
  const smoke = argv.includes("--smoke");
  const playersArg = argv.find((arg) => arg.startsWith("--players="));
  const seedArg = argv.find((arg) => arg.startsWith("--seed="));
  const players = playersArg ? Number(playersArg.split("=")[1]) : 5;
  const seed = seedArg ? Number(seedArg.split("=")[1]) : 42;
  return {
    players: Number.isFinite(players) && players > 0 ? players : 5,
    seed: Number.isFinite(seed) ? seed : 42,
    smoke,
  };
}

async function main(): Promise<void> {
  const { players, seed, smoke } = parseArgs(process.argv.slice(2));
  const { state } = await simulateGame(players, seed);

  const companyCount = Object.keys(state.companies).length;
  const storeCount = Object.keys(state.stores).length;
  const householdCount = Object.keys(state.households).length;
  const roundsCompleted = state.roundMetrics.length;

  if (smoke) {
    console.log(
      `[simulate:smoke] players=${players} rounds=${roundsCompleted} ` +
        `companies=${companyCount} stores=${storeCount} households=${householdCount}`,
    );
    return;
  }

  for (const metrics of state.roundMetrics) {
    console.log(
      `Round ${metrics.round}: wholesale ${metrics.totalWholesaleVolume}units/₩${Math.round(metrics.totalWholesaleValue)} ` +
        `retail ${metrics.totalRetailVolume}units/₩${Math.round(metrics.totalRetailValue)} ` +
        `avgSatisfaction=${metrics.averageHouseholdSatisfaction.toFixed(2)}`,
    );
  }

  console.log(`\ncompanies=${companyCount} stores=${storeCount} households=${householdCount}`);
  const bankruptCompanies = Object.values(state.companies).filter((c) => c.ledger.cash <= 0).length;
  const bankruptStores = Object.values(state.stores).filter((s) => s.ledger.cash <= 0).length;
  console.log(`companies at/near zero cash: ${bankruptCompanies}, stores at/near zero cash: ${bankruptStores}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
