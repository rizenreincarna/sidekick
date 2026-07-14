import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { geocodeAddress } from "@/lib/geocode";
import { NextRequest, NextResponse } from "next/server";

// POST /api/orders/geocode — start batch geocoding (returns sessionId immediately)
// GET /api/orders/geocode?sessionId=xxx — check progress

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId;
    const limit = Math.min(body.limit || 200, 200);

    const where: Record<string, unknown> = {
      OR: [{ latitude: null }, { longitude: null }],
      address: { not: "N/A" },
    };
    if (userId) where.userId = userId;
    if (user.role === "HERO") where.userId = user.id;

    const orders = await db.order.findMany({
      where,
      select: { id: true, orderId: true, address: true, city: true, isErthbox: true, erthboxLocationId: true },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    if (orders.length === 0) {
      return NextResponse.json({ message: "No orders without coordinates found" });
    }

    const sessionId = crypto.randomUUID();
    await db.setting.create({
      data: {
        userId: user.id,
        key: `geocode_session_${sessionId}`,
        value: JSON.stringify({
          total: orders.length, done: 0, status: "running",
          results: [], currentOrder: null,
        }),
      },
    });

    // Run geocoding in background (non-blocking)
    setTimeout(async () => {
      try {
        let done = 0;
        const results: Array<{ orderId: string; lat: number | null; lng: number | null; error?: string; reused?: boolean }> = [];

        for (const order of orders) {
          try {
            const setting = await db.setting.findUnique({
              where: { userId_key: { userId: user.id, key: `geocode_session_${sessionId}` } },
            });
            if (!setting) break;
            const state = JSON.parse(setting.value);
            if (state.status === "cancelled") break;

            state.currentOrder = order.orderId;
            await db.setting.update({
              where: { id: setting.id },
              data: { value: JSON.stringify(state) },
            });

            // ERTHBOX deduplication: if a sibling order with the same locationId
            // already has coordinates, reuse them instead of calling Google Maps.
            let geo: { latitude: number; longitude: number } | null = null;
            let reused = false;

            if (order.isErthbox && order.erthboxLocationId) {
              const sibling = await db.order.findFirst({
                where: {
                  erthboxLocationId: order.erthboxLocationId,
                  latitude: { not: null },
                  longitude: { not: null },
                  id: { not: order.id },
                },
                select: { latitude: true, longitude: true },
                orderBy: { updatedAt: "desc" },
              });
              if (sibling) {
                geo = { latitude: sibling.latitude!, longitude: sibling.longitude! };
                reused = true;
              }
            }

            // Geocode if coordinates not reused from sibling
            if (!geo) {
              const result = await geocodeAddress(order.address, order.city);
              if (result) {
                geo = { latitude: result.latitude, longitude: result.longitude };
              }
            }

            if (geo) {
              await db.order.update({
                where: { id: order.id },
                data: { latitude: geo.latitude, longitude: geo.longitude },
              });
              results.push({
                orderId: order.orderId,
                lat: geo.latitude,
                lng: geo.longitude,
                ...(reused ? { reused: true } as any : {}),
              });
            } else {
              results.push({ orderId: order.orderId, lat: null, lng: null, error: "Address not found" });
            }

            done++;
            state.done = done;
            state.results = results;
            state.currentOrder = null;
            await db.setting.update({
              where: { id: setting.id },
              data: { value: JSON.stringify(state) },
            });

            // Rate limit: only if we actually called geocoding API
            if (!reused && done < orders.length) {
              await new Promise(r => setTimeout(r, 1100));
            }
          } catch {
            done++;
            results.push({ orderId: order.orderId, lat: null, lng: null, error: "Geocoding error" });
            try {
              const setting = await db.setting.findUnique({
                where: { userId_key: { userId: user.id, key: `geocode_session_${sessionId}` } },
              });
              if (setting) {
                const state = JSON.parse(setting.value);
                state.done = done; state.results = results;
                await db.setting.update({ where: { id: setting.id }, data: { value: JSON.stringify(state) } });
              }
            } catch {}
          }
        }

        try {
          const setting = await db.setting.findUnique({
            where: { userId_key: { userId: user.id, key: `geocode_session_${sessionId}` } },
          });
          if (setting) {
            const state = JSON.parse(setting.value);
            state.status = "complete";
            await db.setting.update({ where: { id: setting.id }, data: { value: JSON.stringify(state) } });
          }
        } catch {}
      } catch {}
    }, 0);

    return NextResponse.json({ sessionId, total: orders.length });
  } catch (error) {
    console.error("[geocode] POST error:", error);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const setting = await db.setting.findUnique({
      where: { userId_key: { userId: user.id, key: `geocode_session_${sessionId}` } },
    });
    if (!setting) return NextResponse.json({ status: "not_found" }, { status: 404 });

    return NextResponse.json(JSON.parse(setting.value));
  } catch {
    return NextResponse.json({ error: "Failed to read progress" }, { status: 500 });
  }
}
