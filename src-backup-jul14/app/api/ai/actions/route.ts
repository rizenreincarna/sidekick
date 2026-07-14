import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const where = user.role === "ADMIN"
      ? { status: "PENDING" as const }
      : { userId: user.id, status: "PENDING" as const };

    const actions = await db.aiAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, username: true, displayName: true, role: true } },
      },
    });

    return NextResponse.json(actions);
  } catch (error) {
    console.error("[ai/actions] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch actions." }, { status: 500 });
  }
}
