import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import * as ExcelJS from "exceljs";

// POST /api/export/zeo - Export scheduled orders as Zeo Route Planner XLSX
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const body = await request.json();
    const { date } = body;

    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }

    const orders = await db.order.findMany({
      where: {
        scheduledDate: date,
        status: { in: ["SCHEDULED", "CONFIRMED", "BOOKED"] },
        userId: user.id,
      },
      orderBy: { zone: "asc" },
    });

    if (orders.length === 0) {
      return NextResponse.json({ error: "No scheduled orders found for this date." }, { status: 400 });
    }

    // Build Zeo-compatible XLSX
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "HERO Sidekick";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Sample");

    // Zeo Route Planner template headers (exact match to sample-orders.xlsx)
    const headers = [
      "Address *",      // A
      "Latitude",       // B
      "Longitude",      // C
      "Country *",      // D
      "City *",         // E
      "State *",        // F
      "Pin code",       // G
      "Stop type",      // H
      "Group ID",       // I
      "Customer name",  // J
      "Customer mobile",// K
      "Customer email", // L
      "Parcel count",   // M
      "Notes",          // N
      "Optimize status",// O
      "Start time",     // P
      "End time",       // Q
      "Stop duration",  // R
      "Driver",         // S
      "Capacity",       // T
      "Volume",         // U
      "Stop date",      // V
    ];

    // Header row with styling (matching Zeo template style)
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.font = { name: "Book Antiqua", size: 12, bold: true, color: { theme: 0 } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { theme: 4 } };
      cell.alignment = { vertical: "middle" };
    });

    // Set column widths
    const colWidths = [40, 12, 12, 12, 20, 15, 10, 10, 10, 20, 18, 20, 10, 30, 15, 10, 10, 12, 15, 10, 10, 12];
    colWidths.forEach((width, i) => {
      sheet.getColumn(i + 1).width = width;
    });

    // Map zones to Malaysian states
    const zoneToState: Record<number, string> = {
      1: "Selangor",
      2: "Selangor",
      3: "Selangor",
      4: "Selangor",
      5: "Selangor",
      6: "Selangor",
      7: "Wilayah Persekutuan",
    };

    // Add order data rows
    for (const order of orders) {
      const row = sheet.addRow([
        order.address,                              // A: Address *
        order.latitude || "",                       // B: Latitude
        order.longitude || "",                      // C: Longitude
        "Malaysia",                                 // D: Country *
        order.city,                                 // E: City *
        zoneToState[order.zone] || "Selangor",      // F: State *
        "",                                         // G: Pin code
        "pickup",                                   // H: Stop type
        `Zone ${order.zone}`,                       // I: Group ID (zone grouping)
        order.orderId,                              // J: Customer name = Order ID (for easy identification in Zeo)
        order.phone.startsWith("+") ? order.phone : (order.phone ? `+6${order.phone.replace(/^0/, "")}` : ""), // K: Customer mobile
        "",                                         // L: Customer email
        order.size === "L" ? 3 : order.size === "M" ? 2 : 1, // M: Parcel count (by size)
        `${order.customerName}${order.size ? ` | ${order.size} (${order.points}pt)` : ""}${order.notes ? ` | ${order.notes}` : ""}`, // N: Notes = customer name + details
        "normal",                                   // O: Optimize status
        "09:00",                                    // P: Start time
        "16:00",                                    // Q: End time
        order.size === "L" ? 25 : order.size === "M" ? 20 : 15, // R: Stop duration (mins)
        "",                                         // S: Driver
        order.points,                               // T: Capacity (points)
        "",                                         // U: Volume
        date,                                       // V: Stop date
      ]);

      // Style data rows
      row.eachCell((cell, colNumber) => {
        cell.font = { name: "Book Antiqua", size: 11 };
        cell.alignment = { vertical: "middle", wrapText: colNumber === 1 || colNumber === 14 };
      });
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Zeo_Export_${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[export/zeo] POST error:", error);
    return NextResponse.json({ error: "Failed to generate export file. Please try again." }, { status: 500 });
  }
}
