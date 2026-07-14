import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { broadcastDailySummaries } from "@/lib/daily-broadcast";

// POST /api/ai/daily-summary-broadcast — manually trigger the 7am daily-summary
// broadcast to all active heroes (admin only). Useful for testing.
export async function POST() {
  const { user, error } = await requireAdmin();
  if (error || !user) {
    return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error ? 403 : 401 });
  }
  try {
    const result = await broadcastDailySummaries();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[daily-summary-broadcast] error:", e);
    return NextResponse.json({ error: "Broadcast failed" }, { status: 500 });
  }
}