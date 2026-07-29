import { NextRequest, NextResponse } from "next/server";
import { bearerToken, constantTimeSecretMatches } from "@/lib/marie-auth";
import { runMarieWorker, runNoReplySweep } from "@/lib/marie-outbound";

export async function POST(request: NextRequest) {
  if (!constantTimeSecretMatches(process.env.MARIE_INTERNAL_TOKEN, bearerToken(request.headers.get("authorization")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const workerResult = await runMarieWorker();
  const sweepResult = await runNoReplySweep();
  return NextResponse.json({ worker: workerResult, sweep: sweepResult });
}
