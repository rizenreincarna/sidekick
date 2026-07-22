import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";

// POST /api/driver/location — hero updates their GPS position
// Body: { latitude, longitude, heading?, speed?, routeDate? }
//
// Source priority: the Android APK's User-Agent contains "SidekickDev" → treated
// as "mobile". A "web" update is only accepted if no mobile update was received
// recently (within MOBILE_PRIORITY_MS). This means if a hero is signed in on
// both the phone app and the web browser, the phone's GPS always wins.
const MOBILE_PRIORITY_MS = 2 * 60 * 1000; // 2 minutes

function detectSource(req: NextRequest): "mobile" | "web" {
  const ua = req.headers.get("user-agent") || "";
  return ua.includes("SidekickDev") ? "mobile" : "web";
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { latitude, longitude, heading, speed, routeDate } = body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json({ error: "latitude and longitude required" }, { status: 400 });
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    const source = detectSource(req);

    // Upsert: one location record per user (latest position)
    const existing = await db.driverLocation.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    // Mobile-priority: a web update is skipped if the last update came from the
    // mobile app recently (it's still active and more accurate).
    if (source === "web" && existing?.source === "mobile") {
      const ageMs = Date.now() - existing.updatedAt.getTime();
      if (ageMs < MOBILE_PRIORITY_MS) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "mobile_priority",
          updatedAt: existing.updatedAt,
        });
      }
    }

    let loc;
    if (existing) {
      loc = await db.driverLocation.update({
        where: { id: existing.id },
        data: { latitude, longitude, heading, speed, routeDate, source },
      });
    } else {
      loc = await db.driverLocation.create({
        data: { userId: user.id, latitude, longitude, heading, speed, routeDate, source },
      });
    }

    return NextResponse.json({ ok: true, updatedAt: loc.updatedAt, source });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[driver/location] POST error:", msg);
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
  }
}

// GET /api/driver/location — get latest driver position (for tracking)
export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loc = await db.driverLocation.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    if (!loc) return NextResponse.json({ location: null });
    return NextResponse.json({
      location: {
        latitude: loc.latitude,
        longitude: loc.longitude,
        heading: loc.heading,
        speed: loc.speed,
        source: loc.source,
        updatedAt: loc.updatedAt,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[driver/location] GET error:", msg);
    return NextResponse.json({ error: "Failed to fetch location" }, { status: 500 });
  }
}

// DELETE /api/driver/location — driver stops tracking (emergency stop)
// Clears the driver position so the tracking link shows "driver stopped broadcasting"
export async function DELETE() {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await db.driverLocation.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[driver/location] DELETE error:", msg);
    return NextResponse.json({ error: "Failed to clear location" }, { status: 500 });
  }
}
