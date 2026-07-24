import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import type { OptimizedRouteResult, VroomLoadPlan, DropAlternative } from "@/lib/vroom";

/** Ensure old saved route data has the new fields added on 2026-07-24. */
function normalizeRouteData(raw: any): OptimizedRouteResult {
  const route = raw as OptimizedRouteResult;

  if (typeof route.totalAlternativeDistanceMeters !== "number") {
    route.totalAlternativeDistanceMeters = 0;
  }
  if (typeof route.totalAlternativeDurationSeconds !== "number") {
    route.totalAlternativeDurationSeconds = 0;
  }

  if (Array.isArray(route.loads)) {
    for (const load of route.loads as any[]) {
      if (!load.alternative || typeof load.alternative.dropOff !== "string") {
        load.alternative = {
          dropOff: load.dropOff === "DROP_B" ? "DROP_A" : "DROP_B",
          distanceMeters: 0,
          durationSeconds: 0,
          dropOffArrival: 0,
          homeArrival: 0,
        } satisfies DropAlternative;
      }
    }
  }

  return route;
}

// GET /api/route/preview?date=YYYY-MM-DD — Returns the saved route for a date.
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 }
    );

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });

    const isPrivileged = user.role === "ADMIN" || user.role === "SUPPORT";
    const userIdParam = searchParams.get("userId");
    const targetUserId = isPrivileged && userIdParam ? userIdParam : user.id;

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
        action: "ROUTE_PREVIEW_CROSS_USER",
        entity: "Route",
        entityId: `${targetUserId}:${date}`,
        details: `${user.role} ${user.username} previewed route for user ${targetUserId}`,
      });
    }

    const route = await db.route.findUnique({
      where: { userId_date: { userId: targetUserId, date } },
    });

    if (!route) return NextResponse.json({ route: null });

    return NextResponse.json({
      route: {
        id: route.id,
        date: route.date,
        vehicleId: route.vehicleId,
        totalDistance: route.totalDistance,
        totalDuration: route.totalDuration,
        stopCount: route.stopCount,
        status: route.status,
        createdAt: route.createdAt,
        routeData: normalizeRouteData(JSON.parse(route.routeData)),
        idMapping: JSON.parse(route.idMapping),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to load route: ${msg}` }, { status: 500 });
  }
}