import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { verifyTOTP } from "@/lib/totp";

// POST: Verify a TOTP code and enable 2FA
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { token, enable } = (await request.json()) as { token: string; enable?: boolean };

    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!dbUser?.twoFactorSecret) {
      return NextResponse.json({ error: "2FA not set up. Run setup first." }, { status: 400 });
    }

    const isValid = verifyTOTP(token, dbUser.twoFactorSecret);
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
