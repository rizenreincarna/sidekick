import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/audit-logs - Admin sees all; Hero sees only their own orders' logs.
// When entityId is provided, any authed user can see that entity's logs
// (the caller filters by entity=Order&entityId=xxx for the timeline view).
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;
    const entity = searchParams.get("entity");
    const entityId = searchParams.get("entityId");

    const where: Record<string, unknown> = {};

    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;

    if (search) {
      where.OR = [
        { action: { contains: search } },
        { entity: { contains: search } },
        { details: { contains: search } },
      ];
    }

    // If a specific entityId is requested, allow any authed user (they're
    // looking at a specific order's timeline). Otherwise, Admin-only.
    if (!entityId && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Access denied. Admin privileges required to browse all logs." }, { status: 403 });
    }

    // For Hero users querying a specific order, verify they own it
    if (entityId && user.role !== "ADMIN" && user.role !== "SUPPORT" && entity === "Order") {
      const order = await db.order.findFirst({
        where: { id: entityId, userId: user.id },
        select: { id: true },
      });
      if (!order) {
        return NextResponse.json({ error: "Access denied." }, { status: 403 });
      }
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, username: true, displayName: true, role: true },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[audit-logs] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs." }, { status: 500 });
  }
}