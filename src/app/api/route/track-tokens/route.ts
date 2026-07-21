import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";

// GET /api/route/track-tokens?date=YYYY-MM-DD
// Returns all tracking tokens for the hero's route on the given date
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const date = new URL(req.url).searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Valid date required" }, { status: 400 });
    }

    const links = await db.trackingLink.findMany({
      where: { userId: user.id, routeDate: date },
      select: {
        orderId: true,
        token: true,
        completedAt: true,
        customerName: true,
      },
    });

    const tokens: Record<string, { token: string; completed: boolean }> = {};
    for (const link of links) {
      tokens[link.orderId] = {
        token: link.token,
        completed: !!link.completedAt,
      };
    }

    return NextResponse.json({ tokens });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[track-tokens] GET error:", msg);
    return NextResponse.json({ error: "Failed to fetch tracking tokens" }, { status: 500 });
  }
}