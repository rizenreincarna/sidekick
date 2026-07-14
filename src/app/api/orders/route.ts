import { db } from "@/lib/db";
import { detectZoneWithCustom, getSizePoints } from "@/lib/zones";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/session";
import { generateEventId, isValidEventType } from "@/lib/events";
import { generateErthboxId } from "@/lib/erthbox";
import { quickGeocode } from "@/lib/geocode";
import { NextRequest, NextResponse } from "next/server";

// GET /api/orders - List orders for current user, or all heroes' orders for Support/Admin
// Admin with ?all=true sees ALL orders across all users
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const zone = searchParams.get("zone");
    const date = searchParams.get("date");
    const userId = searchParams.get("userId"); // For Support/Admin to query specific hero's orders
    const all = searchParams.get("all"); // For Admin to see all orders

    // Support and Admin can see all heroes' orders
    const isSupport = user.role === "SUPPORT" || user.role === "ADMIN";
    const isAdmin = user.role === "ADMIN";

    // Admin and Support with ?all=true gets all orders across all users
    const showAllOrders = isSupport && all === "true";

    let targetUserId = user.id;
    if (isSupport && userId) {
      targetUserId = userId;
    }

    const where: Record<string, unknown> = {};
    if (!showAllOrders) {
      where.userId = targetUserId;
    }
    if (status) where.status = status;
    if (zone) where.zone = parseInt(zone);
    if (date) where.scheduledDate = date;

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const includeUser = isSupport || showAllOrders;

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: includeUser ? { user: { select: { id: true, username: true, displayName: true, role: true } } } : undefined,
      }),
      db.order.count({ where }),
    ]);

    return NextResponse.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("[orders] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch orders. Please try again." }, { status: 500 });
  }
}

// POST /api/orders - Create a new order for current user (Hero and Support can create)
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  // Support and Hero can create orders
  if (user.role !== "HERO" && user.role !== "SUPPORT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "You do not have permission to create orders." }, { status: 403 });
  }

  const body = await request.json();
  const { orderId, customerName, phone, address, city, size, points: rawPoints, isOffice, notes, latitude, longitude, assignToUserId, isEvent, eventType, scheduledDate, isErthbox, erthboxLocationId } = body;

  const isEventOrder = isEvent === true;
  const isErthboxOrder = isErthbox === true;

  // ERTHBOX orders: validate erthboxLocationId
  let erthboxLocation: { id: string; name: string; address: string; city: string; picName: string; picPhone: string; notes: string | null } | null = null;
  if (isErthboxOrder) {
    if (!erthboxLocationId) {
      return NextResponse.json(
        { error: "ERTHBOX orders require an erthboxLocationId" },
        { status: 400 }
      );
    }
    // Universal: any user can reference any active ERTHBOX location
    erthboxLocation = await db.erthboxLocation.findFirst({
      where: { id: erthboxLocationId, isActive: true },
    });
    if (!erthboxLocation) {
      return NextResponse.json(
        { error: "ERTHBOX location not found or inactive" },
        { status: 400 }
      );
    }
    // Inherit coordinates from a sibling ERTHBOX order at the same location.
    // ERTHBOX locations don't move, so reusing coordinates saves Google Maps API calls.
    if (!latitude || !longitude) {
      const sibling = await db.order.findFirst({
        where: {
          erthboxLocationId: erthboxLocationId,
          latitude: { not: null },
          longitude: { not: null },
        },
        select: { latitude: true, longitude: true },
        orderBy: { updatedAt: "desc" },
      });
      if (sibling) {
        // stored below after finalLatitude/finalLongitude declaration
      }
    }
  }

  // Event orders have relaxed validation
  if (isEventOrder) {
    // Validate eventType if provided
    if (eventType && !isValidEventType(eventType)) {
      return NextResponse.json(
        { error: "Invalid eventType. Must be ROADSHOW, EWASTE_COLLECTION, or OTHER" },
        { status: 400 }
      );
    }
    if (!scheduledDate) {
      return NextResponse.json(
        { error: "Event orders require a scheduledDate" },
        { status: 400 }
      );
    }
  } else if (!isErthboxOrder) {
    // Regular orders require all fields
    if (!orderId || !customerName || !phone || !address || !city || !size) {
      return NextResponse.json(
        { error: "Missing required fields: orderId, customerName, phone, address, city, size" },
        { status: 400 }
      );
    }
  }
  // ERTHBOX orders have relaxed validation - most fields auto-populated from location

  // Input validation: string lengths (skip orderId for event/erthbox orders since it's auto-generated)
  if (!isEventOrder && !isErthboxOrder && orderId && String(orderId).length > 50) return NextResponse.json({ error: "Order ID must be 50 characters or less" }, { status: 400 });
  if (customerName && String(customerName).length > 200) return NextResponse.json({ error: "Customer name must be 200 characters or less" }, { status: 400 });
  if (phone && String(phone).length > 30) return NextResponse.json({ error: "Phone number must be 30 characters or less" }, { status: 400 });
  if (address && String(address).length > 500) return NextResponse.json({ error: "Address must be 500 characters or less" }, { status: 400 });
  if (city && String(city).length > 100) return NextResponse.json({ error: "City must be 100 characters or less" }, { status: 400 });
  if (notes && String(notes).length > 1000) return NextResponse.json({ error: "Notes must be 1000 characters or less" }, { status: 400 });

  const effectiveSize = isEventOrder ? (size || "M") : isErthboxOrder ? (size || "S") : size;
  const upperSize = effectiveSize.toUpperCase();
  if (!["S", "M", "L", "XL", "XXL"].includes(upperSize)) {
    return NextResponse.json({ error: "Size must be S, M, L, XL, or XXL" }, { status: 400 });
  }

  // Points: use provided value (1-12) or default from size
  let points = getSizePoints(upperSize);
  if (rawPoints !== undefined && rawPoints !== null) {
    const pts = typeof rawPoints === "string" ? parseInt(rawPoints) : rawPoints;
    if (!isNaN(pts) && pts >= 1 && pts <= 20) {
      points = pts;
    }
  }

  // For event/erthbox orders, use effective defaults for zone detection
  let zoneCity = city;
  if (isEventOrder) zoneCity = city || eventType || "General";
  else if (isErthboxOrder) zoneCity = erthboxLocation?.city || city || "General";
  const zone = await detectZoneWithCustom(zoneCity, user.id);

  // Support/Admin can assign orders to a specific hero
  let targetUserId = user.id;
  if ((user.role === "SUPPORT" || user.role === "ADMIN") && assignToUserId) {
    const targetUser = await db.user.findUnique({ where: { id: assignToUserId } });
    if (targetUser && targetUser.isActive && targetUser.role === "HERO") {
      targetUserId = targetUser.id;
    }
  }

  // For event/erthbox orders, auto-generate IDs and apply relaxed defaults
  let effectiveOrderId = orderId;
  let effectiveCustomerName = customerName;
  let effectivePhone = phone;
  let effectiveAddress = address;
  let effectiveCity = city;
  let effectiveStatus = "PENDING";
  let effectiveScheduledDate: string | null = null;
  let effectiveEventType: string | null = null;
  let effectiveIsErthbox = false;
  let effectiveErthboxLocationId: string | null = null;

  if (isEventOrder) {
    effectiveOrderId = await generateEventId();
    effectiveCustomerName = customerName || `${eventType || "Event"} Event`;
    effectivePhone = phone || "N/A";
    effectiveAddress = address || "N/A";
    effectiveCity = city || eventType || "General";
    effectiveStatus = "SCHEDULED";
    effectiveScheduledDate = scheduledDate;
    effectiveEventType = eventType || null;
  } else if (isErthboxOrder) {
    effectiveOrderId = await generateErthboxId();
    effectiveCustomerName = customerName || erthboxLocation?.name || "ERTHBOX Collection";
    effectivePhone = phone || erthboxLocation?.picPhone || "N/A";
    effectiveAddress = address || erthboxLocation?.address || "N/A";
    effectiveCity = city || erthboxLocation?.city || "General";
    effectiveStatus = "PENDING"; // ERTHBOX stays PENDING until scheduled manually
    effectiveIsErthbox = true;
    effectiveErthboxLocationId = erthboxLocationId || null;
    // Combine location notes with user notes
    if (erthboxLocation?.notes && notes) {
      effectiveCity = city || erthboxLocation?.city || "General"; // already set above
    }
  }

  // Feature 3: Check if ANY order with the same orderId already exists — reject duplicates
  if (effectiveOrderId) {
    const duplicateOrder = await db.order.findFirst({
      where: { orderId: effectiveOrderId, userId: targetUserId },
    });
    if (duplicateOrder) {
      return NextResponse.json(
        { error: `Duplicate order ID: order #${effectiveOrderId} already exists for this user` },
        { status: 409 }
      );
    }
  }

  // Combine ERTHBOX location notes with user-provided notes
  let effectiveNotes = notes || null;
  if (isErthboxOrder && erthboxLocation?.notes) {
    effectiveNotes = notes ? `[Location: ${erthboxLocation.notes}]\n${notes}` : `[Location: ${erthboxLocation.notes}]`;
  }

  // Auto-geocode address if no coordinates provided
  let finalLatitude = latitude || null;
  let finalLongitude = longitude || null;

  // ERTHBOX coordinate inheritance: same location always has same coords.
  // Reuse from sibling orders to save Google Maps API calls.
  if (isErthboxOrder && erthboxLocationId && (!finalLatitude || !finalLongitude)) {
    const sibling = await db.order.findFirst({
      where: {
        erthboxLocationId,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { latitude: true, longitude: true },
      orderBy: { updatedAt: "desc" },
    });
    if (sibling) {
      finalLatitude = sibling.latitude;
      finalLongitude = sibling.longitude;
    }
  }
  if (!finalLatitude || !finalLongitude) {
    const geoAddress = effectiveAddress;
    const geoCity = effectiveCity;
    if (geoAddress && geoCity && geoAddress !== "N/A") {
      try {
        const coords = await quickGeocode(geoAddress, geoCity);
        if (coords) {
          finalLatitude = coords[0];
          finalLongitude = coords[1];
        }
      } catch {
        // Geocoding failed - continue without coordinates
      }
    }
  }

  const order = await db.order.create({
    data: {
      orderId: effectiveOrderId,
      customerName: effectiveCustomerName,
      phone: effectivePhone,
      address: effectiveAddress,
      city: effectiveCity,
      size: upperSize,
      points,
      zone,
      isOffice: isOffice || false,
      isEvent: isEventOrder,
      eventType: effectiveEventType,
      isErthbox: effectiveIsErthbox,
      erthboxLocationId: effectiveErthboxLocationId,
      status: effectiveStatus,
      scheduledDate: effectiveScheduledDate,
      notes: effectiveNotes,
      latitude: finalLatitude,
      longitude: finalLongitude,
      userId: targetUserId,
    },
  });

  // Audit log
  await logAudit({
    userId: user.id,
    action: "CREATE",
    entity: "Order",
    entityId: order.id,
    details: JSON.stringify({ orderId: order.orderId, city: order.city }),
  });

  return NextResponse.json(order, { status: 201 });
}
