// Geo math helpers for in-app navigation. Client-safe (no Node APIs).
// All coordinates are lat/lng unless explicitly named otherwise.

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Initial bearing from a to b, in degrees 0..360 (0 = north). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Shortest-arc interpolation between two bearings (degrees). */
export function lerpBearing(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Path math — paths are [lat, lng] tuples (Sidekick internal convention)
// ---------------------------------------------------------------------------

export type PathPoint = [number, number]; // [lat, lng]

/** Cumulative distance (meters) at each path vertex. First entry is 0. */
export function cumulativeDistances(path: PathPoint[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversineMeters({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] }));
  }
  return cum;
}

/** Total path length in meters. */
export function pathLength(path: PathPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineMeters({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] });
  }
  return total;
}

export interface PathProjection {
  /** Perpendicular (cross-track) distance from the point to the path, meters. */
  distanceMeters: number;
  /** Distance along the path of the snapped point, meters from path start. */
  alongMeters: number;
  /** Snapped point on the path. */
  snapped: LatLng;
  /** Index of the path segment the point snapped to. */
  segmentIndex: number;
}

/**
 * Project a GPS point onto a path: finds the closest point on any segment and
 * reports cross-track distance + along-path distance. Equirectangular
 * approximation — accurate enough at city scale.
 */
export function projectOntoPath(point: LatLng, path: PathPoint[], cum?: number[]): PathProjection | null {
  if (path.length === 0) return null;
  if (path.length === 1) {
    return {
      distanceMeters: haversineMeters(point, { lat: path[0][0], lng: path[0][1] }),
      alongMeters: 0,
      snapped: { lat: path[0][0], lng: path[0][1] },
      segmentIndex: 0,
    };
  }
  const cumulative = cum ?? cumulativeDistances(path);
  const cosLat = Math.cos(toRad(point.lat));

  let best: PathProjection | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][1] * cosLat;
    const ay = path[i][0];
    const bx = path[i + 1][1] * cosLat;
    const by = path[i + 1][0];
    const px = point.lng * cosLat;
    const py = point.lat;

    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
    const sx = ax + t * abx;
    const sy = ay + t * aby;

    const snapped: LatLng = { lat: sy, lng: sx / cosLat };
    const dist = haversineMeters(point, snapped);
    const segLen = cumulative[i + 1] - cumulative[i];
    const along = cumulative[i] + t * segLen;

    if (!best || dist < best.distanceMeters) {
      best = { distanceMeters: dist, alongMeters: along, snapped, segmentIndex: i };
    }
  }
  return best;
}

/** Point at a given along-path distance (meters). Returns path end if past the end. */
export function pointAlongPath(path: PathPoint[], cum: number[], alongMeters: number): LatLng {
  if (path.length === 0) return { lat: 0, lng: 0 };
  if (alongMeters <= 0) return { lat: path[0][0], lng: path[0][1] };
  const total = cum[cum.length - 1];
  if (alongMeters >= total) {
    const last = path[path.length - 1];
    return { lat: last[0], lng: last[1] };
  }
  // Binary search for the segment containing alongMeters
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= alongMeters) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const t = segLen === 0 ? 0 : (alongMeters - cum[lo]) / segLen;
  return lerpLatLng({ lat: path[lo][0], lng: path[lo][1] }, { lat: path[hi][0], lng: path[hi][1] }, t);
}

/** Bearing of the path at a given along-path distance. */
export function bearingAlongPath(path: PathPoint[], cum: number[], alongMeters: number): number {
  const a = pointAlongPath(path, cum, alongMeters);
  const b = pointAlongPath(path, cum, alongMeters + 10);
  if (a.lat === b.lat && a.lng === b.lng) return 0;
  return bearingDegrees(a, b);
}

/** Bounds of a path: [[minLat, minLng], [maxLat, maxLng]]. */
export function pathBounds(path: PathPoint[]): [[number, number], [number, number]] {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of path) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "350 m" below 1 km, otherwise "2.4 km". */
export function formatDistance(meters: number): string {
  if (!isFinite(meters) || meters < 0) return "—";
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** "12 min" or "1 h 5 min". */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "3:45 PM" local time ETA from a timestamp (ms). */
export function formatEta(epochMs: number): string {
  const d = new Date(epochMs);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}
