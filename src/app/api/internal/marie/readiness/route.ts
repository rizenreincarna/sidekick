import { NextResponse } from "next/server";
import { bearerToken, constantTimeSecretMatches } from "@/lib/marie-auth";
import { getMarieReadiness } from "@/lib/marie-readiness";

export async function GET(request: Request) {
  if (!constantTimeSecretMatches(process.env.MARIE_INTERNAL_TOKEN, bearerToken(request.headers.get("authorization")))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getMarieReadiness());
}
