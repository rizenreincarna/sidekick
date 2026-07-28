import { NextResponse } from "next/server";
import { constantTimeSecretMatches } from "@/lib/marie-auth";
import { processTelegramApproval, telegramApprovalSchema } from "@/lib/marie-telegram-approval";

export async function POST(request: Request) {
  if (!constantTimeSecretMatches(process.env.MARIE_TELEGRAM_WEBHOOK_SECRET, request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16 * 1024) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 16 * 1024) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = telegramApprovalSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const result = await processTelegramApproval(parsed.data);
  return NextResponse.json(result, { status: result.outcome === "IDENTITY_REJECTED" ? 403 : 200 });
}
