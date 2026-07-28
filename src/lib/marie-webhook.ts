import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { classifyInboundIntent, normalizeMalaysianPhone } from "./marie-operations";
import { canonicalNormalTransition } from "./order-status";
import { getMarieConfig } from "./marie-config";

const idSchema = z.union([
  z.string().min(1).max(300),
  z.object({ _serialized: z.string().min(1).max(300).optional(), id: z.string().max(200).optional() }).passthrough(),
]);
const textSchema = z.union([z.string().max(10_000), z.object({ body: z.string().max(10_000).optional() }).passthrough()]);
const messageSchema = z.object({
  body: z.string().max(10_000).optional(),
  from: z.string().max(300).optional(),
  fromMe: z.boolean().optional(),
  id: idSchema.optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  text: textSchema.optional(),
  type: z.string().max(100).optional(),
  hasMedia: z.boolean().optional(),
  ack: z.union([z.number().int(), z.string().max(50)]).optional(),
}).passthrough();

export const wahaWebhookSchema = z.object({
  id: z.string().min(1).max(300).optional(),
  event: z.string().min(1).max(100),
  session: z.string().min(1).max(100),
  payload: messageSchema,
}).passthrough();

export type WahaWebhook = z.infer<typeof wahaWebhookSchema>;
type DbClient = PrismaClient | Prisma.TransactionClient;
const MESSAGE_EVENTS = new Set(["message", "message.any"]);
const ACK_STATES: Record<string, { state: "SENT" | "DELIVERED" | "READ" | "FAILED"; rank: number }> = {
  "-1": { state: "FAILED", rank: 4 }, ERROR: { state: "FAILED", rank: 4 },
  "0": { state: "SENT", rank: 1 }, PENDING: { state: "SENT", rank: 1 }, SERVER: { state: "SENT", rank: 1 },
  "1": { state: "SENT", rank: 1 }, "2": { state: "DELIVERED", rank: 2 }, DEVICE: { state: "DELIVERED", rank: 2 },
  "3": { state: "READ", rank: 3 }, READ: { state: "READ", rank: 3 }, PLAYED: { state: "READ", rank: 3 },
};
const DELIVERY_RANK: Record<string, number> = { PENDING: 0, QUEUED: 0, RETRY: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, SEND_UNCERTAIN: 4 };

function serializedId(value: WahaWebhook["payload"]["id"]): string | null {
  if (typeof value === "string") return value;
  return value?._serialized ?? value?.id ?? null;
}

function messageBody(payload: WahaWebhook["payload"]): string {
  if (payload.body !== undefined) return payload.body;
  if (typeof payload.text === "string") return payload.text;
  return payload.text?.body ?? "";
}

function providerTimestamp(value: string | number | undefined): Date | null {
  if (value === undefined) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function deliveryKey(input: WahaWebhook): string {
  if (input.id) return `envelope:${input.id}`;
  const payloadId = serializedId(input.payload.id) ?? "none";
  const stable = `${input.event}|${input.session}|${payloadId}|${String(input.payload.ack ?? "")}|${String(input.payload.timestamp ?? "")}`;
  return `derived:${createHash("sha256").update(stable).digest("hex")}`;
}

export function validateWahaSource(input: WahaWebhook, expectedSession = process.env.MARIE_WAHA_SESSION ?? "naz"): string | null {
  if (input.session !== expectedSession) return "UNEXPECTED_SESSION";
  if (!MESSAGE_EVENTS.has(input.event) && input.event !== "message.ack") return "UNKNOWN_EVENT";
  return null;
}

export function parseWahaIdentifier(from: string): { chatId: string; lid: string | null; phone: string | null; group: boolean } {
  const chatId = from.trim().toLowerCase();
  const group = chatId.endsWith("@g.us") || chatId.includes("-g.us");
  if (chatId.endsWith("@lid")) return { chatId, lid: chatId, phone: null, group };
  const local = chatId.split("@")[0];
  return { chatId, lid: null, phone: normalizeMalaysianPhone(local), group };
}

async function recordUnmatched(client: DbClient, providerMessageId: string | null, eventType: string, reasonCode: string, identifierKind: string) {
  await client.marieUnmatchedWebhook.create({ data: { providerMessageId, eventType, reasonCode, identifierKind } }).catch(error => {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  });
}

async function ensureHold(tx: Prisma.TransactionClient, orderId: string, reasonCode: string) {
  if (!await tx.orderHold.findFirst({ where: { orderId, state: "ACTIVE" } })) {
    await tx.orderHold.create({ data: { orderId, reasonCode, reason: "Marie inbound safety hold", createdBy: "MARIE" } });
  }
}

async function ensureEscalation(tx: Prisma.TransactionClient, orderId: string, conversationId: string, category: string, severity: string) {
  const existing = await tx.customerEscalation.findFirst({ where: { orderId, conversationId, category, state: "OPEN" } });
  if (!existing) await tx.customerEscalation.create({ data: { orderId, conversationId, correlationId: randomUUID(), category, severity, summary: `Inbound ${category.toLowerCase()} requires operator review` } });
}

async function processAck(tx: Prisma.TransactionClient, input: WahaWebhook) {
  const providerMessageId = serializedId(input.payload.id);
  const target = ACK_STATES[String(input.payload.ack ?? "").toUpperCase()];
  if (!providerMessageId || !target) return "ACK_IGNORED";
  const message = await tx.customerMessage.findUnique({ where: { providerMessageId } });
  if (!message || message.direction !== "OUTBOUND") return "ACK_UNMATCHED";
  if ((DELIVERY_RANK[message.deliveryState] ?? 0) >= target.rank) return "ACK_STALE";
  await tx.customerMessage.update({ where: { id: message.id }, data: { deliveryState: target.state } });
  return `ACK_${target.state}`;
}

export async function processWahaWebhook(input: WahaWebhook, options: { inboundProcessingEnabled?: boolean } = {}) {
  const key = deliveryKey(input);
  try {
    await db.marieWebhookDelivery.create({ data: { deliveryKey: key, envelopeId: input.id, eventType: input.event, sessionName: input.session } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { outcome: "DUPLICATE" as const };
    throw error;
  }
  const rejectReason = validateWahaSource(input);
  if (rejectReason) {
    await db.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: rejectReason, processedAt: new Date() } });
    return { outcome: "REJECTED_EVENT" as const };
  }
  const inboundProcessingEnabled = options.inboundProcessingEnabled === true && (await getMarieConfig()).inboundProcessingEnabled;
  if (!inboundProcessingEnabled) {
    await db.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: "DIAGNOSTIC_ONLY", processedAt: new Date() } });
    return { outcome: "DIAGNOSTIC_ONLY" as const };
  }

  try {
    return await db.$transaction(async tx => {
      if (input.event === "message.ack") {
        const outcome = await processAck(tx, input);
        await tx.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome, processedAt: new Date() } });
        return { outcome };
      }
      const payload = input.payload;
      const providerMessageId = serializedId(payload.id);
      if (payload.fromMe) {
        await tx.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: "IGNORED_SELF", processedAt: new Date() } });
        return { outcome: "IGNORED_SELF" as const };
      }
      if (!payload.from || !providerMessageId) {
        await recordUnmatched(tx, providerMessageId, input.event, "MISSING_IDENTITY", "UNKNOWN");
        return { outcome: "UNMATCHED" as const };
      }
      const identifier = parseWahaIdentifier(payload.from);
      if (identifier.group) return { outcome: "REJECTED_GROUP" as const };
      const conversations = await tx.customerConversation.findMany({
        where: identifier.lid
          ? { state: { not: "PAUSED" }, pausedAt: null, OR: [{ chatId: identifier.chatId }, { lid: identifier.lid }] }
          : { state: { not: "PAUSED" }, pausedAt: null, OR: [{ chatId: identifier.chatId }, ...(identifier.phone ? [{ normalizedPhone: identifier.phone }] : [])] },
        include: { order: true },
      });
      const eligible = conversations.filter(candidate => candidate.orderId && candidate.order && !["COMPLETED", "CANCELED"].includes(candidate.order.status));
      if (eligible.length > 1) {
        await recordUnmatched(tx, providerMessageId, input.event, "AMBIGUOUS_IDENTITY", identifier.lid ? "LID" : "PHONE");
        await tx.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: "AMBIGUOUS_IDENTITY", processedAt: new Date() } });
        return { outcome: "AMBIGUOUS_IDENTITY" as const };
      }
      const conversation = eligible[0];
      if (!conversation?.orderId || !conversation.order) {
        await recordUnmatched(tx, providerMessageId, input.event, identifier.lid ? "UNMAPPED_LID" : "UNKNOWN_SENDER", identifier.lid ? "LID" : "PHONE");
        return { outcome: "UNMATCHED" as const };
      }
      const unsupported = payload.hasMedia === true || (payload.type && !["chat", "text"].includes(payload.type.toLowerCase()));
      const body = unsupported ? null : messageBody(payload);
      const intent = unsupported ? "UNSUPPORTED" : classifyInboundIntent(body ?? "", conversation.state === "AWAITING_CANCEL_CONFIRMATION");
      const message = await tx.customerMessage.create({ data: {
        conversationId: conversation.id, direction: "INBOUND", providerMessageId,
        idempotencyKey: `waha:in:${providerMessageId}`, body,
        bodyHash: body === null ? null : createHash("sha256").update(body).digest("hex"),
        messageType: unsupported ? "UNSUPPORTED" : "TEXT", deliveryState: "RECEIVED",
        providerTimestamp: providerTimestamp(payload.timestamp),
        metadata: JSON.stringify({ event: input.event, session: input.session, identifierKind: identifier.lid ? "LID" : "PHONE" }),
      } });
      let afterState = conversation.state;
      let orderAfter = conversation.order.status;
      if (intent === "ACCEPT") {
        if (conversation.order.status === "CONTACTED") {
          canonicalNormalTransition(conversation.order.status, "BOOKED");
          const changed = await tx.order.updateMany({ where: { id: conversation.orderId, status: "CONTACTED" }, data: { status: "BOOKED" } });
          if (changed.count === 1) orderAfter = "BOOKED";
        }
      } else if (intent === "CANCEL_REQUEST") {
        const changed = await tx.customerConversation.updateMany({ where: { id: conversation.id, state: conversation.state }, data: { state: "AWAITING_CANCEL_CONFIRMATION" } });
        if (changed.count === 1) {
          afterState = "AWAITING_CANCEL_CONFIRMATION";
          const confirmation = await tx.customerMessage.upsert({ where: { idempotencyKey: `cancel-confirm-message:${message.id}` }, create: { conversationId: conversation.id, direction: "OUTBOUND", idempotencyKey: `cancel-confirm-message:${message.id}`, body: "Please reply confirm if you want to cancel this pickup. No cancellation has been made yet.", deliveryState: "QUEUED" }, update: {} });
          await tx.automationJob.upsert({ where: { idempotencyKey: `cancel-confirm:${message.id}` }, create: { orderId: conversation.orderId, conversationId: conversation.id, kind: "SEND_CUSTOMER_MESSAGE", idempotencyKey: `cancel-confirm:${message.id}`, runAfter: new Date(), payload: JSON.stringify({ messageId: confirmation.id, transitionToContacted: false }) }, update: {} });
        }
      } else if (intent === "CANCEL_CONFIRMATION" && conversation.state === "AWAITING_CANCEL_CONFIRMATION") {
        if (["PENDING", "SCHEDULED", "CONTACTED", "BOOKED"].includes(conversation.order.status)) {
          canonicalNormalTransition(conversation.order.status, "CANCELED");
          const changed = await tx.order.updateMany({ where: { id: conversation.orderId, status: conversation.order.status }, data: { status: "CANCELED" } });
          if (changed.count === 1) {
          await tx.customerConversation.updateMany({ where: { id: conversation.id, state: "AWAITING_CANCEL_CONFIRMATION" }, data: { state: "PAUSED", pausedAt: new Date() } });
          afterState = "PAUSED"; orderAfter = "CANCELED";
          }
        }
      } else if (["OPT_OUT", "HIGH_RISK", "AMBIGUOUS", "DATE_REQUEST", "UNSUPPORTED"].includes(intent)) {
        await tx.customerConversation.updateMany({ where: { id: conversation.id }, data: { state: "PAUSED", pausedAt: new Date() } });
        afterState = "PAUSED";
        await ensureHold(tx, conversation.orderId, intent);
        if (intent !== "OPT_OUT") await ensureEscalation(tx, conversation.orderId, conversation.id, intent, intent === "HIGH_RISK" ? "HIGH" : "NORMAL");
      }
      await tx.automationEvent.create({ data: { orderId: conversation.orderId, conversationId: conversation.id, messageId: message.id, eventType: `INBOUND_${intent}`, actor: "CUSTOMER", idempotencyKey: `inbound-action:${providerMessageId}`, beforeState: conversation.state, afterState, reasonCode: intent, metadata: JSON.stringify({ providerMessageId, orderStatusBefore: conversation.order.status, orderStatusAfter: orderAfter }) } });
      await tx.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: "PROCESSED", processedAt: new Date() } });
      return { outcome: "PROCESSED" as const, intent };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await db.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: "DUPLICATE_MESSAGE", processedAt: new Date() } });
      return { outcome: "DUPLICATE" as const };
    }
    throw error;
  }
}
