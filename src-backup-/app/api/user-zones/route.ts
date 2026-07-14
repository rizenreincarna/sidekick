import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { ZONES, CUSTOM_ZONE_START, getZoneColor } from "@/lib/zones";
import { NextRequest, NextResponse } from "next/server";

// GET /api/user-zones - Get user's zone overrides and custom zones
export async function GET() {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const userZones = await db.userZone.findMany({
      where: { userId: user.id },
      orderBy: [{ region: "asc" }, { order: "asc" }, { zoneId: "asc" }],
    });

    // Parse areas JSON for each custom zone
    const result = userZones.map(uz => ({
      ...uz,
      areas: JSON.parse(uz.areas),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[user-zones] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch zone data." }, { status: 500 });
  }
}

// POST /api/user-zones - Create a custom zone
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const body = await request.json();
    const { name, region, areas } = body;

    if (!name || !region) {
      return NextResponse.json({ error: "Name and region are required" }, { status: 400 });
    }

    if (String(name).length > 50) {
      return NextResponse.json({ error: "Zone name must be 50 characters or less" }, { status: 400 });
    }

    if (String(region).length > 50) {
      return NextResponse.json({ error: "Region name must be 50 characters or less" }, { status: 400 });
    }

    // Limit areas array size
    const areaList = Array.isArray(areas) ? areas.slice(0, 100) : [];

    // Creating a new custom zone - find the next available zoneId
    const existingCustomZones = await db.userZone.findMany({
      where: { userId: user.id, isCustom: true },
      select: { zoneId: true },
    });

    // Limit custom zones to 20
    if (existingCustomZones.length >= 20) {
      return NextResponse.json({ error: "Maximum 20 custom zones allowed. Delete an existing zone first." }, { status: 400 });
    }

    const usedIds = new Set(existingCustomZones.map(z => z.zoneId));

    let zoneId = CUSTOM_ZONE_START;
    while (usedIds.has(zoneId)) zoneId++;

    // Get color for this zone based on existing count
    const colorIndex = existingCustomZones.length;
    const zoneColor = getZoneColor(colorIndex);

    const userZone = await db.userZone.create({
      data: {
        zoneId,
        name,
        region,
        isCustom: true,
        isEnabled: true,
        areas: JSON.stringify(areaList),
        order: existingCustomZones.length,
        userId: user.id,
      },
    });

    return NextResponse.json({
      ...userZone,
      areas: JSON.parse(userZone.areas),
      color: zoneColor.color,
      bgColor: zoneColor.bgColor,
      borderColor: zoneColor.borderColor,
    }, { status: 201 });
  } catch (error) {
    console.error("[user-zones] POST error:", error);
    return NextResponse.json({ error: "Failed to create custom zone." }, { status: 500 });
  }
}

// PATCH /api/user-zones - Update zone (rename, enable/disable, change region, update areas)
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const body = await request.json();
    const { zoneId, name, region, isEnabled, areas, order } = body;

    if (zoneId === undefined || zoneId === null) {
      return NextResponse.json({ error: "zoneId is required" }, { status: 400 });
    }

    if (name && String(name).length > 50) {
      return NextResponse.json({ error: "Zone name must be 50 characters or less" }, { status: 400 });
    }

    if (region && String(region).length > 50) {
      return NextResponse.json({ error: "Region name must be 50 characters or less" }, { status: 400 });
    }

    const existing = await db.userZone.findFirst({
      where: { zoneId, userId: user.id },
    });

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (region !== undefined) updateData.region = region;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (areas !== undefined) updateData.areas = JSON.stringify(Array.isArray(areas) ? areas.slice(0, 100) : []);
    if (order !== undefined) updateData.order = order;

    if (existing) {
      // Update existing override/custom zone
      const updated = await db.userZone.update({
        where: { id: existing.id },
        data: updateData,
      });
      return NextResponse.json({ ...updated, areas: JSON.parse(updated.areas) });
    }

    // Create a new override for a built-in zone (e.g., rename or toggle)
    if (!name && isEnabled === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // For built-in zone overrides
    const builtIn = ZONES[zoneId];
    const userZone = await db.userZone.create({
      data: {
        zoneId,
        name: name || builtIn?.name || `Zone ${zoneId}`,
        region: region || builtIn?.region || "Custom",
        isCustom: false,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        areas: JSON.stringify(Array.isArray(areas) ? areas.slice(0, 100) : []),
        order: 0,
        userId: user.id,
      },
    });

    return NextResponse.json({ ...userZone, areas: JSON.parse(userZone.areas) });
  } catch (error) {
    console.error("[user-zones] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update zone." }, { status: 500 });
  }
}

// DELETE /api/user-zones - Delete a custom zone or remove built-in override
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

    const { zoneId } = await request.json();
    if (!zoneId) return NextResponse.json({ error: "zoneId is required" }, { status: 400 });

    const existing = await db.userZone.findFirst({
      where: { zoneId, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Zone not found." }, { status: 404 });
    }

    if (!existing.isCustom) {
      // For built-in overrides, just remove the override
      await db.userZone.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, message: "Override removed" });
    }

    // For custom zones, also remove all ZoneConfig entries for this zone
    await db.zoneConfig.deleteMany({
      where: { zone: zoneId, userId: user.id },
    });

    await db.userZone.delete({ where: { id: existing.id } });

    return NextResponse.json({ success: true, message: "Custom zone deleted" });
  } catch (error) {
    console.error("[user-zones] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete zone." }, { status: 500 });
  }
}
