import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/offdays/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await params;
    const existing = await db.offDay.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Off day not found or does not belong to you." }, { status: 404 });

    await db.offDay.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[offdays/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete off day." }, { status: 500 });
  }
}
