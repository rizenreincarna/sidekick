// Zeo Route Planner API Integration
// Docs: https://docs.zeorouteplanner.com/

const ZEO_BASE_URL = "https://zeorouteplanner.com/api/v5";

interface ZeoStop {
  address: string;
  latitude?: number;
  longitude?: number;
  notes: string;
  stop_type: "pickup" | "delivery";
  stop_duration: number; // minutes
  customer_name: string;
  customer_mobile_number: string;
  arrive_start: string; // "HH:MM"
  arrive_end: string;   // "HH:MM"
  optimize_status: "normal";
}

interface ZeoRouteRequest {
  route_name: string;
  start_address?: string;
  start_latitude?: number;
  start_longitude?: number;
  end_address?: string;
  end_latitude?: number;
  end_longitude?: number;
  date: string; // "YYYY-MM-DD"
  driver_id?: number;
  stops: ZeoStop[];
}

export async function getZeoDrivers(apiKey: string) {
  const res = await fetch(`${ZEO_BASE_URL}/drivers`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zeo API error (${res.status}): ${text}`);
  }

  return res.json();
}

export async function createZeoRoute(apiKey: string, route: ZeoRouteRequest) {
  const res = await fetch(`${ZEO_BASE_URL}/routes`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(route),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zeo API error (${res.status}): ${text}`);
  }

  return res.json();
}

export function buildZeoRouteFromOrders(
  orders: {
    orderId: string;
    customerName: string;
    phone: string;
    address: string;
    size: string;
    points: number;
    zone: number;
    scheduledDate: string | null;
    notes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }[],
  date: string,
  baseAddress: string,
  baseLat?: number,
  baseLng?: number,
  driverId?: number,
  stopDuration: number = 15,
): ZeoRouteRequest {
  const zoneGroups = new Map<number, typeof orders>();
  for (const order of orders) {
    const z = order.zone;
    if (!zoneGroups.has(z)) zoneGroups.set(z, []);
    zoneGroups.get(z)!.push(order);
  }

  // Sort stops by zone for natural grouping
  const sortedOrders = [...zoneGroups.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([_, orders]) => orders);

  const stops: ZeoStop[] = sortedOrders.map(order => ({
    address: order.address,
    latitude: order.latitude || undefined,
    longitude: order.longitude || undefined,
    notes: `Order #${order.orderId} | Size: ${order.size} (${order.points}pt) | Zone ${order.zone}${order.notes ? ` | ${order.notes}` : ""}`,
    stop_type: "pickup" as const,
    stop_duration: stopDuration,
    customer_name: order.customerName,
    customer_mobile_number: order.phone.startsWith("+") ? order.phone : `+6${order.phone}`,
    arrive_start: "09:00",
    arrive_end: "16:00",
    optimize_status: "normal" as const,
  }));

  return {
    route_name: `ERTH Pickup - ${date}`,
    start_address: baseAddress,
    start_latitude: baseLat,
    start_longitude: baseLng,
    end_address: baseAddress,
    end_latitude: baseLat,
    end_longitude: baseLng,
    date,
    driver_id: driverId,
    stops,
  };
}

export type { ZeoStop, ZeoRouteRequest };
