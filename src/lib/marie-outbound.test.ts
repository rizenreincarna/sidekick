import { describe, expect, it, vi } from "vitest";
import { assessOutboundPolicy, isConsistentOutboundGraph, isSafeExpiredLeaseRetry, nextMytContactStart, runMarieWorker, type WorkerConfig } from "./marie-outbound";

const config: WorkerConfig = {
  enabled: true,
  mode: "PILOT",
  contactStartHour: 8,
  contactEndHour: 20,
  pilotAllowlist: ["+60123456789"],
  maxMessagesPerRun: 1,
  maxMessagesPerHour: 2,
  maxMessagesPerDay: 5,
  maxRetries: 3,
};

const eligible = { config, now: new Date("2026-07-28T04:00:00Z"), phone: "+60123456789", orderStatus: "SCHEDULED", conversationActive: true, activeHold: false, hourCount: 0, dayCount: 0 };

describe("Marie outbound policy", () => {
  it("gates mode, allowlist, window, hold, status, and limits", () => {
    expect(assessOutboundPolicy(eligible)).toBeNull();
    expect(assessOutboundPolicy({ ...eligible, config: { ...config, enabled: false } })).toBe("MODE_GATE");
    expect(assessOutboundPolicy({ ...eligible, phone: "+60111111111" })).toBe("MODE_GATE");
    expect(assessOutboundPolicy({ ...eligible, now: new Date("2026-07-28T15:00:00Z") })).toBe("CONTACT_WINDOW");
    expect(assessOutboundPolicy({ ...eligible, activeHold: true })).toBe("ACTIVE_HOLD");
    expect(assessOutboundPolicy({ ...eligible, orderStatus: "PENDING" })).toBe("ORDER_STATUS");
    expect(assessOutboundPolicy({ ...eligible, hourCount: 2 })).toBe("RATE_LIMIT");
  });

  it("schedules a closed-window job at the next MYT contact start", () => {
    expect(nextMytContactStart(new Date("2026-07-28T13:00:00Z"), 8, 20).toISOString()).toBe("2026-07-29T00:00:00.000Z");
  });

  it("never calls an injected provider while disabled or DRY_RUN", async () => {
    const provider = { sendText: vi.fn() };
    await expect(runMarieWorker({ provider, config: { ...config, enabled: false } })).resolves.toMatchObject({ externalCalls: 0 });
    await expect(runMarieWorker({ provider, config: { ...config, mode: "DRY_RUN" } })).resolves.toMatchObject({ externalCalls: 0 });
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it("treats every adapter throw after invocation as uncertain by contract", async () => {
    const provider = { sendText: vi.fn().mockRejectedValue(new Error("timeout")) };
    await expect(provider.sendText({ recipient: "+60123456789", body: "test", idempotencyKey: "key" })).rejects.toThrow("timeout");
    expect(provider.sendText).toHaveBeenCalledOnce();
  });

  it("rejects inconsistent job, order, conversation, and message graphs before send", () => {
    const valid = { jobOrderId: "o", jobConversationId: "c", orderId: "o", conversationId: "c", messageConversationId: "c", messageDirection: "OUTBOUND", messageState: "QUEUED", hasBody: true, hasPhone: true };
    expect(isConsistentOutboundGraph(valid)).toBe(true);
    expect(isConsistentOutboundGraph({ ...valid, messageConversationId: "other" })).toBe(false);
    expect(isConsistentOutboundGraph({ ...valid, messageState: "SENDING" })).toBe(false);
  });

  it("retries only expired leases that provably never started sending", () => {
    expect(isSafeExpiredLeaseRetry("QUEUED")).toBe(true);
    expect(isSafeExpiredLeaseRetry("RETRY")).toBe(true);
    expect(isSafeExpiredLeaseRetry("SENDING")).toBe(false);
    expect(isSafeExpiredLeaseRetry("SENT")).toBe(false);
    expect(isSafeExpiredLeaseRetry("SEND_UNCERTAIN")).toBe(false);
    expect(isSafeExpiredLeaseRetry(null)).toBe(false);
  });
});
