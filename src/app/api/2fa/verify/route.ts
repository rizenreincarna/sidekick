import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { verifyTOTP } from "@/lib/totp";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { decryptSecret } from "@/lib/secrets";

// POST: Verify a TOTP code and enable 2FA
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rl = checkRateLimit("2fa-verify", clientKeyFromRequest(request, user.id), 10, 5 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
    const { token, enable } = (await request.json()) as { token: string; enable?: boolean };

    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!dbUser?.twoFactorSecret) {
      return NextResponse.json({ error: "2FA not set up. Run setup first." }, { status: 400 });
    }

    const isValid = verifyTOTP(token, decryptSecret(dbUser.twoFactorSecret));
    if (!isValid) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    if (enable) {
      await db.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true },
      });
    }

    return NextResponse.json({ valid: true, enabled: enable ? true : dbUser.twoFactorEnabled });
  } catch (error) {
    console.error("[2fa/verify] error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
