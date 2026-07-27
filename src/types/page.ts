// ============ TYPES ============
export interface Order {
  id: string; orderId: string; customerName: string; phone: string;
  address: string; city: string; size: string; points: number;
  zone: number; isOffice: boolean; status: string;
  scheduledDate: string | null; notes: string | null;
  latitude: number | null; longitude: number | null;
  isEvent?: boolean; eventType?: string;
  isErthbox?: boolean; erthboxLocationId?: string | null;
  addressVerified?: boolean; addressVerificationNote?: string | null;
  createdAt: string; updatedAt: string;
  user?: { id: string; username: string; displayName: string; role: string };
}
export interface Holiday { id: string; date: string; name: string; }
export interface OffDay { id: string; date: string; reason?: string | null; }
export interface ZoneConfig { id: string; zone: number; area: string; isExcluded: boolean; }
export interface UserZoneData { id: string; zoneId: number; name: string; region: string; isCustom: boolean; isEnabled: boolean; areas: string[]; order: number; }
export interface SOSRequest {
  id: string; orderId: string; orderRef: string; customerName: string;
  phone: string; address: string; city: string; size: string;
  points: number; zone: number; isOffice: boolean; notes: string | null;
  sosNote: string; status: string; fromUserId: string;
  toUserId: string | null; createdAt: string; updatedAt: string;
}
export interface Stats {
  pendingCount: number; scheduledCount: number; confirmedCount: number;
  bookedCount: number; completedCount: number;
  todayPoints: number; weekPoints: number;
  scheduleByDate: Record<string, { orders: Order[]; totalPoints: number }>;
  holidays: Holiday[]; todayOrders: Order[];
  offDays: OffDay[]; activeSosCount: number;
  // New fields for time-range and hero dashboard
  range?: string; createdInRange?: number; completedInRange?: number;
  pointsInRange?: number; bySize?: Record<string, number>; byCity?: Record<string, number>;
  trends?: Array<{ date: string; created: number; completed: number }>;
  mappableOrders?: Array<{ id: string; orderId: string; customerName: string; address: string; city: string; latitude: number; longitude: number; status: string; scheduledDate: string | null; size: string; points: number; zone: number; isEvent: boolean; isErthbox: boolean; userId?: string; user?: { id: string; username: string; displayName: string; role: string } }>;
  selWeekPoints?: number; selWeekStart?: string; selWeekEnd?: string;
  selWeekScheduleByDate?: Record<string, { orders: Order[]; totalPoints: number }>;
}
export interface ManagedUser {
  id: string; username: string; displayName: string;
  role: "ADMIN" | "HERO" | "SUPPORT"; isActive: boolean; isApproved: boolean;
  createdAt: string; _count: { orders: number; sosRequests: number };
}
export interface HeroOption {
  id: string; username: string; displayName: string;
}
export interface NotificationItem {
  id: string; type: string; title: string; message: string;
  isRead: boolean; actionUrl: string | null; createdAt: string;
}
export interface ChatMsg {
  id: string; userId: string; message: string;
  mentions: string | null; isDeleted: boolean; createdAt: string;
  user: { id: string; username: string; displayName: string; role: string };
}
export interface AuditLogEntry {
  id: string; userId: string; action: string; entity: string;
  entityId: string | null; details: string | null; createdAt: string;
  user: { id: string; username: string; displayName: string; role: string };
}

export interface OnboardingStep {
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export interface ErthboxLocation {
  id: string; name: string; address: string; city: string;
  picName: string; picPhone: string; notes: string | null;
  isActive: boolean; userId: string;
  user?: { id: string; username: string; displayName: string };
  _count?: { orders: number };
  createdAt: string; updatedAt: string;
}


// ============ WHATSAPP ============
export interface WhatsAppTemplate {
  id: string;
  name: string;
  message: string;
  isDefault?: boolean;
}

export const WHATSAPP_VARIABLES = [
  { key: "{customerName}", label: "Customer Name", example: "John" },
  { key: "{date}", label: "Scheduled Date", example: "15 Mar 2025 (Sat)" },
  { key: "{address}", label: "Address", example: "123, Jalan Ampang, KL" },
  { key: "{phone}", label: "Phone", example: "+60 12-345 6789" },
  { key: "{orderId}", label: "Order ID", example: "25659" },
  { key: "{size}", label: "Size", example: "M" },
  { key: "{points}", label: "Points", example: "2" },
  { key: "{city}", label: "City/Area", example: "Ampang" },
  { key: "{notes}", label: "Notes", example: "Call before delivery" },
  { key: "{arrival}", label: "Arrival Time", example: "14:30" },
  { key: "{trackUrl}", label: "Tracking URL", example: "https://..." },
] as const;

export const ROUTE_OPTIMIZER_VARIABLES = [
  { key: "{customerName}", label: "Customer Name" },
  { key: "{date}", label: "Route Date" },
  { key: "{address}", label: "Address" },
  { key: "{arrival}", label: "ETA (Planned)" },
  { key: "{trackUrl}", label: "Tracking URL" },
] as const;

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "default-schedule",
    name: "Schedule Confirmation",
    message: "Hi {customerName}, this is from ERTH pickup service. Your e-waste pickup has been scheduled for *{date}* between 10am-4pm at {address}. Please reply to confirm or suggest an alternative date. Thank you! 🚛",
    isDefault: true,
  },
  {
    id: "default-reminder",
    name: "Pickup Reminder",
    message: "Hi {customerName}! 📦 Reminder: Your e-waste pickup is tomorrow *{date}* at {address}. Please ensure items are ready for collection between 10am-4pm. See you then! 🚛",
    isDefault: false,
  },
  {
    id: "default-reschedule",
    name: "Reschedule Notice",
    message: "Hi {customerName}, we need to reschedule your e-waste pickup (Order #{orderId}). Your new pickup date is *{date}* at {address}. Sorry for the inconvenience! Please reply to confirm. 🚛",
    isDefault: false,
  },
  {
    id: "default-thankyou",
    name: "Thank You (Post-Pickup)",
    message: "Hi {customerName}! Thank you for choosing ERTH e-waste pickup service. Your order #{orderId} has been completed. ♻️ We appreciate your effort in recycling responsibly! Feel free to reach out for future pickups. 🌍",
    isDefault: false,
  },
];
