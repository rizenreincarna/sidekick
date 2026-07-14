import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { validateApiKey } from "@/lib/deepseek";

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error || !user) return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error ? 403 : 401 });

  try {
    const settings = await db.setting.findMany({ where: { userId: user.id } });
    const config: Record<string, string> = {};
    for (const s of settings) {
      if (s.key.startsWith("ai_")) config[s.key] = s.value;
    }

    return NextResponse.json({
      ai_enabled: config.ai_enabled || "false",
      ai_model: config.ai_model || "deepseek-chat",
      ai_base_url: config.ai_base_url || "https://api.deepseek.com",
      ai_has_api_key: (config.ai_api_key?.length || 0) > 0,
      ai_api_key_preview: config.ai_api_key ? `${config.ai_api_key.slice(0, 6)}...${config.ai_api_key.slice(-4)}` : "",
      ai_system_prompt: config.ai_system_prompt || "",
    });
  } catch (error) {
    console.error("[ai/settings] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch AI settings." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { user, error } = await requireAdmin();
  if (error || !user) return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error ? 403 : 401 });

  try {
    const body = await request.json() as {
      ai_api_key?: string;
      ai_base_url?: string;
      ai_model?: string;
      ai_enabled?: string;
      ai_system_prompt?: string;
    };

    // Validate API key if provided
    if (body.ai_api_key) {
      const baseUrl = body.ai_base_url || "https://api.deepseek.com";
      const model = body.ai_model || "deepseek-chat";
      const validation = await validateApiKey(body.ai_api_key, baseUrl, model);
      if (!validation.valid) {
        return NextResponse.json({ error: `API key validation failed: ${validation.error}` }, { status: 400 });
      }
    }

    // Save each setting
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" && key.startsWith("ai_") && key.length <= 50) {
        await db.setting.upsert({
          where: { userId_key: { userId: user.id, key } },
          update: { value },
          create: { key, value, userId: user.id },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ai/settings] PUT error:", error);
    return NextResponse.json({ error: "Failed to save AI settings." }, { status: 500 });
  }
}
