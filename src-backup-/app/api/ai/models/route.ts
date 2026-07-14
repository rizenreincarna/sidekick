import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getAiSettings } from "@/lib/deepseek";

// GET /api/ai/models — fetch available models from the configured OpenAI-compatible
// provider (Ollama /v1/models, OpenAI /v1/models, etc.). Returns an array of model ids.
export async function GET() {
  const { user, error } = await requireAdmin();
  if (error || !user) {
    return NextResponse.json({ error: error === "Forbidden" ? "Admin access required." : "Unauthorized" }, { status: error ? 403 : 401 });
  }

  try {
    const settings = await getAiSettings();
    if (!settings.apiKey) {
      return NextResponse.json({ error: "No API key configured.", models: [] }, { status: 400 });
    }

    const base = settings.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/v1/models`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Provider returned ${res.status}: ${txt.slice(0, 120)}`, models: [] },
        { status: 200 }
      );
    }

    const data = await res.json() as {
      data?: Array<{ id: string }>;
      models?: Array<{ name?: string; model?: string }>;
    };

    // Support both OpenAI-style (data[].id) and Ollama-style (models[].name) shapes.
    const models: string[] = [];
    if (Array.isArray(data.data)) {
      for (const m of data.data) if (m?.id) models.push(m.id);
    }
    if (Array.isArray(data.models)) {
      for (const m of data.models) {
        const id = m?.name || m?.model;
        if (id) models.push(id);
      }
    }

    // De-dup + sort
    const unique = Array.from(new Set(models)).sort();
    return NextResponse.json({ models: unique });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg, models: [] }, { status: 200 });
  }
}