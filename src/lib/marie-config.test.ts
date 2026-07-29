import { describe, expect, it } from "vitest";
import { DEFAULT_MARIE_CONFIG, marieConfigSchema, parseMarieConfigInput } from "./marie-config";

describe("Marie foundation config gate", () => {
  it("accepts the disabled DRY_RUN default", () => {
    expect(parseMarieConfigInput(DEFAULT_MARIE_CONFIG)).toEqual(DEFAULT_MARIE_CONFIG);
  });

  it("accepts a valid PILOT configuration with an allowlist", () => {
    const pilot = parseMarieConfigInput({
      ...DEFAULT_MARIE_CONFIG,
      enabled: true,
      mode: "PILOT",
      pilotAllowlist: ["+60187756567"],
      escalationEnabled: true,
      inboundProcessingEnabled: true,
    });
    expect(pilot).toMatchObject({ enabled: true, mode: "PILOT" });
  });

  it("rejects LIVE mode at the schema level", () => {
    expect(() => marieConfigSchema.parse({ ...DEFAULT_MARIE_CONFIG, mode: "LIVE" })).toThrow();
  });

  it("rejects PILOT mode without an allowlist", () => {
    expect(() => parseMarieConfigInput({
      ...DEFAULT_MARIE_CONFIG,
      enabled: true,
      mode: "PILOT",
      pilotAllowlist: [],
    })).toThrow("allowlist");
  });

  it("rejects escalation or inbound processing outside PILOT", () => {
    expect(() => parseMarieConfigInput({
      ...DEFAULT_MARIE_CONFIG,
      enabled: true,
      mode: "DRY_RUN",
      escalationEnabled: true,
    })).toThrow("Escalation can only be enabled in PILOT mode");

    expect(() => parseMarieConfigInput({
      ...DEFAULT_MARIE_CONFIG,
      enabled: true,
      mode: "DRY_RUN",
      inboundProcessingEnabled: true,
    })).toThrow("Inbound processing can only be enabled in PILOT mode");
  });
});
