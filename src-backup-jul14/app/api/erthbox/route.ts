import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

// GET /api/erthbox - List ERTHBOX locations
// ?all=true (Admin/Support only) — show ALL locations including inactive
// Default: show all active locations (universal - shared across all users)
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get("all") === "true";
    const isAdminOrSupport = user.role === "ADMIN" || user.role === "SUPPORT";

    if (showAll && isAdminOrSupport) {
      // Admin/Support: show ALL locations including inactive, with owner info
      const locations = await db.erthboxLocation.findMany({
        orderBy: { name: "asc" },
        include: {
          _count: { select: { orders: true } },
          user: { select: { id: true, username: true, displayName: true, role: true } },
        },
      });
      return NextResponse.json(locations);
    }

    // Universal: show all active ERTHBOX locations across all users
    const locations = await db.erthboxLocation.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { orders: true } },
        user: { select: { id: true, username: true, displayName: true, role: true } },
      },
    });

    return NextResponse.json(locations);
  } catch (error) {
    console.error("[erthbox] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch ERTHBOX locations." }, { status: 500 });
  }
}

// POST /api/erthbox - Create a new ERTHBOX location
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  if (user.role !== "HERO" && user.role !== "SUPPORT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "You do not have permission to create ERTHBOX locations." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, address, city, picName, picPhone, notes } = body;

    if (!name || !address || !city || !picName || !picPhone) {
      return NextResponse.json(
        { error: "Missing required fields: name, address, city, picName, picPhone" },
        { status: 400 }
      );
    }

    // Input validation
    if (String(name).length > 200) return NextResponse.json({ error: "Name must be 200 characters or less" }, { status: 400 });
    if (String(address).length > 500) return NextResponse.json({ error: "Address must be 500 characters or less" }, { status: 400 });
    if (String(city).length > 100) return NextResponse.json({ error: "City must be 100 characters or less" }, { status: 400 });
    if (String(picName).length > 200) return NextResponse.json({ error: "PIC name must be 200 characters or less" }, { status: 400 });
    if (String(picPhone).length > 30) return NextResponse.json({ error: "PIC phone must be 30 characters or less" }, { status: 400 });
    if (notes && String(notes).length > 1000) return NextResponse.json({ error: "Notes must be 1000 characters or less" }, { status: 400 });

    const location = await db.erthboxLocation.create({
      data: {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        picName: picName.trim(),
        picPhone: picPhone.trim(),
        notes: notes?.trim() || null,
        userId: user.id,
      },
    });

    await logAudit({
      userId: user.id,
      action: "CREATE",
      entity: "ErthboxLocation",
      entityId: location.id,
      details: JSON.stringify({ name: location.name, city: location.city }),
    });

    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    console.error("[erthbox] POST error:", error);
    return NextResponse.json({ error: "Failed to create ERTHBOX location." }, { status: 500 });
  }
}
