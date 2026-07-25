import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Authenticated encryption (AES-256-GCM) for secrets stored in the database
// (TOTP seeds, AI API keys). The master key comes from the environment so a
// database dump alone cannot recover plaintext.
//
// Key material: SECRETS_KEY (preferred) or NEXTAUTH_SECRET (fallback).
// Both are already required in production and are 32+ random chars.
//
// Format: "enc:v1:" + base64(iv|tag|ciphertext). Values without the prefix
// are treated as legacy plaintext and passed through, enabling zero-downtime
// lazy migration: reads decrypt-on-read, writes always encrypt.

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const material = process.env.SECRETS_KEY || process.env.NEXTAUTH_SECRET || "";
  if (material.length < 16) {
    throw new Error("SECRETS_KEY or NEXTAUTH_SECRET must be set (>=16 chars) for secret encryption");
  }
  return createHash("sha256").update(material).digest();
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (plaintext.startsWith(PREFIX)) return plaintext; // already encrypted
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncrypted(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PREFIX);
}
