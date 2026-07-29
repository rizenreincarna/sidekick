import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  holidayFindMany: vi.fn(),
  offDayFindMany: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    order: { findMany: mocks.orderFindMany },
    holiday: { findMany: mocks.holidayFindMany },
    offDay: { findMany: mocks.offDayFindMany },
  },
}));

import { computeMarieDryRun } from "./marie-dry-run";
import { mytDisplayDate } from "./marie-operations";

const pendingOrder = (index: number) => ({
  id: `id-${index}`,
  orderId: `source-${index}`,
  userId: index % 2 === 0 ? "hero-a" : "hero-b",
  status: "PENDING",
  phone: "0123456789",
  points: 1,
  zone: 1,
  isOffice: false,
  isEvent: false,
  isErthbox: false,
  addressVerified: true,
  latitude: 3.1,
  longitude: 101.6,
});

describe("computeMarieDryRun read safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.holidayFindMany.mockResolvedValue([]);
    mocks.offDayFindMany.mockResolvedValue([]);
  });

  it("reads every pending order without a cap and reports a complete source count", async () => {
    const pending = Array.from({ length: 501 }, (_, index) => pendingOrder(index));
    mocks.orderFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.status === "PENDING") return pending;
      if (args.where.isEvent === true) return [];
      return [];
    });

    const report = await computeMarieDryRun(new Date("2026-07-27T16:00:00Z"));
    const pendingCall = mocks.orderFindMany.mock.calls.find(([args]) => args.where.status === "PENDING")?.[0];

    expect(pendingCall).toBeDefined();
    expect(pendingCall).not.toHaveProperty("take");
    expect(pendingCall.select.isOffice).toBe(true);
    expect(pendingCall.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
    expect(report.summary).toMatchObject({ sourcePendingOrders: 501, evaluated: 501, truncated: false });
    expect(report.mutated).toBe(false);
    expect(report.plans).toHaveLength(501);
    expect(mocks.orderFindMany).toHaveBeenCalledTimes(3);
    expect(mocks.holidayFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.offDayFindMany).toHaveBeenCalledTimes(1);
  });

  it("never selects CONTACTED or BOOKED orders as mutation candidates", async () => {
    mocks.orderFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.status === "PENDING") return [];
      if (args.where.isEvent === true) return [];
      return [];
    });

    await computeMarieDryRun(new Date("2026-07-27T16:00:00Z"));
    const pendingCall = mocks.orderFindMany.mock.calls.find(([args]) => args.where.status === "PENDING")?.[0];
    const activeCall = mocks.orderFindMany.mock.calls.find(([args]) => typeof args.where.status === "object" && args.where.status !== null)?.[0];

    // Candidates are strictly PENDING.
    expect(pendingCall.where.status).toBe("PENDING");
    // CONTACTED/BOOKED are read only as existing load for capacity and route math.
    expect(activeCall.where.status).toEqual({ in: ["SCHEDULED", "CONTACTED", "BOOKED"] });
    expect(activeCall.select).not.toHaveProperty("id");
  });

  it("emits a short customer-safe draft with PII placeholders", async () => {
    mocks.orderFindMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.status === "PENDING") return [pendingOrder(0)];
      if (args.where.isEvent === true) return [];
      return [];
    });

    const report = await computeMarieDryRun(new Date("2026-07-27T16:00:00Z"));
    const [plan] = report.plans;

    expect(plan.action).toBe("PROPOSE_SCHEDULE");
    expect(plan.draftMessage).toContain("[CUSTOMER_NAME]");
    // Customer-facing wording uses "31 Jul 2026", not the ISO planning date.
    expect(plan.draftMessage).toContain(mytDisplayDate(plan.proposedDate!));
    expect(plan.draftMessage).toContain("erth.app");
    // No PII and no internal terminology leaks into the report.
    expect(plan.draftMessage).not.toContain("0123456789");
    expect(plan.draftMessage).not.toMatch(/points|zone|capacity|route/i);
  });
});
