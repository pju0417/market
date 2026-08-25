import { describe, expect, it } from "vitest";
import { categorySimilarity, industrySwitchCost, specialtyMismatchPenalty } from "../../src/economy/config.js";

describe("categorySimilarity", () => {
  it("is 1 for the same category", () => {
    expect(categorySimilarity("food", "food")).toBe(1);
  });

  it("is symmetric", () => {
    expect(categorySimilarity("food", "toys")).toBe(categorySimilarity("toys", "food"));
  });
});

describe("industrySwitchCost (D-011)", () => {
  it("is zero when staying in the same category", () => {
    expect(industrySwitchCost("food", "food")).toBe(0);
  });

  it("is higher for less similar categories", () => {
    const similarSwitch = industrySwitchCost("food", "toys");
    const dissimilarSwitch = industrySwitchCost("food", "electronics");
    expect(dissimilarSwitch).toBeGreaterThan(similarSwitch);
  });
});

describe("specialtyMismatchPenalty", () => {
  it("is zero when selling within specialty", () => {
    expect(specialtyMismatchPenalty("food", "food")).toBe(0);
  });

  it("grows as the sold category diverges from the specialty", () => {
    const nearPenalty = specialtyMismatchPenalty("food", "toys");
    const farPenalty = specialtyMismatchPenalty("food", "electronics");
    expect(farPenalty).toBeGreaterThan(nearPenalty);
  });
});
