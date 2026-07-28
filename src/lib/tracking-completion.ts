import type { Prisma } from "@prisma/client";

export class TrackingCompletionRaceError extends Error {}

export async function completeTrackingAtomically(tx: Prisma.TransactionClient, input: { token: string; userId: string; orderId: string; expectedStatus: string; completedAt: Date }) {
  const changed = await tx.order.updateMany({ where: { orderId: input.orderId, userId: input.userId, status: input.expectedStatus }, data: { status: "COMPLETED" } });
  if (changed.count !== 1) throw new TrackingCompletionRaceError("Order changed while completing pickup");
  const link = await tx.trackingLink.updateMany({ where: { token: input.token, userId: input.userId, completedAt: null }, data: { completedAt: input.completedAt } });
  if (link.count !== 1) throw new TrackingCompletionRaceError("Tracking link changed while completing pickup");
}

export async function undoTrackingAtomically(tx: Prisma.TransactionClient, input: { token: string; userId: string; orderId: string }) {
  const changed = await tx.order.updateMany({ where: { orderId: input.orderId, userId: input.userId, status: "COMPLETED" }, data: { status: "BOOKED" } });
  if (changed.count !== 1) throw new TrackingCompletionRaceError("Order changed while undoing pickup completion");
  const link = await tx.trackingLink.updateMany({ where: { token: input.token, userId: input.userId, completedAt: { not: null } }, data: { completedAt: null } });
  if (link.count !== 1) throw new TrackingCompletionRaceError("Tracking link changed while undoing pickup completion");
}
