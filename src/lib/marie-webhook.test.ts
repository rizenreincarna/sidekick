import { describe, expect, it } from "vitest";
import { parseWahaIdentifier, validateWahaSource, wahaWebhookSchema } from "./marie-webhook";

describe("WAHA GOWS webhook schema", () => {
  it("accepts top-level payload body and text fallback", () => {
    expect(wahaWebhookSchema.parse({ id: "delivery-1", event: "message", session: "naz", engine: "GOWS", payload: { body: "yes", from: "60123456789@c.us", fromMe: false, id: "a", timestamp: 123 } }).payload.body).toBe("yes");
    expect(wahaWebhookSchema.parse({ event: "message.any", session: "naz", payload: { text: { body: "yes" }, from: "x@lid", id: { _serialized: "b" } } })).toBeTruthy();
  });

  it("accepts ACK fixtures and validates session/event", () => {
    const ack = wahaWebhookSchema.parse({ id: "delivery-ack", event: "message.ack", session: "naz", payload: { id: "provider-1", ack: 3 }, extra: true });
    expect(validateWahaSource(ack, "naz")).toBeNull();
    expect(validateWahaSource({ ...ack, session: "other" }, "naz")).toBe("UNEXPECTED_SESSION");
  });

  it("does not expose an inbound activation option in the current config contract", async () => {
    const { DEFAULT_MARIE_CONFIG } = await import("./marie-config");
    expect(DEFAULT_MARIE_CONFIG.inboundProcessingEnabled).toBe(false);
  });

  it("never infers a phone from a LID and detects groups", () => {
    expect(parseWahaIdentifier("123456789@lid")).toEqual({ chatId: "123456789@lid", lid: "123456789@lid", phone: null, group: false });
    expect(parseWahaIdentifier("1203-456@g.us").group).toBe(true);
  });
});
