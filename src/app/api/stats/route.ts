import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { format, addDays, subDays, subMonths, subYears, startOfDay, endOfDay, startOfWeek } from "date-fns";
import { MAX_DAILY_POINTS } from "@/lib/zones";
import { NextRequest, NextResponse } from "next/server";

const statsCache = new Map<string, { data: unknown; ts: number }>();
const STATS_CACHE_TTL = 3000;

// GET /api/stats - Dashboard stats with time-range support
// Hero: own stats, Support/Admin: can query via ?userId=xxx
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");
    const range = searchParams.get("range") || "week"; // day, week, month, year, all
    const weekOffset = parseInt(searchParams.get("weekOffset") || "0"); // for selectable week

    // Only Support and Admin can query other users' stats
    let queryUserId = user.id;
    if (targetUserId && (user.role === "SUPPORT" || user.role === "ADMIN")) {
      queryUserId = targetUserId;
    }

    // Check per-user stats cache
    const cached = statsCache.get(queryUserId);
    if (cached && Date.now() - cached.ts < STATS_CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");
    const weekEnd = format(addDays(now, 14), "yyyy-MM-dd");

    // Time range filter for statistics
    let rangeStart: Date;
    switch (range) {
      case "day": rangeStart = startOfDay(now); break;
      case "week": rangeStart = subDays(now, 7); break;
      case "month": rangeStart = subMonths(now, 1); break;
      case "year": rangeStart = subYears(now, 1); break;
      default: rangeStart = new Date("2020-01-01"); break;
    }
    const rangeFilter = { gte: rangeStart.toISOString() };

    // Selectable week for workload view
    const selWeekStart = addDays(startOfDay(now), weekOffset * 7);
    const selWeekEnd = addDays(selWeekStart, 6);
    const selWeekStartStr = format(selWeekStart, "yyyy-MM-dd");
    const selWeekEndStr = format(selWeekEnd, "yyyy-MM-dd");

    const [
      pendingCount,
      scheduledCount,
      confirmedCount,
      bookedCount,
      completedCount,
      completedInRange,
      todayOrders,
      weekOrders,
      offDays,
      activeSosCount,
    ] = await Promise.all([
      db.order.count({ where: { status: "PENDING", userId: queryUserId } }),
      db.order.count({ where: { status: "SCHEDULED", userId: queryUserId } }),
      db.order.count({ where: { status: "CONFIRMED", userId: queryUserId } }),
      db.order.count({ where: { status: "BOOKED", userId: queryUserId } }),
      db.order.count({ where: { status: "COMPLETED", userId: queryUserId } }),
      db.order.count({ where: { status: "COMPLETED", userId: queryUserId, updatedAt: rangeFilter } }),
      db.order.findMany({
        where: { scheduledDate: todayStr, status: { in: ["SCHEDULED", "CONFIRMED", "BOOKED"] }, userId: queryUserId },
      }),
      db.order.findMany({
        where: {
          scheduledDate: { gte: todayStr, lte: weekEnd },
          status: { in: ["SCHEDULED", "CONFIRMED", "BOOKED"] },
          userId: queryUserId,
        },
      }),
      db.offDay.findMany({ where: { userId: queryUserId } }),
      db.sOSRequest.count({ where: { status: "ACTIVE", fromUserId: { not: queryUserId } } }),
    ]);

    // Selectable week orders
    const selWeekOrders = await db.order.findMany({
      where: {
        scheduledDate: { gte: selWeekStartStr, lte: selWeekEndStr },
        status: { in: ["SCHEDULED", "CONFIRMED", "BOOKED"] },
        userId: queryUserId,
      },
    });

    // Orders with coordinates for map
    // mapDate: filter by specific date (YYYY-MM-DD), "all" for no date filter, or omit for all
    // mapAll: if "true", show all heroes' orders (for Support/Admin map view)
    const mapDateFilter = searchParams.get("mapDate"); // "all", specific date, or null
    const mapAll = searchParams.get("mapAll") === "true"; // show all heroes' orders

    const mappableWhere: Record<string, unknown> = {
      status: { in: ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED"] },
      latitude: { not: null },
      longitude: { not: null },
    };

    // If mapAll and user is Support/Admin, show all heroes' orders; otherwise just own
    if (mapAll && (user.role === "SUPPORT" || user.role === "ADMIN")) {
      // No userId filter — show all orders
    } else {
      mappableWhere.userId = queryUserId;
    }

    // Apply date filter if specified
    if (mapDateFilter && mapDateFilter !== "all") {
      mappableWhere.scheduledDate = mapDateFilter;
    }

    const mappableOrders = await db.order.findMany({
      where: mappableWhere,
      select: {
        id: true, orderId: true, customerName: true, address: true, city: true,
        latitude: true, longitude: true, status: true, scheduledDate: true,
        size: true, points: true, zone: true, isEvent: true, isErthbox: true,
        userId: true,
        user: { select: { id: true, username: true, displayName: true, role: true } },
      },
    });

    const todayPoints = todayOrders.reduce((sum, o) => sum + o.points, 0);
    const weekPoints = weekOrders.reduce((sum, o) => sum + o.points, 0);
    const selWeekPoints = selWeekOrders.reduce((sum, o) => sum + o.points, 0);

    const scheduleByDate: Record<string, { orders: typeof weekOrders; totalPoints: number }> = {};
    for (const order of weekOrders) {
      if (!order.scheduledDate) continue;
      if (!scheduleByDate[order.scheduledDate]) {
        scheduleByDate[order.scheduledDate] = { orders: [], totalPoints: 0 };
      }
      scheduleByDate[order.scheduledDate].orders.push(order);
      scheduleByDate[order.scheduledDate].totalPoints += order.points;
    }

    // Selectable week schedule
    const selWeekScheduleByDate: Record<string, { orders: typeof selWeekOrders; totalPoints: number }> = {};
    for (const order of selWeekOrders) {
      if (!order.scheduledDate) continue;
      if (!selWeekScheduleByDate[order.scheduledDate]) {
        selWeekScheduleByDate[order.scheduledDate] = { orders: [], totalPoints: 0 };
      }
      selWeekScheduleByDate[order.scheduledDate].orders.push(order);
      selWeekScheduleByDate[order.scheduledDate].totalPoints += order.points;
    }

    const holidays = await db.holiday.findMany({
      where: { date: { gte: todayStr }, userId: queryUserId },
      orderBy: { date: "asc" },
      take: 5,
    });

    // Range-based stats for the hero
    const [
      createdInRange,
      ordersBySize,
      ordersByCity,
    ] = await Promise.all([
      db.order.count({ where: { userId: queryUserId, createdAt: rangeFilter } }),
      db.order.groupBy({ by: ["size"], where: { userId: queryUserId, createdAt: rangeFilter }, _count: true }),
      db.order.groupBy({ by: ["city"], where: { userId: queryUserId, createdAt: rangeFilter }, _count: true, orderBy: { _count: { city: "desc" } }, take: 10 }),
    ]);

    const sizeMap: Record<string, number> = {};
    ordersBySize.forEach(s => { sizeMap[s.size] = s._count; });
    const cityMap: Record<string, number> = {};
    ordersByCity.forEach(c => { cityMap[c.city] = c._count; });

    // Order trends for the range
    const trendDays = range === "day" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 12;
    const orderTrends: Array<{ date: string; created: number; completed: number }> = [];

    if (range === "day") {
      const [created, completed] = await Promise.all([
        db.order.count({ where: { userId: queryUserId, createdAt: rangeFilter } }),
        db.order.count({ where: { userId: queryUserId, status: "COMPLETED", updatedAt: rangeFilter } }),
      ]);
      orderTrends.push({ date: todayStr, created, completed });
    } else if (range === "year") {
      for (let i = 11; i >= 0; i--) {
        const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        const [created, completed] = await Promise.all([
          db.order.count({ where: { userId: queryUserId, createdAt: { gte: mStart.toISOString(), lte: mEnd.toISOString() } } }),
          db.order.count({ where: { userId: queryUserId, status: "COMPLETED", updatedAt: { gte: mStart.toISOString(), lte: mEnd.toISOString() } } }),
        ]);
        orderTrends.push({ date: format(mStart, "yyyy-MM"), created, completed });
      }
    } else {
      for (let i = trendDays - 1; i >= 0; i--) {
        const day = subDays(now, i);
        const dStart = startOfDay(day);
        const dEnd = endOfDay(day);
        const [created, completed] = await Promise.all([
          db.order.count({ where: { userId: queryUserId, createdAt: { gte: dStart.toISOString(), lte: dEnd.toISOString() } } }),
          db.order.count({ where: { userId: queryUserId, status: "COMPLETED", updatedAt: { gte: dStart.toISOString(), lte: dEnd.toISOString() } } }),
        ]);
        orderTrends.push({ date: format(day, "yyyy-MM-dd"), created, completed });
      }
    }

    // Points earned in range
    const pointsInRange = await db.order.aggregate({
      _sum: { points: true },
      where: { userId: queryUserId, status: "COMPLETED", updatedAt: rangeFilter },
    });

    const result = {
      pendingCount,
      scheduledCount,
      confirmedCount,
      bookedCount,
      completedCount,
      todayPoints,
      weekPoints,
      selWeekPoints,
      selWeekStart: selWeekStartStr,
      selWeekEnd: selWeekEndStr,
      selWeekScheduleByDate,
      scheduleByDate,
      holidays,
      todayOrders,
      offDays,
      activeSosCount,
      // New fields
      range,
      createdInRange,
      completedInRange,
      pointsInRange: pointsInRange._sum.points || 0,
      bySize: sizeMap,
      byCity: cityMap,
      trends: orderTrends,
      mappableOrders,
    };

    statsCache.set(queryUserId, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[stats] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard stats. Please try again." }, { status: 500 });
  }
}
