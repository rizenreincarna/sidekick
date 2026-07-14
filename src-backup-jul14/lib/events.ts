// Event utility functions for ERTH e-waste pickup app
// Handles auto-generation of EVENT-XXX IDs

import { db } from "./db";

/**
 * Auto-generate the next event ID in the format "EVENT-001", "EVENT-002", etc.
 * Increments based on existing event orders in the database.
 */
export async function generateEventId(): Promise<string> {
  const eventOrders = await db.order.findMany({
    where: { isEvent: true },
    select: { orderId: true },
  });

  let maxNum = 0;
  for (const order of eventOrders) {
    const match = order.orderId.match(/^EVENT-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `EVENT-${String(nextNum).padStart(3, "0")}`;
}

/** Valid event types */
export const EVENT_TYPES = ["ROADSHOW", "EWASTE_COLLECTION", "OTHER"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Validate if a string is a valid event type
 */
export function isValidEventType(value: string): value is EventType {
  return EVENT_TYPES.includes(value as EventType);
}
