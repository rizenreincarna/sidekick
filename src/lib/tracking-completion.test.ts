import { describe, expect, it, vi } from "vitest";
import { completeTrackingAtomically, TrackingCompletionRaceError, undoTrackingAtomically } from "./tracking-completion";

describe("tracking completion CAS", () => {
  it("does not mutate the tracking link when the order CAS loses", async () => {
    const tx = { order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, trackingLink: { updateMany: vi.fn() } };
    await expect(completeTrackingAtomically(tx as never, { token: "t", userId: "u", orderId: "o", expectedStatus: "BOOKED", completedAt: new Date() })).rejects.toBeInstanceOf(TrackingCompletionRaceError);
    expect(tx.trackingLink.updateMany).not.toHaveBeenCalled();
  });

  it("does not clear the tracking link when undo order CAS loses", async () => {
    const tx = { order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, trackingLink: { updateMany: vi.fn() } };
    await expect(undoTrackingAtomically(tx as never, { token: "t", userId: "u", orderId: "o" })).rejects.toBeInstanceOf(TrackingCompletionRaceError);
    expect(tx.trackingLink.updateMany).not.toHaveBeenCalled();
  });
});
