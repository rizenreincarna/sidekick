import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { generateTOTPSecret, getTOTPURI, generateQRCodeDataURL } from "@/lib/totp";

// GET: Get current 2FA status
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  });

  return NextResponse.json({
    enabled: dbUser?.twoFactorEnabled || false,
    hasSecret: !!dbUser?.twoFactorSecret,
  });
}

// POST: Start 2FA setup — generate secret and QR code
export async function POST() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const secret = generateTOTPSecret();
    const uri = getTOTPURI(user.username || user.id, secret);
    const qrCodeDataURL = await generateQRCodeDataURL(uri);

    // Store the secret temporarily (not enabled yet)
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret },
    });

    return NextResponse.json({
      secret,
      uri,
      qrCode: qrCodeDataURL,
    });
  } catch (error) {
    console.error("[2fa/setup] POST error:", error);
    return NextResponse.json({ error: "Failed to setup 2FA" }, { status: 500 });
  }
}
