import { NextResponse } from "next/server";
import { computeMarieDryRun } from "@/lib/marie-dry-run";
import { requireAdmin } from "@/lib/session";

export async function POST() {
  const { user, error } = await requireAdmin();
  if (!user) return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error === "Forbidden" ? 403 : 401 });
  return NextResponse.json(await computeMarieDryRun());
}
