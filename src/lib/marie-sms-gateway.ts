import { MARIE_TIME_ZONE } from "./marie-operations";
import { db } from "./db";
import { getMarieConfig } from "./marie-config";

/**
 * SMS gateway integration via textbee.dev — sends an SMS to customers containing
 * a wa.me link so they can initiate the WhatsApp conversation with Marie.
 *
 * This is the critical anti-ban piece: Marie never sends the first WhatsApp message.
 * Instead, the customer receives an SMS with a link to chat. When they click and send
 * their first message, Marie can then reply on WhatsApp normally.
 *
 * The SMS is sent from your own phone via textbee, so it's a legitimate,
 * human-looking message — not an automated WhatsApp broadcast.
 */

const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY ?? "f0e708cb-36da-4b99-a885-9752541eabc3";
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_API_URL = "https://api.textbee.dev/api/v1/gateway/devices";

/** The WhatsApp Business number customers should message. */
const MARIE_WHATSAPP_NUMBER = process.env.MARIE_WHATSAPP_NUMBER ?? "601113101632";

/** Cache the device ID after first lookup. */
let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string | null> {
  if (cachedDeviceId) return cachedDeviceId;
  if (TEXTBEE_DEVICE_ID) { cachedDeviceId = TEXTBEE_DEVICE_ID; return cachedDeviceId; }
  try {
    const res = await fetch(`${TEXTBEE_API_URL}`, { headers: { "x-api-key": TEXTBEE_API_KEY }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = await res.json() as { data?: Array<{ _id: string; enabled: boolean }> };
    const device = data.data?.find(d => d.enabled);
    if (device) { cachedDeviceId = device._id; return cachedDeviceId; }
  } catch { return null; }
  return null;
}

/**
 * Renders a professional, legitimate-looking SMS that invites the customer
 * to WhatsApp Marie for their pickup. The wa.me link pre-fills their order number
 * so Marie knows which order the customer is contacting about.
 */
export function renderInvitationSMS(input: {
  customerName: string;
  orderRef: string;
  scheduledDate: string;
}): string {
  const { customerName: _customerName, orderRef, scheduledDate } = input;
  const link = `https://wa.me/${MARIE_WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hi, regarding my ERTH pickup order ${orderRef} on ${scheduledDate}`)}`;
  return (
    `ERTH E-Waste Pickup: Your driver has been assigned. ` +
    `Pickup scheduled for ${scheduledDate}, 10am-4pm. ` +
    `Please confirm by chatting with our assistant on WhatsApp: ${link}`
  );
}

/**
 * Sends an invitation SMS to a customer, prompting them to message Marie on WhatsApp.
 * This is the first (and only automated) contact — everything after is a customer-initiated
 * conversation on WhatsApp, which keeps the number safe from bans.
 */
export async function sendInvitationSMS(input: {
  orderId: string;
  now?: Date;
}): Promise<{ sent: boolean; reason: string }> {
  const order = await db.order.findFirst({
    where: { orderId: input.orderId },
    select: { id: true, orderId: true, customerName: true, phone: true, scheduledDate: true, status: true },
  });
  if (!order) return { sent: false, reason: "Order not found" };
  if (!order.scheduledDate) return { sent: false, reason: "Order has no scheduled date" };
  if (!order.phone) return { sent: false, reason: "Order has no phone number" };

  // Normalize to +60 format for textbee.
  const recipient = order.phone.startsWith("+") ? order.phone : `+${order.phone.replace(/^\+?0/, "60")}`;

  const message = renderInvitationSMS({
    customerName: order.customerName,
    orderRef: order.orderId,
    scheduledDate: order.scheduledDate,
  });

  const deviceId = await getDeviceId();
  if (!deviceId) return { sent: false, reason: "No textbee device found" };

  try {
    const res = await fetch(`${TEXTBEE_API_URL}/${deviceId}/send-sms`, {
      method: "POST",
      headers: { "x-api-key": TEXTBEE_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ recipients: [recipient], message }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      return { sent: false, reason: `Textbee HTTP ${res.status}: ${JSON.stringify(errorBody).slice(0, 200)}` };
    }

    await db.automationEvent.create({
      data: {
        orderId: order.id,
        eventType: "SMS_INVITATION_SENT",
        actor: "MARIE",
        idempotencyKey: `sms-invite:${order.id}`,
        reasonCode: "SMS_GATEWAY",
        metadata: JSON.stringify({ recipient, scheduledDate: order.scheduledDate }),
      },
    });

    return { sent: true, reason: `SMS sent to ${recipient} for order ${order.orderId}` };
  } catch (error) {
    return { sent: false, reason: `Textbee error: ${error instanceof Error ? error.message : "unknown"}` };
  }
}
