// VROOM Route Optimization Client
// Docs: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
//
// ============================================================================
// CAPACITY-RESET STRATEGY (documented per PI_CODER_PROMPT.md requirement)
// ============================================================================
// The vehicle capacity is 20 points per load (Isuzu D-Max max load). DROP_A (ERTH HQ, Cyberjaya) and
// DROP_B (Section 51A, PJ) are unloading waypoints where accumulated e-waste is
// emptied, resetting the load. VROOM has no native "unload" primitive, so we
// use the **Guard-rail + per-load multi-vehicle** strategy (prompt Option 3 +
// Option 1 combined):
//
//   1. Each order is assigned a drop-off (DROP_A or DROP_B) via assignDropOff.
//   2. Orders are grouped by drop-off, then chunked into "loads" of <=20 points
//      each (sorted by zone for geographic coherence).
//   3. Each load becomes ONE VROOM vehicle: start=HOME, end=HOME, capacity=20.
//      VROOM optimizes all vehicles in a single problem simultaneously.
//   4. The drop-off waypoint is NOT a VROOM job (it has no pickup amount and
//      would be visited anywhere). Instead, after VROOM returns the optimized
//      pickup order, the drop-off is INSERTED before the final HOME return in
//      post-processing (`stitchDropOffs`), and the extra travel time is added
//      from the distance matrix / haversine fallback.
//
// This keeps a single VROOM call, respects the 20-pt capacity per vehicle, and
// produces a stitched daily plan with drop-offs at the end of each load.
//
// ============================================================================
// ROUTING STRATEGY: Option A (VROOM + OSRM via Docker) with a nearest-neighbour
// in-process fallback. If the VROOM server (VROOM_API_URL) is unreachable, we
// fall back to `solveNearestNeighbor` which optimizes with haversine distance
// + VEHICLE.avgSpeed so the feature ALWAYS returns a usable route.
// ============================================================================

import { FIXED_LOCATIONS, VEHICLE, assignDropOff, haversineKm, sizeToLoad } from "./route-model";

const VROOM_API_URL = process.env.VROOM_API_URL || "http://127.0.0.1:3000";
const VROOM_API_KEY = process.env.VROOM_API_KEY || ""; // only for cloud API
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VroomVehicle {
  id: number;
  start: [number, number]; // [lon, lat]
  end: [number, number];
  capacity: number[];
  time_window: [number, number];
  description?: string;
}

export interface VroomJob {
  id: number;
  service: number; // seconds
  delivery: number[];
  location: [number, number]; // [lon, lat]
  time_windows?: [[number, number]];
}

export interface VroomProblem {
  vehicles: VroomVehicle[];
  jobs: VroomJob[];
  matrices?: { car: { durations: number[][]; distances?: number[][] } };
  options?: { g?: boolean };
}

export interface VroomStep {
  type: "start" | "job" | "end" | "break";
  location: [number, number];
  arrival: number;
  service: number;
  id?: number;
  load?: number[];
  waiting_time?: number;
}

export interface VroomRoute {
  vehicle: number;
  duration: number;
  distance: number;
  service: number;
  waiting_time: number;
  steps: VroomStep[];
}

export interface VroomSolution {
  code: number;
  error?: string;
  summary: {
    cost: number;
    routes: number;
    unassigned: number;
    duration: number;
    distance: number;
    service: number;
  };
  routes: VroomRoute[];
  unassigned: { id: number; reason: string }[];
}

// ---------------------------------------------------------------------------
// ID-MAPPING LAYER (required — VROOM needs int IDs, Order.id is a cuid string)
// ---------------------------------------------------------------------------

export interface IdMapping {
  intId: number;
  orderId: string; // human-readable order ID (e.g. ORD-...)
  orderDbId: string; // Prisma row id (cuid)
}

export function buildIdMappings(orders: { id: string; orderId: string }[]): IdMapping[] {
  return orders.map((o, i) => ({ intId: i + 1, orderId: o.orderId, orderDbId: o.id }));
}

export function resolveStepToOrder(step: VroomStep, mapping: IdMapping[]): IdMapping | null {
  if (step.type !== "job" || step.id === undefined) return null;
  return mapping.find((m) => m.intId === step.id) || null;
}

export function resolveIntId(intId: number, mapping: IdMapping[]): IdMapping | null {
  return mapping.find((m) => m.intId === intId) || null;
}

// ---------------------------------------------------------------------------
// TIMEZONE HELPER — ensures Malaysia time windows are correct (Asia/Kuala_Lumpur, UTC+8)
// ---------------------------------------------------------------------------

export function buildTimeWindow(date: string): [number, number] {
  // date = "2026-07-20" -> 10:00 AM to 4:00 PM Malaysia time (UTC+8)
  const startStr = `${date}T${String(VEHICLE.startHour).padStart(2, "0")}:00:00+08:00`;
  const endStr = `${date}T${String(VEHICLE.endHour).padStart(2, "0")}:00:00+08:00`;
  return [
    Math.floor(new Date(startStr).getTime() / 1000),
    Math.floor(new Date(endStr).getTime() / 1000),
  ];
}

/** Convert a Unix timestamp (seconds) to a Malaysia-time HH:MM string. */
export function fmtMalaysiaTime(unixSeconds: number): string {
  const ms = unixSeconds * 1000;
  // Asia/Kuala_Lumpur is UTC+8 with no DST — fixed +08:00 offset is always correct.
  const d = new Date(ms + 8 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Order input shape (from Prisma)
// ---------------------------------------------------------------------------

export interface VroomOrderInput {
  id: string; // Prisma cuid
  orderId: string;
  customerName: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  points: number;
  zone: number;
  size: string;
  phone: string;
  notes: string | null;
  isOffice: boolean;
}

export interface VroomStopDetail {
  intId: number;
  orderId: string;
  orderDbId: string;
  customerName: string;
  address: string;
  city: string;
  phone: string;
  points: number;
  zone: number;
  size: string;
  notes: string | null;
  isOffice: boolean;
  latitude: number;
  longitude: number;
  dropOff: "DROP_A" | "DROP_B";
  arrival: number; // unix seconds (VROOM-computed ETA)
  departure: number; // unix seconds (arrival + service)
  plannedArrival?: number; // manual override (unix seconds)
  serviceSeconds: number;
  loadAfter: number; // cumulative points after this stop
}

export interface DropAlternative {
  dropOff: "DROP_A" | "DROP_B";
  distanceMeters: number;
  durationSeconds: number;
  dropOffArrival: number;
  homeArrival: number;
}

export interface VroomLoadPlan {
  vehicleId: number;
  dropOff: "DROP_A" | "DROP_B";
  stops: VroomStopDetail[]; // pickups in order
  dropOffArrival: number;
  homeArrival: number;
  durationSeconds: number;
  distanceMeters: number;
  loadPoints: number;
  /** Distance/duration if this load ended at the other drop point. */
  alternative: DropAlternative;
}

export interface OptimizedRouteResult {
  date: string;
  idMapping: IdMapping[];
  loads: VroomLoadPlan[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalStops: number;
  totalPoints: number;
  capacity: number;
  unassigned: { orderId: string; reason: string }[];
  /** Total distance if every load used the non-chosen drop point. */
  totalAlternativeDistanceMeters: number;
  /** Total duration if every load used the non-chosen drop point. */
  totalAlternativeDurationSeconds: number;
  source: "vroom" | "nearest-neighbor";
  summary: {
    cost: number;
    routes: number;
    unassigned: number;
    duration: number;
    distance: number;
  };
}

// ---------------------------------------------------------------------------
// Load splitting (guard-rail + drop-off grouping)
// ---------------------------------------------------------------------------

interface OrderWithLoad extends VroomOrderInput {
  load: number; // points for this order
  dropOff: "DROP_A" | "DROP_B";
}

function prepareOrders(orders: VroomOrderInput[]): OrderWithLoad[] {
  return orders
    .filter((o) => o.latitude != null && o.longitude != null)
    .map((o) => ({
      ...o,
      load: o.points || sizeToLoad(o.size),
      dropOff: assignDropOff(o.latitude!, o.longitude!),
    }));
}

/** Split orders into loads of <=capacity points, grouped by drop-off & zone. */
function splitIntoLoads(orders: OrderWithLoad[], capacity: number): OrderWithLoad[][] {
  // Group by drop-off first
  const byDrop: Record<string, OrderWithLoad[]> = { DROP_A: [], DROP_B: [] };
  for (const o of orders) byDrop[o.dropOff].push(o);
  // Sort each group by zone then city for geographic coherence
  for (const k of Object.keys(byDrop)) {
    byDrop[k].sort((a, b) => a.zone - b.zone || a.city.localeCompare(b.city));
  }
  const loads: OrderWithLoad[][] = [];
  for (const drop of ["DROP_A", "DROP_B"]) {
    let current: OrderWithLoad[] = [];
    let currentPts = 0;
    for (const o of byDrop[drop]) {
      // If a single order exceeds capacity, it gets its own load (will be flagged)
      if (o.load > capacity) {
        if (current.length) {
          loads.push(current);
          current = [];
          currentPts = 0;
        }
        loads.push([o]);
        continue;
      }
      if (currentPts + o.load > capacity && current.length) {
        loads.push(current);
        current = [];
        currentPts = 0;
      }
      current.push(o);
      currentPts += o.load;
    }
    if (current.length) loads.push(current);
  }
  return loads;
}

// ---------------------------------------------------------------------------
// Build the VROOM problem (vehicles + jobs) from orders
// ---------------------------------------------------------------------------

export interface LoadPartition {
  loads: OrderWithLoad[][]; // orders grouped per vehicle
  vehicles: VroomVehicle[];
  jobs: VroomJob[]; // all jobs (for VROOM, which assigns across vehicles)
  vehicleJobs: VroomJob[][]; // jobs per vehicle (for the NN fallback)
}

export function buildLoadPartition(
  orders: VroomOrderInput[],
  date: string,
  idMapping: IdMapping[],
  homeOverride?: { latitude: number; longitude: number }
): LoadPartition {
  const prepared = prepareOrders(orders);
  const [twStart, twEnd] = buildTimeWindow(date);
  const home: [number, number] = homeOverride
    ? [homeOverride.longitude, homeOverride.latitude]
    : [FIXED_LOCATIONS.HOME.longitude, FIXED_LOCATIONS.HOME.latitude];
  const serviceSec = VEHICLE.serviceTimePickup * 60;

  const loads = splitIntoLoads(prepared, VEHICLE.capacity);

  const vehicles: VroomVehicle[] = loads.map((load, i) => ({
    id: i + 1,
    start: home,
    end: home,
    capacity: [VEHICLE.capacity],
    time_window: [twStart, twEnd],
    description: `Load ${i + 1} -> ${load[0]?.dropOff ?? "DROP_A"} (${load.reduce(
      (s, o) => s + o.load,
      0
    )} pts)`,
  }));

  // Build jobs. Each job id maps via idMapping (1-based, in original order).
  const intIdByDbId = new Map(idMapping.map((m) => [m.orderDbId, m.intId]));
  const jobFor = (o: OrderWithLoad): VroomJob => ({
    id: intIdByDbId.get(o.id)!,
    service: serviceSec,
    delivery: [o.load],
    location: [o.longitude!, o.latitude!],
    time_windows: [[twStart, twEnd]],
  });
  const jobs: VroomJob[] = prepared.map(jobFor);
  // Per-vehicle job assignment (the NN fallback solves each vehicle with ONLY
  // its own jobs so orders are never duplicated across vehicles).
  const vehicleJobs: VroomJob[][] = loads.map((load) => load.map(jobFor));

  return { loads, vehicles, jobs, vehicleJobs };
}

export function buildVroomProblemFromOrders(
  orders: VroomOrderInput[],
  date: string,
  idMapping: IdMapping[]
): VroomProblem {
  const { vehicles, jobs } = buildLoadPartition(orders, date, idMapping);
  return { vehicles, jobs, options: { g: true } };
}

// ---------------------------------------------------------------------------
// Google Maps Distance Matrix (optional, used for accurate travel times in the
// nearest-neighbour fallback and drop-off stitching). Falls back to haversine.
// ---------------------------------------------------------------------------

interface Matrix {
  durations: number[][]; // seconds
  distances: number[][]; // meters
}

function haversineMatrix(coords: [number, number][]): Matrix {
  const n = coords.length;
  const durations: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const distances: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const mps = (VEHICLE.avgSpeed * 1000) / 3600; // m/s
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const [lon1, lat1] = coords[i];
      const [lon2, lat2] = coords[j];
      const km = haversineKm(lat1, lon1, lat2, lon2);
      distances[i][j] = Math.round(km * 1000);
      durations[i][j] = Math.round((km * 1000) / mps);
    }
  }
  return { durations, distances };
}

async function googleDistanceMatrix(
  coords: [number, number][] // [lon, lat]
): Promise<Matrix | null> {
  if (!GOOGLE_MAPS_API_KEY || coords.length < 2) return null;
  // Google expects lat,lng strings. Batch origins/destinations (max 100 elements per request).
  const n = coords.length;
  const points = coords.map(([lon, lat]) => `${lat},${lon}`);
  const durations: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const distances: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const MAX = 100;
  try {
    for (let oi = 0; oi < n; oi += Math.floor(MAX / n > 0 ? MAX / n : 1)) {
      // Simpler: chunk destinations to keep <=100 elements per call
    }
    // Chunk by destinations (keep all origins, chunk dests)
    for (let di = 0; di < n; di += MAX) {
      const destSlice = points.slice(di, di + MAX);
      const origins = points;
      const params = new URLSearchParams({
        origins: origins.join("|"),
        destinations: destSlice.join("|"),
        key: GOOGLE_MAPS_API_KEY,
        units: "metric",
      });
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== "OK") return null;
      for (let i = 0; i < origins.length; i++) {
        const row = data.rows[i];
        if (!row) continue;
        for (let j = 0; j < destSlice.length; j++) {
          const el = row.elements[j];
          if (el && el.status === "OK") {
            durations[i][di + j] = el.duration?.value ?? 0;
            distances[i][di + j] = el.distance?.value ?? 0;
          }
        }
      }
    }
    return { durations, distances };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Solve via VROOM server (POST to VROOM_API_URL)
// ---------------------------------------------------------------------------

export async function solveVroomProblem(problem: VroomProblem): Promise<VroomSolution | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (VROOM_API_KEY) headers["Authorization"] = `Bearer ${VROOM_API_KEY}`;
  try {
    const res = await fetch(`${VROOM_API_URL}/`, {
      method: "POST",
      headers,
      body: JSON.stringify(problem),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const sol = (await res.json()) as VroomSolution;
    if (sol.code !== 0 && sol.code !== undefined && sol.code !== 0) return null;
    return sol;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Nearest-neighbour fallback solver (in-process, no external deps)
// Respects vehicle capacity & time windows; uses haversine + avgSpeed.
// ---------------------------------------------------------------------------

export function solveNearestNeighbor(
  problem: VroomProblem,
  coordsByIntId: Map<number, [number, number]>,
  vehicleJobs?: VroomJob[][]
): VroomSolution {
  const [twStart, twEnd] = problem.vehicles[0]?.time_window ?? [0, 0];
  const serviceSec = VEHICLE.serviceTimePickup * 60;
  const mps = (VEHICLE.avgSpeed * 1000) / 3600;

  const routes: VroomRoute[] = [];
  let unassigned: { id: number; reason: string }[] = [];
  const assignedJobIds = new Set<number>();

  for (let vi = 0; vi < problem.vehicles.length; vi++) {
    const v = problem.vehicles[vi];
    const capacity = v.capacity[0] || VEHICLE.capacity;
    // Use the per-vehicle job partition if provided (so orders are never
    // duplicated across vehicles); otherwise fall back to all jobs.
    let remaining = [...(vehicleJobs?.[vi] ?? problem.jobs)];
    let curLoc: [number, number] = v.start;
    let curTime = twStart;
    let curLoad = 0;
    const steps: VroomStep[] = [
      { type: "start", location: v.start, arrival: twStart, service: 0, load: [0] },
    ];
    let routeDuration = 0;
    let routeDistance = 0;

    // Determine which drop-off locations are relevant for this vehicle
    const dropOffs = [
      { name: "DROP_A", loc: [FIXED_LOCATIONS.DROP_A.longitude, FIXED_LOCATIONS.DROP_A.latitude] as [number, number] },
      { name: "DROP_B", loc: [FIXED_LOCATIONS.DROP_B.longitude, FIXED_LOCATIONS.DROP_B.latitude] as [number, number] },
    ];

    while (remaining.length) {
      // nearest feasible job
      let bestIdx = -1;
      let bestCost = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const j = remaining[i];
        const loc = coordsByIntId.get(j.id) ?? j.location;
        const km = haversineKm(curLoc[1], curLoc[0], loc[1], loc[0]);
        const travel = Math.round((km * 1000) / mps);
        const arr = curTime + travel;
        const afterService = arr + (j.service || serviceSec);
        const afterLoad = curLoad + (j.delivery[0] || 0);
        if (afterLoad > capacity) continue; // capacity
        if (afterService > twEnd) continue; // time window
        if (km < bestCost) {
          bestCost = km;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) {
        // Can't fit any more jobs — if load > 0, route to nearest drop-off,
        // unload, then continue picking up remaining orders (multi-trip).
        if (curLoad > 0 && remaining.length > 0) {
          // Find nearest drop-off
          let bestDrop = dropOffs[0];
          let bestDropKm = Infinity;
          for (const d of dropOffs) {
            const km = haversineKm(curLoc[1], curLoc[0], d.loc[1], d.loc[0]);
            if (km < bestDropKm) { bestDropKm = km; bestDrop = d; }
          }
          const dropSvc = VEHICLE.serviceTimeDrop * 60;
          const dropTravel = Math.round((bestDropKm * 1000) / mps);
          const dropArr = curTime + dropTravel;
          if (dropArr + dropSvc > twEnd) {
            // No time for a drop-off trip — mark remaining as unassigned
            for (const j of remaining) {
              unassigned.push({ id: j.id, reason: "time-window" });
              assignedJobIds.add(j.id);
            }
            break;
          }
          steps.push({
            type: "job",
            location: bestDrop.loc,
            arrival: dropArr,
            service: dropSvc,
            load: [curLoad],
          });
          curTime = dropArr + dropSvc;
          curLoc = bestDrop.loc;
          curLoad = 0; // unloaded
          routeDuration += dropTravel + dropSvc;
          routeDistance += Math.round(bestDropKm * 1000);
          // Continue the while loop — remaining orders can now be picked up
          continue;
        }
        // No load to drop off, or no remaining — can't proceed
        for (const j of remaining) {
          const loc = coordsByIntId.get(j.id) ?? j.location;
          const km = haversineKm(curLoc[1], curLoc[0], loc[1], loc[0]);
          const afterLoad = curLoad + (j.delivery[0] || 0);
          unassigned.push({
            id: j.id,
            reason: afterLoad > capacity ? "capacity" : "time-window",
          });
          assignedJobIds.add(j.id);
        }
        break;
      }
      const j = remaining[bestIdx];
      const loc = coordsByIntId.get(j.id) ?? j.location;
      const km = haversineKm(curLoc[1], curLoc[0], loc[1], loc[0]);
      const travel = Math.round((km * 1000) / mps);
      const arr = curTime + travel;
      const svc = j.service || serviceSec;
      curLoad += j.delivery[0] || 0;
      steps.push({
        type: "job",
        id: j.id,
        location: loc,
        arrival: arr,
        service: svc,
        load: [curLoad],
      });
      curTime = arr + svc;
      curLoc = loc;
      routeDuration += travel + svc;
      routeDistance += Math.round(km * 1000);
      assignedJobIds.add(j.id);
      remaining.splice(bestIdx, 1);
    }
    // return to home
    const kmHome = haversineKm(curLoc[1], curLoc[0], v.end[1], v.end[0]);
    const travelHome = Math.round((kmHome * 1000) / mps);
    const homeArr = curTime + travelHome;
    steps.push({ type: "end", location: v.end, arrival: homeArr, service: 0, load: [curLoad] });
    routeDuration += travelHome;
    routeDistance += Math.round(kmHome * 1000);
    routes.push({
      vehicle: v.id,
      duration: routeDuration,
      distance: routeDistance,
      service: steps.reduce((s, st) => s + (st.service || 0), 0),
      waiting_time: 0,
      steps,
    });
  }

  // any jobs not assigned to any vehicle
  for (const j of problem.jobs) {
    if (!assignedJobIds.has(j.id)) {
      unassigned.push({ id: j.id, reason: "no-feasible-vehicle" });
    }
  }

  const totalDuration = routes.reduce((s, r) => s + r.duration, 0);
  const totalDistance = routes.reduce((s, r) => s + r.distance, 0);
  return {
    code: 0,
    summary: {
      cost: totalDuration,
      routes: routes.length,
      unassigned: unassigned.length,
      duration: totalDuration,
      distance: totalDistance,
      service: routes.reduce((s, r) => s + r.service, 0),
    },
    routes,
    unassigned,
  };
}

// ---------------------------------------------------------------------------
// Stitch drop-offs into each load's route and produce the final daily plan
// ---------------------------------------------------------------------------

function travelSec(a: [number, number], b: [number, number]): { dur: number; dist: number } {
  const km = haversineKm(a[1], a[0], b[1], b[0]);
  const mps = (VEHICLE.avgSpeed * 1000) / 3600;
  return { dur: Math.round((km * 1000) / mps), dist: Math.round(km * 1000) };
}

function computeDropAlternative(
  lastLoc: [number, number],
  lastTime: number,
  dropOff: "DROP_A" | "DROP_B",
  homeCoord: [number, number]
): DropAlternative {
  const dropLoc = dropOff === "DROP_B" ? FIXED_LOCATIONS.DROP_B : FIXED_LOCATIONS.DROP_A;
  const dropCoord: [number, number] = [dropLoc.longitude, dropLoc.latitude];
  const toDrop = travelSec(lastLoc, dropCoord);
  const dropArr = lastTime + toDrop.dur;
  const dropService = VEHICLE.serviceTimeDrop * 60;
  const toHome = travelSec(dropCoord, homeCoord);
  const homeArr = dropArr + dropService + toHome.dur;
  return {
    dropOff,
    distanceMeters: toDrop.dist + toHome.dist,
    durationSeconds: toDrop.dur + dropService + toHome.dur,
    dropOffArrival: dropArr,
    homeArrival: homeArr,
  };
}

export function stitchSolution(
  solution: VroomSolution,
  orders: VroomOrderInput[],
  idMapping: IdMapping[],
  date: string,
  homeOverride?: { latitude: number; longitude: number }
): OptimizedRouteResult {
  const ordersByDbId = new Map(orders.map((o) => [o.id, o]));
  const loads: VroomLoadPlan[] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  let totalAlternativeDistance = 0;
  let totalAlternativeDuration = 0;
  const unassigned: { orderId: string; reason: string }[] = [];

  for (const r of solution.routes) {
    const majorityDropOff = determineRouteDropOff(r, ordersByDbId, idMapping);
    const homeCoord: [number, number] = homeOverride
      ? [homeOverride.longitude, homeOverride.latitude]
      : [FIXED_LOCATIONS.HOME.longitude, FIXED_LOCATIONS.HOME.latitude];
    const stops: VroomStopDetail[] = [];
    let cumLoad = 0;
    let lastLoc = homeCoord;
    let lastTime = r.steps[0]?.arrival ?? buildTimeWindow(date)[0];

    for (const step of r.steps) {
      if (step.type !== "job" || step.id === undefined) continue;
      const mapping = resolveIntId(step.id, idMapping);
      if (!mapping) continue;
      const o = ordersByDbId.get(mapping.orderDbId);
      if (!o) continue;
      cumLoad += o.points || sizeToLoad(o.size);
      stops.push({
        intId: step.id,
        orderId: mapping.orderId,
        orderDbId: mapping.orderDbId,
        customerName: o.customerName,
        address: o.address,
        city: o.city,
        phone: o.phone,
        points: o.points || sizeToLoad(o.size),
        zone: o.zone,
        size: o.size,
        notes: o.notes,
        isOffice: o.isOffice,
        latitude: o.latitude!,
        longitude: o.longitude!,
        dropOff: majorityDropOff,
        arrival: step.arrival,
        departure: step.arrival + (step.service || VEHICLE.serviceTimePickup * 60),
        serviceSeconds: step.service || VEHICLE.serviceTimePickup * 60,
        loadAfter: cumLoad,
      });
      lastLoc = step.location;
      lastTime = step.arrival + (step.service || VEHICLE.serviceTimePickup * 60);
    }

    if (stops.length === 0) continue;

    // Compare actual routing cost for ending this load at A vs B.
    const altA = computeDropAlternative(lastLoc, lastTime, "DROP_A", homeCoord);
    const altB = computeDropAlternative(lastLoc, lastTime, "DROP_B", homeCoord);
    const primary = altA.distanceMeters <= altB.distanceMeters ? altA : altB;
    const alternative = primary.dropOff === "DROP_A" ? altB : altA;

    const loadDuration = primary.homeArrival - (r.steps[0]?.arrival ?? buildTimeWindow(date)[0]);
    const loadDistance = r.distance + primary.distanceMeters;

    loads.push({
      vehicleId: r.vehicle,
      dropOff: primary.dropOff,
      stops,
      dropOffArrival: primary.dropOffArrival,
      homeArrival: primary.homeArrival,
      durationSeconds: loadDuration,
      distanceMeters: loadDistance,
      loadPoints: cumLoad,
      alternative,
    });
    totalDistance += loadDistance;
    totalDuration += loadDuration;
    totalAlternativeDistance += r.distance + alternative.distanceMeters;
    totalAlternativeDuration += alternative.homeArrival - (r.steps[0]?.arrival ?? buildTimeWindow(date)[0]);
  }

  for (const u of solution.unassigned) {
    const m = resolveIntId(u.id, idMapping);
    if (m) unassigned.push({ orderId: m.orderId, reason: u.reason });
  }

  const totalStops = loads.reduce((s, l) => s + l.stops.length, 0);
  const totalPoints = loads.reduce((s, l) => s + l.loadPoints, 0);

  return {
    date,
    idMapping,
    loads,
    totalDistanceMeters: totalDistance,
    totalDurationSeconds: totalDuration,
    totalStops,
    totalPoints,
    capacity: VEHICLE.capacity,
    unassigned,
    totalAlternativeDistanceMeters: totalAlternativeDistance,
    totalAlternativeDurationSeconds: totalAlternativeDuration,
    source: "vroom",
    summary: solution.summary,
  };
}

function determineRouteDropOff(
  r: VroomRoute,
  ordersByDbId: Map<string, VroomOrderInput>,
  idMapping: IdMapping[]
): "DROP_A" | "DROP_B" {
  const counts = { DROP_A: 0, DROP_B: 0 };
  for (const step of r.steps) {
    if (step.type !== "job" || step.id === undefined) continue;
    const m = resolveIntId(step.id, idMapping);
    if (!m) continue;
    const o = ordersByDbId.get(m.orderDbId);
    if (!o || o.latitude == null || o.longitude == null) continue;
    const d = assignDropOff(o.latitude, o.longitude);
    counts[d]++;
  }
  return counts.DROP_B > counts.DROP_A ? "DROP_B" : "DROP_A";
}

/** Recompute a load's drop-off leg and totals when the user switches drop point. */
export function recomputeLoadDropOff(
  load: VroomLoadPlan,
  newDropOff: "DROP_A" | "DROP_B",
  homeOverride?: { latitude: number; longitude: number }
): VroomLoadPlan {
  if (load.dropOff === newDropOff) return load;

  const homeCoord: [number, number] = homeOverride
    ? [homeOverride.longitude, homeOverride.latitude]
    : [FIXED_LOCATIONS.HOME.longitude, FIXED_LOCATIONS.HOME.latitude];

  // Last pickup location/time from existing stops.
  const lastStop = load.stops[load.stops.length - 1];
  const lastLoc: [number, number] = [lastStop.longitude, lastStop.latitude];
  const lastTime = lastStop.departure;

  const newAlt = computeDropAlternative(lastLoc, lastTime, newDropOff, homeCoord);
  const oldAlt: DropAlternative = {
    dropOff: load.dropOff,
    distanceMeters: load.alternative.distanceMeters,
    durationSeconds: load.alternative.durationSeconds,
    dropOffArrival: load.alternative.dropOffArrival,
    homeArrival: load.alternative.homeArrival,
  };

  // Pickup leg (r.distance / r.duration) is the part before the drop-off.
  const pickupDistance = load.distanceMeters - oldAlt.distanceMeters;
  const pickupDuration = load.durationSeconds - oldAlt.durationSeconds;

  return {
    ...load,
    dropOff: newAlt.dropOff,
    dropOffArrival: newAlt.dropOffArrival,
    homeArrival: newAlt.homeArrival,
    distanceMeters: pickupDistance + newAlt.distanceMeters,
    durationSeconds: pickupDuration + newAlt.durationSeconds,
    alternative: oldAlt,
  };
}

/** Recalculate entire route totals after one or more loads have been edited. */
export function recalculateRouteTotals(route: OptimizedRouteResult): OptimizedRouteResult {
  const totalDistanceMeters = route.loads.reduce((s, l) => s + l.distanceMeters, 0);
  const totalDurationSeconds = route.loads.reduce((s, l) => s + l.durationSeconds, 0);
  const totalAlternativeDistanceMeters = route.loads.reduce(
    (s, l) => s + l.distanceMeters - l.alternative.distanceMeters + (l.alternative.dropOff === l.dropOff ? 0 : l.alternative.distanceMeters),
    0
  );
  const totalAlternativeDurationSeconds = route.loads.reduce(
    (s, l) => s + l.durationSeconds - l.alternative.durationSeconds + (l.alternative.dropOff === l.dropOff ? 0 : l.alternative.durationSeconds),
    0
  );
  return {
    ...route,
    totalDistanceMeters,
    totalDurationSeconds,
    totalAlternativeDistanceMeters,
    totalAlternativeDurationSeconds,
  };
}

/** Move a stop within a load and recalculate arrival/departure times. */
export function reorderStopsInLoad(
  load: VroomLoadPlan,
  fromIndex: number,
  toIndex: number,
  homeOverride?: { latitude: number; longitude: number }
): VroomLoadPlan {
  const stops = [...load.stops];
  const [moved] = stops.splice(fromIndex, 1);
  stops.splice(toIndex, 0, moved);
  return recalcLoadStopsWith(load, stops, homeOverride);
}

/** Reverse all stops in a load and recalculate. */
export function reverseStopsInLoad(
  load: VroomLoadPlan,
  homeOverride?: { latitude: number; longitude: number }
): VroomLoadPlan {
  return recalcLoadStopsWith(load, [...load.stops].reverse(), homeOverride);
}

/** Recalculate a load's stops (ETAs, distances) after manual reordering. */
function recalcLoadStopsWith(
  load: VroomLoadPlan,
  newStops: VroomStopDetail[],
  homeOverride?: { latitude: number; longitude: number }
): VroomLoadPlan {
  const homeCoord: [number, number] = homeOverride
    ? [homeOverride.longitude, homeOverride.latitude]
    : [FIXED_LOCATIONS.HOME.longitude, FIXED_LOCATIONS.HOME.latitude];

  const mps = (VEHICLE.avgSpeed * 1000) / 3600;
  const pickupSvc = VEHICLE.serviceTimePickup * 60;

  let cumLoad = 0;
  let curLoc: [number, number] = homeCoord;
  // Start time: use the earliest stop's arrival as a base, or noon default
  const baseTime = newStops.length > 0
    ? newStops.reduce((min, s) => Math.min(min, s.arrival), newStops[0].arrival)
    : buildTimeWindow(load.stops[0]?.arrival
        ? new Date(load.stops[0].arrival * 1000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10))[0];
  let curTime = baseTime;

  const recalc = newStops.map((s) => {
    const loc: [number, number] = [s.longitude, s.latitude];
    const km = haversineKm(curLoc[1], curLoc[0], loc[1], loc[0]);
    const travel = Math.round((km * 1000) / mps);
    const arr = curTime + travel;
    cumLoad += s.points;
    const dep = arr + pickupSvc;
    curLoc = loc;
    curTime = dep;
    return { ...s, arrival: arr, departure: dep, loadAfter: cumLoad };
  });

  // Recompute drop-off and home legs from the last stop
  const lastStop = recalc[recalc.length - 1];
  const lastLoc: [number, number] = [lastStop.longitude, lastStop.latitude];
  const lastTime = lastStop.departure;
  const altA = computeDropAlternative(lastLoc, lastTime, "DROP_A", homeCoord);
  const altB = computeDropAlternative(lastLoc, lastTime, "DROP_B", homeCoord);
  const primary = altA.distanceMeters <= altB.distanceMeters ? altA : altB;
  const alternative = primary.dropOff === "DROP_A" ? altB : altA;

  const pickupKm = recalc.reduce((sum, s, i) => {
    const prev = i === 0 ? homeCoord : [recalc[i - 1].longitude, recalc[i - 1].latitude] as [number, number];
    return sum + haversineKm(prev[1], prev[0], s.latitude, s.longitude);
  }, 0);
  const pickupDist = Math.round(pickupKm * 1000);
  const pickupDur = recalc[recalc.length - 1].departure - baseTime;

  return {
    ...load,
    stops: recalc,
    dropOff: primary.dropOff,
    dropOffArrival: primary.dropOffArrival,
    homeArrival: primary.homeArrival,
    distanceMeters: pickupDist + primary.distanceMeters,
    durationSeconds: pickupDur + primary.durationSeconds,
    alternative,
  };
}

// ---------------------------------------------------------------------------
// Top-level orchestrator: build -> solve -> stitch
// ---------------------------------------------------------------------------

export async function optimizeRouteForDate(
  orders: VroomOrderInput[],
  date: string,
  homeOverride?: { latitude: number; longitude: number }
): Promise<OptimizedRouteResult> {
  const geocoded = orders.filter((o) => o.latitude != null && o.longitude != null);
  const idMapping = buildIdMappings(geocoded);
  const partition = buildLoadPartition(geocoded, date, idMapping, homeOverride);
  const problem: VroomProblem = { vehicles: partition.vehicles, jobs: partition.jobs, options: { g: true } };

  // Try the VROOM server first (it assigns jobs across vehicles itself)
  const vroomSol = await solveVroomProblem(problem);
  if (vroomSol) {
    return stitchSolution(vroomSol, geocoded, idMapping, date, homeOverride);
  }

  // Fallback: nearest-neighbour in-process solver, partitioned per vehicle so
  // orders are never duplicated across vehicles.
  const coordsByIntId = new Map<number, [number, number]>();
  for (const m of idMapping) {
    const o = geocoded.find((o) => o.id === m.orderDbId)!;
    coordsByIntId.set(m.intId, [o.longitude!, o.latitude!]);
  }
  const nnSol = solveNearestNeighbor(problem, coordsByIntId, partition.vehicleJobs);
  const result = stitchSolution(nnSol, geocoded, idMapping, date, homeOverride);
  result.source = "nearest-neighbor";
  return result;
}