import { db } from "@/lib/db";
import { MAX_DAILY_POINTS, ZONES, detectZone } from "./zones";
import { format, addDays, isWeekend } from "date-fns";
import { quickGeocode } from "./geocode";
import { FIXED_LOCATIONS } from "./route-model";

// Haversine distance between two lat/lng points (returns km)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Daily route distance threshold (km) — max circuit HOME -> stops -> DROP -> HOME
const MAX_DAILY_ROUTE_KM = 110;
// Haversine underestimates road distance; multiply by this factor for a realistic estimate
const ROAD_FACTOR = 1.25;
// Max distance (km) any single stop can be from the day's centroid.
// Prevents adding a distant order to an otherwise tight cluster.
const MAX_CLUSTER_RADIUS_KM = 12;

/**
 * Estimate total route distance for a set of stops using nearest-neighbor ordering.
 * Route: HOME -> stops (nearest-neighbor chain) -> DROP_A -> HOME
 * Returns road-distance estimate (haversine * ROAD_FACTOR).
 */
function estimateDayRouteDistance(coords: { latitude: number; longitude: number }[]): number {
  if (coords.length === 0) return 0;
  const H = FIXED_LOCATIONS.HOME;
  const D = FIXED_LOCATIONS.DROP_A;
  const visited = new Set<number>();
  let total = 0;
  let curLat = H.latitude;
  let curLng = H.longitude;
  for (let step = 0; step < coords.length; step++) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < coords.length; j++) {
      if (visited.has(j)) continue;
      const d = haversineDistance(curLat, curLng, coords[j].latitude, coords[j].longitude);
      if (d < bestDist) { bestDist = d; bestIdx = j; }
    }
    if (bestIdx < 0) break;
    visited.add(bestIdx);
    total += bestDist;
    curLat = coords[bestIdx].latitude;
    curLng = coords[bestIdx].longitude;
  }
  // Last stop -> DROP_A -> HOME
  total += haversineDistance(curLat, curLng, D.latitude, D.longitude);
  total += haversineDistance(D.latitude, D.longitude, H.latitude, H.longitude);
  return total * ROAD_FACTOR;
}

// Mean centroid of a set of coordinate points
function centroid(points: { latitude: number; longitude: number }[]): { latitude: number; longitude: number } | null {
  if (points.length === 0) return null;
  let sumLat = 0, sumLng = 0;
  for (const p of points) { sumLat += p.latitude; sumLng += p.longitude; }
  return { latitude: sumLat / points.length, longitude: sumLng / points.length };
}

interface ScheduleResult {
  scheduled: { orderId: string; date: string; points: number; zone: number }[];
  unscheduled: { orderId: string; reason: string }[];
}

interface OrderCoord {
  id: string;
  orderId: string;
  zone: number;
  city: string;
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
  const disabledZones: number[] = disabledZonesSetting?.value
    ? JSON.parse(disabledZonesSetting.value)
    : [];

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
  const startDate = format(today, "yyyy-MM-dd");
  const lookAhead = 21;
  const endDate = format(addDays(today, lookAhead), "yyyy-MM-dd");

  const existingOrders = await db.order.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED", "BOOKED"] },
      scheduledDate: { gte: startDate, lte: endDate },
      userId,
    },
  });

  // Working days: skip today, tomorrow, OFF days, event days
  const workingDays: string[] = [];
  for (let i = 0; i < lookAhead; i++) {
    const day = addDays(today, i);
    const dateStr = format(day, "yyyy-MM-dd");
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
    if (order.latitude && order.longitude) {
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
      const coords = await quickGeocode("", order.city);
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
    if (order.latitude && order.longitude) {
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
  const passesHardConstraints = (day: DayState, order: OrderCoord): boolean => {
    if (order.points > MAX_DAILY_POINTS - day.totalPoints) return false;
    if (!order.latitude || !order.longitude) {
      // No coordinates — can't compute route distance or cluster radius.
      // Enforce strict zone isolation: only allow this order on days that
      // have NO orders from other zones (or are empty).
      // This prevents Klang+Ampang style mismatches when geocoding is missing.
      const dayZones = Object.keys(day.zones).map(Number).filter(z => day.zones[z] > 0);
      if (dayZones.length > 0 && !dayZones.every(z => z === order.zone)) return false;
      return true;
    }

    // Route circuit threshold
    const testCoords = [...day.coords, { latitude: order.latitude, longitude: order.longitude }];
    if (estimateDayRouteDistance(testCoords) > MAX_DAILY_ROUTE_KM) return false;

    // Cluster radius — order must be within MAX_CLUSTER_RADIUS_KM of day centroid
    if (day.center) {
      const distFromCenter = haversineDistance(order.latitude, order.longitude, day.center.latitude, day.center.longitude);
      if (distFromCenter > MAX_CLUSTER_RADIUS_KM) return false;
    }

    return true;
  };

  /**
   * Score a candidate day for an order. Lower is better (less travel cost).
   *
   * Route distance is the dominant factor (scaled 0-25). Other factors are kept
   * small so geography wins over density-filling.
   */
  const scoreDay = (day: DayState, order: OrderCoord): number => {
    const sameZone = (day.zones[order.zone] || 0) > 0;
    const zonePenalty = sameZone ? 0 : 10;

    const fillRatio = day.totalPoints / MAX_DAILY_POINTS;
    const densityBonus = -fillRatio * 2;

    const emptyPenalty = day.totalPoints === 0 ? 5 : 0;

    const dateIdx = workingDays.indexOf(day.date);
    const dateBonus = dateIdx * 0.05;

    // Route distance cost — dominant factor
    let geoCost = 0;
    if (order.latitude && order.longitude) {
      const testCoords = [...day.coords, { latitude: order.latitude, longitude: order.longitude }];
      const estRoute = estimateDayRouteDistance(testCoords);
      // Scale: 0km -> 0, 110km -> 25 (dominates all other factors at threshold)
      geoCost = (estRoute / MAX_DAILY_ROUTE_KM) * 25;
    } else {
      // No coordinates — rely heavily on zone match since we can't
      // verify geographic proximity. Orders without coords should strongly
      // prefer same-zone days.
      geoCost = sameZone ? 3 : 25;
    }

    return geoCost + zonePenalty + densityBonus + emptyPenalty + dateBonus;
  };

  // Phase A: greedy min-route-cost assignment, zone-by-zone, closest-to-HOME first
  for (const zone of zonesInOrder) {
    // Sort closest to HOME first — forms tight geographic cores, distant orders
    // naturally get pushed to new days by the circuit/cluster constraints.
    const HOME = FIXED_LOCATIONS.HOME;
    const zoneOrders = ordersByZone[zone].slice().sort((a, b) => {
      const distA = a.latitude && a.longitude ? haversineDistance(HOME.latitude, HOME.longitude, a.latitude, a.longitude) : 999;
      const distB = b.latitude && b.longitude ? haversineDistance(HOME.latitude, HOME.longitude, b.latitude, b.longitude) : 999;
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
          if (order.isOffice && isWeekend(parseISO(date))) return false;
          return true;
        });

      if (candidates.length === 0) {
        unscheduled.push({ orderId: order.orderId, reason: "No day available: capacity full, would exceed 110km daily route limit, or order is too far from existing cluster" });
        continue;
      }

      let chosen: { date: string; day: DayState };
      if (forcedDate && dayMap[forcedDate] && passesHardConstraints(dayMap[forcedDate], order)) {
        chosen = { date: forcedDate, day: dayMap[forcedDate] };
      } else {
        candidates.sort((a, b) => scoreDay(a.day, order) - scoreDay(b.day, order));
        chosen = candidates[0];
      }

      // Assign
      chosen.day.totalPoints += order.points;
      chosen.day.zones[zone] = (chosen.day.zones[zone] || 0) + 1;
      if (order.latitude && order.longitude) {
        chosen.day.coords.push({ latitude: order.latitude, longitude: order.longitude });
        chosen.day.center = centroid(chosen.day.coords);
      }
      assignedDate.set(order.id, chosen.date);
      scheduled.push({ orderId: order.id, date: chosen.date, points: order.points, zone });
    }
  }

  // Phase B: merge stranded single-order days into nearby fuller days
  const scheduledByDate: Record<string, typeof scheduled> = {};
  for (const s of scheduled) {
    if (!scheduledByDate[s.date]) scheduledByDate[s.date] = [];
    scheduledByDate[s.date].push(s);
  }

  for (const date of workingDays) {
    const day = dayMap[date];
    const items = scheduledByDate[date] || [];
    const placedHere = items.filter(s => !existingOrders.some(eo => eo.id === s.orderId));
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
      if (strandedOrder.isOffice && isWeekend(parseISO(altDate))) continue;

      const costHere = strandedOrder.latitude && strandedOrder.longitude && day.center
        ? haversineDistance(strandedOrder.latitude, strandedOrder.longitude, day.center.latitude, day.center.longitude)
        : 0;
      const costThere = strandedOrder.latitude && strandedOrder.longitude && altDay.center
        ? haversineDistance(strandedOrder.latitude, strandedOrder.longitude, altDay.center.latitude, altDay.center.longitude)
        : (altDay.zones[strandedOrder.zone] ? 8 : 20);
      const altFill = altDay.totalPoints / MAX_DAILY_POINTS;
      const score = costThere - costHere - altFill * 5;
      if (score < 0 && (!bestAlt || score < bestAlt.score)) {
        bestAlt = { date: altDate, day: altDay, score };
      }
    }

    if (bestAlt) {
      day.totalPoints -= strandedOrder.points;
      day.zones[stranded.zone] = (day.zones[stranded.zone] || 0) - 1;
      if (day.zones[stranded.zone] <= 0) delete day.zones[stranded.zone];
      day.coords = day.coords.filter(c =>
        !(strandedOrder.latitude && strandedOrder.longitude &&
          c.latitude === strandedOrder.latitude && c.longitude === strandedOrder.longitude)
      );
      day.center = centroid(day.coords);

      bestAlt.day.totalPoints += strandedOrder.points;
      bestAlt.day.zones[stranded.zone] = (bestAlt.day.zones[stranded.zone] || 0) + 1;
      if (strandedOrder.latitude && strandedOrder.longitude) {
        bestAlt.day.coords.push({ latitude: strandedOrder.latitude, longitude: strandedOrder.longitude });
        bestAlt.day.center = centroid(bestAlt.day.coords);
      }
      assignedDate.set(strandedOrder.id, bestAlt.date);
      const idx = scheduled.findIndex(s => s.orderId === stranded.orderId);
      if (idx >= 0) scheduled[idx].date = bestAlt.date;
    }
  }

  await db.$transaction(
    scheduled.map(item =>
      db.order.update({
        where: { id: item.orderId },
        data: { status: "SCHEDULED", scheduledDate: item.date },
      })
    )
  );

  return { scheduled, unscheduled };
}

function parseISO(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}
