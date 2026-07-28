import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { generateEventId, isValidEventType } from "@/lib/events";
import { generateErthboxId } from "@/lib/erthbox";
import { quickGeocode } from "@/lib/geocode";
import { canonicalNormalTransition } from "@/lib/order-status";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const { status } = await request.json() as { status: "APPROVED" | "REJECTED" };

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const action = await db.aiAction.findUnique({ where: { id } });
    if (!action) return NextResponse.json({ error: "Action not found." }, { status: 404 });
    if (action.status !== "PENDING") return NextResponse.json({ error: "Action already reviewed." }, { status: 400 });
    if (action.userId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Block changes to BOOKED orders
    if (action.entityType === "Order" && !action.actionType.startsWith("CREATE_")) {
      // AI uses orderId (e.g. "25677"), not database UUID — try both lookups
      let order = await db.order.findUnique({ where: { id: action.entityId } });
      if (!order) {
        order = await db.order.findFirst({ where: { orderId: action.entityId, userId: action.userId } });
      }
      if (order?.status === "BOOKED") {
        await db.aiAction.update({ where: { id }, data: { status: "REJECTED", reviewedBy: user.id, reviewedAt: new Date() } });
        return NextResponse.json({ error: "Cannot modify BOOKED orders." }, { status: 400 });
      }
    }

    // If approved, apply the action
    if (status === "APPROVED") {
      const payload = JSON.parse(action.payload) as Record<string, unknown>;

      switch (action.actionType) {
        case "UPDATE_ORDER":
        case "RESCHEDULE_ORDER": {
          if (action.entityType === "Order") {
            // Validate UPDATE_ORDER payload fields
            if (payload.size !== undefined) {
              const s = String(payload.size).toUpperCase();
              if (!["S", "M", "L"].includes(s)) {
                return NextResponse.json({ error: "Invalid size. Must be S, M, or L." }, { status: 400 });
              }
            }
            if (payload.scheduledDate !== undefined) {
              const dateStr = String(payload.scheduledDate);
              if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || isNaN(Date.parse(dateStr))) {
                return NextResponse.json({ error: "Invalid scheduledDate. Must be YYYY-MM-DD format." }, { status: 400 });
              }
            }
            if (payload.customerName !== undefined && String(payload.customerName).length > 100) {
              return NextResponse.json({ error: "customerName must be 100 characters or less." }, { status: 400 });
            }
            if (payload.phone !== undefined && String(payload.phone).length > 20) {
              return NextResponse.json({ error: "phone must be 20 characters or less." }, { status: 400 });
            }
            if (payload.city !== undefined && String(payload.city).length > 50) {
              return NextResponse.json({ error: "city must be 50 characters or less." }, { status: 400 });
            }
            if (payload.points !== undefined) {
              const pts = parseInt(String(payload.points));
              if (isNaN(pts) || pts < 1 || pts > 20 || !Number.isInteger(pts)) {
                return NextResponse.json({ error: "points must be an integer between 1 and 20." }, { status: 400 });
              }
            }
            // AI uses orderId (e.g. "25677"), not database id — look up by orderId
            let order = await db.order.findUnique({ where: { id: action.entityId } });
            if (!order) {
              // Try looking up by orderId instead
              order = await db.order.findFirst({ where: { orderId: action.entityId, userId: action.userId } });
            }
            if (order) {
              const updateData: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(payload)) {
                if (["customerName", "phone", "address", "city", "size", "isOffice", "scheduledDate", "notes"].includes(key)) {
                  updateData[key] = value;
                }
              }
              // For RESCHEDULE_ORDER, also update status to SCHEDULED if currently PENDING
              if (action.actionType === "RESCHEDULE_ORDER" && updateData.scheduledDate && order.status === "PENDING") {
                updateData.status = canonicalNormalTransition(order.status, "SCHEDULED");
              }
              if (Object.keys(updateData).length > 0) {
                await db.order.update({ where: { id: order.id }, data: updateData });
                // Log audit
                const { logAudit } = await import("@/lib/audit");
                await logAudit({ userId: action.userId, action: "UPDATE", entity: "Order", entityId: order.id, details: JSON.stringify({ orderId: order.orderId, changes: updateData, source: "AI" }) });
              }
            }
          }
          break;
        }
        case "ADD_NOTE": {
          if (action.entityType === "Order") {
            // AI uses orderId — try both lookups
            let order = await db.order.findUnique({ where: { id: action.entityId } });
            if (!order) {
              order = await db.order.findFirst({ where: { orderId: action.entityId, userId: action.userId } });
            }
            if (order) {
              const noteText = (payload as { note?: string }).note || "";
              const existingNotes = order.notes || "";
              const newNotes = existingNotes ? `${existingNotes}\n[AI] ${noteText}` : `[AI] ${noteText}`;
              await db.order.update({ where: { id: order.id }, data: { notes: newNotes } });
              const { logAudit } = await import("@/lib/audit");
              await logAudit({ userId: action.userId, action: "UPDATE", entity: "Order", entityId: order.id, details: JSON.stringify({ orderId: order.orderId, addedNote: noteText, source: "AI" }) });
            }
          }
          break;
        }
        case "CHANGE_STATUS": {
          if (action.entityType === "Order") {
            // AI uses orderId — try both lookups
            let order = await db.order.findUnique({ where: { id: action.entityId } });
            if (!order) {
              order = await db.order.findFirst({ where: { orderId: action.entityId, userId: action.userId } });
            }
            if (order) {
              let newStatus: string;
              try {
                newStatus = canonicalNormalTransition(order.status, (payload as { status?: string }).status);
              } catch (cause) {
                return NextResponse.json({ error: cause instanceof Error ? cause.message : "Invalid status transition." }, { status: 400 });
              }
              await db.order.update({ where: { id: order.id }, data: { status: newStatus } });
              const { logAudit } = await import("@/lib/audit");
              await logAudit({ userId: action.userId, action: "UPDATE", entity: "Order", entityId: order.id, details: JSON.stringify({ orderId: order.orderId, statusFrom: order.status, statusTo: newStatus, source: "AI" }) });
            }
          }
          break;
        }
        case "CREATE_ORDER": {
          const { orderId, customerName, phone, address, city, size, isOffice, notes, isEvent, eventType, scheduledDate } = payload as {
            orderId?: string; customerName?: string; phone?: string; address?: string;
            city?: string; size?: string; isOffice?: boolean; notes?: string;
            isEvent?: boolean; eventType?: string; scheduledDate?: string;
          };

          const isEventOrder = isEvent === true;

          if (isEventOrder) {
            // Event order: relaxed validation, auto-generate EVENT-XXX ID
            const effectiveSize = (size || "M").toUpperCase();
            if (!["S", "M", "L"].includes(effectiveSize)) {
              return NextResponse.json({ error: "Invalid size." }, { status: 400 });
            }
            if (eventType && !isValidEventType(eventType)) {
              return NextResponse.json({ error: "Invalid eventType. Must be ROADSHOW, EWASTE_COLLECTION, or OTHER." }, { status: 400 });
            }
            if (!scheduledDate) {
              return NextResponse.json({ error: "Event orders require a scheduledDate." }, { status: 400 });
            }
            const eventOrderId = await generateEventId();
            const effectiveCity = city || eventType || "General";
            const { getSizePoints } = await import("@/lib/zones");
            const points = getSizePoints(effectiveSize);
            const { detectZoneWithCustom } = await import("@/lib/zones");
            const zone = await detectZoneWithCustom(effectiveCity, action.userId);
            // Auto-geocode event location
            let eventLat: number | null = null;
            let eventLng: number | null = null;
            if (address && address !== "N/A") {
              try {
                const coords = await quickGeocode(address, effectiveCity);
                if (coords) { eventLat = coords[0]; eventLng = coords[1]; }
              } catch { /* continue without coords */ }
            }
            const newOrder = await db.order.create({
              data: {
                orderId: eventOrderId,
                customerName: customerName || `${eventType || "Event"} Event`,
                phone: phone || "N/A",
                address: address || "N/A",
                city: effectiveCity,
                size: effectiveSize,
                points,
                zone,
                isOffice: isOffice || false,
                isEvent: true,
                eventType: eventType || null,
                status: "SCHEDULED",
                scheduledDate: scheduledDate,
                notes: notes || null,
                latitude: eventLat,
                longitude: eventLng,
                userId: action.userId,
              },
            });
            const { logAudit } = await import("@/lib/audit");
            await logAudit({ userId: action.userId, action: "CREATE", entity: "Order", entityId: newOrder.id, details: JSON.stringify({ orderId: eventOrderId, city: effectiveCity, zone, source: "AI", isEvent: true, eventType }) });
            break;
          }

          // Regular order: full validation
          if (!orderId || !customerName || !phone || !address || !city || !size) {
            return NextResponse.json({ error: "Missing required order fields." }, { status: 400 });
          }
          const upperSize = size.toUpperCase();
          if (!["S", "M", "L"].includes(upperSize)) {
            return NextResponse.json({ error: "Invalid size." }, { status: 400 });
          }
          const { getSizePoints } = await import("@/lib/zones");
          const points = getSizePoints(upperSize);
          const { detectZoneWithCustom } = await import("@/lib/zones");
          const zone = await detectZoneWithCustom(city, action.userId);
          // Auto-geocode
          let geoLat: number | null = null;
          let geoLng: number | null = null;
          try {
            const coords = await quickGeocode(address, city);
            if (coords) { geoLat = coords[0]; geoLng = coords[1]; }
          } catch { /* continue without coords */ }
          const newOrder = await db.order.create({
            data: {
              orderId, customerName, phone, address, city, size: upperSize, points, zone,
              isOffice: isOffice || false, notes: notes || null, userId: action.userId,
              latitude: geoLat, longitude: geoLng,
            },
          });
          // Check if city matches any existing zone area, if not create a zone suggestion
          const { ZONES } = await import("@/lib/zones");
          let areaFound = false;
          for (const [, zoneData] of Object.entries(ZONES)) {
            if (zoneData.areas.some(a => city.toLowerCase().includes(a) || a.includes(city.toLowerCase()))) {
              areaFound = true; break;
            }
          }
          if (!areaFound) {
            // Create a pending zone addition action
            await db.aiAction.create({
              data: {
                conversationId: action.conversationId,
                userId: action.userId,
                actionType: "ADD_ZONE_AREA",
                entityType: "ZoneConfig",
                entityId: String(zone),
                description: `Auto-suggest: Add "${city}" to Zone ${zone} (from order #${orderId})`,
                payload: JSON.stringify({ area: city, zone, orderId }),
                status: "PENDING",
              },
            });
          }
          // Log audit
          const { logAudit } = await import("@/lib/audit");
          await logAudit({ userId: action.userId, action: "CREATE", entity: "Order", entityId: newOrder.id, details: JSON.stringify({ orderId, city, zone, source: "AI" }) });
          break;
        }
        case "CREATE_EVENT": {
          // Dedicated event creation action from AI
          const { eventType, customerName, scheduledDate: eventDate, city, notes: eventNotes } = payload as {
            eventType?: string; customerName?: string; scheduledDate?: string;
            city?: string; notes?: string;
          };
          if (!eventDate) {
            return NextResponse.json({ error: "Event orders require a scheduledDate." }, { status: 400 });
          }
          if (eventType && !isValidEventType(eventType)) {
            return NextResponse.json({ error: "Invalid eventType. Must be ROADSHOW, EWASTE_COLLECTION, or OTHER." }, { status: 400 });
          }
          const eventOrderId = await generateEventId();
          const effectiveCity = city || eventType || "General";
          const { getSizePoints } = await import("@/lib/zones");
          const points = getSizePoints("M");
          const { detectZoneWithCustom } = await import("@/lib/zones");
          const zone = await detectZoneWithCustom(effectiveCity, action.userId);
          // Auto-geocode event location
          let eventLat: number | null = null;
          let eventLng: number | null = null;
          if (effectiveCity) {
            try {
              const coords = await quickGeocode(effectiveCity, effectiveCity);
              if (coords) { eventLat = coords[0]; eventLng = coords[1]; }
            } catch { /* continue without coords */ }
          }
          const newOrder = await db.order.create({
            data: {
              orderId: eventOrderId,
              customerName: customerName || `${eventType || "Event"} Event`,
              phone: "N/A",
              address: "N/A",
              city: effectiveCity,
              size: "M",
              points,
              zone,
              isOffice: false,
              isEvent: true,
              eventType: eventType || null,
              status: "SCHEDULED",
              scheduledDate: eventDate,
              notes: eventNotes || null,
              latitude: eventLat,
              longitude: eventLng,
              userId: action.userId,
            },
          });
          const { logAudit } = await import("@/lib/audit");
          await logAudit({ userId: action.userId, action: "CREATE", entity: "Order", entityId: newOrder.id, details: JSON.stringify({ orderId: eventOrderId, city: effectiveCity, zone, source: "AI", isEvent: true, eventType }) });
          break;
        }
        case "CREATE_ERTHBOX": {
          // ERTHBOX order creation from AI
          const { erthboxLocationId, notes: erthboxNotes, scheduledDate: erthboxDate } = payload as {
            erthboxLocationId?: string; notes?: string; scheduledDate?: string;
          };
          if (!erthboxLocationId) {
            return NextResponse.json({ error: "ERTHBOX orders require an erthboxLocationId." }, { status: 400 });
          }
          // ERTHBOX locations are universal — any user can use any active location
          const location = await db.erthboxLocation.findFirst({
            where: { id: erthboxLocationId, isActive: true },
          });
          if (!location) {
            return NextResponse.json({ error: "ERTHBOX location not found or inactive." }, { status: 400 });
          }
          const erthboxOrderId = await generateErthboxId();
          const { getSizePoints } = await import("@/lib/zones");
          const points = getSizePoints("S");
          const { detectZoneWithCustom } = await import("@/lib/zones");
          const zone = await detectZoneWithCustom(location.city, action.userId);
          let effectiveNotes = erthboxNotes || null;
          if (location.notes) {
            effectiveNotes = effectiveNotes ? `[Location: ${location.notes}]\n${effectiveNotes}` : `[Location: ${location.notes}]`;
          }
          // Auto-geocode ERTHBOX location
          let erthboxLat: number | null = null;
          let erthboxLng: number | null = null;
          try {
            const coords = await quickGeocode(location.address, location.city);
            if (coords) { erthboxLat = coords[0]; erthboxLng = coords[1]; }
          } catch { /* continue without coords */ }
          const newOrder = await db.order.create({
            data: {
              orderId: erthboxOrderId,
              customerName: location.name,
              phone: location.picPhone,
              address: location.address,
              city: location.city,
              size: "S",
              points,
              zone,
              isOffice: false,
              isErthbox: true,
              erthboxLocationId: location.id,
              status: erthboxDate ? "SCHEDULED" : "PENDING",
              scheduledDate: erthboxDate || null,
              notes: effectiveNotes,
              latitude: erthboxLat,
              longitude: erthboxLng,
              userId: action.userId,
            },
          });
          const { logAudit } = await import("@/lib/audit");
          await logAudit({ userId: action.userId, action: "CREATE", entity: "Order", entityId: newOrder.id, details: JSON.stringify({ orderId: erthboxOrderId, city: location.city, zone, source: "AI", isErthbox: true, erthboxLocationId: location.id }) });
          break;
        }
        case "ADD_ZONE_AREA": {
          const { area, zone } = payload as { area?: string; zone?: number };
          if (!area || !zone) {
            return NextResponse.json({ error: "Missing area or zone." }, { status: 400 });
          }
          // Add the area to the zone config
          await db.zoneConfig.upsert({
            where: { userId_zone_area: { userId: action.userId, zone, area } },
            update: { isExcluded: false },
            create: { userId: action.userId, zone, area, isExcluded: false },
          });
          const { logAudit } = await import("@/lib/audit");
          await logAudit({ userId: action.userId, action: "CREATE", entity: "ZoneConfig", details: JSON.stringify({ zone, area, source: "AI" }) });
          break;
        }
      }

      // Mark as applied
      await db.aiAction.update({
        where: { id },
        data: { status: "APPLIED", reviewedBy: user.id, reviewedAt: new Date() },
      });
    } else {
      await db.aiAction.update({
        where: { id },
        data: { status: "REJECTED", reviewedBy: user.id, reviewedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[ai/actions/[id]] PUT error:", error);
    return NextResponse.json({ error: "Failed to review action." }, { status: 500 });
  }
}
