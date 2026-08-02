export const ORDER_STATUSES = [
  "PENDING",
  "SCHEDULED",
  "CONTACTED",
  "BOOKED",
  "COMPLETED",
  "CANCELED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  SCHEDULED: "Scheduled",
  CONTACTED: "Contacted",
  BOOKED: "Booked",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

export const NORMAL_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["SCHEDULED", "CANCELED"],
  SCHEDULED: ["CONTACTED", "CANCELED"],
  CONTACTED: ["BOOKED", "CANCELED"],
  BOOKED: ["COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};

/**
 * Human/operator-permitted transitions (forward + corrective backward moves).
 * When a customer cancels last-minute or changes plans, the driver/operator
 * (Tars) needs to revert a BOOKED order back to CONTACTED or SCHEDULED, and
 * a CONTACTED order back to SCHEDULED. Autonomous automation stays locked to
 * NORMAL_ORDER_TRANSITIONS (see MARIE_OPERATOR_OWNED_STATUSES) so the machine
 * never yanks operator-owned orders around, but the human can.
 *
 * NOTE: HARDBLOCK efficient rule — NEVER resurrect COMPLETED or CANCELED.
 * Once an order is terminal, it stays terminal for everyone.
 */
export const OPERATOR_ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["SCHEDULED", "CONTACTED", "BOOKED", "CANCELED"],
  SCHEDULED: ["PENDING", "CONTACTED", "BOOKED", "CANCELED"],
  CONTACTED: ["PENDING", "SCHEDULED", "BOOKED", "CANCELED"],
  BOOKED: ["PENDING", "SCHEDULED", "CONTACTED", "COMPLETED", "CANCELED"],
  COMPLETED: [],
  CANCELED: [],
};

/**
 * Operator-owned statuses. Tars contacts these customers personally, so Marie must
 * never rearrange, reschedule, or re-contact them. They are still READ for capacity
 * and route math, but are never mutation targets for autonomous automation.
 */
export const MARIE_OPERATOR_OWNED_STATUSES = ["CONTACTED", "BOOKED"] as const;

/** True when autonomous automation is forbidden from mutating this order. */
export function isOperatorOwnedOrder(value: unknown): boolean {
  const status = normalizeOrderStatus(value);
  return status !== null && (MARIE_OPERATOR_OWNED_STATUSES as readonly string[]).includes(status);
}

/** Throws when autonomous automation attempts to mutate an operator-owned order. */
export function assertMarieMayMutate(value: unknown): void {
  if (isOperatorOwnedOrder(value)) {
    throw new Error(
      `Marie must not mutate operator-owned order in status ${normalizeOrderStatus(value)}`,
    );
  }
}

export function normalizeOrderStatus(value: unknown): OrderStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase() === "CONFIRMED"
    ? "CONTACTED"
    : value.trim().toUpperCase();
  return ORDER_STATUSES.includes(normalized as OrderStatus) ? normalized as OrderStatus : null;
}

export function canTransitionOrderStatus(from: unknown, to: unknown): boolean {
  const current = normalizeOrderStatus(from);
  const next = normalizeOrderStatus(to);
  return current !== null && next !== null && NORMAL_ORDER_TRANSITIONS[current].includes(next);
}

/**
 * Operator (human driver/Support/Admin) transition check. Allows corrective
 * backward moves that autonomous automation is forbidden from making
 * (e.g. BOOKED -> CONTACTED when a customer pulls out last-minute).
 */
export function canOperatorTransitionOrderStatus(from: unknown, to: unknown): boolean {
  const current = normalizeOrderStatus(from);
  const next = normalizeOrderStatus(to);
  return current !== null && next !== null && OPERATOR_ORDER_TRANSITIONS[current].includes(next);
}

/** Operator-facing write that allows backward corrective transitions. */
export function canonicalOperatorTransition(from: unknown, to: unknown): OrderStatus {
  const next = canonicalStatusForWrite(to);
  if (!canOperatorTransitionOrderStatus(from, next)) {
    throw new Error(`Invalid operator transition from ${String(from)} to ${next}`);
  }
  return next;
}

export function canonicalStatusForWrite(value: unknown): OrderStatus {
  const status = normalizeOrderStatus(value);
  if (!status) throw new Error("Invalid order status");
  return status;
}

export function canonicalNormalTransition(from: unknown, to: unknown): OrderStatus {
  const next = canonicalStatusForWrite(to);
  if (!canTransitionOrderStatus(from, next)) {
    throw new Error(`Invalid normal order transition from ${String(from)} to ${next}`);
  }
  return next;
}

/** Driver tracking is the only operational path allowed to complete before BOOKED.
 *  If the order is already COMPLETED, treat as idempotent success (no-op). */
export function canonicalDriverCompletion(from: unknown): "COMPLETED" {
  const current = normalizeOrderStatus(from);
  if (!current || !["SCHEDULED", "CONTACTED", "BOOKED", "COMPLETED"].includes(current)) {
    throw new Error(`Invalid driver completion from ${String(from)}`);
  }
  return "COMPLETED";
}

/** Driver tracking undo restores a completed pickup to the operational BOOKED state. */
export function canonicalDriverCompletionUndo(from: unknown): "BOOKED" {
  if (normalizeOrderStatus(from) !== "COMPLETED") {
    throw new Error(`Invalid driver completion undo from ${String(from)}`);
  }
  return "BOOKED";
}
