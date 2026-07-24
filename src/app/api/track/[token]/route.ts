import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
    return { stops: null, status: null };
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

// Query OSRM for the travel time (seconds), distance (meters) and road-following
// geometry along a sequence of coordinates.
async function osrmRoute(coords: [number, number][]): Promise<{ duration: number; distance: number; path: [number, number][] } | null> {
  if (coords.length < 2) return { duration: 0, distance: 0, path: coords };
  try {
    // OSRM expects lon,lat;lon,lat
    const coordStr = coords.map(([lat, lon]) => `${lon},${lat}`).join(";");
    const url = `http://localhost:5000/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) return null;
    const geometry: [number, number][] = data.routes[0].geometry?.coordinates ?? [];
    return {
      duration: data.routes[0].duration, // seconds
      distance: data.routes[0].distance, // meters
      path: geometry.map(([lng, lat]) => [lat, lng] as [number, number]),
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
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const link = await db.trackingLink.findUnique({
    where: { token },
    include: { user: { include: { heroProfile: true } } },
  });

  if (!link) {
    return NextResponse.json({ error: "Tracking link not found" }, { status: 404 });
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

  // If pickup completed, return completion message
  if (link.completedAt) {
    return NextResponse.json({
      status: "completed",
      completedAt: link.completedAt.toISOString(),
      customerName: link.customerName,
      customerAddress,
      heroName,
      vehicleModel,
      plateNumber,
      vehicleColor,
    });
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
  let myStop: RouteStop | undefined;
  if (routeStops) {
    for (const s of routeStops) {
      if (s.stopNumber < myStopNumber) {
        stopsBeforeMe.push(s);
      } else if (s.stopNumber === myStopNumber) {
        myStop = s;
      }
    }
  }

  // Build the route path for the map (driver → uncompleted prev stops → customer)
  let routePath: [number, number][] = [];
  let eta: { minutes: number; distanceKm: number; stopsBefore: number } | null = null;
  let driverPosition: { latitude: number; longitude: number; updatedAt: string } | null = null;

  if (driverLoc) {
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

    // Try OSRM for accurate road-based travel time AND geometry
    let travelDuration = 0;
    let travelDistance = 0;
    const osrmResult = await osrmRoute(coords);
    if (osrmResult) {
      travelDuration = osrmResult.duration;
      travelDistance = osrmResult.distance;
      routePath = osrmResult.path.length >= 2 ? osrmResult.path : coords;
    } else {
      routePath = coords;
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

  return NextResponse.json({
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
  });
}