import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import { format, subDays, subWeeks, subMonths, subYears, startOfDay, endOfDay } from "date-fns";

// GET /api/stats/admin - Admin dashboard statistics with time range
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "week"; // day, week, month, year, all

    const now = new Date();
    let startDate: Date;
    switch (range) {
      case "day": startDate = startOfDay(now); break;
      case "week": startDate = subDays(now, 7); break;
      case "month": startDate = subMonths(now, 1); break;
      case "year": startDate = subYears(now, 1); break;
      default: startDate = new Date("2020-01-01"); break; // all time
    }

    const dateFilter = { gte: startDate.toISOString() };

    // === ORDER STATISTICS ===
    const [
      totalOrders,
      ordersCreated,
      ordersCompleted,
      ordersDeleted,
      ordersByStatus,
      ordersBySize,
      ordersByZone,
      recentImports,
    ] = await Promise.all([
      // Total orders in range
      db.order.count({ where: { createdAt: dateFilter } }),
      // Orders created in range
      db.order.count({ where: { createdAt: dateFilter } }),
      // Orders completed in range
      db.order.count({ where: { status: "COMPLETED", updatedAt: dateFilter } }),
      // Deleted orders (from audit log)
      db.auditLog.count({ where: { action: "DELETE", entity: "Order", createdAt: dateFilter } }),
      // Orders by status
      db.order.groupBy({ by: ["status"], where: { createdAt: dateFilter }, _count: true }),
      // Orders by size
      db.order.groupBy({ by: ["size"], where: { createdAt: dateFilter }, _count: true }),
      // Orders by zone
      db.order.groupBy({ by: ["zone"], where: { createdAt: dateFilter }, _count: true, orderBy: { _count: { zone: "desc" } } }),
      // Import count from audit log
      db.auditLog.count({ where: { action: "IMPORT", entity: "Order", createdAt: dateFilter } }),
    ]);

    // === USER STATISTICS ===
    const [
      totalUsers,
      activeUsers,
      heroes,
      supportUsers,
      admins,
      recentLogins,
      unapprovedUsers,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { isActive: true } }),
      db.user.count({ where: { role: "HERO", isActive: true } }),
      db.user.count({ where: { role: "SUPPORT", isActive: true } }),
      db.user.count({ where: { role: "ADMIN", isActive: true } }),
      db.user.count({ where: { lastLoginAt: dateFilter } }),
      db.user.count({ where: { isApproved: false } }),
    ]);

    // Users with last login info
    const usersWithLogins = await db.user.findMany({
      where: { isActive: true },
      select: { id: true, username: true, displayName: true, role: true, lastLoginAt: true, createdAt: true },
      orderBy: { lastLoginAt: "desc" },
      take: 20,
    });

    // === AI STATISTICS ===
    const [
      totalAiMessages,
      aiActionsCreated,
      aiActionsApproved,
      aiActionsRejected,
      aiFlagsPending,
      aiConversationsCount,
    ] = await Promise.all([
      db.aiMessage.count({ where: { role: "assistant", createdAt: dateFilter } }),
      db.aiAction.count({ where: { createdAt: dateFilter } }),
      db.aiAction.count({ where: { status: "APPROVED", createdAt: dateFilter } }),
      db.aiAction.count({ where: { status: "REJECTED", createdAt: dateFilter } }),
      db.aiFlag.count({ where: { isResolved: false } }),
      db.aiConversation.count({ where: { createdAt: dateFilter } }),
    ]);

    // === AUDIT STATISTICS ===
    const auditByAction = await db.auditLog.groupBy({
      by: ["action"],
      where: { createdAt: dateFilter },
      _count: true,
      orderBy: { _count: { action: "desc" } },
    });

    const auditByEntity = await db.auditLog.groupBy({
      by: ["entity"],
      where: { createdAt: dateFilter },
      _count: true,
      orderBy: { _count: { entity: "desc" } },
    });

    // === DAILY ORDER TRENDS (last 30 days or range) ===
    const trendDays = range === "day" ? 1 : range === "week" ? 7 : range === "month" ? 30 : range === "year" ? 12 : 12;
    const orderTrends: Array<{ date: string; created: number; completed: number }> = [];

    if (range === "day") {
      const created = await db.order.count({ where: { createdAt: dateFilter } });
      const completed = await db.order.count({ where: { status: "COMPLETED", updatedAt: dateFilter } });
      orderTrends.push({ date: format(now, "yyyy-MM-dd"), created, completed });
    } else if (range === "year") {
      // Monthly buckets for year view
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
      // Daily buckets for week/month/all
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

    // === HERO WORKLOAD SUMMARY ===
    const heroWorkload = await db.user.findMany({
      where: { role: "HERO", isActive: true },
      select: {
        id: true, username: true, displayName: true,
        orders: {
          where: { status: { in: ["PENDING", "SCHEDULED", "CONTACTED", "BOOKED"] } },
          select: { points: true, status: true },
        },
      },
    });

    const heroSummary = heroWorkload.map(h => ({
      id: h.id,
      name: h.displayName || h.username,
      activeOrders: h.orders.length,
      activePoints: h.orders.reduce((s, o) => s + o.points, 0),
      pendingCount: h.orders.filter(o => o.status === "PENDING").length,
      scheduledCount: h.orders.filter(o => o.status === "SCHEDULED").length,
    }));

    // === PENDING AI FLAGS (moderation) ===
    const pendingFlags = await db.aiFlag.findMany({
      where: { isResolved: false },
      include: { user: { select: { username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // === PENDING USER APPROVALS ===
    const pendingApprovals = await db.user.findMany({
      where: { isApproved: false },
      select: { id: true, username: true, displayName: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Format status/size/zone maps
    const statusMap: Record<string, number> = {};
    ordersByStatus.forEach(s => { statusMap[s.status] = s._count; });

    const sizeMap: Record<string, number> = {};
    ordersBySize.forEach(s => { sizeMap[s.size] = s._count; });

    const zoneMap: Record<string, number> = {};
    ordersByZone.forEach(z => { zoneMap[String(z.zone)] = z._count; });

    const auditActionMap: Record<string, number> = {};
    auditByAction.forEach(a => { auditActionMap[a.action] = a._count; });

    const auditEntityMap: Record<string, number> = {};
    auditByEntity.forEach(e => { auditEntityMap[e.entity] = e._count; });

    return NextResponse.json({
      range,
      orders: {
        total: totalOrders,
        created: ordersCreated,
        completed: ordersCompleted,
        deleted: ordersDeleted,
        imported: recentImports,
        byStatus: statusMap,
        bySize: sizeMap,
        byZone: zoneMap,
        trends: orderTrends,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        heroes,
        support: supportUsers,
        admins,
        recentLogins,
        unapproved: unapprovedUsers,
        list: usersWithLogins,
        pendingApprovals,
      },
      ai: {
        totalMessages: totalAiMessages,
        actionsCreated: aiActionsCreated,
        actionsApproved: aiActionsApproved,
        actionsRejected: aiActionsRejected,
        flagsPending: aiFlagsPending,
        conversations: aiConversationsCount,
        pendingFlags,
      },
      audit: {
        byAction: auditActionMap,
        byEntity: auditEntityMap,
      },
      heroWorkload: heroSummary,
    });
  } catch (error) {
    console.error("[stats/admin] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch admin stats" }, { status: 500 });
  }
}
