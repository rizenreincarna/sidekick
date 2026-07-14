import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// POST /api/sos/[id] - Answer an SOS request (take the order)
// Support can also assign SOS to a specific hero via assignToUserId in body
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { assignToUserId } = body;

    const isPrivileged = user.role === "SUPPORT" || user.role === "ADMIN";

    // Support/Admin MUST provide assignToUserId — they cannot answer SOS for themselves
    if (isPrivileged && !assignToUserId) {
      return NextResponse.json({ error: "Support/Admin must specify assignToUserId when answering an SOS." }, { status: 400 });
    }

    // Determine target user
    let targetUserId = user.id;
    if (isPrivileged && assignToUserId) {
      const targetUser = await db.user.findUnique({ where: { id: assignToUserId } });
      if (!targetUser || !targetUser.isActive || targetUser.role !== "HERO") {
        return NextResponse.json({ error: "Invalid assignToUserId: user not found, inactive, or not a HERO." }, { status: 400 });
      }
      targetUserId = targetUser.id;
    }

    // Pre-check: fetch SOS to verify it exists and user isn't answering their own
    const sosCheck = await db.sOSRequest.findUnique({ where: { id } });
    if (!sosCheck) return NextResponse.json({ error: "SOS request not found. It may have already been answered." }, { status: 404 });
    if (sosCheck.status !== "ACTIVE") return NextResponse.json({ error: "This SOS has already been answered by another driver." }, { status: 400 });
    if (sosCheck.fromUserId === targetUserId) {
      return NextResponse.json({ error: "A hero cannot answer their own SOS request." }, { status: 400 });
    }

    // Use transaction with atomic check-and-update to prevent race conditions
    const result = await db.$transaction(async (tx) => {
      // Atomically claim the SOS — only update if still ACTIVE
      const sos = await tx.sOSRequest.updateMany({
        where: { id, status: "ACTIVE" },
        data: { status: "ANSWERED", toUserId: targetUserId },
      });
      if (sos.count === 0) throw new Error("SOS already answered or not found");

      // Fetch the SOS details for order creation
      const sosRecord = await tx.sOSRequest.findUnique({ where: { id } });
      if (!sosRecord) throw new Error("SOS request not found after update");

      // Transfer the order to the answering user
      const originalOrder = await tx.order.findFirst({
        where: { id: sosRecord.orderId, userId: sosRecord.fromUserId },
      });

      const createOrderData = originalOrder
        ? {
            orderId: originalOrder.orderId,
            customerName: originalOrder.customerName,
            phone: originalOrder.phone,
            address: originalOrder.address,
            city: originalOrder.city,
            size: originalOrder.size,
            points: originalOrder.points,
            zone: originalOrder.zone,
            isOffice: originalOrder.isOffice,
            status: "PENDING" as const,
            scheduledDate: null,
            notes: `SOS from another driver: ${sosRecord.sosNote}${originalOrder.notes ? ` | ${originalOrder.notes}` : ""}`,
            latitude: originalOrder.latitude,
            longitude: originalOrder.longitude,
          }
        : {
            orderId: sosRecord.orderRef,
            customerName: sosRecord.customerName,
            phone: sosRecord.phone,
            address: sosRecord.address,
            city: sosRecord.city,
            size: sosRecord.size,
            points: sosRecord.points,
            zone: sosRecord.zone,
            isOffice: sosRecord.isOffice,
            status: "PENDING" as const,
            scheduledDate: null,
            notes: `SOS: ${sosRecord.sosNote}${sosRecord.notes ? ` | ${sosRecord.notes}` : ""}`,
          };

      // Check if the target user already has an order with this orderId
      const existingOrder = await tx.order.findFirst({
        where: { orderId: createOrderData.orderId, userId: targetUserId },
      });

      if (existingOrder) {
        throw new Error("Target user already has an order with this ID. Please delete it first before accepting this SOS.");
      }

      // Check if ANY order in the system (across all users) has this orderId
      const anyExistingOrder = await tx.order.findFirst({
        where: { orderId: createOrderData.orderId },
      });

      if (anyExistingOrder && anyExistingOrder.userId !== targetUserId) {
        throw new Error("DUPLICATE_ORDER");
      }

      // Delete from original owner if found
      if (originalOrder) {
        await tx.order.delete({ where: { id: originalOrder.id } });
      }

      // Create for new owner
      const newOrder = await tx.order.create({
        data: {
          ...createOrderData,
          userId: targetUserId,
        },
      });

      return newOrder;
    });

    // Audit log
    await logAudit({
      userId: user.id,
      action: "SOS_ANSWER",
      entity: "SOSRequest",
      entityId: id,
      details: JSON.stringify({ orderRef: result.orderId, assignedTo: targetUserId }),
    });

    return NextResponse.json({ success: true, order: result });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SOS already answered or not found") {
        return NextResponse.json({ error: "This SOS has already been answered by another driver or does not exist." }, { status: 400 });
      }
      if (error.message === "DUPLICATE_ORDER") {
        return NextResponse.json({ error: "This order already exists in another user's account." }, { status: 409 });
      }
      if (error.message.startsWith("Target user already has")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error("[sos/[id]] POST error:", error);
    return NextResponse.json({ error: "Failed to answer SOS request. Please try again." }, { status: 500 });
  }
}
