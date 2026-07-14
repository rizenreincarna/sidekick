import { db } from "@/lib/db";
import { detectZoneWithCustom, getSizePoints } from "@/lib/zones";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/session";
import { quickGeocode } from "@/lib/geocode";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/orders/[id] - Update an order (owner, Support, or Admin)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { customerName, phone, address, city, size, points, isOffice, notes, status, scheduledDate, latitude, longitude } = body;

    // Support and Admin can update any order, Heroes only their own
    const isPrivileged = user.role === "ADMIN" || user.role === "SUPPORT";
    const where = isPrivileged ? { id } : { id, userId: user.id };

    const existingOrder = await db.order.findFirst({ where });
    if (!existingOrder) {
      return NextResponse.json({ error: "This order no longer exists or belongs to another user." }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (customerName !== undefined) {
      if (String(customerName).length > 200) return NextResponse.json({ error: "Customer name must be 200 characters or less" }, { status: 400 });
      updateData.customerName = customerName;
    }
    if (phone !== undefined) {
      if (String(phone).length > 30) return NextResponse.json({ error: "Phone number must be 30 characters or less" }, { status: 400 });
      updateData.phone = phone;
    }
    if (address !== undefined) {
      if (String(address).length > 500) return NextResponse.json({ error: "Address must be 500 characters or less" }, { status: 400 });
      updateData.address = address;
      // Reset address verification when address changes
      if (address !== existingOrder.address) {
        updateData.addressVerified = false;
        updateData.addressVerificationNote = null;
      }
    }
    if (city !== undefined) {
      if (String(city).length > 100) return NextResponse.json({ error: "City must be 100 characters or less" }, { status: 400 });
      updateData.city = city;
      updateData.zone = await detectZoneWithCustom(city, existingOrder.userId);
      // Reset address verification when city changes
      if (city !== existingOrder.city) {
        updateData.addressVerified = false;
        updateData.addressVerificationNote = null;
      }
    }
    if (size !== undefined) {
      const upperSize = size.toUpperCase();
      if (!["S", "M", "L", "XL", "XXL"].includes(upperSize)) {
        return NextResponse.json({ error: "Size must be S, M, L, XL, or XXL" }, { status: 400 });
      }
      updateData.size = upperSize;
      if (points === undefined) {
        updateData.points = getSizePoints(upperSize);
      }
    }
    if (points !== undefined) {
      const pts = parseInt(points);
      if (isNaN(pts) || pts < 1 || pts > 20) {
        return NextResponse.json({ error: "Points must be between 1 and 20" }, { status: 400 });
      }
      updateData.points = pts;
      // Auto-derive size from points if size wasn't explicitly provided
      if (size === undefined) {
        let derivedSize = "S";
        if (pts >= 15) derivedSize = "XXL";
        else if (pts >= 4) derivedSize = "XL";
        else if (pts === 3) derivedSize = "L";
        else if (pts === 2) derivedSize = "M";
        else derivedSize = "S";
        updateData.size = derivedSize;
      }
    }
    if (isOffice !== undefined) updateData.isOffice = isOffice;
    if (notes !== undefined) {
      if (String(notes).length > 1000) return NextResponse.json({ error: "Notes must be 1000 characters or less" }, { status: 400 });
      updateData.notes = notes;
    }
    if (status !== undefined) {
      // Validate status transition — CANCELED is allowed from any status,
      // and CANCELED can be reverted to any other status.
      const VALID_TRANSITIONS: Record<string, string[]> = {
        PENDING: ["SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"],
        SCHEDULED: ["PENDING", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"],
        CONFIRMED: ["PENDING", "SCHEDULED", "BOOKED", "COMPLETED", "CANCELED"],
        BOOKED: ["PENDING", "SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED"],
        COMPLETED: ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "CANCELED"],
        CANCELED: ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED"],
      };
      const allowed = VALID_TRANSITIONS[existingOrder.status];
      if (!allowed || !allowed.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status transition from ${existingOrder.status} to ${status}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }
    if (scheduledDate !== undefined) updateData.scheduledDate = scheduledDate;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;

    // Auto-geocode if address or city changed and no explicit coordinates provided
    const addressChanged = address !== undefined || city !== undefined;
    const noExplicitCoords = latitude === undefined && longitude === undefined;
    if (addressChanged && noExplicitCoords) {
      const geoAddress = address !== undefined ? address : existingOrder.address;
      const geoCity = city !== undefined ? city : existingOrder.city;
      if (geoAddress && geoCity && geoAddress !== "N/A") {
        try {
          const coords = await quickGeocode(geoAddress, geoCity);
          if (coords) {
            updateData.latitude = coords[0];
            updateData.longitude = coords[1];
          }
        } catch {
          // Geocoding failed - keep existing coordinates
        }
      }
    }

    const order = await db.order.update({
      where: { id },
      data: updateData,
    });

    // Audit log — record old and new values for each changed field
    const changes: Record<string, { from: any; to: any }> = {};
    for (const key of Object.keys(updateData)) {
      changes[key] = {
        from: (existingOrder as any)[key] ?? null,
        to: updateData[key],
      };
    }
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "Order",
      entityId: id,
      details: JSON.stringify({ changes, by: user.role }),
    });

    // Notify hero if Support/Admin updated their order
    if (isPrivileged && existingOrder.userId !== user.id) {
      await db.notification.create({
        data: {
          userId: existingOrder.userId,
          type: "system",
          title: "Order Updated",
          message: `Your order #${existingOrder.orderId} was updated by ${user.role === "SUPPORT" ? "Support" : "Admin"}: ${Object.keys(updateData).join(", ")}`,
        },
      });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("[orders/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update order. Please try again." }, { status: 500 });
  }
}

// DELETE /api/orders/[id] - Delete an order (owner, Support, or Admin)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await params;

    // Support and Admin can delete any order, Heroes only their own
    const isPrivileged = user.role === "ADMIN" || user.role === "SUPPORT";
    const where = isPrivileged ? { id } : { id, userId: user.id };

    const existingOrder = await db.order.findFirst({ where });
    if (!existingOrder) {
      return NextResponse.json({ error: "This order no longer exists or belongs to another user." }, { status: 404 });
    }

    // Audit log before delete
    await logAudit({
      userId: user.id,
      action: "DELETE",
      entity: "Order",
      entityId: id,
      details: JSON.stringify({ orderId: existingOrder.orderId, by: user.role }),
    });

    // Notify hero if Support/Admin deleted their order
    if (isPrivileged && existingOrder.userId !== user.id) {
      await db.notification.create({
        data: {
          userId: existingOrder.userId,
          type: "system",
          title: "Order Deleted",
          message: `Your order #${existingOrder.orderId} (${existingOrder.customerName}) was deleted by ${user.role === "SUPPORT" ? "Support" : "Admin"}`,
        },
      });
    }

    await db.order.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[orders/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete order. Please try again." }, { status: 500 });
  }
}
