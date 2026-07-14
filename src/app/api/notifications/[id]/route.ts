import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/notifications/[id] - Mark notification as read
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await params;

    const notification = await db.notification.findFirst({
      where: { id, userId: user.id },
    });

    if (!notification) {
      return NextResponse.json({ error: "Notification not found or does not belong to you." }, { status: 404 });
    }

    const updated = await db.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[notifications/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update notification." }, { status: 500 });
  }
}
