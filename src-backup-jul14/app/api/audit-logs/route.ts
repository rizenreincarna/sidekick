import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/audit-logs - Admin only. Paginated, searchable audit logs.
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Access denied. Admin privileges required." }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { action: { contains: search } },
        { entity: { contains: search } },
        { details: { contains: search } },
      ];
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
