import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { detectZoneWithCustom, getSizePoints } from "@/lib/zones";
import { quickGeocode } from "@/lib/geocode";
import { verifyOrderAddress } from "@/lib/address-verify";

// POST /api/import/encore - Import orders from Encore CSV export
// New Encore format: "Order #","Client name","Address","Special Note"
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Limit file size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum size is 5MB." }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV file is empty or has no data rows" }, { status: 400 });
    }

    // Limit number of rows to prevent abuse
    if (lines.length > 1001) { // 1 header + 1000 data rows max
      return NextResponse.json({ error: "Too many rows. Maximum 1000 orders per import." }, { status: 400 });
    }

    // Parse header - Encore format: "Order #","Client name","Address","Special Note"
    const header = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

    const orderIdIdx = header.findIndex(h => h.includes("order"));
    const clientNameIdx = header.findIndex(h => h.includes("client name") || h.includes("client"));
    const addressIdx = header.findIndex(h => h.includes("address"));
    const specialNoteIdx = header.findIndex(h => h.includes("special note") || h.includes("note"));

    if (orderIdIdx === -1 || addressIdx === -1) {
      return NextResponse.json(
        { error: "Invalid Encore CSV format. Required columns: 'Order #', 'Address'" },
        { status: 400 }
      );
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    let duplicateWarnings = 0;
    const duplicateIds: string[] = [];
    const errorRows: { row: number; error: string }[] = [];
    const newOrderIds: string[] = []; // Track newly created order IDs for address verification

    // Pre-parse all rows to collect order IDs for targeted duplicate checking
    const parsedRows: Array<{ rowIdx: number; orderId: string; fields: string[] }> = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i]);
      if (fields.length < Math.max(orderIdIdx, addressIdx) + 1) continue;
      const rawOrderId = (fields[orderIdIdx] || "").trim();
      if (!rawOrderId) continue;
      if (rawOrderId.length > 50) {
        errors++;
        errorRows.push({ row: i + 1, error: "Order ID too long (max 50 characters)" });
        continue;
      }
      parsedRows.push({ rowIdx: i, orderId: rawOrderId, fields });
    }

    // Get existing order IDs for this user to check duplicates efficiently
    const existingOrders = await db.order.findMany({
      where: { userId: user.id },
      select: { orderId: true },
    });
    const existingOrderIds = new Set(existingOrders.map(o => o.orderId));

    // Feature 3: Check cross-user duplicates only for the specific order IDs in the import
    const importOrderIds = parsedRows.map(r => r.orderId).filter(id => !existingOrderIds.has(id));
    const existingCrossUserOrders = importOrderIds.length > 0 ? await db.order.findMany({
      where: { orderId: { in: importOrderIds } },
      select: { orderId: true, userId: true },
    }) : [];
    const crossUserMap = new Map(existingCrossUserOrders.map(o => [o.orderId, o.userId]));

    for (const { rowIdx, orderId: rawOrderId, fields } of parsedRows) {
      // Check duplicate for this user
      if (existingOrderIds.has(rawOrderId)) {
        skipped++;
        duplicateIds.push(rawOrderId);
        continue;
      }

      try {
        const rawClientName = clientNameIdx >= 0 ? (fields[clientNameIdx] || "").trim() : "";
        const rawAddress = (fields[addressIdx] || "").trim();
        const rawSpecialNote = specialNoteIdx >= 0 ? (fields[specialNoteIdx] || "").trim() : "";

        // Validate lengths
        if (rawAddress.length > 500) {
          errors++;
          errorRows.push({ row: rowIdx + 1, error: "Address too long (max 500 characters)" });
          continue;
        }

        // Clean phone - Encore puts phone number in "Client name" field
        // Phone patterns: "+60 16-303 8834", "+60166326517", "+60 12-398 9734"
        const isPhoneNumber = /^[\+]?[\d\s\-\(\)]{6,}$/.test(rawClientName);
        let phone = "";
        let customerName = "";

        if (isPhoneNumber) {
          // Clean the phone number: remove spaces and dashes, keep + prefix
          phone = rawClientName.replace(/[\s\-\(\)]/g, "");
          // Normalize: ensure it starts with +60 or 60
          customerName = phone; // Use phone as name placeholder when no real name
        } else {
          // It's a company/real name (like "CLEVER")
          customerName = rawClientName || `Order ${rawOrderId}`;
        }

        // Extract city from address
        const city = extractCity(rawAddress);

        // Determine if office
        // Check: company name (not a phone number), or keywords in special note
        const noteLower = rawSpecialNote.toLowerCase();
        const isOffice = (!isPhoneNumber && rawClientName !== "") ||
          noteLower.includes("office") ||
          noteLower.includes("biz hours") ||
          noteLower.includes("business hours") ||
          noteLower.includes("corporate") ||
          noteLower.includes("uitm") ||
          noteLower.includes("university") ||
          noteLower.includes("10am - 6pm") ||
          noteLower.includes("9am - 6pm");

        // Default size - Encore doesn't provide size info
        const size = "M";

        const zone = await detectZoneWithCustom(city, user.id);
        const points = getSizePoints(size);

        // Build notes from special note
        let orderNotes = "";
        if (rawSpecialNote) {
          orderNotes = rawSpecialNote.substring(0, 1000); // Limit notes length
        }
        if (isOffice && !isPhoneNumber && rawClientName) {
          orderNotes = orderNotes ? `${rawClientName} | ${orderNotes}` : rawClientName;
        }

        // Auto-geocode the address (best effort, don't block import on failure)
        let geoLat: number | null = null;
        let geoLng: number | null = null;
        try {
          const coords = await quickGeocode(rawAddress, city);
          if (coords) {
            geoLat = coords[0];
            geoLng = coords[1];
          }
        } catch {
          // Geocoding failed - continue without coordinates
        }

        await db.order.create({
          data: {
            orderId: rawOrderId,
            customerName: customerName.substring(0, 200),
            phone: phone.substring(0, 30),
            address: rawAddress.substring(0, 500),
            city: city.substring(0, 100),
            size,
            points,
            zone,
            isOffice,
            status: "PENDING",
            scheduledDate: null,
            notes: orderNotes || null,
            latitude: geoLat,
            longitude: geoLng,
            addressVerified: false,
            userId: user.id,
          },
        }).then(newOrder => {
          newOrderIds.push(newOrder.id);
        });

        // Feature 3: Check if this order ID already exists across other users (cross-user duplicate)
        if (crossUserMap.has(rawOrderId)) {
          duplicateWarnings++;
        }

        existingOrderIds.add(rawOrderId); // Track newly created ones too
        crossUserMap.set(rawOrderId, user.id); // Track in cross-user map too
        imported++;
      } catch (err) {
        errors++;
        errorRows.push({ row: rowIdx + 1, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    // Trigger background address verification for newly imported orders
    // This runs asynchronously — the import response returns immediately
    let addressVerificationStarted = false;
    if (newOrderIds.length > 0) {
      addressVerificationStarted = true;
      // Run verification in the background (don't await — let it process after response)
      const verifyBackground = async () => {
        for (let i = 0; i < newOrderIds.length; i++) {
          try {
            await verifyOrderAddress(newOrderIds[i]);
          } catch {
            // Individual verification failure — don't block others
          }
          // Rate limit: wait 1.5s between verifications
          if (i < newOrderIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      };
      verifyBackground().catch(err => {
        console.error("[import/encore] Background address verification error:", err);
      });
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      duplicateWarnings,
      duplicates: duplicateIds,
      errors,
      errorRows,
      addressVerificationStarted,
      verifyingCount: newOrderIds.length,
    });
  } catch (error) {
    console.error("[import/encore] POST error:", error);
    return NextResponse.json({ error: "Import failed. Please check your CSV file and try again." }, { status: 500 });
  }
}

// Parse a CSV line respecting quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

// Extract city from Encore address format
// Encore addresses contain duplicate parts:
// "No.15, Persiaran Pasak Bumi... Shah Alam, 15 Persiaran Pasak Bumi, Shah Alam, Selangor, 40150"
// We extract the city from the second/cleaner part
function extractCity(address: string): string {
  const parts = address.split(",").map(p => p.trim());

  const cityPatterns = [
    "kuala lumpur", "shah alam", "petaling jaya", "subang jaya", "klang",
    "kajang", "bangi", "puchong", "cyberjaya", "sepang", "rawang",
    "kepong", "ampang", "cheras", "damansara", "setapak", "gombak",
    "sungai buloh", "serdang", "seri kembangan", "balakong", "semenyih",
    "telok panglima garang", "kota kemuning", "usj", "bandar sunway",
    "kelana jaya", "pj", "kl", "selangor",
  ];

  for (const part of parts) {
    const lower = part.toLowerCase();
    for (const city of cityPatterns) {
      if (lower.includes(city)) {
        // Return the part with postal code stripped
        return part.replace(/\d{5}/g, "").trim() || city;
      }
    }
  }

  // Fallback: take second-to-last part (usually city)
  if (parts.length >= 3) {
    for (let i = parts.length - 3; i < parts.length; i++) {
      const part = parts[i].replace(/\d{5}/g, "").trim();
      if (part && part.length > 2) return part;
    }
  }

  return parts[parts.length - 2] || parts[0] || "Unknown";
}
