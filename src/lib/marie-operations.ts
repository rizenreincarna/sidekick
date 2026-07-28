import { canTransitionOrderStatus, isOperatorOwnedOrder, normalizeOrderStatus, type OrderStatus } from "./order-status";
import { evaluateSchedulerFeasibility, type RouteCoordinate } from "./scheduler-policy";

export const MARIE_TIME_ZONE = "Asia/Kuala_Lumpur";
export const NORMAL_CAPACITY = 20;
export const MAX_CAPACITY = 25;

export type MarieMode = "DRY_RUN" | "PILOT" | "LIVE";
export type InboundIntent =
  | "ACCEPT"
  | "CANCEL_REQUEST"
  | "CANCEL_CONFIRMATION"
  | "DATE_REQUEST"
  | "OPT_OUT"
  | "HIGH_RISK"
  | "AMBIGUOUS";

export interface MariePolicyConfig {
  enabled: boolean;
  mode: MarieMode;
  contactStartHour: number;
  contactEndHour: number;
  normalCapacity: number;
  maxCapacity: number;
  pilotAllowlist: string[];
}

export interface PlanningOrder {
  id: string;
  orderId: string;
  status: string;
  phone: string;
  points: number;
  zone: number;
  isOffice: boolean;
  isEvent: boolean;
  isErthbox: boolean;
  addressVerified: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface UserPlanningOrder extends PlanningOrder {
  userId: string;
}

export interface UserExistingLoad extends ExistingLoad {
  userId: string;
}

export interface UserBlockedDate {
  userId: string;
  date: string;
  kind: CalendarBlockKind;
}

export type CalendarBlockKind = "HOLIDAY" | "OFF_DAY" | "EVENT";

export interface CalendarBlock {
  date: string;
  kind: CalendarBlockKind;
}

export interface ExistingLoad {
  date: string;
  points: number;
  zone?: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DryRunPlan {
  redactedOrder: string;
  heroBucket?: string;
  action: "PROPOSE_SCHEDULE" | "HOLD";
  proposedDate: string | null;
  points: number;
  capacity: "NORMAL" | "EXCEPTION" | null;
  requiresCapacityApproval: boolean;
  reason: string;
  expectedTransition: "PENDING -> SCHEDULED" | null;
  /** Exact outbound wording, rendered with PII placeholders (spec: redact PII in report). */
  draftMessage: string | null;
}

export function normalizeMalaysianPhone(value: string): string | null {
  let digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `60${digits.slice(1)}`;
  if (!digits.startsWith("60") || digits.length < 10 || digits.length > 12) return null;
  return `+${digits}`;
}

function mytParts(now: Date): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARIE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "00";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

export function isWithinMytContactWindow(now: Date, startHour = 8, endHour = 20): boolean {
  const { hour, minute } = mytParts(now);
  return hour >= startHour && (hour < endHour || (hour === endHour && minute === 0));
}

export function checkModeEligibility(
  config: Pick<MariePolicyConfig, "enabled" | "mode" | "pilotAllowlist">,
  phone: string,
): { eligible: boolean; reason: string } {
  if (!config.enabled) return { eligible: false, reason: "Automation is disabled" };
  if (config.mode === "DRY_RUN") return { eligible: false, reason: "DRY_RUN never executes actions" };
  if (config.mode === "PILOT") {
    const normalized = normalizeMalaysianPhone(phone);
    const allowlist = new Set(config.pilotAllowlist.map(normalizeMalaysianPhone).filter(Boolean));
    if (!normalized || !allowlist.has(normalized)) return { eligible: false, reason: "Not in pilot allowlist" };
  }
  return { eligible: true, reason: "Eligible" };
}

export function validateLifecycleTransition(from: unknown, to: unknown): boolean {
  return canTransitionOrderStatus(from, to);
}

export function assessCapacity(currentPoints: number, addedPoints: number): "NORMAL" | "EXCEPTION" | "REJECT" {
  const total = currentPoints + addedPoints;
  if (total <= NORMAL_CAPACITY) return "NORMAL";
  if (total <= MAX_CAPACITY) return "EXCEPTION";
  return "REJECT";
}

/**
 * Initial contact draft. Transparently identifies Marie as an assistant (spec: no
 * pretending to be human), states the proposed date with weekday and the address for
 * confirmation, and never invents an exact arrival time. Uses no internal terminology
 * such as points, zones, capacity, or routing.
 */
export const INITIAL_CONTACT_TEMPLATE =
  "Hi {customerName}, this is Marie, an assistant for the ERTH pickup service. "
  + "For your order {orderRef}, we would like to schedule your pickup on {weekday}, {proposedDate}. "
  + "Pickup address: {address}. "
  + "Could you confirm this date and address, or let us know a day that suits you better? Thank you.";

/**
 * Renders the exact outbound wording for operator review with PII replaced by
 * placeholders. The planner never receives names or addresses, so no customer data can
 * leak into the dry-run report.
 */
export function renderRedactedContactDraft(proposedDate: string): string {
  return renderInitialContactDraft({
    customerName: "[CUSTOMER_NAME]",
    orderRef: "[ORDER_REF]",
    proposedDate,
    address: "[PICKUP_ADDRESS]",
  });
}

export function mytWeekday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

export function renderInitialContactDraft(values: {
  customerName: string;
  orderRef: string;
  proposedDate: string;
  address: string;
}): string {
  return renderMessageTemplate(INITIAL_CONTACT_TEMPLATE, {
    ...values,
    weekday: mytWeekday(values.proposedDate),
  });
}

export function renderMessageTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_match, key: string) => {
    if (!(key in values)) throw new Error(`Missing template value: ${key}`);
    return values[key];
  });
}

export function classifyInboundIntent(body: string, awaitingCancellationConfirmation = false): InboundIntent {
  const text = body.trim().toLowerCase();
  if (!text) return "AMBIGUOUS";
  if (/\b(stop|unsubscribe|do not contact|don't contact|jangan hubungi)\b/.test(text)) return "OPT_OUT";
  if (/\b(lawyer|legal|police|injur(?:y|ed)|unsafe|privacy|data leak|compensation|refund|damage|media)\b/.test(text)) return "HIGH_RISK";
  if (awaitingCancellationConfirmation && /^(yes|confirm|confirmed|ya|betul|proceed)([.! ]*)$/.test(text)) return "CANCEL_CONFIRMATION";
  if (/\b(cancel|cancel order|batalkan|tak jadi)\b/.test(text)) return "CANCEL_REQUEST";
  if (/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[/-]\d{1,2})\b/.test(text)) return "DATE_REQUEST";
  if (/^(yes|ok|okay|confirm|confirmed|can|boleh|setuju|agreed|sounds good)([.! ]*)$/.test(text)) return "ACCEPT";
  return "AMBIGUOUS";
}

function addUtcDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function generateDryRunPlans(
  orders: PlanningOrder[],
  existingLoads: ExistingLoad[],
  blockedDates: CalendarBlock[],
  now = new Date(),
): DryRunPlan[] {
  const loads = new Map<string, number>();
  const routeCoords = new Map<string, RouteCoordinate[]>();
  const routeZones = new Map<string, Record<number, number>>();
  for (const load of existingLoads) {
    loads.set(load.date, (loads.get(load.date) ?? 0) + load.points);
    if (load.latitude !== null && load.latitude !== undefined && load.longitude !== null && load.longitude !== undefined) {
      routeCoords.set(load.date, [...(routeCoords.get(load.date) ?? []), { latitude: load.latitude, longitude: load.longitude }]);
    }
    if (load.zone !== undefined) {
      const zones = routeZones.get(load.date) ?? {};
      zones[load.zone] = (zones[load.zone] ?? 0) + 1;
      routeZones.set(load.date, zones);
    }
  }
  const hardBlocked = new Set(blockedDates.filter(block => block.kind === "OFF_DAY" || block.kind === "EVENT").map(block => block.date));
  const holidays = new Set(blockedDates.filter(block => block.kind === "HOLIDAY").map(block => block.date));
  const start = mytParts(now).date;

  return orders.map((order, index) => {
    const redactedOrder = `order_${String(index + 1).padStart(3, "0")}`;
    const status = normalizeOrderStatus(order.status);
    const invalidReason = isOperatorOwnedOrder(order.status) ? "Operator-owned order: already contacted personally, Marie must not rearrange"
      : status !== "PENDING" ? "Order is not PENDING"
      : order.isEvent || order.isErthbox ? "Event and ERTHBOX orders require verified policy"
      : !normalizeMalaysianPhone(order.phone) ? "Invalid Malaysian phone"
      : !order.addressVerified ? "Address is not verified"
      : order.latitude === null || order.longitude === null ? "Coordinates are missing"
      : order.points < 1 || order.points > MAX_CAPACITY ? "Invalid or excessive order load"
      : null;
    if (invalidReason) {
      return { redactedOrder, action: "HOLD", proposedDate: null, points: order.points, capacity: null, requiresCapacityApproval: false, reason: invalidReason, expectedTransition: null, draftMessage: null };
    }

    let exceptionCandidate: { date: string; existingCoords: RouteCoordinate[]; current: number } | null = null;
    // Match scheduler.ts: offsets 0..20 are considered, with 0 and 1 skipped.
    for (let offset = 2; offset < 21; offset++) {
      const date = addUtcDays(start, offset);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (hardBlocked.has(date)) continue;
      if (order.isOffice && (holidays.has(date) || weekday === 0 || weekday === 6)) continue;
      const current = loads.get(date) ?? 0;
      const capacity = assessCapacity(current, order.points);
      if (capacity === "REJECT") continue;
      const candidate: RouteCoordinate = { latitude: order.latitude!, longitude: order.longitude! };
      const existingCoords = routeCoords.get(date) ?? [];
      const routeFeasible = evaluateSchedulerFeasibility({ date, totalPoints: current, zones: routeZones.get(date) ?? {}, coords: existingCoords }, { ...candidate, zone: order.zone, points: order.points }, MAX_CAPACITY);
      if (!routeFeasible.feasible) continue;
      if (capacity === "EXCEPTION") {
        exceptionCandidate ??= { date, existingCoords, current };
        continue;
      }
      loads.set(date, current + order.points);
      routeCoords.set(date, [...existingCoords, candidate]);
      return {
        redactedOrder,
        action: "PROPOSE_SCHEDULE",
        proposedDate: date,
        points: order.points,
        capacity: "NORMAL" as const,
        requiresCapacityApproval: false,
        reason: "Meets foundational dry-run checks",
        expectedTransition: "PENDING -> SCHEDULED",
        draftMessage: renderRedactedContactDraft(date),
      };
    }
    if (exceptionCandidate) {
      const candidate: RouteCoordinate = { latitude: order.latitude!, longitude: order.longitude! };
      loads.set(exceptionCandidate.date, exceptionCandidate.current + order.points);
      routeCoords.set(exceptionCandidate.date, [...exceptionCandidate.existingCoords, candidate]);
      return { redactedOrder, action: "PROPOSE_SCHEDULE", proposedDate: exceptionCandidate.date, points: order.points, capacity: "EXCEPTION", requiresCapacityApproval: true, reason: "Requires explicit operator approval: 21-25 points is outside normal scheduler feasibility", expectedTransition: "PENDING -> SCHEDULED", draftMessage: renderRedactedContactDraft(exceptionCandidate.date) };
    }
    return { redactedOrder, action: "HOLD", proposedDate: null, points: order.points, capacity: null, requiresCapacityApproval: false, reason: "No feasible capacity/route cluster in the scheduler's 21-day horizon", expectedTransition: null, draftMessage: null };
  });
}

export function generateUserIsolatedDryRunPlans(
  orders: UserPlanningOrder[],
  existingLoads: UserExistingLoad[],
  blockedDates: UserBlockedDate[],
  now = new Date(),
): DryRunPlan[] {
  const userIds = [...new Set(orders.map(order => order.userId))].sort();
  let orderSequence = 0;
  return userIds.flatMap((userId, userIndex) => {
    const plans = generateDryRunPlans(
      orders.filter(order => order.userId === userId),
      existingLoads.filter(load => load.userId === userId),
      blockedDates.filter(blocked => blocked.userId === userId).map(({ date, kind }) => ({ date, kind })),
      now,
    );
    const heroBucket = `hero_${String(userIndex + 1).padStart(3, "0")}`;
    return plans.map(plan => ({
      ...plan,
      heroBucket,
      redactedOrder: `order_${String(++orderSequence).padStart(3, "0")}`,
    }));
  });
}

export function assertCanonicalStatus(value: unknown): OrderStatus {
  const status = normalizeOrderStatus(value);
  if (!status) throw new Error("Invalid order status");
  return status;
}
