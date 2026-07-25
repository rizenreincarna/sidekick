import { db } from "@/lib/db";
import { format, addDays, subDays, subMonths, subYears, startOfDay, endOfDay } from "date-fns";
import { MAX_DAILY_POINTS } from "@/lib/zones";
import { NextRequest, NextResponse } from "next/server";

const statsCache = new Map<string, { data: unknown; ts: number }>();
const STATS_CACHE_TTL = 5000;

// GET /api/stats/public — protected by a shared internal token.
// Nginx at work.rizen.space injects X-Internal-Stats-Token from a private location
// config; direct backend access without the token is rejected in-app.
// Returns the same dashboard stats as /api/stats but for the single operator user.
export async function GET(request: NextRequest) {
  try {
    const expected = process.env.INTERNAL_STATS_TOKEN;
    if (!expected) {
      return NextResponse.json({ error: "Stats endpoint not configured" }, { status: 503 });
    }
    const provided = request.headers.get("x-internal-stats-token");
    if (!provided || provided !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "week";

    // Find the single user (Tars — the only operator)
    const user = await db.user.findFirst({ where: { role: "HERO" } });
    if (!user) {
      return NextResponse.json({ error: "No operator user found" }, { status: 404 });
    }
    const queryUserId = user.id;

    // Per-user stats cache
    const cached = statsCache.get(queryUserId);
    if (cached && Date.now() - cached.ts < STATS_CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");
    const weekEnd = format(addDays(now, 14), "yyyy-MM-dd");

    // Time range filter
    let rangeStart: Date;
    switch (range) {
      case "day": rangeStart = startOfDay(now); break;
      case "week": rangeStart = subDays(now, 7); break;
      case "month": rangeStart = subMonths(now, 1); break;
      case "year": rangeStart = subYears(now, 1); break;
      default: rangeStart = new Date("2020-01-01"); break;
    }
    const rangeFilter = { gte: rangeStart.toISOString() };

    const [
      pendingCount, bookedCount, completedCount,
      todayOrders, weekOrders, activeAgents,
    ] = await Promise.all([
      db.order.count({ where: { status: "PENDING", userId: queryUserId } }),
      db.order.count({ where: { status: "BOOKED", userId: queryUserId } }),
      db.order.count({ where: { status: "COMPLETED", userId: queryUserId } }),
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
      // Count active Hermes processes as "active agents"
      db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM "Order" WHERE "userId" = $1 AND "status" IN ('PENDING','SCHEDULED','CONFIRMED','BOOKED')`,
        queryUserId
      ),
    ]);

    const todayPoints = todayOrders.reduce((sum: number, o: { points: number }) => sum + o.points, 0);
    const weekPoints = weekOrders.reduce((sum: number, o: { points: number }) => sum + o.points, 0);

    // Get active Hermes agent count from PM2 or process list
    let activeAgentCount = 3; // Default: Marie, Will, Jack
    try {
      const { execSync } = require("child_process");
      const pm2out = execSync("pm2 jlist 2>/dev/null", { timeout: 2000 }).toString();
      const pm2list = JSON.parse(pm2out || "[]");
      activeAgentCount = pm2list.filter(
        (p: { name: string; pm2_env?: { status?: string } }) =>
          p.name?.includes("hermes-gateway") && p.pm2_env?.status === "online"
      ).length || 3;
    } catch {}

    const result = {
      pendingCount,
      bookedCount,
      completedCount: completedCount + (await db.order.count({ where: { status: { in: ["SCHEDULED", "CONFIRMED"] }, userId: queryUserId } })),
      todayPoints,
      weekPoints,
      activeAgents: activeAgentCount,
      lastUpdated: format(now, "yyyy-MM-dd HH:mm:ss"),
    };

    statsCache.set(queryUserId, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[stats/public] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard stats" }, { status: 500 });
  }
}
