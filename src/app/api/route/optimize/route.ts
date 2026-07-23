import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { optimizeRouteForDate, type VroomOrderInput } from "@/lib/vroom";
import { FIXED_LOCATIONS } from "@/lib/route-model";

// POST /api/route/optimize — Takes { date }, fetches geocoded orders for that
// date, builds a VROOM problem, calls VROOM (with nearest-neighbour fallback),
// and returns the optimized route (NOT yet persisted).
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 }
    );

  try {
    const body = await request.json();
    const { date } = body as { date?: string };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });

    // Support/Admin may pass userId to optimize another hero's route
    const isPrivileged = user.role === "ADMIN" || user.role === "SUPPORT";
    const targetUserId = isPrivileged && body.userId ? String(body.userId) : user.id;

    // Cross-user access: validate the target user exists and leave an audit trail
    if (targetUserId !== user.id) {
      const target = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!target) {
        return NextResponse.json({ error: "Target user not found." }, { status: 404 });
      }
      await logAudit({
        userId: user.id,
        action: "ROUTE_OPTIMIZE_CROSS_USER",
        entity: "Route",
        entityId: `${targetUserId}:${date}`,
        details: `${user.role} ${user.username} optimized route for user ${targetUserId}`,
      });
    }

    const orders = await db.order.findMany({
      where: {
        scheduledDate: date,
        status: { in: ["CONFIRMED", "BOOKED"] },
        userId: targetUserId,
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { zone: "asc" },
    });

    if (orders.length === 0) {
      // Check if there are orders for this date in other states, for a helpful message
      const anyOrders = await db.order.count({ where: { scheduledDate: date, userId: targetUserId } });
      const completedToday = await db.order.count({ where: { scheduledDate: date, status: "COMPLETED", userId: targetUserId } });
      const notGeocoded = await db.order.count({
        where: { scheduledDate: date, status: { in: ["CONFIRMED", "BOOKED"] }, userId: targetUserId, OR: [{ latitude: null }, { longitude: null }] },
      });
      const hint = completedToday > 0
        ? ` There ${completedToday === 1 ? "is" : "are"} ${completedToday} completed order${completedToday > 1 ? "s" : ""} for this date — all pickups may already be done.`
        : notGeocoded > 0
          ? ` Found ${notGeocoded} confirmed/booked order${notGeocoded > 1 ? "s" : ""} without GPS coordinates — geocode them first.`
          : anyOrders === 0
            ? " No orders are scheduled for this date. Pick a different date or schedule orders first."
            : "";
      return NextResponse.json(
        {
          error:
            `No geocoded confirmed/booked orders found for this date.${hint}`.trim(),
        },
        { status: 400 }
      );
    }

    const inputs: VroomOrderInput[] = orders.map((o) => ({
      id: o.id,
      orderId: o.orderId,
      customerName: o.customerName,
      address: o.address,
      city: o.city,
      latitude: o.latitude,
      longitude: o.longitude,
      points: o.points,
      zone: o.zone,
      size: o.size,
      phone: o.phone,
      notes: o.notes,
      isOffice: o.isOffice,
    }));

    // Fetch hero profile for custom home location
    let homeOverride: { latitude: number; longitude: number } | undefined;
    const heroProfile = await db.heroProfile.findUnique({ where: { userId: targetUserId } });
    if (heroProfile?.homeLatitude != null && heroProfile?.homeLongitude != null) {
      homeOverride = {
        latitude: heroProfile.homeLatitude,
        longitude: heroProfile.homeLongitude,
      };
    }

    const result = await optimizeRouteForDate(inputs, date, homeOverride);
    return NextResponse.json({ success: true, route: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Route optimization failed: ${msg}` }, { status: 500 });
  }
}