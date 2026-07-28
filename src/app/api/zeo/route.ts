import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { createZeoRoute, getZeoDrivers, buildZeoRouteFromOrders } from "@/lib/zeo";

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const body = await request.json();
    const { date, apiKey, baseAddress, baseLat, baseLng, driverId, stopDuration } = body;

    if (!apiKey) return NextResponse.json({ error: "Zeo API key is required" }, { status: 400 });
    if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    const orders = await db.order.findMany({
      where: {
        scheduledDate: date,
        status: { in: ["CONTACTED", "BOOKED"] },
        userId: user.id,
      },
      orderBy: { zone: "asc" },
    });

    if (orders.length === 0) {
      return NextResponse.json({ error: "No confirmed orders found for this date." }, { status: 400 });
    }

    const routeData = buildZeoRouteFromOrders(orders, date, baseAddress || "Cyberjaya, Selangor", baseLat, baseLng, driverId, stopDuration || 15);
    const result = await createZeoRoute(apiKey, routeData);
    return NextResponse.json({ success: true, route: result, stopsCount: orders.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Zeo API error: ${msg}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get("apiKey");

    if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 400 });

    const drivers = await getZeoDrivers(apiKey);
    return NextResponse.json(drivers);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to fetch drivers: ${msg}` }, { status: 500 });
  }
}
