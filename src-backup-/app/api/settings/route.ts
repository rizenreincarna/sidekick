import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/settings
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const settings = await db.setting.findMany({
      where: { userId: user.id },
    });
    const config: Record<string, string> = {};
    for (const s of settings) {
      config[s.key] = s.value;
    }
    return NextResponse.json(config);
  } catch (error) {
    console.error("[settings] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch settings." }, { status: 500 });
  }
}

// PUT /api/settings
export async function PUT(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        if (key.length > 50) continue; // Skip invalid keys
        if (value.length > 5000) continue; // Skip unreasonably long values
        await db.setting.upsert({
          where: { userId_key: { userId: user.id, key } },
          update: { value },
          create: { key, value, userId: user.id },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[settings] PUT error:", error);
    return NextResponse.json({ error: "Failed to save settings. Please try again." }, { status: 500 });
  }
}
