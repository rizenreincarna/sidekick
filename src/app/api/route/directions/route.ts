import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";

// OSRM (Open Source Routing Machine) — free, open-source turn-by-turn directions.
// Running locally on port 5000. No API key needed, no usage limits.
const OSRM_URL = process.env.OSRM_URL || "http://127.0.0.1:5000";

interface DirectionsStep {
  instruction: string;
  htmlInstruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver: string;
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
}

interface DirectionsLeg {
  steps: DirectionsStep[];
  distanceMeters: number;
  durationSeconds: number;
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
}

interface DirectionsRoute {
  legs: DirectionsLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  polyline: string;
}

// GET /api/route/directions?from=lat,lng&to=lat,lng
// Returns turn-by-turn directions between two points via OSRM (free, open-source)
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "from and to query params required (lat,lng)" }, { status: 400 });
    }

    // OSRM expects coordinates as lon,lat;lon,lat
    const [fromLat, fromLng] = from.split(",").map(Number);
    const [toLat, toLng] = to.split(",").map(Number);

    if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
    const url = `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&annotations=true`;

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return NextResponse.json({ error: "OSRM routing request failed" }, { status: 502 });
    }

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) {
      return NextResponse.json({ error: data.message || "No route found" }, { status: 400 });
    }

    const route = data.routes[0];
    const legs: DirectionsLeg[] = (route.legs || []).map((leg: any) => ({
      steps: (leg.steps || []).map((s: any) => {
        const maneuver = osrmManeuverToKey(s.maneuver);
        return {
          instruction: formatInstruction(s.maneuver, s.name, s.ref),
          htmlInstruction: formatInstruction(s.maneuver, s.name, s.ref),
          distanceMeters: s.distance || 0,
          durationSeconds: s.duration || 0,
          maneuver,
          startLocation: { lat: s.maneuver?.location?.[1] || 0, lng: s.maneuver?.location?.[0] || 0 },
          endLocation: s.geometry?.coordinates?.length
            ? { lat: s.geometry.coordinates[s.geometry.coordinates.length - 1][1], lng: s.geometry.coordinates[s.geometry.coordinates.length - 1][0] }
            : { lat: 0, lng: 0 },
        };
      }),
      distanceMeters: leg.distance || 0,
      durationSeconds: leg.duration || 0,
      startLocation: { lat: fromLat, lng: fromLng },
      endLocation: { lat: toLat, lng: toLng },
    }));

    const result: DirectionsRoute = {
      legs,
      totalDistanceMeters: route.distance || 0,
      totalDurationSeconds: route.duration || 0,
      polyline: route.geometry?.coordinates
        ? route.geometry.coordinates.map((c: number[]) => `${c[1]},${c[0]}`).join(";")
        : "",
    };

    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[route/directions] error:", msg);
    return NextResponse.json({ error: "Failed to fetch directions" }, { status: 500 });
  }
}

// Convert OSRM maneuver object to a normalized key for icon mapping
function osrmManeuverToKey(m: any): string {
  if (!m) return "straight";
  const type = m.type || "";
  const modifier = m.modifier || "";

  if (type === "depart") return "straight";
  if (type === "arrive") return "arrive";
  if (type === "roundabout" || type === "rotary") return "roundabout";
  if (type === "merge") return "merge";
  if (type === "fork") return "fork";
  if (type === "uturn" || modifier === "uturn") return "uturn-left";

  if (modifier.includes("slight left")) return "turn-slight-left";
  if (modifier.includes("slight right")) return "turn-slight-right";
  if (modifier.includes("sharp left")) return "turn-sharp-left";
  if (modifier.includes("sharp right")) return "turn-sharp-right";
  if (modifier.includes("left")) return "turn-left";
  if (modifier.includes("right")) return "turn-right";

  return "straight";
}

// Build a human-readable + TTS-friendly instruction from OSRM step data
function formatInstruction(maneuver: any, name: string, ref: string): string {
  if (!maneuver) return "Continue";
  const type = maneuver.type || "";
  const modifier = maneuver.modifier || "";
  const roadName = name || ref || "the road";

  if (type === "depart") return `Head toward ${roadName}`;
  if (type === "arrive") return "You have arrived at your destination";
  if (type === "turn") {
    if (modifier === "left") return `Turn left onto ${roadName}`;
    if (modifier === "right") return `Turn right onto ${roadName}`;
    if (modifier === "slight left") return `Keep slightly left onto ${roadName}`;
    if (modifier === "slight right") return `Keep slightly right onto ${roadName}`;
    if (modifier === "sharp left") return `Turn sharp left onto ${roadName}`;
    if (modifier === "sharp right") return `Turn sharp right onto ${roadName}`;
    if (modifier === "uturn") return `Make a U-turn onto ${roadName}`;
    return `Turn onto ${roadName}`;
  }
  if (type === "continue") {
    if (modifier === "slight left") return `Continue slightly left on ${roadName}`;
    if (modifier === "slight right") return `Continue slightly right on ${roadName}`;
    if (modifier === "uturn") return `Make a U-turn on ${roadName}`;
    return `Continue on ${roadName}`;
  }
  if (type === "merge") return `Merge onto ${roadName}`;
  if (type === "fork") {
    if (modifier === "left") return `Keep left at the fork onto ${roadName}`;
    if (modifier === "right") return `Keep right at the fork onto ${roadName}`;
    return `Keep at the fork onto ${roadName}`;
  }
  if (type === "roundabout" || type === "rotary") return `Enter the roundabout and exit onto ${roadName}`;
  if (type === "on ramp") return `Take the ramp onto ${roadName}`;
  if (type === "off ramp") return `Take the exit onto ${roadName}`;
  if (type === "end of road") {
    if (modifier === "left") return `Turn left at the end of the road onto ${roadName}`;
    if (modifier === "right") return `Turn right at the end of the road onto ${roadName}`;
    return `Continue onto ${roadName}`;
  }
  if (type === "new name") return `Continue onto ${roadName}`;
  return `Continue on ${roadName}`;
}
