import { z } from "zod";
import { db } from "./db";
import { isPrivateTelegramOwnerId } from "./marie-telegram";

export const telegramApprovalSchema = z.object({
  message: z.object({
    message_id: z.number().int(),
    chat: z.object({ id: z.number().int().positive(), type: z.literal("private") }).passthrough(),
    from: z.object({ id: z.number().int().positive() }).passthrough(),
    text: z.string().trim().min(1).max(500),
  }).passthrough(),
}).passthrough();

const APPROVAL = /^(APPROVE|REJECT)\s+([0-9a-f-]{16,64})$/i;

export async function processTelegramApproval(input: z.infer<typeof telegramApprovalSchema>) {
  const configured = process.env.MARIE_TELEGRAM_OWNER_ID;
  if (!isPrivateTelegramOwnerId(configured)) return { outcome: "NOT_CONFIGURED" as const };
  if (String(input.message.from.id) !== configured || String(input.message.chat.id) !== configured) return { outcome: "IDENTITY_REJECTED" as const };
  const match = APPROVAL.exec(input.message.text);
  if (!match) return { outcome: "INVALID_ACTION" as const };
  const action = match[1].toUpperCase() as "APPROVE" | "REJECT";
  const correlationId = match[2];
  return db.$transaction(async tx => {
    const escalation = await tx.customerEscalation.findUnique({ where: { correlationId } });
    if (!escalation || escalation.state !== "OPEN") return { outcome: "NOT_OPEN" as const };
    await tx.customerEscalation.update({ where: { id: escalation.id }, data: { state: action === "APPROVE" ? "APPROVED" : "REJECTED", resolvedBy: `telegram:${configured}`, resolvedAt: new Date() } });
    if (action === "APPROVE" && escalation.conversationId && escalation.orderId && escalation.proposedAction) {
      await tx.automationJob.upsert({
        where: { idempotencyKey: `telegram-approved:${escalation.id}` },
        create: { orderId: escalation.orderId, conversationId: escalation.conversationId, kind: "OPERATOR_APPROVED_ACTION", state: "PAUSED", idempotencyKey: `telegram-approved:${escalation.id}`, runAfter: new Date(), payload: JSON.stringify({ escalationId: escalation.id, action: escalation.proposedAction }) },
        update: {},
      });
    }
    await tx.automationEvent.create({ data: { orderId: escalation.orderId, conversationId: escalation.conversationId, eventType: `TELEGRAM_${action}`, actor: "OWNER", idempotencyKey: `telegram:${input.message.message_id}`, reasonCode: action, metadata: JSON.stringify({ correlationId }) } });
    return { outcome: action === "APPROVE" ? "APPROVED" as const : "REJECTED" as const };
  });
}
