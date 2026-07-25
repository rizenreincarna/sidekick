import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { chatWithDeepSeek, checkForDangerousContent, parseAiActions, isAiEnabled } from "@/lib/deepseek";

// Helper: format a Date in Malaysia timezone as YYYY-MM-DD
function formatDateMYT(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }); // en-CA gives YYYY-MM-DD
}

// Helper: get day-of-week name for a date in Malaysia timezone
function getDayNameMYT(d: Date): string {
  return d.toLocaleDateString("en-MY", { weekday: "long", timeZone: "Asia/Kuala_Lumpur" });
}

// Helper: get time string in Malaysia timezone
function getTimeMYT(d: Date): string {
  return d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" });
}

// Helper: get Malaysia Time (UTC+8) formatted string
function getMalaysiaTime(): { dateStr: string; timeStr: string; dayName: string; fullStr: string } {
  const now = new Date();
  const dateStr = formatDateMYT(now);
  const timeStr = getTimeMYT(now);
  const dayName = getDayNameMYT(now);

  return {
    dateStr,
    timeStr,
    dayName,
    fullStr: `${dayName}, ${dateStr} ${timeStr} MYT (UTC+8)`,
  };
}

// Helper: get date N days from now in YYYY-MM-DD (Malaysia timezone)
function daysFromNow(n: number): string {
  const d = new Date();
  // Add days to the current date in Malaysia timezone
  const mytNow = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
  mytNow.setDate(mytNow.getDate() + n);
  return formatDateMYT(mytNow);
}

// Helper: generate a reference calendar for N days starting from today (Malaysia timezone)
function generateCalendar(days: number): string {
  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    const mytDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur" }));
    mytDate.setDate(mytDate.getDate() + i);
    const dateStr = formatDateMYT(mytDate);
    const dayName = mytDate.toLocaleDateString("en-MY", { weekday: "short", timeZone: "Asia/Kuala_Lumpur" });
    const isWeekend = dayName === "Sat" || dayName === "Sun";
    lines.push(`${dateStr} ${dayName}${isWeekend ? " (weekend)" : ""}`);
  }
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enabled = await isAiEnabled();
  if (!enabled) return NextResponse.json({ error: "AI Assistant is currently disabled." }, { status: 403 });

  try {
    const { message, conversationId } = await request.json() as { message: string; conversationId?: string };
    if (!message?.trim()) return NextResponse.json({ error: "Message is required." }, { status: 400 });

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const conv = await db.aiConversation.create({
        data: { userId: user.id, title: message.slice(0, 50) + (message.length > 50 ? "..." : "") },
      });
      convId = conv.id;
    } else {
      // Verify ownership
      const conv = await db.aiConversation.findUnique({ where: { id: convId } });
      if (!conv || (conv.userId !== user.id && user.role !== "ADMIN")) {
        return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
      }
    }

    // Save user message
    await db.aiMessage.create({
      data: { conversationId: convId, role: "user", content: message },
    });

    // Check for dangerous content
    let flagged = false;
    const flagResult = await checkForDangerousContent(message);
    if (flagResult.shouldFlag) {
      flagged = true;
      await db.aiFlag.create({
        data: {
          userId: user.id,
          conversationId: convId,
          messageContent: message,
          reason: flagResult.reason,
          severity: flagResult.severity,
        },
      });
    }

    // Get conversation history
    const history = await db.aiMessage.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    // ============ BUILD RICH CONTEXT ============
    const currentTime = getMalaysiaTime();
    const today = currentTime.dateStr;
    const tomorrow = daysFromNow(1);
    const nextWeekEnd = daysFromNow(7);
    const twoWeeksEnd = daysFromNow(14);
    const calendar14Days = generateCalendar(14);

    // Get user orders with targeted queries to prevent memory bombs for power users
    const orderSelect = {
      orderId: true, customerName: true, status: true, city: true, zone: true,
      notes: true, scheduledDate: true, size: true, points: true,
      isEvent: true, eventType: true, isErthbox: true, isOffice: true,
      address: true, createdAt: true,
    };

    const [
      pendingOrders,
      scheduledFutureOrders,
      todayOrders,
      thisWeekOrders,
      upcomingEventOrders,
      activeErthboxOrders,
      confirmedOrders,
      bookedOrders,
    ] = await Promise.all([
      // Pending: status PENDING, take 20
      db.order.findMany({
        where: { userId: user.id, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: orderSelect,
        take: 20,
      }),
      // Scheduled: future scheduledDate, take 20
      db.order.findMany({
        where: { userId: user.id, status: "SCHEDULED", scheduledDate: { gte: today } },
        orderBy: { scheduledDate: "asc" },
        select: orderSelect,
        take: 20,
      }),
      // Today: scheduledDate = today
      db.order.findMany({
        where: { userId: user.id, scheduledDate: today },
        orderBy: { createdAt: "desc" },
        select: orderSelect,
      }),
      // This week: scheduledDate in current week
      db.order.findMany({
        where: { userId: user.id, scheduledDate: { gte: today, lte: nextWeekEnd } },
        orderBy: { scheduledDate: "asc" },
        select: orderSelect,
      }),
      // Events: isEvent true with future date, take 10
      db.order.findMany({
        where: { userId: user.id, isEvent: true, scheduledDate: { gte: today } },
        orderBy: { scheduledDate: "asc" },
        select: orderSelect,
        take: 10,
      }),
      // ERTHBOX: isErthbox true and not COMPLETED, take 10
      db.order.findMany({
        where: { userId: user.id, isErthbox: true, status: { not: "COMPLETED" } },
        orderBy: { createdAt: "desc" },
        select: orderSelect,
        take: 10,
      }),
      // Confirmed orders
      db.order.findMany({
        where: { userId: user.id, status: "CONFIRMED" },
        orderBy: { createdAt: "desc" },
        select: orderSelect,
        take: 20,
      }),
      // Booked orders
      db.order.findMany({
        where: { userId: user.id, status: "BOOKED" },
        orderBy: { createdAt: "desc" },
        select: orderSelect,
        take: 20,
      }),
    ]);

    // Compute summary counts (approximate from targeted queries)
    const completedCount = await db.order.count({ where: { userId: user.id, status: "COMPLETED" } });
    const eventCount = await db.order.count({ where: { userId: user.id, isEvent: true } });
    const erthboxCount = await db.order.count({ where: { userId: user.id, isErthbox: true } });
    const totalCount = await db.order.count({ where: { userId: user.id } });

    // Merge today orders with scheduled for context display
    const allOrders = [...pendingOrders, ...scheduledFutureOrders, ...todayOrders, ...confirmedOrders, ...bookedOrders];
    // Deduplicate by id
    const seenIds = new Set<string>();
    const dedupedOrders = allOrders.filter(o => {
      if (seenIds.has(o.orderId)) return false;
      seenIds.add(o.orderId);
      return true;
    });

    // Get ERTHBOX locations for reference (universal — all active locations, not just user's own)
    const erthboxLocations = await db.erthboxLocation.findMany({
      where: { isActive: true },
      select: { id: true, name: true, address: true, city: true, picName: true, picPhone: true, notes: true, userId: true },
    });

    // Get upcoming holidays and OFF days
    const upcomingHolidays = await db.holiday.findMany({
      where: { userId: user.id, date: { gte: today } },
      orderBy: { date: "asc" },
      take: 10,
    });
    const upcomingOffDays = await db.offDay.findMany({
      where: { userId: user.id, date: { gte: today } },
      orderBy: { date: "asc" },
      take: 10,
    });

    // ---- Categorize orders for context (already fetched via targeted queries) ----
    // Use dedupedOrders for merged display, targeted query results for specific sections
    const todayPoints = todayOrders.reduce((sum, o) => sum + (o.points || 0), 0);

    // Tomorrow's scheduled orders (from thisWeekOrders)
    const tomorrowOrders = thisWeekOrders.filter(o => o.scheduledDate === tomorrow);
    const tomorrowPoints = tomorrowOrders.reduce((sum, o) => sum + (o.points || 0), 0);

    // Group this week's orders by date for schedule view
    const weekByDate: Record<string, Array<{ orderId: string; customerName: string; city: string; zone: number; size: string; points: number; status: string; isEvent: boolean; eventType: string | null; isErthbox: boolean; notes: string | null }>> = {};
    for (const o of thisWeekOrders) {
      const date = o.scheduledDate!;
      if (!date) continue;
      if (!weekByDate[date]) weekByDate[date] = [];
      weekByDate[date].push({
        orderId: o.orderId, customerName: o.customerName, city: o.city,
        zone: o.zone, size: o.size, points: o.points || 0, status: o.status,
        isEvent: o.isEvent, eventType: o.eventType, isErthbox: o.isErthbox, notes: o.notes,
      });
    }

    // Group by city for location queries (from dedupedOrders)
    const cityGroups: Record<string, number> = {};
    for (const o of dedupedOrders.filter(o => o.status !== "COMPLETED")) {
      const city = o.city || "Unknown";
      cityGroups[city] = (cityGroups[city] || 0) + 1;
    }

    // Build order context string (compact but comprehensive)
    const formatOrder = (o: typeof dedupedOrders[0]) => {
      let label = `#${o.orderId} ${o.customerName} [${o.status}]`;
      if (o.isEvent) label += ` 🎪${o.eventType || "EVENT"}`;
      if (o.isErthbox) label += " 📦ERTHBOX";
      label += ` ${o.city} Z${o.zone} ${o.size}(${o.points}pt)`;
      if (o.scheduledDate) label += ` 📅${o.scheduledDate}`;
      if (o.isOffice) label += " [OFFICE]";
      if (o.notes) label += ` 💬${o.notes.slice(0, 60)}`;
      return label;
    };

    // Build weekly schedule context with day-of-week names
    const weekScheduleLines: string[] = [];
    for (const [date, orders] of Object.entries(weekByDate).sort()) {
      const dayPts = orders.reduce((s, o) => s + o.points, 0);
      const isOffDay = upcomingOffDays.some(od => od.date === date);
      const isHoliday = upcomingHolidays.some(h => h.date === date);
      // Calculate day-of-week from the date string
      const dateObj = new Date(date + "T00:00:00"); // parse as local to avoid TZ issues
      const dayOfWeek = dateObj.toLocaleDateString("en-MY", { weekday: "short" });
      let dayLabel = `📅 ${date} (${dayOfWeek})`;
      if (isOffDay) dayLabel += " [OFF DAY]";
      if (isHoliday) dayLabel += " [HOLIDAY]";
      dayLabel += ` (${dayPts}/12pts, ${orders.length} orders)`;
      weekScheduleLines.push(dayLabel);
      for (const o of orders) {
        let line = `  • #${o.orderId} ${o.customerName} ${o.city} Z${o.zone}`;
        if (o.isEvent) line += ` 🎪${o.eventType || "EVENT"}`;
        if (o.isErthbox) line += " 📦ERTHBOX";
        line += ` ${o.size}(${o.points}pt) [${o.status}]`;
        if (o.notes) line += ` 💬${o.notes.slice(0, 40)}`;
        weekScheduleLines.push(line);
      }
    }

    // Build ERTHBOX locations context (include full ID for action blocks)
    const erthboxLocLines = erthboxLocations.map(l =>
      `• ID:${l.id} | ${l.name} (${l.city}) — PIC: ${l.picName} ${l.picPhone}${l.notes ? ` — ${l.notes.slice(0, 60)}` : ""}`
    );

    // Build comprehensive user context
    let userContext = `=== CURRENT TIME (MALAYSIA, UTC+8) ===
${currentTime.fullStr}
Today: ${today} (${currentTime.dayName})
Tomorrow: ${tomorrow}
Next 7 days: ${today} to ${nextWeekEnd}

=== REFERENCE CALENDAR (next 14 days, Malaysia timezone) ===
IMPORTANT: Use this calendar to determine the correct day-of-week for any date. NEVER calculate days yourself — refer to this table.
${calendar14Days}

=== USER INFO ===
Name: ${user.displayName || user.username}
Role: ${user.role}

=== ORDER SUMMARY ===
Total orders: ${totalCount}
• Pending: ${pendingOrders.length}${pendingOrders.length >= 20 ? "+" : ""}
• Scheduled: ${scheduledFutureOrders.length}${scheduledFutureOrders.length >= 20 ? "+" : ""}
• Confirmed: ${confirmedOrders.length}${confirmedOrders.length >= 20 ? "+" : ""}
• Booked: ${bookedOrders.length}${bookedOrders.length >= 20 ? "+" : ""}
• Completed: ${completedCount}
• Events: ${eventCount}
• ERTHBOX: ${erthboxCount}

=== TODAY (${today}) ===
${todayOrders.length > 0
  ? todayOrders.map(o => `• ${formatOrder(o)}`).join("\n")
  : "No orders scheduled today"}
Points: ${todayPoints}/12

=== TOMORROW (${tomorrow}) ===
${tomorrowOrders.length > 0
  ? tomorrowOrders.map(o => `• ${formatOrder(o)}`).join("\n")
  : "No orders scheduled tomorrow"}
Points: ${tomorrowPoints}/12

=== THIS WEEK'S SCHEDULE (${today} to ${nextWeekEnd}) ===
${weekScheduleLines.length > 0
  ? weekScheduleLines.join("\n")
  : "No orders scheduled this week"}

=== PENDING ORDERS (need scheduling) ===
${pendingOrders.length > 0
  ? pendingOrders.slice(0, 15).map(o => `• ${formatOrder(o)}`).join("\n") + (pendingOrders.length > 15 ? `\n... +${pendingOrders.length - 15} more pending` : "")
  : "No pending orders"}

=== UPCOMING EVENTS ===
${upcomingEventOrders.length > 0
  ? upcomingEventOrders.map(o => `• ${formatOrder(o)}`).join("\n")
  : "No upcoming events"}

=== ERTHBOX ORDERS ===
${activeErthboxOrders.length > 0
  ? activeErthboxOrders.slice(0, 10).map(o => `• ${formatOrder(o)}`).join("\n")
  : "No active ERTHBOX orders"}

=== ERTHBOX LOCATIONS (universal — use the ID: field for CREATE_ERTHBOX actions) ===
${erthboxLocLines.length > 0
  ? erthboxLocLines.join("\n")
  : "No ERTHBOX locations configured"}

=== CITY DISTRIBUTION (active orders) ===
${Object.entries(cityGroups).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([city, count]) => `• ${city}: ${count} orders`).join("\n") || "No active orders"}

=== UPCOMING HOLIDAYS ===
${upcomingHolidays.length > 0
  ? upcomingHolidays.map(h => `• ${h.date} — ${h.name}`).join("\n")
  : "No upcoming holidays"}

=== UPCOMING OFF DAYS ===
${upcomingOffDays.length > 0
  ? upcomingOffDays.map(d => `• ${d.date} — ${d.reason || "OFF"}`).join("\n")
  : "No upcoming OFF days"}

=== RECENT ORDERS (last 10) ===
${dedupedOrders.slice(0, 10).map(o => `• ${formatOrder(o)}`).join("\n") || "No orders"}`;

    // ============ SUPPORT/ADMIN: CROSS-HERO CONTEXT ============
    if (user.role === "SUPPORT" || user.role === "ADMIN") {
      const heroes = await db.user.findMany({
        where: { role: "HERO", isActive: true },
        select: {
          id: true, username: true, displayName: true, lastLoginAt: true,
          orders: {
            where: { status: { in: ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED"] } },
            select: { id: true, orderId: true, status: true, points: true, scheduledDate: true, city: true, zone: true, isEvent: true, isErthbox: true, customerName: true },
          },
          offDays: { where: { date: { gte: today } }, select: { date: true, reason: true } },
        },
      });

      const heroLines = heroes.map(h => {
        const todayOrders = h.orders.filter(o => o.scheduledDate === today);
        const todayPts = todayOrders.reduce((s, o) => s + o.points, 0);
        const weekOrders = h.orders.filter(o => o.scheduledDate && o.scheduledDate >= today && o.scheduledDate <= nextWeekEnd);
        const weekPts = weekOrders.reduce((s, o) => s + o.points, 0);
        const pending = h.orders.filter(o => o.status === "PENDING").length;
        const offDaysStr = h.offDays.length > 0 ? h.offDays.map(d => d.date).join(", ") : "none";
        return `• ${h.displayName || h.username}: ${h.orders.length} active orders | Today: ${todayOrders.length} (${todayPts}pts) | This week: ${weekOrders.length} (${weekPts}pts) | Pending: ${pending} | OFF days: ${offDaysStr}${h.lastLoginAt ? ` | Last login: ${h.lastLoginAt.toISOString().split("T")[0]}` : ""}`;
      });

      const heroOffDays = heroes.flatMap(h => h.offDays.map(od => `${od.date}: ${h.displayName || h.username}${od.reason ? ` (${od.reason})` : ""}`));

      userContext += `

=== HERO OVERVIEW (${heroes.length} active heroes) ===
${heroLines.join("\n")}

=== HERO OFF DAYS (upcoming) ===
${heroOffDays.length > 0 ? heroOffDays.join("\n") : "No upcoming hero OFF days"}

=== SUPPORT CAPABILITIES ===
As a ${user.role} user, you can answer questions about any hero's schedule, workload, and orders.
You can help with:
- "Which heroes are working today?"
- "Who has the lightest workload this week?"
- "Are any heroes on leave next week?"
- "Which hero should I assign this KL order to?"
- "How many pending orders does [hero] have?"
- Reassign orders between heroes (tell user to use the Support Dashboard)
- View any hero's schedule and order details`;
    }

    // Call AI
    const aiMessages = history.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));
    const result = await chatWithDeepSeek(aiMessages, userContext);

    if (result.error) {
      return NextResponse.json({
        conversationId: convId,
        response: result.content,
        actions: [],
        flagged,
        error: result.error,
      });
    }

    // Save assistant response
    await db.aiMessage.create({
      data: {
        conversationId: convId,
        role: "assistant",
        content: result.content,
        metadata: JSON.stringify({ tokensUsed: result.tokensUsed, model: result.model }),
      },
    });

    // Parse and create actions if any
    const actions = parseAiActions(result.content);
    const createdActions: Array<{ id: string; actionType: string; description: string; status: string }> = [];
    for (const action of actions) {
      const dbAction = await db.aiAction.create({
        data: {
          conversationId: convId,
          userId: user.id,
          actionType: action.actionType,
          entityType: action.entityType,
          entityId: action.entityId,
          description: action.description,
          payload: JSON.stringify(action.payload),
          status: "PENDING",
        },
      });
      createdActions.push({
        id: dbAction.id,
        actionType: dbAction.actionType,
        description: dbAction.description,
        status: dbAction.status,
      });
    }

    // Update conversation timestamp
    await db.aiConversation.update({ where: { id: convId }, data: { updatedAt: new Date() } });

    return NextResponse.json({
      conversationId: convId,
      response: result.content,
      actions: createdActions,
      flagged,
    });
  } catch (error) {
    console.error("[ai/chat] error:", error);
    return NextResponse.json({ error: "Failed to process message." }, { status: 500 });
  }
}
