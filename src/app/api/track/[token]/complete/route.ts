import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";

// POST /api/track/[token]/complete — mark a pickup as completed (hero only)
// Also updates the order status to COMPLETED.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await params;

    const link = await db.trackingLink.findUnique({ where: { token } });
    if (!link) {
      return NextResponse.json({ error: "Tracking link not found" }, { status: 404 });
    }
    if (link.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (link.completedAt) {
      return NextResponse.json({ ok: true, completedAt: link.completedAt.toISOString() });
    }

    // Update tracking link AND order status in a single transaction.
    // Note: TrackingLink.orderId stores the display orderId (e.g. "26048"),
    // not the database primary key, so we match on Order.orderId.
    const completedAt = new Date();
    await db.$transaction([
      db.trackingLink.updateMany({
        where: { token, userId: user.id },
        data: { completedAt },
      }),
      db.order.updateMany({
        where: {
          orderId: link.orderId,
          userId: user.id,
          status: { in: ["CONFIRMED", "BOOKED", "SCHEDULED", "CONTACTED"] },
        },
        data: { status: "COMPLETED" },
      }),
    ]);

    return NextResponse.json({ ok: true, completedAt: completedAt.toISOString() });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[track/complete] POST error:", msg);
    return NextResponse.json({ error: "Failed to mark pickup complete" }, { status: 500 });
  }
}

// DELETE /api/track/[token]/complete — undo a completed pickup (hero only)
// Sets completedAt back to null and reverts order status to BOOKED.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await params;

    const link = await db.trackingLink.findUnique({ where: { token } });
    if (!link) {
      return NextResponse.json({ error: "Tracking link not found" }, { status: 404 });
    }
    if (link.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!link.completedAt) {
      return NextResponse.json({ ok: true, completedAt: null, alreadyActive: true });
    }

    // Revert tracking link AND order status in a single transaction.
    await db.$transaction([
      db.trackingLink.updateMany({
        where: { token, userId: user.id },
        data: { completedAt: null },
      }),
      db.order.updateMany({
        where: { orderId: link.orderId, userId: user.id, status: "COMPLETED" },
        data: { status: "BOOKED" },
      }),
    ]);

    return NextResponse.json({ ok: true, completedAt: null });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[track/complete] DELETE error:", msg);
    return NextResponse.json({ error: "Failed to undo pickup completion" }, { status: 500 });
  }
}
