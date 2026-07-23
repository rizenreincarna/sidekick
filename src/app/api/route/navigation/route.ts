import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import type { OptimizedRouteResult } from "@/lib/vroom";

// GET /api/route/navigation?date=YYYY-MM-DD
// Returns everything the in-app navigation screen needs in one shot:
// the saved route (parsed routeData), its status, and tracking tokens with
// completed flags so already-completed stops can be excluded on resume.
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "A valid date (YYYY-MM-DD) is required." }, { status: 400 });
    }

    const isPrivileged = user.role === "ADMIN" || user.role === "SUPPORT";
    const userIdParam = searchParams.get("userId");
    const targetUserId = isPrivileged && userIdParam ? userIdParam : user.id;

    const route = await db.route.findUnique({
      where: { userId_date: { userId: targetUserId, date } },
    });

    if (!route) {
      return NextResponse.json({ route: null, tokens: {} });
    }

    let routeData: OptimizedRouteResult | null = null;
    try {
      routeData = JSON.parse(route.routeData) as OptimizedRouteResult;
    } catch {
      return NextResponse.json({ error: "Saved route data is corrupted." }, { status: 500 });
    }

    const links = await db.trackingLink.findMany({
      where: { userId: targetUserId, routeDate: date },
      select: { orderId: true, token: true, completedAt: true },
    });
    const tokens: Record<string, { token: string; completed: boolean }> = {};
    for (const link of links) {
      tokens[link.orderId] = { token: link.token, completed: !!link.completedAt };
    }

    return NextResponse.json({
      route: {
        id: route.id,
        date: route.date,
        status: route.status,
        totalDistance: route.totalDistance,
        totalDuration: route.totalDuration,
        stopCount: route.stopCount,
        routeData,
      },
      tokens,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to load navigation route: ${msg}` }, { status: 500 });
  }
}
