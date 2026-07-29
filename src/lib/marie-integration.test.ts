import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { executeClaimedJob, recoverExpiredRunningJobs, reserveOutboundRate, runNoReplySweep, type WorkerConfig } from "./marie-outbound";

const directory = mkdtempSync(join(tmpdir(), "marie-gate3-"));
const databasePath = join(directory, "integration.sqlite");
const databaseUrl = `file:${databasePath}`;
let client: PrismaClient;

const pilotConfig: WorkerConfig = {
  enabled: true, mode: "PILOT", contactStartHour: 8, contactEndHour: 20,
  pilotAllowlist: ["+60123456789"], maxMessagesPerRun: 10,
  maxMessagesPerHour: 100, maxMessagesPerDay: 100, maxRetries: 2,
  // Anti-blocking indicators are off in tests; integration.t expects fast timeouts.
  typingIndicators: false,
} as WorkerConfig;
const now = new Date("2026-07-28T04:00:00.000Z");

beforeAll(() => {
  execFileSync(join(process.cwd(), "node_modules/.bin/prisma"), ["migrate", "deploy"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "ignore" });
  client = new PrismaClient({ datasourceUrl: databaseUrl });
}, 120_000);

beforeEach(async () => {
  await client.automationRateReservation.deleteMany();
  await client.automationEvent.deleteMany();
  await client.customerEscalation.deleteMany();
  await client.automationJob.deleteMany();
  await client.customerMessage.deleteMany();
  await client.customerConversation.deleteMany();
  await client.order.deleteMany();
  await client.user.deleteMany();
});

afterAll(async () => {
  await client?.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

async function fixture(suffix: string, options: { jobState?: string; messageState?: string; leaseUntil?: Date } = {}) {
  const user = await client.user.create({ data: { username: `gate3-${suffix}`, password: "unused" } });
  const order = await client.order.create({ data: { orderId: `G3-${suffix}`, customerName: "Test", phone: "+60123456789", address: "1 Test Road", city: "KL", size: "S", points: 1, zone: 1, userId: user.id, status: "SCHEDULED" } });
  const conversation = await client.customerConversation.create({ data: { orderId: order.id, chatId: `60123456789-${suffix}@c.us`, normalizedPhone: "+60123456789" } });
  // The anti-blocking rule requires at least one inbound message before Marie may ever send.
  await client.customerMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      idempotencyKey: `inbound-first-${suffix}`,
      body: "hi",
      deliveryState: "RECEIVED",
    },
  });
  const message = await client.customerMessage.create({ data: { conversationId: conversation.id, direction: "OUTBOUND", idempotencyKey: `message-${suffix}`, body: "test", deliveryState: options.messageState ?? "QUEUED" } });
  const job = await client.automationJob.create({ data: { orderId: order.id, conversationId: conversation.id, kind: "SEND_CUSTOMER_MESSAGE", idempotencyKey: `job-${suffix}`, runAfter: now, state: options.jobState ?? "RUNNING", leaseToken: "lease", leaseUntil: options.leaseUntil ?? new Date(now.getTime() + 60_000), attempts: 1, payload: JSON.stringify({ messageId: message.id }) } });
  return { user, order, conversation, message, job };
}

/**
 * Builds a CONTACTED order whose first contact was acknowledged `contactedHoursAgo` ago,
 * optionally with a final nudge already sent, so the no-reply timeline can be exercised.
 */
async function noReplyFixture(suffix: string, options: { contactedHoursAgo: number; nudgeHoursAgo?: number }) {
  const user = await client.user.create({ data: { username: `nr-${suffix}`, password: "unused" } });
  const order = await client.order.create({ data: { orderId: `NR-${suffix}`, customerName: "Test", phone: "+60123456789", address: "1 Test Road", city: "KL", size: "S", points: 1, zone: 1, userId: user.id, status: "CONTACTED", scheduledDate: "2026-07-31" } });
  const conversation = await client.customerConversation.create({ data: { orderId: order.id, chatId: `nr-${suffix}@c.us`, normalizedPhone: "+60123456789", state: "ACTIVE" } });
  const firstContact = await client.customerMessage.create({ data: {
    conversationId: conversation.id, direction: "OUTBOUND", idempotencyKey: `first-${suffix}`,
    body: "initial contact", deliveryState: "SENT",
    createdAt: new Date(now.getTime() - options.contactedHoursAgo * 3_600_000),
  } });
  if (options.nudgeHoursAgo !== undefined) {
    await client.customerMessage.create({ data: {
      conversationId: conversation.id, direction: "OUTBOUND", idempotencyKey: `nudge:${order.id}`,
      body: "final nudge", deliveryState: "SENT",
      createdAt: new Date(now.getTime() - options.nudgeHoursAgo * 3_600_000),
    } });
  }
  return { user, order, conversation, firstContact };
}

describe("Marie disposable SQLite integration", () => {
  it("keeps automation hard-disabled after all migrations", async () => {
    await expect(client.marieAutomationConfig.findUniqueOrThrow({ where: { id: "default" } })).resolves.toMatchObject({ enabled: false, mode: "DRY_RUN", escalationEnabled: false, inboundProcessingEnabled: false });
  });

  it("allows only one compare-and-set lease winner", async () => {
    const job = await client.automationJob.create({ data: { kind: "TEST", idempotencyKey: "claim", runAfter: now, state: "PENDING" } });
    const winners = await Promise.all(["a", "b"].map(token => client.automationJob.updateMany({ where: { id: job.id, state: "PENDING", leaseUntil: null }, data: { state: "RUNNING", leaseToken: token, leaseUntil: new Date(now.getTime() + 60_000) } })));
    expect(winners.reduce((sum, result) => sum + result.count, 0)).toBe(1);
  });

  it("reserves exactly one of two distinct same-user messages at limit one", async () => {
    const first = await fixture("rate-a");
    const secondOrder = await client.order.create({ data: { orderId: "G3-rate-b", customerName: "Test", phone: "+60123456789", address: "2 Test Road", city: "KL", size: "S", points: 1, zone: 1, userId: first.user.id, status: "SCHEDULED" } });
    const secondConversation = await client.customerConversation.create({ data: { orderId: secondOrder.id, chatId: "rate-b@c.us", normalizedPhone: "+60123456789" } });
    const secondMessage = await client.customerMessage.create({ data: { conversationId: secondConversation.id, direction: "OUTBOUND", idempotencyKey: "message-rate-b", body: "test", deliveryState: "QUEUED" } });
    const results = await Promise.all([
      reserveOutboundRate({ userId: first.user.id, conversationId: first.conversation.id, messageId: first.message.id, maxHour: 1, maxDay: 1, now }, client),
      reserveOutboundRate({ userId: first.user.id, conversationId: secondConversation.id, messageId: secondMessage.id, maxHour: 1, maxDay: 1, now }, client),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(client.automationRateReservation.count({ where: { userId: first.user.id } })).resolves.toBe(1);
  });

  it("marks an adapter throw uncertain and retains its reservation without retry", async () => {
    const item = await fixture("uncertain");
    const provider = { sendText: vi.fn().mockRejectedValue(new Error("timeout")) };
    await expect(executeClaimedJob(item.job.id, "lease", provider, pilotConfig, now, client)).resolves.toMatchObject({ outcome: "SEND_UNCERTAIN" });
    await expect(client.customerMessage.findUniqueOrThrow({ where: { id: item.message.id } })).resolves.toMatchObject({ deliveryState: "SEND_UNCERTAIN" });
    await expect(client.automationJob.findUniqueOrThrow({ where: { id: item.job.id } })).resolves.toMatchObject({ state: "RECONCILIATION_REQUIRED" });
    await expect(client.automationRateReservation.count({ where: { messageId: item.message.id } })).resolves.toBe(1);
  });

  it("retries expired RUNNING queued work but reconciles expired SENDING work", async () => {
    const expired = new Date(now.getTime() - 1);
    const queued = await fixture("expired-running", { leaseUntil: expired });
    const sending = await fixture("expired-sending", { jobState: "SENDING", messageState: "SENDING", leaseUntil: expired });
    await expect(recoverExpiredRunningJobs(now, client)).resolves.toEqual({ retried: 1, reconciliationRequired: 1 });
    await expect(client.automationJob.findUniqueOrThrow({ where: { id: queued.job.id } })).resolves.toMatchObject({ state: "RETRY" });
    await expect(client.automationJob.findUniqueOrThrow({ where: { id: sending.job.id } })).resolves.toMatchObject({ state: "RECONCILIATION_REQUIRED" });
    await expect(client.customerMessage.findUniqueOrThrow({ where: { id: sending.message.id } })).resolves.toMatchObject({ deliveryState: "SEND_UNCERTAIN" });
  });

  it("does not nudge or cancel before the 22-hour mark", async () => {
    await noReplyFixture("early", { contactedHoursAgo: 5 });
    await expect(runNoReplySweep({ config: pilotConfig, now, database: client }))
      .resolves.toMatchObject({ nudged: 0, canceled: 0 });
  });

  it("sends exactly one final nudge at 22 hours and does not cancel yet", async () => {
    const item = await noReplyFixture("nudge", { contactedHoursAgo: 22 });
    await expect(runNoReplySweep({ config: pilotConfig, now, database: client }))
      .resolves.toMatchObject({ nudged: 1, canceled: 0 });
    await expect(client.order.findUniqueOrThrow({ where: { id: item.order.id } }))
      .resolves.toMatchObject({ status: "CONTACTED" });

    // A second sweep must not enqueue a duplicate nudge.
    await expect(runNoReplySweep({ config: pilotConfig, now, database: client }))
      .resolves.toMatchObject({ nudged: 0, canceled: 0 });
    await expect(client.customerMessage.count({
      where: { conversationId: item.conversation.id, idempotencyKey: { startsWith: "nudge:" } },
    })).resolves.toBe(1);
  });

  it("cancels at 24 hours once the nudge was sent and records audit evidence", async () => {
    const item = await noReplyFixture("cancel", { contactedHoursAgo: 24, nudgeHoursAgo: 2 });
    await expect(runNoReplySweep({ config: pilotConfig, now, database: client }))
      .resolves.toMatchObject({ canceled: 1 });
    await expect(client.order.findUniqueOrThrow({ where: { id: item.order.id } }))
      .resolves.toMatchObject({ status: "CANCELED" });
    await expect(client.automationEvent.findFirstOrThrow({
      where: { orderId: item.order.id, eventType: "AUTO_CANCELED_NO_REPLY" },
    })).resolves.toMatchObject({ beforeState: "CONTACTED", afterState: "CANCELED", reasonCode: "NO_REPLY_24H", actor: "MARIE" });

    // Idempotent: a repeat sweep must not cancel twice.
    await expect(runNoReplySweep({ config: pilotConfig, now, database: client }))
      .resolves.toMatchObject({ canceled: 0 });
  });

  it("never cancels past the deadline when no nudge was ever sent", async () => {
    const item = await noReplyFixture("unwarned", { contactedHoursAgo: 72 });
    await expect(runNoReplySweep({ config: pilotConfig, now, database: client }))
      .resolves.toMatchObject({ nudged: 1, canceled: 0 });
    await expect(client.order.findUniqueOrThrow({ where: { id: item.order.id } }))
      .resolves.toMatchObject({ status: "CONTACTED" });
  });

  it("stops the timeline when the customer replied", async () => {
    const item = await noReplyFixture("replied", { contactedHoursAgo: 30 });
    await client.customerMessage.create({ data: {
      conversationId: item.conversation.id, direction: "INBOUND",
      idempotencyKey: "inbound-replied", body: "yes", deliveryState: "RECEIVED",
    } });
    await expect(runNoReplySweep({ config: pilotConfig, now, database: client }))
      .resolves.toMatchObject({ nudged: 0, canceled: 0 });
    await expect(client.order.findUniqueOrThrow({ where: { id: item.order.id } }))
      .resolves.toMatchObject({ status: "CONTACTED" });
  });

  it("never sweeps operator-owned BOOKED orders", async () => {
    const item = await noReplyFixture("booked", { contactedHoursAgo: 72, nudgeHoursAgo: 2 });
    await client.order.update({ where: { id: item.order.id }, data: { status: "BOOKED" } });
    await expect(runNoReplySweep({ config: pilotConfig, now, database: client }))
      .resolves.toMatchObject({ nudged: 0, canceled: 0 });
    await expect(client.order.findUniqueOrThrow({ where: { id: item.order.id } }))
      .resolves.toMatchObject({ status: "BOOKED" });
  });

  it("stays inert while automation is disabled", async () => {
    await noReplyFixture("disabled", { contactedHoursAgo: 72, nudgeHoursAgo: 2 });
    await expect(runNoReplySweep({ config: { ...pilotConfig, enabled: false }, now, database: client }))
      .resolves.toMatchObject({ state: "DISABLED", nudged: 0, canceled: 0 });
  });

  it("does not call the adapter when the lease expires before the send CAS", async () => {
    const item = await fixture("lease-race", { leaseUntil: new Date(now.getTime() - 1) });
    const provider = { sendText: vi.fn() };
    await expect(executeClaimedJob(item.job.id, "lease", provider, pilotConfig, now, client)).resolves.toMatchObject({ outcome: "LOST_LEASE" });
    expect(provider.sendText).not.toHaveBeenCalled();
    await expect(client.automationRateReservation.count({ where: { messageId: item.message.id } })).resolves.toBe(0);
  });
});
