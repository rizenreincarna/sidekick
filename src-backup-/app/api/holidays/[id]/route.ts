import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/holidays/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { id } = await params;

    const existing = await db.holiday.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Holiday not found or does not belong to you." }, { status: 404 });
    }

    await db.holiday.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[holidays/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete holiday." }, { status: 500 });
  }
}
