import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { validateApiKey, getAiSettings, AI_PROVIDERS, type AiProvider } from "@/lib/deepseek";

export async function GET() {
  const { user, error } = await requireAdmin();
  if (error || !user) return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error ? 403 : 401 });

  try {
    const settings = await getAiSettings();
    const dbSettings = await db.setting.findMany({ where: { userId: user.id } });
    const config: Record<string, string> = {};
    for (const s of dbSettings) {
      if (s.key.startsWith("ai_")) config[s.key] = s.value;
    }

    return NextResponse.json({
      ai_provider: settings.provider,
      ai_enabled: config.ai_enabled || "false",
      ai_model: settings.model,
      ai_base_url: settings.baseUrl,
      ai_has_api_key: settings.apiKey.length > 0,
      ai_api_key_preview: settings.apiKey ? `${settings.apiKey.slice(0, 6)}...${settings.apiKey.slice(-4)}` : "",
      ai_system_prompt: settings.systemPrompt,
      ai_agnes_has_key: settings.agnesApiKey.length > 0,
      ai_agnes_key_preview: settings.agnesApiKey ? `${settings.agnesApiKey.slice(0, 6)}...${settings.agnesApiKey.slice(-4)}` : "",
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
      ai_provider?: string;
      ai_api_key?: string;
      ai_agnes_api_key?: string;
      ai_base_url?: string;
      ai_model?: string;
      ai_enabled?: string;
      ai_system_prompt?: string;
    };

    // Determine provider for validation
    const provider = (body.ai_provider || "deepseek") as AiProvider;
    const providerDefaults = AI_PROVIDERS[provider];

    // Determine which key to validate
    let keyToValidate: string | undefined;
    if (provider === "agnes") {
      keyToValidate = body.ai_agnes_api_key;
    } else {
      keyToValidate = body.ai_api_key;
    }

    // Validate API key if provided
    if (keyToValidate) {
      const baseUrl = body.ai_base_url || providerDefaults?.baseUrl || "https://api.deepseek.com";
      const model = body.ai_model || providerDefaults?.model || "deepseek-chat";
      const validation = await validateApiKey(keyToValidate, baseUrl, model);
      if (!validation.valid) {
        return NextResponse.json({ error: `API key validation failed: ${validation.error}` }, { status: 400 });
      }
    }

    // If switching providers, auto-set defaults
    const keysToSave: Record<string, string> = {};

    // Always save provider
    if (body.ai_provider) keysToSave.ai_provider = body.ai_provider;

    // Save the appropriate key based on provider
    if (body.ai_agnes_api_key) keysToSave.ai_agnes_api_key = body.ai_agnes_api_key;
    if (body.ai_api_key) keysToSave.ai_api_key = body.ai_api_key;

    // Save other fields
    if (body.ai_base_url) keysToSave.ai_base_url = body.ai_base_url;
    if (body.ai_model) keysToSave.ai_model = body.ai_model;
    if (body.ai_enabled !== undefined) keysToSave.ai_enabled = body.ai_enabled;
    if (body.ai_system_prompt !== undefined) keysToSave.ai_system_prompt = body.ai_system_prompt;

    // Save each setting
    for (const [key, value] of Object.entries(keysToSave)) {
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
