import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { fetchOsrmRoute, fetchOsrmRouteMulti, isValidLatLng, OsrmError, type NavRouteResult } from "@/lib/osrm";

// POST /api/navigation/route
// Auth-protected server-side proxy to the self-hosted OSRM engine.
//
// Privacy: only coordinates are accepted and forwarded — customer names,
// phones, addresses and order IDs never leave this server toward OSRM.
//
// Responses are cached in-memory for 5 minutes keyed on rounded coordinates
// (~111 m grid) to absorb reroute spam and brief GPS jitter.

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

interface CacheEntry {
  result: NavRouteResult;
  expiresAt: number;
}

const routeCache = new Map<string, CacheEntry>();

function cacheKey(origin: { lat: number; lng: number }, dest: { lat: number; lng: number }): string {
  const r = (n: number) => n.toFixed(3); // ~111 m
  return `${r(origin.lat)},${r(origin.lng)}→${r(dest.lat)},${r(dest.lng)}`;
}

function cacheKeyMulti(waypoints: { lat: number; lng: number }[]): string {
  const r = (n: number) => n.toFixed(3);
  return "multi:" + waypoints.map((p) => `${r(p.lat)},${r(p.lng)}`).join(";");
}

function cacheGet(key: string): NavRouteResult | null {
  const entry = routeCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    routeCache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheSet(key: string, result: NavRouteResult): void {
  if (routeCache.size >= CACHE_MAX_ENTRIES) {
    // Evict the oldest entries (Map preserves insertion order)
    const keysToDelete = [...routeCache.keys()].slice(0, CACHE_MAX_ENTRIES / 2);
    for (const k of keysToDelete) routeCache.delete(k);
  }
  routeCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 }
    );
  }

  let body: {
    origin?: { lat?: unknown; lng?: unknown };
    destination?: { lat?: unknown; lng?: unknown };
    waypoints?: unknown[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Multi-waypoint mode (used by planner + overview maps for road-following lines)
  const rawWaypoints = Array.isArray(body?.waypoints) ? body.waypoints : [];
  const parsedWaypoints = rawWaypoints
    .map((p: unknown) =>
      p && typeof p === "object" && "lat" in p && "lng" in p
        ? { lat: Number((p as { lat: unknown }).lat), lng: Number((p as { lng: unknown }).lng) }
        : null
    )
    .filter((p): p is { lat: number; lng: number } => p !== null && isValidLatLng(p.lat, p.lng));

  if (parsedWaypoints.length >= 2) {
    const key = cacheKeyMulti(parsedWaypoints);
    const cached = cacheGet(key);
    if (cached) return NextResponse.json({ ...cached, cached: true });

    const result = await fetchOsrmRouteMulti(parsedWaypoints, request.signal);
    if (!result) {
      return NextResponse.json({ error: "No route found for waypoints.", code: "no_route" }, { status: 404 });
    }
    cacheSet(key, result);
    return NextResponse.json({ ...result, cached: false });
  }

  // Legacy two-point mode
  const origin = { lat: Number(body?.origin?.lat), lng: Number(body?.origin?.lng) };
  const destination = { lat: Number(body?.destination?.lat), lng: Number(body?.destination?.lng) };

  if (!isValidLatLng(origin.lat, origin.lng) || !isValidLatLng(destination.lat, destination.lng)) {
    return NextResponse.json(
      { error: "origin and destination must be valid { lat, lng } coordinates, or provide waypoints." },
      { status: 400 }
    );
  }

  const key = cacheKey(origin, destination);
  const cached = cacheGet(key);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  try {
    const result = await fetchOsrmRoute(origin, destination, request.signal);
    cacheSet(key, result);
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    if (err instanceof OsrmError) {
      const status =
        err.code === "no_route" ? 404 :
        err.code === "invalid_coordinates" ? 400 :
        err.code === "timeout" ? 504 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Routing failed: ${msg}`, code: "unreachable" }, { status: 500 });
  }
}
