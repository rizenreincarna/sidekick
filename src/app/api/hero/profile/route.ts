import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";

// GET /api/hero/profile — current user's hero profile
export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let profile = await db.heroProfile.findUnique({
      where: { userId: user.id },
    });
    // Auto-create with defaults if missing
    if (!profile) {
      profile = await db.heroProfile.create({
        data: {
          userId: user.id,
          heroName: user.displayName || user.username || "Hero",
          plateNumber: "",
          vehicleColor: "black",
          vehicleModel: "",
        },
      });
    }
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[hero/profile] GET error:", msg);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

// PUT /api/hero/profile — update hero profile
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { heroName, plateNumber, vehicleColor, vehicleModel, homeLatitude, homeLongitude } = body;

    // Validate home coordinates if provided
    const homeLat = homeLatitude !== undefined ? Number(homeLatitude) : undefined;
    const homeLon = homeLongitude !== undefined ? Number(homeLongitude) : undefined;
    if (homeLat !== undefined && (isNaN(homeLat) || homeLat < -90 || homeLat > 90)) {
      return NextResponse.json({ error: "Invalid home latitude" }, { status: 400 });
    }
    if (homeLon !== undefined && (isNaN(homeLon) || homeLon < -180 || homeLon > 180)) {
      return NextResponse.json({ error: "Invalid home longitude" }, { status: 400 });
    }

    // Validate string field lengths
    if (heroName !== undefined && (typeof heroName !== "string" || heroName.length > 100)) {
      return NextResponse.json({ error: "Hero name must be 100 chars or less" }, { status: 400 });
    }
    if (plateNumber !== undefined && (typeof plateNumber !== "string" || plateNumber.length > 20)) {
      return NextResponse.json({ error: "Plate number must be 20 chars or less" }, { status: 400 });
    }

    const profile = await db.heroProfile.upsert({
      where: { userId: user.id },
      update: {
        ...(heroName !== undefined && { heroName }),
        ...(plateNumber !== undefined && { plateNumber }),
        ...(vehicleColor !== undefined && { vehicleColor }),
        ...(vehicleModel !== undefined && { vehicleModel }),
        ...(homeLat !== undefined && { homeLatitude: homeLat }),
        ...(homeLon !== undefined && { homeLongitude: homeLon }),
      },
      create: {
        userId: user.id,
        heroName: heroName || user.displayName || user.username || "Hero",
        plateNumber: plateNumber || "",
        vehicleColor: vehicleColor || "black",
        vehicleModel: vehicleModel || "",
        ...(homeLat !== undefined && { homeLatitude: homeLat }),
        ...(homeLon !== undefined && { homeLongitude: homeLon }),
      },
    });
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[hero/profile] PUT error:", msg);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}