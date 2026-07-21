import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";

// POST /api/driver/location — hero updates their GPS position
// Body: { latitude, longitude, heading?, speed?, routeDate? }
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

    // Upsert: one location record per user (latest position)
    const existing = await db.driverLocation.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    let loc;
    if (existing) {
      loc = await db.driverLocation.update({
        where: { id: existing.id },
        data: { latitude, longitude, heading, speed, routeDate },
      });
    } else {
      loc = await db.driverLocation.create({
        data: { userId: user.id, latitude, longitude, heading, speed, routeDate },
      });
    }

    return NextResponse.json({ ok: true, updatedAt: loc.updatedAt });
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
        updatedAt: loc.updatedAt,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[driver/location] GET error:", msg);
    return NextResponse.json({ error: "Failed to fetch location" }, { status: 500 });
  }
}