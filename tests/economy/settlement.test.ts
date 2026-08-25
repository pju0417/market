import { describe, expect, it } from "vitest";
import { applyFixedCosts, chargeCapped, chargeDiscretionary, credit } from "../../src/economy/settlement.js";
import type { Ledger } from "../../src/types/domain.js";

function makeLedger(cash: number): Ledger {
  return { cash, cumulativeProfit: 0 };
}

describe("chargeCapped", () => {
  it("charges the full amount when affordable", () => {
    const ledger = makeLedger(100);
    const paid = chargeCapped(ledger, 40);
    expect(paid).toBe(40);
    expect(ledger.cash).toBe(60);
  });

  it("caps at available cash and never goes negative", () => {
    const ledger = makeLedger(30);
    const paid = chargeCapped(ledger, 100);
    expect(paid).toBe(30);
    expect(ledger.cash).toBe(0);
  });
});

describe("applyFixedCosts", () => {
  it("pays labor before rent when cash is insufficient for both", () => {
    const ledger = makeLedger(50);
    const result = applyFixedCosts(ledger, 40, 40);
    expect(result.laborPaid).toBe(40);
    expect(result.rentPaid).toBe(10);
    expect(ledger.cash).toBe(0);
  });
});

describe("chargeDiscretionary / credit", () => {
  it("directly adjusts cash without clamping (bugs should surface as negative cash in tests)", () => {
    const ledger = makeLedger(50);
    chargeDiscretionary(ledger, 20);
    expect(ledger.cash).toBe(30);
    credit(ledger, 15);
    expect(ledger.cash).toBe(45);
  });
});
