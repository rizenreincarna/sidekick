import { NextResponse } from "next/server";
import { bearerToken, constantTimeSecretMatches } from "@/lib/marie-auth";
import { processWahaWebhook, validateWahaSource, wahaWebhookSchema } from "@/lib/marie-webhook";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const expected = process.env.MARIE_WAHA_WEBHOOK_SECRET;
  const supplied = bearerToken(request.headers.get("authorization")) ?? request.headers.get("x-webhook-secret");
  if (!constantTimeSecretMatches(expected, supplied)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = wahaWebhookSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  const sourceError = validateWahaSource(parsed.data);
  if (sourceError === "UNEXPECTED_SESSION") return NextResponse.json({ error: sourceError }, { status: 422 });
  const result = await processWahaWebhook(parsed.data);
  if (result.outcome === "REJECTED_GROUP" || result.outcome === "REJECTED_EVENT") return NextResponse.json(result, { status: 422 });
  return NextResponse.json(result);
}
