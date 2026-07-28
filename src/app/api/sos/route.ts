import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/sos - List active SOS requests
// Heroes: see SOS from other users
// Support/Admin: see ALL active SOS requests (can assign them)
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const isSupport = user.role === "SUPPORT" || user.role === "ADMIN";

    const sosRequests = await db.sOSRequest.findMany({
      where: {
        status: "ACTIVE",
        ...(isSupport ? {} : { fromUserId: { not: user.id } }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    return NextResponse.json(sosRequests);
  } catch (error) {
    console.error("[sos] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch SOS requests." }, { status: 500 });
  }
}

// POST /api/sos - Create an SOS request from an order
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { orderId, sosNote } = await request.json();
    if (!orderId || !sosNote) {
      return NextResponse.json({ error: "Order ID and SOS note are required" }, { status: 400 });
    }

    if (String(sosNote).length > 500) {
      return NextResponse.json({ error: "SOS note must be 500 characters or less" }, { status: 400 });
    }

    const order = await db.order.findFirst({
      where: { id: orderId, userId: user.id },
    });
    if (!order) return NextResponse.json({ error: "This order no longer exists or belongs to another user." }, { status: 404 });

    // Create SOS request
    const sos = await db.sOSRequest.create({
      data: {
        orderId: order.id,
        orderRef: order.orderId,
        customerName: order.customerName,
        phone: order.phone,
        address: order.address,
        city: order.city,
        size: order.size,
        points: order.points,
        zone: order.zone,
        isOffice: order.isOffice,
        notes: order.notes,
        sosNote,
        fromUserId: user.id,
      },
    });

    // SOS is orthogonal to lifecycle status; preserve the current canonical state.
    await db.order.update({
      where: { id: order.id },
      data: { notes: `SOS: ${sosNote}${order.notes ? ` | ${order.notes}` : ""}` },
    });

    // Audit log
    await logAudit({
      userId: user.id,
      action: "SOS_CREATE",
      entity: "SOSRequest",
      entityId: sos.id,
      details: JSON.stringify({ orderRef: order.orderId }),
    });

    return NextResponse.json(sos, { status: 201 });
  } catch (error) {
    console.error("[sos] POST error:", error);
    return NextResponse.json({ error: "Failed to create SOS request. Please try again." }, { status: 500 });
  }
}
