import { db } from "./db";
import { MAX_DAILY_POINTS } from "./zones";
import { generateDailySummary, isAiEnabled } from "./deepseek";
import { sendPushToUser, notifySystemNotification } from "./fcm";

// ============ DAILY SUMMARY BROADCAST ============
// Generates a personalized daily summary for every active HERO and sends it as a
// push notification (so the Android app alerts the user at ~7am MYT). The summary
// is also stored as a chat message in their AI conversation so it's visible in-app.
//
// Scheduling is handled by a lightweight interval that checks every minute whether
// it's 7:00 MYT; if so, it runs once and guards against re-running the same day.

let lastRunDate = "";

function formatDateMYT(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

/** Run the broadcast for all active heroes. Idempotent per day via lastRunDate. */
export async function broadcastDailySummaries(): Promise<{ sent: number; failed: number }> {
  const now = new Date();
  const todayMYT = formatDateMYT(now);
  if (lastRunDate === todayMYT) {
    return { sent: 0, failed: 0 }; // already ran today
  }
  lastRunDate = todayMYT;

  const enabled = await isAiEnabled();
  if (!enabled) return { sent: 0, failed: 0 };

  const tomorrow = (() => {
    const d = new Date();
    const mytNow = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
    mytNow.setDate(mytNow.getDate() + 1);
    return formatDateMYT(mytNow);
  })();

  const heroes = await db.user.findMany({
    where: { role: "HERO", isActive: true },
    select: { id: true, username: true, displayName: true },
  });

  let sent = 0;
  let failed = 0;

  for (const hero of heroes) {
    try {
      const todayOrders = await db.order.findMany({ where: { userId: hero.id, scheduledDate: todayMYT } });
      const completedOrders = todayOrders.filter(o => o.status === "COMPLETED");
      const pendingOrders = todayOrders.filter(o => o.status === "PENDING");
      const scheduledOrders = todayOrders.filter(o => o.status === "SCHEDULED");
      const ordersWithNotes = todayOrders.filter(o => o.notes?.trim());
      const tomorrowOrders = await db.order.findMany({ where: { userId: hero.id, scheduledDate: tomorrow } });
      const totalPoints = completedOrders.reduce((sum, o) => sum + o.points, 0);

      // Skip heroes with nothing today AND nothing tomorrow (avoid pointless 7am pings)
      if (todayOrders.length === 0 && tomorrowOrders.length === 0) continue;

      const summary = await generateDailySummary({
        heroName: hero.displayName || hero.username,
        totalOrders: todayOrders.length,
        completedOrders: completedOrders.length,
        pendingOrders: pendingOrders.length,
        scheduledOrders: scheduledOrders.length,
        totalPoints,
        maxDailyPoints: MAX_DAILY_POINTS,
        ordersWithNotes: ordersWithNotes.map(o => ({
          orderId: o.orderId, customerName: o.customerName, notes: o.notes || "",
          scheduledDate: o.scheduledDate, status: o.status,
        })),
        todaySchedule: todayOrders.map(o => ({
          orderId: o.orderId, customerName: o.customerName, address: o.address, city: o.city,
          zone: o.zone, size: o.size, points: o.points, isOffice: o.isOffice,
          isEvent: o.isEvent, isErthbox: o.isErthbox, scheduledDate: o.scheduledDate || "",
          status: o.status, notes: o.notes,
        })),
        tomorrowSchedule: tomorrowOrders.map(o => ({
          orderId: o.orderId, customerName: o.customerName, address: o.address, city: o.city,
          scheduledDate: o.scheduledDate || "", notes: o.notes,
        })),
      });

      // Send as a push notification (triggers the Android app alert).
      const preview = summary.slice(0, 200);
      await sendPushToUser(hero.id, {
        title: "☀️ Your daily summary is ready",
        body: preview,
        channel: "system",
        actionUrl: "/?tab=chat",
      });

      // Also create an in-app notification so it shows in the bell + poll fallback.
      await notifySystemNotification(hero.id, "Daily summary ready", preview);

      sent++;
    } catch (e) {
      console.error("[daily-broadcast] failed for", hero.username, e);
      failed++;
    }
  }

  console.log(`[daily-broadcast] sent=${sent} failed=${failed} for ${todayMYT}`);
  return { sent, failed };
}

/** Starts a 60s interval that triggers the broadcast at 7:00 MYT each day. */
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startDailySummaryScheduler(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    const now = new Date();
    const mytTime = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" });
    if (mytTime === "07:00") {
      broadcastDailySummaries().catch((e) => console.error("[daily-broadcast] run error:", e));
    }
  }, 60_000);
}