import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canonicalDriverCompletion, canonicalDriverCompletionUndo } from "@/lib/order-status";
import { completeTrackingAtomically, TrackingCompletionRaceError, undoTrackingAtomically } from "@/lib/tracking-completion";

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
    const order = await db.order.findFirst({ where: { orderId: link.orderId, userId: user.id }, select: { status: true } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    try {
      const next = canonicalDriverCompletion(order.status);
      // Idempotent: if already COMPLETED, skip the mutation and return success.
      if (order.status === "COMPLETED") {
        return NextResponse.json({ ok: true, completedAt: completedAt.toISOString() });
      }
      next; // referenced — prevents unused-var lint
    } catch (cause) {
      return NextResponse.json({ error: cause instanceof Error ? cause.message : "Invalid completion state" }, { status: 409 });
    }
    await db.$transaction(tx => completeTrackingAtomically(tx, { token, userId: user.id, orderId: link.orderId, expectedStatus: order.status, completedAt }));

    return NextResponse.json({ ok: true, completedAt: completedAt.toISOString() });
  } catch (error: unknown) {
    if (error instanceof TrackingCompletionRaceError) return NextResponse.json({ error: error.message }, { status: 409 });
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

    const order = await db.order.findFirst({ where: { orderId: link.orderId, userId: user.id }, select: { status: true } });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    try {
      canonicalDriverCompletionUndo(order.status);
    } catch (cause) {
      return NextResponse.json({ error: cause instanceof Error ? cause.message : "Invalid completion undo state" }, { status: 409 });
    }

    // Driver completion undo is an explicit operational exception to normal transitions.
    await db.$transaction(tx => undoTrackingAtomically(tx, { token, userId: user.id, orderId: link.orderId }));

    return NextResponse.json({ ok: true, completedAt: null });
  } catch (error: unknown) {
    if (error instanceof TrackingCompletionRaceError) return NextResponse.json({ error: error.message }, { status: 409 });
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[track/complete] DELETE error:", msg);
    return NextResponse.json({ error: "Failed to undo pickup completion" }, { status: 500 });
  }
}
