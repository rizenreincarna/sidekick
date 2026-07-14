import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error || !user) return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error ? 403 : 401 });

  try {
    const flags = await db.aiFlag.findMany({
      where: { isResolved: false },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, username: true, displayName: true, role: true } },
      },
    });

    return NextResponse.json(flags);
  } catch (error) {
    console.error("[ai/flags] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch flags." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error || !user) return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error ? 403 : 401 });

  try {
    const { flagId } = await request.json() as { flagId: string };
    if (!flagId) return NextResponse.json({ error: "Flag ID is required." }, { status: 400 });

    await db.aiFlag.update({
      where: { id: flagId },
      data: { isResolved: true, resolvedBy: user.id, resolvedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ai/flags] PUT error:", error);
    return NextResponse.json({ error: "Failed to resolve flag." }, { status: 500 });
  }
}
