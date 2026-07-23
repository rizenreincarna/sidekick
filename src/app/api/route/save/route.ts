import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import type { OptimizedRouteResult, VroomStopDetail } from "@/lib/vroom";

// Tracking links expire at end of the route day (Asia/Kuala_Lumpur) + 24h grace.
function trackingLinkExpiry(routeDate: string): Date {
  return new Date(new Date(`${routeDate}T23:59:59+08:00`).getTime() + 24 * 60 * 60 * 1000);
}

// POST /api/route/save — Persists an optimized route to the DB.
// Body: { date, routeData, status? }
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user)
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 }
    );

  try {
    const body = await request.json();
    const { date, routeData, status } = body as {
      date?: string;
      routeData?: OptimizedRouteResult;
      status?: string;
    };

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
    if (!routeData || !routeData.loads)
      return NextResponse.json({ error: "routeData is required." }, { status: 400 });

    const isPrivileged = user.role === "ADMIN" || user.role === "SUPPORT";
    const targetUserId =
      isPrivileged && body.userId ? String(body.userId) : user.id;

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
        action: "ROUTE_SAVE_CROSS_USER",
        entity: "Route",
        entityId: `${targetUserId}:${date}`,
        details: `${user.role} ${user.username} saved route for user ${targetUserId} (${routeData.totalStops || 0} stops)`,
      });
    }

    const totalDistance = routeData.totalDistanceMeters || 0;
    const totalDuration = routeData.totalDurationSeconds || 0;
    const stopCount = routeData.totalStops || 0;
    // vehicleId: use first load's vehicle id, or 1
    const vehicleId = routeData.loads[0]?.vehicleId ?? 1;

    const saved = await db.route.upsert({
      where: { userId_date: { userId: targetUserId, date } },
      create: {
        date,
        userId: targetUserId,
        vehicleId,
        routeData: JSON.stringify(routeData),
        idMapping: JSON.stringify(routeData.idMapping || []),
        totalDistance,
        totalDuration,
        stopCount,
        status: status || "OPTIMIZED",
      },
      update: {
        vehicleId,
        routeData: JSON.stringify(routeData),
        idMapping: JSON.stringify(routeData.idMapping || []),
        totalDistance,
        totalDuration,
        stopCount,
        status: status || "OPTIMIZED",
      },
    });

    // ---- Generate/update tracking links for each stop ----
    const trackingTokens: { orderId: string; token: string; customerName: string }[] = [];
    let stopNum = 0;
    for (const load of routeData.loads) {
      for (const stop of load.stops) {
        stopNum++;
        // Find existing link by orderId + routeDate (preserve token if exists)
        const existing = await db.trackingLink.findFirst({
          where: { orderId: stop.orderId, routeDate: date, userId: targetUserId },
        });
        const token = existing?.token || randomUUID();
        const expiresAt = trackingLinkExpiry(date);
        if (existing) {
          await db.trackingLink.update({
            where: { id: existing.id },
            data: {
              customerName: stop.customerName,
              customerPhone: stop.phone || null,
              latitude: stop.latitude,
              longitude: stop.longitude,
              stopNumber: stopNum,
              plannedEta: stop.arrival ? new Date(stop.arrival * 1000).toISOString() : null,
              expiresAt,
            },
          });
        } else {
          await db.trackingLink.create({
            data: {
              token,
              orderId: stop.orderId,
              userId: targetUserId,
              routeDate: date,
              customerName: stop.customerName,
              customerPhone: stop.phone || null,
              latitude: stop.latitude,
              longitude: stop.longitude,
              stopNumber: stopNum,
              plannedEta: stop.arrival ? new Date(stop.arrival * 1000).toISOString() : null,
              expiresAt,
            },
          });
        }
        trackingTokens.push({ orderId: stop.orderId, token, customerName: stop.customerName });
      }
    }

    return NextResponse.json({ success: true, route: saved, trackingTokens });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to save route: ${msg}` }, { status: 500 });
  }
}