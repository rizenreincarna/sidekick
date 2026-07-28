import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { format, addDays } from "date-fns";
import { NextResponse } from "next/server";

// GET /api/workload - Get all heroes' workload (Support and Admin only)
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Access denied. Support or Admin privileges required." }, { status: 403 });
  }

  try {
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");
    const weekEnd = format(addDays(today, 14), "yyyy-MM-dd");

    // Get all active heroes
    const heroes = await db.user.findMany({
      where: {
        role: "HERO",
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        orders: {
          where: {
            status: { in: ["PENDING", "SCHEDULED", "CONTACTED", "BOOKED"] },
          },
          select: {
            id: true,
            orderId: true,
            customerName: true,
            status: true,
            scheduledDate: true,
            points: true,
            zone: true,
            size: true,
            city: true,
          },
          orderBy: { scheduledDate: "asc" },
        },
      },
      orderBy: { displayName: "asc" },
    });

    const heroWorkloads = heroes.map((hero) => {
      const pendingCount = hero.orders.filter((o) => o.status === "PENDING").length;
      const scheduledCount = hero.orders.filter((o) => o.status === "SCHEDULED").length;
      const confirmedCount = hero.orders.filter((o) => o.status === "CONTACTED").length;
      const bookedCount = hero.orders.filter((o) => o.status === "BOOKED").length;
      const todayOrders = hero.orders.filter(
        (o) => o.scheduledDate === todayStr && ["SCHEDULED", "CONTACTED", "BOOKED"].includes(o.status)
      );
      const todayPoints = todayOrders.reduce((sum, o) => sum + o.points, 0);
      const weekOrders = hero.orders.filter(
        (o) => o.scheduledDate && o.scheduledDate >= todayStr && o.scheduledDate <= weekEnd && ["SCHEDULED", "CONTACTED", "BOOKED"].includes(o.status)
      );
      const weekPoints = weekOrders.reduce((sum, o) => sum + o.points, 0);
      const totalActiveOrders = pendingCount + scheduledCount + confirmedCount + bookedCount;

      return {
        id: hero.id,
        username: hero.username,
        displayName: hero.displayName,
        pendingCount,
        scheduledCount,
        confirmedCount,
        bookedCount,
        totalActiveOrders,
        todayPoints,
        weekPoints,
        orders: hero.orders,
      };
    });

    return NextResponse.json(heroWorkloads);
  } catch (error) {
    console.error("[workload] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch workload data." }, { status: 500 });
  }
}
