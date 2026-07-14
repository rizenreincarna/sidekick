import { db } from "./db";

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
}
