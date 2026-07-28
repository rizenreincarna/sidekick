import { describe, expect, it } from "vitest";
import { telegramApprovalSchema } from "./marie-telegram-approval";

describe("Telegram owner approval schema", () => {
  it("accepts only private positive identities and a bounded message", () => {
    expect(telegramApprovalSchema.safeParse({ message: { message_id: 1, chat: { id: 123456, type: "private" }, from: { id: 123456 }, text: "APPROVE 01234567-89ab-cdef" } }).success).toBe(true);
    expect(telegramApprovalSchema.safeParse({ message: { message_id: 1, chat: { id: -100123, type: "group" }, from: { id: 123456 }, text: "APPROVE 01234567-89ab-cdef" } }).success).toBe(false);
  });
});
