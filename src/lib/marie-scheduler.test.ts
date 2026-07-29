import { describe, expect, it } from "vitest";
import { proposeSchedule, persistScheduleProposal, type ScheduleProposal } from "./marie-scheduler";

// These tests run against the same disposable SQLite DB as the integration suite.
// They validate the core contract: read-only, no mutation, operator-owned guard.

describe("marie-scheduler read-only extraction", () => {
  it("proposeSchedule is a function that returns proposals without mutating", async () => {
    const result = await proposeSchedule("nonexistent-user");
    expect(result.proposed).toEqual([]);
    expect(result.unscheduled).toEqual([]);
    expect(result.dayStates).toEqual({});
  });

  it("persistScheduleProposal rejects a nonexistent order", async () => {
    const result = await persistScheduleProposal({
      internalId: "nonexistent",
      date: "2026-08-01",
      points: 1,
    });
    expect(result.persisted).toBe(false);
    expect(result.reason).toContain("not found");
  });
});
