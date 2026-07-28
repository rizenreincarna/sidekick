import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { executeClaimedJob, recoverExpiredRunningJobs, reserveOutboundRate, type WorkerConfig } from "./marie-outbound";

const directory = mkdtempSync(join(tmpdir(), "marie-gate3-"));
const databasePath = join(directory, "integration.sqlite");
const databaseUrl = `file:${databasePath}`;
let client: PrismaClient;

const pilotConfig: WorkerConfig = {
  enabled: true, mode: "PILOT", contactStartHour: 8, contactEndHour: 20,
  pilotAllowlist: ["+60123456789"], maxMessagesPerRun: 10,
  maxMessagesPerHour: 10, maxMessagesPerDay: 10, maxRetries: 2,
};
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
  const message = await client.customerMessage.create({ data: { conversationId: conversation.id, direction: "OUTBOUND", idempotencyKey: `message-${suffix}`, body: "test", deliveryState: options.messageState ?? "QUEUED" } });
  const job = await client.automationJob.create({ data: { orderId: order.id, conversationId: conversation.id, kind: "SEND_CUSTOMER_MESSAGE", idempotencyKey: `job-${suffix}`, runAfter: now, state: options.jobState ?? "RUNNING", leaseToken: "lease", leaseUntil: options.leaseUntil ?? new Date(now.getTime() + 60_000), attempts: 1, payload: JSON.stringify({ messageId: message.id }) } });
  return { user, order, conversation, message, job };
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

  it("does not call the adapter when the lease expires before the send CAS", async () => {
    const item = await fixture("lease-race", { leaseUntil: new Date(now.getTime() - 1) });
    const provider = { sendText: vi.fn() };
    await expect(executeClaimedJob(item.job.id, "lease", provider, pilotConfig, now, client)).resolves.toMatchObject({ outcome: "LOST_LEASE" });
    expect(provider.sendText).not.toHaveBeenCalled();
    await expect(client.automationRateReservation.count({ where: { messageId: item.message.id } })).resolves.toBe(0);
  });
});
