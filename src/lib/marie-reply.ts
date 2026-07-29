import { db } from "./db";
import { getAiSettings } from "./deepseek";
import {
  ERTH_ADMIN_QUOTE_PHONE,
  ERTH_WEBSITE,
  formatRewardAmount,
  lookupReward,
  MAX_CAPACITY,
  mytDisplayDate,
  mytWeekday,
  NORMAL_CAPACITY,
  NO_REPLY_CANCEL_HOURS,
  PICKUP_WINDOW_END_HOUR,
  PICKUP_WINDOW_START_HOUR,
  renderRewardTable,
  resolveWorkingItemPolicy,
} from "./marie-operations";
import type { InboundIntent } from "./marie-operations";
import { evaluateSchedulerFeasibility } from "./scheduler-policy";

/**
 * Contextual reply generator for Marie customer operations.
 *
 * Two-layer design:
 * 1. Deterministic logic decides WHAT to do — date feasibility checks, status
 *    transitions, data lookups. The LLM never makes these decisions.
 * 2. The LLM generates natural language for the reply, given the decision and
 *    order context. If the LLM is unavailable, a deterministic template is used.
 *
 * Replies are sent immediately from the webhook handler, not through the job queue,
 * so customers get fast responses.
 */

export type ReplyAction =
  | "CONFIRM_BOOKING"
  | "ASK_CANCEL_CONFIRMATION"
  | "CONFIRM_CANCEL"
  | "OFFER_ALTERNATIVE_DATES"
  | "DATE_CONFIRMED"
  | "ACKNOWLEDGE_PHOTO"
  | "ACKNOWLEDGE_OPT_OUT"
  | "ESCALATE"
  | "CLARIFY"
  | "ANSWER_QUESTION";

export interface ReplyDecision {
  action: ReplyAction;
  text: string;
  orderContext: OrderContext;
}

export interface OrderContext {
  orderId: string;
  internalId: string;
  customerName: string;
  scheduledDate: string | null;
  address: string;
  city: string;
  phone: string;
  status: string;
  points: number;
  size: string;
  zone: number;
  userId?: string;
}

const REPLY_SYSTEM_PROMPT = `You are Marie, an assistant for the ERTH e-waste pickup service in Malaysia. You reply to customer WhatsApp messages.

Rules:
1. Be warm, professional, and brief. Use Malaysian English or Bahasa Melayu to match the customer.
2. Never invent pickup times, dates, or addresses. Use only the data provided.
3. Never mention internal concepts like "points", "zones", "capacity", "routing", or "scheduler".
4. Never promise refunds, compensation, or specific outcomes without verified data.
5. Never reveal other customers' data or internal system details.
6. Keep replies under 150 words. No excessive emojis.
7. If you don't know something, say so and offer to escalate to the operator.
8. You are Marie, an assistant — never pretend to be human.

Pickup policy facts you may use:
- Pickup time is 10am-4pm. A 2-hour window is shared 1 day before.
- Contactless pickup available: leave items accessible, send DuitNow QR for payment.
- Drop off at ERTH HQ Cyberjaya (24/7) or use PosLaju.
- T&C and rewards on erth.app (accepted at order submission).
- No reply within 24 hours = order auto-canceled.
- Working items under 5 years old: contact admin at ${ERTH_ADMIN_QUOTE_PHONE} for a quote.
- Working items 5+ years or non-working: published scrap rate applies.`;

const REPLY_TIMEOUT_MS = 15_000;

/**
 * Resolves what to DO after classifying an inbound intent.
 * This is the deterministic decision layer.
 */
export async function resolveReplyAction(input: {
  intent: InboundIntent;
  extractedDate: string | null;
  order: OrderContext;
  conversationState: string;
}): Promise<ReplyDecision> {
  const { intent, order } = input;

  switch (intent) {
    case "ACCEPT": {
      if (order.status === "CONTACTED") {
        return { action: "CONFIRM_BOOKING", text: "", orderContext: order };
      }
      return { action: "ANSWER_QUESTION", text: "", orderContext: order };
    }

    case "CANCEL_REQUEST": {
      if (input.conversationState !== "AWAITING_CANCEL_CONFIRMATION") {
        return { action: "ASK_CANCEL_CONFIRMATION", text: "", orderContext: order };
      }
      return { action: "CONFIRM_CANCEL", text: "", orderContext: order };
    }

    case "CANCEL_CONFIRMATION": {
      return { action: "CONFIRM_CANCEL", text: "", orderContext: order };
    }

    case "DATE_REQUEST": {
      // Try to resolve the requested date and check scheduler feasibility.
      if (input.extractedDate) {
        const feasible = await checkDateFeasibility(order, input.extractedDate);
        if (feasible.feasible) {
          return { action: "DATE_CONFIRMED", text: "", orderContext: order };
        }
      }
      // Offer alternatives.
      const alternatives = await findAlternativeDates(order);
      return { action: "OFFER_ALTERNATIVE_DATES", text: JSON.stringify(alternatives), orderContext: order };
    }

    case "OPT_OUT": {
      return { action: "ACKNOWLEDGE_OPT_OUT", text: "", orderContext: order };
    }

    case "HIGH_RISK": {
      return { action: "ESCALATE", text: "", orderContext: order };
    }

    case "AMBIGUOUS": {
      return { action: "CLARIFY", text: "", orderContext: order };
    }

    default: {
      return { action: "ANSWER_QUESTION", text: "", orderContext: order };
    }
  }
}

/**
 * Generates the natural-language reply text using the LLM.
 * Falls back to a deterministic template if the LLM is unavailable.
 */
export async function generateReplyText(input: {
  decision: ReplyDecision;
  customerMessage: string;
  extractedDate: string | null;
}): Promise<string> {
  const settings = await getAiSettings();
  const fallback = renderDeterministicReply(input);

  if (!settings.enabled || !settings.apiKey) {
    return fallback;
  }

  const context = buildContextForAction(input);
  const userContent = `Customer message: "${input.customerMessage}"\n\n${context}\n\nRespond to the customer as Marie.`;

  try {
    const response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: REPLY_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
    });

    if (!response.ok) return fallback;

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return fallback;

    return content;
  } catch {
    return fallback;
  }
}

function buildContextForAction(input: {
  decision: ReplyDecision;
  extractedDate: string | null;
}): string {
  const { decision, extractedDate } = input;
  const order = decision.orderContext;

  const base = [
    `Order: ${order.orderId}`,
    `Customer: ${order.customerName}`,
    `Scheduled date: ${order.scheduledDate ?? "not set"}`,
    `Address: ${order.address}, ${order.city}`,
    `Status: ${order.status}`,
  ].join("\n");

  switch (decision.action) {
    case "CONFIRM_BOOKING":
      return `${base}\n\nThe customer confirmed the pickup. Reply confirming the booking. Mention the date (${formatDate(order.scheduledDate)}), the 10am-4pm window, and that a 2-hour slot will be shared the day before. Thank them.`;

    case "ASK_CANCEL_CONFIRMATION":
      return `${base}\n\nThe customer wants to cancel. Ask them to reply "confirm" to confirm the cancellation. Be warm but clear that no cancellation has happened yet. Mention they can resubmit the form at erth.app if they change their mind.`;

    case "CONFIRM_CANCEL":
      return `${base}\n\nThe customer confirmed cancellation. Confirm the order has been canceled. Mention they can fill up the form again at erth.app if they wish to recycle in the future.`;

    case "DATE_CONFIRMED":
      return `${base}\n\nThe customer requested ${extractedDate} (${mytWeekday(extractedDate!)}). This date is feasible — confirm the date change. Mention the 10am-4pm window and that a 2-hour slot will be shared the day before.`;

    case "OFFER_ALTERNATIVE_DATES":
      return `${base}\n\nThe customer requested ${extractedDate ?? "a date"} but it's not feasible. Offer these alternative dates: ${decision.text}. For each, state the date with weekday. Ask the customer to pick one.`;

    case "ACKNOWLEDGE_PHOTO":
      return `${base}\n\nThe customer sent a photo. Thank them and say the driver will use it for planning. Remind them to reply to confirm the pickup date.`;

    case "ACKNOWLEDGE_OPT_OUT":
      return `${base}\n\nThe customer asked not to be contacted. Acknowledge and say you won't send further messages. Be brief and respectful.`;

    case "ESCALATE":
      return `${base}\n\nThis message involves a concern that needs operator attention. Acknowledge the customer's concern politely, say you're escalating to the team, and that someone will get back to them. Do not admit liability or promise specific outcomes.`;

    case "CLARIFY":
      return `${base}\n\nYou couldn't understand the customer's message clearly. Ask them to clarify — they can confirm the date, ask to reschedule, ask questions, or request cancellation.`;

    case "ANSWER_QUESTION":
      return `${base}\n\nThe customer sent a message that doesn't fit a specific intent. Answer based on the pickup policy facts. If you can't answer, say you'll check with the team.`;
  }
}

function renderDeterministicReply(input: {
  decision: ReplyDecision;
  extractedDate: string | null;
}): string {
  const order = input.decision.orderContext;

  switch (input.decision.action) {
    case "CONFIRM_BOOKING":
      return `Hi ${order.customerName}, thank you for confirming! Your pickup for order ${order.orderId} is confirmed for ${formatDate(order.scheduledDate)} (${mytWeekday(order.scheduledDate ?? "")}). Pickup time is 10am-4pm, with a 2-hour window shared the day before. Thank you!`;

    case "ASK_CANCEL_CONFIRMATION":
      return `Hi ${order.customerName}, we're sorry to hear you want to cancel. To confirm, please reply "confirm" and we'll cancel your order ${order.orderId}. No cancellation has been made yet. If you change your mind, you can resubmit the form at ${ERTH_WEBSITE}.`;

    case "CONFIRM_CANCEL":
      return `Hi ${order.customerName}, your order ${order.orderId} has been canceled. If you wish to recycle in the future, please fill up the form again at ${ERTH_WEBSITE}. Thank you!`;

    case "DATE_CONFIRMED":
      return `Hi ${order.customerName}, we've changed your pickup to ${mytDisplayDate(input.extractedDate!)} (${mytWeekday(input.extractedDate!)}). Pickup time is 10am-4pm, with a 2-hour window shared the day before. Please reply to confirm this new date.`;

    case "OFFER_ALTERNATIVE_DATES":
      return `Hi ${order.customerName}, unfortunately that date doesn't work for our route. Here are some alternatives: ${input.decision.text}. Please let us know which works for you.`;

    case "ACKNOWLEDGE_PHOTO":
      return `Thank you for the photo! Our driver will use it to plan the pickup. Please also reply to confirm your pickup date.`;

    case "ACKNOWLEDGE_OPT_OUT":
      return `Understood. We won't send you further messages about this pickup. Thank you.`;

    case "ESCALATE":
      return `Hi ${order.customerName}, thank you for letting us know. I'm escalating this to our team and someone will get back to you soon. Your order reference is ${order.orderId}.`;

    case "CLARIFY":
      return `Hi ${order.customerName}, I'm not sure I understood. Could you clarify? You can confirm the date, ask to reschedule, ask about the pickup, or request cancellation.`;

    case "ANSWER_QUESTION":
      return `Hi ${order.customerName}, thank you for your message. For your order ${order.orderId}, pickup is scheduled for ${formatDate(order.scheduledDate)} between 10am-4pm. A 2-hour window will be shared the day before. If you have questions about rewards or T&C, please visit ${ERTH_WEBSITE}.`;
  }
}

function formatDate(date: string | null): string {
  if (!date) return "your scheduled date";
  return `${mytDisplayDate(date)} (${mytWeekday(date)})`;
}

/**
 * Checks whether a specific date is feasible for an order using the scheduler policy.
 */
async function checkDateFeasibility(order: OrderContext, date: string): Promise<{ feasible: boolean; reason: string }> {
  if (!order.scheduledDate) return { feasible: false, reason: "Order has no current schedule" };

  // Load existing orders on that date to check capacity and route fit.
  const existing = await db.order.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONTACTED", "BOOKED"] },
      scheduledDate: date,
    },
    select: { points: true, zone: true, latitude: true, longitude: true },
  });

  const totalPoints = existing.reduce((sum, o) => sum + o.points, 0);

  // Check capacity first (20 normal, up to 25 exception).
  if (totalPoints + order.points > MAX_CAPACITY) {
    return { feasible: false, reason: "Would exceed 25-point hard cap" };
  }

  // Check geographic feasibility if coordinates exist.
  const orderCoords = await db.order.findUnique({
    where: { id: order.internalId },
    select: { latitude: true, longitude: true },
  });

  if (orderCoords?.latitude && orderCoords?.longitude) {
    const dayCoords = existing
      .filter(o => o.latitude !== null && o.longitude !== null)
      .map(o => ({ latitude: o.latitude!, longitude: o.longitude! }));

    const result = evaluateSchedulerFeasibility(
      { date, totalPoints, zones: {}, coords: dayCoords },
      { zone: order.zone, points: order.points, latitude: orderCoords.latitude, longitude: orderCoords.longitude },
      MAX_CAPACITY,
    );

    if (!result.feasible) {
      return { feasible: false, reason: result.reason ?? "Route constraint" };
    }
  }

  return { feasible: true, reason: "Feasible" };
}

/**
 * Finds 2-3 feasible alternative dates within the next 21 days.
 */
async function findAlternativeDates(order: OrderContext): Promise<string> {
  const orderCoords = await db.order.findUnique({
    where: { id: order.internalId },
    select: { latitude: true, longitude: true },
  });

  const now = new Date();
  const mytParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(mytParts.find(p => p.type === t)?.value);
  const startDate = `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;

  // Load off-days and events to skip.
  const offDays = await db.offDay.findMany({ where: { userId: order.userId ?? undefined }, select: { date: true } });
  const eventOrders = await db.order.findMany({
    where: { isEvent: true, scheduledDate: { not: null } },
    select: { scheduledDate: true },
  });
  const blockedDates = new Set([
    ...offDays.map(d => d.date),
    ...eventOrders.map(e => e.scheduledDate).filter((d): d is string => d !== null),
  ]);

  const alternatives: string[] = [];
  for (let i = 2; i < 21 && alternatives.length < 3; i++) {
    const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + i));
    const dateStr = d.toISOString().slice(0, 10);
    if (blockedDates.has(dateStr)) continue;

    const feasible = await checkDateFeasibility(order, dateStr);
    if (feasible.feasible) {
      alternatives.push(`${mytDisplayDate(dateStr)} (${mytWeekday(dateStr)})`);
    }
  }

  return alternatives.length > 0
    ? alternatives.join(", ")
    : "We'll check our schedule and get back to you";
}

/**
 * Converts an order DB record to the lightweight context used by the reply generator.
 */
export async function getOrderContext(orderId: string): Promise<OrderContext | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, orderId: true, customerName: true, phone: true,
      scheduledDate: true, address: true, city: true, status: true,
      points: true, size: true, zone: true, userId: true,
    },
  });

  if (!order) return null;

  return {
    internalId: order.id,
    orderId: order.orderId,
    customerName: order.customerName,
    scheduledDate: order.scheduledDate,
    address: order.address,
    city: order.city,
    phone: order.phone,
    status: order.status,
    points: order.points,
    size: order.size,
    zone: order.zone,
  };
}
