import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// PATCH /api/users/[id] - Update user (Admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireAuth();
  if (!currentUser) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Access denied. Admin privileges required." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { role, isActive, isApproved, password, displayName } = body;

    const targetUser = await db.user.findUnique({ where: { id } });
    if (!targetUser) return NextResponse.json({ error: "User not found. They may have been deleted." }, { status: 404 });

    // Admin cannot deactivate or change their own role
    if (targetUser.id === currentUser.id) {
      if (role && role !== currentUser.role) {
        return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
      }
      if (isActive === false) {
        return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    const auditDetails: Record<string, unknown> = {};
    
    if (role && ["ADMIN", "HERO", "SUPPORT"].includes(role)) {
      updateData.role = role;
      auditDetails.oldRole = targetUser.role;
      auditDetails.newRole = role;
    }
    
    if (typeof isActive === "boolean") {
      updateData.isActive = isActive;
      auditDetails.isActive = isActive;
    }
    
    if (typeof isApproved === "boolean") {
      updateData.isApproved = isApproved;
      auditDetails.isApproved = isApproved;
    }
    
    if (password && password.length >= 12) {
      if (password.length > 100) {
        return NextResponse.json({ error: "Password must be 100 characters or less." }, { status: 400 });
      }
      updateData.password = await bcrypt.hash(password, 10);
      auditDetails.passwordChanged = true;
    }
    
    if (displayName !== undefined) {
      if (String(displayName).length > 100) {
        return NextResponse.json({ error: "Display name must be 100 characters or less." }, { status: 400 });
      }
      updateData.displayName = displayName;
      auditDetails.displayName = displayName;
    }

    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        isApproved: true,
        createdAt: true,
      },
    });

    // Audit log for user updates
    if (Object.keys(auditDetails).length > 0) {
      await logAudit({
        userId: currentUser.id,
        action: "UPDATE",
        entity: "User",
        entityId: id,
        details: JSON.stringify(auditDetails),
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[users/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update user. Please try again." }, { status: 500 });
  }
}

// DELETE /api/users/[id] - Delete user (Admin only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireAuth();
  if (!currentUser) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Access denied. Admin privileges required." }, { status: 403 });

  try {
    const { id } = await params;

    const targetUser = await db.user.findUnique({ where: { id } });
    if (!targetUser) return NextResponse.json({ error: "User not found. They may have been deleted." }, { status: 404 });

    // Admin cannot delete themselves
    if (targetUser.id === currentUser.id) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
    }

    // Audit log before delete
    await logAudit({
      userId: currentUser.id,
      action: "DELETE",
      entity: "User",
      entityId: id,
      details: JSON.stringify({ username: targetUser.username, role: targetUser.role }),
    });

    // Admin CAN delete other admins
    await db.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[users/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete user. Please try again." }, { status: 500 });
  }
}
