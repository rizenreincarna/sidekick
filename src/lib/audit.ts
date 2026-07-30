import { db } from "./db";
import { recordMemory, type EventType } from "./engraphis-bridge";

export async function logAudit(params: {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
}) {
  try {
    await db.auditLog.create({ data: params });
  } catch {
    // Silently fail - audit logging should never break the main flow
  }

  // Mirror to Engraphis for durable cross-session recall.
  // Fire-and-forget: recordMemory swallows all errors.
  const type = mapAuditToEventType(params.action, params.entity);
  let parsedDetails: Record<string, unknown> = {};
  try {
    parsedDetails = params.details ? JSON.parse(params.details) : {};
  } catch {
    parsedDetails = { raw: params.details };
  }
  recordMemory({
    type,
    summary: `${params.action} ${params.entity}${params.entityId ? ` ${params.entityId}` : ""}`,
    details: { ...parsedDetails, userId: params.userId, entity: params.entity, action: params.action },
  }).catch(() => null);
}

function mapAuditToEventType(action: string, entity: string): EventType {
  if (entity === "Order" || entity === "CustomerConversation") {
    if (action === "CREATE") return "ORDER_CREATED";
    if (action === "UPDATE") {
      const lower = action.toLowerCase();
      if (lower.includes("cancel")) return "ORDER_CANCELED";
      if (lower.includes("complete")) return "ORDER_COMPLETED";
      if (lower.includes("schedule")) return "ORDER_SCHEDULED";
      return "ORDER_UPDATED";
    }
  }
  if (entity === "Setting" || entity === "MarieAutomationConfig") return "SETTINGS_UPDATED";
  if (entity === "User") return action === "CREATE" ? "USER_CREATED" : "USER_UPDATED";
  return "SYSTEM_EVENT";
}
