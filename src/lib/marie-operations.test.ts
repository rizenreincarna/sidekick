import { describe, expect, it } from "vitest";
import {
  assessCapacity,
  checkModeEligibility,
  classifyInboundIntent,
  generateDryRunPlans,
  generateUserIsolatedDryRunPlans,
  isWithinMytContactWindow,
  normalizeMalaysianPhone,
  renderInitialContactDraft,
  renderMessageTemplate,
  validateLifecycleTransition,
} from "./marie-operations";

const pendingOrder = {
  id: "internal-id",
  orderId: "12345",
  status: "PENDING",
  phone: "012-345 6789",
  points: 3,
  zone: 1,
  isOffice: false,
  isEvent: false,
  isErthbox: false,
  addressVerified: true,
  latitude: 3.1,
  longitude: 101.6,
};

describe("Marie policies", () => {
  it("normalizes Malaysian phones", () => {
    expect(normalizeMalaysianPhone("012-345 6789")).toBe("+60123456789");
    expect(normalizeMalaysianPhone("+60 12 345 6789")).toBe("+60123456789");
    expect(normalizeMalaysianPhone("123")).toBeNull();
  });

  it("enforces inclusive 08:00 and 20:00 MYT boundaries", () => {
    expect(isWithinMytContactWindow(new Date("2026-07-28T00:00:00Z"))).toBe(true);
    expect(isWithinMytContactWindow(new Date("2026-07-28T12:00:00Z"))).toBe(true);
    expect(isWithinMytContactWindow(new Date("2026-07-28T12:01:00Z"))).toBe(false);
    expect(isWithinMytContactWindow(new Date("2026-07-27T23:59:00Z"))).toBe(false);
  });

  it("gates disabled, dry-run, pilot, and live modes", () => {
    expect(checkModeEligibility({ enabled: false, mode: "LIVE", pilotAllowlist: [] }, pendingOrder.phone).eligible).toBe(false);
    expect(checkModeEligibility({ enabled: true, mode: "DRY_RUN", pilotAllowlist: [] }, pendingOrder.phone).eligible).toBe(false);
    expect(checkModeEligibility({ enabled: true, mode: "PILOT", pilotAllowlist: ["0123456789"] }, pendingOrder.phone).eligible).toBe(true);
    expect(checkModeEligibility({ enabled: true, mode: "LIVE", pilotAllowlist: [] }, pendingOrder.phone).eligible).toBe(true);
  });

  it("applies capacity policy and lifecycle rules", () => {
    expect(assessCapacity(17, 3)).toBe("NORMAL");
    expect(assessCapacity(20, 5)).toBe("EXCEPTION");
    expect(assessCapacity(24, 2)).toBe("REJECT");
    expect(validateLifecycleTransition("SCHEDULED", "CONTACTED")).toBe(true);
    expect(validateLifecycleTransition("SCHEDULED", "BOOKED")).toBe(false);
  });

  it("classifies deterministic intents conservatively", () => {
    expect(classifyInboundIntent("yes")).toBe("ACCEPT");
    expect(classifyInboundIntent("please cancel my order")).toBe("CANCEL_REQUEST");
    expect(classifyInboundIntent("confirm", true)).toBe("CANCEL_CONFIRMATION");
    expect(classifyInboundIntent("Can we do Friday?")).toBe("DATE_REQUEST");
    expect(classifyInboundIntent("do not contact me")).toBe("OPT_OUT");
    expect(classifyInboundIntent("My lawyer wants compensation")).toBe("HIGH_RISK");
    expect(classifyInboundIntent("maybe that could work")).toBe("AMBIGUOUS");
  });

  it("renders only supplied template values", () => {
    expect(renderMessageTemplate("Hello {name}", { name: "Customer" })).toBe("Hello Customer");
    expect(() => renderMessageTemplate("Hello {name}", {})).toThrow("Missing template value");
  });

  it("holds operator-owned CONTACTED and BOOKED orders instead of rearranging them", () => {
    for (const status of ["CONTACTED", "BOOKED", "CONFIRMED"]) {
      const [plan] = generateDryRunPlans(
        [{ ...pendingOrder, status }],
        [],
        [],
        new Date("2026-07-27T16:00:00Z"),
      );
      expect(plan).toMatchObject({
        action: "HOLD",
        proposedDate: null,
        expectedTransition: null,
        draftMessage: null,
      });
      expect(plan.reason).toContain("Operator-owned order");
    }
  });

  it("still counts operator-owned orders as existing load for capacity", () => {
    const [plan] = generateDryRunPlans(
      [pendingOrder],
      [{ date: "2026-07-30", points: 20, zone: 1, latitude: 3.1, longitude: 101.6 }],
      [],
      new Date("2026-07-27T16:00:00Z"),
    );
    // A full day from already-contacted customers must push the candidate elsewhere.
    expect(plan.proposedDate).not.toBe("2026-07-30");
  });

  it("renders a transparent initial contact draft with weekday and no invented time", () => {
    const draft = renderInitialContactDraft({
      customerName: "Aisha",
      orderRef: "12345",
      proposedDate: "2026-07-31",
      address: "1 Jalan Test",
    });
    expect(draft).toContain("this is Marie, an assistant for the ERTH pickup service");
    expect(draft).toContain("Friday, 2026-07-31");
    expect(draft).toContain("1 Jalan Test");
    expect(draft).not.toMatch(/\b\d{1,2}[:.]\d{2}\s*(am|pm)?\b/i);
  });

  it("produces opaque sequential plans without mutating inputs", () => {
    const orders = [pendingOrder];
    const snapshot = structuredClone(orders);
    const result = generateDryRunPlans(orders, [], [], new Date("2026-07-27T16:00:00Z"));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ action: "PROPOSE_SCHEDULE", proposedDate: "2026-07-30", expectedTransition: "PENDING -> SCHEDULED" });
    expect(result[0].redactedOrder).toBe("order_001");
    expect(orders).toEqual(snapshot);
  });

  it("isolates capacity and blocked calendars by user", () => {
    const orders = [
      { ...pendingOrder, userId: "hero-a", orderId: "a", points: 5 },
      { ...pendingOrder, userId: "hero-b", orderId: "b", points: 5 },
    ];
    const plans = generateUserIsolatedDryRunPlans(
      orders,
      [{ userId: "hero-a", date: "2026-07-30", points: 25 }],
      [{ userId: "hero-b", date: "2026-07-31", kind: "OFF_DAY" }],
      new Date("2026-07-27T16:00:00Z"),
    );
    expect(plans).toEqual(expect.arrayContaining([
      expect.objectContaining({ heroBucket: "hero_001", redactedOrder: "order_001", proposedDate: "2026-07-31" }),
      expect.objectContaining({ heroBucket: "hero_002", redactedOrder: "order_002", proposedDate: "2026-07-30" }),
    ]));
    expect(JSON.stringify(plans)).not.toContain("hero-a");
    expect(JSON.stringify(plans)).not.toContain("hero-b");
  });

  it("matches the scheduler horizon and never considers offset 21", () => {
    const blockedDates = Array.from({ length: 19 }, (_, index) => {
      const date = new Date("2026-07-30T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + index);
      return { date: date.toISOString().slice(0, 10), kind: "OFF_DAY" as const };
    });
    const [plan] = generateDryRunPlans([pendingOrder], [], blockedDates, new Date("2026-07-27T16:00:00Z"));
    expect(plan.action).toBe("HOLD");
    expect(plan.reason).toContain("21-day horizon");
  });

  it("blocks off-days and event dates for every order", () => {
    const blocks = [
      { date: "2026-07-30", kind: "OFF_DAY" as const },
      { date: "2026-07-31", kind: "EVENT" as const },
    ];
    const [plan] = generateDryRunPlans([pendingOrder], [], blocks, new Date("2026-07-27T16:00:00Z"));
    expect(plan.proposedDate).toBe("2026-08-01");
  });

  it("allows non-office orders on holidays and weekends", () => {
    const [holidayPlan] = generateDryRunPlans(
      [pendingOrder],
      [],
      [{ date: "2026-07-30", kind: "HOLIDAY" }],
      new Date("2026-07-27T16:00:00Z"),
    );
    const [weekendPlan] = generateDryRunPlans([pendingOrder], [], [], new Date("2026-07-29T16:00:00Z"));
    expect(holidayPlan.proposedDate).toBe("2026-07-30");
    expect(weekendPlan.proposedDate).toBe("2026-08-01");
  });

  it("blocks office orders on holidays and weekends only", () => {
    const officeOrder = { ...pendingOrder, isOffice: true };
    const [holidayPlan] = generateDryRunPlans(
      [officeOrder],
      [],
      [{ date: "2026-07-30", kind: "HOLIDAY" }],
      new Date("2026-07-27T16:00:00Z"),
    );
    const [weekendPlan] = generateDryRunPlans([officeOrder], [], [], new Date("2026-07-29T16:00:00Z"));
    expect(holidayPlan.proposedDate).toBe("2026-07-31");
    expect(weekendPlan.proposedDate).toBe("2026-08-03");
  });
});
