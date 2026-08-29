import { describe, expect, it } from "vitest";
import { computeUnsubmittedParticipants } from "../../src/ui/network/submissionStatus.js";
import type { PlayerSlot } from "../../src/ui/network/sessionClient.js";

const slots: PlayerSlot[] = [
  { playerId: "student-1", companyId: "student-1-company", storeId: "student-1-store", householdId: "student-1-household", displayName: "학생 1" },
  { playerId: "student-2", companyId: "student-2-company", storeId: "student-2-store", householdId: "student-2-household", displayName: "학생 2" },
];

describe("computeUnsubmittedParticipants (Milestone 4 3단계, pure function, no DOM)", () => {
  it("maps unsubmitted companyIds back to their player slots during company-turn", () => {
    const result = computeUnsubmittedParticipants(slots, ["student-2-company"], "company-turn");
    expect(result).toEqual([{ playerId: "student-2", displayName: "학생 2", participantId: "student-2-company" }]);
  });

  it("maps unsubmitted storeIds during store-turn and householdIds during household-turn", () => {
    const store = computeUnsubmittedParticipants(slots, ["student-1-store"], "store-turn");
    expect(store).toEqual([{ playerId: "student-1", displayName: "학생 1", participantId: "student-1-store" }]);

    const household = computeUnsubmittedParticipants(slots, ["student-1-household", "student-2-household"], "household-turn");
    expect(household).toEqual([
      { playerId: "student-1", displayName: "학생 1", participantId: "student-1-household" },
      { playerId: "student-2", displayName: "학생 2", participantId: "student-2-household" },
    ]);
  });

  it("returns an empty list when nobody is unsubmitted", () => {
    expect(computeUnsubmittedParticipants(slots, [], "company-turn")).toEqual([]);
  });

  it("returns an empty list for phases with no participant field mapping", () => {
    // For settlement/market-update phases, unsubmittedParticipantIds is genuinely always empty
    // (no human input is ever required), so the defensive non-empty input below can't happen in
    // practice.
    expect(computeUnsubmittedParticipants(slots, ["student-1-company"], "company-settlement")).toEqual([]);
    expect(computeUnsubmittedParticipants(slots, [], "wholesale-market-update")).toEqual([]);
  });

  it("maps unsubmitted PlayerState.id values back to their player slots during round-result (Milestone 4 4-b, D-030)", () => {
    const result = computeUnsubmittedParticipants(slots, ["student-1"], "round-result");
    expect(result).toEqual([{ playerId: "student-1", displayName: "학생 1", participantId: "student-1" }]);
  });

  it("ignores participant ids that don't match any known slot (defensive, should not crash)", () => {
    expect(computeUnsubmittedParticipants(slots, ["no-such-company"], "company-turn")).toEqual([]);
  });
});
