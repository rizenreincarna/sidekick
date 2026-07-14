// ERTHBOX utility functions for ERTH e-waste pickup app
// Handles auto-generation of ERTHBOX-XXX IDs and ERTHBOX location management

import { db } from "./db";

/**
 * Auto-generate the next ERTHBOX ID in the format "ERTHBOX-001", "ERTHBOX-002", etc.
 * Increments based on existing ERTHBOX orders in the database.
 */
export async function generateErthboxId(): Promise<string> {
  const result = await db.order.findFirst({
    where: { isErthbox: true },
    orderBy: { orderId: "desc" },
    select: { orderId: true },
  });
  const maxNum = result ? parseInt(result.orderId.replace("ERTHBOX-", ""), 10) : 0;

  const nextNum = maxNum + 1;
  return `ERTHBOX-${String(nextNum).padStart(3, "0")}`;
}

/**
 * Get all active ERTHBOX locations for a user
 */
export async function getActiveErthboxLocations(userId: string) {
  return db.erthboxLocation.findMany({
    where: { userId, isActive: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Get an ERTHBOX location by ID, verifying ownership
 */
export async function getErthboxLocation(id: string, userId: string) {
  return db.erthboxLocation.findFirst({
    where: { id, userId },
  });
}
