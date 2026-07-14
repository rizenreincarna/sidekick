import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/notifications - Get notifications for current user. Paginated. Optional ?type=system|normal filter.
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId: user.id };
    if (type) where.type = type;

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.notification.count({ where }),
    ]);

    return NextResponse.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[notifications] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications." }, { status: 500 });
  }
}

// POST /api/notifications - Create notification (internal use)
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const body = await request.json();
    const { userId, type, title, message, actionUrl } = body;

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        { error: "Missing required fields: userId, type, title, message" },
        { status: 400 }
      );
    }

    if (!["system", "normal"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'system' or 'normal'" }, { status: 400 });
    }

    // IDOR protection: only ADMIN/SUPPORT can create notifications for other users
    const isPrivileged = user.role === "ADMIN" || user.role === "SUPPORT";
    if (!isPrivileged && userId !== user.id) {
      return NextResponse.json(
        { error: "You can only create notifications for yourself." },
        { status: 403 }
      );
    }

    if (String(title).length > 200) {
      return NextResponse.json({ error: "Title must be 200 characters or less" }, { status: 400 });
    }

    if (String(message).length > 1000) {
      return NextResponse.json({ error: "Message must be 1000 characters or less" }, { status: 400 });
    }

    const notification = await db.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        actionUrl: actionUrl || null,
      },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error("[notifications] POST error:", error);
    return NextResponse.json({ error: "Failed to create notification." }, { status: 500 });
  }
}
