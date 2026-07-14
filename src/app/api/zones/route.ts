import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/zones - Get user's custom zone areas (including exclusions)
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const configs = await db.zoneConfig.findMany({
      where: { userId: user.id },
      orderBy: [{ zone: "asc" }, { area: "asc" }],
    });
    return NextResponse.json(configs);
  } catch (error) {
    console.error("[zones] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch zone configurations." }, { status: 500 });
  }
}

// POST /api/zones - Add a custom area to a zone, OR exclude a built-in area
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { zone, area, isExcluded } = await request.json();
    if (!zone || !area) return NextResponse.json({ error: "Zone and area are required" }, { status: 400 });

    const lowerArea = area.toLowerCase().trim();
    if (lowerArea.length < 2) return NextResponse.json({ error: "Area name must be at least 2 characters" }, { status: 400 });
    if (lowerArea.length > 100) return NextResponse.json({ error: "Area name must be 100 characters or less" }, { status: 400 });

    const config = await db.zoneConfig.create({
      data: { zone: parseInt(zone), area: lowerArea, userId: user.id, isExcluded: !!isExcluded },
    });
    return NextResponse.json(config, { status: 201 });
  } catch {
    return NextResponse.json({ error: "This area already exists in this zone. Please remove it first if you want to change it." }, { status: 409 });
  }
}

// DELETE /api/zones - Remove a custom area or exclusion from a zone
export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const existing = await db.zoneConfig.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Zone configuration not found or does not belong to you." }, { status: 404 });

    await db.zoneConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[zones] DELETE error:", error);
    return NextResponse.json({ error: "Failed to remove zone area." }, { status: 500 });
  }
}
