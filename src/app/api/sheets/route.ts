import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { syncToSheet, importFromSheet, getSheetsConfig, setSheetsConfig } from "@/lib/google-sheets";
import { detectZoneWithCustom, getSizePoints } from "@/lib/zones";
import { canonicalStatusForWrite } from "@/lib/order-status";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const config = await getSheetsConfig(user.id);
    return NextResponse.json({
      spreadsheetId: config.spreadsheetId,
      hasServiceAccount: !!config.serviceAccount,
    });
  } catch (error) {
    console.error("[sheets] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch Google Sheets configuration." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const body = await request.json();
    const { action, spreadsheetId, serviceAccount } = body;

    if (spreadsheetId || serviceAccount) {
      const current = await getSheetsConfig(user.id);
      await setSheetsConfig(
        spreadsheetId || current.spreadsheetId,
        serviceAccount || current.serviceAccount,
        user.id,
      );
    }

    const config = await getSheetsConfig(user.id);

    if (!config.spreadsheetId || !config.serviceAccount) {
      return NextResponse.json(
        { error: "Google Sheets not configured. Please provide spreadsheet ID and service account JSON." },
        { status: 400 }
      );
    }

    if (action === "sync") {
      const orders = await db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
      const sheetOrders = orders.map(o => ({
        orderId: o.orderId, customerName: o.customerName, phone: o.phone,
        address: o.address, city: o.city, size: o.size, isOffice: o.isOffice,
        zone: o.zone, scheduledDate: o.scheduledDate, status: canonicalStatusForWrite(o.status), notes: o.notes,
      }));
      const result = await syncToSheet(sheetOrders, config.spreadsheetId, config.serviceAccount);
      return NextResponse.json(result);
    }

    if (action === "import") {
      const sheetOrders = await importFromSheet(config.spreadsheetId, config.serviceAccount);
      let imported = 0;

      for (const order of sheetOrders) {
        const existing = await db.order.findFirst({
          where: { orderId: order.orderId, userId: user.id },
        });
        if (existing) {
          await db.order.update({
            where: { id: existing.id },
            data: {
              customerName: order.customerName, phone: order.phone, address: order.address,
              city: order.city, size: order.size, points: getSizePoints(order.size),
              zone: await detectZoneWithCustom(order.city, user.id), isOffice: order.isOffice, status: order.status,
              scheduledDate: order.scheduledDate, notes: order.notes,
            },
          });
        } else {
          await db.order.create({
            data: {
              orderId: order.orderId, customerName: order.customerName, phone: order.phone,
              address: order.address, city: order.city, size: order.size,
              points: getSizePoints(order.size), zone: await detectZoneWithCustom(order.city, user.id),
              isOffice: order.isOffice, status: order.status, scheduledDate: order.scheduledDate,
              notes: order.notes, userId: user.id,
            },
          });
        }
        imported++;
      }
      return NextResponse.json({ success: true, imported });
    }

    return NextResponse.json({ error: "Invalid action. Use 'sync' or 'import'." }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Google Sheets operation failed: ${msg}` }, { status: 500 });
  }
}
