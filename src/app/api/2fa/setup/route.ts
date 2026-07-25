import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { generateTOTPSecret, getTOTPURI, generateQRCodeDataURL, verifyTOTP } from "@/lib/totp";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { encryptSecret, decryptSecret } from "@/lib/secrets";

// GET: Get current 2FA status (never returns secrets)
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true },
  });

  return NextResponse.json({ enabled: dbUser?.twoFactorEnabled || false });
}

// POST: Start 2FA setup.
// - Requires the account password (re-authentication).
// - If 2FA is already enabled, also requires a current valid TOTP code to rotate.
// - Stores a pending secret WITHOUT flipping twoFactorEnabled until verify.
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rl = checkRateLimit("2fa-setup", clientKeyFromRequest(request, user.id), 5, 15 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { password?: string; totp?: string };
    if (!body.password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const dbUser = await db.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const passwordOk = await bcrypt.compare(body.password, dbUser.password);
    if (!passwordOk) {
      return NextResponse.json({ error: "Invalid password" }, { status: 403 });
    }

    if (dbUser.twoFactorEnabled && dbUser.twoFactorSecret) {
      if (!body.totp || !verifyTOTP(body.totp, decryptSecret(dbUser.twoFactorSecret))) {
        return NextResponse.json({ error: "Current 2FA code required to change 2FA" }, { status: 403 });
      }
    }

    const secret = generateTOTPSecret();
    const uri = getTOTPURI(user.username || user.id, secret);
    const qrCodeDataURL = await generateQRCodeDataURL(uri);

    // Store as pending secret; verify step promotes it and enables 2FA.
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false },
    });

    return NextResponse.json({ secret, uri, qrCode: qrCodeDataURL });
  } catch (error) {
    console.error("[2fa/setup] POST error:", error);
    return NextResponse.json({ error: "Failed to setup 2FA" }, { status: 500 });
  }
}
