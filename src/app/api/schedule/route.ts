import { autoSchedule } from "@/lib/scheduler";
import { requireAuth } from "@/lib/session";
import { NextResponse } from "next/server";

export async function POST() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const result = await autoSchedule(user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[schedule] POST error:", error);
    return NextResponse.json(
      { error: "Auto-scheduling failed. Please try again or schedule orders manually." },
      { status: 500 }
    );
  }
}
