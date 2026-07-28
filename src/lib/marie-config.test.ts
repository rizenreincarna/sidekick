import { describe, expect, it } from "vitest";
import { DEFAULT_MARIE_CONFIG, parseMarieConfigInput } from "./marie-config";

describe("Marie foundation config gate", () => {
  it("accepts only disabled DRY_RUN configuration", () => {
    expect(parseMarieConfigInput(DEFAULT_MARIE_CONFIG)).toEqual(DEFAULT_MARIE_CONFIG);
    expect(() => parseMarieConfigInput({ ...DEFAULT_MARIE_CONFIG, enabled: true })).toThrow();
    expect(() => parseMarieConfigInput({ ...DEFAULT_MARIE_CONFIG, mode: "PILOT" })).toThrow();
    expect(() => parseMarieConfigInput({ ...DEFAULT_MARIE_CONFIG, mode: "LIVE" })).toThrow();
    expect(() => parseMarieConfigInput({ ...DEFAULT_MARIE_CONFIG, inboundProcessingEnabled: true })).toThrow();
  });
});
