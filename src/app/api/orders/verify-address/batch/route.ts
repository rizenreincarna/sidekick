import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { verifyOrderAddress } from "@/lib/address-verify";
import {
  createSession,
  updateProgress,
  getProgress,
  completeSession,
  failSession,
} from "@/lib/verify-progress";

// POST /api/orders/verify-address/batch — Start batch verification
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as { orderIds?: string[] };
    if (!body.orderIds || !Array.isArray(body.orderIds) || body.orderIds.length === 0) {
      return NextResponse.json({ error: "Provide orderIds array" }, { status: 400 });
    }
    if (body.orderIds.length > 50) {
      return NextResponse.json({ error: "Maximum 50 orders per batch" }, { status: 400 });
    }

    const orderIds = [...new Set(body.orderIds)];
    const ownedOrders = await db.order.count({
      where: { id: { in: orderIds }, userId: user.id },
    });
    if (ownedOrders !== orderIds.length) {
      return NextResponse.json({ error: "One or more orders were not found" }, { status: 404 });
    }

    const sessionId = createSession(orderIds, user.id);

    // Run verification in background
    (async () => {
      for (let i = 0; i < orderIds.length; i++) {
        const orderId = orderIds[i];
        updateProgress(sessionId, { currentOrder: orderId, done: i });

        try {
          const result = await verifyOrderAddress(orderId);
          updateProgress(sessionId, {
            done: i + 1,
            currentOrder: orderId,
            result: {
              orderId,
              verified: result.verified,
              confidence: result.confidence,
              note: result.note,
              normalizedAddress: result.normalizedAddress,
              suggestedCity: result.suggestedCity,
              suggestedZone: result.suggestedZone,
            },
          });
        } catch (err) {
          updateProgress(sessionId, {
            done: i + 1,
            error: { orderId, error: err instanceof Error ? err.message : "Unknown error" },
          });
        }

        // Rate limiting between verifications
        if (i < orderIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      completeSession(sessionId);
    })().catch(() => failSession(sessionId));

    return NextResponse.json({ sessionId, total: orderIds.length });
  } catch (error) {
    console.error("[verify-address/batch] POST error:", error);
    return NextResponse.json({ error: "Failed to start verification" }, { status: 500 });
  }
}

// GET /api/orders/verify-address/batch?sessionId=X — Poll progress
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const progress = getProgress(sessionId, user.id);
  if (!progress) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(progress);
}
