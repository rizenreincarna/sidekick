import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const suggestions = await db.aiAction.findMany({
      where: { userId: user.id, actionType: "ADD_ZONE_AREA", status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("[ai/zone-suggestions] error:", error);
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}
