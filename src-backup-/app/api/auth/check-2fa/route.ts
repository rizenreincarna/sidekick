import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();

    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { username },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        isActive: true,
        isApproved: true,
      },
    });

    // Don't reveal whether user exists — just return requires2FA: false
    // The actual signIn will handle the "user not found" case
    if (!user || !user.isActive || !user.isApproved) {
      return NextResponse.json({ requires2FA: false });
    }

    return NextResponse.json({
      requires2FA: user.twoFactorEnabled && !!user.twoFactorSecret,
    });
  } catch {
    return NextResponse.json({ requires2FA: false });
  }
}
