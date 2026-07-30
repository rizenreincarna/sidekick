import { describe, expect, it } from "vitest";
import {
  assertMarieMayMutate,
  canTransitionOrderStatus,
  canonicalDriverCompletion,
  canonicalDriverCompletionUndo,
  canonicalNormalTransition,
  isOperatorOwnedOrder,
  normalizeOrderStatus,
  ORDER_STATUS_LABELS,
} from "./order-status";

describe("operator-owned order protection", () => {
  it("treats CONTACTED and BOOKED as operator-owned", () => {
    expect(isOperatorOwnedOrder("CONTACTED")).toBe(true);
    expect(isOperatorOwnedOrder("BOOKED")).toBe(true);
    expect(isOperatorOwnedOrder("CONFIRMED")).toBe(true);
    expect(isOperatorOwnedOrder("booked")).toBe(true);
  });

  it("leaves other statuses mutable by automation", () => {
    expect(isOperatorOwnedOrder("PENDING")).toBe(false);
    expect(isOperatorOwnedOrder("SCHEDULED")).toBe(false);
    expect(isOperatorOwnedOrder("COMPLETED")).toBe(false);
    expect(isOperatorOwnedOrder("CANCELED")).toBe(false);
    expect(isOperatorOwnedOrder("unknown")).toBe(false);
  });

  it("throws when automation attempts to mutate an operator-owned order", () => {
    expect(() => assertMarieMayMutate("CONTACTED")).toThrow("must not mutate operator-owned order");
    expect(() => assertMarieMayMutate("BOOKED")).toThrow("must not mutate operator-owned order");
    expect(() => assertMarieMayMutate("PENDING")).not.toThrow();
    expect(() => assertMarieMayMutate("SCHEDULED")).not.toThrow();
  });
});

describe("order statuses", () => {
  it("normalizes the legacy boundary", () => {
    expect(normalizeOrderStatus("CONFIRMED")).toBe("CONTACTED");
    expect(normalizeOrderStatus("contacted")).toBe("CONTACTED");
    expect(normalizeOrderStatus("unknown")).toBeNull();
    expect(ORDER_STATUS_LABELS.CONTACTED).toBe("Contacted");
  });

  it("allows only strict normal transitions", () => {
    expect(canTransitionOrderStatus("PENDING", "SCHEDULED")).toBe(true);
    expect(canTransitionOrderStatus("SCHEDULED", "CONTACTED")).toBe(true);
    expect(canTransitionOrderStatus("CONTACTED", "BOOKED")).toBe(true);
    expect(canTransitionOrderStatus("BOOKED", "COMPLETED")).toBe(true);
    expect(canTransitionOrderStatus("PENDING", "BOOKED")).toBe(false);
    expect(canTransitionOrderStatus("COMPLETED", "CONTACTED")).toBe(false);
  });

  it("normalizes writes and enforces named driver exceptions", () => {
    expect(canonicalNormalTransition("SCHEDULED", "CONFIRMED")).toBe("CONTACTED");
    expect(() => canonicalNormalTransition("PENDING", "BOOKED")).toThrow("Invalid normal order transition");
    expect(canonicalDriverCompletion("SCHEDULED")).toBe("COMPLETED");
    expect(canonicalDriverCompletion("CONTACTED")).toBe("COMPLETED");
    expect(canonicalDriverCompletion("BOOKED")).toBe("COMPLETED");
    expect(canonicalDriverCompletion("COMPLETED")).toBe("COMPLETED"); // idempotent
    expect(() => canonicalDriverCompletion("PENDING")).toThrow("Invalid driver completion");
    expect(canonicalDriverCompletionUndo("COMPLETED")).toBe("BOOKED");
    expect(() => canonicalDriverCompletionUndo("BOOKED")).toThrow("Invalid driver completion undo");
  });
});
