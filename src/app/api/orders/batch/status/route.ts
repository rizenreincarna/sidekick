import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { canOperatorTransitionOrderStatus, normalizeOrderStatus } from "@/lib/order-status";

// PATCH /api/orders/batch/status - Bulk update order statuses
export async function PATCH(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { orderIds, status } = await request.json() as { orderIds: string[]; status: string };

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "No order IDs provided" }, { status: 400 });
    }

    if (orderIds.length > 100) {
      return NextResponse.json({ error: "Maximum 100 orders per batch update" }, { status: 400 });
    }

    const validStatuses = ["PENDING", "SCHEDULED", "CONTACTED", "BOOKED", "COMPLETED", "CANCELED"];
    const canonicalStatus = normalizeOrderStatus(status);
    if (!canonicalStatus || !validStatuses.includes(canonicalStatus)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    // Verify ownership + validate transitions
    const where = {
      id: { in: orderIds },
      userId: user.id,
    };

    // Fetch current orders to validate transitions
    const orders = await db.order.findMany({
      where,
      select: { id: true, status: true },
    });

    const validOrderIds: string[] = [];
    const skipped: string[] = [];

    for (const order of orders) {
      if (!canOperatorTransitionOrderStatus(order.status, canonicalStatus)) {
        skipped.push(order.id);
        continue;
      }
      validOrderIds.push(order.id);
    }

    if (validOrderIds.length === 0) {
      return NextResponse.json({
        error: `None of the selected orders can transition to ${status}`,
        skipped: skipped.length,
      }, { status: 400 });
    }

    const result = await db.order.updateMany({
      where: { id: { in: validOrderIds }, userId: user.id },
      data: { status: canonicalStatus },
    });

    return NextResponse.json({
      updated: result.count,
      skipped: skipped.length,
      requested: orderIds.length,
      status: canonicalStatus,
    });
  } catch (error) {
    console.error("[orders/batch/status] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update orders" }, { status: 500 });
  }
}
