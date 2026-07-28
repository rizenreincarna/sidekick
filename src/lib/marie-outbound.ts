import { randomUUID } from "node:crypto";
import type { AutomationJob, CustomerConversation, Order, Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { getMarieConfig } from "./marie-config";
import { checkModeEligibility, isWithinMytContactWindow, normalizeMalaysianPhone } from "./marie-operations";

export interface MessageProvider {
  sendText(input: { recipient: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>;
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
}

export class WahaProvider implements MessageProvider {
  constructor(private readonly apiUrl: string, private readonly apiKey: string, private readonly session = "naz") {}

  async sendText(input: { recipient: string; body: string; idempotencyKey: string }) {
    const response = await fetch(`${this.apiUrl.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({ session: this.session, chatId: `${input.recipient.replace(/^\+/, "")}@c.us`, text: input.body, idempotencyKey: input.idempotencyKey }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`WAHA_HTTP_${response.status}`);
    const json = await response.json() as { id?: string; key?: { id?: string } };
    const providerMessageId = json.id ?? json.key?.id;
    if (!providerMessageId) throw new Error("WAHA_MISSING_MESSAGE_ID");
    return { providerMessageId };
  }
}

export async function enqueueOutbound(input: { orderId: string; conversationId: string; body: string; idempotencyKey: string; runAfter?: Date }) {
  return db.$transaction(async tx => {
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
  return assessOutboundPolicy({ config, now, phone, orderStatus: order.status, conversationActive: conversation.state === "ACTIVE" && !conversation.pausedAt, activeHold: activeHold > 0, hourCount: 0, dayCount: 0 });
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

const PERMANENT_GATES = new Set(["INVALID_RECIPIENT", "MODE_GATE", "ORDER_STATUS", "CONVERSATION_PAUSED"]);

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
  const reserved = await reserveOutboundRate({ userId: order.userId, conversationId: job.conversation.id, messageId: message.id, maxHour: config.maxMessagesPerHour, maxDay: config.maxMessagesPerDay, now }, database);
  if (!reserved) {
    await database.automationJob.updateMany({ where: { id: job.id, leaseToken }, data: { state: "PENDING", leaseToken: null, leaseUntil: null, lastErrorCode: "RATE_LIMIT", runAfter: new Date(now.getTime() + 60 * 60_000) } });
    return { outcome: "GATED" as const, reason: "RATE_LIMIT" };
  }
  let providerCalled = false;
  let providerMessageId: string | null = null;
  try {
    const enteredSending = await database.$transaction(tx => enterSendingState(tx, { job, messageId: message.id, leaseToken, now }));
    if (!enteredSending) {
      await database.automationRateReservation.deleteMany({ where: { messageId: message.id } });
      return { outcome: "LOST_LEASE" as const };
    }
    providerCalled = true;
    const ack = await provider.sendText({ recipient: job.conversation.normalizedPhone!, body: message.body!, idempotencyKey: message.idempotencyKey });
    providerMessageId = ack.providerMessageId;
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

export async function runMarieWorker(options: { provider?: MessageProvider; config?: WorkerConfig; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const config = options.config ?? await getMarieConfig();
  if (!config.enabled || config.mode !== "PILOT") return { state: config.enabled ? config.mode : "DISABLED", claimed: 0, externalCalls: 0 };
  const apiUrl = process.env.MARIE_WAHA_API_URL;
  const apiKey = process.env.MARIE_WAHA_API_KEY;
  const provider = options.provider ?? (apiUrl && apiKey ? new WahaProvider(apiUrl, apiKey, "naz") : null);
  if (!provider) return { state: "MISSING_PROVIDER_ENV", claimed: 0, externalCalls: 0 };
  let claimed = 0;
  let externalCalls = 0;
  for (; claimed < config.maxMessagesPerRun; claimed++) {
    const job = await claimJob(now);
    if (!job) break;
    const result = await executeClaimedJob(job.id, job.leaseToken, provider, config, now);
    if (result.outcome === "SENT" || ("externalCall" in result && result.externalCall)) externalCalls++;
  }
  return { state: "COMPLETE", claimed, externalCalls };
}
