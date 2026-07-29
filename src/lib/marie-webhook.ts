import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { classifyInboundIntent, normalizeMalaysianPhone } from "./marie-operations";
import { canonicalNormalTransition } from "./order-status";
import { getMarieConfig } from "./marie-config";
import { storeDuitNowQr } from "./marie-duitnow-qr";
import { classifyWithLLM } from "./marie-llm-classifier";
import { generateReplyText, getOrderContext, resolveReplyAction } from "./marie-reply";
import { WahaProvider } from "./marie-outbound";

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

/** Acceptable inbound media types that Marie can safely receive. */
const IMAGE_MEDIA_TYPES = new Set(["image", "image/jpeg", "image/png", "sticker"]);

function isImageMessage(payload: WahaWebhook["payload"]): boolean {
  const type = payload.type?.toLowerCase() ?? "";
  if (IMAGE_MEDIA_TYPES.has(type)) return true;
  if (payload.hasMedia === true && (type === "chat" || type === "text" || type === "")) {
    // WAHA may report media on the base message type; the caption distinguishes images.
    return Boolean(payload.body && payload.body.toLowerCase().includes("image"));
  }
  return false;
}

/**
 * Downloads media for a message from WAHA. Best-effort: if the API endpoint changes
 * or the file is too large, the function returns null and the caller records the
 * message as a media-received-but-not-downloaded event.
 */
async function downloadWahaMedia(input: {
  session: string;
  chatId: string;
  messageId: string;
}): Promise<{ data: Buffer; mimeType: string } | null> {
  const apiKey = process.env.MARIE_WAHA_API_KEY;
  const apiUrl = process.env.MARIE_WAHA_API_URL ?? "http://127.0.0.1:3010";
  if (!apiKey) return null;
  const base = apiUrl.replace(/\/$/, "");
  const chatId = encodeURIComponent(input.chatId);
  const messageId = encodeURIComponent(input.messageId);
  for (const path of [
    `/api/${input.session}/chats/${chatId}/messages/${messageId}/media`,
    `/api/sessions/${input.session}/chats/${chatId}/messages/${messageId}/media`,
  ]) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const mimeType = response.headers.get("content-type") ?? "image/jpeg";
      if (!mimeType.toLowerCase().startsWith("image/")) return null;
      const data = Buffer.from(await response.arrayBuffer());
      if (data.byteLength === 0 || data.byteLength > 2 * 1024 * 1024) return null;
      return { data, mimeType };
    } catch {
      continue;
    }
  }
  return null;
}

export function validateWahaSource(input: WahaWebhook, expectedSession = process.env.MARIE_WAHA_SESSION ?? "naz"): string | null {
  if (input.session !== expectedSession) return "UNEXPECTED_SESSION";
  if (!MESSAGE_EVENTS.has(input.event) && input.event !== "message.ack") return "UNKNOWN_EVENT";
  return null;
}

export function parseWahaIdentifier(from: string, payload?: WahaWebhook["payload"]): { chatId: string; lid: string | null; phone: string | null; group: boolean } {
  const chatId = from.trim().toLowerCase();
  const group = chatId.endsWith("@g.us") || chatId.includes("-g.us");
  if (chatId.endsWith("@lid")) {
    // GOWS engine sends LIDs as the from field. Extract real phone from _data.Info.SenderAlt
    // (format: "60187756567:1@s.whatsapp.net" — the phone is before the colon).
    const data = payload as unknown as { _data?: { Info?: { SenderAlt?: string; Chat?: string } } } | undefined;
    const alt = data?._data?.Info?.SenderAlt ?? data?._data?.Info?.Chat ?? "";
    const phoneMatch = alt.match(/^(\d+):/);
    const phone = phoneMatch ? normalizeMalaysianPhone(phoneMatch[1]) : null;
    return { chatId, lid: chatId, phone, group };
  }
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
  const inboundProcessingEnabled = options.inboundProcessingEnabled !== false && (await getMarieConfig()).inboundProcessingEnabled;
  if (!inboundProcessingEnabled) {
    await db.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: "DIAGNOSTIC_ONLY", processedAt: new Date() } });
    return { outcome: "DIAGNOSTIC_ONLY" as const };
  }

  try {
    const txResult = await db.$transaction(async tx => {
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
      const identifier = parseWahaIdentifier(payload.from, payload);
      if (identifier.group) return { outcome: "REJECTED_GROUP" as const };
      const conversations = await tx.customerConversation.findMany({
        where: identifier.lid
          ? { state: { not: "PAUSED" }, pausedAt: null, OR: [{ chatId: identifier.chatId }, { lid: identifier.lid }, ...(identifier.phone ? [{ normalizedPhone: identifier.phone }] : [])] }
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
      // Persist the LID on first contact so future messages from the same sender
      // can be matched directly without the SenderAlt fallback.
      if (identifier.lid && !conversation.lid) {
        await tx.customerConversation.updateMany({
          where: { id: conversation.id },
          data: { lid: identifier.lid },
        });
      }
      const orderId = conversation.orderId;
      const chatId = identifier.chatId;
      const isImage = isImageMessage(payload);
      const unsupported = !isImage && (payload.hasMedia === true || (payload.type && !["chat", "text"].includes(payload.type.toLowerCase())));
      const body = (isImage || unsupported) ? null : messageBody(payload);

      // Use LLM classifier with regex fallback for text messages.
      // Unsupported media and images skip classification entirely.
      let intent: string;
      let llmNote: string | null = null;
      let llmExtractedDate: string | null = null;
      if (unsupported) {
        intent = "UNSUPPORTED";
      } else if (isImage) {
        intent = "IMAGE_RECEIVED";
      } else {
        const llmResult = await classifyWithLLM(
          {
            body: body ?? "",
            conversationContext: `Order ${conversation.order?.orderId ?? "unknown"}, status ${conversation.order?.status ?? "unknown"}, conversation state ${conversation.state}`,
            awaitingCancellationConfirmation: conversation.state === "AWAITING_CANCEL_CONFIRMATION",
          },
          () => classifyInboundIntent(body ?? "", conversation.state === "AWAITING_CANCEL_CONFIRMATION"),
        );
        intent = llmResult.intent;
        llmNote = llmResult.note;
        llmExtractedDate = llmResult.extractedDate;
      }
      const message = await tx.customerMessage.create({ data: {
        conversationId: conversation.id, direction: "INBOUND", providerMessageId,
        idempotencyKey: `waha:in:${providerMessageId}`, body,
        bodyHash: body === null ? null : createHash("sha256").update(body).digest("hex"),
        messageType: unsupported ? "UNSUPPORTED" : isImage ? "IMAGE" : "TEXT", deliveryState: "RECEIVED",
        providerTimestamp: providerTimestamp(payload.timestamp),
        metadata: JSON.stringify({ event: input.event, session: input.session, identifierKind: identifier.lid ? "LID" : "PHONE", llmNote, llmExtractedDate }),
      } });
      let afterState = conversation.state;
      let orderAfter = conversation.order.status;
      let replyNeeded = false;
      if (intent === "ACCEPT") {
        if (conversation.order.status === "CONTACTED") {
          canonicalNormalTransition(conversation.order.status, "BOOKED");
          const changed = await tx.order.updateMany({ where: { id: conversation.orderId, status: "CONTACTED" }, data: { status: "BOOKED" } });
          if (changed.count === 1) orderAfter = "BOOKED";
        }
        replyNeeded = true;
      } else if (intent === "CANCEL_REQUEST") {
        if (conversation.state !== "AWAITING_CANCEL_CONFIRMATION") {
          const changed = await tx.customerConversation.updateMany({ where: { id: conversation.id, state: conversation.state }, data: { state: "AWAITING_CANCEL_CONFIRMATION" } });
          if (changed.count === 1) afterState = "AWAITING_CANCEL_CONFIRMATION";
        }
        replyNeeded = true;
      } else if (intent === "CANCEL_CONFIRMATION" && conversation.state === "AWAITING_CANCEL_CONFIRMATION") {
        if (["PENDING", "SCHEDULED", "CONTACTED", "BOOKED"].includes(conversation.order.status)) {
          canonicalNormalTransition(conversation.order.status, "CANCELED");
          const changed = await tx.order.updateMany({ where: { id: conversation.orderId, status: conversation.order.status }, data: { status: "CANCELED" } });
          if (changed.count === 1) {
          await tx.customerConversation.updateMany({ where: { id: conversation.id, state: "AWAITING_CANCEL_CONFIRMATION" }, data: { state: "PAUSED", pausedAt: new Date() } });
          afterState = "PAUSED"; orderAfter = "CANCELED";
          }
        }
        replyNeeded = true;
      } else if (intent === "IMAGE_RECEIVED") {
        replyNeeded = true;
      } else if (intent === "OPT_OUT") {
        await tx.customerConversation.updateMany({ where: { id: conversation.id, state: conversation.state }, data: { state: "PAUSED", pausedAt: new Date() } });
        afterState = "PAUSED";
        replyNeeded = true;
      } else if (intent === "HIGH_RISK") {
        await tx.customerConversation.updateMany({ where: { id: conversation.id, state: conversation.state }, data: { state: "PAUSED", pausedAt: new Date() } });
        afterState = "PAUSED";
        await ensureEscalation(tx, conversation.orderId, conversation.id, intent, "HIGH");
        replyNeeded = true;
      } else if (intent === "UNSUPPORTED") {
        await tx.customerConversation.updateMany({ where: { id: conversation.id, state: conversation.state }, data: { state: "PAUSED", pausedAt: new Date() } });
        afterState = "PAUSED";
        await ensureHold(tx, conversation.orderId, intent);
        await ensureEscalation(tx, conversation.orderId, conversation.id, intent, "NORMAL");
        replyNeeded = true;
      } else if (intent === "AMBIGUOUS" || intent === "DATE_REQUEST") {
        // Don't pause — just let the reply generator handle it (clarify or offer dates).
        // Escalate only DATE_REQUEST so the operator can verify the reschedule.
        if (intent === "DATE_REQUEST") await ensureEscalation(tx, conversation.orderId, conversation.id, intent, "NORMAL");
        replyNeeded = true;
      }
      await tx.automationEvent.create({ data: { orderId: conversation.orderId, conversationId: conversation.id, messageId: message.id, eventType: `INBOUND_${intent}`, actor: "CUSTOMER", idempotencyKey: `inbound-action:${providerMessageId}`, beforeState: conversation.state, afterState, reasonCode: intent, metadata: JSON.stringify({ providerMessageId, orderStatusBefore: conversation.order.status, orderStatusAfter: orderAfter, llmNote, llmExtractedDate }) } });
      await tx.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: "PROCESSED", processedAt: new Date() } });
      return { outcome: "PROCESSED" as const, intent, orderId, chatId, providerMessageId, replyNeeded, body: body ?? "", conversationState: afterState, extractedDate: llmExtractedDate };
    });

    // Download and store images outside the transaction so a slow download never
    // blocks the DB write or delays the webhook response.
    const result = txResult as {
      intent: string;
      chatId?: string;
      providerMessageId?: string;
      orderId?: string;
      replyNeeded?: boolean;
      body?: string;
      conversationState?: string;
    };

    if (result.intent === "IMAGE_RECEIVED" && result.chatId && result.providerMessageId && result.orderId) {
      const media = await downloadWahaMedia({
        session: input.session,
        chatId: result.chatId,
        messageId: result.providerMessageId,
      });
      if (media) {
        await storeDuitNowQr({ orderId: result.orderId, mimeType: media.mimeType, data: media.data })
          .catch(() => null);
      }
    }

    // Send an immediate contextual reply — not through the job queue.
    // This is the key change: customers get fast responses.
    if (result.replyNeeded && result.orderId && result.chatId) {
      await sendImmediateReply({
        orderId: result.orderId,
        chatId: result.chatId,
        intent: result.intent,
        customerMessage: result.body ?? "",
        conversationState: result.conversationState ?? "ACTIVE",
        extractedDate: (txResult as { extractedDate?: string | null }).extractedDate ?? null,
      }).catch(error => {
        console.error("[marie/webhook] immediate reply failed", error instanceof Error ? error.message : "unknown");
      });
    }

    return txResult;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await db.marieWebhookDelivery.update({ where: { deliveryKey: key }, data: { outcome: "DUPLICATE_MESSAGE", processedAt: new Date() } });
      return { outcome: "DUPLICATE" as const };
    }
    throw error;
  }
}

/**
 * Sends an immediate contextual reply to a customer, bypassing the job queue.
 * This is what makes customer replies fast — no waiting for the next cron tick.
 *
 * Flow: resolve what to do (deterministic) → generate reply text (LLM) → send via WAHA.
 * The reply is recorded as an outbound message with deliveryState SENT on success.
 */
async function sendImmediateReply(input: {
  orderId: string;
  chatId: string;
  intent: string;
  customerMessage: string;
  conversationState: string;
  extractedDate: string | null;
}) {
  const orderContext = await getOrderContext(input.orderId);
  if (!orderContext) return;

  const decision = await resolveReplyAction({
    intent: input.intent as never,
    extractedDate: input.extractedDate,
    order: orderContext,
    conversationState: input.conversationState,
  });

  const replyText = await generateReplyText({
    decision,
    customerMessage: input.customerMessage,
    extractedDate: input.extractedDate,
  });

  // Send through WAHA immediately.
  const apiUrl = process.env.MARIE_WAHA_API_URL;
  const apiKey = process.env.MARIE_WAHA_API_KEY;
  const session = process.env.MARIE_WAHA_SESSION ?? "naz";
  if (!apiUrl || !apiKey) return;
  const provider = new WahaProvider(apiUrl, apiKey, session);

  const recipient = `+${input.chatId.replace(/@.*/, "")}`;
  const idempotencyKey = `reply:${input.orderId}:${Date.now()}`;

  try {
    const ack = await provider.sendText({
      recipient,
      body: replyText,
      idempotencyKey,
    });

    // Record the outbound message.
    await db.customerMessage.create({
      data: {
        conversationId: (await db.customerConversation.findFirst({
          where: { orderId: input.orderId },
          select: { id: true },
        }))?.id ?? "",
        direction: "OUTBOUND",
        providerMessageId: ack.providerMessageId,
        idempotencyKey,
        body: replyText,
        bodyHash: createHash("sha256").update(replyText).digest("hex"),
        messageType: "TEXT",
        deliveryState: "SENT",
      },
    });

    await db.automationEvent.create({
      data: {
        orderId: input.orderId,
        eventType: "INSTANT_REPLY_SENT",
        actor: "MARIE",
        idempotencyKey: `instant-reply:${idempotencyKey}`,
        reasonCode: input.intent,
        metadata: JSON.stringify({ replyAction: decision.action, providerMessageId: ack.providerMessageId }),
      },
    });
  } catch (error) {
    console.error("[marie/webhook] WAHA send failed for instant reply", error instanceof Error ? error.message : "unknown");
  }
}
