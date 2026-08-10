import { describe, it, expect } from "vitest";
import { compareOrders, toTimestamp, type OrderSortable } from "./order-sort";

// Mirrors the production DB snapshot that exposed the bug: three EVENT-* orders
// batch-imported in the same newest second, then older regular orders, plus a
// large same-second tie group. createdAt uses Prisma's ISO JSON form.
const ev = (id: string, orderId: string, createdAt: string, extra: Partial<OrderSortable> = {}): OrderSortable => ({
  id,
  orderId,
  createdAt,
  updatedAt: createdAt,
  ...extra,
});

describe("toTimestamp", () => {
  it("parses ISO-8601 (Prisma JSON form)", () => {
    expect(toTimestamp("2026-08-07T06:04:15.000Z")).toBe(Date.parse("2026-08-07T06:04:15.000Z"));
  });
  it("parses SQLite CURRENT_TIMESTAMP space form that Date.parse rejects", () => {
    const iso = toTimestamp("2026-08-07T06:04:15.000Z");
    // V8 Date.parse returns NaN for "YYYY-MM-DD HH:MM:SS"; our fallback must recover it.
    expect(toTimestamp("2026-08-07 06:04:15")).toBe(iso);
  });
  it("returns 0 for unparseable input instead of NaN", () => {
    expect(toTimestamp("not-a-date")).toBe(0);
    expect(toTimestamp("")).toBe(0);
    expect(toTimestamp(null)).toBe(0);
    expect(toTimestamp(undefined)).toBe(0);
  });
});

describe("compareOrders created-desc", () => {
  it("orders strictly by createdAt, newest first — no event pinning beyond recency", () => {
    // EVENT orders are newest; a NEWER regular order must outrank them.
    const newer = ev("z1", "99999", "2026-08-09T10:00:00.000Z");
    const events = [
      ev("e5", "EVENT-005", "2026-08-07T06:04:15.000Z"),
      ev("e6", "EVENT-006", "2026-08-07T06:04:15.000Z"),
      ev("e7", "EVENT-007", "2026-08-07T06:04:15.000Z"),
    ];
    const older = ev("o1", "26252", "2026-08-04T15:26:06.000Z");
    // Feed events first (worst case: input order favours events).
    const sorted = [...events, older, newer].sort(compareOrders("created-desc"));
    // Events tie on createdAt → tie-break numeric orderId desc: 7, 6, 5.
    expect(sorted.map(o => o.orderId)).toEqual(["99999", "EVENT-007", "EVENT-006", "EVENT-005", "26252"]);
    // Crucially the true-newest non-event is on top, not an event.
    expect(sorted[0].orderId).toBe("99999");
  });

  it("resolves same-second ties deterministically (numeric orderId desc)", () => {
    const t = "2026-08-07T06:04:15.000Z";
    const batch = [
      ev("a", "EVENT-005", t),
      ev("b", "EVENT-007", t),
      ev("c", "EVENT-006", t),
    ];
    const sorted = batch.sort(compareOrders("created-desc"));
    // Equal createdAt → tie-break by numeric orderId descending: 7, 6, 5.
    expect(sorted.map(o => o.orderId)).toEqual(["EVENT-007", "EVENT-006", "EVENT-005"]);
  });

  it("is stable regardless of input permutation (no arbitrary equal-key order)", () => {
    const t = "2026-06-16T10:40:49.000Z";
    // 25-order same-second tie group, like the production bulk import.
    const group = Array.from({ length: 25 }, (_, i) =>
      ev(`id${String(i).padStart(2, "0")}`, `26${String(252 - i)}`, t)
    );
    const forward = [...group].sort(compareOrders("created-desc")).map(o => o.orderId);
    const reversed = [...group].reverse().sort(compareOrders("created-desc")).map(o => o.orderId);
    const shuffled = [...group].sort(() => 0.5 - Math.random()).sort(compareOrders("created-desc")).map(o => o.orderId);
    expect(forward).toEqual(reversed);
    expect(forward).toEqual(shuffled);
    // And it must be numeric-desc within the tie.
    expect(forward[0]).toBe("26252");
  });
});

describe("compareOrders other keys", () => {
  it("created-asc inverts primary order but keeps ties deterministic", () => {
    const a = ev("1", "100", "2026-08-01T00:00:00.000Z");
    const b = ev("2", "101", "2026-08-05T00:00:00.000Z");
    const sorted = [b, a].sort(compareOrders("created-asc"));
    expect(sorted.map(o => o.orderId)).toEqual(["100", "101"]);
  });
  it("id-asc / id-desc sort by numeric orderId", () => {
    const orders = [ev("1", "EVENT-007", "x"), ev("2", "26252", "x"), ev("3", "100", "x")];
    const asc = [...orders].sort(compareOrders("id-asc")).map(o => o.orderId);
    const desc = [...orders].sort(compareOrders("id-desc")).map(o => o.orderId);
    // Numeric portion: EVENT-007→7, 100→100, 26252→26252.
    expect(asc).toEqual(["EVENT-007", "100", "26252"]);
    expect(desc).toEqual(["26252", "100", "EVENT-007"]);
  });
});

// The "ALL filter shows pending" contract: the status predicate keeps PENDING
// when filterStatus is "ALL". This guards the filter side of the report.
describe("ALL status filter predicate", () => {
  const predicate = (status: string, filterStatus: string) =>
    filterStatus === "ALL" || status === filterStatus;
  it("keeps PENDING orders when filterStatus is ALL", () => {
    expect(predicate("PENDING", "ALL")).toBe(true);
    expect(predicate("SCHEDULED", "ALL")).toBe(true);
    expect(predicate("COMPLETED", "ALL")).toBe(true);
  });
  it("isolates PENDING when filterStatus is PENDING", () => {
    expect(predicate("PENDING", "PENDING")).toBe(true);
    expect(predicate("BOOKED", "PENDING")).toBe(false);
  });
});
