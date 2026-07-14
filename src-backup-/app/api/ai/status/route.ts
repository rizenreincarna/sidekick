import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { getAiStatus } from "@/lib/deepseek";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const status = await getAiStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("[ai/status] error:", error);
    return NextResponse.json({ error: "Failed to check AI status." }, { status: 500 });
  }
}
