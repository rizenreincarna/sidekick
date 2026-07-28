import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";

export async function POST() {
  const { user, error } = await requireAdmin();
  if (!user) return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error === "Forbidden" ? 403 : 401 });
  return NextResponse.json({ mode: "DRY_RUN", mutated: false, reconciled: 0, reason: "Reconciliation is intentionally a no-op until provider identity and webhook hardening are approved." });
}
