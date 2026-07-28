import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMarieConfig } from "@/lib/marie-config";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const { user, error } = await requireAdmin();
  if (!user) return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error === "Forbidden" ? 403 : 401 });
  const [config, pendingJobs, sendingJobs, reconciliationJobs, failedJobs, activeConversations, escalations, holds] = await Promise.all([
    getMarieConfig(),
    db.automationJob.count({ where: { state: "PENDING" } }),
    db.automationJob.count({ where: { state: "SENDING" } }),
    db.automationJob.count({ where: { state: "RECONCILIATION_REQUIRED" } }),
    db.automationJob.count({ where: { state: { in: ["FAILED", "DEAD_LETTER"] } } }),
    db.customerConversation.count({ where: { state: { in: ["ACTIVE", "PAUSED", "ESCALATED"] } } }),
    db.customerEscalation.count({ where: { state: "OPEN" } }),
    db.orderHold.count({ where: { state: "ACTIVE" } }),
  ]);
  return NextResponse.json({
    enabled: config.enabled,
    mode: config.mode,
    operational: false,
    externalCallsImplemented: false,
    waha: { configured: Boolean(config.wahaSessionName), health: "NOT_CHECKED" },
    telegramOwnerConfigured: Boolean(config.telegramOwnerId),
    queues: { pendingJobs, sendingJobs, reconciliationJobs, failedJobs },
    activeConversations,
    openEscalations: escalations,
    activeHolds: holds,
  });
}
