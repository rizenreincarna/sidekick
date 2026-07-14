import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { getAiSettings } from "@/lib/deepseek";

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { address, city } = await request.json() as { address?: string; city?: string };
    if (!address && !city) return NextResponse.json({ error: "Address or city required" }, { status: 400 });

    // Sanitize user input to prevent prompt injection
    const safeAddress = (address || "N/A").replace(/[\n\r]/g, " ").slice(0, 200);
    const safeCity = (city || "N/A").replace(/[\n\r]/g, " ").slice(0, 100);

    const settings = await getAiSettings();
    if (!settings.enabled || !settings.apiKey) {
      return NextResponse.json({ error: "AI not configured" }, { status: 403 });
    }

    // Use DeepSeek to analyze the address and determine zone
    const prompt = `Analyze this Malaysian address and determine the most appropriate zone.

Address: ${safeAddress}
City/Area: ${safeCity}

Zones:
1=KL City Centre (KLCC, Ampang, Bangsar, Setapak, etc)
2=West Selangor (Damansara, PJ, Subang, Kepong, Mont Kiara, etc)
3=East Selangor (Cheras, Kajang, Cyberjaya, Putrajaya, etc)
4=Lower Selangor (Shah Alam, Puchong, Klang, Sepang, etc)
5=Others (Rawang, far areas)
8=Johor, 9=Penang, 10=Perak, 11=Negeri Sembilan/Melaka, 12=Pahang/Terengganu, 13=Kelantan, 14=Sabah/Sarawak

Respond in JSON only:
{"zone": number, "confidence": "high"|"medium"|"low", "area": "normalized area name", "state": "state name"}`;

    const response = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${settings.apiKey}` },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0,
      }),
    });

    if (!response.ok) return NextResponse.json({ error: "AI request failed" }, { status: 500 });

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as { zone: number; confidence: string; area: string; state: string };
      return NextResponse.json(result);
    }

    return NextResponse.json({ zone: 5, confidence: "low", area: city || "", state: "Unknown" });
  } catch (error) {
    console.error("[ai/verify-address] error:", error);
    return NextResponse.json({ error: "Failed to verify address" }, { status: 500 });
  }
}
