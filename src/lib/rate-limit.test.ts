import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit, resetRateLimit } from "./rate-limit";

describe("rate limiter", () => {
  afterEach(() => vi.useRealTimers());

  it("allows up to the limit then blocks", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("t", "k", 5, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit("t", "k", 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window", () => {
    vi.useFakeTimers();
    checkRateLimit("t2", "k", 1, 1_000);
    expect(checkRateLimit("t2", "k", 1, 1_000).allowed).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit("t2", "k", 1, 1_000).allowed).toBe(true);
  });

  it("tracks buckets and keys independently", () => {
    expect(checkRateLimit("a", "u1", 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit("a", "u2", 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit("b", "u1", 1, 60_000).allowed).toBe(true);
    resetRateLimit("a", "u1");
    expect(checkRateLimit("a", "u1", 1, 60_000).allowed).toBe(true);
  });
});
