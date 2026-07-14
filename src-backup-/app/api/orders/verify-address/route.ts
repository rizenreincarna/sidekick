import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { verifyOrderAddress, batchVerifyOrderAddresses } from "@/lib/address-verify";

// POST /api/orders/verify-address - Manually verify address for one or more orders
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const body = await request.json() as { orderId?: string; orderIds?: string[] };

    // Single order verification
    if (body.orderId) {
      const result = await verifyOrderAddress(body.orderId);
      return NextResponse.json({
        success: true,
        verified: result.verified,
        confidence: result.confidence,
        note: result.note,
        normalizedAddress: result.normalizedAddress,
        suggestedCity: result.suggestedCity,
        suggestedZone: result.suggestedZone,
        updated: result.updated,
      });
    }

    // Batch verification
    if (body.orderIds && Array.isArray(body.orderIds) && body.orderIds.length > 0) {
      if (body.orderIds.length > 50) {
        return NextResponse.json(
          { error: "Maximum 50 orders per batch verification request" },
          { status: 400 }
        );
      }

      const result = await batchVerifyOrderAddresses(body.orderIds);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    return NextResponse.json(
      { error: "Provide orderId (single) or orderIds (batch) in request body" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[orders/verify-address] POST error:", error);
    return NextResponse.json({ error: "Address verification failed. Please try again." }, { status: 500 });
  }
}
