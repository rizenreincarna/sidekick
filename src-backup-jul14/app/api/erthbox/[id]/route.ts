import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/erthbox/[id] - Update an ERTHBOX location
// Owner, Admin, or Support can update
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    // Find location (not filtered by userId - admin/support can edit any)
    const existing = await db.erthboxLocation.findFirst({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "ERTHBOX location not found." }, { status: 404 });
    }
    // Only owner, admin, or support can update
    if (existing.userId !== user.id && user.role !== "ADMIN" && user.role !== "SUPPORT") {
      return NextResponse.json({ error: "You can only edit your own ERTHBOX locations." }, { status: 403 });
    }

    const { name, address, city, picName, picPhone, notes, isActive } = body;

    // Build update data with only provided fields
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (address !== undefined) updateData.address = String(address).trim();
    if (city !== undefined) updateData.city = String(city).trim();
    if (picName !== undefined) updateData.picName = String(picName).trim();
    if (picPhone !== undefined) updateData.picPhone = String(picPhone).trim();
    if (notes !== undefined) updateData.notes = notes ? String(notes).trim() : null;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    // Input validation
    if (updateData.name && String(updateData.name).length > 200) return NextResponse.json({ error: "Name must be 200 characters or less" }, { status: 400 });
    if (updateData.address && String(updateData.address).length > 500) return NextResponse.json({ error: "Address must be 500 characters or less" }, { status: 400 });
    if (updateData.city && String(updateData.city).length > 100) return NextResponse.json({ error: "City must be 100 characters or less" }, { status: 400 });
    if (updateData.picName && String(updateData.picName).length > 200) return NextResponse.json({ error: "PIC name must be 200 characters or less" }, { status: 400 });
    if (updateData.picPhone && String(updateData.picPhone).length > 30) return NextResponse.json({ error: "PIC phone must be 30 characters or less" }, { status: 400 });
    if (updateData.notes && String(updateData.notes).length > 1000) return NextResponse.json({ error: "Notes must be 1000 characters or less" }, { status: 400 });

    const updated = await db.erthboxLocation.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "ErthboxLocation",
      entityId: id,
      details: JSON.stringify({ changes: Object.keys(updateData) }),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[erthbox/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update ERTHBOX location." }, { status: 500 });
  }
}

// DELETE /api/erthbox/[id] - Delete an ERTHBOX location
// Owner, Admin, or Support can delete
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await params;

    // Find location (not filtered by userId - admin/support can delete any)
    const existing = await db.erthboxLocation.findFirst({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "ERTHBOX location not found." }, { status: 404 });
    }
    // Only owner, admin, or support can delete
    if (existing.userId !== user.id && user.role !== "ADMIN" && user.role !== "SUPPORT") {
      return NextResponse.json({ error: "You can only delete your own ERTHBOX locations." }, { status: 403 });
    }

    // Orphan check: prevent deletion if orders reference this location
    const referencingOrders = await db.order.count({
      where: { erthboxLocationId: id },
    });
    if (referencingOrders > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${referencingOrders} order(s) reference this ERTHBOX location. Remove or reassign them first.` },
        { status: 400 }
      );
    }

    await db.erthboxLocation.delete({ where: { id } });

    await logAudit({
      userId: user.id,
      action: "DELETE",
      entity: "ErthboxLocation",
      entityId: id,
      details: JSON.stringify({ name: existing.name }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[erthbox/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete ERTHBOX location." }, { status: 500 });
  }
}
