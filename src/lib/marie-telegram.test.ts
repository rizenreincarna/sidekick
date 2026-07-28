import { describe, expect, it, vi } from "vitest";
import { isPrivateTelegramOwnerId, sendTelegramEscalation } from "./marie-telegram";

describe("Telegram escalation gate", () => {
  it("requires a numeric direct target and all pilot gates", async () => {
    expect(isPrivateTelegramOwnerId("-100123456")).toBe(false);
    expect(isPrivateTelegramOwnerId("12345678")).toBe(true);
    const adapter = { send: vi.fn() };
    const result = await sendTelegramEscalation({ correlationId: "c", category: "RISK", summary: "review" }, { enabled: false, mode: "DRY_RUN", escalationEnabled: false }, adapter as never);
    expect(result.sent).toBe(false);
    expect(adapter.send).not.toHaveBeenCalled();
  });
});
