import { randomUUID } from "node:crypto";
import type { AutomationJob, CustomerConversation, Order, Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { getMarieConfig } from "./marie-config";
import {
  checkModeEligibility,
  isWithinMytContactWindow,
  normalizeMalaysianPhone,
  renderFinalNudgeDraft,
  resolveNoReplyAction,
} from "./marie-operations";
import { proposeSchedule, persistScheduleProposal } from "./marie-scheduler";
import { antiBlockJitter, getAntiBlockConfig } from "./marie-anti-block";

export interface MessageProvider {
  sendText(input: { recipient: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>;
  /** Send "seen" indicator to the contact before processing. Optional. */
  sendSeen?(recipient: string): Promise<void>;
  /** Start typing indicator for a short interval. Optional. */
  startTyping?(recipient: string): Promise<void>;
  /** Stop typing indicator. Optional. */
  stopTyping?(recipient: string): Promise<void>;
}

export interface WorkerConfig {
  enabled: boolean;
  mode: "DRY_RUN" | "PILOT" | "LIVE";
  contactStartHour: number;
  contactEndHour: number;
  pilotAllowlist: string[];
  maxMessagesPerRun: number;
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  maxRetries: number;
  /** Set false to skip typing indicators; used in tests to keep it fast. */
  typingIndicators?: boolean;
  /** ALL / WHITELIST / STOPPED — operator-level contact gate. */
  contactMode?: "ALL" | "WHITELIST" | "STOPPED";
  /** Order numbers (e.g. "26176") Marie may contact when in WHITELIST mode. */
  orderAllowlist?: string[];
  /** Hard cap on outbound sends per worker tick. Defaults to 3 (anti-ban). */
  maxMessagesPerTick?: number;
}

export class WahaProvider implements MessageProvider {
  constructor(private readonly apiUrl: string, private readonly apiKey: string, private readonly session = "naz") {}

  private toChatId(recipient: string): string {
    const local = recipient.replace(/^\+/, "");
    return `${local}@c.us`;
  }

  private headers(): HeadersInit {
    return { "content-type": "application/json", "x-api-key": this.apiKey };
  }

  async sendSeen(recipient: string): Promise<void> {
    try {
      await fetch(`${this.apiUrl.replace(/\/$/, "")}/api/sendSeen`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ session: this.session, chatId: this.toChatId(recipient) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Never block the send path for typing indicators.
    }
  }

  async startTyping(recipient: string): Promise<void> {
    try {
      await fetch(`${this.apiUrl.replace(/\/$/, "")}/api/startTyping`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ session: this.session, chatId: this.toChatId(recipient) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Never block the send path for typing indicators.
    }
  }

  async stopTyping(recipient: string): Promise<void> {
    try {
      await fetch(`${this.apiUrl.replace(/\/$/, "")}/api/stopTyping`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ session: this.session, chatId: this.toChatId(recipient) }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Never block the send path for typing indicators.
    }
  }

  async sendText(input: { recipient: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string }> {
    const response = await fetch(`${this.apiUrl.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ session: this.session, chatId: this.toChatId(input.recipient), text: input.body, idempotencyKey: input.idempotencyKey }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`WAHA_HTTP_${response.status}`);
    const json = await response.json() as { id?: string; key?: { id?: string } };
    const providerMessageId = json.id ?? json.key?.id;
    if (!providerMessageId) throw new Error("WAHA_MISSING_MESSAGE_ID");
    return { providerMessageId };
  }
}

export async function enqueueOutbound(
  input: { orderId: string; conversationId: string; body: string; idempotencyKey: string; runAfter?: Date },
  database: PrismaClient = db,
) {
  return database.$transaction(async tx => {
    const message = await tx.customerMessage.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: { conversationId: input.conversationId, direction: "OUTBOUND", idempotencyKey: input.idempotencyKey, body: input.body, deliveryState: "QUEUED" },
      update: {},
    });
    const job = await tx.automationJob.upsert({
      where: { idempotencyKey: `send:${input.idempotencyKey}` },
      create: { orderId: input.orderId, conversationId: input.conversationId, kind: "SEND_CUSTOMER_MESSAGE", idempotencyKey: `send:${input.idempotencyKey}`, runAfter: input.runAfter ?? new Date(), payload: JSON.stringify({ messageId: message.id }) },
      update: {},
    });
    return { message, job };
  });
}

export async function claimJob(now = new Date(), leaseMs = 60_000, database: PrismaClient = db): Promise<(AutomationJob & { leaseToken: string }) | null> {
  await recoverExpiredRunningJobs(now, database);
  const candidate = await database.automationJob.findFirst({
    where: { kind: "SEND_CUSTOMER_MESSAGE", state: { in: ["PENDING", "RETRY"] }, runAfter: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;
  const leaseToken = randomUUID();
  const claimed = await database.automationJob.updateMany({
    where: { id: candidate.id, state: candidate.state, leaseUntil: candidate.leaseUntil },
    data: { state: "RUNNING", leaseToken, leaseUntil: new Date(now.getTime() + leaseMs), attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  return { ...candidate, state: "RUNNING", leaseToken, leaseUntil: new Date(now.getTime() + leaseMs), attempts: candidate.attempts + 1 };
}

function payloadMessageId(payload: string | null): string | null {
  try {
    const parsed = JSON.parse(payload ?? "{}") as { messageId?: unknown };
    return typeof parsed.messageId === "string" ? parsed.messageId : null;
  } catch {
    return null;
  }
}

export async function recoverExpiredRunningJobs(now = new Date(), database: PrismaClient = db) {
  const expired = await database.automationJob.findMany({ where: { kind: "SEND_CUSTOMER_MESSAGE", state: { in: ["RUNNING", "SENDING"] }, leaseUntil: { lt: now } } });
  let retried = 0;
  let reconciliationRequired = 0;
  for (const job of expired) {
    const messageId = payloadMessageId(job.payload);
    const message = messageId ? await database.customerMessage.findUnique({ where: { id: messageId } }) : null;
    const safeToRetry = job.state === "RUNNING" && isSafeExpiredLeaseRetry(message?.deliveryState ?? null);
    const changed = await database.$transaction(async tx => {
      const updated = await tx.automationJob.updateMany({
      where: { id: job.id, state: job.state, leaseUntil: job.leaseUntil, leaseToken: job.leaseToken },
      data: safeToRetry
        ? { state: "RETRY", leaseUntil: null, leaseToken: null, runAfter: now, lastErrorCode: "LEASE_EXPIRED_PRE_SEND" }
        : { state: "RECONCILIATION_REQUIRED", leaseUntil: null, leaseToken: null, deadLetteredAt: now, lastErrorCode: "LEASE_EXPIRED_AFTER_SEND_START" },
      });
      if (updated.count === 1 && !safeToRetry && message && message.deliveryState !== "SENT") {
        await tx.customerMessage.update({ where: { id: message.id }, data: { deliveryState: "SEND_UNCERTAIN" } });
      }
      return updated;
    });
    if (changed.count === 1) {
      if (safeToRetry) retried++;
      else reconciliationRequired++;
    }
  }
  return { retried, reconciliationRequired };
}

export function isSafeExpiredLeaseRetry(deliveryState: string | null): boolean {
  return deliveryState === "QUEUED" || deliveryState === "RETRY";
}

type LoadedJob = AutomationJob & { conversation: (CustomerConversation & { order: Order | null }) | null };

export function assessOutboundPolicy(input: {
  config: WorkerConfig;
  now: Date;
  phone: string | null;
  orderId?: string | null;
  orderStatus: string | null;
  conversationActive: boolean;
  activeHold: boolean;
  hourCount: number;
  dayCount: number;
}): string | null {
  const { config, now, phone } = input;
  if (!phone) return "INVALID_RECIPIENT";
  const mode = checkModeEligibility(config, phone);
  if (!mode.eligible || config.mode !== "PILOT") return "MODE_GATE";
  if (config.contactMode === "STOPPED") return "CONTACT_MODE_STOPPED";
  if (config.contactMode === "WHITELIST" && input.orderId && !config.orderAllowlist?.includes(input.orderId)) return "ORDER_NOT_WHITELISTED";
  if (!isWithinMytContactWindow(now, config.contactStartHour, config.contactEndHour)) return "CONTACT_WINDOW";
  if (input.orderStatus !== "SCHEDULED" && input.orderStatus !== "CONTACTED") return "ORDER_STATUS";
  if (!input.conversationActive) return "CONVERSATION_PAUSED";
  if (input.activeHold) return "ACTIVE_HOLD";
  if (input.hourCount >= config.maxMessagesPerHour || input.dayCount >= config.maxMessagesPerDay) return "RATE_LIMIT";
  return null;
}

async function eligibility(job: LoadedJob, config: WorkerConfig, now: Date, database: PrismaClient): Promise<string | null> {
  const conversation = job.conversation;
  const order = conversation?.order;
  const phone = conversation?.normalizedPhone ? normalizeMalaysianPhone(conversation.normalizedPhone) : null;
  if (!conversation || !order) return "ORDER_STATUS";
  const activeHold = await database.orderHold.count({ where: { orderId: order.id, state: "ACTIVE" } });
  return assessOutboundPolicy({ config, now, phone, orderId: order.orderId, orderStatus: order.status, conversationActive: conversation.state === "ACTIVE" && !conversation.pausedAt, activeHold: activeHold > 0, hourCount: 0, dayCount: 0 });
}

function mytBuckets(now: Date): { hourBucket: string; dayBucket: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "00";
  const dayBucket = `${part("year")}-${part("month")}-${part("day")}`;
  return { dayBucket, hourBucket: `${dayBucket}T${part("hour")}` };
}

export async function reserveOutboundRate(input: { userId: string; conversationId: string; messageId: string; maxHour: number; maxDay: number; now: Date }, database: PrismaClient = db): Promise<boolean> {
  const { hourBucket, dayBucket } = mytBuckets(input.now);
  try {
    return await database.$transaction(async tx => {
      if (await tx.automationRateReservation.findUnique({ where: { messageId: input.messageId } })) return true;
      const [hourCount, dayCount] = await Promise.all([
        tx.automationRateReservation.count({ where: { userId: input.userId, hourBucket } }),
        tx.automationRateReservation.count({ where: { userId: input.userId, dayBucket } }),
      ]);
      if (hourCount >= input.maxHour || dayCount >= input.maxDay) return false;
      await tx.automationRateReservation.create({ data: { userId: input.userId, conversationId: input.conversationId, messageId: input.messageId, hourBucket, dayBucket } });
      return true;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Error && /unique|constraint|P2002/i.test(error.message)) return Boolean(await database.automationRateReservation.findUnique({ where: { messageId: input.messageId } }));
    if (error instanceof Error && /locked|busy|timeout|P1008|P2028/i.test(error.message)) return false;
    throw error;
  }
}

export function isConsistentOutboundGraph(input: {
  jobOrderId: string | null;
  jobConversationId: string | null;
  orderId: string | null;
  conversationId: string | null;
  messageConversationId: string | null;
  messageDirection: string | null;
  messageState: string | null;
  hasBody: boolean;
  hasPhone: boolean;
}): boolean {
  return Boolean(input.hasBody && input.hasPhone && input.messageDirection === "OUTBOUND"
    && input.messageState && ["QUEUED", "RETRY"].includes(input.messageState)
    && input.jobOrderId && input.jobOrderId === input.orderId
    && input.jobConversationId && input.jobConversationId === input.conversationId
    && input.messageConversationId === input.conversationId);
}

function retryDelay(attempts: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

export function nextMytContactStart(now: Date, startHour: number, endHour: number): Date {
  for (let minutes = 1; minutes <= 24 * 60 + 1; minutes++) {
    const candidate = new Date(now.getTime() + minutes * 60_000);
    if (isWithinMytContactWindow(candidate, startHour, endHour)) return candidate;
  }
  return new Date(now.getTime() + 24 * 60 * 60_000);
}

const PERMANENT_GATES = new Set(["INVALID_RECIPIENT", "MODE_GATE", "CONTACT_MODE_STOPPED", "ORDER_NOT_WHITELISTED", "ORDER_STATUS", "CONVERSATION_PAUSED"]);

async function enterSendingState(tx: Prisma.TransactionClient, input: { job: LoadedJob; messageId: string; leaseToken: string; now: Date }): Promise<boolean> {
  const fresh = await tx.automationJob.findFirst({
    where: { id: input.job.id, kind: "SEND_CUSTOMER_MESSAGE", state: "RUNNING", leaseToken: input.leaseToken, leaseUntil: { gt: input.now } },
    include: { conversation: { include: { order: true } } },
  }) as LoadedJob | null;
  const message = await tx.customerMessage.findUnique({ where: { id: input.messageId } });
  const order = fresh?.conversation?.order;
  if (!fresh || !message || !fresh.conversation || !order || !isConsistentOutboundGraph({
    jobOrderId: fresh.orderId, jobConversationId: fresh.conversationId, orderId: order.id,
    conversationId: fresh.conversation.id, messageConversationId: message.conversationId,
    messageDirection: message.direction, messageState: message.deliveryState,
    hasBody: Boolean(message.body), hasPhone: Boolean(fresh.conversation.normalizedPhone),
  })) return false;
  const jobChanged = await tx.automationJob.updateMany({
    where: { id: fresh.id, state: "RUNNING", leaseToken: input.leaseToken, leaseUntil: { gt: input.now } },
    data: { state: "SENDING" },
  });
  if (jobChanged.count !== 1) return false;
  const messageChanged = await tx.customerMessage.updateMany({
    where: { id: message.id, conversationId: fresh.conversation.id, direction: "OUTBOUND", deliveryState: { in: ["QUEUED", "RETRY"] } },
    data: { deliveryState: "SENDING", sendStartedAt: input.now },
  });
  if (messageChanged.count !== 1) throw new Error("SEND_BOUNDARY_MESSAGE_RACE");
  return true;
}

export async function executeClaimedJob(jobId: string, leaseToken: string, provider: MessageProvider, config: WorkerConfig, now = new Date(), database: PrismaClient = db) {
  const job = await database.automationJob.findFirst({ where: { id: jobId, state: "RUNNING", leaseToken }, include: { conversation: { include: { order: true } } } }) as LoadedJob | null;
  if (!job) return { outcome: "LOST_LEASE" as const };
  const blocked = await eligibility(job, config, now, database);
  if (blocked) {
    const permanent = PERMANENT_GATES.has(blocked);
    await database.automationJob.updateMany({ where: { id: job.id, leaseToken }, data: permanent
      ? { state: "CANCELED", leaseToken: null, leaseUntil: null, lastErrorCode: blocked }
      : { state: "PENDING", leaseToken: null, leaseUntil: null, lastErrorCode: blocked, runAfter: blocked === "CONTACT_WINDOW" ? nextMytContactStart(now, config.contactStartHour, config.contactEndHour) : new Date(now.getTime() + 60 * 60_000) } });
    return { outcome: "GATED" as const, reason: blocked };
  }
  const payload = JSON.parse(job.payload ?? "{}") as { messageId?: string; transitionToContacted?: boolean };
  const message = payload.messageId ? await database.customerMessage.findUnique({ where: { id: payload.messageId } }) : null;
  const order = job.conversation?.order;
  const consistent = isConsistentOutboundGraph({ jobOrderId: job.orderId, jobConversationId: job.conversationId, orderId: order?.id ?? null,
    conversationId: job.conversation?.id ?? null, messageConversationId: message?.conversationId ?? null,
    messageDirection: message?.direction ?? null, messageState: message?.deliveryState ?? null,
    hasBody: Boolean(message?.body), hasPhone: Boolean(job.conversation?.normalizedPhone) });
  if (!consistent || !message || !job.conversation || !order) {
    await database.automationJob.updateMany({ where: { id: job.id, leaseToken }, data: { state: "CANCELED", leaseToken: null, leaseUntil: null, lastErrorCode: "INCONSISTENT_JOB_GRAPH" } });
    return { outcome: "CANCELED" as const, reason: "INCONSISTENT_JOB_GRAPH" };
  }
  // Anti-blocking guard: Marie must NEVER initiate. Only outbound after customer has texted first.
  const jobConversation = job.conversation;
  const hasCustomerInbound = await database.customerMessage.findFirst({
    where: { conversationId: jobConversation.id, direction: "INBOUND" },
    select: { id: true },
  });
  if (!hasCustomerInbound) {
    // The customer hasn't messaged Marie yet. Block this send.
    await database.$transaction(async tx => {
      await tx.customerMessage.update({
        where: { id: message.id },
        data: { deliveryState: "BLOCKED_NO_INBOUND" },
      });
      await tx.automationJob.updateMany({
        where: { id: job.id, leaseToken },
        data: { state: "CANCELED", leaseToken: null, leaseUntil: null, lastErrorCode: "NO_INBOUND" },
      });
      await tx.automationEvent.create({
        data: {
          orderId: order.id,
          conversationId: jobConversation.id,
          eventType: "OUTBOUND_BLOCKED_NO_INBOUND",
          actor: "MARIE",
          idempotencyKey: `anti-block:${message.id}`,
          beforeState: message.deliveryState,
          afterState: "BLOCKED_NO_INBOUND",
          reasonCode: "ANTI_BLOCKING",
        },
      });
    });
    return { outcome: "GATED" as const, reason: "NO_INBOUND" };
  }

  const reserved = await reserveOutboundRate({ userId: order.userId, conversationId: jobConversation.id, messageId: message.id, maxHour: config.maxMessagesPerHour, maxDay: config.maxMessagesPerDay, now }, database);
  if (!reserved) {
    await database.automationJob.updateMany({ where: { id: job.id, leaseToken }, data: { state: "PENDING", leaseToken: null, leaseUntil: null, lastErrorCode: "RATE_LIMIT", runAfter: new Date(now.getTime() + 60 * 60_000) } });
    return { outcome: "GATED" as const, reason: "RATE_LIMIT" };
  }
  let providerCalled = false;
  let providerMessageId: string | null = null;
  try {
    // Anti-blocking sequence: seen -> typing -> jittered delay -> send -> stopTyping.
    const antiBlock = getAntiBlockConfig();
    const typingIndicatorsOn = antiBlock.typingIndicators && config.typingIndicators !== false;
    await provider.sendSeen?.(job.conversation.normalizedPhone!).catch(() => null);
    await provider.startTyping?.(job.conversation.normalizedPhone!).catch(() => null);
    if (typingIndicatorsOn) {
      const delayMs = antiBlockJitter(antiBlock.minInterMessageMs, antiBlock.maxInterMessageMs);
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const enteredSending = await database.$transaction(tx => enterSendingState(tx, { job, messageId: message.id, leaseToken, now }));
    if (!enteredSending) {
      await provider.stopTyping?.(job.conversation.normalizedPhone!).catch(() => null);
      await database.automationRateReservation.deleteMany({ where: { messageId: message.id } });
      return { outcome: "LOST_LEASE" as const };
    }
    providerCalled = true;
    const ack = await provider.sendText({ recipient: job.conversation.normalizedPhone!, body: message.body!, idempotencyKey: message.idempotencyKey });
    providerMessageId = ack.providerMessageId;
    await provider.stopTyping?.(job.conversation.normalizedPhone!).catch(() => null);
    await database.$transaction(async tx => {
      const ownsLease = await tx.automationJob.findFirst({ where: { id: job.id, state: "SENDING", leaseToken } });
      if (!ownsLease) throw new Error("LOST_LEASE_AFTER_SEND");
      await tx.customerMessage.update({ where: { id: message.id }, data: { providerMessageId: ack.providerMessageId, deliveryState: "SENT" } });
      if (payload.transitionToContacted !== false) {
        const transitioned = await tx.order.updateMany({ where: { id: job.orderId!, status: "SCHEDULED" }, data: { status: "CONTACTED" } });
        if (transitioned.count !== 1) throw new Error("ORDER_TRANSITION_RACE");
      }
      await tx.automationJob.updateMany({ where: { id: job.id, state: "SENDING", leaseToken }, data: { state: "SUCCEEDED", leaseToken: null, leaseUntil: null, lastErrorCode: null } });
      await tx.automationEvent.create({ data: { orderId: job.orderId, conversationId: job.conversationId, messageId: message.id, eventType: "OUTBOUND_ACKNOWLEDGED", actor: "MARIE", idempotencyKey: `outbound-ack:${message.id}`, beforeState: job.conversation?.order?.status, afterState: payload.transitionToContacted === false ? job.conversation?.order?.status : "CONTACTED", metadata: JSON.stringify({ providerMessageId: ack.providerMessageId }) } });
    });
    return { outcome: "SENT" as const, externalCall: true };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "PROVIDER_ERROR";
    if (!providerCalled && code === "SEND_BOUNDARY_MESSAGE_RACE") {
      await database.automationRateReservation.deleteMany({ where: { messageId: message.id } });
      return { outcome: "LOST_LEASE" as const };
    }
    if (providerCalled) {
      await database.$transaction(async tx => {
        await tx.customerMessage.update({ where: { id: message.id }, data: { providerMessageId: providerMessageId ?? undefined, deliveryState: "SEND_UNCERTAIN", retryCount: job.attempts } });
        await tx.automationJob.updateMany({ where: { id: job.id, state: "SENDING", leaseToken }, data: { state: "RECONCILIATION_REQUIRED", deadLetteredAt: now, leaseToken: null, leaseUntil: null, lastErrorCode: code } });
        if (!await tx.customerEscalation.findFirst({ where: { orderId: job.orderId, category: "SEND_UNCERTAIN", state: "OPEN" } })) {
          await tx.customerEscalation.create({ data: { orderId: job.orderId, conversationId: job.conversationId, correlationId: randomUUID(), category: "SEND_UNCERTAIN", severity: "HIGH", summary: "Provider acknowledged a message but local commit requires reconciliation" } });
        }
      });
      return { outcome: "SEND_UNCERTAIN" as const, externalCall: true };
    }
    const dead = job.attempts >= config.maxRetries + 1;
    await database.$transaction(async tx => {
      await tx.automationJob.updateMany({ where: { id: job.id, leaseToken }, data: dead
        ? { state: "DEAD_LETTER", deadLetteredAt: now, leaseToken: null, leaseUntil: null, lastErrorCode: code }
        : { state: "RETRY", runAfter: new Date(now.getTime() + retryDelay(job.attempts)), leaseToken: null, leaseUntil: null, lastErrorCode: code } });
      await tx.customerMessage.update({ where: { id: message.id }, data: { deliveryState: dead ? "FAILED" : "RETRY", retryCount: job.attempts } });
      if (dead && !await tx.customerEscalation.findFirst({ where: { orderId: job.orderId, category: "DELIVERY_FAILURE", state: "OPEN" } })) await tx.customerEscalation.create({ data: { orderId: job.orderId, conversationId: job.conversationId, correlationId: randomUUID(), category: "DELIVERY_FAILURE", severity: "HIGH", summary: "Customer message exhausted delivery retries" } });
    });
    return { outcome: dead ? "DEAD_LETTER" as const : "RETRY" as const, externalCall: providerCalled };
  }
}

/**
 * No-reply sweep: sends the 22-hour final nudge and cancels at 24 hours.
 *
 * Cancellation is destructive, so every decision comes from the deterministic
 * `resolveNoReplyAction` policy rather than any LLM. Only CONTACTED orders are considered:
 * BOOKED customers have already agreed and are operator-owned, so they are never swept.
 * Each action is guarded by a unique idempotency key, so a restart or overlapping cron run
 * cannot double-nudge or double-cancel.
 */
export async function runNoReplySweep(options: {
  config?: WorkerConfig;
  now?: Date;
  database?: PrismaClient;
} = {}) {
  const now = options.now ?? new Date();
  const config = options.config ?? await getMarieConfig();
  const database = options.database ?? db;
  if (!config.enabled || config.mode !== "PILOT") {
    return { state: config.enabled ? config.mode : "DISABLED", nudged: 0, canceled: 0 };
  }

  // Only orders Marie herself contacted and that are still awaiting a reply.
  const candidates = await database.customerConversation.findMany({
    where: { state: "ACTIVE", order: { status: "CONTACTED" } },
    include: { order: true, messages: { orderBy: { createdAt: "asc" } } },
  });

  let nudged = 0;
  let canceled = 0;

  for (const conversation of candidates) {
    const order = conversation.order;
    if (!order) continue;

    const firstContact = conversation.messages.find(
      message => message.direction === "OUTBOUND" && message.deliveryState === "SENT",
    );
    if (!firstContact) continue;

    const gate = checkModeEligibility(config, order.phone);
    if (!gate.eligible) continue;
    // STOPPED halts outreach (nudges) but not the auto-cancel safety valve.
    // WHITELIST also filters the sweep — an un-whitelisted order must not be
    // cashed out just because it's in the system.
    if (config.contactMode === "WHITELIST" && !config.orderAllowlist?.includes(order.orderId)) continue;

    const nudge = conversation.messages.find(
      message => message.direction === "OUTBOUND" && message.idempotencyKey.startsWith("nudge:"),
    );
    const decision = resolveNoReplyAction({
      contactedAt: firstContact.createdAt,
      now,
      customerReplied: conversation.messages.some(message => message.direction === "INBOUND"),
      finalNudgeSentAt: nudge?.createdAt ?? null,
      // STOPPED = show the customer no more messages; silently cancel stale orders.
      requireNudge: config.contactMode !== "STOPPED",
    });

    if (decision.action === "SEND_FINAL_NUDGE") {
      if (config.contactMode === "STOPPED") continue; // No outreach while stopped
      await enqueueOutbound({
        orderId: order.id,
        conversationId: conversation.id,
        body: renderFinalNudgeDraft({
          customerName: order.customerName,
          orderRef: order.orderId,
          proposedDate: order.scheduledDate ?? "",
        }),
        idempotencyKey: `nudge:${order.id}`,
        runAfter: isWithinMytContactWindow(now, config.contactStartHour, config.contactEndHour)
          ? now
          : nextMytContactStart(now, config.contactStartHour, config.contactEndHour),
      }, database);
      nudged++;
      continue;
    }

    if (decision.action === "CANCEL") {
      await database.$transaction(async tx => {
        // Fresh read plus status guard: never cancel an order that moved on meanwhile.
        const transitioned = await tx.order.updateMany({
          where: { id: order.id, status: "CONTACTED" },
          data: { status: "CANCELED" },
        });
        if (transitioned.count !== 1) return;
        await tx.customerConversation.update({
          where: { id: conversation.id },
          data: { state: "CLOSED" },
        });
        await tx.automationEvent.create({
          data: {
            orderId: order.id,
            conversationId: conversation.id,
            eventType: "AUTO_CANCELED_NO_REPLY",
            actor: "MARIE",
            idempotencyKey: `auto-cancel:${order.id}`,
            beforeState: "CONTACTED",
            afterState: "CANCELED",
            reasonCode: "NO_REPLY_24H",
            metadata: JSON.stringify({
              contactedAt: firstContact.createdAt.toISOString(),
              finalNudgeAt: nudge?.createdAt.toISOString() ?? null,
              reason: decision.reason,
            }),
          },
        });
        canceled++;
      });
    }
  }

  return { state: "COMPLETE", nudged, canceled };
}

export async function runMarieWorker(options: { provider?: MessageProvider; config?: WorkerConfig; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const config = options.config ?? await getMarieConfig();
  if (!config.enabled || config.mode !== "PILOT") return { state: config.enabled ? config.mode : "DISABLED", claimed: 0, externalCalls: 0, scheduled: 0 };
  const apiUrl = process.env.MARIE_WAHA_API_URL;
  const apiKey = process.env.MARIE_WAHA_API_KEY;
  const provider = options.provider ?? (apiUrl && apiKey ? new WahaProvider(apiUrl, apiKey, "naz") : null);
  if (!provider) return { state: "MISSING_PROVIDER_ENV", claimed: 0, externalCalls: 0, scheduled: 0 };

  // Phase 1: Schedule eligible PENDING orders using the read-only scheduler extraction.
  // This runs before message sending so newly-scheduled orders can be contacted
  // in the same tick if within the contact window.
  let scheduled = 0;
  const userIds = await db.order.findMany({
    where: { status: "PENDING", isErthbox: false },
    select: { userId: true },
    distinct: ["userId"],
  });
  if (config.contactMode === "STOPPED") {
    return { state: "CONTACT_MODE_STOPPED", claimed: 0, externalCalls: 0, scheduled: 0 };
  }
  for (const { userId } of userIds) {
    try {
      const proposal = await proposeSchedule(userId, now);
      for (const item of proposal.proposed) {
        // WHITELIST mode: only proceed for operator-approved orders.
        if (config.contactMode === "WHITELIST" && !config.orderAllowlist?.includes(item.orderId)) continue;
        const persistResult = await persistScheduleProposal({
          internalId: item.internalId,
          date: item.date,
          points: item.points,
        });
        if (persistResult.persisted) {
          scheduled++;
          // Enqueue the initial contact message for this newly-scheduled order.
          await createInitialContactForOrder(item.internalId, now, config);
        }
      }
    } catch (error) {
      console.error("[marie/worker] scheduling failed for user", userId, error instanceof Error ? error.message : "unknown");
    }
  }

  // Phase 2: Send queued messages — capped per tick (anti-ban pacing).
  let claimed = 0;
  let externalCalls = 0;
  const perTick = "maxMessagesPerTick" in config ? Math.min(config.maxMessagesPerRun, (config.maxMessagesPerTick as number ?? 3)) : Math.min(config.maxMessagesPerRun, 3);

  let claimedThisTick = 0;
  for (; claimedThisTick < perTick; claimedThisTick++) {
    const job = await claimJob(now);
    if (!job) break;
    const result = await executeClaimedJob(job.id, job.leaseToken, provider, config, now);
    claimed++;
    if (result.outcome === "SENT" || ("externalCall" in result && result.externalCall)) externalCalls++;
  }
  return { state: "COMPLETE", claimed, externalCalls, scheduled };
}

/**
 * Creates a conversation and enqueues the initial contact message for a
 * newly-scheduled order. Idempotent: safe to call multiple times.
 */
async function createInitialContactForOrder(orderId: string, now: Date, config: WorkerConfig) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderId: true, customerName: true, phone: true, scheduledDate: true, userId: true, address: true, city: true },
  });
  if (!order || !order.scheduledDate || !order.phone) return;

  const normalizedPhone = normalizeMalaysianPhone(order.phone);
  if (!normalizedPhone) return;

  const chatId = `${normalizedPhone.replace(/^\+/, "")}@c.us`;
  const conversation = await db.customerConversation.upsert({
    where: { orderId_chatId: { orderId: order.id, chatId } },
    create: { orderId: order.id, chatId, normalizedPhone, state: "ACTIVE" },
    update: {},
  });

  const { renderInitialContactDraft } = await import("./marie-operations");
  const fullAddress = [order.address, order.city].filter(Boolean).join(", ");
  const body = renderInitialContactDraft({
    customerName: order.customerName,
    orderRef: order.orderId,
    proposedDate: order.scheduledDate,
    address: fullAddress,
  });

  const runAfter = isWithinMytContactWindow(now, config.contactStartHour, config.contactEndHour)
    ? now
    : nextMytContactStart(now, config.contactStartHour, config.contactEndHour);

  await enqueueOutbound({
    orderId: order.id,
    conversationId: conversation.id,
    body,
    idempotencyKey: `initial-contact:${order.id}`,
    runAfter,
  });
}
