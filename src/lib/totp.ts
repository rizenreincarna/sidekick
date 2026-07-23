import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { randomBytes } from "crypto";

const APP_NAME = "HERO Sidekick";

export function generateTOTPSecret(): string {
  return generateSecret();
}

export function getTOTPURI(username: string, secret: string): string {
  return generateURI({
    strategy: "totp",
    secret,
    label: encodeURIComponent(username),
    issuer: APP_NAME,
    algorithm: "sha1",
    digits: 6,
    period: 30,
  });
}

export async function generateQRCodeDataURL(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { width: 256, margin: 2 });
}

export function verifyTOTP(token: string, secret: string): boolean {
  try {
    // otplib v13: verifySync returns a VerifyResult OBJECT ({ valid, ... }),
    // never a bare boolean — the object is truthy even when valid:false, so we
    // must read .valid explicitly. epochTolerance: 30s ≈ old window:1 drift.
    const result = verifySync({ token, secret, epochTolerance: 30 });
    return result.valid === true;
  } catch {
    return false;
  }
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
}
