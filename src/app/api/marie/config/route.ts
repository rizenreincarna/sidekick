import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { getMarieConfig, marieConfigSchema } from "@/lib/marie-config";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

function unauthorized(error: "Unauthorized" | "Forbidden" | null) {
  return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error === "Forbidden" ? 403 : 401 });
}

export async function GET() {
  const { user, error } = await requireAdmin();
  if (!user) return unauthorized(error);
  return NextResponse.json(await getMarieConfig());
}

export async function PUT(request: NextRequest) {
  const { user, error } = await requireAdmin();
  if (!user) return unauthorized(error);
  try {
    const config = marieConfigSchema.parse(await request.json());
    await db.marieAutomationConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...config, pilotAllowlist: JSON.stringify(config.pilotAllowlist) },
      update: { ...config, pilotAllowlist: JSON.stringify(config.pilotAllowlist) },
    });
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      entity: "MarieAutomationConfig",
      entityId: "default",
      details: JSON.stringify({
        source: "ADMIN_API",
        enabled: config.enabled,
        inboundProcessingEnabled: config.inboundProcessingEnabled,
        mode: config.mode,
        contactHours: `${config.contactStartHour}-${config.contactEndHour}`,
        limits: { run: config.maxMessagesPerRun, hour: config.maxMessagesPerHour, day: config.maxMessagesPerDay, retries: config.maxRetries },
        wahaSessionConfigured: Boolean(config.wahaSessionName),
        telegramOwnerConfigured: Boolean(config.telegramOwnerId),
        pilotAllowlistCount: config.pilotAllowlist.length,
      }),
    });
    return NextResponse.json(config);
  } catch (cause) {
    if (cause instanceof ZodError) return NextResponse.json({ error: "Invalid Marie configuration", issues: cause.issues }, { status: 400 });
    console.error("[marie/config] PUT failed", cause instanceof Error ? cause.message : "unknown error");
    return NextResponse.json({ error: "Failed to save Marie configuration" }, { status: 500 });
  }
}
