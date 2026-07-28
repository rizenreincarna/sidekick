import { db } from "@/lib/db";
import { detectZone } from "./zones";
import { quickGeocode } from "./geocode";
import { FIXED_LOCATIONS } from "./route-model";
import { centroid, evaluateSchedulerFeasibility, hasCoordinates, haversineDistance, removeOneCoordinate, scoreSchedulerDay, SCHEDULER_MAX_POINTS } from "./scheduler-policy";
import { MARIE_TIME_ZONE } from "./marie-operations";

// Haversine distance between two lat/lng points (returns km)

interface ScheduleResult {
  scheduled: { orderId: string; date: string; points: number; zone: number }[];
  unscheduled: { orderId: string; reason: string }[];
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

interface DayState {
  date: string;
  totalPoints: number;
  zones: Record<number, number>;
  coords: { latitude: number; longitude: number }[];
  center: { latitude: number; longitude: number } | null;
}

/**
 * Auto-scheduler with tight geographic clustering + route distance threshold.
 *
 * Design goals (reduce movement / fuel / toll cost):
 *  1. Geographic clustering — each day covers a tight area (max 12km radius from
 *     cluster centroid). Orders that would spread the day too far are pushed to
 *     a new day, even if they're in the same zone.
 *  2. Route-distance threshold (110km circuit) — hard cap on total daily driving
 *     distance (HOME -> stops -> DROP_A -> HOME). Prevents zigzag routes across
 *     the Klang Valley.
 *  3. Closest-first ordering — within each zone, orders closest to HOME are
 *     placed first, forming tight cores. Distant orders naturally get their own days.
 *  4. Same-location consolidation — orders at identical coordinates share a day.
 *  5. Office-rule + holiday/weekend constraints preserved.
 *
 * Two-phase algorithm:
 *   Phase A: greedy min-route-cost assignment with 110km circuit + 12km cluster radius.
 *   Phase B: merge stranded single-order days into nearby fuller days when
 *            capacity + route distance + cluster radius allow.
 */
export async function autoSchedule(userId: string): Promise<ScheduleResult> {
  const pendingOrders = await db.order.findMany({
    where: { status: "PENDING", userId, isErthbox: false },
    orderBy: { createdAt: "asc" },
  });

  if (pendingOrders.length === 0) {
    return { scheduled: [], unscheduled: [] };
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

  const zoneUpdateOps: Promise<unknown>[] = [];
  for (const order of pendingOrders) {
    if (disabledZones.includes(order.zone)) {
      const newZone = detectZone(order.city, disabledZones);
      if (newZone !== order.zone) {
        zoneUpdateOps.push(
          db.order.update({ where: { id: order.id }, data: { zone: newZone } })
        );
        (order as { zone: number }).zone = newZone;
      }
    }
  }
  await Promise.all(zoneUpdateOps);

  const holidays = await db.holiday.findMany({ where: { userId } });
  const holidayDates = new Set(holidays.map(h => h.date));

  const offDays = await db.offDay.findMany({ where: { userId } });
  const offDayDates = new Set(offDays.map(d => d.date));

  const eventOrders = await db.order.findMany({
    where: { isEvent: true, scheduledDate: { not: null }, userId },
    select: { scheduledDate: true },
  });
  const eventDates = new Set(eventOrders.map(e => e.scheduledDate).filter((d): d is string => d !== null));

  const today = new Date();
  const startDate = addMytDays(today, 0);
  const lookAhead = 21;
  const endDate = addMytDays(today, lookAhead);

  const existingOrders = await db.order.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONTACTED", "BOOKED"] },
      scheduledDate: { gte: startDate, lte: endDate },
      userId,
    },
  });

  // Working days: skip today, tomorrow, OFF days, event days
  const workingDays: string[] = [];
  for (let i = 0; i < lookAhead; i++) {
    const dateStr = addMytDays(today, i);
    if (i < 2) continue;
    if (!offDayDates.has(dateStr) && !eventDates.has(dateStr)) {
      workingDays.push(dateStr);
    }
  }

  if (workingDays.length === 0) {
    return {
      scheduled: [],
      unscheduled: pendingOrders.map(o => ({ orderId: o.orderId, reason: "No working days available in the next 21 days" })),
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

  // Build the pending order working set (with coord enrichment)
  const queue: OrderCoord[] = pendingOrders.map(o => ({
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

  // Enrich missing coordinates via geocoding so geographic clustering works.
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

  // Group by zone, biggest zone first (concentrate the dominant region early)
  const ordersByZone: Record<number, OrderCoord[]> = {};
  for (const order of queue) {
    if (!ordersByZone[order.zone]) ordersByZone[order.zone] = [];
    ordersByZone[order.zone].push(order);
  }
  const zonesInOrder = Object.entries(ordersByZone)
    .filter(([, orders]) => orders.length > 0)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([z]) => parseInt(z));

  const scheduled: { orderId: string; date: string; points: number; zone: number }[] = [];
  const unscheduled: { orderId: string; reason: string }[] = [];

  // Dedupe key: orders at identical coordinates must share a day (consolidate trips)
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

  /**
   * Check whether adding an order to a day violates any hard geographic constraint.
   * Returns false if the order should be rejected from this day.
   */
  const passesHardConstraints = (day: DayState, order: OrderCoord): boolean =>
    evaluateSchedulerFeasibility(day, order, SCHEDULER_MAX_POINTS).feasible;

  /**
   * Score a candidate day for an order. Lower is better (less travel cost).
   *
   * Route distance is the dominant factor (scaled 0-25). Other factors are kept
   * small so geography wins over density-filling.
   */
  const scoreDay = (day: DayState, order: OrderCoord): number => scoreSchedulerDay(day, order, workingDays.indexOf(day.date));

  // Phase A: greedy min-route-cost assignment, zone-by-zone, closest-to-HOME first
  for (const zone of zonesInOrder) {
    // Sort closest to HOME first — forms tight geographic cores, distant orders
    // naturally get pushed to new days by the circuit/cluster constraints.
    const HOME = FIXED_LOCATIONS.HOME;
    const zoneOrders = ordersByZone[zone].slice().sort((a, b) => {
      const distA = hasCoordinates(a) ? haversineDistance(HOME, a) : 999;
      const distB = hasCoordinates(b) ? haversineDistance(HOME, b) : 999;
      return distA - distB;
    });

    for (const order of zoneOrders) {
      // If this order is linked to others already assigned, force the same day
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
      const forcedCandidate = forcedDate ? candidates.find(candidate => candidate.date === forcedDate) : undefined;
      if (forcedCandidate) {
        chosen = forcedCandidate;
      } else {
        candidates.sort((a, b) => scoreDay(a.day, order) - scoreDay(b.day, order));
        chosen = candidates[0];
      }

      // Assign
      chosen.day.totalPoints += order.points;
      chosen.day.zones[zone] = (chosen.day.zones[zone] || 0) + 1;
      if (hasCoordinates(order)) {
        chosen.day.coords.push({ latitude: order.latitude, longitude: order.longitude });
        chosen.day.center = centroid(chosen.day.coords);
      }
      assignedDate.set(order.id, chosen.date);
      scheduled.push({ orderId: order.id, date: chosen.date, points: order.points, zone });
    }
  }

  // Phase B: merge stranded single-order days into nearby fuller days
  for (const date of workingDays) {
    const day = dayMap[date];
    const placedHere = scheduled.filter(item => item.date === date);
    if (placedHere.length !== 1 || day.totalPoints <= 1) continue;

    const stranded = placedHere[0];
    const strandedOrder = queue.find(o => o.id === stranded.orderId);
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
      const altFill = altDay.totalPoints / SCHEDULER_MAX_POINTS;
      const score = costThere - costHere - altFill * 5;
      if (score < 0 && (!bestAlt || score < bestAlt.score)) {
        bestAlt = { date: altDate, day: altDay, score };
      }
    }

    if (bestAlt) {
      day.totalPoints -= strandedOrder.points;
      day.zones[stranded.zone] = (day.zones[stranded.zone] || 0) - 1;
      if (day.zones[stranded.zone] <= 0) delete day.zones[stranded.zone];
      if (hasCoordinates(strandedOrder)) day.coords = removeOneCoordinate(day.coords, strandedOrder);
      day.center = centroid(day.coords);

      bestAlt.day.totalPoints += strandedOrder.points;
      bestAlt.day.zones[stranded.zone] = (bestAlt.day.zones[stranded.zone] || 0) + 1;
      if (hasCoordinates(strandedOrder)) {
        bestAlt.day.coords.push({ latitude: strandedOrder.latitude, longitude: strandedOrder.longitude });
        bestAlt.day.center = centroid(bestAlt.day.coords);
      }
      assignedDate.set(strandedOrder.id, bestAlt.date);
      const idx = scheduled.findIndex(s => s.orderId === stranded.orderId);
      if (idx >= 0) scheduled[idx].date = bestAlt.date;
    }
  }

  const persisted = [] as typeof scheduled;
  for (const item of scheduled) {
    const result = await db.order.updateMany({ where: { id: item.orderId, status: "PENDING" }, data: { status: "SCHEDULED", scheduledDate: item.date } });
    if (result.count === 1) persisted.push(item);
    else {
      const order = queue.find(candidate => candidate.id === item.orderId);
      unscheduled.push({ orderId: order?.orderId ?? item.orderId, reason: "Order changed while scheduling; no update applied" });
    }
  }

  const publicScheduled = persisted.map(item => {
    const order = queue.find(candidate => candidate.id === item.orderId);
    return { ...item, orderId: order?.orderId ?? item.orderId };
  });
  return { scheduled: publicScheduled, unscheduled };
}
