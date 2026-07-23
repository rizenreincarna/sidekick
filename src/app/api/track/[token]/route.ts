import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// Public tracking endpoint: customers poll every 5s (~12 req/min).
// 40/min per IP leaves headroom for multiple tabs/devices behind NAT
// while blocking hammering.
const TRACK_RATE_LIMIT = 40;
const TRACK_RATE_WINDOW_MS = 60_000;
const TRACK_CACHE_HEADERS = { "Cache-Control": "public, max-age=5" } as const;

// Haversine distance in meters
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface RouteStop {
  orderId: string;
  customerName: string;
  latitude: number;
  longitude: number;
  stopNumber: number;
  arrival: number; // unix seconds
  serviceSeconds: number;
  points: number;
  size: string;
  completed: boolean;
}

// Fetch the ordered stop list for a given user + date from the saved Route record
async function getRouteInfo(userId: string, routeDate: string): Promise<{ stops: RouteStop[] | null; status: string | null }> {
  const route = await db.route.findUnique({
    where: { userId_date: { userId, date: routeDate } },
  });
  if (!route) return { stops: null, status: null };

  let routeData: { loads?: { stops?: { orderId?: string; customerName?: string; latitude?: number; longitude?: number; arrival?: number; serviceSeconds?: number; points?: number; size?: string }[] }[] } | null = null;
  try {
    routeData = JSON.parse(route.routeData);
  } catch {
    return { stops: null, status: route.status };
  }
  if (!routeData?.loads) return { stops: null, status: route.status };

  // Get all completed tracking links for this route date (to mark completed stops)
  const completedLinks = await db.trackingLink.findMany({
    where: { userId, routeDate, completedAt: { not: null } },
    select: { orderId: true },
  });
  const completedOrderIds = new Set(completedLinks.map((l) => l.orderId));

  const stops: RouteStop[] = [];
  let stopNum = 0;
  for (const load of routeData.loads) {
    for (const stop of load.stops || []) {
      stopNum++;
      stops.push({
        orderId: stop.orderId || "",
        customerName: stop.customerName || "",
        latitude: stop.latitude || 0,
        longitude: stop.longitude || 0,
        stopNumber: stopNum,
        arrival: stop.arrival || 0,
        serviceSeconds: stop.serviceSeconds || 0,
        points: stop.points || 0,
        size: stop.size || "",
        completed: completedOrderIds.has(stop.orderId || ""),
      });
    }
  }
  return { stops, status: route.status };
}

// OSRM result cache (15s TTL) + in-flight dedupe. The tracking page polls
// every 5s, so without this each viewer triggers an OSRM call per poll — and
// concurrent stacked polls duplicate identical calls. Driver GPS moves slowly
// relative to the cache TTL, so ETAs stay accurate.
const OSRM_CACHE_TTL_MS = 15_000;
const OSRM_TIMEOUT_MS = 3_500; // must stay well under the 5s client poll interval
const osrmCache = new Map<string, { duration: number; distance: number; ts: number }>();
const osrmInflight = new Map<string, Promise<{ duration: number; distance: number } | null>>();

// Query OSRM for the travel time (seconds) and distance (meters) along a sequence of coordinates
async function osrmRoute(coords: [number, number][]): Promise<{ duration: number; distance: number } | null> {
  if (coords.length < 2) return { duration: 0, distance: 0 };

  // Round to ~11m so near-identical positions share a cache entry
  const key = coords.map(([lat, lon]) => `${lat.toFixed(4)},${lon.toFixed(4)}`).join(";");
  const cached = osrmCache.get(key);
  if (cached && Date.now() - cached.ts < OSRM_CACHE_TTL_MS) {
    return { duration: cached.duration, distance: cached.distance };
  }
  const inflight = osrmInflight.get(key);
  if (inflight) return inflight;

  const promise = osrmRouteUncached(coords)
    .then((result) => {
      if (result) {
        if (osrmCache.size > 1_000) osrmCache.clear();
        osrmCache.set(key, { ...result, ts: Date.now() });
      }
      return result;
    })
    .finally(() => osrmInflight.delete(key));
  osrmInflight.set(key, promise);
  return promise;
}

async function osrmRouteUncached(coords: [number, number][]): Promise<{ duration: number; distance: number } | null> {
  try {
    // OSRM expects lon,lat;lon,lat
    const coordStr = coords.map(([lat, lon]) => `${lon},${lat}`).join(";");
    const url = `http://localhost:5000/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(OSRM_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    return {
      duration: data.routes[0].duration, // seconds
      distance: data.routes[0].distance, // meters
    };
  } catch {
    return null;
  }
}

// Fallback ETA using haversine + avg speed (30 km/h city)
function haversineEta(from: [number, number], to: [number, number]): { duration: number; distance: number } {
  const distMeters = haversine(from[0], from[1], to[0], to[1]);
  const avgSpeedMs = (30 * 1000) / 3600; // 30 km/h
  return { duration: distMeters / avgSpeedMs, distance: distMeters };
}

// GET /api/track/[token] — public tracking endpoint (no auth)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`track:${ip}`, TRACK_RATE_LIMIT, TRACK_RATE_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests — please slow down" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const { token } = await params;

  const link = await db.trackingLink.findUnique({
    where: { token },
    include: { user: { include: { heroProfile: true } } },
  });

  if (!link) {
    return NextResponse.json({ error: "Tracking link not found" }, { status: 404 });
  }

  // Expired links stop serving any data (older links without expiresAt are grandfathered)
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This tracking link has expired" },
      { status: 410 }
    );
  }

  const heroProfile = link.user.heroProfile;
  const heroName = heroProfile?.heroName || "Driver";
  const vehicleModel = heroProfile?.vehicleModel || "";
  const plateNumber = heroProfile?.plateNumber || "";
  const vehicleColor = heroProfile?.vehicleColor || "";

  // Fetch the customer's own pickup address (shown only to them on their link)
  // link.orderId is the human-readable order number, not the DB cuid → query by orderId
  const order = await db.order.findFirst({
    where: { orderId: link.orderId, userId: link.userId },
    select: { address: true, city: true },
  });
  const customerAddress = order ? `${order.address}${order.city ? ", " + order.city : ""}` : null;

  // If pickup completed, return completion message.
  // PII is minimized post-completion: the customer's home address is no longer
  // needed and is withheld (driver/vehicle info stays — the completed UI shows it).
  if (link.completedAt) {
    return NextResponse.json(
      {
        status: "completed",
        completedAt: link.completedAt.toISOString(),
        customerName: link.customerName,
        heroName,
        vehicleModel,
        plateNumber,
        vehicleColor,
      },
      { headers: TRACK_CACHE_HEADERS }
    );
  }

  // Get driver's latest position
  const driverLoc = await db.driverLocation.findFirst({
    where: { userId: link.userId },
    orderBy: { updatedAt: "desc" },
  });

  // Get the full route stop sequence
  const routeInfo = await getRouteInfo(link.userId, link.routeDate);
  const routeStops = routeInfo.stops;
  const routeStatus = routeInfo.status;

  // Determine which stops come before this customer's stop (and are not yet completed)
  const myStopNumber = link.stopNumber;
  const stopsBeforeMe: RouteStop[] = [];
  if (routeStops) {
    for (const s of routeStops) {
      if (s.stopNumber < myStopNumber) {
        stopsBeforeMe.push(s);
      }
    }
  }

  // Build the route path for the map (driver → uncompleted prev stops → customer)
  let routePath: [number, number][] = [];
  let eta: { minutes: number; distanceKm: number; stopsBefore: number } | null = null;
  let driverPosition: { latitude: number; longitude: number; updatedAt: string } | null = null;

  // Only expose the driver's live position when the route is actively STARTED.
  // When the route is OPTIMIZED (not yet started) or STOPPED, stale GPS from a
  // previous run must NOT be shown — otherwise customers see "Live" before the
  // driver has actually begun the route.
  if (driverLoc && routeStatus === "STARTED") {
    driverPosition = {
      latitude: driverLoc.latitude,
      longitude: driverLoc.longitude,
      updatedAt: driverLoc.updatedAt.toISOString(),
    };

    // Uncompleted stops before me (driver must visit these first)
    const uncompletedBefore = stopsBeforeMe.filter((s) => !s.completed);
    const stopsBeforeCount = uncompletedBefore.length;

    // Build coordinate sequence: driver → each uncompleted prev stop → customer
    const coords: [number, number][] = [
      [driverLoc.latitude, driverLoc.longitude],
      ...uncompletedBefore.map((s) => [s.latitude, s.longitude] as [number, number]),
      [link.latitude, link.longitude],
    ];

    routePath = coords;

    // Try OSRM for accurate road-based travel time
    let travelDuration = 0;
    let travelDistance = 0;
    const osrmResult = await osrmRoute(coords);
    if (osrmResult) {
      travelDuration = osrmResult.duration;
      travelDistance = osrmResult.distance;
    } else {
      // Fallback: sum haversine distances between consecutive stops
      for (let i = 0; i < coords.length - 1; i++) {
        const leg = haversineEta(coords[i], coords[i + 1]);
        travelDuration += leg.duration;
        travelDistance += leg.distance;
      }
    }

    // Add service time at each uncompleted previous stop (pickup takes time)
    const serviceTimePerStop = 8 * 60; // 8 minutes average per stop
    const totalServiceTime = uncompletedBefore.length * serviceTimePerStop;

    const totalSeconds = travelDuration + totalServiceTime;
    eta = {
      minutes: Math.max(1, Math.round(totalSeconds / 60)),
      distanceKm: Math.round((travelDistance / 1000) * 10) / 10,
      stopsBefore: stopsBeforeCount,
    };
  }

  // Build route stops for the map (only show stops up to and including this customer)
  // PRIVACY: only the customer's own stop gets a name; others are anonymous
  const mapStops = routeStops
    ? routeStops
        .filter((s) => s.stopNumber <= myStopNumber)
        .map((s) => ({
          stopNumber: s.stopNumber,
          latitude: s.latitude,
          longitude: s.longitude,
          // Only expose the customer's own name — never other customers'
          customerName: s.stopNumber === myStopNumber ? s.customerName : "",
          arrival: s.arrival,
          serviceSeconds: s.serviceSeconds,
          // Only show points for the customer's own stop (privacy)
          points: s.stopNumber === myStopNumber ? s.points : 0,
          size: s.stopNumber === myStopNumber ? s.size : "",
          completed: s.completed,
          isMine: s.stopNumber === myStopNumber,
        }))
    : [
        {
          stopNumber: myStopNumber,
          latitude: link.latitude,
          longitude: link.longitude,
          customerName: link.customerName,
          arrival: 0,
          serviceSeconds: 0,
          points: 0,
          size: "",
          completed: false,
          isMine: true,
        },
      ];

  const nowMY = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
  });

  return NextResponse.json(
    {
    status: "active",
    customerName: link.customerName,
    customerAddress,
    customerPosition: { latitude: link.latitude, longitude: link.longitude },
    stopNumber: myStopNumber,
    plannedEta: link.plannedEta,
    driverPosition,
    eta,
    routePath, // [[lat,lon], ...] for drawing the route line on the map
    mapStops, // ordered stops up to this customer for map markers
    currentTime: nowMY,
    heroName,
    vehicleModel,
    plateNumber,
    vehicleColor,
    routeDate: link.routeDate,
    // Driver stopped broadcasting (emergency stop): the route was started but
    // the driver cleared their GPS position. The customer sees an exception banner.
    driverStopped: routeStatus === "STOPPED",
    routeStatus,
    },
    { headers: TRACK_CACHE_HEADERS }
  );
}