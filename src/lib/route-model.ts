// Route planner model — fixed locations, vehicle config, and helpers.

export const FIXED_LOCATIONS = {
  HOME: {
    name: "BSP21 (Home)",
    latitude: 2.9437430334894716,
    longitude: 101.59003412883487,
    address: "BSP21, Bandar Saujana Putra",
  },
  DROP_A: {
    name: "ERTH HQ, Cyberjaya",
    latitude: 2.9135695,
    longitude: 101.6553101,
    address: "ERTH HQ, Near Kanvas SOHO, Cyberjaya",
  },
  DROP_B: {
    name: "Section 51A, PJ",
    latitude: 3.0942469,
    longitude: 101.6316896,
    address: "Extra Space Asia, Section 51A, Petaling Jaya",
  },
};

export const VEHICLE = {
  name: "Isuzu D-Max 4x4 (2021)",
  capacity: 20,          // max points per load (Isuzu D-Max max load)
  startHour: 10,         // first pickup at 10:00 AM
  endHour: 16,           // must be back home by 4:00 PM
  serviceTimePickup: 8,  // minutes per pickup
  serviceTimeDrop: 10,   // minutes per drop-off
  avgSpeed: 40,          // km/h fallback
};

export interface PickupNode {
  id: string;
  orderId: string;
  customerName: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  load: number;
  size: string;
  dropOffId: "DROP_A" | "DROP_B";
  zone: number;
  points: number;
  phone: string;
  notes: string | null;
  isOffice: boolean;
}

export function assignDropOff(lat: number, lng: number): "DROP_A" | "DROP_B" {
  const distA = haversine(lat, lng, FIXED_LOCATIONS.DROP_A.latitude, FIXED_LOCATIONS.DROP_A.longitude);
  const distB = haversine(lat, lng, FIXED_LOCATIONS.DROP_B.latitude, FIXED_LOCATIONS.DROP_B.longitude);
  return distB < distA ? "DROP_B" : "DROP_A";
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { haversine as haversineKm };

export function sizeToLoad(size: string): number {
  switch ((size || "S").toUpperCase()) {
    case "S": return 1;
    case "M": return 2;
    case "L": return 3;
    default: return 1;
  }
}

export function generateTrackingId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = "";
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 16; i++) {
    id += chars[arr[i] % chars.length];
  }
  return id;
}