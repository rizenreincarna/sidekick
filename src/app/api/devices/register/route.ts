import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";

// POST /api/devices/register — register an Android device's FCM token.
// Body: { token, platform? }
// The token is upserted per (userId, token) so re-registration is idempotent.
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const token = String(body.token || "").trim();
    const platform = String(body.platform || "android").trim();
    const previousToken = String(body.previousToken || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    if (token.length > 500) {
      return NextResponse.json({ error: "Token too long" }, { status: 400 });
    }

    // If a previous token was sent (rotation), deactivate it for this user.
    if (previousToken && previousToken !== token) {
      await db.deviceToken.updateMany({
        where: { userId: user.id, token: previousToken },
        data: { isActive: false },
      });
    }

    // Upsert by unique (userId, token)
    const existing = await db.deviceToken.findUnique({
      where: { userId_token: { userId: user.id, token } },
    });

    if (existing) {
      await db.deviceToken.update({
        where: { id: existing.id },
        data: { isActive: true, platform, updatedAt: new Date() },
      });
    } else {
      await db.deviceToken.create({
        data: { userId: user.id, token, platform },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[devices/register] error:", error);
    return NextResponse.json({ error: "Failed to register device." }, { status: 500 });
  }
}

// DELETE /api/devices/register — unregister a token (e.g. on logout)
export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const token = String(body.token || "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    await db.deviceToken.updateMany({
      where: { userId: user.id, token },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[devices/register] DELETE error:", error);
    return NextResponse.json({ error: "Failed to unregister device." }, { status: 500 });
  }
}