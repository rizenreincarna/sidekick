import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, isEncrypted } from "./secrets";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-material-for-vitest-0123456789";
});

describe("secrets at-rest encryption", () => {
  it("round-trips a secret", () => {
    const plain = "JBSWY3DPEHPK3PXP-api-key";
    const stored = encryptSecret(plain);
    expect(stored).not.toContain(plain);
    expect(isEncrypted(stored)).toBe(true);
    expect(decryptSecret(stored)).toBe(plain);
  });

  it("is non-deterministic (fresh IV per write)", () => {
    expect(encryptSecret("same-value")).not.toBe(encryptSecret("same-value"));
  });

  it("passes legacy plaintext through on read (lazy migration)", () => {
    expect(decryptSecret("legacy-plaintext")).toBe("legacy-plaintext");
    expect(isEncrypted("legacy-plaintext")).toBe(false);
  });

  it("does not double-encrypt", () => {
    const once = encryptSecret("value");
    expect(encryptSecret(once)).toBe(once);
  });

  it("rejects tampered ciphertext", () => {
    const stored = encryptSecret("value");
    expect(() => decryptSecret(stored.slice(0, -4) + "AAAA")).toThrow();
  });
});
