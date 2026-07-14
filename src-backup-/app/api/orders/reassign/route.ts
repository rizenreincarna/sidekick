import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

// POST /api/orders/reassign - Reassign an order from one hero to another
// Support and Admin only
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user || (user.role !== "SUPPORT" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Support or Admin access required" }, { status: 403 });
  }

  try {
    const { orderId, targetHeroId, reason } = await request.json() as {
      orderId: string; // Order.id (cuid)
      targetHeroId: string;
      reason?: string;
    };

    if (!orderId || !targetHeroId) {
      return NextResponse.json({ error: "orderId and targetHeroId are required" }, { status: 400 });
    }

    // Find the order
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Can't reassign BOOKED orders
    if (order.status === "BOOKED") {
      return NextResponse.json({ error: "Cannot reassign BOOKED orders" }, { status: 400 });
    }

    // Find the target hero
    const targetHero = await db.user.findUnique({ where: { id: targetHeroId } });
    if (!targetHero || !targetHero.isActive || targetHero.role !== "HERO") {
      return NextResponse.json({ error: "Target hero not found or inactive" }, { status: 400 });
    }

    const previousUserId = order.userId;
    const previousHero = await db.user.findUnique({ where: { id: previousUserId } });

    // Check for duplicate orderId on target hero
    const duplicate = await db.order.findFirst({
      where: { orderId: order.orderId, userId: targetHeroId },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Target hero already has an order with this Order ID" }, { status: 400 });
    }

    // Reassign the order
    const updated = await db.order.update({
      where: { id: orderId },
      data: { userId: targetHeroId },
    });

    // Audit log
    await logAudit({
      userId: user.id,
      action: "REASSIGN",
      entity: "Order",
      entityId: orderId,
      details: JSON.stringify({
        orderId: order.orderId,
        fromUserId: previousUserId,
        fromHero: previousHero?.displayName || previousHero?.username,
        toUserId: targetHeroId,
        toHero: targetHero.displayName || targetHero.username,
        reason: reason || "",
      }),
    });

    // Notify the target hero
    await db.notification.create({
      data: {
        userId: targetHeroId,
        type: "system",
        title: "Order Reassigned to You",
        message: `Order #${order.orderId} (${order.customerName}) has been reassigned to you by ${user.role === "SUPPORT" ? "Support" : "Admin"}${reason ? `: ${reason}` : ""}`,
      },
    });

    // Notify the previous hero (if different from current user)
    if (previousUserId !== user.id) {
      await db.notification.create({
        data: {
          userId: previousUserId,
          type: "system",
          title: "Order Reassigned From You",
          message: `Order #${order.orderId} (${order.customerName}) has been reassigned to ${targetHero.displayName || targetHero.username}${reason ? `: ${reason}` : ""}`,
        },
      });
    }

    // Notify admins (if the action was done by support)
    if (user.role === "SUPPORT") {
      const admins = await db.user.findMany({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      for (const admin of admins) {
        if (admin.id !== user.id) {
          await db.notification.create({
            data: {
              userId: admin.id,
              type: "normal",
              title: "Order Reassigned",
              message: `Support reassigned #${order.orderId} from ${previousHero?.displayName || previousHero?.username} to ${targetHero.displayName || targetHero.username}`,
            },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      order: updated,
      from: previousHero?.displayName || previousHero?.username,
      to: targetHero.displayName || targetHero.username,
    });
  } catch (error) {
    console.error("[orders/reassign] POST error:", error);
    return NextResponse.json({ error: "Failed to reassign order" }, { status: 500 });
  }
}
