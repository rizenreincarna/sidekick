import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { format, subDays, subMonths, subYears, startOfDay, endOfDay, addDays } from "date-fns";

// GET /api/stats/support - Support dashboard statistics with time range and hero overview
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user || (user.role !== "SUPPORT" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Support or Admin access required" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "week"; // day, week, month, year, all
    const weekOffset = parseInt(searchParams.get("weekOffset") || "0"); // 0 = current week, -1 = last week, etc.

    const now = new Date();
    let startDate: Date;
    switch (range) {
      case "day": startDate = startOfDay(now); break;
      case "week": startDate = subDays(now, 7); break;
      case "month": startDate = subMonths(now, 1); break;
      case "year": startDate = subYears(now, 1); break;
      default: startDate = new Date("2020-01-01"); break;
    }

    const dateFilter = { gte: startDate.toISOString() };

    // === HERO OVERVIEW ===
    const heroes = await db.user.findMany({
      where: { role: "HERO", isActive: true },
      select: {
        id: true, username: true, displayName: true, lastLoginAt: true,
        _count: {
          select: {
            orders: { where: { status: { not: "COMPLETED" } } },
          },
        },
        orders: {
          select: { id: true, orderId: true, status: true, points: true, size: true, scheduledDate: true, city: true, zone: true, isEvent: true, isErthbox: true },
          where: { status: { in: ["PENDING", "SCHEDULED", "CONTACTED", "BOOKED", "COMPLETED"] } },
          take: 200,
        },
        offDays: { select: { id: true, date: true, reason: true } },
        holidays: { select: { id: true, date: true, name: true } },
      },
    });

    // Calculate selectable week boundaries
    const weekStart = addDays(startOfDay(now), weekOffset * 7);
    const weekEnd = addDays(weekStart, 6);
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");

    const heroOverview = heroes.map(h => {
      const activeOrders = h.orders.filter(o => o.status !== "COMPLETED");
      const completedInRange = h.orders.filter(o => o.status === "COMPLETED");
      const weekOrders = h.orders.filter(o =>
        o.scheduledDate && o.scheduledDate >= weekStartStr && o.scheduledDate <= weekEndStr &&
        ["SCHEDULED", "CONTACTED", "BOOKED"].includes(o.status)
      );
      const weekPoints = weekOrders.reduce((s, o) => s + o.points, 0);
      const todayStr = format(now, "yyyy-MM-dd");
      const todayOrders = h.orders.filter(o => o.scheduledDate === todayStr && ["SCHEDULED", "CONTACTED", "BOOKED"].includes(o.status));
      const todayPoints = todayOrders.reduce((s, o) => s + o.points, 0);
      const offDaysThisWeek = h.offDays.filter(od => od.date >= weekStartStr && od.date <= weekEndStr);

      return {
        id: h.id,
        name: h.displayName || h.username,
        lastLogin: h.lastLoginAt,
        totalOrders: h._count.orders + completedInRange.length,
        activeOrders: h._count.orders,
        completedOrders: completedInRange.length,
        weekOrders: weekOrders.length,
        weekPoints,
        todayOrders: todayOrders.length,
        todayPoints,
        offDays: h.offDays,
        offDaysThisWeek,
        holidays: h.holidays,
        pendingCount: activeOrders.filter(o => o.status === "PENDING").length,
        scheduledCount: activeOrders.filter(o => o.status === "SCHEDULED").length,
      };
    });

    // === ALL ORDERS ACROSS HEROES (for support management) ===
    const allActiveOrders = await db.order.findMany({
      where: { status: { in: ["PENDING", "SCHEDULED", "CONTACTED", "BOOKED"] } },
      include: { user: { select: { id: true, username: true, displayName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // === ORDER STATISTICS ===
    const [
      totalOrders,
      ordersByStatus,
      ordersByHero,
    ] = await Promise.all([
      db.order.count({ where: { createdAt: dateFilter } }),
      db.order.groupBy({ by: ["status"], where: { createdAt: dateFilter }, _count: true }),
      db.order.groupBy({ by: ["userId"], where: { createdAt: dateFilter }, _count: true, orderBy: { _count: { userId: "desc" } } }),
    ]);

    const statusMap: Record<string, number> = {};
    ordersByStatus.forEach(s => { statusMap[s.status] = s._count; });

    const heroOrderMap: Record<string, number> = {};
    ordersByHero.forEach(h => { heroOrderMap[h.userId] = h._count; });

    // === SOS OVERVIEW ===
    const activeSosCount = await db.sOSRequest.count({ where: { status: "ACTIVE" } });
    const recentSosCount = await db.sOSRequest.count({ where: { createdAt: dateFilter } });

    // === UPCOMING HOLIDAYS / OFF DAYS ACROSS ALL HEROES ===
    const todayStr = format(now, "yyyy-MM-dd");
    const nextTwoWeeksStr = format(addDays(now, 14), "yyyy-MM-dd");

    const heroOffDaysUpcoming = await db.offDay.findMany({
      where: { date: { gte: todayStr, lte: nextTwoWeeksStr } },
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: { date: "asc" },
    });

    // === DAILY ORDER TRENDS ===
    const trendDays = range === "day" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 12;
    const orderTrends: Array<{ date: string; created: number; completed: number }> = [];

    if (range === "day") {
      const created = await db.order.count({ where: { createdAt: dateFilter } });
      const completed = await db.order.count({ where: { status: "COMPLETED", updatedAt: dateFilter } });
      orderTrends.push({ date: format(now, "yyyy-MM-dd"), created, completed });
    } else if (range === "year") {
      for (let i = 11; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        const [created, completed] = await Promise.all([
          db.order.count({ where: { createdAt: { gte: monthStart.toISOString(), lte: monthEnd.toISOString() } } }),
          db.order.count({ where: { status: "COMPLETED", updatedAt: { gte: monthStart.toISOString(), lte: monthEnd.toISOString() } } }),
        ]);
        orderTrends.push({ date: format(monthStart, "yyyy-MM"), created, completed });
      }
    } else {
      for (let i = trendDays - 1; i >= 0; i--) {
        const day = subDays(now, i);
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        const [created, completed] = await Promise.all([
          db.order.count({ where: { createdAt: { gte: dayStart.toISOString(), lte: dayEnd.toISOString() } } }),
          db.order.count({ where: { status: "COMPLETED", updatedAt: { gte: dayStart.toISOString(), lte: dayEnd.toISOString() } } }),
        ]);
        orderTrends.push({ date: format(day, "yyyy-MM-dd"), created, completed });
      }
    }

    return NextResponse.json({
      range,
      weekOffset,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      heroOverview,
      allActiveOrders,
      orders: {
        total: totalOrders,
        byStatus: statusMap,
        byHero: heroOrderMap,
        trends: orderTrends,
      },
      sos: {
        active: activeSosCount,
        recent: recentSosCount,
      },
      heroOffDaysUpcoming,
      heroes: heroes.map(h => ({
        id: h.id,
        name: h.displayName || h.username,
        username: h.username,
      })),
    });
  } catch (error) {
    console.error("[stats/support] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch support stats" }, { status: 500 });
  }
}
