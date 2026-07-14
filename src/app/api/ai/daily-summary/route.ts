import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { generateDailySummary, isAiEnabled } from "@/lib/deepseek";

// Helper: format a Date in Malaysia timezone as YYYY-MM-DD
function formatDateMYT(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }); // en-CA gives YYYY-MM-DD
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enabled = await isAiEnabled();
  if (!enabled) return NextResponse.json({ error: "AI Assistant is currently disabled." }, { status: 403 });

  try {
    const today = formatDateMYT(new Date());
    const tomorrow = (() => {
      const d = new Date();
      const mytNow = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
      mytNow.setDate(mytNow.getDate() + 1);
      return formatDateMYT(mytNow);
    })();

    // Get today's orders
    const todayOrders = await db.order.findMany({
      where: { userId: user.id, scheduledDate: today },
    });

    const completedOrders = todayOrders.filter(o => o.status === "COMPLETED");
    const pendingOrders = todayOrders.filter(o => o.status === "PENDING");
    const scheduledOrders = todayOrders.filter(o => o.status === "SCHEDULED");
    const ordersWithNotes = todayOrders.filter(o => o.notes?.trim());

    // Get tomorrow's schedule
    const tomorrowOrders = await db.order.findMany({
      where: { userId: user.id, scheduledDate: tomorrow },
    });

    const totalPoints = completedOrders.reduce((sum, o) => sum + o.points, 0);

    const summary = await generateDailySummary({
      heroName: user.displayName || user.username,
      totalOrders: todayOrders.length,
      completedOrders: completedOrders.length,
      pendingOrders: pendingOrders.length,
      scheduledOrders: scheduledOrders.length,
      totalPoints,
      ordersWithNotes: ordersWithNotes.map(o => ({
        orderId: o.orderId,
        customerName: o.customerName,
        notes: o.notes || "",
        scheduledDate: o.scheduledDate,
        status: o.status,
      })),
      tomorrowSchedule: tomorrowOrders.map(o => ({
        orderId: o.orderId,
        customerName: o.customerName,
        address: o.address,
        city: o.city,
        scheduledDate: o.scheduledDate || "",
        notes: o.notes,
      })),
    });

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("[ai/daily-summary] error:", error);
    return NextResponse.json({ error: "Failed to generate daily summary." }, { status: 500 });
  }
}
