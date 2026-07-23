// OSRM (Open Source Routing Machine) server-side client + response normalization.
//
// - Self-hosted OSRM HTTP API (Docker). No API key, no Google Directions.
// - OSRM uses lng,lat order; Sidekick stores lat,lng — converted carefully here.
// - Only coordinates are ever sent to OSRM — never customer names/phones/addresses.
// - Responses are normalized into a compact shape consumed by the navigation engine.

import type { PathPoint } from "./geo-utils";
import { pathBounds } from "./geo-utils";

const OSRM_INTERNAL_URL =
  process.env.OSRM_INTERNAL_URL || process.env.OSRM_URL || "http://127.0.0.1:5000";

const OSRM_TIMEOUT_MS = 12000;

// ---------------------------------------------------------------------------
// Normalized shapes
// ---------------------------------------------------------------------------

export interface NavStep {
  /** Human-readable instruction, e.g. "Turn right onto Jalan Damansara". */
  instruction: string;
  /** TTS-friendly instruction (may include pre-maneuver phrasing). */
  voiceInstruction: string;
  distanceMeters: number;
  durationSeconds: number;
  /** Normalized maneuver key for icon mapping (turn-left, roundabout, …). */
  maneuverType: string;
  maneuverModifier: string | null;
  name: string | null;
  ref: string | null;
  /** Maneuver location (where the step begins). */
  location: { lat: number; lng: number };
}

export interface NavRouteResult {
  /** Leg path as [lat, lng] tuples. */
  path: PathPoint[];
  steps: NavStep[];
  distanceMeters: number;
  durationSeconds: number;
  /** [[minLat, minLng], [maxLat, maxLng]] */
  bounds: [[number, number], [number, number]];
}

export type OsrmErrorCode =
  | "unreachable"
  | "no_route"
  | "invalid_coordinates"
  | "timeout";

export class OsrmError extends Error {
  code: OsrmErrorCode;
  constructor(code: OsrmErrorCode, message: string) {
    super(message);
    this.name = "OsrmError";
    this.code = code;
  }
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// ---------------------------------------------------------------------------
// OSRM fetch (server-side only)
// ---------------------------------------------------------------------------

/**
 * Request a driving route from the self-hosted OSRM server.
 * Throws OsrmError with a clean code on any failure.
 */
export async function fetchOsrmRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<NavRouteResult> {
  if (!isValidLatLng(origin.lat, origin.lng) || !isValidLatLng(destination.lat, destination.lng)) {
    throw new OsrmError("invalid_coordinates", "Origin or destination coordinates are invalid.");
  }

  // OSRM coordinate order is lng,lat
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url =
    `${OSRM_INTERNAL_URL}/route/v1/driving/${coords}` +
    `?overview=full&geometries=geojson&steps=true&annotations=distance,duration&alternatives=false`;

  const timeout = AbortSignal.timeout(OSRM_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(url, { signal: combined, cache: "no-store" });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new OsrmError("timeout", "OSRM routing request timed out.");
    }
    throw new OsrmError("unreachable", "OSRM routing server is unreachable.");
  }

  if (!res.ok) {
    throw new OsrmError("unreachable", `OSRM responded with HTTP ${res.status}.`);
  }

  let data: OsrmRouteResponse;
  try {
    data = (await res.json()) as OsrmRouteResponse;
  } catch {
    throw new OsrmError("unreachable", "OSRM returned an unreadable response.");
  }

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new OsrmError("no_route", data.message || "No route found between these points.");
  }

  return normalizeOsrmRoute(data.routes[0]);
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

interface OsrmManeuver {
  type?: string;
  modifier?: string;
  location?: [number, number]; // [lng, lat]
  exit?: number;
}

interface OsrmStep {
  distance?: number;
  duration?: number;
  name?: string;
  ref?: string;
  maneuver?: OsrmManeuver;
}

interface OsrmLeg {
  distance?: number;
  duration?: number;
  steps?: OsrmStep[];
}

interface OsrmRoute {
  distance?: number;
  duration?: number;
  geometry?: { coordinates?: [number, number][] };
  legs?: OsrmLeg[];
}

interface OsrmRouteResponse {
  code?: string;
  message?: string;
  routes?: OsrmRoute[];
}

export function normalizeOsrmRoute(route: OsrmRoute): NavRouteResult {
  const coords = route.geometry?.coordinates ?? [];
  const path: PathPoint[] = coords.map((c) => [c[1], c[0]] as PathPoint);

  const steps: NavStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const s of leg.steps ?? []) {
      const m = s.maneuver ?? {};
      const name = s.name?.trim() ? s.name.trim() : null;
      const ref = s.ref?.trim() ? s.ref.trim() : null;
      steps.push({
        instruction: buildInstruction(m, name, ref),
        voiceInstruction: buildVoiceInstruction(m, name, ref),
        distanceMeters: s.distance ?? 0,
        durationSeconds: s.duration ?? 0,
        maneuverType: m.type ?? "continue",
        maneuverModifier: m.modifier ?? null,
        name,
        ref,
        location: {
          lat: m.location?.[1] ?? 0,
          lng: m.location?.[0] ?? 0,
        },
      });
    }
  }

  return {
    path,
    steps,
    distanceMeters: route.distance ?? 0,
    durationSeconds: route.duration ?? 0,
    bounds: pathBounds(path),
  };
}

function roadName(name: string | null, ref: string | null): string {
  return name || ref || "the road";
}

/** Normalized icon key for a maneuver (used by the maneuver card). */
export function maneuverIconKey(type: string, modifier: string | null): string {
  if (type === "arrive") return "arrive";
  if (type === "depart") return "depart";
  if (type === "roundabout" || type === "rotary") return "roundabout";
  if (type === "merge") return "merge";
  if (type === "fork") return (modifier ?? "").includes("left") ? "fork-left" : "fork-right";
  if (type === "on ramp") return "ramp";
  if (type === "off ramp") return "exit";
  if (type === "notification") return "straight";
  const mod = modifier ?? "";
  if (mod.includes("uturn")) return "uturn";
  if (mod.includes("sharp left")) return "sharp-left";
  if (mod.includes("sharp right")) return "sharp-right";
  if (mod.includes("slight left")) return "slight-left";
  if (mod.includes("slight right")) return "slight-right";
  if (mod.includes("left")) return "left";
  if (mod.includes("right")) return "right";
  return "straight";
}

/** Human-readable instruction from OSRM step data (banner text). */
export function buildInstruction(m: OsrmManeuver, name: string | null, ref: string | null): string {
  const type = m.type ?? "";
  const mod = m.modifier ?? "";
  const road = roadName(name, ref);

  switch (type) {
    case "depart":
      return `Start on ${road}`;
    case "arrive":
      return "Arrive at destination";
    case "turn":
      if (mod === "left") return `Turn left onto ${road}`;
      if (mod === "right") return `Turn right onto ${road}`;
      if (mod === "slight left") return `Bear left onto ${road}`;
      if (mod === "slight right") return `Bear right onto ${road}`;
      if (mod === "sharp left") return `Sharp left onto ${road}`;
      if (mod === "sharp right") return `Sharp right onto ${road}`;
      if (mod === "uturn") return `Make a U-turn onto ${road}`;
      return `Turn onto ${road}`;
    case "new name":
      return `Continue onto ${road}`;
    case "continue":
      if (mod === "uturn") return `Make a U-turn on ${road}`;
      if (mod === "slight left") return `Keep left on ${road}`;
      if (mod === "slight right") return `Keep right on ${road}`;
      return `Continue on ${road}`;
    case "roundabout":
    case "rotary": {
      const exit = m.exit ? `, take exit ${m.exit}` : "";
      return `At the roundabout${exit}, onto ${road}`;
    }
    case "merge":
      return `Merge onto ${road}`;
    case "on ramp":
      return `Take the ramp onto ${road}`;
    case "off ramp":
      return `Take the exit onto ${road}`;
    case "fork":
      if (mod.includes("left")) return `Keep left onto ${road}`;
      if (mod.includes("right")) return `Keep right onto ${road}`;
      return `Keep straight at the fork onto ${road}`;
    case "end of road":
      if (mod === "left") return `Turn left onto ${road}`;
      if (mod === "right") return `Turn right onto ${road}`;
      return `Continue onto ${road}`;
    default:
      return `Continue on ${road}`;
  }
}

/** TTS-friendly phrasing (spoken by SpeechSynthesis / AndroidTTS). */
export function buildVoiceInstruction(m: OsrmManeuver, name: string | null, ref: string | null): string {
  const type = m.type ?? "";
  const mod = m.modifier ?? "";
  const road = roadName(name, ref);

  if (type === "depart") return `Start on ${road}`;
  if (type === "arrive") return "You have arrived";
  if (type === "roundabout" || type === "rotary") {
    return m.exit ? `At the roundabout, take exit ${m.exit} onto ${road}` : `Enter the roundabout, then take ${road}`;
  }
  if (type === "merge") return `Merge onto ${road}`;
  if (type === "on ramp") return `Take the ramp`;
  if (type === "off ramp") return `Take the exit`;
  if (type === "fork") return mod.includes("left") ? "Keep left" : mod.includes("right") ? "Keep right" : "Keep straight at the fork";
  if (type === "end of road") return mod === "left" ? "Turn left" : mod === "right" ? "Turn right" : "Continue";
  if (mod === "uturn" || type === "uturn") return "Make a U-turn";
  if (mod.includes("sharp left")) return `Turn sharp left onto ${road}`;
  if (mod.includes("sharp right")) return `Turn sharp right onto ${road}`;
  if (mod.includes("slight left")) return `Keep slightly left onto ${road}`;
  if (mod.includes("slight right")) return `Keep slightly right onto ${road}`;
  if (mod.includes("left")) return `Turn left onto ${road}`;
  if (mod.includes("right")) return `Turn right onto ${road}`;
  if (type === "new name") return `Continue onto ${road}`;
  return `Continue on ${road}`;
}
