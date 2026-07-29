import { db } from "./db";
import { detectZone } from "./zones";
import { quickGeocode } from "./geocode";
import { FIXED_LOCATIONS } from "./route-model";
import {
  centroid,
  evaluateSchedulerFeasibility,
  hasCoordinates,
  haversineDistance,
  removeOneCoordinate,
  scoreSchedulerDay,
  SCHEDULER_MAX_POINTS,
} from "./scheduler-policy";
import { MARIE_TIME_ZONE, MAX_CAPACITY } from "./marie-operations";
import { isOperatorOwnedOrder } from "./order-status";

/**
 * Read-only scheduler extraction for Marie.
 *
 * This wraps the existing scheduler's algorithm (scheduler.ts) in a non-mutating
 * function that returns proposed schedules. Marie calls this to decide which date
 * to assign to a pending order, then persists the result herself in a transaction
 * with status guards — never calling the mutating `autoSchedule` directly.
 *
 * The algorithm is identical to scheduler.ts: greedy min-route-cost with 110km
 * circuit + 12km cluster radius, zone-by-zone, closest-to-HOME first.
 */

export interface ScheduleProposal {
  orderId: string;
  internalId: string;
  date: string;
  points: number;
  zone: number;
  dayTotalAfter: number;
}

export interface ScheduleProposalResult {
  proposed: ScheduleProposal[];
  unscheduled: { orderId: string; reason: string }[];
  dayStates: Record<string, { date: string; totalPoints: number; orderCount: number }>;
}

interface OrderCoord {
  id: string;
  orderId: string;
  zone: number;
  city: string;
  address: string;
  points: number;
  isOffice: boolean;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
}

interface DayState {
  date: string;
  totalPoints: number;
  zones: Record<number, number>;
  coords: { latitude: number; longitude: number }[];
  center: { latitude: number; longitude: number } | null;
}

function mytDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: MARIE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function addMytDays(now: Date, days: number): string {
  const { year, month, day } = mytDateParts(now);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function isWeekendDate(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Proposes a schedule for all PENDING orders of a user without mutating the database.
 * Reads existing SCHEDULED/CONTACTED/BOOKED orders for capacity and route context.
 * Operator-owned orders (CONTACTED/BOOKED) are read but never proposed for rescheduling.
 */
export async function proposeSchedule(userId: string, now = new Date()): Promise<ScheduleProposalResult> {
  const pendingOrders = await db.order.findMany({
    where: { status: "PENDING", userId, isErthbox: false },
    orderBy: { createdAt: "asc" },
  });

  if (pendingOrders.length === 0) {
    return { proposed: [], unscheduled: [], dayStates: {} };
  }

  // Filter out operator-owned orders (should not exist as PENDING, but guard anyway)
  const schedulable = pendingOrders.filter(order => !isOperatorOwnedOrder(order.status));
  const operatorOwned = pendingOrders.filter(order => isOperatorOwnedOrder(order.status));
  const unscheduled = operatorOwned.map(order => ({
    orderId: order.orderId,
    reason: "Operator-owned order: already contacted personally",
  }));

  if (schedulable.length === 0) {
    return { proposed: [], unscheduled, dayStates: {} };
  }

  // Re-detect zone for orders sitting in a disabled zone
  const disabledZonesSetting = await db.setting.findUnique({
    where: { userId_key: { userId, key: "disabledZones" } },
  });
  let disabledZones: number[] = [];
  try {
    const parsed: unknown = disabledZonesSetting?.value ? JSON.parse(disabledZonesSetting.value) : [];
    if (Array.isArray(parsed)) disabledZones = parsed.filter((zone): zone is number => Number.isInteger(zone));
  } catch {
    disabledZones = [];
  }

  const workingOrders = schedulable.map(order => {
    let zone = order.zone;
    if (disabledZones.includes(zone)) {
      const newZone = detectZone(order.city, disabledZones);
      if (newZone !== zone) zone = newZone;
    }
    return { ...order, zone };
  });

  const holidays = await db.holiday.findMany({ where: { userId } });
  const holidayDates = new Set(holidays.map(h => h.date));

  const offDays = await db.offDay.findMany({ where: { userId } });
  const offDayDates = new Set(offDays.map(d => d.date));

  const eventOrders = await db.order.findMany({
    where: { isEvent: true, scheduledDate: { not: null }, userId },
    select: { scheduledDate: true },
  });
  const eventDates = new Set(eventOrders.map(e => e.scheduledDate).filter((d): d is string => d !== null));

  const startDate = addMytDays(now, 0);
  const lookAhead = 21;
  const endDate = addMytDays(now, lookAhead);

  const existingOrders = await db.order.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONTACTED", "BOOKED"] },
      scheduledDate: { gte: startDate, lte: endDate },
      userId,
    },
  });

  const workingDays: string[] = [];
  for (let i = 0; i < lookAhead; i++) {
    const dateStr = addMytDays(now, i);
    if (i < 2) continue;
    if (!offDayDates.has(dateStr) && !eventDates.has(dateStr)) {
      workingDays.push(dateStr);
    }
  }

  if (workingDays.length === 0) {
    return {
      proposed: [],
      unscheduled: [...unscheduled, ...workingOrders.map(o => ({ orderId: o.orderId, reason: "No working days available in the next 21 days" }))],
      dayStates: {},
    };
  }

  // Initialise day states from existing scheduled orders
  const dayMap: Record<string, DayState> = {};
  for (const date of workingDays) {
    dayMap[date] = { date, totalPoints: 0, zones: {}, coords: [], center: null };
  }
  for (const order of existingOrders) {
    if (!order.scheduledDate || !dayMap[order.scheduledDate]) continue;
    const day = dayMap[order.scheduledDate];
    day.totalPoints += order.points;
    day.zones[order.zone] = (day.zones[order.zone] || 0) + 1;
    if (hasCoordinates(order)) {
      day.coords.push({ latitude: order.latitude, longitude: order.longitude });
    }
  }
  for (const date of workingDays) {
    dayMap[date].center = centroid(dayMap[date].coords);
  }

  // Build pending order working set
  const queue: OrderCoord[] = workingOrders.map(o => ({
    id: o.id,
    orderId: o.orderId,
    zone: o.zone,
    city: o.city,
    address: o.address,
    points: o.points,
    isOffice: o.isOffice,
    latitude: o.latitude,
    longitude: o.longitude,
    createdAt: o.createdAt,
  }));

  // Enrich missing coordinates via geocoding
  const missingGeo = queue.filter(o => o.latitude === null || o.longitude === null);
  for (const order of missingGeo) {
    try {
      const coords = await quickGeocode(order.address, order.city);
      if (coords) {
        order.latitude = coords[0];
        order.longitude = coords[1];
      }
    } catch {
      // leave null — zone-only scoring will handle it
    }
  }

  // Group by zone, biggest zone first
  const ordersByZone: Record<number, OrderCoord[]> = {};
  for (const order of queue) {
    if (!ordersByZone[order.zone]) ordersByZone[order.zone] = [];
    ordersByZone[order.zone].push(order);
  }
  const zonesInOrder = Object.entries(ordersByZone)
    .filter(([, orders]) => orders.length > 0)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([z]) => parseInt(z));

  const proposed: ScheduleProposal[] = [];

  // Dedupe: orders at identical coordinates must share a day
  const coordKeyToOrderIds = new Map<string, string[]>();
  for (const order of queue) {
    if (hasCoordinates(order)) {
      const key = `${order.latitude.toFixed(5)}|${order.longitude.toFixed(5)}`;
      const list = coordKeyToOrderIds.get(key) || [];
      list.push(order.id);
      coordKeyToOrderIds.set(key, list);
    }
  }
  const linkedSameDay = new Map<string, Set<string>>();
  for (const [, ids] of coordKeyToOrderIds) {
    if (ids.length > 1) {
      for (const id of ids) {
        const others = new Set<string>(ids.filter(x => x !== id));
        linkedSameDay.set(id, others);
      }
    }
  }

  const assignedDate = new Map<string, string>();

  const passesHardConstraints = (day: DayState, order: OrderCoord): boolean =>
    evaluateSchedulerFeasibility(day, order, MAX_CAPACITY).feasible;

  const scoreDay = (day: DayState, order: OrderCoord): number =>
    scoreSchedulerDay(day, order, workingDays.indexOf(day.date));

  // Phase A: greedy min-route-cost assignment
  for (const zone of zonesInOrder) {
    const HOME = FIXED_LOCATIONS.HOME;
    const zoneOrders = ordersByZone[zone].slice().sort((a, b) => {
      const distA = hasCoordinates(a) ? haversineDistance(HOME, a) : 999;
      const distB = hasCoordinates(b) ? haversineDistance(HOME, b) : 999;
      return distA - distB;
    });

    for (const order of zoneOrders) {
      const links = linkedSameDay.get(order.id);
      let forcedDate: string | null = null;
      if (links) {
        for (const otherId of links) {
          if (assignedDate.has(otherId)) {
            forcedDate = assignedDate.get(otherId)!;
            break;
          }
        }
      }

      const candidates = workingDays
        .map(date => ({ date, day: dayMap[date] }))
        .filter(({ date, day }) => {
          if (!passesHardConstraints(day, order)) return false;
          if (order.isOffice && holidayDates.has(date)) return false;
          if (order.isOffice && isWeekendDate(date)) return false;
          return true;
        });

      if (candidates.length === 0) {
        unscheduled.push({ orderId: order.orderId, reason: "No day available: capacity full, would exceed 110km daily route limit, or order is too far from existing cluster" });
        continue;
      }

      let chosen: { date: string; day: DayState };
      const forcedCandidate = forcedDate ? candidates.find(c => c.date === forcedDate) : undefined;
      if (forcedCandidate) {
        chosen = forcedCandidate;
      } else {
        candidates.sort((a, b) => scoreDay(a.day, order) - scoreDay(b.day, order));
        chosen = candidates[0];
      }

      chosen.day.totalPoints += order.points;
      chosen.day.zones[zone] = (chosen.day.zones[zone] || 0) + 1;
      if (hasCoordinates(order)) {
        chosen.day.coords.push({ latitude: order.latitude, longitude: order.longitude });
        chosen.day.center = centroid(chosen.day.coords);
      }
      assignedDate.set(order.id, chosen.date);
      proposed.push({
        orderId: order.orderId,
        internalId: order.id,
        date: chosen.date,
        points: order.points,
        zone,
        dayTotalAfter: chosen.day.totalPoints,
      });
    }
  }

  // Phase B: merge stranded single-order days
  for (const date of workingDays) {
    const day = dayMap[date];
    const placedHere = proposed.filter(item => item.date === date);
    if (placedHere.length !== 1 || day.totalPoints <= 1) continue;

    const stranded = placedHere[0];
    const strandedOrder = queue.find(o => o.id === stranded.internalId);
    if (!strandedOrder) continue;

    let bestAlt: { date: string; day: DayState; score: number } | null = null;
    for (const altDate of workingDays) {
      if (altDate === date) continue;
      const altDay = dayMap[altDate];
      if (altDay.totalPoints === 0) continue;
      if (!passesHardConstraints(altDay, strandedOrder)) continue;
      if (strandedOrder.isOffice && holidayDates.has(altDate)) continue;
      if (strandedOrder.isOffice && isWeekendDate(altDate)) continue;

      const costHere = hasCoordinates(strandedOrder) && day.center
        ? haversineDistance(strandedOrder, day.center)
        : 0;
      const costThere = hasCoordinates(strandedOrder) && altDay.center
        ? haversineDistance(strandedOrder, altDay.center)
        : (altDay.zones[strandedOrder.zone] ? 8 : 20);
      const altFill = altDay.totalPoints / MAX_CAPACITY;
      const score = costThere - costHere - altFill * 5;
      if (score < 0 && (!bestAlt || score < bestAlt.score)) {
        bestAlt = { date: altDate, day: altDay, score };
      }
    }

    if (bestAlt) {
      day.totalPoints -= strandedOrder.points;
      day.zones[strandedOrder.zone] = (day.zones[strandedOrder.zone] || 0) - 1;
      if (day.zones[strandedOrder.zone] <= 0) delete day.zones[strandedOrder.zone];
      if (hasCoordinates(strandedOrder)) day.coords = removeOneCoordinate(day.coords, strandedOrder);
      day.center = centroid(day.coords);

      bestAlt.day.totalPoints += strandedOrder.points;
      bestAlt.day.zones[strandedOrder.zone] = (bestAlt.day.zones[strandedOrder.zone] || 0) + 1;
      if (hasCoordinates(strandedOrder)) {
        bestAlt.day.coords.push({ latitude: strandedOrder.latitude, longitude: strandedOrder.longitude });
        bestAlt.day.center = centroid(bestAlt.day.coords);
      }
      assignedDate.set(strandedOrder.id, bestAlt.date);
      stranded.date = bestAlt.date;
      stranded.dayTotalAfter = bestAlt.day.totalPoints;
    }
  }

  const dayStates: Record<string, { date: string; totalPoints: number; orderCount: number }> = {};
  for (const date of workingDays) {
    if (dayMap[date].totalPoints > 0) {
      dayStates[date] = {
        date,
        totalPoints: dayMap[date].totalPoints,
        orderCount: dayMap[date].coords.length,
      };
    }
  }

  return { proposed, unscheduled, dayStates };
}

/**
 * Persists a single schedule proposal in a transaction with status guards.
 * Only transitions PENDING → SCHEDULED. Never touches operator-owned orders.
 */
export async function persistScheduleProposal(input: {
  internalId: string;
  date: string;
  points: number;
}): Promise<{ persisted: boolean; reason: string }> {
  const result = await db.$transaction(async tx => {
    const order = await tx.order.findUnique({
      where: { id: input.internalId },
      select: { id: true, status: true, scheduledDate: true },
    });

    if (!order) return { persisted: false, reason: "Order not found" };
    if (isOperatorOwnedOrder(order.status)) {
      return { persisted: false, reason: `Operator-owned order in status ${order.status}` };
    }
    if (order.status !== "PENDING") {
      return { persisted: false, reason: `Order is ${order.status}, not PENDING` };
    }

    const updated = await tx.order.updateMany({
      where: { id: input.internalId, status: "PENDING" },
      data: { status: "SCHEDULED", scheduledDate: input.date },
    });

    if (updated.count !== 1) {
      return { persisted: false, reason: "Race condition: order changed during persistence" };
    }

    await tx.automationEvent.create({
      data: {
        orderId: input.internalId,
        eventType: "AUTO_SCHEDULED",
        actor: "MARIE",
        idempotencyKey: `auto-schedule:${input.internalId}`,
        beforeState: "PENDING",
        afterState: "SCHEDULED",
        reasonCode: "SCHEDULER_PROPOSAL",
        metadata: JSON.stringify({ scheduledDate: input.date, points: input.points }),
      },
    });

    return { persisted: true, reason: `Scheduled for ${input.date}` };
  });

  return result;
}
