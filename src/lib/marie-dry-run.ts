import { db } from "./db";
import { generateUserIsolatedDryRunPlans } from "./marie-operations";

export async function computeMarieDryRun(now = new Date()) {
  const [orders, activeOrders, holidays, offDays, eventOrders] = await Promise.all([
    db.order.findMany({
      where: { status: "PENDING" },
      select: { id: true, orderId: true, userId: true, status: true, phone: true, points: true, zone: true, isOffice: true, isEvent: true, isErthbox: true, addressVerified: true, latitude: true, longitude: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.order.findMany({
      where: { status: { in: ["SCHEDULED", "CONTACTED", "BOOKED"] }, scheduledDate: { not: null } },
      select: { userId: true, scheduledDate: true, points: true, zone: true, latitude: true, longitude: true },
    }),
    db.holiday.findMany({ select: { userId: true, date: true } }),
    db.offDay.findMany({ select: { userId: true, date: true } }),
    db.order.findMany({ where: { isEvent: true, scheduledDate: { not: null } }, select: { userId: true, scheduledDate: true } }),
  ]);

  const blockedDates = [
    ...holidays.map(item => ({ userId: item.userId, date: item.date, kind: "HOLIDAY" as const })),
    ...offDays.map(item => ({ userId: item.userId, date: item.date, kind: "OFF_DAY" as const })),
    ...eventOrders.flatMap(item => item.scheduledDate ? [{ userId: item.userId, date: item.scheduledDate, kind: "EVENT" as const }] : []),
  ];
  const existingLoads = activeOrders
    .filter((order): order is typeof order & { scheduledDate: string } => order.scheduledDate !== null)
    .map(order => ({ userId: order.userId, date: order.scheduledDate, points: order.points, zone: order.zone, latitude: order.latitude, longitude: order.longitude }));
  const plans = generateUserIsolatedDryRunPlans(orders, existingLoads, blockedDates, now);

  return {
    generatedAt: now.toISOString(),
    mode: "DRY_RUN" as const,
    mutated: false,
    piiIncluded: false,
    summary: {
      sourcePendingOrders: orders.length,
      truncated: false,
      evaluated: plans.length,
      proposed: plans.filter(plan => plan.action === "PROPOSE_SCHEDULE").length,
      held: plans.filter(plan => plan.action === "HOLD").length,
      capacityExceptions: plans.filter(plan => plan.capacity === "EXCEPTION").length,
    },
    plans,
    limitations: [
      "Foundational planner does not call geocoding, VROOM, OSRM, WAHA, Telegram, or the mutating scheduler.",
      "The read-only planner applies scheduler 110km/12km geographic constraints and existing scheduled coordinates; existing loads with missing coordinates use strict same-zone isolation.",
    ],
  };
}
