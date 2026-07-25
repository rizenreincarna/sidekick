"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  format, addDays, parseISO, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay,
  isToday, isWeekend
} from "date-fns";
import {
  Truck, Plus, Calendar, ClipboardList, Settings, Send, CheckCircle2,
  Clock, MapPin, Phone, Building2, Home, AlertCircle, Zap, RotateCcw,
  Trash2, MessageCircle, X, ChevronRight, ChevronLeft, Route, Download, Upload,
  Eye, Shield, ShieldCheck, Info, Layers, CalendarDays, ArrowRightLeft, LogOut, User as UserIcon,
  FileSpreadsheet, FileDown, FileUp, CheckCircle, AlertTriangle, Pencil, Save,
  Siren, StickyNote, Users, UserPlus, Key, UserCog, Undo2, MapPinOff, Globe, PlusCircle,
  Bell, Search, ChevronDown, ChevronUp, AtSign, BookOpen, GraduationCap, Lightbulb,
  Sparkles, Target, ArrowRight, Play, History, Tag, Star, Bot, Loader2, Package, BarChart3,
  Smartphone, XCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { ZONES, STATUS_CONFIG, SIZE_CONFIG, getZoneName, getZoneColor, MAX_DAILY_POINTS, CUSTOM_ZONE_START } from "@/lib/zones";
import { AiChatPanel, AiSettingsSection } from "@/components/ai-assistant";
import { VerificationProgressDrawer } from "@/components/verification-progress";
import { GeocodeProgressDrawer } from "@/components/geocode-progress";
import { HeroProfileDialog } from "@/components/hero-profile-dialog";

// ============ TYPES ============
interface Order {
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
interface Holiday { id: string; date: string; name: string; }
interface OffDay { id: string; date: string; reason?: string | null; }
interface ZoneConfig { id: string; zone: number; area: string; isExcluded: boolean; }
interface UserZoneData { id: string; zoneId: number; name: string; region: string; isCustom: boolean; isEnabled: boolean; areas: string[]; order: number; }
interface SOSRequest {
  id: string; orderId: string; orderRef: string; customerName: string;
  phone: string; address: string; city: string; size: string;
  points: number; zone: number; isOffice: boolean; notes: string | null;
  sosNote: string; status: string; fromUserId: string;
  toUserId: string | null; createdAt: string; updatedAt: string;
}
interface Stats {
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
interface ManagedUser {
  id: string; username: string; displayName: string;
  role: "ADMIN" | "HERO" | "SUPPORT"; isActive: boolean; isApproved: boolean;
  createdAt: string; _count: { orders: number; sosRequests: number };
}
interface HeroOption {
  id: string; username: string; displayName: string;
}
interface NotificationItem {
  id: string; type: string; title: string; message: string;
  isRead: boolean; actionUrl: string | null; createdAt: string;
}
interface ChatMsg {
  id: string; userId: string; message: string;
  mentions: string | null; isDeleted: boolean; createdAt: string;
  user: { id: string; username: string; displayName: string; role: string };
}
interface AuditLogEntry {
  id: string; userId: string; action: string; entity: string;
  entityId: string | null; details: string | null; createdAt: string;
  user: { id: string; username: string; displayName: string; role: string };
}
interface ErthboxLocation {
  id: string; name: string; address: string; city: string;
  picName: string; picPhone: string; notes: string | null;
  isActive: boolean; userId: string;
  user?: { id: string; username: string; displayName: string };
  _count?: { orders: number };
  createdAt: string; updatedAt: string;
}

// ============ WHATSAPP ============
interface WhatsAppTemplate {
  id: string;
  name: string;
  message: string;
  isDefault?: boolean;
}

const WHATSAPP_VARIABLES = [
  { key: "{customerName}", label: "Customer Name", example: "John" },
  { key: "{date}", label: "Scheduled Date", example: "15 Mar 2025 (Sat)" },
  { key: "{address}", label: "Address", example: "123, Jalan Ampang, KL" },
  { key: "{phone}", label: "Phone", example: "+60 12-345 6789" },
  { key: "{orderId}", label: "Order ID", example: "25659" },
  { key: "{size}", label: "Size", example: "M" },
  { key: "{points}", label: "Points", example: "2" },
  { key: "{city}", label: "City/Area", example: "Ampang" },
  { key: "{notes}", label: "Notes", example: "Call before delivery" },
] as const;

const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
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

function fillTemplate(template: string, order: Order): string {
  const date = order.scheduledDate ? format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)") : "TBD";
  return template
    .replace(/\{customerName\}/g, order.customerName)
    .replace(/\{date\}/g, date)
    .replace(/\{address\}/g, order.address)
    .replace(/\{phone\}/g, order.phone)
    .replace(/\{orderId\}/g, order.orderId)
    .replace(/\{size\}/g, order.size)
    .replace(/\{points\}/g, order.points.toString())
    .replace(/\{city\}/g, order.city)
    .replace(/\{notes\}/g, order.notes || "N/A");
}

function formatPhoneForWhatsApp(phone: string, prefix: string = "60"): string {
  if (phone.startsWith("+")) return phone.substring(1);
  if (phone.startsWith(prefix)) return phone;
  return `${prefix}${phone.replace(/^0/, "")}`;
}

function getWhatsAppLink(order: Order, template?: string, phonePrefix?: string): string {
  const msg = template ? fillTemplate(template, order) : fillTemplate(DEFAULT_WHATSAPP_TEMPLATES[0].message, order);
  const phone = formatPhoneForWhatsApp(order.phone, phonePrefix || "60");
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

// ============ CHANGELOG ============
const CHANGELOG = [
  {
    version: "v1.27",
    date: "24 Jul 2026",
    title: "Smart Drop-Point Selection & Route Editor",
    highlights: [
      "Route optimizer now picks the shortest drop-off point per load — compares DROP_A (Cyberjaya) vs DROP_B (PJ) from your last pickup and chooses the shorter route",
      "Distance target indicator: total distance shown in green (≤100 km) or amber (>100 km) with alternative-drop comparison",
      "Tap 'switch to …' on any load to toggle its drop point and see the difference live",
      "Drag-and-drop reorder: grab the ⋮⋮ grip handle to rearrange pickup stops — ETAs and distances recalculate instantly",
      "Reverse route button (⇅) on each load flips the stop order so you can test whether the opposite direction is shorter",
    ],
    changes: [
      "Saved routes from before this update are auto-upgraded — no data loss",
    ],
  },
  {
    version: "v1.26",
    date: "Jul 2026",
    title: "Android: Pull-to-Refresh Fix & Settings Changelog",
    highlights: [
      "Android: Pull-to-refresh disabled on route optimizer / map pages — dragging the map no longer reloads",
      "Android: Added AndroidBridge.openSettings() and setPullToRefresh() JS bridges",
      "Android: App version now dynamic in Settings (reads BuildConfig.VERSION_NAME)",
      "Android: Settings page now has What's New changelog section at the bottom",
      "Android: User-agent strings auto-update with version number",
    ],
    changes: [],
  },
  {
    version: "v1.25",
    date: "Jul 2026",
    title: "Android: GPS Crash Fixed",
    highlights: [
      "CRITICAL: Fixed crash loop where enabling GPS then relaunching would crash immediately",
      "Root cause: startForegroundService called without location permission check — Android 14 throws SecurityException",
      "Added safeStartGpsTracking() with permission check + try/catch at all 4 call sites",
      "Fixed onResume auto-restart crash — GPS pref now resets to false when permission missing",
    ],
    changes: [],
  },
  {
    version: "v1.24",
    date: "Jul 2026",
    title: "Android: Source Audit & Rebuild",
    highlights: [
      "Full source audit: all layouts, drawables, colors, IDs, permissions verified present",
      "Application ID: space.rizen.sidekick, minSdk 24, targetSdk 34",
      "ProGuard/R8: -keep class space.rizen.sidekick.**",
    ],
    changes: [],
  },
  {
    version: "v1.23",
    date: "Jul 2026",
    title: "Android: Initial Sidekick Release",
    highlights: [
      "WebView-based app loading sidekick.rizen.space",
      "GPS tracking via foreground service (FusedLocationProviderClient)",
      "JavaScript bridge: startGpsTracking, stopGpsTracking, isGpsTracking, getAppVersion, showToast",
      "Settings: server URL, GPS toggle + interval, push notifications",
      "Deep link support for /track/[token] URLs",
    ],
    changes: [],
  },
  {
    version: "v1.21",
    date: "Jul 2026",
    title: "Size System Overhaul & Points Increase",
    highlights: [
      "Default order size changed from Small (1pt) to Medium (2pt) for new orders",
      "New XL (4pt) and XXL (15pt) size options — better size-to-load mapping",
      "Encore CSV import now defaults to Medium (2pt) size",
      "Size scale: S=1, M=2, L=3, XL=4, XXL=15",
      "MAX_DAILY_POINTS increased from 12 to 20 — can fit more orders per day",
      "Points validation updated to allow 1-20 points per order",
      "Skip today and tomorrow in scheduler — no more accidental same-day assignments",
    ],
    changes: [
      "getSizePoints() updated with XL and XXL cases, default changed from 1 to 2",
      "SIZE_CONFIG expanded with XL and XXL entries with purple and red color badges",
      "Form defaults: new orders start at M/2pt instead of S/1pt",
      "Size selector in order form now includes X-Large and XX-Large options",
      "Encore CSV import: imported orders now default to Medium (2pt) size",
      "MAX_DAILY_POINTS raised from 12 to 20 in zones.ts",
      "Frontend points validation: 1-20 (was 1-12), error messages updated",
      "Backend points validation: all API routes updated to allow up to 20 points",
      "UI labels and help text updated across the app to reflect new size scale",
      "Scheduler: added skip for today (i=0) and tomorrow (i=1), first working day is +2",
"Order sorting feature (v1.20): Sort by creation date, order ID, or last update",
      "Restored missing batch status/date API endpoints for bulk order operations",
    ],
  },
  {
    version: "v1.20",
    date: "Jul 2026",
    title: "Order Sorting",
    highlights: [
      "New Sort dropdown in the Orders tab — sort by creation date, order ID, or last update",
      "Stops ERTHBOX orders from always pinning to the top — sort by date/ID to reorder",
      "Default sort is 'Latest created first' (matches previous behaviour)",
    ],
    changes: [
      "Added Sort select dropdown in the Orders filter bar (next to date filter)",
      "Sort options: Latest created first, Oldest created first, Order ID ascending, Order ID descending, Latest updated first, Oldest updated first",
      "Order ID sort parses the numeric portion of the orderId (handles Encore 5-digit IDs)",
      "Sort applies after filtering — filter + sort work together",
      "Default: 'Latest created first' so existing users see no change in order",
    ],
  },
  {
    version: "v1.19",
    date: "Jul 2026",
    title: "ntfy Push Notifications — Firebase Removed",
    highlights: [
      "Push notifications now powered by self-hosted ntfy — no Google Play Services required",
      "Removed Firebase FCM entirely — no service account keys, no OAuth tokens, no API costs",
      "Android app uses real-time SSE subscription instead of FCM data messages",
      "ntfy server running on VPS at ntfy.erthsidekick.xyz with 12h message cache",
      "Works on devices without Google Play Services (Huawei, custom ROMs, degoogled phones)",
    ],
    changes: [
      "Installed ntfy v2.11.0 server on VPS (systemd service, port 2586, Caddy reverse proxy)",
      "Created src/lib/ntfy.ts — drop-in replacement for fcm.ts with identical API",
      "All notification triggers (SOS, orders, chat, daily broadcast) now publish via ntfy HTTP POST",
      "Each device generates a unique unguessable topic (sk-<32hex>) — topic name is the auth credential",
      "Android: removed Firebase BoM, firebase-messaging, google-services plugin, google-services.json",
      "Android: removed SidekickFirebaseMessagingService and FcmRegistrar entirely",
      "Android: new NtfySubscriber foreground service — subscribes via SSE long-poll, auto-reconnects",
      "Android: new NtfyRegistrar — generates topic locally, registers with server via WebView fetch",
      "Android: NtfySubscriber replaces NotificationPollService (polling fallback also removed)",
      "Android: version bumped to 1.1.0 (versionCode 2) — new APK required",
      "BootReceiver now starts NtfySubscriber instead of poll service on device boot",
      "WebView JS bridge injects __sidekickPushToken (ntfy topic) instead of __sidekickFcmToken",
      "DeviceToken table reused — ntfy topic stored as token field, platform = 'android-ntfy'",
      "ntfy Caddy block configured with 24h read/write timeout for long-lived SSE connections",
    ],
  },
  {
    version: "v1.18",
    date: "Jul 2026",
    title: "Smart Scheduler, Office Detection Fix & Backup Hardening",
    highlights: [
      "Auto-scheduler rewritten with geographic clustering — orders now grouped by proximity, not just fill-order",
      "Zone-contiguous days keep one region per trip; centroid-based scoring minimises driving distance",
      "Day-density packing fills days to capacity before opening a new one — no more single-order stranded days",
      "Office detection fixed — Pangsapuri, Kondominium, Apartment, Taman addresses no longer falsely flagged as offices",
      "Malaysian-specific residential keyword pre-filter catches condos before the AI even looks at them",
      "Encore import no longer assumes every customer name is a company — personal names now correctly classified",
      "Daily backups now archive the full app build + source code — rollback can never lose features again",
    ],
    changes: [
      "Rewrote scheduler.ts: two-phase algorithm with centroid clustering, zone-contiguous processing, Phase B rebalance",
      "Phase A: greedy min-travel assignment — computes haversine centroid per day, places nearest orders together",
      "Phase B: rebalance eliminates single-order days by merging stranded orders into nearby same-zone days",
      "Scheduler now geocodes pending orders missing coordinates before scheduling, so proximity scoring always works",
      "Office detection: isLikelyResidential() pre-filter catches 20+ Malaysian housing terms (Pangsapuri, Kondominium, etc.)",
      "Office detection: AI prompt rewritten with explicit Malaysia-specific rules — Taman = housing, NEVER office",
      "Office detection: pre-filter overrides AI result — keyword check always wins if AI misclassifies",
      "Encore import: fixed critical bug where ALL non-phone customer names were marked as offices (e.g. 'Ali bin Abu')",
      "Encore import: now uses company-name indicator list + business-hours keywords instead of blanket name assumption",
      "Encore import: residential text in address overrides company name signals (home business ≠ office pickup)",
      "Automatic AI office detection on order creation (POST /api/orders) with customerName context",
      "Fixed address verification zone type bug — suggestedZone now coerced from string to Int for Prisma",
      "Daily backup script now archives app build (56 MB standalone) + app source (756 KB) for 30-day retention",
      "Geocode Orders feature: confirmed fully removed from active UI (v1.13 removal is permanent)",
    ],
  },
  {
    version: "v1.17",
    date: "Jun 2026",
    title: "Performance: Client-Side Caching & Live Revalidation",
    highlights: [
      "Orders, stats, and holidays now load instantly from a local cache (no more blank screen on open)",
      "Background revalidation swaps in fresh data without a loading flash (stale-while-revalidate)",
      "Auto-refresh every 45s + on app-foreground, so data self-heals — no need to quit and re-enter",
      "Rapid actions (batch status, delete) coalesce into a single refetch instead of N simultaneous ones",
      "First load is the only time you see 'Loading...'; afterwards the last-known data always paints instantly",
    ],
    changes: [
      "useFetchData upgraded to a cached stale-while-revalidate hook backed by localStorage",
      "Cached data renders immediately on mount; a background fetch swaps in fresh data when it arrives",
      "isLoading is now true ONLY on the first-ever load (no cached data); revalidating flag covers background refreshes",
      "Fixed loading-flag race: isLoading/revalidating set before the fetch starts, cleared only on settle",
      "refreshAll debounced (300ms) so batch operations trigger one coalesced refetch, not N×3 simultaneous fetches",
      "Auto-revalidation interval (45s) re-fetches orders + stats, paused when the tab is hidden (battery)",
      "visibilitychange listener triggers an immediate refresh when the app returns to the foreground",
      "Eliminates the 'quit app to make data appear' issue — stale data is always shown and self-heals",
    ],
  },
  {
    version: "v1.16",
    date: "Jun 2026",
    title: "Scheduling, SOS, Notifications & Daily AI Briefing",
    highlights: [
      "Auto-scheduler no longer assigns orders to today or tomorrow (already-over / locked days)",
      "SOS accept bug fixed — heroes can now answer SOS without a false 'order already exists' error",
      "Push notifications fixed — Android app now reliably registers its FCM token via the WebView",
      "Editing an address now automatically triggers re-verification",
      "Chat drawer top bar no longer hidden behind the Android status bar",
      "AI sends a daily summary to every hero at 7am MYT with a push notification",
      "Status changes show real error messages instead of a silent 'Failed'",
    ],
    changes: [
      "Scheduler: skip today (i=0) and tomorrow (i=1) when building working days — first available day is +2",
      "SOS accept: cross-user duplicate check now excludes the original order (it's about to be transferred), fixing the false DUPLICATE_ORDER 409",
      "Android: FCM token registered via WebView same-origin fetch (was failing 401 because the native HTTP call lacked the session cookie)",
      "Android: explicit token fetch on launch via FirebaseMessaging.getToken() + re-injection on refresh",
      "Android: chat drawer SheetHeader gets safe-top padding to clear the edge-to-edge status bar",
      "Orders edit: verifyOrderAddress called after address/city change (non-blocking) so re-verification is automatic",
      "Orders edit: stale 'Points must be between 1 and 20' message corrected to use MAX_DAILY_POINTS",
      "Daily broadcast: new daily-broadcast.ts generates a personalized summary per hero + sends a push + in-app notification",
      "Daily broadcast: 60s interval scheduler triggers at 07:00 MYT daily, idempotent per day, skips heroes with no orders",
      "Daily broadcast: /api/ai/daily-summary-broadcast admin endpoint for manual testing",
      "Status change: updateStatus now surfaces the server error message and distinguishes network errors",
    ],
  },
  {
    version: "v1.15",
    date: "Jun 2026",
    title: "Android App, Push Notifications & Vision AI",
    highlights: [
      "Native Android app (HERO Sidekick) wrapping the webapp with push notifications",
      "Push notifications for SOS requests, new orders assigned, system alerts, and chat mentions",
      "AI now runs on Ollama (minimax-m3:cloud) with photo upload for vision-based questions",
      "Address verification fixed — uses geocoding + AI, no longer fails with missing-SDK error",
      "AI model picker dropdown in Settings auto-fetches available models from your provider",
      "Header redesigned: two-tier layout so login/logout never gets cut off on mobile",
    ],
    changes: [
      "Android: Kotlin WebView shell (com.erth.sidekick) with FCM push + foreground polling fallback",
      "Android: Firebase Cloud Messaging v1 API (OAuth2 JWT from service account) for reliable delivery",
      "Android: camera + gallery photo picker for AI chat file uploads",
      "Android: adaptive launcher icon from Sidekick.png, edge-to-edge viewport with safe-area insets",
      "Server: DeviceToken model + /api/devices/register endpoint for push token registration",
      "Server: FCM sender (fcm.ts) with batched fan-out + token cache invalidation on key rotation",
      "Server: push triggers wired into SOS, order reassign, system notifications, chat mentions",
      "Server: Ollama installed as local cloud proxy (127.0.0.1:11434) authenticated to ollama.com",
      "Server: address-verify rewritten to use chatWithDeepSeek (Ollama) + Nominatim, dropped z-ai-web-dev-sdk",
      "Server: /api/ai/models endpoint fetches available models from configured provider for the selector",
      "Webapp: ChatMessage supports vision content (text + image_url) for multimodal models",
      "Webapp: AI chat accepts up to 4 images, downsized to 1024px JPEG, sent to vision model",
      "Webapp: AI model picker is now a dropdown populated from the provider, with manual fallback + refresh",
      "Webapp: two-tier header (brand row + actions row) fixes login/logout cut-off on narrow screens",
      "Webapp: fixed header spacer uses calc(6rem+env(safe-area-inset-top)) to clear notch on Android",
      "Webapp: favicon + web manifest + Sidekick.png branding across header, login, and loading splash",
      "Fix: clicking the status badge no longer simultaneously opens the timeline/audit dialog",
      "Fix: same timeline-conflict bug fixed on the points (size) button — now only opens Change Points dialog",
      "Fix: points selectors (create-order + change-points) now offer 1–20 (was hardcoded 12 despite 20pt cap)",
      "Fix: AI chat context + daily-summary now reference the 20pt cap via MAX_DAILY_POINTS constant",
    ],
  },
  {
    version: "v1.14",
    date: "Jun 2026",
    title: "Mobile-First UI Redesign & Bottom Navigation",
    highlights: [
      "Mobile bottom navigation bar replaces cramped top tab strip on small screens",
      "Premium dark theme with obsidian slate palette, emerald accents, proper WCAG contrast",
      "Splash screen redesigned with animated loading telemetry bar",
      "Desktop tabs remain as sticky top strip — responsive per-viewport optimization",
      "Fixed empty scroll gaps and bottom nav persistence on mobile",
    ],
    changes: [
      "Replaced top TabsList with sticky bottom navigation bar on mobile (sm:hidden)",
      "Bottom nav: icon + label per tab, SOS badge with ping animation, 56px touch targets",
      "Desktop: tabs unchanged, hidden on mobile via hidden sm:block",
      "Main layout: overflow-y-auto on main content, bottom nav fixed to viewport (z-50)",
      "Bottom nav: safe-area-inset-bottom padding for notched devices",
      "Added pb-24 bottom padding on main content to prevent nav overlap on mobile",
      "Loading screen: centered flex layout with ShieldCheck icon, pulse animation, progress bar",
      "Header: updated to uppercase tracking-widest typography, ShieldCheck emerald branding",
      "Color palette: #0B0F17 base, #161B22 cards, #21262D borders, #34D399 emerald primary, #8B949E secondary text, #F87171 destructive",
      "Fixed bottom nav disappearing on scroll by converting main to overflow-y-auto with flex-1 parent",
      "Fixed empty scroll gap by restructuring layout to contain scrolling within main area",
    ],
  },
  {
    version: "v1.13",
    date: "Jun 2026",
    title: "Multi-Order Select, Balance Display & Address Verification",
    highlights: [
      "Admin Dashboard now shows DeepSeek account balance",
      "Multi-order selection in Orders tab — select, filter by date, and batch change status",
      "Address verification automatically triggers after Encore CSV import with progress panel",
      "Removed Geocode Orders feature and map — eliminates wrong GPS in Zeo exports",
    ],
    changes: [
      "Admin Dashboard: DeepSeek balance card displays current account credit from /api/ai/balance",
      "Orders tab: date filter input added next to zone filter for filtering by scheduled date",
      "Orders tab: Select mode toggle button allows batch selection of orders",
      "Orders tab: batch action bar appears when orders are selected — choose new status and apply",
      "Orders tab: batch PATCH /api/orders/batch/status updates selected orders in bulk (max 100)",
      "OrderCard: checkbox and highlight ring shown when select mode is active",
      "Encore CSV import now triggers AI address verification for imported orders",
      "VerificationProgressDrawer shows real-time progress of address verification",
      "Fixed: onVerifyStart callback properly threaded through NewOrderTab and SettingsTab",
      "Removed: GeocodeSection component, Geocode Orders UI in Settings, geocode changelog entries",
      "Removed: Auto-Geocoding help section from knowledge base",
      "Removed: hero-map.tsx component (map feature deleted entirely)",
      "Cleaned up v1.7 changelog section (removed auto-geocoding references)",
    ],
  },
  {
    version: "v1.12",
    date: "Jun 2026",
    title: "Zone System Overhaul & Smart Matching",
    highlights: [
      "Zone system audit — fixed 6 zone-related bugs including scheduler ignoring disabled zones",
      "Smart zone matching — prevents false matches like 'kl' matching 'klcc' with word-boundary detection",
      "Auto-scheduler now respects disabled zones — orders in disabled zones are re-detected automatically",
      "Zone filter shows enabled zones first, disabled zones separated and greyed out",
      "Zone badges on orders now visually indicate when a zone is disabled (strikethrough + 'off' label)",
      "Schema comment corrected from '1-7' to '1-14, 100+ custom zones'",
    ],
    changes: [
      "Fixed CRITICAL: Auto-scheduler ignored disabled zones — orders in disabled zones were still grouped and scheduled under them, now re-detects zone before scheduling",
      "Fixed CRITICAL: Loose zone matching — 'kl' matched 'klcc', 'pj' matched anywhere; short area codes (≤3 chars) now require exact word-boundary match",
      "Fixed: Zone filter dropdown showed all zones equally — now shows enabled zones first, disabled zones under a 'Disabled' section with reduced opacity",
      "Fixed: Custom zones that were disabled still appeared in filter — now filtered by isEnabled flag",
      "Fixed: ZoneBadge had no visual indication of disabled zones — now shows strikethrough + '(off)' label for disabled zones",
      "Fixed: OrderCard didn't pass disabled zone info — now receives disabledZones prop and passes isDisabled to ZoneBadge",
      "Updated zone matching algorithm: new zoneMatch() function with smart rules — exact match, word-boundary for short codes, substring for longer names",
      "Updated detectZoneWithCustom to use the same zoneMatch() function for consistency",
      "Updated Prisma schema comment: zone Int // 1-7 → // 1-14 built-in, 100+ custom zones",
      "Scheduler now fetches disabledZones from settings before grouping, and re-assigns orders in disabled zones to the next best zone",
    ],
  },
  {
    version: "v1.11",
    date: "Jun 2026",
    title: "Full System Audit & Performance Optimization",
    highlights: [
      "83 bugs audited across frontend, backend, and database — 40+ critical/high fixes applied",
      "Fixed 165+ JWT session errors — NEXTAUTH_SECRET now properly configured",
      "Eliminated infinite re-render loops in Chat & Notifications — major speed improvement",
      "Added 19 database indexes — 10-100x query speedup for orders, stats, and audit logs",
      "Optimized for 10+ concurrent users — WAL mode, API caching, batched writes, pagination",
      "Hardened security — status transition validation, IDOR protection, race condition fixes, prompt injection mitigation",
    ],
    changes: [
      "Fixed CRITICAL: NEXTAUTH_SECRET not set — caused 165+ JWT decryption errors and constant 401s after server restart",
      "Fixed CRITICAL: ChatBubble infinite re-render loop — lastSeenId state caused useEffect→setState→re-render cycle, replaced with useRef",
      "Fixed CRITICAL: ChatDrawer polling infinite loop — messages in useEffect deps caused interval reset on every new message",
      "Fixed CRITICAL: No order status transition validation — users could skip workflow stages or revert completed orders, now enforces PENDING→SCHEDULED→CONFIRMED→BOOKED→COMPLETED",
      "Fixed CRITICAL: SOS answer race condition — two users answering the same SOS could cause data loss, now wrapped in db.$transaction with atomic check-and-update",
      "Fixed CRITICAL: Notification IDOR — any authenticated user could create notifications for any other user, now restricted to self or ADMIN/SUPPORT only",
      "Fixed CRITICAL: Duplicate order IDs persisted with _warning flag — now returns 409 rejection for data integrity",
      "Fixed CRITICAL: AI prompt injection via address/city fields — user input now sanitized (newlines stripped, length capped)",
      "Fixed: Removed wasteful notification poll that fired every 30s and discarded the response",
      "Fixed: NotificationBell double fetch — replaced ?limit=1 then ?limit=100 with single ?limit=50 request",
      "Fixed: useFetchData swallowed errors silently — now exposes error and isLoading states; empty URLs are skipped",
      "Fixed: deleteOrder showed success toast regardless of server response — now checks res.ok first",
      "Fixed: WhatsApp template saves were fire-and-forget — now awaits and checks response before showing success",
      "Fixed: OrderCard date dialog showed stale state — newDate now resets to order.scheduledDate when dialog opens",
      "Fixed: AI action UPDATE_ORDER payload had no validation — now validates size (S/M/L), date format, name/phone/city lengths, points range",
      "Fixed: ERTHBOX delete left orphaned order references — now checks for associated orders before deletion",
      "Fixed: AI chat loaded ALL orders into memory — replaced with 8 targeted queries (pending: 20, scheduled: 20, today, thisWeek, events: 10, erthbox: 10)",
      "Fixed: Holiday seed created 23 records sequentially — now uses createMany batch insert",
      "Added 19 database indexes across 10 models: Order (6), AuditLog (3), Notification (2), ChatMessage (1), SOSRequest (2), AiMessage (1), AiAction (2), AiFlag (1), Holiday (1), OffDay (1)",
      "Enabled SQLite WAL mode — allows concurrent reads during writes, critical for multi-user support",
      "Added 5-second in-memory cache for /api/heroes — repeat requests served instantly",
      "Added 3-second per-user cache for /api/stats — dashboard loads faster on repeat visits",
      "Added pagination to /api/orders — accepts ?page=1&limit=50, returns { orders, total, page, totalPages }",
      "Batched scheduler updates with db.$transaction — single atomic transaction instead of N sequential updates",
      "Optimized generateErthboxId — uses findFirst+orderBy desc instead of fetching ALL erthbox orders",
      "Fixed TOTP backup codes using Math.random — now uses crypto.randomBytes for cryptographic security",
      "Made Prisma query logging dev-only — removed production overhead",
      "Fixed: Admin/Support dashboards didn't refresh on global refresh — added dashboardRefreshKey cache buster",
      "Fixed: Native <select> in SupportDashboard — replaced with shadcn Select for visual consistency",
      "Fixed: ErthboxLocation interface missing user field — added proper type, removed unsafe type assertions",
      "Renamed AI Settings 'Validate' button to 'Save & Validate' — accurately describes that it persists the key",
      "Consolidated Settings tab useEffect hooks from 6 to 3 using Promise.all",
      "Optimized Import Encore duplicate check — targeted IN clause instead of loading ALL system orders",
      "Added take limits to Support Stats hero order queries (200 per hero, 50 for all active)",
      "Added 400ms debounce to AuditLog search input",
      "Fixed MiniBarChart using array index as key — now uses d.date for stable React keys",
      "Wrapped ScheduleTab calendar computations in useMemo — prevents redundant recalculation on re-renders",
      "Fixed OnboardingModal step state not resetting when reopened",
      "Fixed ERTHBOX search state not cleared when toggling off ERTHBOX mode",
    ],
  },
  {
    version: "v1.10",
    date: "Jun 2026",
    title: "AI Action System Audit & Hardening",
    highlights: [
      "AI can now reschedule orders — uses [ACTION:RESCHEDULE_ORDER] blocks that require your approval",
      "Fixed AI falsely claiming 'Done ✅' without actually making changes — now always uses action blocks",
      "Fixed BOOKED order protection was completely broken — AI could modify locked orders",
      "ERTHBOX locations are now truly universal — AI can see and use all active locations, not just your own",
      "Comprehensive audit of all AI-system interaction functions — 7 bugs found and fixed",
    ],
    changes: [
      "Added RESCHEDULE_ORDER action type with full backend support — AI can propose date changes for approval",
      "Added CRITICAL ACTION RULES to system prompt: AI must use [ACTION] blocks for ALL modifications, never claim 'Done' without one",
      "Added detailed action format documentation to system prompt: RESCHEDULE_ORDER, UPDATE_ORDER, ADD_NOTE, CHANGE_STATUS",
      "Fixed CRITICAL: BOOKED order protection was broken — entity ID lookup failed (used orderId not UUID), so BOOKED orders were never detected and could be modified",
      "Fixed entity ID lookup bug: all action handlers now fall back to orderId lookup when database UUID lookup fails",
      "Fixed CRITICAL: ERTHBOX location lookup was user-scoped — heroes couldn't create ERTHBOX orders from locations created by other users",
      "Fixed: AI chat context only fetched user's own ERTHBOX locations — now fetches all active locations (universal)",
      "Fixed: ERTHBOX locations in AI context now include full ID for use in CREATE_ERTHBOX action blocks",
      "Added audit logging for ADD_NOTE and CHANGE_STATUS actions (was missing)",
      "Added scheduledDate and notes to UPDATE_ORDER allowed fields",
      "RESCHEDULE_ORDER auto-sets status to SCHEDULED if order was PENDING",
      "Improved action regex parser: now uses brace-counting instead of simple regex, handles nested JSON in action payloads",
      "After outputting action blocks, AI now tells user 'Tap ✓ to approve'",
    ],
  },
  {
    version: "v1.9",
    date: "Jun 2026",
    title: "AI Date Accuracy & Timezone Fix",
    highlights: [
      "AI now correctly identifies days of the week — no more wrong day-of-week answers when scheduling",
      "All date/time calculations now use Malaysia Time (UTC+8) properly regardless of server timezone",
      "AI context includes a 14-day reference calendar so it looks up day names instead of calculating",
      "Removed non-functional map feature from Hero dashboard for a cleaner experience",
    ],
    changes: [
      "Fixed critical timezone bug: date helpers (getMalaysiaTime, daysFromNow) now use Asia/Kuala_Lumpur timezone instead of server local time",
      "Fixed getMalaysiaTime() returning wrong time — timeStr was using server local time, not MYT",
      "Fixed daysFromNow() using toISOString() (UTC) which caused date drift when server timezone ≠ UTC+8",
      "Fixed daily-summary route using server-local date formatting instead of Malaysia timezone",
      "Added 14-day reference calendar injected into AI context with day-of-week for each date",
      "AI system prompt now explicitly instructs: 'NEVER calculate days of the week yourself — refer to the reference calendar'",
      "Weekly schedule context now includes day-of-week names (e.g. '📅 2026-06-28 (Sun)')",
      "Current time context now shows day name (e.g. 'Today: 2026-06-14 (Saturday)')",
      "Removed non-functional interactive map from Hero dashboard (OpenStreetMap embed was unreliable)",
      "Updated version display from v1.7 to v1.8",
    ],
  },
  {
    version: "v1.8",
    date: "Jun 2026",
    title: "Universal ERTHBOX & Dashboard Improvements",
    highlights: [
      "ERTHBOX locations are now universal — shared across all heroes, admins, and support users",
      "ERTHBOX location selector now has search and bounded scrolling for easy selection",
      "Removed non-functional map feature from Hero dashboard for a cleaner experience",
    ],
    changes: [
      "ERTHBOX locations are universal: any user can see and use locations created by others",
      "ERTHBOX location selector in New Order has search bar and bounded scroll list (max-h-48)",
      "ERTHBOX Manager shows 'by [name]' badge for locations created by other users",
      "Only the owner, admin, or support can edit/delete ERTHBOX locations",
      "Removed non-functional interactive map from Hero dashboard (OpenStreetMap embed was unreliable)",
      "ErthboxManagerSection search bar appears when 5+ locations exist",
    ],
  },
  {
    version: "v1.7",
    date: "Jun 2026",
    title: "AI Address Verification & Map Updates",
    highlights: [
      "Hero dashboard map now shows all orders with coordinates",
      "Fixed Support user Settings tab visual glitch",
    ],
    changes: [
      "Malaysia bounds validation: coordinates outside Malaysia (0.5-8N, 98-120E) are rejected",
      "AI Address Verification: after Encore import, addresses are auto-verified using DeepSeek LLM",
    ],
  },
  {
    version: "v1.6",
    date: "Jun 2026",
    title: "Role-Based Dashboards & Support Powers",
    highlights: [
      "Three distinct dashboards: Admin (system stats), Support (hero management), Hero (personal workload)",
      "Time range selector (Day/Week/Month/Year/All Time) on all dashboards for granular data",
      "Support users can reassign orders between heroes with notifications and audit logging",
      "Admin dashboard: AI usage, moderation, user activity, order trends, hero workload",
      "Hero dashboard: selectable week workload, interactive order location map, order trends",
      "Support Orders tab: all heroes' orders by default with hero filter & inline reassignment",
    ],
    changes: [
      "Admin Dashboard with system statistics: total orders, AI usage, user activity, audit summary",
      "Admin Dashboard: order creation/deletion/import trends with time-range filtering",
      "Admin Dashboard: user last logins and active users tracking",
      "Admin Dashboard: AI moderation panel with pending flags from dashboard",
      "Admin Dashboard: hero workload comparison with visual bars",
      "Support Dashboard with hero overview: today's workload, weekly points, OFF days",
      "Support Dashboard: selectable week view for hero workload",
      "Support Dashboard: order reassignment panel — move orders between heroes",
      "Support Dashboard: upcoming hero OFF days for the next 2 weeks",
      "Support users can now update and delete any hero's orders (not just their own)",
      "Support users see ALL orders across heroes by default in Orders tab (no toggle needed)",
      "Support users now have access to Settings tab",
      "Reassign orders directly from the Orders tab — click the reassign button on any order card",
      "Order updates/deletions by Support/Admin notify the assigned hero",
      "Filter orders by hero in the Orders tab when viewing all heroes' orders",
      "All reassignments and support actions are logged in audit trail",
      "Hero Dashboard: time range selector (Day/Week/Month/Year/All Time)",
      "Hero Dashboard: selectable week workload with navigation arrows",
      "Hero Dashboard: interactive OpenStreetMap for order locations (with lat/long)",
      "Hero Dashboard: order creation/completion trends mini chart",
      "Hero Dashboard: range stats showing created, completed, and points earned",
      "AI Assistant now provides cross-hero context for Support/Admin users",
      "AI can answer questions like 'Which heroes are working today?' and 'Who has the lightest workload?'",
      "Added lastLoginAt tracking to User model for activity monitoring",
      "Mini bar chart component for order trends visualization",
      "Updated tutorials and onboarding for role-based dashboards",
    ],
  },
  {
    version: "v1.5",
    date: "Jun 2026",
    title: "AI Intelligence Upgrade & Malaysia Timezone",
    highlights: [
      "AI now knows the current date and time in Malaysia Time (UTC+8) — no more wrong dates",
      "Smarter, more contextual answers with order summaries in point form",
      "AI can answer schedule questions like 'Do I have events next week?' and 'Orders in KL next week?'",
      "Increased AI response quality with longer, actionable answers",
      "AI provides daily schedule analysis with points tracking and conflict detection",
    ],
    changes: [
      "Injected dynamic Malaysia Time (MYT, UTC+8) into every AI conversation — AI always knows the current date and time",
      "AI system prompt upgraded to allow longer, substantive answers instead of 2-3 sentence limits",
      "AI can now answer data queries by date range, city, zone, status, and order type",
      "AI provides structured point-form summaries for schedule questions with totals",
      "AI gives actionable insights — not just data, but what the user should do with it",
      "Rich order context injected into AI: today/tomorrow schedule, weekly view, events, ERTHBOX orders, city distribution",
      "AI knows about upcoming holidays, OFF days, and can warn about scheduling conflicts",
      "Increased max_tokens from 512 to 1500 for more detailed responses",
      "Increased temperature from 0.6 to 0.7 for more natural, intelligent answers",
      "AI context now includes full order details: scheduled dates, sizes, points, event types, ERTHBOX locations",
      "AI can calculate daily points and warn when approaching 12pt daily cap",
      "AI provides weekly schedule grouped by date with points per day",
    ],
  },
  {
    version: "v1.4",
    date: "Jun 2026",
    title: "ERTHBOX Management & Event Scheduling System",
    highlights: [
      "ERTHBOX order type for collecting boxes from fixed locations (malls, offices)",
      "ERTHBOX Manager in Settings → Scheduling for managing collection locations",
      "Auto-generated ERTHBOX-XXX order IDs (similar to EVENT-XXX pattern)",
      "Event scheduling system with EVENT-XXX IDs and event day scheduling blocks",
      "Person in Charge (PIC) management per ERTHBOX location",
    ],
    changes: [
      "Added ERTHBOX order type with auto-generated ERTHBOX-001, ERTHBOX-002, etc. IDs",
      "ERTHBOX orders default to PENDING status (manually scheduled, not auto-scheduled)",
      "ERTHBOX Manager section in Settings → Scheduling tab for managing locations",
      "Each ERTHBOX location stores: name, address, city, PIC name, PIC phone, notes",
      "Location info auto-populates when creating ERTHBOX orders",
      "Notes field per location for important info (e.g. 'mall area, cannot enter between 12PM-2PM')",
      "Active/inactive toggle for ERTHBOX locations",
      "ERTHBOX toggle in New Order tab (mutually exclusive with Event toggle)",
      "AI can create ERTHBOX orders via chat with [ACTION:CREATE_ERTHBOX:NEW:{...}]",
      "Event orders with auto-generated EVENT-XXX IDs (EVENT-001, EVENT-002, etc.)",
      "Event types: ROADSHOW, EWASTE_COLLECTION, OTHER",
      "Event days block auto-scheduling — no regular orders auto-assigned on event dates",
      "Auto-scheduler respects event days as OFF days for regular orders",
      "Added Event and ERTHBOX tutorials in Settings → Tutorial",
    ],
  },
  {
    version: "v1.3",
    date: "Jun 2026",
    title: "AI Order Creation, Smart Zones & 2FA Security",
    highlights: [
      "AI can create orders on your behalf — just describe what you need",
      "Smart zone auto-suggestions: AI adds new areas to zones as orders come in",
      "BOOKED orders are now protected — AI won't suggest changes to them",
      "Google Authenticator 2FA for secure sign-in",
      "AI chat integrated into Team Chat with toggle switch",
    ],
    changes: [
      "AI can create orders when prompted — asks for missing info before proceeding",
      "AI auto-detects zones for new orders using address analysis",
      "When a new area is discovered, AI suggests adding it to the nearest zone",
      "Zone suggestions appear in Zone Manager for user approval",
      "BOOKED orders are locked — AI cannot suggest modifications",
      "Added Google Authenticator 2FA (TOTP) for all accounts",
      "2FA setup in Settings → Security with QR code and step-by-step guide",
      "2FA code required at sign-in when enabled",
      "Registration page now shows 2FA security tip",
      "AI chat merged into Team Chat drawer with Team/AI toggle",
      "Mobile-friendly compact AI responses",
      "Updated all version dates to June 2026",
    ],
  },
  {
    version: "v1.2",
    date: "Jun 2026",
    title: "AI Assistant",
    highlights: [
      "ERTH AI Assistant powered by DeepSeek — chat, ask questions, get help",
      "Daily summary and reminder system for Heroes based on order notes",
      "AI can suggest order changes that require user approval before applying",
      "Dangerous or strange requests are automatically flagged for admin review",
      "Admin-only AI settings: API key, model, base URL, system prompt, enable/disable",
    ],
    changes: [
      "Added ERTH AI Assistant with DeepSeek integration (OpenAI-compatible API)",
      "AI answers questions about tutorials, orders, and app features",
      "AI provides zone grouping suggestions based on order patterns",
      "Daily summary with order stats, note reminders, and tomorrow's preview",
      "AI can propose order changes (update, add note, change status) — requires approval",
      "Conversation memory across sessions for contextual follow-ups",
      "Auto-deactivation if API key is invalid or quota is exceeded",
      "Admin can enable/disable AI system-wide",
      "Future-ready: swap API key, base URL, or model for any OpenAI-compatible provider",
      "Flagged messages system for dangerous or inappropriate requests",
      "AI Settings section in Settings tab (admin only)",
      "Floating AI assistant button with chat drawer",
      "Quick prompt buttons: Daily Summary, Order Status, Zone Tips, Tutorial Help",
    ],
  },
  {
    version: "v1.1",
    date: "Jun 2026",
    title: "WhatsApp Messaging Upgrade",
    highlights: [
      "Edit WhatsApp messages before sending to customers",
      "Create and manage message templates with variable placeholders",
      "WhatsApp settings section with phone prefix and template management",
    ],
    changes: [
      "Added WhatsApp message editor dialog — edit messages before sending",
      "Added message template system with create, edit, delete, and set default",
      "4 built-in templates: Schedule Confirmation, Pickup Reminder, Reschedule Notice, Thank You",
      "Template variables: {customerName}, {date}, {address}, {phone}, {orderId}, {size}, {points}, {city}, {notes}",
      "Added WhatsApp settings section in Settings tab",
      "Configurable country code prefix (default: 60 for Malaysia)",
      "Quick variable insert in message editor",
      "WhatsApp button now available for Scheduled, Contacted, Booked, and Completed orders",
      "Added WhatsApp Messaging to advanced tutorials",
      "Updated basic tutorial for WhatsApp usage",
    ],
  },
  {
    version: "v1.0",
    date: "Jun 2026",
    title: "Official Launch",
    highlights: [
      "Complete order management system with full lifecycle tracking",
      "Zone management with custom zones, renaming, and area exclusions",
      "SOS system for order transfers between drivers",
      "Onboarding tutorial and in-app help system",
      "Changelog & version tracking",
    ],
    changes: [
      "Added onboarding walkthrough for first-time users",
      "Added Tutorial & Help section in Settings with Basic and Advanced guides",
      "Added Changelog section to track all app updates",
      "Polished UI with glass-card styling and dark theme",
      "Stabilized all core features for production use",
    ],
  },
  {
    version: "v0.9",
    date: "Jun 2026",
    title: "Tutorial & Help System",
    highlights: [
      "In-app tutorial system with Basic and Advanced tabs",
      "First-sign-in onboarding walkthrough",
      "Replay onboarding from Settings",
    ],
    changes: [
      "Created TutorialSection component with expandable cards",
      "Added onboarding overlay with step-by-step walkthrough",
      "Basic tutorials: Getting Started, Dashboard, Creating Orders, Scheduling, Managing Orders",
      "Advanced tutorials: Zone Management, SOS System, Import & Export, Scheduling Settings, Notifications & Chat, Admin Features",
      "Added 'Replay Onboarding' button in Tutorial section",
    ],
  },
  {
    version: "v0.8",
    date: "Jun 2026",
    title: "Notifications & Team Chat",
    highlights: [
      "Real-time notification system with bell icon",
      "Team chat with @mentions support",
      "Admin message moderation",
    ],
    changes: [
      "Added notification bell with unread badge",
      "System notifications (amber) and normal notifications",
      "Chat panel with @mention autocomplete",
      "Admins can delete inappropriate messages",
      "Notification read/unread tracking",
    ],
  },
  {
    version: "v0.7",
    date: "Jun 2026",
    title: "Zone Customization & User Zones",
    highlights: [
      "Custom zone creation for personalized area grouping",
      "Zone renaming per user account",
      "Area exclusion and restoration",
    ],
    changes: [
      "Users can create custom zones with custom areas",
      "Zone names can be renamed (per-user override)",
      "Areas can be excluded from zones and restored later",
      "Other States zones disabled by default with enable toggle",
      "Zone Map UI with collapsible regions",
    ],
  },
  {
    version: "v0.6",
    date: "Jun 2026",
    title: "Self-Registration & User Approval",
    highlights: [
      "Self-registration from login page",
      "Admin approval workflow for new accounts",
      "Improved user management",
    ],
    changes: [
      "New users can register with username, password, and display name",
      "Unapproved users cannot sign in until admin approves",
      "Users tab shows pending registrations with approve/reject actions",
      "Fixed isApproved default for existing users",
      "Added audit logging for user management actions",
    ],
  },
  {
    version: "v0.5",
    date: "Jun 2026",
    title: "Role-Based Access Control (RBAC)",
    highlights: [
      "Three user roles: ADMIN, HERO, SUPPORT",
      "Permission-based feature access",
      "Admin-only settings and user management",
    ],
    changes: [
      "ADMIN: Full access to all features, user management, audit logs",
      "HERO: Order management, scheduling, SOS, personal settings",
      "SUPPORT: Order viewing, SOS answering, chat, limited settings",
      "Role badges with color coding in user list",
      "Protected API endpoints with role checks",
    ],
  },
  {
    version: "v0.4",
    date: "Jun 2026",
    title: "SOS System & Audit Logging",
    highlights: [
      "SOS requests for order transfers between drivers",
      "Admin/Support can assign SOS to specific heroes",
      "Comprehensive audit trail",
    ],
    changes: [
      "HERO users can send SOS for orders they can't handle",
      "SOS tab shows all active requests",
      "Admin/Support can assign SOS to specific heroes instead of answering directly",
      "Audit log tracks all significant actions (order changes, user events, SOS)",
      "Filterable audit log in Settings",
    ],
  },
  {
    version: "v0.3",
    date: "Jan 2025",
    title: "Scheduling & Calendar",
    highlights: [
      "Auto-scheduling with daily capacity limits",
      "Visual calendar with color-coded load indicators",
      "Weekend and holiday restrictions",
    ],
    changes: [
      "Auto-schedule distributes pending orders across available days",
      "12-point daily capacity (S=1pt, M=2pt, L=3pt)",
      "Monthly calendar view with green/amber/red day indicators",
      "Office pickups excluded from weekends and public holidays",
      "OFF days block all scheduling",
      "Weekly load bar chart visualization",
      "Manual rescheduling with mini calendar picker",
    ],
  },
  {
    version: "v0.2",
    date: "Jan 2025",
    title: "Import & Export Integrations",
    highlights: [
      "Encore CSV import for bulk order creation",
      "Zeo Route Planner XLSX export",
      "Google Sheets sync (bidirectional)",
    ],
    changes: [
      "Import orders from Encore CSV exports",
      "Auto-detect city/area and assign zones during import",
      "Duplicate detection by Order ID",
      "Export scheduled/contacted orders as XLSX for Zeo Route Planner",
      "Google Sheets integration with push/pull sync",
      "CSV template download for Encore format",
    ],
  },
  {
    version: "v0.1",
    date: "Dec 2024",
    title: "Initial Release — Core Foundation",
    highlights: [
      "Order creation and management",
      "Zone-based area detection for Selangor & KL",
      "Status workflow: Pending → Scheduled → Contacted → Booked → Completed",
    ],
    changes: [
      "Create individual orders with customer details, address, size, and zone",
      "Auto zone detection based on city/area input",
      "14 built-in zones covering Selangor/KL and Other States",
      "Order status management with full lifecycle tracking",
      "WhatsApp integration for customer notifications",
      "Dashboard with status overview cards",
      "Points system: S=1pt, M=2pt, L=3pt",
      "Authentication with NextAuth.js (credentials provider)",
      "Dark theme with glass-card UI design",
    ],
  },
] as const;

// ============ DATA FETCHING HOOK ============
// ============ CACHED DATA HOOK (stale-while-revalidate) ============
// Renders instantly from localStorage cache, then revalidates in the background.
// Fixes the "blank until fetch" + "quit app to see data" problems: the UI always
// has the last-known data to paint immediately, and a fresh fetch swaps it in.
//
// Loading semantics:
//  - isLoading=true ONLY when there's no cached data yet (first-ever load).
//  - revalidating=true while a background refresh is in flight (data already shown).
const FETCH_CACHE_PREFIX = "sidekick_cache_";

function useFetchData<T>(url: string) {
  const cacheKey = url ? FETCH_CACHE_PREFIX + url : "";
  const [data, setData] = useState<T | null>(() => {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);
  // isLoading = true only on the very first load when we have no cached data.
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!cacheKey) return false;
    try { return !localStorage.getItem(cacheKey); } catch { return true; }
  });
  const [revalidating, setRevalidating] = useState(false);
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // Set loading flags BEFORE the fetch so they're not race-late.
    if (data == null) setIsLoading(true);
    setRevalidating(true);
    setError(null);
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        setData(d);
        setError(null);
        // Persist to cache so the next mount paints instantly.
        try { localStorage.setItem(cacheKey, JSON.stringify(d)); } catch { /* quota */ }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
        setRevalidating(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, version]);

  return { data, error, isLoading, revalidating, refetch };
}

// ============ EVENT TYPE DISPLAY ============
const EVENT_TYPE_LABELS: Record<string, string> = {
  ROADSHOW: "Roadshow",
  EWASTE_COLLECTION: "E-Waste Collection",
  OTHER: "Other",
};
function formatEventType(type: string | undefined | null): string {
  if (!type) return "Event";
  return EVENT_TYPE_LABELS[type] || type;
}

// ============ ZONE BADGE ============
function ZoneBadge({ zone, compact, userZones, isDisabled }: { zone: number; compact?: boolean; userZones?: UserZoneData[]; isDisabled?: boolean }) {
  const z = ZONES[zone];
  const userZone = userZones?.find(uz => uz.zoneId === zone);
  // For custom zones (zoneId >= 100) with no ZONES entry and no userZone, return null
  if (!z && !userZone) return null;

  // Determine display name: user override first, then ZONES fallback
  const name = userZone?.name || z?.name || `Zone ${zone}`;

  // Determine colors: built-in zones use ZONES colors, custom zones use getZoneColor
  const isCustomZone = zone >= CUSTOM_ZONE_START;
  const customColors = isCustomZone ? getZoneColor(zone - CUSTOM_ZONE_START) : null;
  const bgColor = customColors?.bgColor || z?.bgColor || "bg-slate-500/15";
  const color = customColors?.color || z?.color || "text-slate-700";
  const borderColor = customColors?.borderColor || z?.borderColor || "border-slate-500/30";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.75rem] font-medium ${bgColor} ${color} ${borderColor} ${isDisabled ? "opacity-50 line-through" : ""}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `oklch(0.7 0.14 ${zone * 40 + 100})` }} />
      {compact ? name : `Z${zone} ${name}`}
      {isDisabled && !compact && <span className="text-[0.625rem] opacity-70 ml-0.5">(off)</span>}
    </span>
  );
}

// ============ STATUS BADGE ============
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status];
  if (!s) return <Badge variant="outline">{status}</Badge>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.75rem] font-medium ${s.bgColor} ${s.color} ${s.borderColor}`}>
      {s.label}
    </span>
  );
}

// ============ MINI CALENDAR ============
function MiniCalendar({
  selectedDate,
  onSelectDate,
  holidays = [],
  offDays = [],
  isOffice = false,
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  holidays?: Holiday[];
  offDays?: OffDay[];
  isOffice?: boolean;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) return parseISO(selectedDate);
    return new Date();
  });

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const holidaySet = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);
  const offDaySet = useMemo(() => new Set(offDays.map(o => o.date)), [offDays]);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setViewMonth(addMonths(viewMonth, -1))} className="h-9 w-9 p-0 hover:bg-white/10">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground">{format(viewMonth, "MMMM yyyy")}</span>
        <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="h-9 w-9 p-0 hover:bg-white/10">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[0.625rem] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isTodayDate = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const isPast = dateStr < todayStr;
          const isOff = offDaySet.has(dateStr);
          const isHoliday = holidaySet.has(dateStr);
          const isWeekendDay = isWeekend(day);
          const isBlockedWeekend = isOffice && isWeekendDay;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => !isPast && !isOff && !isBlockedWeekend && onSelectDate(dateStr)}
              disabled={isPast || isOff || isBlockedWeekend}
              className={`relative rounded-md p-1 text-xs text-center transition-all min-h-[36px] flex flex-col items-center justify-center
                ${!isCurrentMonth ? "text-muted-foreground/20" : ""}
                ${isTodayDate && !isSelected ? "border border-primary/40 text-primary font-bold" : ""}
                ${isSelected ? "bg-primary text-primary-foreground font-bold rounded-md" : "hover:bg-white/10"}
                ${isPast ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
                ${isOff && isCurrentMonth ? "bg-red-500/10 text-red-400/60 cursor-not-allowed" : ""}
                ${isBlockedWeekend && isCurrentMonth ? "bg-red-500/10 text-red-400/60 cursor-not-allowed line-through" : ""}
              `}
            >
              <span>{format(day, "d")}</span>
              {((isOff || isBlockedWeekend) || isHoliday) && isCurrentMonth && !isSelected && (
                <span className="text-[0.625rem] leading-none mt-0.5">{(isOff || isBlockedWeekend) ? "OFF" : "🎉"}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 text-[0.625rem] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-primary" /> Selected</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/30" /> OFF</span>
        <span className="flex items-center gap-1">🎉 Holiday</span>
        {isOffice && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/30 line-through" /> Weekend</span>}
      </div>
    </div>
  );
}

// ============ ORDER CARD ============
function OrderCard({ order, compact, onRefresh, holidays, offDays, isAdminView, heroes, onReassign, userZones, disabledZones, selected, onToggleSelect, onShowTimeline }: { order: Order; compact?: boolean; onRefresh: () => void; holidays?: Holiday[]; offDays?: OffDay[]; isAdminView?: boolean; heroes?: HeroOption[]; onReassign?: (orderId: string, targetHeroId: string) => Promise<void>; userZones?: UserZoneData[]; disabledZones?: number[]; selected?: boolean; onToggleSelect?: () => void; onShowTimeline?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDateDialog, setShowDateDialog] = useState(false);
  const [showPointsDialog, setShowPointsDialog] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showSosDialog, setShowSosDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({ customerName: "", phone: "", address: "", city: "", notes: "", isOffice: false });
  const [waMessage, setWaMessage] = useState("");
  const [waSelectedTemplate, setWaSelectedTemplate] = useState<string>("");
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([]);
  const [waPhonePrefix, setWaPhonePrefix] = useState("60");
  const [newDate, setNewDate] = useState(order.scheduledDate || "");
  const [newPoints, setNewPoints] = useState(order.points.toString());
  const [newNotes, setNewNotes] = useState(order.notes || "");
  const [sosNote, setSosNote] = useState("");
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [reassignTargetId, setReassignTargetId] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);

  // Optimistic status: reflect the change in the badge instantly without waiting
  // for the PATCH round-trip + 300ms debounced refetch (which feels laggy on real
  // networks / production builds). Cleared once the refetched order.status catches up.
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  useEffect(() => { setOptimisticStatus(null); }, [order.status]);
  const displayStatus = optimisticStatus ?? order.status;

  const updateStatus = async (newStatus: string) => {
    setLoading(true);
    setOptimisticStatus(newStatus); // instant UI feedback
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) {
        setOptimisticStatus(null); // revert on failure
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed", description: (err as Record<string, string>).error || `Server error ${res.status}`, variant: "destructive" });
        return;
      }
      toast({ title: `${order.orderId} → ${newStatus}` });
      onRefresh();
    } catch { setOptimisticStatus(null); toast({ title: "Network error", description: "Could not reach server. Check your connection.", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const deleteOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to delete", description: (err as Record<string, string>).error || "Unknown error", variant: "destructive" });
        return;
      }
      toast({ title: `${order.orderId} deleted` });
      onRefresh();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setLoading(false); setShowDeleteConfirm(false); }
  };

  const changeDate = async () => {
    if (!newDate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledDate: newDate }) });
      if (!res.ok) throw new Error();
      toast({ title: `${order.orderId} rescheduled to ${format(parseISO(newDate), "dd MMM yyyy (EEE)")}` });
      onRefresh();
    } catch { toast({ title: "Failed to reschedule", variant: "destructive" }); }
    finally { setLoading(false); setShowDateDialog(false); }
  };

  const clearDate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledDate: null }) });
      if (!res.ok) throw new Error();
      toast({ title: `Date cleared for ${order.orderId}` });
      onRefresh();
    } catch { toast({ title: "Failed to clear date", variant: "destructive" }); }
    finally { setLoading(false); setShowDateDialog(false); }
  };

  const changePoints = async () => {
    const pts = parseInt(newPoints);
    if (isNaN(pts) || pts < 1 || pts > 20) {
      toast({ title: "Points must be between 1 and 20", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: pts }) });
      if (!res.ok) throw new Error();
      toast({ title: `${order.orderId} points changed to ${pts}` });
      onRefresh();
    } catch { toast({ title: "Failed to change points", variant: "destructive" }); }
    finally { setLoading(false); setShowPointsDialog(false); }
  };

  const changeNotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: newNotes }) });
      if (!res.ok) throw new Error();
      toast({ title: `${order.orderId} notes updated` });
      onRefresh();
    } catch { toast({ title: "Failed to update notes", variant: "destructive" }); }
    finally { setLoading(false); setShowNotesDialog(false); }
  };

  const submitSos = async () => {
    if (!sosNote.trim()) {
      toast({ title: "Please provide a reason for SOS", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, sosNote: sosNote.trim() }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast({ title: `SOS sent for ${order.orderId}`, description: "Other drivers will be notified" });
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "SOS failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setLoading(false); setShowSosDialog(false); setSosNote(""); }
  };

  const nextStatus: Record<string, string | null> = { PENDING: "SCHEDULED", SCHEDULED: "CONFIRMED", CONFIRMED: "BOOKED", BOOKED: "COMPLETED" };
  const ns = nextStatus[displayStatus];
  // UI-side transition map — any status can be changed to any other status.
  // This gives full flexibility: cancel from any state, restore from cancel to any state.
  const ALL_STATUSES = ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"];
  const VALID_TRANSITIONS_UI: Record<string, string[]> = {
    PENDING: ["SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"],
    SCHEDULED: ["PENDING", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"],
    CONFIRMED: ["PENDING", "SCHEDULED", "BOOKED", "COMPLETED", "CANCELED"],
    BOOKED: ["PENDING", "SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED"],
    COMPLETED: ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "CANCELED"],
    CANCELED: ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED"],
  };
  const z = ZONES[order.zone];
  const sizeConf = SIZE_CONFIG[order.size] || SIZE_CONFIG.S;
  const canDelete = displayStatus !== "COMPLETED" || isAdminView;
  const canChangeDate = ["PENDING", "SCHEDULED", "CONFIRMED"].includes(displayStatus);
  const canSos = ["PENDING", "SCHEDULED"].includes(displayStatus);
  const canReassign = isAdminView && heroes && heroes.length > 0 && displayStatus !== "COMPLETED" && onReassign;

  return (
    <div role="button" tabIndex={0} aria-label={`Order ${order.orderId} timeline`} className={`card-touch rounded-xl border p-2.5 sm:p-3 ${z?.bgColor || "bg-white/5"} ${z?.borderColor || "border-white/10"} backdrop-blur-sm transition-all active:scale-[0.995] ${selected ? "ring-2 ring-primary/50 border-primary/30" : ""}`} onClick={(e) => { const t = e.target as HTMLElement; if (t.closest("button,a,input,select,textarea,[role=\"button\"],[data-no-timeline]")) return; onShowTimeline?.(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onShowTimeline?.(); } }}>
      {onToggleSelect && (
        <div className="flex items-center gap-2 mb-2">
          <Checkbox checked={!!selected} onCheckedChange={onToggleSelect} className="h-4 w-4" />
          <span className="text-[0.625rem] text-muted-foreground">tSelect</span>
        </div>
      )}
      {isAdminView && order.user && (
        <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-white/5">
          <UserIcon className="h-3 w-3 text-muted-foreground" />
          <span className="text-[0.625rem] font-medium text-muted-foreground">{order.user.displayName || order.user.username}</span>
          {order.user.role === "ADMIN" && <span className="text-[0.625rem] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1">ADMIN</span>}
          {order.user.role === "SUPPORT" && <span className="text-[0.625rem] bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded px-1">SUPPORT</span>}
          {order.user.role === "HERO" && <span className="text-[0.625rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1">HERO</span>}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-foreground">{order.orderId}</span>
            {order.isEvent && (
              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.625rem] h-4 px-1">📌 EVENT</Badge>
            )}
            {order.isEvent && order.eventType && (
              <Badge variant="outline" className="text-[0.625rem] h-4 border-amber-500/30 text-amber-400 px-1">{formatEventType(order.eventType)}</Badge>
              )}
            <ZoneBadge zone={order.zone} compact userZones={userZones} isDisabled={disabledZones?.includes(order.zone)} />{!order.latitude && (<span className="text-[0.625rem] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 ml-1" title="No GPS coordinates">⚠</span>)}
            <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
              <DialogTrigger asChild>
                <span data-no-timeline role="button" tabIndex={0} className="cursor-pointer hover:opacity-80 transition-opacity" onClick={(e) => e.stopPropagation()}><StatusBadge status={displayStatus} /></span>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Change Status</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <p className="text-sm text-muted-foreground">Set status for <span className="font-semibold text-foreground">{order.orderId}</span></p>
                  <div className="grid grid-cols-1 gap-2">
                    {(["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"] as const).map(s => {
                      const conf = STATUS_CONFIG[s];
                      return (
                        <Button
                          key={s}
                          type="button"
                          variant={displayStatus === s ? "default" : "outline"}
                          className={`h-11 justify-start gap-2 text-sm font-medium ${displayStatus === s ? "bg-primary text-primary-foreground" : `${conf?.bgColor || "bg-white/5"} ${conf?.color || "text-foreground"} ${conf?.borderColor || "border-white/10"} border hover:bg-white/10`}`}
                          onClick={() => { updateStatus(s); setShowStatusDialog(false); }}
                          disabled={loading || (s !== "CANCELED" && VALID_TRANSITIONS_UI[displayStatus]?.includes(s) === false && displayStatus !== s)}
                        >
                          {s === "PENDING" && <Clock className="h-4 w-4" />}
                          {s === "SCHEDULED" && <Calendar className="h-4 w-4" />}
                          {s === "CONFIRMED" && <CheckCircle2 className="h-4 w-4" />}
                          {s === "BOOKED" && <Building2 className="h-4 w-4" />}
                          {s === "COMPLETED" && <CheckCircle className="h-4 w-4" />}
                          {s === "CANCELED" && <XCircle className="h-4 w-4" />}
                          {conf?.label || s}
                          {displayStatus === s && <span className="ml-auto text-xs opacity-70">Current</span>}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showPointsDialog} onOpenChange={(open) => { setShowPointsDialog(open); if (open) setNewPoints(order.points.toString()); }}>
              <DialogTrigger asChild>
                <span data-no-timeline role="button" tabIndex={0} className={`text-[0.75rem] font-semibold ${sizeConf.color} cursor-pointer hover:underline underline-offset-2 decoration-dotted inline-flex items-center gap-0.5`} title="Click to change points" onClick={(e) => e.stopPropagation()}>
                  {order.size}({order.points}pt)<Pencil className="h-2.5 w-2.5 opacity-50" />
                </span>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Change Points</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">Set custom points for <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Size: <span className={`font-semibold ${sizeConf.color}`}>{order.size}</span></span>
                    <span>·</span>
                    <span>Default: <span className="font-semibold">{SIZE_CONFIG[order.size]?.points ?? 1}pt</span></span>
                    <span>·</span>
                    <span>Current: <span className="font-semibold text-foreground">{order.points}pt</span></span>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">New points value (1–{MAX_DAILY_POINTS})</Label>
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: MAX_DAILY_POINTS }, (_, i) => i + 1).map(p => (
                        <Button
                          key={p}
                          type="button"
                          variant={newPoints === p.toString() ? "default" : "outline"}
                          size="sm"
                          className={`h-9 ${newPoints === p.toString() ? "bg-primary text-primary-foreground" : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"}`}
                          onClick={() => setNewPoints(p.toString())}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={changePoints} disabled={loading || newPoints === order.points.toString()} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Zap className="h-4 w-4" />{loading ? "Saving..." : "Update Points"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {order.isOffice && (
              <span className="inline-flex items-center gap-0.5 rounded-md border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 text-[0.75rem] font-medium text-orange-400">
                <Building2 className="h-3 w-3" />Office
              </span>
            )}
          </div>
          {!compact && (
            <>
              <p className="text-base sm:text-sm mt-1 font-medium text-foreground/90">{order.customerName}</p>
              <p className="text-sm sm:text-xs text-muted-foreground flex items-center gap-1">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address + ', ' + order.city + ', Malaysia')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors" title="Open in Google Maps">
                  <MapPin className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  {order.address}, {order.city}
                </a>
              </p>
              <p className="text-sm sm:text-xs text-muted-foreground flex items-center gap-1">
                <a href={`https://wa.me/60${order.phone?.replace(/[^0-9]/g, '').replace(/^0/, '')}?text=Hi ${encodeURIComponent(order.customerName)}, regarding your e-waste pickup (${order.orderId})`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors" title="Chat on WhatsApp">
                  <Phone className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  {order.phone}
                </a>
              </p>
              {order.scheduledDate && (
                <p className="text-sm sm:text-xs text-emerald-400 flex items-center gap-1 mt-1">
                  <Calendar className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  {format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)")}
                </p>
              )}
              {order.addressVerified ? (
                <span className="text-xs sm:text-[0.625rem] text-emerald-400 flex items-center gap-0.5 mt-0.5"><ShieldCheck className="h-3.5 w-3.5 sm:h-3 sm:w-3" />Verified</span>
              ) : (
                <button onClick={async (e) => { e.stopPropagation(); setVerifying(true); try { const r = await fetch("/api/orders/verify-address", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({orderId: order.id}) }); if(!r.ok) throw new Error(); onRefresh(); } catch{ toast({title:"Verify failed", variant:"destructive"}); } finally { setVerifying(false); } }} className="text-xs sm:text-[0.625rem] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mt-0.5 hover:underline" disabled={verifying}>
                  <Shield className="h-3.5 w-3.5 sm:h-3 sm:w-3" />{verifying ? "Verifying..." : "Verify"}
                </button>
              )}
              {order.notes && (
                <div
                  className="text-sm sm:text-xs text-muted-foreground mt-1 italic cursor-pointer hover:text-foreground transition-colors flex items-center gap-1 group"
                  onClick={() => { setShowNotesDialog(true); setNewNotes(order.notes || ""); }}
                  title="Click to edit notes"
                >
                  <StickyNote className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" />
                  <span className="line-clamp-2">{order.notes}</span>
                  <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50 shrink-0" />
                </div>
              )}
            </>
          )}
          {compact && <p className="text-xs text-muted-foreground mt-0.5">{order.customerName} · {order.city}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(displayStatus === "SCHEDULED" || displayStatus === "CONFIRMED" || displayStatus === "BOOKED" || displayStatus === "COMPLETED") && (
            <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15" onClick={() => {
              // Load templates and open dialog
              fetch("/api/settings").then(r => r.json()).then(s => {
                const templates: WhatsAppTemplate[] = s.whatsappTemplates ? JSON.parse(s.whatsappTemplates) : DEFAULT_WHATSAPP_TEMPLATES;
                const prefix = s.whatsappPhonePrefix || "60";
                setWaTemplates(templates);
                setWaPhonePrefix(prefix);
                const defaultTmpl = templates.find(t => t.isDefault) || templates[0];
                setWaSelectedTemplate(defaultTmpl.id);
                setWaMessage(fillTemplate(defaultTmpl.message, order));
                setShowWhatsAppDialog(true);
              }).catch(() => {
                setWaTemplates(DEFAULT_WHATSAPP_TEMPLATES);
                setWaPhonePrefix("60");
                setWaSelectedTemplate(DEFAULT_WHATSAPP_TEMPLATES[0].id);
                setWaMessage(fillTemplate(DEFAULT_WHATSAPP_TEMPLATES[0].message, order));
                setShowWhatsAppDialog(true);
              });
            }} title="WhatsApp">
              <MessageCircle className="h-5 w-5" />
            </Button>
          )}
          {canChangeDate && (
            <Dialog open={showDateDialog} onOpenChange={(open) => { setShowDateDialog(open); if (open) setNewDate(order.scheduledDate || ""); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/15" title="Change date">
                  <CalendarDays className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Reschedule Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">Change date for <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}</p>
                  {order.scheduledDate && (
                    <p className="text-xs text-muted-foreground">Current: {format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)")}</p>
                  )}
                  <MiniCalendar
                    selectedDate={newDate}
                    onSelectDate={setNewDate}
                    holidays={holidays}
                    offDays={offDays}
                    isOffice={order.isOffice}
                  />
                  {newDate && newDate !== order.scheduledDate && (
                    <p className="text-xs text-primary font-medium text-center">→ {format(parseISO(newDate), "dd MMM yyyy (EEE)")}</p>
                  )}
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" className="border-white/10 bg-white/5" onClick={clearDate} disabled={loading || !order.scheduledDate}>
                    <X className="h-4 w-4" />{loading ? "Saving..." : "Clear Date"}
                  </Button>
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={changeDate} disabled={loading || !newDate} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <CalendarDays className="h-4 w-4" />{loading ? "Saving..." : "Reschedule"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {!compact && (
            <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-sky-400 hover:text-sky-300 hover:bg-sky-500/15" title="Edit notes">
                  <StickyNote className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Edit Notes</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">Notes for <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}</p>
                  <Textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder="Add notes, special instructions, Encore import notes..."
                    className="h-28 text-sm bg-white/5 border-white/10"
                  />
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={changeNotes} disabled={loading} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <StickyNote className="h-4 w-4" />{loading ? "Saving..." : "Save Notes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canSos && (
            <Dialog open={showSosDialog} onOpenChange={setShowSosDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/15" title="SOS — Request help from other drivers">
                  <Siren className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-foreground flex items-center gap-2"><Siren className="h-5 w-5 text-red-400" />SOS Request</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">Send an SOS for <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}. Other drivers will see this and can take the order.</p>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Why do you need help? *</Label>
                    <Textarea
                      value={sosNote}
                      onChange={e => setSosNote(e.target.value)}
                      placeholder="E.g. Too far from my area, schedule conflict, vehicle issue..."
                      className="h-24 text-sm bg-white/5 border-white/10"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={submitSos} disabled={loading || !sosNote.trim()} className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                    <Siren className="h-4 w-4" />{loading ? "Sending..." : "Send SOS"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {!compact && (
            <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (open) setEditForm({ customerName: order.customerName, phone: order.phone, address: order.address, city: order.city, notes: order.notes || "", isOffice: !!order.isOffice }); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-sky-400 hover:text-sky-300 hover:bg-sky-500/15" title="Edit order">
                  <Pencil className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Edit Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">Editing <span className="font-semibold text-foreground">{order.orderId}</span></p>
                  {order.addressVerified && <p className="text-xs text-amber-400">Changing the address below will trigger re-verification.</p>}
                  <div>
                    <Label className="text-xs text-muted-foreground">Order ID</Label>
                    <Input value={order.orderId} disabled className="h-11 bg-white/5 border-white/10 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Customer Name</Label>
                    <Input value={editForm.customerName} onChange={e => setEditForm(f => ({ ...f, customerName: e.target.value }))} className="h-12 sm:h-11 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="h-11 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="h-11 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">City</Label>
                    <Input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className="h-11 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="bg-white/5 border-white/10" rows={3} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                    <div>
                      <Label className="text-sm flex items-center gap-1.5"><Building2 className="h-4 w-4 text-amber-400" />Office Location</Label>
                      <p className="text-[0.625rem] text-muted-foreground">Tag this pickup as an office (no weekend/holiday scheduling)</p>
                    </div>
                    <Switch checked={editForm.isOffice} onCheckedChange={(v) => setEditForm(f => ({ ...f, isOffice: v }))} />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={async () => {
                    setLoading(true);
                    try {
                      const body: Record<string, unknown> = {};
                      if (editForm.customerName !== order.customerName) body.customerName = editForm.customerName;
                      if (editForm.phone !== order.phone) body.phone = editForm.phone;
                      if (editForm.address !== order.address) body.address = editForm.address;
                      if (editForm.city !== order.city) body.city = editForm.city;
                      if (editForm.notes !== (order.notes || "")) body.notes = editForm.notes;
                      if (editForm.isOffice !== !!order.isOffice) body.isOffice = editForm.isOffice;
                      if (Object.keys(body).length === 0) { toast({ title: "No changes made" }); setShowEditDialog(false); return; }
                      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                      if (!res.ok) throw new Error();
                      toast({ title: "Order updated" });
                      setShowEditDialog(false);
                      // If address or city changed, trigger re-verification
                      if (body.address || body.city) {
                        try {
                          const vr = await fetch("/api/orders/verify-address", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id }) });
                          if (vr.ok) toast({ title: "Address re-verified" });
                        } catch { /* silent */ }
                      }
                      onRefresh();
                    } catch { toast({ title: "Failed to update order", variant: "destructive" }); }
                    finally { setLoading(false); }
                  }} disabled={loading} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Save className="h-4 w-4" />{loading ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {onShowTimeline && (
            <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/15" onClick={(e) => { e.stopPropagation(); onShowTimeline(); }} title="Audit trail">
              <History className="h-5 w-5" />
            </Button>
          )}
          {canDelete && (
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-destructive hover:bg-destructive/15" title="Delete">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Delete Order</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground py-2">
                  Are you sure you want to delete <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}? This cannot be undone.
                </p>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={deleteOrder} disabled={loading} variant="destructive" className="gap-2">
                    <Trash2 className="h-4 w-4" />{loading ? "Deleting..." : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canReassign && (
            <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-primary hover:text-primary hover:bg-primary/10" title="Reassign to another hero">
                  <ArrowRightLeft className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" />Reassign Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    Reassign <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}
                    {order.user && <span className="text-xs"> (from <span className="text-amber-400 font-medium">{order.user.displayName || order.user.username}</span>)</span>}
                  </p>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Assign to Hero</Label>
                    <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
                      <SelectTrigger className="bg-white/5 border-white/10 h-10">
                        <SelectValue placeholder="Select a hero..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-white/10">
                        {heroes!.filter(h => h.id !== order.user?.id).map(h => (
                          <SelectItem key={h.id} value={h.id}>{h.displayName || h.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button
                    onClick={async () => {
                      if (!reassignTargetId || !onReassign) return;
                      setReassignLoading(true);
                      try {
                        await onReassign(order.id, reassignTargetId);
                        setShowReassignDialog(false);
                        setReassignTargetId("");
                      } finally {
                        setReassignLoading(false);
                      }
                    }}
                    disabled={reassignLoading || !reassignTargetId}
                    className="gap-2 bg-primary hover:bg-primary/90 text-white"
                  >
                    <ArrowRightLeft className="h-4 w-4" />{reassignLoading ? "Reassigning..." : "Reassign"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* WhatsApp Message Editor Dialog */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent className="bg-card border-white/10 sm:max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-400" />
              WhatsApp — {order.customerName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Template Selector */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Message Template</Label>
              <Select value={waSelectedTemplate} onValueChange={(val) => {
                setWaSelectedTemplate(val);
                const tmpl = waTemplates.find(t => t.id === val);
                if (tmpl) setWaMessage(fillTemplate(tmpl.message, order));
              }}>
                <SelectTrigger className="bg-white/5 border-white/10 h-10">
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {waTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        {t.name}
                        {t.isDefault && <span className="text-[0.625rem] text-primary">(default)</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Message Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs text-muted-foreground">Message</Label>
                <span className="text-[0.625rem] text-muted-foreground">{waMessage.length} chars</span>
              </div>
              <Textarea
                value={waMessage}
                onChange={e => setWaMessage(e.target.value)}
                className="min-h-[120px] text-sm bg-white/5 border-white/10 resize-y"
                placeholder="Type your message..."
              />
              <p className="text-[0.625rem] text-muted-foreground mt-1">Edit the message above before sending. Template variables have been filled in.</p>
            </div>

            {/* Quick Variable Insert */}
            <details className="text-[0.625rem] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors text-xs">Insert Variable</summary>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {WHATSAPP_VARIABLES.map(v => (
                  <button
                    key={v.key}
                    className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-[0.625rem] transition-colors"
                    onClick={() => {
                      const filled = v.key === "{date}"
                        ? (order.scheduledDate ? format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)") : "TBD")
                        : v.key === "{customerName}" ? order.customerName
                        : v.key === "{address}" ? order.address
                        : v.key === "{phone}" ? order.phone
                        : v.key === "{orderId}" ? order.orderId
                        : v.key === "{size}" ? order.size
                        : v.key === "{points}" ? order.points.toString()
                        : v.key === "{city}" ? order.city
                        : v.key === "{notes}" ? (order.notes || "N/A")
                        : "";
                      setWaMessage(prev => prev + filled);
                    }}
                    title={`${v.label} (e.g. ${v.example})`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </details>

            {/* Order Info Summary */}
            <div className="rounded-lg bg-white/5 border border-white/5 p-3 space-y-1">
              <p className="text-[0.625rem] text-muted-foreground font-semibold uppercase tracking-wider">Order Details</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Order:</span><span className="text-foreground font-medium">{order.orderId}</span>
                <span className="text-muted-foreground">Customer:</span><span className="text-foreground">{order.customerName}</span>
                <span className="text-muted-foreground">Phone:</span><span className="text-foreground">{order.phone}</span>
                <span className="text-muted-foreground">Date:</span><span className="text-foreground">{order.scheduledDate ? format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)") : "TBD"}</span>
                <span className="text-muted-foreground">Size:</span><span className="text-foreground">{order.size} ({order.points}pt)</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                const phone = formatPhoneForWhatsApp(order.phone, waPhonePrefix);
                const url = `https://wa.me/${phone}?text=${encodeURIComponent(waMessage)}`;
                window.open(url, "_blank");
                setShowWhatsAppDialog(false);
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="h-4 w-4" />Open WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ ZONE WEEK GRID (fixed 7-day view) ============
// Always shows all 7 days (Mon–Sun) of the selected week in a compact vertical list,
// so the whole week is visible at a glance. Days with no orders show "—".
function ZoneWeekGrid({ selSchedule, selWeekStart, offDays }: {
  selSchedule: Record<string, { orders: Order[]; totalPoints: number }> | null | undefined;
  selWeekStart?: string;
  offDays?: OffDay[];
}) {
  const startD = selWeekStart ? new Date(selWeekStart) : startOfWeek(new Date(), { weekStartsOn: 1 });
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(startD, i);
    const dateStr = format(d, "yyyy-MM-dd");
    const dayData = selSchedule?.[dateStr];
    const isOff = offDays?.some(od => od.date === dateStr);
    const isToday = todayStr === dateStr;
    const citySet = new Set<string>();
    if (dayData?.orders) for (const o of dayData.orders) if (o.city) citySet.add(o.city);
    return { dateStr, dayData, isOff, isToday, dayName: format(d, "EEE"), dayNum: format(d, "d"), cities: [...citySet].sort(), count: dayData?.orders.length || 0, total: dayData?.totalPoints || 0 };
  });
  const weekTotal = days.reduce((s, d) => s + d.total, 0);
  const weekOrders = days.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-1">
      {days.map(({ dateStr, dayData, isOff, isToday, dayName, dayNum, cities, count, total }) => (
        <div key={dateStr} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${isToday ? "border-primary/40 bg-primary/10" : "border-white/5"} ${isOff ? "bg-red-500/10" : ""}`}>
          {/* Date column */}
          <div className="w-12 shrink-0 text-center">
            <p className="text-[0.625rem] text-muted-foreground leading-none">{dayName}</p>
            <p className={`text-sm font-bold leading-tight ${isOff ? "text-red-400" : isToday ? "text-primary" : "text-foreground"}`}>{dayNum}</p>
          </div>
          {/* Cities column */}
          <div className="flex-1 min-w-0">
            {isOff ? (
              <span className="text-[0.75rem] text-red-400/80 italic">OFF day</span>
            ) : cities.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {cities.map((city) => (
                  <span key={city} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-white/10 text-muted-foreground">{city}</span>
                ))}
              </div>
            ) : (
              <span className="text-[0.75rem] text-muted-foreground/50 italic">No pickups</span>
            )}
          </div>
          {/* Stats column */}
          <div className="shrink-0 text-right">
            {count > 0 ? (
              <>
                <p className="text-[0.75rem] font-semibold text-foreground leading-none">{count} <span className="text-muted-foreground font-normal">ord</span></p>
                <p className="text-[0.625rem] text-muted-foreground leading-tight">{total}pt</p>
              </>
            ) : (
              <p className="text-[0.75rem] text-muted-foreground/40">—</p>
            )}
          </div>
        </div>
      ))}
      {/* Week summary footer */}
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10 text-[0.625rem] text-muted-foreground">
        <span>Week total</span>
        <span className="font-semibold text-foreground">{weekOrders} orders · {weekTotal}pt</span>
      </div>
    </div>
  );
}

// ============ SWIPEABLE WEEKLY WORKLOAD (controlled carousel) ============
// Controlled by the parent's weekOffset — no internal fetching. The current week's
// data comes from the parent (already fetched). Swipe/chevron/dots call onWeekChange.
// Transform is pixel-based (measured viewport width) so slides are always on-screen.
function SwipeableWeeklyWorkload({ weekOffset, onWeekChange, schedule, weekStart, offDays }: {
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  schedule: Record<string, { orders: Order[]; totalPoints: number }> | null | undefined;
  weekStart?: string;
  offDays?: OffDay[];
}) {
  const MIN_OFFSET = -4;
  const MAX_OFFSET = 12;
  const SLIDE_COUNT = MAX_OFFSET - MIN_OFFSET + 1;
  const [dragX, setDragX] = useState(0);
  const [viewportW, setViewportW] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  const weekStartForOffset = (offset: number): string => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(addDays(monday, offset * 7), "yyyy-MM-dd");
  };

  // Measure the viewport width for pixel-based transforms.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewportW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goTo = useCallback((offset: number) => {
    const clamped = Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, offset));
    onWeekChange(clamped);
  }, [onWeekChange]);

  const go = useCallback((dir: number) => goTo(weekOffset + dir), [weekOffset, goTo]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    draggingRef.current = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!draggingRef.current || touchStartXRef.current == null) return;
    setDragX(e.touches[0].clientX - touchStartXRef.current);
  };
  const onTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const threshold = viewportW ? viewportW * 0.2 : 80;
    if (dragX <= -threshold) go(1);
    else if (dragX >= threshold) go(-1);
    setDragX(0);
    touchStartXRef.current = null;
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const activeIndex = weekOffset - MIN_OFFSET;
  const translatePx = viewportW > 0 ? -activeIndex * viewportW + dragX : 0;
  const activeWeekStart = weekStart || weekStartForOffset(weekOffset);
  const activeWeekEnd = format(addDays(new Date(activeWeekStart), 6), "yyyy-MM-dd");

  return (
    <div className="rounded-xl border border-white/10 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2"><CalendarDays className="h-5 w-5 text-amber-400" />Weekly Workload</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => go(-1)} disabled={weekOffset <= MIN_OFFSET} className="p-1 rounded hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="h-4 w-4 text-muted-foreground" /></button>
          <button onClick={() => go(1)} disabled={weekOffset >= MAX_OFFSET} className="p-1 rounded hover:bg-white/10 disabled:opacity-30"><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.625rem] text-muted-foreground truncate">
          {activeWeekStart} → {activeWeekEnd}
          <span className="ml-1">{weekOffset === 0 ? "(Now)" : weekOffset < 0 ? `(${Math.abs(weekOffset)}w ago)` : `(+${weekOffset}w)`}</span>
        </span>
        {weekOffset !== 0 && <button onClick={() => goTo(0)} className="text-[0.625rem] text-primary hover:underline shrink-0 ml-2">Today</button>}
      </div>
      {/* Carousel viewport — pixel-based transform */}
      <div
        ref={viewportRef}
        className="overflow-hidden touch-pan-y select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="flex"
          style={{
            width: `${SLIDE_COUNT * 100}%`,
            transform: `translateX(${translatePx}px)`,
            transition: draggingRef.current ? "none" : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {Array.from({ length: SLIDE_COUNT }, (_, i) => {
            const offset = MIN_OFFSET + i;
            // Only the active week has data (from the parent's fetch). Other slides
            // render the date grid without data — the parent fetches when you land on them.
            const isActive = offset === weekOffset;
            const ws = isActive && weekStart ? weekStart : weekStartForOffset(offset);
            const startD = new Date(ws);
            const days = Array.from({ length: 7 }, (_, di) => {
              const d = addDays(startD, di);
              const dateStr = format(d, "yyyy-MM-dd");
              const dayData = isActive ? schedule?.[dateStr] : undefined;
              const isOff = offDays?.some(od => od.date === dateStr);
              const isToday = todayStr === dateStr;
              return { dateStr, dayData, isOff, isToday, dayName: format(d, "EEE"), dayNum: format(d, "d") };
            });
            const totalPts = days.reduce((s, x) => s + (x.dayData?.totalPoints || 0), 0);
            return (
              <div key={offset} className="shrink-0" style={{ width: `${100 / SLIDE_COUNT}%` }}>
                <div className="px-0.5">
                  <div className="grid grid-cols-7 gap-1">
                    {days.map(({ dateStr, dayData, isOff, isToday, dayName, dayNum }) => (
                      <div key={dateStr} className={`rounded-lg p-2 text-center border ${isToday ? "border-primary/40 bg-primary/10" : "border-white/5"} ${isOff ? "bg-red-500/10" : ""}`}>
                        <p className="text-[0.625rem] text-muted-foreground">{dayName}</p>
                        <p className={`text-sm font-bold ${isOff ? "text-red-400" : isToday ? "text-primary" : "text-foreground"}`}>{dayNum}</p>
                        <p className="text-[0.625rem] text-muted-foreground">{dayData ? `${dayData.totalPoints}pt` : isOff ? "OFF" : "—"}</p>
                        <p className="text-[0.625rem] text-muted-foreground">{dayData ? `${dayData.orders.length} ord` : ""}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-[0.625rem] text-muted-foreground">{isActive ? `${totalPts}pt total` : "Swipe to load"}</span>
                    <span className="text-[0.625rem] text-muted-foreground">{offset === 0 ? "Current" : offset < 0 ? `${Math.abs(offset)}w ago` : `+${offset}w`}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
        {Array.from({ length: SLIDE_COUNT }, (_, i) => {
          const offset = MIN_OFFSET + i;
          if (Math.abs(offset - weekOffset) > 3 && offset !== 0) return null;
          return (
            <button
              key={offset}
              onClick={() => goTo(offset)}
              className={`h-1.5 rounded-full transition-all ${offset === weekOffset ? "w-4 bg-primary" : "w-1.5 bg-white/20 hover:bg-white/40"}`}
              aria-label={`Week ${offset}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============ DASHBOARD TAB ============
// ============ TIME RANGE SELECTOR ============
function TimeRangeSelector({ range, setRange }: { range: string; setRange: (r: string) => void }) {
  const options = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "year", label: "Year" },
    { value: "all", label: "All Time" },
  ];
  return (
    <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 border border-white/10">
      {options.map(o => (
        <button key={o.value} onClick={() => setRange(o.value)}
          className={`px-2.5 py-1 rounded-md text-[0.625rem] font-medium transition-all ${
            range === o.value ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
          }`}
        >{o.label}</button>
      ))}
    </div>
  );
}

// ============ MINI BAR CHART ============
function MiniBarChart({ data, maxBars = 14 }: { data: Array<{ date: string; created: number; completed: number }>; maxBars?: number }) {
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">No data</p>;
  const maxVal = Math.max(...data.map(d => Math.max(d.created, d.completed)), 1);
  return (
    <div className="flex items-end gap-[2px] h-20">
      {data.slice(-maxBars).map((d, i) => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-[1px] min-w-[8px]">
          <div className="w-full flex flex-col items-center gap-[1px]" style={{ height: "64px" }}>
            <div className="flex-1 flex flex-col justify-end w-full gap-[1px]">
              <div className="w-full bg-cyan-400/60 rounded-t-sm" style={{ height: `${(d.created / maxVal) * 56}px`, minHeight: d.created > 0 ? "2px" : "0" }} title={`${d.date}: ${d.created} created`} />
              <div className="w-full bg-emerald-400/60 rounded-t-sm" style={{ height: `${(d.completed / maxVal) * 56}px`, minHeight: d.completed > 0 ? "2px" : "0" }} title={`${d.date}: ${d.completed} completed`} />
            </div>
          </div>
          <span className="text-[0.625rem] text-muted-foreground truncate w-full text-center">{d.date.slice(-5)}</span>
        </div>
      ))}
    </div>
  );
}

// ============ HERO DASHBOARD ============
function HeroDashboard({ stats, onRefresh, userZones, onFilterOrders }: { stats: Stats | null; onRefresh: () => void; userZones?: UserZoneData[]; onFilterOrders?: (status: string) => void }) {
  const { data: session } = useSession();
  const [timeRange, setTimeRange] = useState("week");
  const [weekOffset, setWeekOffset] = useState(0);

  const [rangeStats, setRangeStats] = useState<Stats | null>(null);

  // Fetch range-specific stats (weekOffset cycles the Zone Coverage week)
  useEffect(() => {
    fetch(`/api/stats?range=${timeRange}&weekOffset=${weekOffset}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setRangeStats(d); }).catch(() => {});
  }, [timeRange, weekOffset]);

  const effectiveStats = rangeStats || stats;

  if (!effectiveStats) return <div className="text-center py-12 text-muted-foreground">Loading dashboard...</div>;

  const statusItems = [
    { label: "Pending", code: "PENDING", count: effectiveStats.pendingCount, color: "text-yellow-400", bg: "bg-yellow-500/15", icon: Clock },
    { label: "Scheduled", code: "SCHEDULED", count: effectiveStats.scheduledCount, color: "text-cyan-400", bg: "bg-cyan-500/15", icon: Calendar },
    { label: "Contacted", code: "CONFIRMED", count: effectiveStats.confirmedCount, color: "text-emerald-400", bg: "bg-emerald-500/15", icon: CheckCircle2 },
    { label: "Booked", code: "BOOKED", count: effectiveStats.bookedCount, color: "text-amber-400", bg: "bg-amber-500/15", icon: Building2 },
    { label: "Completed", code: "COMPLETED", count: effectiveStats.completedCount, color: "text-emerald-100", bg: "bg-slate-500/15", icon: CheckCircle2 },
  ];

  const selSchedule = effectiveStats.selWeekScheduleByDate || effectiveStats.scheduleByDate;

  return (
    <div className="space-y-4">
      {/* Header with time range */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Truck className="h-5 w-5 text-primary" />My Dashboard</h2>
        <TimeRangeSelector range={timeRange} setRange={setTimeRange} />
      </div>

      {/* Status Cards — tap a card to jump to Orders pre-filtered by that status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {statusItems.map(({ label, code, count, color, bg, icon: Icon }) => (
          <button key={label} type="button" onClick={() => onFilterOrders?.(code)} className={`text-left rounded-xl border border-white/10 ${bg} p-3 sm:p-4 bg-card earth-glow transition-transform active:scale-95 hover:border-primary/40 hover:shadow-[0_0_16px_rgba(52,211,153,0.18)]`}>
            <div className="flex items-center gap-2">
              <Icon className={`h-6 w-6 ${color}`} />
              <div><p className={`text-2xl font-bold ${color}`}>{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>
            </div>
          </button>
        ))}
      </div>

      {/* Range Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Created ({timeRange})</p>
          <p className="text-xl font-bold text-cyan-400">{effectiveStats.createdInRange ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Completed ({timeRange})</p>
          <p className="text-xl font-bold text-emerald-400">{effectiveStats.completedInRange ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Points Earned ({timeRange})</p>
          <p className="text-xl font-bold text-primary">{effectiveStats.pointsInRange ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Today</p>
          <p className="text-xl font-bold text-amber-400">{effectiveStats.todayPoints}/{MAX_DAILY_POINTS} pts</p>
        </div>
      </div>

      {/* Order Trends */}
      {effectiveStats.trends && effectiveStats.trends.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-2"><BarChart3 className="h-4 w-4 text-cyan-400" />Order Trends <span className="text-[0.625rem] text-muted-foreground">(cyan=created, green=completed)</span></h3>
          <MiniBarChart data={effectiveStats.trends} />
        </div>
      )}

      {/* Today's Pickups (full width — Route Planning widget removed; Zeo export lives in Schedule tab) */}
      <div className="rounded-xl border border-white/10 bg-card earth-glow p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><Truck className="h-5 w-5 text-primary" />Today&apos;s Pickups</h3>
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">{effectiveStats.todayPoints}/{MAX_DAILY_POINTS} pts</Badge>
        </div>
        <Progress value={(effectiveStats.todayPoints / MAX_DAILY_POINTS) * 100} className="h-2 mb-3" />
        {effectiveStats.todayOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No pickups today</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {effectiveStats.todayOrders.map(o => (
              <div key={o.id} className={o.isEvent ? "pl-2 bg-amber-500/5 rounded-l-md" : o.isErthbox ? "pl-2 bg-emerald-500/5 rounded-l-md" : ""}>
                <OrderCard order={o} compact onRefresh={onRefresh} holidays={effectiveStats.holidays} offDays={effectiveStats.offDays} userZones={userZones} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zone Coverage - 7-day week view (all 7 days always visible) */}
      <div className="nc-card nc-card--glow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><Layers className="h-5 w-5 text-primary" style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.5))" }} />Zone Coverage</h3>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-white/10"><ChevronLeft className="h-4 w-4 text-muted-foreground" /></button>
            <span className="text-[0.625rem] text-muted-foreground text-center min-w-[110px]">
              {effectiveStats.selWeekStart && effectiveStats.selWeekEnd ? `${effectiveStats.selWeekStart} → ${effectiveStats.selWeekEnd}` : "This Week"}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-white/10"><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        </div>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)} className="text-[0.625rem] text-primary hover:underline mb-2">← Back to current week</button>
        )}
        {/* 7-day grid: always shows the full selected week (Mon–Sun) */}
        <ZoneWeekGrid selSchedule={selSchedule} selWeekStart={effectiveStats.selWeekStart} offDays={effectiveStats.offDays} />
      </div>

      {/* Upcoming Holidays */}
      {effectiveStats.holidays.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-2"><AlertCircle className="h-5 w-5 text-amber-400" />Upcoming Public Holidays</h3>
          <div className="space-y-1.5">
            {effectiveStats.holidays.map(h => (
              <div key={h.id} className="flex justify-between items-center text-sm">
                <span className="font-medium">{h.name}</span>
                <span className="text-muted-foreground">{format(parseISO(h.date), "dd MMM yyyy (EEE)")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ ADMIN DASHBOARD ============
function AdminDashboard({ onRefresh, refreshKey, userZones }: { onRefresh: () => void; refreshKey: number; userZones?: UserZoneData[] }) {
  const [timeRange, setTimeRange] = useState("week");
  const [balance, setBalance] = useState<{ balance: number; total_balance: number; status: string } | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [adminData, setAdminData] = useState<{
    orders: { total: number; created: number; completed: number; deleted: number; imported: number; byStatus: Record<string, number>; bySize: Record<string, number>; byZone: Record<string, number>; trends: Array<{ date: string; created: number; completed: number }> };
    users: { total: number; active: number; heroes: number; support: number; admins: number; recentLogins: number; unapproved: number; list: Array<{ id: string; username: string; displayName: string | null; role: string; lastLoginAt: string | null; createdAt: string }>; pendingApprovals: Array<{ id: string; username: string; displayName: string | null; role: string; createdAt: string }> };
    ai: { totalMessages: number; actionsCreated: number; actionsApproved: number; actionsRejected: number; flagsPending: number; conversations: number; pendingFlags: Array<{ id: string; reason: string; severity: string; isResolved: boolean; messageContent: string; createdAt: string; user: { username: string; displayName: string | null } }> };
    audit: { byAction: Record<string, number>; byEntity: Record<string, number> };
    heroWorkload: Array<{ id: string; name: string; activeOrders: number; activePoints: number; pendingCount: number; scheduledCount: number }>;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/stats/admin?range=${timeRange}&_k=${refreshKey}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setAdminData(d); }).catch(() => {});
  }, [timeRange, refreshKey]);

  useEffect(() => {
    fetch("/api/ai/balance").then(r => r.ok ? r.json() : null).then(d => { if (d && "balance" in d) setBalance(d as { balance: number; total_balance: number; status: string }); else setBalanceError(true); }).catch(() => setBalanceError(true));
  }, []);

  if (!adminData) return <div className="text-center py-12 text-muted-foreground">Loading admin dashboard...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />Admin Dashboard</h2>
        <TimeRangeSelector range={timeRange} setRange={setTimeRange} />
      </div>

      {/* DeepSeek Balance */}
      {balance && (
        <div className="rounded-xl border border-primary/20 bg-card p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">DeepSeek Balance</span>
          </div>
          <span className={`text-sm font-bold ${balance.balance > 0 ? "text-emerald-400" : "text-red-400"}`}>
            ${balance.balance.toFixed(4)}
          </span>
        </div>
      )}

      {/* Order Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Total Orders</p>
          <p className="text-xl font-bold text-cyan-400">{adminData.orders.total}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Created ({timeRange})</p>
          <p className="text-xl font-bold text-emerald-400">{adminData.orders.created}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Completed ({timeRange})</p>
          <p className="text-xl font-bold text-primary">{adminData.orders.completed}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Deleted ({timeRange})</p>
          <p className="text-xl font-bold text-red-400">{adminData.orders.deleted}</p>
        </div>
      </div>

      {/* Order Trends */}
      {adminData.orders.trends.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-2"><BarChart3 className="h-4 w-4 text-cyan-400" />Order Trends</h3>
          <MiniBarChart data={adminData.orders.trends} />
        </div>
      )}

      {/* Order Status & Size Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs mb-2">Orders by Status</h3>
          <div className="space-y-1">
            {Object.entries(adminData.orders.byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
              const max = Math.max(...Object.values(adminData.orders.byStatus));
              return (
                <div key={status} className="flex items-center gap-2">
                  <span className="text-[0.625rem] text-muted-foreground w-20 shrink-0">{status}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-3"><div className="bg-primary/60 rounded-full h-3" style={{ width: `${(count / max) * 100}%` }} /></div>
                  <span className="text-[0.625rem] font-bold text-foreground w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs mb-2">Orders by Size</h3>
          <div className="space-y-1">
            {Object.entries(adminData.orders.bySize).sort((a, b) => b[1] - a[1]).map(([size, count]) => {
              const max = Math.max(...Object.values(adminData.orders.bySize));
              return (
                <div key={size} className="flex items-center gap-2">
                  <span className="text-[0.625rem] text-muted-foreground w-20 shrink-0">{size === "S" ? "Small (1pt)" : size === "M" ? "Medium (2pt)" : "Large (3pt)"}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-3"><div className="bg-emerald-500/60 rounded-full h-3" style={{ width: `${(count / max) * 100}%` }} /></div>
                  <span className="text-[0.625rem] font-bold text-foreground w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Activity */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><Users className="h-4 w-4 text-amber-400" />User Activity</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          <div className="text-center"><p className="text-lg font-bold text-foreground">{adminData.users.total}</p><p className="text-[0.625rem] text-muted-foreground">Total</p></div>
          <div className="text-center"><p className="text-lg font-bold text-emerald-400">{adminData.users.active}</p><p className="text-[0.625rem] text-muted-foreground">Active</p></div>
          <div className="text-center"><p className="text-lg font-bold text-cyan-400">{adminData.users.heroes}</p><p className="text-[0.625rem] text-muted-foreground">Heroes</p></div>
          <div className="text-center"><p className="text-lg font-bold text-primary">{adminData.users.support}</p><p className="text-[0.625rem] text-muted-foreground">Support</p></div>
          <div className="text-center"><p className="text-lg font-bold text-primary">{adminData.users.recentLogins}</p><p className="text-[0.625rem] text-muted-foreground">Recent Logins</p></div>
        </div>
        {adminData.users.unapproved > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-3">
            <p className="text-xs text-amber-400 font-medium">⚠️ {adminData.users.unapproved} unapproved user(s) pending</p>
          </div>
        )}
        <div className="max-h-48 overflow-y-auto space-y-1">
          {adminData.users.list.map(u => (
            <div key={u.id} className="flex items-center justify-between text-[0.625rem] py-1 border-b border-white/5 last:border-0">
              <span className="font-medium text-foreground">{u.displayName || u.username}</span>
              <span className="text-muted-foreground">{u.role}</span>
              <span className="text-muted-foreground">{u.lastLoginAt ? format(parseISO(u.lastLoginAt), "dd MMM HH:mm") : "Never"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hero Workload */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><Truck className="h-4 w-4 text-cyan-400" />Hero Workload</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {adminData.heroWorkload.sort((a, b) => b.activeOrders - a.activeOrders).map(h => {
            const maxPts = Math.max(...adminData.heroWorkload.map(x => x.activePoints), 1);
            return (
              <div key={h.id} className="flex items-center gap-3">
                <span className="text-xs font-medium w-24 shrink-0 truncate">{h.name}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white/5 rounded-full h-2"><div className="bg-cyan-500/60 rounded-full h-2" style={{ width: `${(h.activePoints / maxPts) * 100}%` }} /></div>
                    <span className="text-[0.625rem] text-muted-foreground w-16">{h.activePoints}pts</span>
                  </div>
                </div>
                <span className="text-[0.625rem] text-muted-foreground w-24">{h.activeOrders} orders</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Usage & Moderation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><Bot className="h-4 w-4 text-primary" />AI Usage</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center"><p className="text-lg font-bold text-primary">{adminData.ai.totalMessages}</p><p className="text-[0.625rem] text-muted-foreground">Messages</p></div>
            <div className="text-center"><p className="text-lg font-bold text-primary">{adminData.ai.conversations}</p><p className="text-[0.625rem] text-muted-foreground">Conversations</p></div>
            <div className="text-center"><p className="text-lg font-bold text-emerald-400">{adminData.ai.actionsApproved}</p><p className="text-[0.625rem] text-muted-foreground">Approved</p></div>
            <div className="text-center"><p className="text-lg font-bold text-red-400">{adminData.ai.actionsRejected}</p><p className="text-[0.625rem] text-muted-foreground">Rejected</p></div>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-amber-400" />Moderation {adminData.ai.flagsPending > 0 && <Badge variant="destructive" className="text-[0.625rem] ml-1">{adminData.ai.flagsPending}</Badge>}</h3>
          {adminData.ai.pendingFlags.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pending flags 🎉</p>
          ) : (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {adminData.ai.pendingFlags.map(f => (
                <div key={f.id} className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.625rem] font-medium text-foreground">{f.user.displayName || f.user.username}</span>
                    <Badge variant="outline" className={`text-[0.625rem] ${f.severity === "CRITICAL" ? "border-red-500/50 text-red-400" : f.severity === "HIGH" ? "border-amber-500/50 text-amber-400" : "border-white/20 text-muted-foreground"}`}>{f.severity}</Badge>
                  </div>
                  <p className="text-[0.625rem] text-muted-foreground mt-0.5">{f.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audit Summary */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><History className="h-4 w-4 text-emerald-100" />Audit Summary ({timeRange})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(adminData.audit.byAction).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
            <div key={action} className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-sm font-bold text-foreground">{count}</p>
              <p className="text-[0.625rem] text-muted-foreground">{action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ SUPPORT DASHBOARD ============
function SupportDashboard({ onRefresh, refreshKey, userZones }: { onRefresh: () => void; refreshKey: number; userZones?: UserZoneData[] }) {
  const [timeRange, setTimeRange] = useState("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [supportData, setSupportData] = useState<{
    heroOverview: Array<{ id: string; name: string; lastLogin: string | null; totalOrders: number; activeOrders: number; completedOrders: number; weekOrders: number; weekPoints: number; todayOrders: number; todayPoints: number; offDays: Array<{ id: string; date: string; reason: string | null }>; offDaysThisWeek: Array<{ id: string; date: string; reason: string | null }>; holidays: Array<{ id: string; date: string; name: string }>; pendingCount: number; scheduledCount: number }>;
    allActiveOrders: Array<{ id: string; orderId: string; customerName: string; status: string; city: string; zone: number; points: number; size: string; scheduledDate: string | null; userId: string; user: { id: string; username: string; displayName: string; role: string } }>;
    orders: { total: number; byStatus: Record<string, number>; trends: Array<{ date: string; created: number; completed: number }> };
    sos: { active: number; recent: number };
    heroOffDaysUpcoming: Array<{ id: string; date: string; reason: string | null; user: { id: string; username: string; displayName: string } }>;
    heroes: Array<{ id: string; name: string; username: string }>;
  } | null>(null);
  const [reassignLoading, setReassignLoading] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/stats/support?range=${timeRange}&weekOffset=${weekOffset}&_k=${refreshKey}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setSupportData(d); }).catch(() => {});
  }, [timeRange, weekOffset, refreshKey]);

  const handleReassign = async (orderId: string) => {
    const targetId = reassignTarget[orderId];
    if (!targetId) { toast({ title: "Select a hero first", variant: "destructive" }); return; }
    setReassignLoading(orderId);
    try {
      const res = await fetch("/api/orders/reassign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, targetHeroId: targetId, reason: "Support reassignment" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const result = await res.json();
      toast({ title: "Order reassigned", description: `#${orderId} → ${result.to}` });
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Reassignment failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setReassignLoading(null); }
  };

  if (!supportData) return <div className="text-center py-12 text-muted-foreground">Loading support dashboard...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />Support Dashboard</h2>
        <TimeRangeSelector range={timeRange} setRange={setTimeRange} />
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Total Orders ({timeRange})</p>
          <p className="text-xl font-bold text-cyan-400">{supportData.orders.total}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Active SOS</p>
          <p className="text-xl font-bold text-red-400">{supportData.sos.active}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Active Heroes</p>
          <p className="text-xl font-bold text-emerald-400">{supportData.heroes.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Active Orders</p>
          <p className="text-xl font-bold text-primary">{supportData.allActiveOrders.length}</p>
        </div>
      </div>

      {/* Order Trends */}
      {supportData.orders.trends.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-2"><BarChart3 className="h-4 w-4 text-cyan-400" />Order Trends</h3>
          <MiniBarChart data={supportData.orders.trends} />
        </div>
      )}

      {/* Hero Overview */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-xs flex items-center gap-2"><Users className="h-4 w-4 text-cyan-400" />Hero Overview</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-white/10"><ChevronLeft className="h-3 w-3 text-muted-foreground" /></button>
            <span className="text-[0.625rem] text-muted-foreground">Week {weekOffset === 0 ? "(Current)" : weekOffset < 0 ? `(${Math.abs(weekOffset)} ago)` : `(+${weekOffset})`}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-white/10"><ChevronRight className="h-3 w-3 text-muted-foreground" /></button>
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-[0.625rem] text-primary hover:underline">Now</button>}
          </div>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {supportData.heroOverview.sort((a, b) => b.activeOrders - a.activeOrders).map(h => (
            <div key={h.id} className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{h.name}</span>
                  {h.offDaysThisWeek.length > 0 && <Badge variant="outline" className="text-[0.625rem] border-red-500/30 text-red-400">OFF {h.offDaysThisWeek.map(d => d.date.slice(-5)).join(", ")}</Badge>}
                </div>
                <div className="flex items-center gap-3 text-[0.625rem] text-muted-foreground">
                  <span>Today: <span className="text-foreground font-medium">{h.todayPoints}pts</span></span>
                  <span>Week: <span className="text-foreground font-medium">{h.weekPoints}pts</span></span>
                  <span>Active: <span className="text-foreground font-medium">{h.activeOrders}</span></span>
                  <span>Pending: <span className="text-yellow-400 font-medium">{h.pendingCount}</span></span>
                </div>
              </div>
              {/* Workload bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/5 rounded-full h-2">
                  <div className={`rounded-full h-2 ${h.weekPoints >= 60 ? "bg-red-500/60" : h.weekPoints >= 36 ? "bg-amber-500/60" : "bg-emerald-500/60"}`}
                    style={{ width: `${Math.min((h.weekPoints / 84) * 100, 100)}%` }} />
                </div>
                <span className="text-[0.625rem] text-muted-foreground">{h.weekPoints}/84pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Hero OFF Days */}
      {supportData.heroOffDaysUpcoming.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-2"><CalendarDays className="h-4 w-4 text-red-400" />Hero OFF Days (Next 2 Weeks)</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {supportData.heroOffDaysUpcoming.map(d => (
              <div key={d.id} className="flex items-center justify-between text-[0.625rem] py-0.5">
                <span className="text-foreground font-medium">{d.user.displayName || d.user.username}</span>
                <span className="text-muted-foreground">{d.date}{d.reason ? ` (${d.reason})` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Reassignment */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><ArrowRightLeft className="h-4 w-4 text-primary" />Reassign Orders</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {supportData.allActiveOrders.slice(0, 20).map(o => (
            <div key={o.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2 border border-white/5 flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <p className="text-[0.625rem] font-medium text-foreground">#{o.orderId} {o.customerName}</p>
                <p className="text-[0.625rem] text-muted-foreground">{o.city} Z{o.zone} · {o.size}({o.points}pt) · <span className="text-amber-400">{o.user.displayName || o.user.username}</span></p>
              </div>
              <Select value={reassignTarget[o.id] || ""} onValueChange={v => setReassignTarget(prev => ({ ...prev, [o.id]: v }))}>
                <SelectTrigger className="text-[0.625rem] bg-white/5 border border-white/10 h-7 w-[110px]">
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent>
                  {supportData.heroes.filter(h => h.id !== o.user.id).map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="text-[0.625rem] h-6 px-2" disabled={reassignLoading === o.id || !reassignTarget[o.id]} onClick={() => handleReassign(o.id)}>
                {reassignLoading === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightLeft className="h-3 w-3" />}
              </Button>
            </div>
          ))}
          {supportData.allActiveOrders.length > 20 && <p className="text-[0.625rem] text-muted-foreground text-center">Showing 20 of {supportData.allActiveOrders.length} active orders</p>}
        </div>
      </div>

      {/* Orders by Status */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs mb-2">Orders by Status ({timeRange})</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {Object.entries(supportData.orders.byStatus).map(([status, count]) => (
            <div key={status} className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-sm font-bold text-foreground">{count}</p>
              <p className="text-[0.625rem] text-muted-foreground">{status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ DASHBOARD TAB (Role Router) ============
function DashboardTab({ stats, onRefresh, dashboardRefreshKey, userZones, onFilterOrders }: { stats: Stats | null; onRefresh: () => void; dashboardRefreshKey: number; userZones?: UserZoneData[]; onFilterOrders?: (status: string) => void }) {
  const { data: session } = useSession();
  const role = session?.user?.role;

  if (role === "ADMIN") return <AdminDashboard onRefresh={onRefresh} refreshKey={dashboardRefreshKey} userZones={userZones} />;
  if (role === "SUPPORT") return <SupportDashboard onRefresh={onRefresh} refreshKey={dashboardRefreshKey} userZones={userZones} />;
  return <HeroDashboard stats={stats} onRefresh={onRefresh} userZones={userZones} onFilterOrders={onFilterOrders} />;
}

// ============ NEW ORDER TAB ============
function NewOrderTab({ onRefresh, onVerifyStart }: { onRefresh: () => void; onVerifyStart?: (sessionId: string) => void; onGeocodeStart?: (sessionId: string) => void }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const isSupportOrAdmin = session?.user?.role === "SUPPORT" || session?.user?.role === "ADMIN";
  const { data: heroes } = useFetchData<HeroOption[]>(isSupportOrAdmin ? "/api/heroes" : "");
  const [assignToUserId, setAssignToUserId] = useState<string>("");
  const [isEventOrder, setIsEventOrder] = useState(false);
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [isErthboxOrder, setIsErthboxOrder] = useState(false);
  const [erthboxLocationId, setErthboxLocationId] = useState("");
  const [erthboxSearch, setErthboxSearch] = useState("");
  const { data: erthboxLocations } = useFetchData<ErthboxLocation[]>("/api/erthbox");
  const [form, setForm] = useState({
    orderId: "", customerName: "", phone: "", address: "", city: "", size: "M", points: 2, isOffice: false, notes: "",
  });
  const [importing, setImporting] = useState(false);

  const handleSizeChange = (newSize: string) => {
    const defaultPts = SIZE_CONFIG[newSize]?.points ?? 2;
    setForm(prev => ({ ...prev, size: newSize, points: defaultPts }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: Record<string, unknown> = { ...form };
      if (isEventOrder) {
        body.isEvent = true;
        body.eventType = eventType || "OTHER";
        body.orderId = ""; // backend will auto-generate EVENT-XXX
        body.phone = "N/A";
        if (!form.address.trim()) body.address = "N/A";
        if (eventDate) body.scheduledDate = eventDate;
      }
      if (isErthboxOrder) {
        body.isErthbox = true;
        body.erthboxLocationId = erthboxLocationId;
        body.orderId = ""; // backend will auto-generate ERTHBOX-XXX
        // Auto-populate from selected location
        const loc = erthboxLocations?.find(l => l.id === erthboxLocationId);
        if (loc) {
          if (!form.customerName.trim()) body.customerName = loc.name;
          if (!form.phone.trim()) body.phone = loc.picPhone;
          if (!form.address.trim()) body.address = loc.address;
          if (!form.city.trim()) body.city = loc.city;
        }
      }
      if (isSupportOrAdmin && assignToUserId && assignToUserId !== "__self__") body.assignToUserId = assignToUserId;
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const order = await res.json();
      toast({ title: isEventOrder ? `Event ${order.orderId} created!` : isErthboxOrder ? `ERTHBOX ${order.orderId} created!` : `Order ${form.orderId} added!`, description: `Auto-detected: Zone ${order.zone} (${getZoneName(order.zone)})${assignToUserId && assignToUserId !== "__self__" ? " → Assigned to hero" : ""}` });
      // Show duplicate warning if present
      if (order._warning) {
        toast({ title: "⚠️ Duplicate Warning", description: order._warning, variant: "destructive" });
      }
      setForm({ orderId: "", customerName: "", phone: "", address: "", city: "", size: "S", points: 1, isOffice: false, notes: "" });
      setAssignToUserId("");
      setEventType("");
      setEventDate("");
      setIsEventOrder(false);
      setIsErthboxOrder(false);
      setErthboxLocationId("");
      onRefresh();
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed to add order", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl border border-primary/20 bg-card earth-glow p-6">
        <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Plus className="h-5 w-5 text-primary" />New Pickup Order</h3>
        {/* Event Toggle */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <Switch id="event-toggle" checked={isEventOrder} onCheckedChange={(v) => { setIsEventOrder(v); if (v) setIsErthboxOrder(false); }} />
          <Label htmlFor="event-toggle" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">📌 Event Order</Label>
          {isEventOrder && <span className="text-[0.625rem] text-amber-400 ml-auto">Event orders auto-generate Order ID</span>}
        </div>
        {/* ERTHBOX Toggle */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <Switch id="erthbox-toggle" checked={isErthboxOrder} onCheckedChange={(v) => { setIsErthboxOrder(v); if (v) setIsEventOrder(false); if (!v) setErthboxSearch(""); }} />
          <Label htmlFor="erthbox-toggle" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">📦 ERTHBOX Collection</Label>
          {isErthboxOrder && <span className="text-[0.625rem] text-emerald-400 ml-auto">ERTHBOX orders auto-generate Order ID</span>}
        </div>
        {/* ERTHBOX Location Selector */}
        {isErthboxOrder && (
          <div className="mb-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 space-y-3">
            <div>
              <Label className="text-xs text-emerald-300 mb-1.5 block font-medium">Select ERTHBOX Location *</Label>
              {erthboxLocationId && (() => {
                const loc = erthboxLocations?.find(l => l.id === erthboxLocationId);
                if (loc) return (
                  <div className="flex items-center gap-2 mb-2 p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                    <Package className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-emerald-300">{loc.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {loc.city}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setErthboxLocationId(""); setErthboxSearch(""); }}><X className="h-3 w-3" /></Button>
                  </div>
                );
                return null;
              })()}
              {!erthboxLocationId && (
                <>
                  <div className="relative mb-1.5">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={erthboxSearch}
                      onChange={e => setErthboxSearch(e.target.value)}
                      placeholder="Search locations by name, city, or address..."
                      className="h-9 pl-8 text-xs bg-white/5 border-white/10 border-emerald-500/30"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                    {(() => {
                      const activeLocs = erthboxLocations?.filter(l => l.isActive) || [];
                      const filtered = erthboxSearch.trim()
                        ? activeLocs.filter(l =>
                            l.name.toLowerCase().includes(erthboxSearch.toLowerCase()) ||
                            l.city.toLowerCase().includes(erthboxSearch.toLowerCase()) ||
                            l.address.toLowerCase().includes(erthboxSearch.toLowerCase())
                          )
                        : activeLocs;
                      if (filtered.length === 0) return (
                        <p className="text-[0.625rem] text-muted-foreground text-center py-3">
                          {activeLocs.length === 0 ? "No ERTHBOX locations added yet. Add them in Settings → Scheduling → ERTHBOX Manager." : "No locations match your search."}
                        </p>
                      );
                      return filtered.map(loc => (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => { setErthboxLocationId(loc.id); setErthboxSearch(""); }}
                          className="w-full text-left p-2.5 hover:bg-white/10 transition-colors border-b border-white/5 last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <Package className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span className="text-xs font-medium text-foreground">{loc.name}</span>
                            <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-emerald-500/30 text-emerald-400">{loc.city}</Badge>
                            {loc.user && loc.user.id !== session?.user?.id && (
                              <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-white/10 text-muted-foreground">by {loc.user.displayName || loc.user.username}</Badge>
                            )}
                          </div>
                          <p className="text-[0.625rem] text-muted-foreground ml-5.5 mt-0.5">{loc.address}</p>
                        </button>
                      ));
                    })()}
                  </div>
                </>
              )}
            </div>
            {erthboxLocationId && (() => {
              const loc = erthboxLocations?.find(l => l.id === erthboxLocationId);
              if (!loc) return null;
              return (
                <div className="rounded-lg border border-emerald-500/20 bg-white/5 p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center gap-2"><MapPin className="h-3 w-3 text-emerald-400 shrink-0" /><span className="text-muted-foreground">{loc.address}, {loc.city}</span></div>
                  <div className="flex items-center gap-2"><UserIcon className="h-3 w-3 text-emerald-400 shrink-0" /><span className="text-muted-foreground">PIC: {loc.picName} ({loc.picPhone})</span></div>
                  {loc.notes && <div className="flex items-center gap-2"><StickyNote className="h-3 w-3 text-amber-400 shrink-0" /><span className="text-amber-300/80">{loc.notes}</span></div>}
                </div>
              );
            })()}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!isEventOrder && !isErthboxOrder && (
              <div><Label className="text-xs text-muted-foreground">Order ID *</Label><Input value={form.orderId} onChange={e => setForm({...form, orderId: e.target.value})} placeholder="ERTH-1234" className="h-11 bg-white/5 border-white/10" required /></div>
            )}
            <div><Label className="text-xs text-muted-foreground">{isEventOrder ? "Event Name *" : isErthboxOrder ? "Label (optional)" : "Customer Name *"}</Label><Input value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} placeholder={isEventOrder ? "e.g. Shah Alam Roadshow" : isErthboxOrder ? "e.g. Weekly collection" : "Ahmad"} className="h-11 bg-white/5 border-white/10" required={!isErthboxOrder} /></div>
            {isEventOrder && (
              <div>
                <Label className="text-xs text-muted-foreground">Event Type *</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROADSHOW">Roadshow</SelectItem>
                    <SelectItem value="EWASTE_COLLECTION">E-Waste Collection</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {!isEventOrder && !isErthboxOrder && (
              <div><Label className="text-xs text-muted-foreground">Phone *</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="0123456789" className="h-11 bg-white/5 border-white/10" required /></div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Size *</Label>
              <Select value={form.size} onValueChange={handleSizeChange}>
                <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">Small (1 pt)</SelectItem>
                  <SelectItem value="M">Medium (2 pts)</SelectItem>
                  <SelectItem value="L">Large (3 pts)</SelectItem>
                  <SelectItem value="XL">X-Large (4 pts)</SelectItem>
                  <SelectItem value="XXL">XX-Large (15 pts)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Points selector 1-MAX_DAILY_POINTS */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Points (1–{MAX_DAILY_POINTS}) — defaults from size, can override</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: MAX_DAILY_POINTS }, (_, i) => i + 1).map(p => (
                <Button
                  key={p}
                  type="button"
                  variant={form.points === p ? "default" : "outline"}
                  size="sm"
                  className={`h-12 text-sm font-semibold ${form.points === p ? "bg-primary text-primary-foreground" : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"}`}
                  onClick={() => setForm(prev => ({ ...prev, points: p }))}
                >
                  {p}
                </Button>
              ))}
            </div>
            <p className="text-[0.625rem] text-muted-foreground mt-1">
              Size {form.size} default: {SIZE_CONFIG[form.size]?.points ?? 2}pt — click any value to override
            </p>
          </div>
          <div><Label className="text-xs text-muted-foreground">Address {isEventOrder || isErthboxOrder ? "(optional — auto-filled from location)" : "*"}</Label><Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder={isEventOrder ? "Event location (optional)" : isErthboxOrder ? "Auto-filled from ERTHBOX location" : "Full pickup address"} className="h-11 bg-white/5 border-white/10" required={!isEventOrder && !isErthboxOrder} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">City/Area {isErthboxOrder ? "(optional)" : "*"}</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder={isErthboxOrder ? "Auto-filled from location" : "e.g. Shah Alam"} className="h-11 bg-white/5 border-white/10" required={!isErthboxOrder} /></div>
            {isEventOrder ? (
              <div>
                <Label className="text-xs text-muted-foreground">Schedule Date *</Label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  required
                  className="flex h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            ) : (
              <div className="flex items-end gap-3 pb-1">
                {!isErthboxOrder && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="isOffice" checked={form.isOffice} onCheckedChange={c => setForm({...form, isOffice: !!c})} />
                    <Label htmlFor="isOffice" className="text-xs flex items-center gap-1 text-muted-foreground"><Building2 className="h-3 w-3" />Office Address</Label>
                  </div>
                )}
              </div>
            )}
          </div>
          <div><Label className="text-xs text-muted-foreground">Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Special instructions..." className="h-16 text-xs bg-white/5 border-white/10" /></div>
          {isSupportOrAdmin && heroes && heroes.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><UserIcon className="h-3 w-3" />Assign to Hero (optional)</Label>
              <Select value={assignToUserId} onValueChange={setAssignToUserId}>
                <SelectTrigger className="h-11 bg-white/5 border-white/10">
                  <SelectValue placeholder="Your account (default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__self__">Your account (default)</SelectItem>
                  {heroes.map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.displayName || h.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[0.625rem] text-muted-foreground mt-1">Leave default to create order under your account, or select a hero to assign.</p>
            </div>
          )}
          <Button type="submit" className={`w-full gap-2 h-14 font-semibold text-base px-4 py-3 ${isEventOrder ? "bg-amber-600 hover:bg-amber-700 text-white" : isErthboxOrder ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}>
            {isEventOrder ? <><Calendar className="h-5 w-5" /> Create Event</> : isErthboxOrder ? <><Package className="h-5 w-5" /> Create ERTHBOX</> : <><Plus className="h-5 w-5" /> Add Order</>}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ============ SCHEDULE TAB (Calendar View) ============
function ScheduleTab({ stats, orders, onRefresh, userZones }: { stats: Stats | null; orders: Order[]; onRefresh: () => void; userZones?: UserZoneData[] }) {
  const [scheduling, setScheduling] = useState(false);
  const [exporting, setExporting] = useState("");
  const [result, setResult] = useState<{ scheduled: number; unscheduled: number } | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const { toast } = useToast();

  const handleAutoSchedule = async () => {
    setScheduling(true);
    try {
      const res = await fetch("/api/schedule", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult({ scheduled: data.scheduled.length, unscheduled: data.unscheduled.length });
      toast({ title: `Auto-scheduled ${data.scheduled.length} orders`, description: data.unscheduled.length > 0 ? `${data.unscheduled.length} couldn't be scheduled` : undefined });
      onRefresh();
    } catch { toast({ title: "Auto-schedule failed", variant: "destructive" }); }
    finally { setScheduling(false); }
  };

  const handleZeoExportDay = async (date: string) => {
    setExporting(date);
    try {
      const res = await fetch("/api/export/zeo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Zeo_Export_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Zeo export downloaded", description: `Upload this file to Zeo Route Planner for ${date}` });
    } catch (err: unknown) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setExporting("");
    }
  };

  // Calendar computations
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  const offDaySet = useMemo(() => new Set((stats?.offDays || []).map(o => o.date)), [stats?.offDays]);
  const holidayMap = useMemo(() => new Map((stats?.holidays || []).map(h => [h.date, h.name])), [stats?.holidays]);

  const getDayPoints = (dateStr: string): number => {
    return stats?.scheduleByDate[dateStr]?.totalPoints || 0;
  };

  const getDayHasEvent = (dateStr: string): boolean => {
    const dayOrders = stats?.scheduleByDate[dateStr]?.orders || [];
    return dayOrders.some((o: Order) => o.isEvent);
  };

  const getDayHasErthbox = (dateStr: string): boolean => {
    const dayOrders = stats?.scheduleByDate[dateStr]?.orders || [];
    return dayOrders.some((o: Order) => o.isErthbox);
  };

  const getDayColor = (day: Date, points: number): string => {
    const dateStr = format(day, "yyyy-MM-dd");
    const hasEvent = getDayHasEvent(dateStr);
    const hasErthbox = getDayHasErthbox(dateStr);
    if (offDaySet.has(dateStr)) return "bg-red-500/10 text-red-400/60 opacity-60"; // OFF DAY - no scheduling
    if (!isSameMonth(day, currentDate)) return "bg-white/3 text-muted-foreground/30";
    if (hasEvent) return "bg-amber-500/15 border-amber-500/30 text-amber-300"; // EVENT day
    if (hasErthbox && !hasEvent) return "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"; // ERTHBOX day
    if (holidayMap.has(dateStr) && points === 0) return "bg-amber-500/5 border-amber-500/10 text-amber-300/70"; // Holiday - no office pickups
    if (points > MAX_DAILY_POINTS) return "bg-red-500/20 border-red-500/30 text-red-300";
    if (points >= 10) return "bg-red-500/15 border-red-500/20 text-red-300";
    if (points >= 6) return "bg-amber-500/15 border-amber-500/20 text-amber-300";
    if (points > 0) return "bg-emerald-500/15 border-emerald-500/20 text-emerald-300";
    return "bg-white/5 text-muted-foreground";
  };

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedOrders = selectedDateStr ? (stats?.scheduleByDate[selectedDateStr]?.orders || orders.filter(o => o.scheduledDate === selectedDateStr && ["SCHEDULED", "CONFIRMED", "BOOKED"].includes(o.status))) : [];
  const selectedPoints = selectedDateStr ? getDayPoints(selectedDateStr) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleAutoSchedule} disabled={scheduling} className="gap-2 h-12 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-3 text-base font-semibold">
          <Zap className="h-5 w-5" />{scheduling ? "Scheduling..." : "Auto-Schedule All Pending"}
        </Button>
        {result && <span className="text-sm text-muted-foreground">Last: {result.scheduled} scheduled, {result.unscheduled} unscheduled</span>}
        <p className="text-xs text-muted-foreground">Every day is a working day. Only OFF DAYS block scheduling. Holidays block office pickups only.</p>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setCurrentDate(addMonths(currentDate, -1))} className="h-9 w-9 p-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h3 className="font-semibold text-base">{format(currentDate, "MMMM yyyy")}</h3>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="h-9 w-9 p-0">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} className="text-center text-[0.625rem] font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const pts = getDayPoints(dateStr);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrent = isToday(day);
            const colorClass = getDayColor(day, pts);
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(day)}
                className={`relative rounded-lg border p-1 min-h-[44px] flex flex-col items-center justify-center transition-all ${colorClass} ${isSelected ? "ring-2 ring-primary" : ""} ${isCurrent ? "border-primary/40" : "border-white/5"} hover:bg-white/10`}
              >
                <span className={`text-xs font-medium ${isCurrent ? "text-primary" : ""}`}>{format(day, "d")}</span>
                {pts > 0 && isSameMonth(day, currentDate) && (
                  <span className="text-[0.625rem] font-bold">{pts}pt</span>
                )}
                {getDayHasEvent(dateStr) && isSameMonth(day, currentDate) && (
                  <span className="text-[0.625rem]">📌</span>
                )}
                {getDayHasErthbox(dateStr) && isSameMonth(day, currentDate) && !getDayHasEvent(dateStr) && (
                  <span className="text-[0.625rem]">📦</span>
                )}
                {holidayMap.has(dateStr) && (
                  <span className="text-[0.625rem] text-amber-400">🎉</span>
                )}
                {offDaySet.has(dateStr) && (
                  <span className="text-[0.625rem] text-red-400">OFF</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[0.625rem] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/15 border border-emerald-500/20" /> &lt;6pts</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/15 border border-amber-500/20" /> 6-9pts</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/15 border border-red-500/20" /> 10+pts</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/15 border border-amber-500/30" /> 📌 Event</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/10 border border-red-500/20" /> OFF Day</span>
          <span className="flex items-center gap-1">🎉 Holiday</span>
        </div>
      </div>

      {/* Load Visualization Bar - Current Week */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChartIcon className="h-4 w-4 text-primary" />This Week&apos;s Load</h3>
        <div className="space-y-2">
          {weekDays.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const pts = getDayPoints(dateStr);
            const isOff = offDaySet.has(dateStr);
            const isHoliday = holidayMap.has(dateStr);
            const hasEvent = getDayHasEvent(dateStr);
            const hasErthbox = getDayHasErthbox(dateStr);
            const pct = isOff ? 0 : Math.min((pts / MAX_DAILY_POINTS) * 100, 100);
            const barColor = isOff ? "bg-red-500/30" : hasEvent ? "bg-amber-500" : hasErthbox ? "bg-emerald-500" : pts >= 10 ? "bg-red-500" : pts >= 6 ? "bg-amber-500" : pts > 0 ? "bg-emerald-500" : "bg-white/10";
            return (
              <div key={dateStr} className="flex items-center gap-2">
                <span className={`text-[0.75rem] w-8 text-right ${isToday(day) ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  {format(day, "EEE").charAt(0)}{format(day, "EEE").charAt(1)}
                </span>
                <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[0.75rem] w-10 text-right text-muted-foreground">
                  {isOff ? "OFF" : hasEvent ? `${pts}📌` : hasErthbox ? `${pts}📦` : isHoliday ? `${pts}🎉` : `${pts}/${MAX_DAILY_POINTS}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Detail Panel */}
      {selectedDate && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {format(selectedDate, "dd MMM yyyy (EEE)")}
              {isToday(selectedDate) && <Badge className="bg-primary text-primary-foreground text-[0.625rem] ml-1">Today</Badge>}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">{selectedPoints}/{MAX_DAILY_POINTS} pts</Badge>
              {selectedOrders.length > 0 && (
                <Button size="sm" variant="ghost" className="h-9 gap-1 text-[0.75rem] text-muted-foreground hover:bg-muted hover:text-foreground" disabled={exporting === selectedDateStr} onClick={() => selectedDateStr && handleZeoExportDay(selectedDateStr)}>
                  <FileDown className="h-3.5 w-3.5" />{exporting === selectedDateStr ? "..." : "Zeo XLSX"}
                </Button>
              )}
            </div>
          </div>
          {selectedOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">No orders scheduled for this day</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {selectedOrders.map(o => (
                <div key={o.id} className={o.isEvent || o.isErthbox ? "relative" : ""}>
                  {o.isEvent && (
                    <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-amber-500 z-10" />
                  )}
                  {o.isErthbox && !o.isEvent && (
                    <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-emerald-500 z-10" />
                  )}
                  <div className={o.isEvent ? "pl-2 bg-amber-500/5" : o.isErthbox ? "pl-2 border-l-2 border-emerald-500/40" : ""}>
                    {o.isEvent && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.625rem] h-5 px-1.5">📌 EVENT</Badge>
                        {o.eventType && <Badge variant="outline" className="text-[0.625rem] h-5 border-amber-500/30 text-amber-400">{formatEventType(o.eventType)}</Badge>}
                      </div>
                    )}
                    {o.isErthbox && !o.isEvent && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[0.625rem] h-5 px-1.5">📦 ERTHBOX</Badge>
                      </div>
                    )}
                    <OrderCard order={o} compact onRefresh={onRefresh} holidays={stats?.holidays} offDays={stats?.offDays} userZones={userZones} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Simple bar chart icon since we don't import from recharts
function BarChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ============ SOS TAB ============
function SosTab({ onRefresh, onGoToOrders, userZones }: { onRefresh: () => void; onGoToOrders?: () => void; userZones?: UserZoneData[] }) {
  const { data: session } = useSession();
  const { data: sosRequests, refetch: refetchSos } = useFetchData<SOSRequest[]>("/api/sos");
  const { toast } = useToast();
  const [answering, setAnswering] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedHeroId, setSelectedHeroId] = useState<Record<string, string>>({});
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");

  const isSupportOrAdmin = session?.user?.role === "SUPPORT" || session?.user?.role === "ADMIN";
  const { data: heroes } = useFetchData<HeroOption[]>(isSupportOrAdmin ? "/api/heroes" : "");

  const handleAnswerSos = async (sosId: string) => {
    setAnswering(sosId);
    try {
      const res = await fetch(`/api/sos/${sosId}`, { method: "POST" });
      if (res.status === 409) {
        const d = await res.json();
        setConflictMessage(d.error || "This order already exists in the system.");
        setShowConflictDialog(true);
        return;
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast({ title: "SOS answered! Order transferred to you.", description: "Check your orders to schedule it." });
      refetchSos();
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Failed to answer SOS", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setAnswering(null);
    }
  };

  const handleAssignSos = async (sosId: string) => {
    const heroId = selectedHeroId[sosId];
    if (!heroId) {
      toast({ title: "Select a hero first", variant: "destructive" });
      return;
    }
    setAssigning(sosId);
    try {
      const res = await fetch(`/api/sos/${sosId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignToUserId: heroId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const heroName = heroes?.find(h => h.id === heroId)?.displayName || "hero";
      toast({ title: "SOS assigned!", description: `Order transferred to ${heroName}` });
      setSelectedHeroId(prev => { const next = { ...prev }; delete next[sosId]; return next; });
      refetchSos();
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Failed to assign SOS", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  const activeSos = (sosRequests || []).filter(s => s.status === "ACTIVE");

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* SOS Conflict Dialog */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-400" />Order Already Exists</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">This order already exists in your orders. Delete the existing order first before accepting this SOS.</p>
            {conflictMessage && <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">{conflictMessage}</p>}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
            </DialogClose>
            <Button onClick={() => { setShowConflictDialog(false); onGoToOrders?.(); }} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
              <ClipboardList className="h-4 w-4" />Go to Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex items-center gap-3">
        <h3 className="font-semibold text-lg flex items-center gap-2"><Siren className="h-5 w-5 text-red-400" />SOS Requests</h3>
        {activeSos.length > 0 && (
          <Badge variant="destructive" className="animate-pulse">{activeSos.length} active</Badge>
        )}
      </div>

      {activeSos.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-8 text-center">
          <Siren className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No active SOS requests right now</p>
          <p className="text-xs text-muted-foreground mt-1">When other drivers need help, their requests appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeSos.map(sos => {
            const sizeConf = SIZE_CONFIG[sos.size] || SIZE_CONFIG.S;
            const fromUser = (sos as SOSRequest & { fromUser?: { id: string; username: string; displayName: string } }).fromUser;
            return (
              <div key={sos.id} className="rounded-xl border border-red-500/20 bg-red-500/5 bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="font-bold text-sm text-foreground">{sos.orderRef}</span>
                      <ZoneBadge zone={sos.zone} compact userZones={userZones} />
                      <span className={`text-[0.75rem] font-semibold ${sizeConf.color}`}>{sos.size}({sos.points}pt)</span>
                      {sos.isOffice && (
                        <span className="inline-flex items-center gap-0.5 rounded-md border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 text-[0.75rem] font-medium text-orange-400">
                          <Building2 className="h-3 w-3" />Office
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground/90">{sos.customerName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{sos.address}, {sos.city}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{sos.phone}</p>
                    {fromUser && isSupportOrAdmin && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><UserIcon className="h-3 w-3" />From: {fromUser.displayName || fromUser.username}</p>
                    )}
                    {sos.notes && <p className="text-xs text-muted-foreground mt-1 italic flex items-center gap-1"><StickyNote className="h-3 w-3" />{sos.notes}</p>}
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                      <p className="text-xs font-semibold text-red-300 flex items-center gap-1"><Siren className="h-3 w-3" />SOS Reason:</p>
                      <p className="text-xs text-red-200 mt-0.5">{sos.sosNote}</p>
                    </div>
                  </div>
                  {!isSupportOrAdmin ? (
                    <Button
                      onClick={() => handleAnswerSos(sos.id)}
                      disabled={answering === sos.id}
                      className="h-12 gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3 text-sm font-semibold shrink-0"
                    >
                      {answering === sos.id ? (
                        <><RotateCcw className="h-5 w-5 animate-spin" />Taking...</>
                      ) : (
                        <><Siren className="h-5 w-5" />ANSWER SOS</>
                      )}
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        onClick={() => handleAnswerSos(sos.id)}
                        disabled={answering === sos.id}
                        className="h-10 gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-xs font-semibold"
                      >
                        {answering === sos.id ? (
                          <><RotateCcw className="h-4 w-4 animate-spin" />Taking...</>
                        ) : (
                          <><Siren className="h-4 w-4" />TAKE</>
                        )}
                      </Button>
                      {heroes && heroes.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <Select value={selectedHeroId[sos.id] || ""} onValueChange={v => setSelectedHeroId(prev => ({ ...prev, [sos.id]: v }))}>
                            <SelectTrigger className="h-8 text-[0.75rem] bg-white/5 border-white/10 w-36">
                              <SelectValue placeholder="Assign to..." />
                            </SelectTrigger>
                            <SelectContent>
                              {heroes.map(h => (
                                <SelectItem key={h.id} value={h.id}>{h.displayName || h.username}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() => handleAssignSos(sos.id)}
                            disabled={assigning === sos.id || !selectedHeroId[sos.id]}
                            className="h-8 gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-[0.75rem] font-semibold"
                          >
                            {assigning === sos.id ? (
                              <><RotateCcw className="h-3 w-3 animate-spin" />...</>
                            ) : (
                              <><UserIcon className="h-3 w-3" />ASSIGN</>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[0.625rem] text-muted-foreground mt-2">{format(parseISO(sos.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ ORDERS TAB ============
function OrdersTab({ orders, onRefresh, holidays, offDays, userZones, onVerifyStart, onGeocodeStart, initialStatusFilter, filterNonce }: { orders: Order[]; onRefresh: () => void; holidays?: Holiday[]; offDays?: OffDay[]; userZones?: UserZoneData[]; onVerifyStart?: (sessionId: string) => void; onGeocodeStart?: (sessionId: string) => void; initialStatusFilter?: string; filterNonce?: number }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("ALL");
  // Apply deep-link status filter dispatched from the dashboard stat cards.
  // Depends on filterNonce so re-clicking the same status still re-applies it.
  useEffect(() => { if (initialStatusFilter) setFilterStatus(initialStatusFilter); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterNonce]);
  const [filterZone, setFilterZone] = useState("ALL");
  const [filterHero, setFilterHero] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [disabledZones, setDisabledZones] = useState<number[]>([]);
  const [timelineOrder, setTimelineOrder] = useState<Order | null>(null);
  const [timelineLogs, setTimelineLogs] = useState<AuditLogEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    if (!timelineOrder) return;
    setTimelineLoading(true);
    setTimelineLogs([]);
    fetch("/api/audit-logs?entity=Order&entityId=" + timelineOrder.id + "&limit=100")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTimelineLogs(d.logs || []); })
      .catch(() => {})
      .finally(() => setTimelineLoading(false));
  }, [timelineOrder?.id]);
  const isSupportOrAdmin = session?.user?.role === "SUPPORT" || session?.user?.role === "ADMIN";
  const isAdmin = session?.user?.role === "ADMIN";
  const isSupport = session?.user?.role === "SUPPORT";

  // Support sees all orders by default; Admin uses toggle
  const [showAllOrders, setShowAllOrders] = useState(isSupport);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  // Orders fetched by a specific status (used for deep-link + manual status filter)
  // so the list matches the dashboard count instead of the 100-most-recent cap.
  const [statusFilteredOrders, setStatusFilteredOrders] = useState<Order[] | null>(null);
  const [loadingStatusFiltered, setLoadingStatusFiltered] = useState(false);
  const [heroes, setHeroes] = useState<HeroOption[]>([]);
  const [filterDate, setFilterDate] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState("");
  const [batchDate, setBatchDate] = useState("");
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [sortOrder, setSortOrder] = useState("created-desc");

  // Fetch disabled zones from settings
  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : Promise.resolve({})).then((s: any) => {
      if (s?.disabledZones) {
        try { setDisabledZones(JSON.parse(s.disabledZones)); } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  // Fetch heroes for reassignment dropdown
  useEffect(() => {
    if (!isSupportOrAdmin) return;
    fetch("/api/heroes").then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setHeroes(d); }).catch(() => {});
  }, [isSupportOrAdmin]);

  // Fetch all orders when toggle is on (Support auto, Admin manual)
  useEffect(() => {
    if (!showAllOrders || !isSupportOrAdmin) return;
    let cancelled = false;
    setTimeout(() => setLoadingAll(true), 0);
    fetch("/api/orders?all=true&limit=200")
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then((d: any) => { if (!cancelled && d.orders && Array.isArray(d.orders)) { setAllOrders(d.orders); setLoadingAll(false); } })
      .catch(() => { if (!cancelled) setLoadingAll(false); });
    return () => { cancelled = true; };
  }, [showAllOrders, isSupportOrAdmin]);

  // Fetch all orders of the selected status so the filtered list is complete
  // (matches the dashboard stat counts). Skipped for the support/admin "all heroes" view.
  useEffect(() => {
    if (filterStatus === "ALL" || (isSupportOrAdmin && showAllOrders)) { setStatusFilteredOrders(null); return; }
    let cancelled = false;
    setLoadingStatusFiltered(true);
    fetch(`/api/orders?status=${filterStatus}&limit=200`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (!cancelled && d?.orders) { setStatusFilteredOrders(d.orders); setLoadingStatusFiltered(false); } })
      .catch(() => { if (!cancelled) setLoadingStatusFiltered(false); });
    return () => { cancelled = true; };
  }, [filterStatus, isSupportOrAdmin, showAllOrders]);

  const displayOrders = (showAllOrders && isSupportOrAdmin) ? allOrders : (filterStatus !== "ALL" && statusFilteredOrders ? statusFilteredOrders : orders);

  // Universal search: matches any text-based order field
  const searchLower = searchQuery.toLowerCase().trim();
  const filtered = displayOrders.filter(o => {
    if (filterStatus !== "ALL" && o.status !== filterStatus) return false;
    if (filterZone !== "ALL" && o.zone !== parseInt(filterZone)) return false;
    if (filterHero !== "ALL" && o.user?.id !== filterHero) return false;
    if (filterDate && o.scheduledDate !== filterDate) return false;
    if (searchLower) {
      const zoneName = userZones?.find(uz => uz.zoneId === o.zone)?.name || getZoneName(o.zone);
      const heroName = o.user?.displayName || o.user?.username || "";
      const haystack = [
        o.orderId, o.customerName, o.phone, o.address, o.city,
        o.size, o.status, o.scheduledDate, o.notes,
        o.eventType, zoneName, heroName,
        o.isOffice ? "office" : "",
        o.isEvent ? "event" : "",
        o.isErthbox ? "erthbox" : "",
      ].join(" ").toLowerCase();
      return haystack.includes(searchLower);
    }
    return true;
  });

  // Sort the filtered orders
  const toTs = (v: string) => {
    const n = typeof v === "string" ? Date.parse(v) : 0;
    return isNaN(n) ? (typeof v === "string" ? parseInt(v, 10) || 0 : 0) : n;
  };
  const sorted = [...filtered].sort((a, b) => {
    switch (sortOrder) {
      case "created-desc":
        return toTs(b.createdAt) - toTs(a.createdAt);
      case "created-asc":
        return toTs(a.createdAt) - toTs(b.createdAt);
      case "id-asc": {
        const aNum = parseInt(String(a.orderId).replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(String(b.orderId).replace(/\D/g, ""), 10) || 0;
        if (aNum !== bNum) return aNum - bNum;
        return String(a.orderId).localeCompare(String(b.orderId));
      }
      case "id-desc": {
        const aNum = parseInt(String(a.orderId).replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(String(b.orderId).replace(/\D/g, ""), 10) || 0;
        if (aNum !== bNum) return bNum - aNum;
        return String(b.orderId).localeCompare(String(a.orderId));
      }
      case "updated-desc":
        return toTs(b.updatedAt) - toTs(a.updatedAt);
      case "updated-asc":
        return toTs(a.updatedAt) - toTs(b.updatedAt);
      default:
        return 0;
    }
  });

  // Reassign handler
  const handleReassign = async (orderId: string, targetHeroId: string) => {
    try {
      const res = await fetch("/api/orders/reassign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, targetHeroId, reason: `${isSupport ? "Support" : "Admin"} reassignment from Orders tab` }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const result = await res.json();
      toast({ title: "Order reassigned", description: `→ ${result.to}` });
      onRefresh();
      // Refresh all orders list
      fetch("/api/orders?all=true&limit=200").then(r => r.ok ? r.json() : Promise.resolve({})).then((d: any) => { if (d.orders && Array.isArray(d.orders)) setAllOrders(d.orders); }).catch(() => {});
    } catch (err: unknown) {
      toast({ title: "Reassignment failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  // Batch status change
  const handleBatchStatusChange = async () => {
    if (selectedIds.size === 0 || !batchStatus) return;
    setBatchUpdating(true);
    try {
      const res = await fetch("/api/orders/batch/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: Array.from(selectedIds), status: batchStatus }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      toast({ title: `Updated ${data.updated}/${selectedIds.size} orders to ${batchStatus}` });
      setSelectedIds(new Set());
      setSelectMode(false);
      setBatchStatus("");
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Batch update failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setBatchUpdating(false); }
  };

  const handleBatchDateChange = async () => {
    if (selectedIds.size === 0 || !batchDate) return;
    setBatchUpdating(true);
    try {
      const res = await fetch("/api/orders/batch/date", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: Array.from(selectedIds), scheduledDate: batchDate }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      toast({ title: `Scheduled ${data.updated}/${selectedIds.size} orders on ${batchDate}` });
      setSelectedIds(new Set());
      setSelectMode(false);
      setBatchDate("");
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Batch date update failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setBatchUpdating(false); }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      let deleted = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
          if (res.ok) deleted++; else failed++;
        } catch { failed++; }
      }
      toast({ title: `Deleted ${deleted}/${ids.length} orders`, description: failed > 0 ? `${failed} failed` : undefined, variant: failed > 0 ? "destructive" : "default" });
      setSelectedIds(new Set());
      setSelectMode(false);
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Batch delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setBatchUpdating(false); }
  };

  // Geocode missing orders
  const [geocoding, setGeocoding] = useState(false);
  const missingGeocode = displayOrders.filter(o => !o.latitude || !o.longitude).length;

  const handleGeocodeMissing = async () => {
    if (missingGeocode === 0) return;
    setGeocoding(true);
    try {
      const res = await fetch("/api/orders/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200 }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      if (data.sessionId) {
        toast({ title: `Started geocoding ${data.total} orders`, description: "Progress bar appears at bottom right" });
        onGeocodeStart?.(data.sessionId);
      }
      setGeocoding(false);
    } catch (err: unknown) {
      toast({ title: "Geocoding failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setGeocoding(false);
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map(o => o.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const unverifiedCount = filtered.filter(o => !o.addressVerified).length;
  const handleVerifyAll = async () => {
    if (verifyingAll) return;
    setVerifyingAll(true);
    try {
      const res = await fetch("/api/orders/verify-address/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: filtered.filter(o => !o.addressVerified).slice(0, 20).map(o => o.id) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      if (data.sessionId) onVerifyStart?.(data.sessionId);
      toast({ title: `Verification queued for ${Math.min(filtered.filter(o => !o.addressVerified).length, 20)} orders` });
    } catch (err: unknown) {
      toast({ title: "Verification failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setVerifyingAll(false); }
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Sticky Collapsible Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm -mx-1 px-1 pb-1">
        {/* Search + compact controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search orders..."
              className="w-full h-11 pl-10 pr-10 rounded-lg border border-white/10 bg-white/5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/40 flex items-center justify-center transition-colors">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-muted-foreground shrink-0" onClick={() => setFiltersCollapsed(v => !v)} title={filtersCollapsed ? "Show filters" : "Hide filters"}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          </Button>
          <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground shrink-0 hidden sm:inline-flex">
            {loadingAll ? "Loading..." : `${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
          </Badge>
        </div>

        {/* Collapsible filter row */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersCollapsed ? "max-h-0 opacity-0 mt-0" : "max-h-[500px] opacity-100 mt-2"}`}>
          <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap sm:items-center">
            {isSupport && (
              <div className="flex items-center gap-2 mr-2">
                <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.625rem] h-5">
                  <Users className="h-3 w-3 mr-1" />All Heroes&apos; Orders
                </Badge>
              </div>
            )}
            {isAdmin && (
              <div className="flex items-center gap-2 mr-2">
                <Switch checked={showAllOrders} onCheckedChange={setShowAllOrders} id="show-all-orders" />
                <Label htmlFor="show-all-orders" className="text-xs text-muted-foreground cursor-pointer">Show All Users&apos; Orders</Label>
              </div>
            )}
            {showAllOrders && isSupportOrAdmin && heroes.length > 0 && (
              <Select value={filterHero} onValueChange={setFilterHero}>
                <SelectTrigger className="sm:w-[140px] w-full h-11 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Hero" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Heroes</SelectItem>
                  {heroes.map(h => <SelectItem key={h.id} value={h.id}>{h.displayName || h.username}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="sm:w-[140px] w-full h-11 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="CONFIRMED">Contacted</SelectItem>
                <SelectItem value="BOOKED">Booked</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger className="sm:w-[150px] w-full h-11 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Zone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Zones</SelectItem>
                {Object.keys(ZONES).filter(z => !disabledZones.includes(parseInt(z))).map(z => {
                  const zoneNum = parseInt(z);
                  const override = userZones?.find(uz => uz.zoneId === zoneNum);
                  return <SelectItem key={z} value={z}>Z{z} {override?.name || getZoneName(zoneNum)}</SelectItem>;
                })}
                {disabledZones.filter(z => ZONES[z]).length > 0 && (<>
                  <div className="px-2 py-1 text-[0.625rem] text-muted-foreground uppercase tracking-wider">Disabled</div>
                  {disabledZones.filter(z => ZONES[z]).map(z => {
                    const override = userZones?.find(uz => uz.zoneId === z);
                    return <SelectItem key={String(z)} value={String(z)} className="opacity-50">Z{z} {override?.name || getZoneName(z)}</SelectItem>;
                  })}
                </>)}
                {userZones?.filter(uz => uz.isCustom && uz.isEnabled).map(uz => (
                  <SelectItem key={uz.zoneId} value={String(uz.zoneId)}>Z{uz.zoneId} {uz.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-full sm:w-[160px] h-12 sm:h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-foreground [color-scheme:dark]" />
            {filterDate && <button onClick={() => setFilterDate("")} className="text-[0.625rem] text-muted-foreground hover:text-foreground hover:underline cursor-pointer">Clear</button>}
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="sm:w-[150px] w-full h-11 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created-desc">Latest created first</SelectItem>
                <SelectItem value="created-asc">Oldest created first</SelectItem>
                <SelectItem value="id-asc">Order ID ascending</SelectItem>
                <SelectItem value="id-desc">Order ID descending</SelectItem>
                <SelectItem value="updated-desc">Latest updated first</SelectItem>
                <SelectItem value="updated-asc">Oldest updated first</SelectItem>
              </SelectContent>
            </Select>
            {unverifiedCount > 0 && (
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" disabled={verifyingAll} onClick={handleVerifyAll}>
              {verifyingAll ? <><RotateCcw className="h-3 w-3 animate-spin" />Verifying...</> : <><ShieldCheck className="h-3 w-3" />Verify {unverifiedCount}</>}
            </Button>
            )}
            {missingGeocode > 0 && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-amber-400 hover:text-amber-300" disabled={geocoding} onClick={handleGeocodeMissing}>
                {geocoding ? <><RotateCcw className="h-3 w-3 animate-spin" />Geocoding...</> : <><MapPin className="h-3 w-3" />Geocode {missingGeocode} Missing</>}
              </Button>
            )}
            <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground sm:hidden">
              {loadingAll ? "Loading..." : `${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
            </Badge>
            <Button size="sm" variant={selectMode ? "default" : "ghost"} className={`h-8 gap-1.5 text-xs ${selectMode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => { setSelectMode(v => !v); clearSelection(); }}>
              {selectMode ? "Exit Select" : "Select"}
            </Button>
            {selectMode && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={selectedIds.size === filtered.length ? clearSelection : selectAllFiltered}>
                {selectedIds.size === filtered.length ? "Deselect All" : `Select All (${filtered.length})`}
              </Button>
            )}
            {searchLower && filtered.length > 0 && (
              <button onClick={() => { setFilterStatus("ALL"); setFilterZone("ALL"); setFilterHero("ALL"); setFilterDate(""); }} className="text-[0.625rem] text-primary hover:underline cursor-pointer">Reset filters</button>
            )}
          </div>
        </div>
        {filtersCollapsed && (
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            {filterStatus !== "ALL" && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.625rem]">{filterStatus}</span>}
            {filterZone !== "ALL" && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.625rem]">Z{filterZone}</span>}
            {filterDate && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.625rem]">{filterDate}</span>}
            {filterHero !== "ALL" && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.625rem]">Hero</span>}
            <span className="text-[0.625rem]">{filtered.length} of {displayOrders.length} orders</span>
          </div>
        )}
      </div>
      {selectMode && selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <span className="text-xs font-medium text-foreground">{selectedIds.size} selected</span>
          <Select value={batchStatus} onValueChange={setBatchStatus}>
            <SelectTrigger className="sm:w-[130px] w-full h-9 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Status..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
              <SelectItem value="CONFIRMED">Contacted</SelectItem>
              <SelectItem value="BOOKED">Booked</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELED">Canceled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9 gap-1.5 text-xs bg-primary hover:bg-primary/90" disabled={!batchStatus || batchUpdating} onClick={handleBatchStatusChange}>
            {batchUpdating ? <><RotateCcw className="h-3 w-3 animate-spin" />...</> : <><Zap className="h-3 w-3" />Set Status</>}
          </Button>
          <div className="w-px h-7 bg-white/10" />
          <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className="w-full sm:w-[150px] h-11 sm:h-9 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-foreground [color-scheme:dark]" />
          <Button size="sm" className="h-9 gap-1.5 text-xs bg-primary hover:bg-primary/90" disabled={!batchDate || batchUpdating} onClick={handleBatchDateChange}>
            {batchUpdating ? <><RotateCcw className="h-3 w-3 animate-spin" />...</> : <><Calendar className="h-3 w-3" />Set Date</>}
          </Button>
          <Button size="sm" variant="destructive" className="h-9 gap-1.5 text-xs" disabled={batchUpdating} onClick={handleBatchDelete}>
            {batchUpdating ? <><RotateCcw className="h-3 w-3 animate-spin" />...</> : <><Trash2 className="h-3 w-3" />Delete ({selectedIds.size})</>}
          </Button>
          <Button size="sm" variant="ghost" className="h-9 text-xs text-muted-foreground ml-auto" onClick={clearSelection}>Cancel</Button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto stagger-fade">
        {sorted.map(o => <OrderCard key={o.id} order={o} onRefresh={onRefresh} holidays={holidays} offDays={offDays} isAdminView={showAllOrders && isSupportOrAdmin} heroes={showAllOrders && isSupportOrAdmin ? heroes : undefined} onReassign={showAllOrders && isSupportOrAdmin ? handleReassign : undefined} userZones={userZones} disabledZones={disabledZones} selected={selectMode ? selectedIds.has(o.id) : undefined} onToggleSelect={selectMode ? () => toggleSelectOrder(o.id) : undefined} onShowTimeline={() => setTimelineOrder(o)} />)}
        {filtered.length === 0 && (
          <div className="text-center py-16 px-6">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-5 opacity-70">
              <rect x="20" y="30" width="80" height="60" rx="8" stroke="currentColor" strokeWidth="2" className="text-border" fill="currentColor" fillOpacity="0.03"/>
              <rect x="28" y="38" width="40" height="6" rx="3" fill="currentColor" fillOpacity="0.08" className="text-muted-foreground"/>
              <rect x="28" y="50" width="55" height="4" rx="2" fill="currentColor" fillOpacity="0.05" className="text-muted-foreground"/>
              <rect x="28" y="60" width="35" height="4" rx="2" fill="currentColor" fillOpacity="0.05" className="text-muted-foreground"/>
              <circle cx="90" cy="80" r="18" className="text-primary" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M84 78h12M90 72v12" className="text-primary" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M96 20l4 4-8 8" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M96 20l4 4-8 8" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.4" transform="translate(-1,1)"/>
            </svg>
            <p className="text-base font-medium text-foreground mb-1">{searchLower ? `No orders matching "${searchQuery}"` : "No orders yet"}</p>
            <p className="text-sm text-muted-foreground/70">{searchLower ? "Try adjusting your search or filters" : "Orders will appear here once they are created or imported"}</p>
            {searchLower && <button onClick={() => setSearchQuery("")} className="mt-4 text-sm text-primary hover:underline font-medium">Clear search</button>}
          </div>
        )}
      </div>
      <Dialog open={!!timelineOrder} onOpenChange={(open) => { if (!open) setTimelineOrder(null); }}>
      <DialogContent className="bg-card border-white/10 sm:max-w-lg max-h-[85vh] overflow-y-auto">
      {timelineOrder && (
      <>
      <DialogHeader>
      <DialogTitle className="text-foreground flex items-center gap-2">
      <Clock className="h-4 w-4" />
      Timeline &mdash; {timelineOrder.orderId}
      </DialogTitle>
      </DialogHeader>
      <div className="py-4">
      <div className="text-xs text-muted-foreground mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
      <div className="font-medium text-foreground mb-1">{timelineOrder.customerName}</div>
      <div>{timelineOrder.address}, {timelineOrder.city}</div>
      <div className="mt-1 flex flex-wrap gap-1.5 items-center">
      <span className="text-[0.625rem] px-1.5 py-0.5 rounded border border-white/10">{timelineOrder.size}({timelineOrder.points}pt)</span>
      <StatusBadge status={timelineOrder.status} />
      <span className="text-[0.625rem] text-muted-foreground">Created: {format(parseISO(timelineOrder.createdAt), "dd MMM yyyy, HH:mm")}</span>
      {timelineOrder.updatedAt !== timelineOrder.createdAt && (
      <span className="text-[0.625rem] text-muted-foreground">Updated: {format(parseISO(timelineOrder.updatedAt), "dd MMM yyyy, HH:mm")}</span>
      )}
      </div>
      </div>
      {timelineLoading ? (
      <div className="text-center py-8 text-muted-foreground text-sm">Loading timeline...</div>
      ) : timelineLogs.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground text-sm">No audit logs found for this order.</div>
      ) : (
      <div className="relative">
      <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-white/10" />
      {timelineLogs.map((log) => (
      <div key={log.id} className="relative pl-9 pb-4 last:pb-0">
      <div className={"absolute left-[5px] top-[5px] w-[13px] h-[13px] rounded-full border-2 " + (log.action === "CREATE" ? "bg-emerald-500 border-emerald-500/30" : log.action.startsWith("DELETE") ? "bg-red-500 border-red-500/30" : "bg-amber-500 border-amber-500/30")} />
      <div className="bg-white/5 rounded-lg border border-white/10 p-3">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
      <span className={"text-[0.625rem] px-1.5 py-0.5 rounded font-semibold " + (log.action === "CREATE" ? "bg-emerald-500/15 text-emerald-400" : log.action.startsWith("DELETE") ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400")}>{log.action}</span>
      {log.user && <span className="text-[0.625rem] text-muted-foreground">by {log.user.displayName || log.user.username} <span className="text-[0.625rem]">({log.user.role})</span></span>}
      <span className="text-[0.625rem] text-muted-foreground ml-auto">{format(parseISO(log.createdAt), "dd MMM HH:mm")}</span>
      </div>
      {log.details && (() => {
        try {
          const parsed = JSON.parse(log.details);
          const changes = parsed.changes || {};
          const changeEntries = Object.entries(changes);
          if (changeEntries.length === 0) return null;
          
          // Human-readable field labels
          const fieldLabels: Record<string, string> = {
            status: "Status",
            points: "Points",
            size: "Size",
            notes: "Notes",
            scheduledDate: "Schedule Date",
            address: "Address",
            city: "City",
            phone: "Phone",
            customerName: "Customer Name",
            latitude: "Latitude",
            longitude: "Longitude",
            isOffice: "Office Flag",
            zone: "Zone",
          };
          
          // Human-readable status values
          const statusLabels: Record<string, string> = {
            PENDING: "Pending",
            SCHEDULED: "Scheduled",
            CONFIRMED: "Contacted",
            BOOKED: "Booked",
            COMPLETED: "Completed",
            CANCELED: "Canceled",
          };
          
          const formatValue = (val: any, field: string) => {
            if (val === null || val === undefined) return "—";
            if (field === "status" && typeof val === "string") return statusLabels[val] || val;
            if (field === "scheduledDate" && typeof val === "string") {
              try { return format(parseISO(val), "dd MMM yyyy"); } catch { return val; }
            }
            if (field === "isOffice") return val ? "Yes" : "No";
            return String(val);
          };
          
          return (
            <div className="mt-1.5 space-y-1">
              {changeEntries.map(([field, change]: [string, any]) => {
                const label = fieldLabels[field] || field;
                const from = formatValue(change.from, field);
                const to = formatValue(change.to, field);
                const isDelete = change.to === null || change.to === undefined;
                return (
                  <div key={field} className="flex items-center gap-1.5 text-[0.625rem] flex-wrap">
                    <span className="text-muted-foreground font-medium">{label}:</span>
                    {!isDelete ? (
                      <>
                        <span className="text-red-400/70 line-through">{from}</span>
                        <span className="text-muted-foreground/50">&rarr;</span>
                        <span className="text-emerald-400 font-medium">{to}</span>
                      </>
                    ) : (
                      <span className="text-red-400">{from} <span className="text-muted-foreground/50">(removed)</span></span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        } catch {
          return <pre className="mt-1 text-[0.625rem] text-muted-foreground bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap">{log.details}</pre>;
        }
      })()}
      </div>
      </div>
      ))}
      </div>
      )}
      </div>
      </>
      )}
      </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ AUDIT LOG SECTION ============
function AuditLogSection() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: page.toString(), limit: "25" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    fetch(`/api/audit-logs?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled) {
          if (d) {
            setLogs(d.logs || []);
            setTotalPages(d.pagination?.totalPages || 1);
            setTotal(d.pagination?.total || 0);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, debouncedSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const getActionBadge = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("delete")) return <span className="text-[0.625rem] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 font-semibold">{action}</span>;
    if (lower.includes("create") || lower.includes("sos_create")) return <span className="text-[0.625rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 font-semibold">{action}</span>;
    if (lower.includes("update") || lower.includes("sos_answer")) return <span className="text-[0.625rem] bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 font-semibold">{action}</span>;
    return <span className="text-[0.625rem] bg-white/10 text-muted-foreground border border-white/10 rounded px-1.5 py-0.5 font-semibold">{action}</span>;
  };

  const getRoleBadge = (role: string) => {
    if (role === "ADMIN") return <span className="text-[0.625rem] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1">ADMIN</span>;
    if (role === "SUPPORT") return <span className="text-[0.625rem] bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded px-1">SUPPORT</span>;
    return <span className="text-[0.625rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1">HERO</span>;
  };

  return (
    <div className="px-4 pb-4 border-t border-white/5">
      {/* Search */}
      <form onSubmit={handleSearch} className="pt-3 mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search audit logs..."
            className="h-9 text-xs pl-8 bg-white/5 border-white/10"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" className="h-9 border-white/10 bg-white/5 text-xs gap-1">
          <Search className="h-3 w-3" />Search
        </Button>
      </form>

      <p className="text-[0.625rem] text-muted-foreground mb-2">{total} log entries</p>

      {/* Table */}
      {loading && logs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">No audit logs found</div>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {logs.map(log => {
            const isExpanded = expandedDetails.has(log.id);
            let parsedDetails: string | null = null;
            try { parsedDetails = log.details ? JSON.stringify(JSON.parse(log.details), null, 2) : null; } catch { parsedDetails = log.details; }
            return (
              <div key={log.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground text-[0.625rem] shrink-0">{format(parseISO(log.createdAt), "dd MMM HH:mm")}</span>
                  <span className="font-medium text-foreground">{log.user?.displayName || log.user?.username || "Unknown"}</span>
                  {log.user?.role && getRoleBadge(log.user.role)}
                  {getActionBadge(log.action)}
                  <span className="text-muted-foreground">{log.entity}</span>
                  {log.entityId && <span className="text-muted-foreground/60 text-[0.625rem] truncate max-w-[100px]">{log.entityId.substring(0, 8)}...</span>}
                  {parsedDetails && (
                    <button onClick={() => setExpandedDetails(prev => { const next = new Set(prev); if (next.has(log.id)) next.delete(log.id); else next.add(log.id); return next; })} className="ml-auto text-primary/60 hover:text-primary text-[0.625rem]">
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                </div>
                {isExpanded && parsedDetails && (
                  <pre className="mt-1.5 p-2 rounded bg-white/5 text-[0.625rem] text-muted-foreground whitespace-pre-wrap overflow-x-auto">{parsedDetails}</pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 bg-white/5" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 bg-white/5" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Load More</Button>
        </div>
      )}
    </div>
  );
}

// ============ ERTHBOX MANAGER SECTION ============
function ErthboxManagerSection() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [locations, setLocations] = useState<ErthboxLocation[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<ErthboxLocation | null>(null);
  const [form, setForm] = useState({ name: "", address: "", city: "", picName: "", picPhone: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [managerSearch, setManagerSearch] = useState("");

  const isAdminOrSupport = session?.user?.role === "ADMIN" || session?.user?.role === "SUPPORT";

  const loadLocations = useCallback(() => {
    // Admin/Support: fetch all locations including inactive; Hero: fetch all active (universal)
    const url = isAdminOrSupport ? "/api/erthbox?all=true" : "/api/erthbox";
    fetch(url).then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setLocations(d); }).catch(() => {});
  }, [isAdminOrSupport]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.picName.trim() || !form.picPhone.trim()) {
      toast({ title: "Name, address, city, PIC name, and PIC phone are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/erthbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast({ title: `ERTHBOX location "${form.name}" added` });
      setForm({ name: "", address: "", city: "", picName: "", picPhone: "", notes: "" });
      setShowAddForm(false);
      loadLocations();
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed to add location", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleUpdate = async () => {
    if (!editingLocation) return;
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.picName.trim() || !form.picPhone.trim()) {
      toast({ title: "Name, address, city, PIC name, and PIC phone are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/erthbox/${editingLocation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast({ title: `ERTHBOX location "${form.name}" updated` });
      setEditingLocation(null);
      setForm({ name: "", address: "", city: "", picName: "", picPhone: "", notes: "" });
      loadLocations();
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed to update location", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/erthbox/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: `ERTHBOX location "${name}" deleted` });
      loadLocations();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const handleToggleActive = async (loc: ErthboxLocation) => {
    try {
      const res = await fetch(`/api/erthbox/${loc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !loc.isActive }) });
      if (!res.ok) throw new Error();
      toast({ title: `"${loc.name}" ${loc.isActive ? "disabled" : "enabled"}` });
      loadLocations();
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
  };

  const startEdit = (loc: ErthboxLocation) => {
    setEditingLocation(loc);
    setForm({ name: loc.name, address: loc.address, city: loc.city, picName: loc.picName, picPhone: loc.picPhone, notes: loc.notes || "" });
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingLocation(null);
    setForm({ name: "", address: "", city: "", picName: "", picPhone: "", notes: "" });
  };

  // Check if user can edit/delete a location
  const canModify = (loc: ErthboxLocation) => {
    if (isAdminOrSupport) return true;
    return loc.userId === session?.user?.id;
  };

  // Filter locations by search
  const activeLocations = locations.filter(l => l.isActive);
  const inactiveLocations = locations.filter(l => !l.isActive);
  const filteredActive = managerSearch.trim()
    ? activeLocations.filter(l =>
        l.name.toLowerCase().includes(managerSearch.toLowerCase()) ||
        l.city.toLowerCase().includes(managerSearch.toLowerCase()) ||
        l.address.toLowerCase().includes(managerSearch.toLowerCase())
      )
    : activeLocations;
  const filteredInactive = managerSearch.trim()
    ? inactiveLocations.filter(l =>
        l.name.toLowerCase().includes(managerSearch.toLowerCase()) ||
        l.city.toLowerCase().includes(managerSearch.toLowerCase())
      )
    : inactiveLocations;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-emerald-400" />ERTHBOX Manager</h4>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[0.625rem] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" onClick={() => showAddForm ? cancelForm() : setShowAddForm(true)}>
          <PlusCircle className="h-3 w-3" />{showAddForm || editingLocation ? "Cancel" : "Add Location"}
        </Button>
      </div>
      <p className="text-[0.625rem] text-muted-foreground mb-3">Manage ERTHBOX collection locations. Locations are shared universally — any hero, admin, or support can use them when creating ERTHBOX orders. Only the owner, admin, or support can edit or delete.</p>

      {/* Add/Edit Form */}
      {(showAddForm || editingLocation) && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-400">{editingLocation ? "Edit Location" : "Add New Location"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Location name * (e.g. IKEA Damansara)" className="h-9 text-xs bg-white/5 border-white/10" />
            <Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="City/Area * (e.g. Petaling Jaya)" className="h-9 text-xs bg-white/5 border-white/10" />
          </div>
          <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Full address *" className="h-9 text-xs bg-white/5 border-white/10" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input value={form.picName} onChange={e => setForm({...form, picName: e.target.value})} placeholder="Person in Charge name *" className="h-9 text-xs bg-white/5 border-white/10" />
            <Input value={form.picPhone} onChange={e => setForm({...form, picPhone: e.target.value})} placeholder="PIC phone number *" className="h-9 text-xs bg-white/5 border-white/10" />
          </div>
          <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes (e.g. Mall area, cannot enter between 12PM-2PM)" className="h-16 text-xs bg-white/5 border-white/10" />
          <Button size="sm" className="h-9 gap-1 text-xs w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={editingLocation ? handleUpdate : handleAdd} disabled={loading}>
            {loading ? <><Loader2 className="h-3 w-3 animate-spin" />Saving...</> : editingLocation ? <><Pencil className="h-3 w-3" />Update Location</> : <><Plus className="h-3 w-3" />Add Location</>}
          </Button>
        </div>
      )}

      {/* Search bar */}
      {locations.length > 5 && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={managerSearch}
            onChange={e => setManagerSearch(e.target.value)}
            placeholder="Search locations..."
            className="h-8 pl-8 text-xs bg-white/5 border-white/10"
          />
        </div>
      )}

      {/* Location List */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {locations.length === 0 && !showAddForm && <p className="text-xs text-muted-foreground text-center py-3">No ERTHBOX locations yet. Add one to get started!</p>}
        {filteredActive.map(loc => (
          <div key={loc.id} className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Package className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-300">{loc.name}</span>
                  <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-emerald-500/30 text-emerald-400">{loc.city}</Badge>
                  {loc._count && <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-white/10 text-muted-foreground">{loc._count.orders} order{loc._count.orders !== 1 ? "s" : ""}</Badge>}
                  {loc.user && loc.userId !== session?.user?.id && (
                    <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-cyan-500/30 text-cyan-400">by {loc.user.displayName || loc.user.username}</Badge>
                  )}
                </div>
                <p className="text-[0.625rem] text-muted-foreground mt-0.5 ml-5.5 pl-0.5">{loc.address}</p>
                <div className="flex items-center gap-3 mt-0.5 ml-5.5 pl-0.5">
                  <span className="text-[0.625rem] text-muted-foreground flex items-center gap-1"><UserIcon className="h-2.5 w-2.5" />{loc.picName}</span>
                  <span className="text-[0.625rem] text-muted-foreground flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{loc.picPhone}</span>
                </div>
                {loc.notes && <p className="text-[0.625rem] text-amber-300/70 mt-0.5 ml-5.5 pl-0.5 flex items-center gap-1"><StickyNote className="h-2.5 w-2.5 shrink-0" />{loc.notes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canModify(loc) && (
                  <>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15" onClick={() => startEdit(loc)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/15" onClick={() => handleToggleActive(loc)} title="Disable location"><X className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/15" onClick={() => handleDelete(loc.id, loc.name)}><Trash2 className="h-3 w-3" /></Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredInactive.length > 0 && isAdminOrSupport && (
          <div className="pt-2">
            <p className="text-[0.625rem] text-muted-foreground mb-1">Disabled locations</p>
            {filteredInactive.map(loc => (
              <div key={loc.id} className="rounded-lg border border-white/5 bg-white/3 p-2 opacity-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.625rem] text-muted-foreground line-through">{loc.name} — {loc.city}</span>
                    {loc.user && (
                      <span className="text-[0.625rem] text-muted-foreground">by {loc.user.displayName || loc.user.username}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canModify(loc) && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15" onClick={() => handleToggleActive(loc)} title="Re-enable"><CheckCircle2 className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/15" onClick={() => handleDelete(loc.id, loc.name)}><Trash2 className="h-2.5 w-2.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ SETTINGS TAB ============
function SettingsTab({ holidays, onRefresh, session, onReplayOnboarding, onVerifyStart }: { holidays: Holiday[]; onRefresh: () => void; session: { user?: { id?: string; name?: string; role?: string; username?: string } } | null; onReplayOnboarding?: () => void; onVerifyStart?: (sessionId: string) => void; onGeocodeStart?: (sessionId: string) => void }) {
  const { toast } = useToast();
  const [zeoKey, setZeoKey] = useState("");
  const [zeoBase, setZeoBase] = useState("Cyberjaya, Selangor");
  const [zeoDriverId, setZeoDriverId] = useState("");
  const [sheetsId, setSheetsId] = useState("");
  const [sheetsCreds, setSheetsCreds] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; duplicates: string[]; errors: number } | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  // OFF Days state
  const [offDays, setOffDays] = useState<OffDay[]>([]);
  const [offDayDate, setOffDayDate] = useState("");
  const [offDayReason, setOffDayReason] = useState("");
  const [loadingOffDays, setLoadingOffDays] = useState(false);

  // Zone Map state
  const [customZones, setCustomZones] = useState<ZoneConfig[]>([]);
  const [userZones, setUserZones] = useState<UserZoneData[]>([]);
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set());
  const [newZoneArea, setNewZoneArea] = useState<Record<number, string>>({});
  const [loadingZones, setLoadingZones] = useState(false);
  // Default disabled zones: Other States (zones 8-14) disabled by default
  const defaultDisabledZones = Object.entries(ZONES).filter(([_, z]) => !z.isDefaultEnabled).map(([n]) => parseInt(n));
  const [disabledZones, setDisabledZones] = useState<number[]>(defaultDisabledZones);
  // Custom zone creation state
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRegion, setNewZoneRegion] = useState("");
  const [newZoneNewRegion, setNewZoneNewRegion] = useState("");
  const [newZoneAreas, setNewZoneAreas] = useState("");
  // Zone rename state
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [editingZoneName, setEditingZoneName] = useState("");

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAHasSecret, setTwoFAHasSecret] = useState(false);
  const [twoFASetupStep, setTwoFASetupStep] = useState<"idle"|"setup"|"verify"|"done">("idle");
  const [twoFAQrCode, setTwoFAQrCode] = useState("");
  const [twoFASecret, setTwoFASecret] = useState("");
  const [twoFAVerifyCode, setTwoFAVerifyCode] = useState("");
  const [twoFADisableCode, setTwoFADisableCode] = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  // AI Zone Suggestions state
  const [aiZoneSuggestions, setAiZoneSuggestions] = useState<Array<{id: string; entityId: string; description: string; payload: string; createdAt: string}>>([]);

  // WhatsApp settings state
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>(DEFAULT_WHATSAPP_TEMPLATES);
  const [waPhonePrefix, setWaPhonePrefix] = useState("60");
  const [waEditingTemplate, setWaEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [waShowCreate, setWaShowCreate] = useState(false);
  const [waNewName, setWaNewName] = useState("");
  const [waNewMessage, setWaNewMessage] = useState("");

  // Collapsible settings sections
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["import-export"]));
  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Load settings & 2FA status on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.json()).catch(() => null),
      fetch("/api/2fa/setup").then(r => r.json()).catch(() => null),
    ]).then(([s, twoFaData]) => {
      if (s) {
        if (s.zeo_api_key) setZeoKey(s.zeo_api_key);
        if (s.zeo_base_address) setZeoBase(s.zeo_base_address);
        if (s.zeo_driver_id) setZeoDriverId(s.zeo_driver_id);
        if (s.google_sheets_id) setSheetsId(s.google_sheets_id);
        if (s.disabledZones !== undefined && s.disabledZones !== null) {
          try { setDisabledZones(JSON.parse(s.disabledZones)); } catch { /* ignore */ }
        }
        if (s.whatsappTemplates) {
          try { setWaTemplates(JSON.parse(s.whatsappTemplates)); } catch { /* ignore */ }
        }
        if (s.whatsappPhonePrefix) setWaPhonePrefix(s.whatsappPhonePrefix);
      }
      if (twoFaData) {
        setTwoFAEnabled(twoFaData.enabled || false);
        setTwoFAHasSecret(twoFaData.hasSecret || false);
      }
    });
  }, []);

  // Load off days on mount
  useEffect(() => {
    fetch("/api/offdays").then(r => r.json()).then(d => { if (Array.isArray(d)) setOffDays(d); }).catch(() => {});
  }, []);

  // Load zone data + AI zone suggestions on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/zones").then(r => r.json()).catch(() => null),
      fetch("/api/user-zones").then(r => r.json()).catch(() => null),
      fetch("/api/ai/zone-suggestions").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([zonesData, userZonesData, aiSuggestions]) => {
      if (Array.isArray(zonesData)) setCustomZones(zonesData);
      if (Array.isArray(userZonesData)) setUserZones(userZonesData);
      if (Array.isArray(aiSuggestions)) setAiZoneSuggestions(aiSuggestions);
    });
  }, []);

  // Reload zone data (used after approving AI zone suggestions)
  const loadZoneData = async () => {
    try {
      const [zonesRes, userZonesRes] = await Promise.all([
        fetch("/api/zones"),
        fetch("/api/user-zones"),
      ]);
      const zonesData = await zonesRes.json();
      const userZonesData = await userZonesRes.json();
      if (Array.isArray(zonesData)) setCustomZones(zonesData);
      if (Array.isArray(userZonesData)) setUserZones(userZonesData);
    } catch { /* ignore */ }
  };

  // 2FA handlers
  const handle2FASetup = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch("/api/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTwoFAQrCode(data.qrCode);
        setTwoFASecret(data.secret);
        setTwoFASetupStep("setup");
      } else {
        toast({ title: data.error || "Setup failed", variant: "destructive" });
      }
    } catch { toast({ title: "Setup failed", variant: "destructive" }); }
    finally { setTwoFALoading(false); }
  };

  const handle2FAVerify = async () => {
    if (!twoFAVerifyCode || twoFAVerifyCode.length !== 6) {
      toast({ title: "Enter 6-digit code", variant: "destructive" });
      return;
    }
    setTwoFALoading(true);
    try {
      const res = await fetch("/api/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFAVerifyCode, enable: true }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setTwoFAEnabled(true);
        setTwoFASetupStep("done");
        toast({ title: "2FA enabled! ✓" });
      } else {
        toast({ title: data.error || "Invalid code", variant: "destructive" });
      }
    } catch { toast({ title: "Verification failed", variant: "destructive" }); }
    finally { setTwoFALoading(false); }
  };

  const handle2FADisable = async () => {
    if (!twoFADisableCode || twoFADisableCode.length !== 6) {
      toast({ title: "Enter 6-digit code to disable", variant: "destructive" });
      return;
    }
    setTwoFALoading(true);
    try {
      const res = await fetch("/api/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFADisableCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setTwoFAEnabled(false);
        setTwoFAHasSecret(false);
        setTwoFASetupStep("idle");
        setTwoFADisableCode("");
        toast({ title: "2FA disabled" });
      } else {
        toast({ title: data.error || "Failed to disable", variant: "destructive" });
      }
    } catch { toast({ title: "Failed to disable", variant: "destructive" }); }
    finally { setTwoFALoading(false); }
  };

  // AI Zone Suggestion handlers
  const approveZoneSuggestion = async (suggestionId: string) => {
    try {
      const res = await fetch(`/api/ai/actions/${suggestionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (res.ok) {
        setAiZoneSuggestions(prev => prev.filter(s => s.id !== suggestionId));
        toast({ title: "Zone area added ✓" });
        loadZoneData();
      }
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const rejectZoneSuggestion = async (suggestionId: string) => {
    try {
      const res = await fetch(`/api/ai/actions/${suggestionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      if (res.ok) {
        setAiZoneSuggestions(prev => prev.filter(s => s.id !== suggestionId));
        toast({ title: "Suggestion rejected" });
      }
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        zeo_api_key: zeoKey, zeo_base_address: zeoBase, zeo_driver_id: zeoDriverId,
      }) });
      toast({ title: "Settings saved" });
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const saveWhatsAppSettings = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        whatsappTemplates: JSON.stringify(waTemplates),
        whatsappPhonePrefix: waPhonePrefix,
      }) });
      toast({ title: "WhatsApp settings saved" });
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const addWhatsAppTemplate = async () => {
    if (!waNewName.trim() || !waNewMessage.trim()) {
      toast({ title: "Name and message are required", variant: "destructive" });
      return;
    }
    const newTemplate: WhatsAppTemplate = {
      id: `custom-${Date.now()}`,
      name: waNewName.trim(),
      message: waNewMessage.trim(),
      isDefault: false,
    };
    const updated = [...waTemplates, newTemplate];
    setWaTemplates(updated);
    setWaNewName("");
    setWaNewMessage("");
    setWaShowCreate(false);
    // Auto-save
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappTemplates: JSON.stringify(updated) }) });
    if (!res.ok) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    toast({ title: "Template created" });
  };

  const updateWhatsAppTemplate = async () => {
    if (!waEditingTemplate || !waEditingTemplate.name.trim() || !waEditingTemplate.message.trim()) return;
    const updated = waTemplates.map(t => t.id === waEditingTemplate.id ? waEditingTemplate : t);
    setWaTemplates(updated);
    setWaEditingTemplate(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappTemplates: JSON.stringify(updated) }) });
    if (!res.ok) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    toast({ title: "Template updated" });
  };

  const deleteWhatsAppTemplate = async (id: string) => {
    const template = waTemplates.find(t => t.id === id);
    if (template?.isDefault && waTemplates.length <= 1) {
      toast({ title: "Cannot delete the only default template", variant: "destructive" });
      return;
    }
    const updated = waTemplates.filter(t => t.id !== id);
    // If we deleted the default, make the first remaining one default
    if (template?.isDefault && updated.length > 0) {
      updated[0] = { ...updated[0], isDefault: true };
    }
    setWaTemplates(updated);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappTemplates: JSON.stringify(updated) }) });
    if (!res.ok) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    toast({ title: "Template deleted" });
  };

  const setDefaultTemplate = async (id: string) => {
    const updated = waTemplates.map(t => ({ ...t, isDefault: t.id === id }));
    setWaTemplates(updated);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappTemplates: JSON.stringify(updated) }) });
    if (!res.ok) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    toast({ title: "Default template updated" });
  };

  const handleSheetsSync = async (action: "sync" | "import") => {
    setSyncing(true);
    try {
      const body: Record<string, string> = { action };
      if (sheetsId) body.spreadsheetId = sheetsId;
      if (sheetsCreds) body.serviceAccount = sheetsCreds;
      const res = await fetch("/api/sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: action === "sync" ? `Synced ${data.rowsWritten} rows to Sheets` : `Imported ${data.imported} orders from Sheets` });
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Sheets sync failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSyncing(false); }
  };

  const downloadTemplate = () => {
    const headers = ["Order #", "Client name", "Address", "Special Note"];
    const sampleRows = [
      ["25659", "+60 16-303 8834", "No.15, Persiaran Pasak Bumi Seksyen U8, Shah Alam, Selangor, 40150", ""],
      ["25660", "CLEVER", "2A, Jalan Sungai Burung W 32/W, Bukit Rimau, Shah Alam, Selangor, 40460", "Biz hours only"],
      ["25661", "+60 12-398 9734", "38, Jalan BP 1/5, Bandar Bukit Puchong, Puchong, Selangor, 47100", "Agreed to pay RM35"],
    ];
    const csvContent = [headers, ...sampleRows].map(row =>
      row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Encore_Import_Template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Template downloaded", description: "Matches Encore export format — export from Encore, then import here" });
  };

  const handleEncoreImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/encore", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setImportResult({ imported: data.imported, skipped: data.skipped, duplicates: data.duplicates, errors: data.errors });

      if (data.imported > 0) {
        toast({ title: `Imported ${data.imported} orders from Encore`, description: data.skipped > 0 ? `${data.skipped} duplicates skipped` : undefined });
        if (data.newOrderIds?.length > 0) {
          fetch("/api/orders/verify-address/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderIds: data.newOrderIds }),
          }).then(r => r.json()).then(vData => {
            if (vData.sessionId) onVerifyStart?.(vData.sessionId);
          }).catch(() => {});
        }
        onRefresh();
      } else if (data.skipped > 0) {
        toast({ title: "No new orders imported", description: `${data.skipped} orders already exist (duplicates)`, variant: "destructive" });
      } else {
        toast({ title: "No orders found in file", variant: "destructive" });
      }
    } catch (err: unknown) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleZeoExport = async (date: string) => {
    setExporting(true);
    try {
      const res = await fetch("/api/export/zeo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Zeo_Export_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Zeo export downloaded", description: `Upload this file to Zeo Route Planner for ${date}` });
    } catch (err: unknown) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: newDate, name: newName }) });
      if (!res.ok) throw new Error();
      toast({ title: "Holiday added" });
      setNewDate(""); setNewName(""); onRefresh();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const deleteHoliday = async (id: string) => {
    await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    toast({ title: "Holiday deleted" }); onRefresh();
  };

  // OFF Days handlers
  const addOffDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offDayDate) return;
    setLoadingOffDays(true);
    try {
      const res = await fetch("/api/offdays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: offDayDate, reason: offDayReason || null }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const newOffDay = await res.json();
      setOffDays(prev => [...prev, newOffDay].sort((a, b) => a.date.localeCompare(b.date)));
      setOffDayDate(""); setOffDayReason("");
      toast({ title: "OFF day added" });
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Failed to add OFF day", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setLoadingOffDays(false); }
  };

  const deleteOffDay = async (id: string) => {
    try {
      await fetch(`/api/offdays/${id}`, { method: "DELETE" });
      setOffDays(prev => prev.filter(o => o.id !== id));
      toast({ title: "OFF day removed" });
      onRefresh();
    } catch { toast({ title: "Failed to remove", variant: "destructive" }); }
  };

  // Zone Map handlers
  const toggleZone = (zone: number) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone); else next.add(zone);
      return next;
    });
  };

  const addZoneArea = async (zone: number) => {
    const area = newZoneArea[zone]?.trim();
    if (!area || area.length < 2) return;
    setLoadingZones(true);
    try {
      const res = await fetch("/api/zones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone, area }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const newConfig = await res.json();
      setCustomZones(prev => [...prev, newConfig]);
      setNewZoneArea(prev => ({ ...prev, [zone]: "" }));
      toast({ title: `Added "${area}" to Zone ${zone}` });
    } catch (err: unknown) {
      toast({ title: "Failed to add area", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setLoadingZones(false); }
  };

  const deleteZoneArea = async (id: string) => {
    try {
      const res = await fetch("/api/zones", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setCustomZones(prev => prev.filter(z => z.id !== id));
      toast({ title: "Area removed" });
    } catch (err: unknown) { toast({ title: "Failed to remove area", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }); }
  };

  const excludeZoneArea = async (zone: number, area: string) => {
    setLoadingZones(true);
    try {
      const res = await fetch("/api/zones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone, area, isExcluded: true }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      // Reload custom zones so the exclusion appears
      const zonesRes = await fetch("/api/zones");
      const zonesData = await zonesRes.json();
      if (Array.isArray(zonesData)) setCustomZones(zonesData);
      toast({ title: `"${area}" excluded from Zone ${zone}` });
    } catch (err: unknown) {
      toast({ title: "Failed to exclude area", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setLoadingZones(false); }
  };

  const restoreZoneArea = async (id: string, area: string, zone: number) => {
    try {
      const res = await fetch("/api/zones", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setCustomZones(prev => prev.filter(z => z.id !== id));
      toast({ title: `"${area}" restored to Zone ${zone}` });
    } catch (err: unknown) {
      toast({ title: "Failed to restore area", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const toggleZoneEnabled = async (zone: number, enabled: boolean) => {
    const newDisabled = enabled
      ? disabledZones.filter(z => z !== zone)
      : [...disabledZones.filter(z => z !== zone), zone];
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabledZones: JSON.stringify(newDisabled) }) });
      if (!res.ok) throw new Error("Failed");
      setDisabledZones(newDisabled);
      // Also update user zone override if exists
      const existingOverride = userZones.find(uz => uz.zoneId === zone);
      if (existingOverride) {
        await fetch("/api/user-zones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zoneId: zone, isEnabled: enabled }) });
      }
      const zoneName = userZones.find(uz => uz.zoneId === zone)?.name || ZONES[zone]?.name || `Zone ${zone}`;
      toast({ title: `${zoneName} ${enabled ? "enabled" : "disabled"}` });
    } catch {
      toast({ title: "Failed to update zone", variant: "destructive" });
    }
  };

  const renameZone = async (zoneId: number, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/user-zones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zoneId, name: newName.trim() }) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setUserZones(prev => {
        const existing = prev.find(uz => uz.zoneId === zoneId);
        if (existing) return prev.map(uz => uz.zoneId === zoneId ? { ...uz, name: newName.trim() } : uz);
        return [...prev, { id: data.id, zoneId, name: newName.trim(), region: ZONES[zoneId]?.region || "Custom", isCustom: false, isEnabled: true, areas: [], order: 0 }];
      });
      setEditingZoneId(null);
      toast({ title: `Zone renamed to "${newName.trim()}"` });
    } catch {
      toast({ title: "Failed to rename zone", variant: "destructive" });
    }
  };

  const createCustomZone = async () => {
    const region = newZoneNewRegion.trim() || newZoneRegion;
    if (!newZoneName.trim() || !region) return;
    const areas = newZoneAreas.split(",").map(a => a.trim().toLowerCase()).filter(a => a.length >= 2);
    try {
      const res = await fetch("/api/user-zones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newZoneName.trim(), region, areas, isCustom: true }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setUserZones(prev => [...prev, { id: data.id, zoneId: data.zoneId, name: data.name, region: data.region, isCustom: true, isEnabled: true, areas, order: data.order }]);
      setShowCreateZone(false);
      setNewZoneName("");
      setNewZoneRegion("");
      setNewZoneNewRegion("");
      setNewZoneAreas("");
      toast({ title: `Zone "${data.name}" created in ${region}` });
    } catch (err: unknown) {
      toast({ title: "Failed to create zone", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const deleteCustomZone = async (zoneId: number) => {
    try {
      const res = await fetch("/api/user-zones", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zoneId }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setUserZones(prev => prev.filter(uz => uz.zoneId !== zoneId));
      setCustomZones(prev => prev.filter(z => z.zone !== zoneId));
      toast({ title: "Custom zone deleted" });
    } catch (err: unknown) {
      toast({ title: "Failed to delete zone", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  // Build the full zone list for display (built-in + custom)
  const allZones = useMemo(() => {
    const result: { zoneId: number; name: string; region: string; isCustom: boolean; isBuiltIn: boolean; color: string; bgColor: string; borderColor: string }[] = [];
    // Add built-in zones
    for (const [num, z] of Object.entries(ZONES)) {
      const zoneId = parseInt(num);
      const override = userZones.find(uz => uz.zoneId === zoneId);
      result.push({
        zoneId,
        name: override?.name || z.name,
        region: override?.region || z.region,
        isCustom: false,
        isBuiltIn: true,
        color: z.color,
        bgColor: z.bgColor,
        borderColor: z.borderColor,
      });
    }
    // Add custom zones
    for (const uz of userZones.filter(uz => uz.isCustom)) {
      const colorIdx = result.length;
      const zc = getZoneColor(colorIdx);
      result.push({
        zoneId: uz.zoneId,
        name: uz.name,
        region: uz.region,
        isCustom: true,
        isBuiltIn: false,
        color: zc.color,
        bgColor: zc.bgColor,
        borderColor: zc.borderColor,
      });
    }
    return result;
  }, [userZones]);

  // Get unique regions in display order
  const allRegions = useMemo(() => {
    const regions = new Map<string, number>();
    // Built-in regions first (in ZONES order)
    for (const z of Object.values(ZONES)) {
      if (!regions.has(z.region)) regions.set(z.region, regions.size);
    }
    // Custom regions
    for (const uz of userZones.filter(uz => uz.isCustom)) {
      if (!regions.has(uz.region)) regions.set(uz.region, regions.size);
    }
    return Array.from(regions.keys());
  }, [userZones]);

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {/* ====== IMPORT / EXPORT (open by default) ====== */}
      <div className="rounded-xl border border-orange-500/20 bg-card overflow-hidden">
        <button onClick={() => toggleSection("import-export")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-orange-400" />Import & Export</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("import-export") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("import-export") && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/5">
            {/* Encore Import */}
            <div className="pt-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileUp className="h-4 w-4 text-orange-400" />Import from Encore</h4>
              <p className="text-xs text-muted-foreground mb-2">Upload CSV from Encore. Format: Order #, Client name, Address, Special Note. Duplicates auto-skipped.</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept=".csv" onChange={handleEncoreImport} className="hidden" disabled={importing} />
                  <Button variant="outline" className="gap-2 h-11 border-orange-500/30 text-orange-400 hover:bg-orange-500/15 px-4 py-3" disabled={importing} asChild>
                    <span>
                      {importing ? <><RotateCcw className="h-3 w-3 animate-spin" />Importing...</> : <><FileUp className="h-3 w-3" />Choose Encore CSV</>}
                    </span>
                  </Button>
                </label>
                <Button onClick={downloadTemplate} variant="outline" className="gap-2 h-11 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/15 px-4 py-3"><FileSpreadsheet className="h-3 w-3" />Download Template</Button>
              </div>
              {importResult && (
                <div className={`rounded-lg border p-3 text-xs flex gap-2 mt-2 ${importResult.imported > 0 ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                  {importResult.imported > 0 ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-semibold">Import Result</p>
                    <p>✅ {importResult.imported} orders imported</p>
                    {importResult.skipped > 0 && <p>⏭️ {importResult.skipped} duplicates skipped</p>}
                    {importResult.errors > 0 && <p className="text-destructive">❌ {importResult.errors} errors</p>}
                  </div>
                </div>
              )}
            </div>
            <Separator className="bg-white/5" />
            {/* Zeo Export */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileDown className="h-4 w-4 text-primary" />Export to Zeo Route Planner</h4>
              <p className="text-xs text-muted-foreground mb-2">Export scheduled orders as XLSX. Order ID in Customer name column for easy identification.</p>
              <div className="flex items-center gap-3">
                <Input type="date" id="zeo-export-date" className="h-11 w-auto bg-white/5 border-white/10" defaultValue={new Date().toISOString().split("T")[0]} />
                <Button onClick={() => {
                  const input = document.getElementById("zeo-export-date") as HTMLInputElement;
                  if (input?.value) handleZeoExport(input.value);
                }} disabled={exporting} className="gap-2 h-11 bg-muted hover:bg-muted/80 text-foreground px-4 py-3">
                  {exporting ? <><RotateCcw className="h-3 w-3 animate-spin" />Exporting...</> : <><FileDown className="h-3 w-3" />Export XLSX</>}
                </Button>
              </div>
            </div>
            <Separator className="bg-white/5" />
          </div>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <button onClick={() => toggleSection("scheduling")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Scheduling</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("scheduling") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("scheduling") && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/5">
            {/* Capacity info */}
            <div className="pt-3">
              <h4 className="text-sm font-semibold mb-2">Daily Capacity</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2"><p className="text-lg font-bold text-emerald-400">1</p><p className="text-[0.625rem] text-muted-foreground">Small (S)</p></div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2"><p className="text-lg font-bold text-amber-400">2</p><p className="text-[0.625rem] text-muted-foreground">Medium (M)</p></div>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2"><p className="text-lg font-bold text-rose-400">3</p><p className="text-[0.625rem] text-muted-foreground">Large (L)</p></div>
              </div>
              <p className="text-xs text-center mt-2 font-semibold">Max {MAX_DAILY_POINTS} points/day</p>
              <p className="text-[0.625rem] text-center text-muted-foreground">Every day is a working day. Only OFF DAYS block scheduling. Office pickups are not scheduled on weekends and public holidays.</p>
            </div>
            <Separator className="bg-white/5" />
            {/* Public Holidays */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><AlertCircle className="h-4 w-4 text-amber-400" />Public Holidays</h4>
              <form onSubmit={addHoliday} className="flex gap-2 flex-wrap mb-2">
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-10 w-auto text-xs bg-white/5 border-white/10" required />
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Holiday name" className="h-10 flex-1 min-w-[120px] text-xs bg-white/5 border-white/10" required />
                <Button type="submit" size="sm" className="gap-1 h-10 px-3"><Plus className="h-3 w-3" />Add</Button>
              </form>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {holidays.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No holidays set</p>}
                {holidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5">
                    <span className="text-xs"><span className="font-medium">{h.name}</span> <span className="text-muted-foreground ml-2">{format(parseISO(h.date), "dd MMM yyyy (EEE)")}</span></span>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/15" onClick={() => deleteHoliday(h.id)}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>
            <Separator className="bg-white/5" />
            {/* OFF Days */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Home className="h-4 w-4 text-rose-400" />OFF Days</h4>
              <p className="text-[0.625rem] text-muted-foreground mb-2">No scheduling on these days. Working days are every day — only OFF DAYS block scheduling.</p>
              <form onSubmit={addOffDay} className="flex gap-2 flex-wrap mb-2">
                <Input type="date" value={offDayDate} onChange={e => setOffDayDate(e.target.value)} className="h-10 w-auto text-xs bg-white/5 border-white/10" required />
                <Input value={offDayReason} onChange={e => setOffDayReason(e.target.value)} placeholder="Reason (optional)" className="h-10 flex-1 min-w-[120px] text-xs bg-white/5 border-white/10" />
                <Button type="submit" size="sm" className="gap-1 h-10 px-3" disabled={loadingOffDays || !offDayDate}><Plus className="h-3 w-3" />Add</Button>
              </form>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {offDays.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No OFF days set</p>}
                {offDays.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5">
                    <span className="text-xs">
                      <span className="font-medium text-rose-300">OFF</span>
                      <span className="text-muted-foreground ml-2">{format(parseISO(o.date), "dd MMM yyyy (EEE)")}</span>
                      {o.reason && <span className="text-muted-foreground ml-2 text-[0.625rem]">({o.reason})</span>}
                    </span>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/15" onClick={() => deleteOffDay(o.id)}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>
            <Separator className="bg-white/5" />
            {/* ERTHBOX Manager */}
            <ErthboxManagerSection />
          </div>
        )}
      </div>

      {/* ====== ZONE MAP ====== */}
      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <button onClick={() => toggleSection("zone-map")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><Layers className="h-5 w-5 text-primary" />Zone Map</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("zone-map") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("zone-map") && (
          <div className="px-4 pb-4 border-t border-white/5">
            {/* Create Zone button */}
            <div className="flex items-center justify-between pt-3 mb-2">
              <p className="text-[0.625rem] text-muted-foreground">Manage mini zones within each state. Click zone name to rename.</p>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[0.625rem] border-primary/30 text-primary hover:bg-primary/10" onClick={() => setShowCreateZone(!showCreateZone)}>
                <PlusCircle className="h-3 w-3" />{showCreateZone ? "Cancel" : "New Zone"}
              </Button>
            </div>

            {/* Create Zone Form */}
            {showCreateZone && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-3 space-y-2">
                <p className="text-xs font-semibold text-primary">Create Custom Zone</p>
                <Input value={newZoneName} onChange={e => setNewZoneName(e.target.value)} placeholder="Zone name (e.g. KL South)" className="h-8 text-xs bg-white/5 border-white/10" />
                <div className="flex gap-2">
                  <Select value={newZoneRegion} onValueChange={setNewZoneRegion}>
                    <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 flex-1"><SelectValue placeholder="Select state..." /></SelectTrigger>
                    <SelectContent>
                      {allRegions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      <SelectItem value="__new__">+ New state...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newZoneRegion === "__new__" && (
                  <Input value={newZoneNewRegion} onChange={e => setNewZoneNewRegion(e.target.value)} placeholder="New state name (e.g. Perlis)" className="h-8 text-xs bg-white/5 border-white/10" />
                )}
                <Input value={newZoneAreas} onChange={e => setNewZoneAreas(e.target.value)} placeholder="Areas (comma-separated, e.g. area1, area2, area3)" className="h-8 text-xs bg-white/5 border-white/10" />
                <Button size="sm" className="h-8 gap-1 text-xs w-full" onClick={createCustomZone} disabled={!newZoneName.trim() || (!newZoneRegion && !newZoneNewRegion.trim())}>
                  <PlusCircle className="h-3 w-3" />Create Zone
                </Button>
              </div>
            )}

            {/* Zone groups by region */}
            {allRegions.map(region => {
              const zonesInRegion = allZones.filter(z => z.region === region);
              if (zonesInRegion.length === 0) return null;
              return (
                <div key={region} className="mt-3 first:mt-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{region}</h4>
                    <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-white/10">{zonesInRegion.length} zone{zonesInRegion.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="space-y-2">
                    {zonesInRegion.map(az => {
                      const isExpanded = expandedZones.has(az.zoneId);
                      const isDisabled = disabledZones.includes(az.zoneId);
                      const isCustomZone = az.isCustom;
                      const zoneCustoms = customZones.filter(c => c.zone === az.zoneId);
                      const zoneExclusions = zoneCustoms.filter(c => c.isExcluded);
                      const excludedAreas = new Set(zoneExclusions.map(c => c.area.toLowerCase()));
                      // Get areas: for built-in zones, use ZONES definition; for custom, use userZones data
                      const customZoneData = userZones.find(uz => uz.zoneId === az.zoneId);
                      const builtInAreas = ZONES[az.zoneId]?.areas || [];
                      const customZoneAreas = customZoneData?.areas || [];
                      const allBuiltInAreas = isCustomZone ? customZoneAreas : builtInAreas;
                      const visibleAreas = allBuiltInAreas.filter(a => !excludedAreas.has(a.toLowerCase()));
                      const isEditing = editingZoneId === az.zoneId;
                      return (
                        <div key={az.zoneId} className={`rounded-lg border ${isDisabled ? "border-white/5 opacity-50" : az.borderColor || "border-white/10"}`}>
                          <div className={`w-full flex items-center justify-between p-2.5 text-left ${isDisabled ? "bg-white/5" : az.bgColor || "bg-white/5"}`}>
                            <button onClick={() => toggleZone(az.zoneId)} className="flex-1 text-left min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isEditing ? (
                                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                    <Input
                                      value={editingZoneName}
                                      onChange={e => setEditingZoneName(e.target.value)}
                                      className="h-6 text-xs w-32 bg-white/5 border-white/10"
                                      autoFocus
                                      onKeyDown={e => { if (e.key === "Enter") renameZone(az.zoneId, editingZoneName); if (e.key === "Escape") setEditingZoneId(null); }}
                                    />
                                    <Button size="sm" variant="ghost" className="h-6 px-1 text-[0.625rem] text-emerald-400 hover:text-emerald-300" onClick={() => renameZone(az.zoneId, editingZoneName)}>✓</Button>
                                    <Button size="sm" variant="ghost" className="h-6 px-1 text-[0.625rem] text-destructive hover:text-destructive/80" onClick={() => setEditingZoneId(null)}>✕</Button>
                                  </div>
                                ) : (
                                  <span
                                    className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors"
                                    onClick={(e) => { e.stopPropagation(); setEditingZoneId(az.zoneId); setEditingZoneName(az.name); }}
                                    title="Click to rename"
                                  >
                                    {az.name}
                                  </span>
                                )}
                                {isCustomZone && <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-primary/30 text-primary">Custom</Badge>}
                                {isDisabled && <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-destructive/30 text-destructive">Off</Badge>}
                                <span className="text-[0.625rem] text-muted-foreground">({visibleAreas.length} areas{zoneExclusions.length > 0 ? `, ${zoneExclusions.length} excluded` : ""}{zoneCustoms.filter(c => !c.isExcluded).length > 0 ? `, +${zoneCustoms.filter(c => !c.isExcluded).length} custom` : ""})</span>
                              </div>
                            </button>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isCustomZone && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive/50 hover:text-destructive" onClick={() => deleteCustomZone(az.zoneId)} title="Delete custom zone"><Trash2 className="h-3 w-3" /></Button>
                              )}
                              <Switch
                                checked={!isDisabled}
                                onCheckedChange={(checked) => toggleZoneEnabled(az.zoneId, checked)}
                                className="scale-75"
                              />
                              <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="p-2.5 space-y-1.5 border-t border-white/5">
                              {/* Active areas */}
                              <div className="flex flex-wrap gap-0.5">
                                {visibleAreas.map((area, i) => (
                                  <span key={i} className="group text-[0.625rem] bg-white/5 border border-white/10 rounded px-1 py-0.5 text-muted-foreground inline-flex items-center gap-0.5 hover:bg-white/10 transition-colors">
                                    {area}
                                    <button onClick={() => excludeZoneArea(az.zoneId, area)} className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity ml-0.5"><X className="h-2 w-2" /></button>
                                  </span>
                                ))}
                              </div>
                              {/* Excluded areas with restore button */}
                              {zoneExclusions.length > 0 && (
                                <div className="mt-1">
                                  <p className="text-[0.625rem] text-muted-foreground mb-0.5 flex items-center gap-1"><MapPinOff className="h-2.5 w-2.5" />Excluded</p>
                                  <div className="flex flex-wrap gap-0.5">
                                    {zoneExclusions.map(c => (
                                      <span key={c.id} className="group text-[0.625rem] bg-destructive/10 border border-destructive/20 rounded px-1 py-0.5 text-destructive/70 inline-flex items-center gap-0.5 hover:bg-destructive/15 transition-colors">
                                        <s>{c.area}</s>
                                        <button onClick={() => restoreZoneArea(c.id, c.area, az.zoneId)} className="opacity-0 group-hover:opacity-100 hover:text-emerald-400 transition-opacity ml-0.5" title="Restore area"><Undo2 className="h-2.5 w-2.5" /></button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Custom-added areas with delete button */}
                              {zoneCustoms.filter(c => !c.isExcluded).length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {zoneCustoms.filter(c => !c.isExcluded).map(c => (
                                    <span key={c.id} className="text-[0.625rem] bg-primary/10 border border-primary/20 rounded px-1 py-0.5 text-primary inline-flex items-center gap-0.5">
                                      {c.area}
                                      <button onClick={() => deleteZoneArea(c.id)} className="hover:text-destructive ml-0.5"><X className="h-2 w-2" /></button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Add area input */}
                              <div className="flex items-center gap-2 mt-1">
                                <Input
                                  value={newZoneArea[az.zoneId] || ""}
                                  onChange={e => setNewZoneArea(prev => ({ ...prev, [az.zoneId]: e.target.value }))}
                                  placeholder="Add area..."
                                  className="h-8 text-xs bg-white/5 border-white/10 flex-1"
                                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addZoneArea(az.zoneId); } }}
                                />
                                <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => addZoneArea(az.zoneId)} disabled={loadingZones || !newZoneArea[az.zoneId]?.trim()}>
                                  <Plus className="h-3 w-3" />Add
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* AI Zone Suggestions */}
            {aiZoneSuggestions.length > 0 && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-primary">AI Zone Suggestions</span>
                  <Badge className="bg-primary/10 text-primary border-primary/30 text-[0.625rem]">{aiZoneSuggestions.length}</Badge>
                </div>
                <p className="text-[0.625rem] text-muted-foreground mb-2">New areas discovered from orders. Review and approve to add them to zones.</p>
                <div className="space-y-2">
                  {aiZoneSuggestions.map(s => (
                    <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.75rem] font-medium truncate">{s.description}</p>
                        <p className="text-[0.625rem] text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => approveZoneSuggestion(s.id)} className="h-8 w-8 p-0 text-emerald-400 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => rejectZoneSuggestion(s.id)} className="h-8 w-8 p-0 text-destructive shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== AUDIT LOG (Admin Only) ====== */}
      {session?.user?.role === "ADMIN" && (
        <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
          <button onClick={() => toggleSection("audit-log")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
            <h3 className="font-semibold flex items-center gap-2"><Shield className="h-5 w-5 text-amber-400" />Audit Log</h3>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("audit-log") ? "rotate-90" : ""}`} />
          </button>
          {openSections.has("audit-log") && (
            <AuditLogSection />
          )}
        </div>
      )}

      {/* ====== INTEGRATIONS ====== */}
      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <button onClick={() => toggleSection("integrations")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><Route className="h-5 w-5 text-primary" />Integrations</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("integrations") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("integrations") && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/5">
            {/* Zeo Route Planner */}
            <div className="pt-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Route className="h-4 w-4 text-primary" />Zeo Route Planner</h4>
              <div className="space-y-2">
                <div><Label className="text-[0.625rem] text-muted-foreground">API Key</Label><Input value={zeoKey} onChange={e => setZeoKey(e.target.value)} placeholder="Enter Zeo API key" className="h-10 text-xs bg-white/5 border-white/10" /></div>
                <div><Label className="text-[0.625rem] text-muted-foreground">Base/Start Address</Label><Input value={zeoBase} onChange={e => setZeoBase(e.target.value)} placeholder="Your home or ERTH HQ" className="h-10 text-xs bg-white/5 border-white/10" /></div>
                <div><Label className="text-[0.625rem] text-muted-foreground">Driver ID (optional)</Label><Input value={zeoDriverId} onChange={e => setZeoDriverId(e.target.value)} placeholder="Auto-detected from API" className="h-10 text-xs bg-white/5 border-white/10" /></div>
                <Button onClick={saveSettings} disabled={saving} className="gap-2 h-10 bg-primary hover:bg-primary/90 text-white px-4">{saving ? "Saving..." : "Save Settings"}</Button>
                <p className="text-[0.625rem] text-muted-foreground">Get your API key from <a href="https://zeorouteplanner.com/app/team/settings/genrate-token" target="_blank" rel="noopener" className="text-primary underline">Zeo Settings</a></p>
              </div>
            </div>
            <Separator className="bg-white/5" />
            {/* Google Sheets */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><ClipboardList className="h-4 w-4 text-emerald-400" />Google Sheets Sync</h4>
              <div className="space-y-2">
                <div><Label className="text-[0.625rem] text-muted-foreground">Spreadsheet ID</Label><Input value={sheetsId} onChange={e => setSheetsId(e.target.value)} placeholder="From the Google Sheets URL" className="h-10 text-xs bg-white/5 border-white/10" /></div>
                <div><Label className="text-[0.625rem] text-muted-foreground">Service Account JSON (one-time)</Label><Textarea value={sheetsCreds} onChange={e => setSheetsCreds(e.target.value)} placeholder='{"type":"service_account","project_id":"..."}' className="h-20 text-[0.625rem] font-mono bg-white/5 border-white/10" /></div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => handleSheetsSync("sync")} disabled={syncing} variant="outline" className="gap-2 h-10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15 px-3 text-xs"><Upload className="h-3 w-3" />{syncing ? "Syncing..." : "Push to Sheets"}</Button>
                  <Button onClick={() => handleSheetsSync("import")} disabled={syncing} variant="outline" className="gap-2 h-10 border-primary/30 text-primary hover:bg-primary/15 px-3 text-xs"><Download className="h-3 w-3" />Import from Sheets</Button>
                </div>
                <details className="text-[0.625rem] text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground transition-colors">Setup Instructions</summary>
                  <ol className="list-decimal ml-3 mt-1 space-y-0.5">
                    <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener" className="underline">Google Cloud Console</a></li>
                    <li>Create a project → Enable Google Sheets API</li>
                    <li>Create Service Account → Download JSON key</li>
                    <li>Share your spreadsheet with the service account email</li>
                    <li>Paste the Spreadsheet ID and JSON above</li>
                  </ol>
                </details>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====== WHATSAPP ====== */}
      <div className="rounded-xl border border-emerald-500/20 bg-card overflow-hidden">
        <button onClick={() => toggleSection("whatsapp")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-400" />WhatsApp</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[0.625rem] border-emerald-500/30 text-emerald-400 px-2 py-0">{waTemplates.length} templates</Badge>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("whatsapp") ? "rotate-90" : ""}`} />
          </div>
        </button>
        {openSections.has("whatsapp") && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/5">
            {/* Phone Prefix */}
            <div className="pt-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Phone className="h-4 w-4 text-emerald-400" />Phone Settings</h4>
              <div className="space-y-2">
                <div>
                  <Label className="text-[0.625rem] text-muted-foreground">Country Code Prefix</Label>
                  <div className="flex items-center gap-2">
                    <Input value={waPhonePrefix} onChange={e => setWaPhonePrefix(e.target.value.replace(/[^0-9]/g, ""))} placeholder="60" className="h-10 w-24 text-xs bg-white/5 border-white/10" />
                    <span className="text-xs text-muted-foreground">Phone numbers will be formatted as +{waPhonePrefix}XXXXXXXX</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Templates */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold flex items-center gap-2"><StickyNote className="h-4 w-4 text-emerald-400" />Message Templates</h4>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[0.625rem] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15" onClick={() => { setWaShowCreate(true); setWaNewName(""); setWaNewMessage(""); }}>
                  <PlusCircle className="h-3 w-3" />New Template
                </Button>
              </div>
              <p className="text-[0.625rem] text-muted-foreground mb-3">Templates are pre-filled when you click the WhatsApp button on an order. You can edit the message before sending.</p>

              {/* Create New Template */}
              {waShowCreate && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-400">New Template</p>
                  <div>
                    <Label className="text-[0.625rem] text-muted-foreground">Template Name</Label>
                    <Input value={waNewName} onChange={e => setWaNewName(e.target.value)} placeholder="e.g. Follow Up" className="h-9 text-xs bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-[0.625rem] text-muted-foreground">Message (use variables like {"{customerName}"}, {"{date}"}, {"{address}"})</Label>
                    <Textarea value={waNewMessage} onChange={e => setWaNewMessage(e.target.value)} placeholder="Hi {customerName}, your pickup is scheduled for {date}..." className="min-h-[80px] text-xs bg-white/5 border-white/10" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 gap-1.5 text-[0.625rem] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={addWhatsAppTemplate}><CheckCircle className="h-3 w-3" />Create</Button>
                    <Button size="sm" variant="outline" className="h-8 text-[0.625rem] border-white/10" onClick={() => setWaShowCreate(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {/* Template List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {waTemplates.map(t => (
                  <div key={t.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    {waEditingTemplate?.id === t.id ? (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-[0.625rem] text-muted-foreground">Name</Label>
                          <Input value={waEditingTemplate.name} onChange={e => setWaEditingTemplate({ ...waEditingTemplate, name: e.target.value })} className="h-9 text-xs bg-white/5 border-white/10" />
                        </div>
                        <div>
                          <Label className="text-[0.625rem] text-muted-foreground">Message</Label>
                          <Textarea value={waEditingTemplate.message} onChange={e => setWaEditingTemplate({ ...waEditingTemplate, message: e.target.value })} className="min-h-[80px] text-xs bg-white/5 border-white/10" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-8 gap-1.5 text-[0.625rem] bg-primary hover:bg-primary/90 text-primary-foreground" onClick={updateWhatsAppTemplate}><CheckCircle className="h-3 w-3" />Save</Button>
                          <Button size="sm" variant="outline" className="h-8 text-[0.625rem] border-white/10" onClick={() => setWaEditingTemplate(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{t.name}</span>
                            {t.isDefault && <Badge className="text-[0.625rem] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Default</Badge>}
                          </div>
                          <div className="flex items-center gap-1">
                            {!t.isDefault && (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-emerald-400" onClick={() => setDefaultTemplate(t.id)} title="Set as default">
                                <Star className="h-3 w-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setWaEditingTemplate({ ...t })} title="Edit">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteWhatsAppTemplate(t.id)} title="Delete">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-[0.75rem] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{t.message}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Variable Reference */}
            <details className="text-[0.625rem] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors text-xs font-medium">Available Variables Reference</summary>
              <div className="mt-2 rounded-lg bg-white/5 border border-white/5 p-3">
                <p className="text-[0.625rem] text-muted-foreground mb-2">Use these variables in your templates. They will be auto-filled with order data when sending.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {WHATSAPP_VARIABLES.map(v => (
                    <div key={v.key} className="flex items-center gap-2">
                      <code className="text-[0.625rem] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{v.key}</code>
                      <span className="text-[0.625rem] text-muted-foreground">{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            {/* Save Button */}
            <Button onClick={saveWhatsAppSettings} disabled={saving} className="gap-2 h-10 bg-emerald-600 hover:bg-emerald-700 text-white px-4 w-full sm:w-auto">
              {saving ? <><RotateCcw className="h-3 w-3 animate-spin" />Saving...</> : <><CheckCircle className="h-4 w-4" />Save WhatsApp Settings</>}
            </Button>
          </div>
        )}
      </div>

      {/* ====== AI ASSISTANT (Admin Only) ====== */}
      {session?.user?.role === "ADMIN" && (
        <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
          <AiSettingsSection />
        </div>
      )}

      {/* ====== SECURITY (All Users) ====== */}
      <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
        <button onClick={() => setSecurityOpen(!securityOpen)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">Security</span>
            {twoFAEnabled ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[0.625rem]">2FA ON</Badge>
            ) : (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[0.625rem]">2FA OFF</Badge>
            )}
          </div>
          {securityOpen ? <X className="h-4 w-4" /> : <span className="text-muted-foreground text-xs">▶</span>}
        </button>
        {securityOpen && (
          <div className="p-4 border-t border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Two-Factor Authentication</p>
                <p className="text-[0.625rem] text-muted-foreground">Extra security with Google Authenticator</p>
              </div>
              <Badge className={twoFAEnabled ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[0.625rem]" : "bg-slate-500/15 text-emerald-100 border-slate-500/30 text-[0.625rem]"}>
                {twoFAEnabled ? "ENABLED" : "DISABLED"}
              </Badge>
            </div>

            {!twoFAEnabled && twoFASetupStep === "idle" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground space-y-1">
                  <p><strong>What is 2FA?</strong> Two-factor authentication adds an extra layer of security.</p>
                  <p>Even if someone gets your password, they can&apos;t sign in without your phone.</p>
                  <p><strong>How to set up:</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Install Google Authenticator on your phone</li>
                    <li>Click &quot;Start Setup&quot; below</li>
                    <li>Scan the QR code with the app</li>
                    <li>Enter the 6-digit code to verify</li>
                  </ol>
                </div>
                <Button onClick={handle2FASetup} disabled={twoFALoading} className="w-full bg-primary hover:bg-primary/90">
                  {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  Start 2FA Setup
                </Button>
              </div>
            )}

            {twoFASetupStep === "setup" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">1. Scan this QR code with Google Authenticator</p>
                <div className="flex justify-center">
                  {twoFAQrCode && <img src={twoFAQrCode} alt="2FA QR Code" className="w-48 h-48 rounded-lg bg-white p-2" />}
                </div>
                <div className="text-center">
                  <p className="text-[0.625rem] text-muted-foreground">Or enter this code manually:</p>
                  <code className="text-xs bg-white/5 px-2 py-1 rounded font-mono break-all">{twoFASecret}</code>
                </div>
                <Separator className="bg-white/10" />
                <p className="text-xs text-muted-foreground">2. Enter the 6-digit code from your authenticator:</p>
                <Input
                  value={twoFAVerifyCode}
                  onChange={(e) => setTwoFAVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="h-11 bg-white/5 border-white/10 text-center text-lg tracking-[0.5em] font-mono"
                  maxLength={6}
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setTwoFASetupStep("idle")} className="flex-1 border-white/10">Cancel</Button>
                  <Button onClick={handle2FAVerify} disabled={twoFAVerifyCode.length !== 6 || twoFALoading} className="flex-1 bg-primary">
                    {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Enable"}
                  </Button>
                </div>
              </div>
            )}

            {twoFASetupStep === "done" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                ✅ 2FA is now enabled! You&apos;ll need your authenticator code every time you sign in.
              </div>
            )}

            {twoFAEnabled && (
              <div className="space-y-3">
                <Separator className="bg-white/10" />
                <p className="text-xs font-medium text-destructive">Disable 2FA</p>
                <p className="text-[0.625rem] text-muted-foreground">Enter your current authenticator code to disable</p>
                <Input
                  value={twoFADisableCode}
                  onChange={(e) => setTwoFADisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter code to disable"
                  className="h-10 bg-white/5 border-white/10 text-center tracking-widest font-mono"
                  maxLength={6}
                />
                <Button variant="destructive" onClick={handle2FADisable} disabled={twoFADisableCode.length !== 6 || twoFALoading} className="w-full">
                  {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Disable 2FA
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== TUTORIAL ====== */}
      <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
        <button onClick={() => toggleSection("tutorial")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />Tutorial & Help</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("tutorial") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("tutorial") && (
          <div className="px-4 pb-4 border-t border-white/5">
            <div className="pt-3 mb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Learn how to use HERO Sidekick effectively</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-[0.625rem] border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => {
                    onReplayOnboarding?.();
                  }}
                >
                  <Play className="h-3 w-3" />Replay Onboarding
                </Button>
              </div>
            </div>
            <TutorialSection />
          </div>
        )}
      </div>

      {/* ====== CHANGELOG ====== */}
      <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
        <button onClick={() => toggleSection("changelog")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><History className="h-5 w-5 text-primary" />Changelog</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[0.625rem] border-primary/30 text-primary px-2 py-0">v1.27</Badge>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("changelog") ? "rotate-90" : ""}`} />
          </div>
        </button>
        {openSections.has("changelog") && (
          <div className="px-4 pb-4 border-t border-white/5">
            <div className="pt-3 mb-4">
              <p className="text-xs text-muted-foreground">Track what's new in HERO Sidekick. Current version: <span className="text-primary font-semibold">v1.27</span></p>
            </div>
            <div className="space-y-4">
              {CHANGELOG.map((entry, idx) => (
                <div key={entry.version} className="relative">
                  {/* Timeline line */}
                  {idx < CHANGELOG.length - 1 && (
                    <div className="absolute left-[11px] top-8 bottom-0 w-px bg-white/10" />
                  )}
                  <div className="flex gap-3">
                    {/* Version dot */}
                    <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                      idx === 0
                        ? "bg-primary/20 border-2 border-primary"
                        : "bg-white/5 border border-white/20"
                    }`}>
                      <Tag className={`h-3 w-3 ${idx === 0 ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold ${idx === 0 ? "text-primary" : "text-foreground"}`}>{entry.version}</span>
                        <span className="text-[0.625rem] text-muted-foreground">{entry.date}</span>
                        {idx === 0 && (
                          <Badge className="text-[0.625rem] px-1.5 py-0 h-4 bg-primary/20 text-primary border-primary/30">Latest</Badge>
                        )}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">{entry.title}</p>

                      {/* Highlights */}
                      <div className="mt-2 space-y-1">
                        {entry.highlights.map((h, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Sparkles className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                            <span className="text-xs text-foreground/90">{h}</span>
                          </div>
                        ))}
                      </div>

                      {/* Expandable changes */}
                      <ChangelogChanges version={entry.version} changes={entry.changes} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ CHANGELOG CHANGES (expandable) ============
function ChangelogChanges({ version, changes }: { version: string; changes: readonly string[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide details" : `${changes.length} changes`}
      </button>
      {expanded && (
        <div className="mt-1.5 pl-1 space-y-1 border-l-2 border-white/5">
          {changes.map((c, i) => (
            <div key={i} className="flex items-start gap-2 pl-3">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ USERS TAB (Admin Only) ============
function UsersTab({ onRefresh }: { onRefresh: () => void }) {
  const { data: session } = useSession();
  const { data: users, refetch } = useFetchData<ManagedUser[]>("/api/users");
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [loading, setLoading] = useState(false);

  // Add user form state
  const [addForm, setAddForm] = useState({ username: "", password: "", displayName: "", role: "HERO" as string });

  // Edit user form state
  const [editRole, setEditRole] = useState<string>("");
  const [editPassword, setEditPassword] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");

  const roleBadgeClass: Record<string, string> = {
    ADMIN: "bg-red-500/15 text-red-400 border-red-500/30",
    HERO: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    SUPPORT: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      toast({ title: `User "${addForm.username}" created`, description: `Role: ${addForm.role}` });
      setAddForm({ username: "", password: "", displayName: "", role: "HERO" });
      setShowAddDialog(false);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to create user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (user: ManagedUser) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      toast({ title: user.isActive ? "User deactivated" : "User activated", description: `${user.username} is now ${user.isActive ? "inactive" : "active"}` });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to update status", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      toast({ title: "User deleted" });
      setShowDeleteConfirm(null);
      refetch();
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Failed to delete user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {};
      if (editRole && editRole !== selectedUser.role) body.role = editRole;
      if (editPassword) body.password = editPassword;
      if (editDisplayName && editDisplayName !== selectedUser.displayName) body.displayName = editDisplayName;

      if (Object.keys(body).length === 0) {
        toast({ title: "No changes to save" });
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      toast({ title: "User updated" });
      setShowEditDialog(false);
      setSelectedUser(null);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to update user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (user: ManagedUser) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditPassword("");
    setEditDisplayName(user.displayName);
    setShowEditDialog(true);
  };

  const allUsers = users || [];
  const pendingUsers = allUsers.filter(u => !u.isApproved);
  const activeUsers = allUsers.filter(u => u.isApproved);
  const sortedUsers = [...pendingUsers, ...activeUsers];

  const handleApproveUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isApproved: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve user");
      toast({ title: "User approved", description: `${data.username} can now sign in` });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to approve user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject user");
      toast({ title: "User registration rejected" });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to reject user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-400" />User Management
          {pendingUsers.length > 0 && (
            <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-400">
              {pendingUsers.length} pending
            </span>
          )}
        </h3>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground h-10 px-4">
          <UserPlus className="h-4 w-4" />Create User
        </Button>
      </div>

      {sortedUsers.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-8 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No users found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedUsers.map(user => {
            const isSelf = user.id === session?.user?.id;
            const isPending = !user.isApproved;
            return (
              <div key={user.id} className={`rounded-xl border bg-card p-4 ${isPending ? "border-amber-500/20" : !user.isActive ? "border-red-500/20 opacity-60" : "border-white/10"}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                      user.role === "ADMIN" ? "bg-red-500/20 text-red-400" :
                      user.role === "SUPPORT" ? "bg-blue-500/20 text-blue-400" :
                      "bg-emerald-500/20 text-emerald-400"
                    }`}>
                      {user.displayName?.charAt(0)?.toUpperCase() || user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{user.displayName || user.username}</span>
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.625rem] font-semibold ${roleBadgeClass[user.role] || ""}`}>
                          {user.role}
                        </span>
                        {isPending && (
                          <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-400">
                            PENDING
                          </span>
                        )}
                        {!user.isActive && !isPending && (
                          <span className="inline-flex items-center rounded-md border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-red-400">
                            INACTIVE
                          </span>
                        )}
                        {isSelf && (
                          <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary">
                            YOU
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">@{user.username} &middot; {user._count.orders} orders &middot; {user._count.sosRequests} SOS &middot; {format(parseISO(user.createdAt), "dd MMM yyyy")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(user)} className="gap-1 h-8 px-2.5 text-xs border-white/10 bg-white/5 hover:bg-white/10">
                      <UserCog className="h-3 w-3" />Edit
                    </Button>
                    {isPending ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApproveUser(user.id)}
                          disabled={isSelf}
                          className="gap-1 h-8 px-2.5 text-xs border-white/10 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3" />Approve
                        </Button>
                        {!isSelf && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectUser(user.id)}
                            className="gap-1 h-8 px-2.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20"
                          >
                            <Trash2 className="h-3 w-3" />Reject
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(user)}
                          disabled={isSelf}
                          className={`gap-1 h-8 px-2.5 text-xs border-white/10 ${user.isActive ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20"}`}
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        {!isSelf && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDeleteConfirm(user.id)}
                            className="gap-1 h-8 px-2.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Delete confirmation */}
                {showDeleteConfirm === user.id && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-red-300">Delete <strong>{user.username}</strong> and all their data? This cannot be undone.</p>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(null)} className="h-8 text-xs border-white/10">Cancel</Button>
                      <Button size="sm" onClick={() => handleDeleteUser(user.id)} className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white">Delete</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-background border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" />Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Username *</Label>
              <Input value={addForm.username} onChange={e => setAddForm({...addForm, username: e.target.value})} placeholder="username" className="h-11 bg-white/5 border-white/10" required minLength={3} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Password *</Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm({...addForm, password: e.target.value})} placeholder="••••••••" className="h-11 bg-white/5 border-white/10" required minLength={4} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Display Name</Label>
              <Input value={addForm.displayName} onChange={e => setAddForm({...addForm, displayName: e.target.value})} placeholder="Full name" className="h-11 bg-white/5 border-white/10" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role *</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm({...addForm, role: v})}>
                <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HERO">HERO - Field pickup driver</SelectItem>
                  <SelectItem value="SUPPORT">SUPPORT - Assign & manage orders</SelectItem>
                  <SelectItem value="ADMIN">ADMIN - Full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="border-white/10">Cancel</Button>
              <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {loading ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-background border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-primary" />Edit User: {selectedUser?.username}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Display Name</Label>
                <Input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} placeholder="Display name" className="h-11 bg-white/5 border-white/10" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HERO">HERO</SelectItem>
                    <SelectItem value="SUPPORT">SUPPORT</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Key className="h-3 w-3" />Change Password</Label>
                <Input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Leave empty to keep current" className="h-11 bg-white/5 border-white/10" minLength={editPassword ? 4 : undefined} />
                <p className="text-[0.625rem] text-muted-foreground mt-1">Minimum 4 characters. Leave empty to keep the current password.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowEditDialog(false); setSelectedUser(null); }} className="border-white/10">Cancel</Button>
                <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ LOGIN PAGE ============
function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (isRegister) {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, displayName: displayName || username }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        setRegisterSuccess(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Registration failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      // Step 1: If we haven't checked 2FA yet, check if this account requires it
      if (!requires2FA) {
        const checkRes = await fetch("/api/auth/check-2fa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        const checkData = await checkRes.json();

        if (checkData.requires2FA) {
          // Account has 2FA — show the code input, don't call signIn yet
          setRequires2FA(true);
          setLoading(false);
          return;
        }
      }

      // Step 2: Call signIn (with TOTP if 2FA is required)
      const result = await signIn("credentials", {
        username,
        password,
        totp: requires2FA ? totpCode : undefined,
        redirect: false,
      });

      if (result?.error) {
        if (requires2FA) {
          setError("Invalid 2FA code. Please try again.");
        } else {
          setError("Invalid username or password, or your account may be pending admin approval");
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister(prev => !prev);
    setError("");
    setRegisterSuccess(false);
    setRequires2FA(false);
    setTotpCode("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="HERO Sidekick" className="h-16 w-16 rounded-2xl mx-auto mb-4 earth-glow" />
          <h1 className="text-2xl font-bold">HERO Sidekick</h1>
          <p className="text-sm text-muted-foreground mt-1">ERTH Pickup Automation</p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-white/10 bg-card earth-glow p-6">
          <h2 className="text-lg font-semibold mb-4">{isRegister ? "Create Account" : "Sign In"}</h2>

          {registerSuccess && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 mb-4 text-sm text-emerald-300">
              Account created! An admin needs to approve your account before you can sign in.
              <div className="mt-2 pt-2 border-t border-emerald-500/20 text-xs text-emerald-400/80">
                <strong>💡 Security Tip:</strong> After signing in, enable 2FA in Settings → Security for extra account protection with Google Authenticator.
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 mb-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {!registerSuccess && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <Label className="text-xs text-muted-foreground">Display Name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    className="h-11 bg-white/5 border-white/10"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Username</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-username"
                  className="h-11 bg-white/5 border-white/10"
                  required
                  minLength={3}
                  disabled={requires2FA}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 bg-white/5 border-white/10"
                  required
                  minLength={4}
                  disabled={requires2FA}
                />
              </div>
              {requires2FA && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs text-primary font-medium flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      2FA Required — Enter your authenticator code
                    </p>
                  </div>
                  <Input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="h-12 bg-white/5 border-white/10 text-center text-xl tracking-[0.5em] font-mono"
                    required
                    maxLength={6}
                    autoFocus
                  />
                  <p className="text-[0.625rem] text-muted-foreground">Open Google Authenticator and enter the 6-digit code</p>
                  <button
                    type="button"
                    onClick={() => { setRequires2FA(false); setTotpCode(""); setError(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <ChevronLeft className="h-3 w-3" />Back to sign in
                  </button>
                </div>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground text-base"
              >
                {loading ? "Please wait..." : isRegister ? "Create Account" : requires2FA ? "Verify & Sign In" : "Sign In"}
              </Button>
            </form>
          )}

          <div className="mt-4 text-center">
            {!registerSuccess && (
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-primary hover:underline"
              >
                {isRegister ? "Already have an account? Sign in" : "Don't have an account? Register"}
              </button>
            )}
            {registerSuccess && (
              <Button
                variant="outline"
                onClick={() => { setIsRegister(false); setRegisterSuccess(false); setUsername(""); setPassword(""); setDisplayName(""); }}
                className="mt-2 border-white/10 bg-white/5"
              >
                Back to Sign In
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          New accounts require admin approval before sign-in
        </p>
      </div>
    </div>
  );
}

// ============ NOTIFICATION BELL ============
function NotificationBell({ session, onOpen }: { session: { user?: { id?: string; name?: string; role?: string } } | null; onOpen: () => void }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session) return;
    const fetchUnread = () => {
      fetch("/api/notifications?limit=50").then(r => r.ok ? r.json() : null).then(d => {
        if (d?.notifications) {
          setUnreadCount(d.notifications.filter((n: NotificationItem) => !n.isRead).length);
        }
      }).catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <button
      onClick={onOpen}
      className="relative h-12 w-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/30 transition-colors shadow-lg"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 text-[0.625rem] text-white items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>
        </span>
      )}
    </button>
  );
}

// ============ NOTIFICATION DRAWER ============
function NotificationDrawer({ open, onClose, session, onNavigate }: { open: boolean; onClose: () => void; session: { user?: { id?: string; name?: string; role?: string } } | null; onNavigate?: (target: "ai" | "chat" | "orders" | "notifications") => void }) {
  const [activeTab, setActiveTab] = useState<"system" | "normal">("system");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    fetch(`/api/notifications?type=${activeTab}&limit=50`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.notifications) { setNotifications(d.notifications); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, session, activeTab]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isRead: true }) });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    for (const n of unread) {
      await markAsRead(n.id);
    }
  };

  const getIcon = (type: string, title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes("sos")) return <Siren className="h-4 w-4 text-red-400" />;
    if (lower.includes("role") || lower.includes("account")) return <Shield className="h-4 w-4 text-amber-400" />;
    if (lower.includes("mention")) return <AtSign className="h-4 w-4 text-primary" />;
    if (lower.includes("order")) return <ClipboardList className="h-4 w-4 text-emerald-400" />;
    if (type === "system") return <AlertCircle className="h-4 w-4 text-amber-400" />;
    return <Bell className="h-4 w-4 text-primary" />;
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="bg-background border-white/10 h-full sm:h-[70vh] sm:max-w-lg mx-auto rounded-t-2xl">
        <SheetHeader className="pb-2 safe-top">
          <SheetTitle className="text-foreground flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />Notifications
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">Stay updated with system and chat notifications</SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab("system")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeTab === "system" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-transparent"}`}
          >
            <AlertCircle className="h-3 w-3 inline mr-1" />System
          </button>
          <button
            onClick={() => setActiveTab("normal")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeTab === "normal" ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-transparent"}`}
          >
            <Bell className="h-3 w-3 inline mr-1" />Notifications
          </button>
          {notifications.some(n => !n.isRead) && (
            <button onClick={markAllRead} className="ml-auto text-[0.625rem] text-primary hover:underline">Mark all read</button>
          )}
        </div>
        <ScrollArea className="flex-1 h-[calc(70vh-140px)]">
          {loading && notifications.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No {activeTab} notifications
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {notifications.map(n => {
                const lower = (n.title + " " + n.message).toLowerCase();
                const navigateTo = () => {
                  markAsRead(n.id);
                  onClose();
                  if (!onNavigate) return;
                  if (lower.includes("summary") || lower.includes("daily")) onNavigate("ai");
                  else if (lower.includes("sos")) onNavigate("orders");
                  else if (lower.includes("mention") || lower.includes("chat")) onNavigate("chat");
                };
                return (
                <button
                  key={n.id}
                  onClick={navigateTo}
                  className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-white/5 ${!n.isRead ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">{getIcon(n.type, n.title)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{n.title}</span>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[0.625rem] text-muted-foreground/60 mt-1">{format(parseISO(n.createdAt), "dd MMM yyyy HH:mm")}</p>
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ============ CHAT BUBBLE ============
function ChatBubble({ session, onOpen }: { session: { user?: { id?: string; name?: string; role?: string } } | null; onOpen: () => void }) {
  const [hasNew, setHasNew] = useState(false);
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const pollNew = () => {
      fetch("/api/chat?limit=1").then(r => r.ok ? r.json() : null).then(msgs => {
        if (msgs && msgs.length > 0) {
          const latestId = msgs[0].id;
          if (lastSeenIdRef.current && latestId !== lastSeenIdRef.current && msgs[0].userId !== session.user?.id) {
            setHasNew(true);
          }
          if (!lastSeenIdRef.current) lastSeenIdRef.current = latestId;
        }
      }).catch(() => {});
    };
    pollNew();
    const interval = setInterval(pollNew, 10000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <button
      onClick={() => { setHasNew(false); onOpen(); }}
      className="relative h-12 w-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/30 transition-colors shadow-lg"
      aria-label="Chat"
    >
      <MessageCircle className="h-5 w-5" />
      {hasNew && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 text-[0.625rem] text-white items-center justify-center font-bold">!</span>
        </span>
      )}
    </button>
  );
}

// ============ CHAT DRAWER ============
function ChatDrawer({ open, onClose, session, aiEnabled, initialMode }: { open: boolean; onClose: () => void; session: { user?: { id?: string; name?: string; role?: string; username?: string } } | null; aiEnabled: boolean; initialMode?: "team" | "ai" }) {
  const [chatMode, setChatMode] = useState<"team" | "ai">("team");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMsgIdRef = useRef<string | undefined>(undefined);
  const { toast } = useToast();

  // When the drawer opens with an initialMode (from a deep link), switch to it.
  useEffect(() => {
    if (open && initialMode) setChatMode(initialMode);
  }, [open, initialMode]);

  const isAdmin = session?.user?.role === "ADMIN";

  // Sync lastMsgIdRef with messages
  useEffect(() => {
    lastMsgIdRef.current = messages.length > 0 ? messages[messages.length - 1].id : undefined;
  }, [messages]);

  // Load users for @mention
  useEffect(() => {
    if (open && (session?.user?.role === "ADMIN" || session?.user?.role === "SUPPORT")) {
      fetch("/api/users").then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setAllUsers(d.map((u: { id: string; username: string; displayName: string }) => ({ id: u.id, username: u.username, displayName: u.displayName }))); }).catch(() => {});
    } else if (open) {
      fetch("/api/heroes").then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setAllUsers(d.map((u: { id: string; username: string; displayName: string }) => ({ id: u.id, username: u.username, displayName: u.displayName }))); }).catch(() => {});
    }
  }, [open, session]);

  // Load messages
  useEffect(() => {
    if (!open) return;
    fetch("/api/chat").then(r => r.ok ? r.json() : null).then(d => { if (d) setMessages(d); }).catch(() => {});
  }, [open]);

  // Poll for new messages
  useEffect(() => {
    if (!open || chatMode !== "team") return;
    const interval = setInterval(() => {
      const lastId = lastMsgIdRef.current;
      const url = lastId ? `/api/chat?after=${lastId}` : "/api/chat";
      fetch(url).then(r => r.ok ? r.json() : null).then(d => {
        if (d && d.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = d.filter((m: ChatMsg) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            return [...prev, ...newMsgs];
          });
        }
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [open, chatMode]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current && chatMode === "team") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMode]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: newMessage.trim() }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
      setNewMessage("");
      setMentionQuery(null);
    } catch (err: unknown) {
      toast({ title: "Failed to send message", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await fetch("/api/chat", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: [msgId] }) });
      setMessages(prev => prev.filter(m => m.id !== msgId));
      toast({ title: "Message deleted" });
    } catch {
      toast({ title: "Failed to delete message", variant: "destructive" });
    }
  };

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    // Check for @mention
    const cursorPos = value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex >= 0) {
      const afterAt = textBeforeCursor.substring(atIndex + 1);
      if (!afterAt.includes(" ") && afterAt.length <= 20) {
        setMentionQuery(afterAt.toLowerCase());
        return;
      }
    }
    setMentionQuery(null);
  };

  const insertMention = (username: string) => {
    const cursorPos = newMessage.length;
    const textBeforeCursor = newMessage.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const newText = newMessage.substring(0, atIndex + 1) + username + " " + newMessage.substring(cursorPos);
    setNewMessage(newText);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const filteredUsers = mentionQuery
    ? allUsers.filter(u => u.username.toLowerCase().includes(mentionQuery) || u.displayName?.toLowerCase().includes(mentionQuery))
    : [];

  const getRoleBadge = (role: string) => {
    if (role === "ADMIN") return <span className="text-[0.625rem] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1">ADMIN</span>;
    if (role === "SUPPORT") return <span className="text-[0.625rem] bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded px-1">SUPPORT</span>;
    return <span className="text-[0.625rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1">HERO</span>;
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="bg-background border-white/10 w-full sm:max-w-md h-full p-0 flex flex-col gap-0 overflow-hidden [&>button.absolute]:hidden">
        {/* Header with toggle — safe-top clears the Android status bar (edge-to-edge) */}
        <SheetHeader className="p-3 pb-0 border-b border-white/10 shrink-0 safe-top">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-foreground flex items-center gap-2 text-sm">
              {chatMode === "team" ? (
                <><MessageCircle className="h-4 w-4 text-emerald-400" />Team Chat</>
              ) : (
                <><Bot className="h-4 w-4 text-primary" />AI Assistant</>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {aiEnabled && (
                <div className="flex items-center rounded-lg bg-white/5 border border-white/10 p-0.5">
                  <button
                    onClick={() => setChatMode("team")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[0.625rem] font-medium transition-all ${
                      chatMode === "team" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <MessageCircle className="h-3 w-3" />Team
                  </button>
                  <button
                    onClick={() => setChatMode("ai")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[0.625rem] font-medium transition-all ${
                      chatMode === "ai" ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Bot className="h-3 w-3" />AI
                  </button>
                </div>
              )}
              <SheetClose className="rounded-md p-1.5 opacity-60 hover:opacity-100 transition-opacity hover:bg-white/10" asChild>
                <button><X className="h-4 w-4" /><span className="sr-only">Close</span></button>
              </SheetClose>
            </div>
          </div>
          {chatMode === "team" && (
            <SheetDescription className="text-muted-foreground text-[0.625rem] pb-2">Use @username to mention someone</SheetDescription>
          )}
          {chatMode === "ai" && (
            <SheetDescription className="text-muted-foreground text-[0.625rem] pb-2">Ask about orders, zones, summaries · Changes need approval</SheetDescription>
          )}
        </SheetHeader>

        {/* Content area - proper flex layout to prevent overflow */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          {chatMode === "team" ? (
            <>
              {/* Team Chat Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-xs">
                    <MessageCircle className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    No messages yet. Start the conversation!
                  </div>
                ) : messages.map(msg => {
                  const isOwn = msg.user.id === session?.user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-xl p-2 ${isOwn ? "bg-primary/20 border border-primary/30" : "bg-white/5 border border-white/10"}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[0.625rem] font-semibold text-foreground">{msg.user.displayName || msg.user.username}</span>
                          {getRoleBadge(msg.user.role)}
                          {isAdmin && !isOwn && (
                            <button onClick={() => handleDeleteMessage(msg.id)} className="ml-1 text-destructive/40 hover:text-destructive transition-colors" title="Delete">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
                          {msg.message.split(/(@\w+)/g).map((part, i) =>
                            part.startsWith("@") ? <span key={i} className="text-primary font-semibold">{part}</span> : part
                          )}
                        </p>
                        <p className="text-[0.625rem] text-muted-foreground/60 mt-0.5">{format(parseISO(msg.createdAt), "HH:mm")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Mention dropdown */}
              {mentionQuery !== null && filteredUsers.length > 0 && (
                <div className="border-t border-white/10 bg-background/95 backdrop-blur max-h-28 overflow-y-auto shrink-0">
                  {filteredUsers.slice(0, 5).map(u => (
                    <button
                      key={u.id}
                      onClick={() => insertMention(u.username)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <AtSign className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-foreground">{u.username}</span>
                      {u.displayName && <span className="text-muted-foreground">({u.displayName})</span>}
                    </button>
                  ))}
                </div>
              )}
              {/* Team Chat Input */}
              <div className="p-2.5 border-t border-white/10 flex gap-2 shrink-0">
                <input
                  ref={inputRef}
                  value={newMessage}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message... @ to mention"
                  className="flex-1 h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="sm" className="h-9 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          ) : (
            /* AI Chat Panel - embedded */
            <AiChatPanel session={session} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============ ONBOARDING MODAL ============
interface OnboardingStep {
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to HERO Sidekick! 🎉",
    icon: <Sparkles className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your all-in-one tool for managing ERTH e-waste pickup orders. Let&apos;s take a quick tour of the key features.
        </p>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-primary font-medium">This walkthrough will take about 2 minutes. You can always revisit tutorials from the Settings page.</p>
        </div>
      </div>
    ),
  },
  {
    title: "Dashboard Overview",
    icon: <Truck className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Your Dashboard is tailored to your role — Heroes, Support, and Admin each see different data:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-yellow-500/15 flex items-center justify-center shrink-0 mt-0.5"><Clock className="h-3.5 w-3.5 text-yellow-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Status Cards</p><p className="text-[0.75rem] text-muted-foreground">Count of Pending, Scheduled, Contacted, Booked, and Completed orders</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5"><Truck className="h-3.5 w-3.5 text-emerald-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Today&apos;s Pickups</p><p className="text-[0.75rem] text-muted-foreground">Orders scheduled for today with a progress bar showing your daily point total (max {MAX_DAILY_POINTS}pts/day)</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><Route className="h-3.5 w-3.5 text-primary" /></div>
            <div><p className="text-xs font-semibold text-foreground">Route Planning</p><p className="text-[0.75rem] text-muted-foreground">Download today&apos;s route as XLSX for Zeo Route Planner</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5"><AlertCircle className="h-3.5 w-3.5 text-amber-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Upcoming Holidays</p><p className="text-[0.75rem] text-muted-foreground">Public holidays that affect office pickup scheduling</p></div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Creating New Orders",
    icon: <Plus className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Click the <span className="font-semibold text-foreground">New</span> tab to create pickup orders:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">1</span>
            <div><p className="text-xs font-semibold text-foreground">Fill in the order details</p><p className="text-[0.75rem] text-muted-foreground">Order ID, customer name, phone, address, and city/area</p></div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">2</span>
            <div><p className="text-xs font-semibold text-foreground">Set the size & points</p><p className="text-[0.75rem] text-muted-foreground">S=1pt, M=2pt, L=3pt, XL=4pt, XXL=15pt. Override points up to 20 if needed.</p></div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">3</span>
            <div><p className="text-xs font-semibold text-foreground">Mark as Office (optional)</p><p className="text-[0.75rem] text-muted-foreground">Office pickups won&apos;t be scheduled on weekends or public holidays</p></div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">4</span>
            <div><p className="text-xs font-semibold text-foreground">Auto zone detection</p><p className="text-[0.75rem] text-muted-foreground">The city/area is matched to a zone automatically. You can customize zones in Settings.</p></div>
          </div>
        </div>
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-2.5">
          <p className="text-[0.75rem] text-orange-300 flex items-center gap-1.5"><FileUp className="h-3.5 w-3.5 shrink-0" />You can also bulk import orders from an Encore CSV file!</p>
        </div>
      </div>
    ),
  },
  {
    title: "Scheduling Pickups",
    icon: <Calendar className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">The <span className="font-semibold text-foreground">Schedule</span> tab helps you plan your pickups:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center shrink-0 mt-0.5"><Zap className="h-3.5 w-3.5 text-primary" /></div>
            <div><p className="text-xs font-semibold text-foreground">Auto-Schedule</p><p className="text-[0.75rem] text-muted-foreground">One click to auto-schedule all pending orders across available days (max {MAX_DAILY_POINTS}pts/day)</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5"><Calendar className="h-3.5 w-3.5 text-emerald-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Calendar View</p><p className="text-[0.75rem] text-muted-foreground">See your scheduled orders on a monthly calendar. Click any day to see details.</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5"><BarChartIcon className="h-3.5 w-3.5 text-amber-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Weekly Load Bar</p><p className="text-[0.75rem] text-muted-foreground">Visualize how full each day is — green (&lt;6pts), amber (6-9pts), red (10+pts)</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><FileDown className="h-3.5 w-3.5 text-primary" /></div>
            <div><p className="text-xs font-semibold text-foreground">Zeo Export</p><p className="text-[0.75rem] text-muted-foreground">Export any day&apos;s route as XLSX for Zeo Route Planner</p></div>
          </div>
        </div>
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5">
          <p className="text-[0.75rem] text-rose-300">💡 You can also manually reschedule individual orders by clicking the 📅 icon on any order card.</p>
        </div>
      </div>
    ),
  },
  {
    title: "Managing Orders & SOS",
    icon: <ClipboardList className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Keep your orders organized and get help when needed:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-cyan-500/15 flex items-center justify-center shrink-0 mt-0.5"><ClipboardList className="h-3.5 w-3.5 text-cyan-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Orders Tab</p><p className="text-[0.75rem] text-muted-foreground">View all orders, filter by status, zone, or hero. Support/Admin can also reassign orders to different heroes.</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5"><MessageCircle className="h-3.5 w-3.5 text-emerald-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">WhatsApp</p><p className="text-[0.75rem] text-muted-foreground">Send WhatsApp messages to customers for scheduled/contacted orders with one click</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5"><Siren className="h-3.5 w-3.5 text-red-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">SOS (Help!)</p><p className="text-[0.75rem] text-muted-foreground">Can&apos;t handle an order? Send an SOS and other drivers can take it over</p></div>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
          <p className="text-[0.75rem] text-muted-foreground">Order status flow: <span className="text-yellow-300">Pending</span> → <span className="text-cyan-300">Scheduled</span> → <span className="text-emerald-300">Contacted</span> → <span className="text-amber-300">Booked</span> → <span className="text-emerald-300">Completed</span></p>
        </div>
      </div>
    ),
  },
  {
    title: "You're All Set! 🚀",
    icon: <Target className="h-12 w-12 text-emerald-400" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">You now know the basics! Here are some tips to get the most out of HERO Sidekick:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-muted-foreground">Customize your <span className="text-foreground font-medium">zones</span> in Settings to match your coverage areas</p>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-muted-foreground">Set <span className="text-foreground font-medium">OFF days</span> when you don&apos;t work to prevent auto-scheduling on those days</p>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-muted-foreground">Use the <span className="text-foreground font-medium">🔔 notification bell</span> and <span className="text-foreground font-medium">💬 chat</span> to stay connected with your team</p>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-muted-foreground">Visit <span className="text-foreground font-medium">Settings → Tutorial</span> anytime for detailed guides on advanced features</p>
          </div>
        </div>
      </div>
    ),
  },
];

function OnboardingModal({ open, onClose, onComplete }: { open: boolean; onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === ONBOARDING_STEPS.length - 1;
  const isFirst = step === 0;

  useEffect(() => { if (open) { const id = setTimeout(() => setStep(0), 0); return () => clearTimeout(id); } }, [open]);

  const handleNext = () => {
    if (isLast) {
      onComplete();
      onClose();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
    onClose();
  };

  const currentStep = ONBOARDING_STEPS[step];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="bg-card border-white/10 sm:max-h-[85vh] overflow-y-auto">
        {/* Progress bar */}
        <div className="h-1 bg-white/5">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
        </div>
        <div className="p-6">
          <DialogHeader>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="mb-3 p-3 rounded-2xl bg-primary/10 earth-glow">
                {currentStep.icon}
              </div>
              <DialogTitle className="text-lg font-bold">{currentStep.title}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="mb-6">
            {currentStep.content}
          </div>
          {/* Step indicators */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {ONBOARDING_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/40" : "w-3 bg-white/10"}`}
              />
            ))}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              {!isFirst && (
                <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1 border-white/10 bg-white/5">
                  <ChevronLeft className="h-3.5 w-3.5" />Back
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                Skip Tour
              </Button>
            </div>
            <Button onClick={handleNext} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
              {isLast ? (
                <><CheckCircle2 className="h-4 w-4" />Get Started</>
              ) : (
                <>Next <ChevronRight className="h-3.5 w-3.5" /></>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ TUTORIAL SECTION (Settings) ============
function TutorialSection() {
  const [activeTutorialTab, setActiveTutorialTab] = useState<"basic" | "advanced">("basic");

  const basicTutorials = [
    {
      title: "Getting Started",
      icon: <Sparkles className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "What is HERO Sidekick?",
          content: "HERO Sidekick is your pickup order management system for ERTH e-waste collection. It helps you create, schedule, and track pickup orders across different zones in Malaysia."
        },
        {
          heading: "Navigation",
          content: "Use the tabs at the top to switch between Dashboard, New Order, Orders, Schedule, SOS, and Settings. On mobile, swipe the tab bar to see more options."
        },
        {
          heading: "Your Profile",
          content: "Your username and role are shown in the top-right corner. Click the refresh button ↻ to reload all data, or the logout button to sign out."
        },
      ]
    },
    {
      title: "Dashboard",
      icon: <Truck className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Role-Based Dashboards",
          content: "Each role sees a different dashboard: Heroes see their personal workload, Support sees hero overview and order management, Admin sees system statistics. Switch time ranges with Day/Week/Month/Year/All Time selector."
        },
        {
          heading: "Hero Dashboard",
          content: "Heroes see their status cards, today's pickups, weekly workload with selectable weeks, order trends chart, interactive order location map with day filtering, and route planning for Zeo export. Use the time range selector for detailed statistics. The map supports filtering by day (Today, Tomorrow, or custom date) and shows all your orders with coordinates."
        },
        {
          heading: "Support Dashboard",
          content: "Support users see hero overview with workload bars, upcoming OFF days, and an order reassignment panel to move orders between heroes. Support can also update/delete any hero's orders and ask the AI about hero schedules."
        },
        {
          heading: "Admin Dashboard",
          content: "Admins see system-wide statistics: order counts, AI usage, user activity with last logins, hero workload comparison, AI moderation flags, and audit summary. All with time-range filtering for granular analysis."
        },
      ]
    },
    {
      title: "Creating Orders",
      icon: <Plus className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Single Order",
          content: "Go to the 'New' tab. Fill in Order ID, customer name, phone, full address, and city/area. Select the size (S/M/L), and optionally add notes. Click 'Add Order' to create it."
        },
        {
          heading: "Zone Auto-Detection",
          content: "When you enter a city/area, the system automatically detects which zone it belongs to based on your zone configuration. The zone appears on the order card after creation."
        },
        {
          heading: "Bulk Import from Encore",
          content: "Below the order form, use the CSV import option. Upload a CSV exported from Encore with columns: Order #, Client name, Address, Special Note. Duplicates are auto-skipped by Order ID."
        },
        {
          heading: "Office vs Residential",
          content: "Check 'Office Address' if the pickup is at an office. Office pickups won't be scheduled on weekends or public holidays."
        },
      ]
    },
    {
      title: "Scheduling",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Auto-Schedule",
          content: "Click 'Auto-Schedule All Pending' to automatically distribute pending orders across available days. The system respects the 12-point daily limit, avoids OFF days, holidays, and event days."
        },
        {
          heading: "Manual Rescheduling",
          content: "On any order card, click the 📅 calendar icon to manually pick a new date using the mini calendar. You can only reschedule orders that are Pending, Scheduled, or Contacted."
        },
        {
          heading: "Calendar View",
          content: "The Schedule tab shows a monthly calendar with color-coded days: green (<6pts), amber (6-9pts), red (10+pts). Click any day to see its orders and export to Zeo. Event days and ERTHBOX orders are shown with special labels."
        },
        {
          heading: "Weekly Load",
          content: "The weekly bar chart shows your loading for each day. Use this to quickly see which days are free and which are fully booked."
        },
        {
          heading: "Events & ERTHBOX",
          content: "Events (roadshows, e-waste drives) block auto-scheduling on their date. ERTHBOX orders are manually scheduled — they stay PENDING until you assign a date. Both are shown in the calendar with special indicators."
        },
      ]
    },
    {
      title: "Viewing & Managing Orders",
      icon: <ClipboardList className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Filtering",
          content: "Use the status, zone, and hero filters on the Orders tab to find specific orders. You can also search by Order ID or customer name."
        },
        {
          heading: "Changing Status",
          content: "Click the status badge on any order to open the status picker. Orders flow: Pending → Scheduled → Contacted → Booked → Completed. You can set any status directly."
        },
        {
          heading: "Editing Points & Notes",
          content: "Click the points value (e.g. 'S(1pt)') to override points. Click notes text to edit them. Both are saved immediately."
        },
        {
          heading: "WhatsApp Customer",
          content: "Click the 💬 WhatsApp icon on any order to open the message editor. Choose a template, edit the message, and then send it via WhatsApp. Works for Scheduled, Contacted, Booked, and Completed orders."
        },
        {
          heading: "Support: All Heroes' Orders",
          content: "Support users automatically see ALL orders across all heroes in the Orders tab. Use the hero filter dropdown to view orders for a specific hero. Click the reassign button (⇄) on any order card to move it to a different hero — both heroes and admins are notified, and the change is audit-logged."
        },
      ]
    },
  ];

  const advancedTutorials = [
    {
      title: "Zone Management",
      icon: <Layers className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Understanding Zones",
          content: "Zones group areas together for easier order management. The default zones cover Selangor & KL (5 zones) and Other States (7 zones). Each zone has a list of areas that auto-match when creating orders."
        },
        {
          heading: "Enable/Disable Zones",
          content: "In Settings → Zone Map, toggle zones on/off. Disabled zones won't be used for auto-detection. Other States zones are disabled by default."
        },
        {
          heading: "Custom Zones",
          content: "Click 'New Zone' to create your own zone. Give it a name, select a state/region, and add comma-separated areas. Custom zones get auto-assigned zone IDs starting from 100."
        },
        {
          heading: "Renaming Zones",
          content: "Click any zone name in the Zone Map to rename it. This only changes the display name for your account."
        },
        {
          heading: "Adding/Excluding Areas",
          content: "Expand a zone to see its areas. Add new areas with the input field. Hover over any area to exclude it (it moves to the 'Excluded' list) or click the ✕ on custom-added areas to remove them."
        },
      ]
    },
    {
      title: "SOS System",
      icon: <Siren className="h-5 w-5 text-red-400" />,
      sections: [
        {
          heading: "Sending an SOS",
          content: "If you can't handle an order (too far, schedule conflict, etc.), click the 🚨 SOS button on the order card. Provide a reason and the order will be broadcast to other drivers."
        },
        {
          heading: "Answering an SOS",
          content: "Active SOS requests appear in the SOS tab. Click 'ANSWER SOS' to take over the order. It will be transferred to your account and you can schedule it."
        },
        {
          heading: "Admin/Support: Assigning SOS",
          content: "Admin and Support users can assign SOS requests to specific heroes instead of taking them directly. Select a hero from the dropdown and click 'ASSIGN'."
        },
      ]
    },
    {
      title: "Import & Export",
      icon: <FileSpreadsheet className="h-5 w-5 text-orange-400" />,
      sections: [
        {
          heading: "Encore CSV Import",
          content: "Upload a CSV exported from Encore. Required columns: Order #, Client name, Address, Special Note. The system auto-detects city/area and assigns zones. Duplicate Order IDs are skipped."
        },
        {
          heading: "Zeo Route Planner Export",
          content: "Export scheduled/contacted orders as an XLSX file formatted for Zeo Route Planner. Choose a specific date or export today's route from the Dashboard or Schedule tab."
        },
        {
          heading: "Google Sheets Sync",
          content: "In Settings → Integrations, set up Google Sheets sync to push orders to a spreadsheet or import from it. Requires a Google Service Account with Sheets API access."
        },
      ]
    },
    {
      title: "Scheduling Settings",
      icon: <CalendarDays className="h-5 w-5 text-amber-400" />,
      sections: [
        {
          heading: "Daily Capacity",
          content: "Each day has a maximum of 20 points. Small orders = 1pt, Medium = 2pt, Large = 3pt. You can override points per order (1-20) if an order requires extra effort."
        },
        {
          heading: "Public Holidays",
          content: "Add holidays in Settings → Scheduling. Office pickups won't be scheduled on these dates, but residential pickups can still be scheduled."
        },
        {
          heading: "OFF Days",
          content: "Mark days as OFF when you don't work at all. No orders (residential or office) will be scheduled on OFF days. This overrides everything."
        },
        {
          heading: "Weekend Rule",
          content: "Office pickups are NOT scheduled on weekends (Sat/Sun). Residential pickups can be scheduled any day. This is automatic and cannot be overridden."
        },
        {
          heading: "Event Days",
          content: "Event days automatically block auto-scheduling. When you create an event (roadshow, e-waste collection drive, etc.) on a specific date, no regular orders will be auto-assigned to that day. You can still manually schedule orders on event days."
        },
        {
          heading: "ERTHBOX Manager",
          content: "Manage ERTHBOX collection locations in Settings → Scheduling → ERTHBOX Manager. Add locations with PIC details and notes, then create ERTHBOX orders from the New Order tab. ERTHBOX orders are manually scheduled (not auto-scheduled)."
        },
      ]
    },
    {
      title: "Notifications & Chat",
      icon: <Bell className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Notifications",
          content: "Click the 🔔 bell icon to see notifications. System notifications (amber) are important alerts. Normal notifications include SOS requests and other updates."
        },
        {
          heading: "Team Chat",
          content: "Click the 💬 chat bubble (bottom-right) to open the chat drawer. In Team mode, you can chat with team members and @mention others by typing @ followed by their name. Admins can delete inappropriate messages."
        },
        {
          heading: "AI Chat Mode",
          content: "Inside the chat drawer, use the Team/AI toggle at the top to switch to AI Assistant mode. The AI can answer questions about your orders, schedule, zones, and more. All AI-proposed actions need your approval."
        },
      ]
    },
    {
      title: "WhatsApp Messaging",
      icon: <MessageCircle className="h-5 w-5 text-emerald-400" />,
      sections: [
        {
          heading: "Message Editor",
          content: "Click the 💬 WhatsApp icon on any order to open the message editor. The default template is auto-filled with the order's details. You can freely edit the message before sending."
        },
        {
          heading: "Message Templates",
          content: "In Settings → WhatsApp, manage your message templates. Create templates with variables like {customerName}, {date}, {address} that auto-fill when sending. Set a default template for quick access."
        },
        {
          heading: "Quick Variable Insert",
          content: "In the message editor, expand 'Insert Variable' to add order details at your cursor position. Variables like {orderId}, {size}, {city}, and {notes} are available."
        },
        {
          heading: "Country Code Prefix",
          content: "In Settings → WhatsApp, set your country code prefix (default: 60 for Malaysia). Phone numbers are auto-formatted with this prefix when sending WhatsApp messages."
        },
      ]
    },
    {
      title: "AI Assistant",
      icon: <Bot className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Opening the AI Chat",
          content: "Click the 💬 chat bubble (bottom-right) to open the chat drawer. Inside, use the Team/AI toggle at the top to switch to AI mode. The AI knows your order data and can answer questions about your schedule, orders, and more."
        },
        {
          heading: "Asking Smart Questions",
          content: "Ask the AI things like: 'Do I have events next week?', 'Orders in KL next week?', 'What's my schedule tomorrow?', or 'How many points do I have today?'. The AI has full context of your orders, events, ERTHBOX collections, and holidays."
        },
        {
          heading: "Schedule Analysis",
          content: "The AI can analyze your schedule and provide insights — busy days, light days, conflicts with events, approaching the 12pt daily cap, and suggested actions. Ask 'What should I know about this week?' for a full breakdown."
        },
        {
          heading: "Daily Summary",
          content: "Click 'Daily Summary' in the AI chat to get a personalized summary of your day — completed orders, points earned, orders with notes needing attention, and tomorrow's schedule preview."
        },
        {
          heading: "Order Changes & Creation",
          content: "The AI can suggest changes to orders (status updates, adding notes, etc.) and create new orders. Any proposed changes require your approval before being applied — you'll see pending actions in the chat."
        },
        {
          heading: "Malaysia Timezone",
          content: "The AI always knows the current date and time in Malaysia (UTC+8). It uses this to accurately answer time-based questions like 'next week' or 'tomorrow'. No need to specify dates manually."
        },
        {
          heading: "Admin Controls",
          content: "Admins can enable/disable AI system-wide, configure the API key, model, base URL, and system prompt in Settings → AI Assistant. The model field is a dropdown that auto-fetches available models from your provider (Ollama, OpenAI, etc.) with a Refresh button. Flagged messages from dangerous or strange requests are visible to admins only."
        },
        {
          heading: "Photo Upload (Vision)",
          content: "Tap the image icon next to the message box to attach a photo (or take one in the Android app). The AI uses a vision-capable model (minimax-m3:cloud) to describe or analyze the image. Attach up to 4 photos per message; they're downsized to 1024px automatically. Useful for identifying items, reading labels, or documenting pickups."
        },
      ]
    },
    {
      title: "Android App & Notifications",
      icon: <Smartphone className="h-5 w-5 text-emerald-400" />,
      sections: [
        {
          heading: "Installing the App",
          content: "HERO Sidekick is available as a native Android app wrapping the web platform. Install the APK on your phone and log in — your session persists across launches. The app works offline-ish (cached) and supports pull-to-refresh."
        },
        {
          heading: "Push Notifications",
          content: "The app receives push notifications for: SOS requests (Support/Admin), new orders assigned/reassigned to you, system alerts from admins, and chat mentions. Notifications route to dedicated channels (Orders, SOS, System, Chat) so you can configure each separately in Android settings."
        },
        {
          heading: "Foreground Sync Fallback",
          content: "If Firebase Cloud Messaging isn't configured, the app runs a foreground service that polls for new notifications every 60s (with adaptive backoff when idle). This ensures you still get notified even without push setup. On first install it bootstraps silently — no flood of old notifications."
        },
        {
          heading: "Photo Upload from App",
          content: "When chatting with the AI in the Android app, the image picker offers both Gallery and Camera options. Take a photo directly or pick from your gallery — it's sent to the vision model just like on the web."
        },
      ]
    },
    {
      title: "2FA & Security",
      icon: <Shield className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "What is 2FA?",
          content: "Two-Factor Authentication adds an extra security layer. After entering your password, you'll also need a 6-digit code from Google Authenticator on your phone."
        },
        {
          heading: "Setting Up",
          content: "Go to Settings → Security → Start 2FA Setup. Scan the QR code with Google Authenticator (free app). Enter the 6-digit code to verify and enable."
        },
        {
          heading: "Signing In with 2FA",
          content: "After entering username and password, you'll be asked for your 2FA code. Open Google Authenticator and type the 6-digit code. Codes refresh every 30 seconds."
        },
        {
          heading: "Disabling 2FA",
          content: "Go to Settings → Security → Disable 2FA. You'll need to enter your current authenticator code to confirm. Only disable if you've lost access to your authenticator app."
        },
      ]
    },
    {
      title: "AI Order Creation",
      icon: <Bot className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Creating Orders with AI",
          content: "Open the chat bubble → switch to AI mode using the Team/AI toggle. Say something like \"Create an order for John at Ampang\". AI will ask for missing details (order ID, phone, etc.) then propose the order for your approval."
        },
        {
          heading: "Creating Events with AI",
          content: "Tell the AI \"Create a roadshow event at KLCC next Monday\" or \"Schedule an e-waste collection event on 2026-06-20\". AI will create an EVENT-XXX order with the correct type and date for your approval."
        },
        {
          heading: "Creating ERTHBOX Orders with AI",
          content: "Tell the AI \"Create an ERTHBOX collection for [location name]\". The AI will look up the ERTHBOX location and create an ERTHBOX-XXX order with the location's details auto-populated. You must have ERTHBOX locations set up first (Settings → Scheduling → ERTHBOX Manager)."
        },
        {
          heading: "Smart Zone Detection",
          content: "When AI creates an order, it automatically detects the zone from the address. If the area is new, AI suggests adding it to the nearest zone — you can approve this in Settings → Zone Map."
        },
        {
          heading: "BOOKED Order Protection",
          content: "Orders with BOOKED status are locked. AI cannot suggest changes to them to prevent conflicts with confirmed customer schedules."
        },
      ]
    },
    {
      title: "Event Scheduling",
      icon: <Calendar className="h-5 w-5 text-amber-400" />,
      sections: [
        {
          heading: "What are Events?",
          content: "Events are full-day activities like roadshows, e-waste collection drives, or other special occasions. They are different from regular orders — they take up the entire day and block auto-scheduling for that date."
        },
        {
          heading: "Creating Events",
          content: "In the New Order tab, toggle the 'Event' switch on. Select an event type (Roadshow, E-Waste Collection, or Other), enter the event name, date, and optionally city and notes. Event IDs are auto-generated (EVENT-001, EVENT-002, etc.)."
        },
        {
          heading: "Event Days & Auto-Scheduling",
          content: "When a day has an event scheduled, the auto-scheduler will NOT assign regular orders to that day. This ensures you're free for the full-day event. You can still manually schedule orders on event days if needed."
        },
        {
          heading: "Event Types",
          content: "ROADSHOW — promotional events at malls or public venues. EWASTE_COLLECTION — organized e-waste collection drives. OTHER — any other full-day activity. Each type is shown with a distinctive label on your schedule."
        },
        {
          heading: "Events via AI",
          content: "You can also create events through the AI Assistant. Say \"Create a roadshow event next Friday\" and the AI will handle the details. Event creation through AI still requires your approval before it's added."
        },
      ]
    },
    {
      title: "ERTHBOX Management",
      icon: <Package className="h-5 w-5 text-emerald-400" />,
      sections: [
        {
          heading: "What are ERTHBOX Orders?",
          content: "ERTHBOX orders are for collecting ERTHBOX collection boxes from fixed locations like malls, offices, or community centers. They are typically scheduled weekly when you have orders in the nearby area."
        },
        {
          heading: "Universal Locations",
          content: "ERTHBOX locations are shared across all users — any hero, admin, or support can see and use all active locations. When creating an ERTHBOX order, you'll see locations added by all users, with a 'by [name]' badge showing who created each location. Only the owner, admin, or support can edit or delete a location."
        },
        {
          heading: "Managing ERTHBOX Locations",
          content: "Go to Settings → Scheduling → ERTHBOX Manager. Here you can add, edit, and deactivate collection locations. Each location stores the location name, address, city, Person in Charge (PIC) name, PIC phone number, and notes. If there are many locations, use the search bar to filter by name, city, or address."
        },
        {
          heading: "Adding a Location",
          content: "Click 'Add Location' in the ERTHBOX Manager. Fill in the location name, address, city, PIC name, PIC phone, and any notes (e.g. 'Mall area, cannot enter between 12PM-2PM'). Active locations are available for everyone to use when creating ERTHBOX orders."
        },
        {
          heading: "Creating ERTHBOX Orders",
          content: "In the New Order tab, toggle the 'ERTHBOX' switch on. A search-enabled location list appears — search by name, city, or address, then click a location to select it. The address, PIC name, and phone are auto-filled. ERTHBOX orders get auto-generated IDs (ERTHBOX-001, etc.) and default to PENDING status."
        },
        {
          heading: "Scheduling ERTHBOX Collections",
          content: "ERTHBOX orders are NOT auto-scheduled. They stay in PENDING status until you manually assign a date. This is because ERTHBOX collections depend on whether you have nearby orders that week. Use the calendar picker on the order to set a date."
        },
        {
          heading: "ERTHBOX via AI",
          content: "Tell the AI \"Create an ERTHBOX collection for [location name]\" and it will create the order for your approval. You can optionally include a date: \"Create ERTHBOX for Mid Valley on Friday\"."
        },
      ]
    },
    {
      title: "Admin Features",
      icon: <Shield className="h-5 w-5 text-amber-400" />,
      sections: [
        {
          heading: "User Management",
          content: "Admins see a 'Users' tab to manage accounts. Create new users (HERO, SUPPORT, or ADMIN), approve/reject registrations, activate/deactivate accounts, and reset passwords."
        },
        {
          heading: "Admin Dashboard",
          content: "The Admin Dashboard shows system-wide statistics with time-range filtering: order counts/trends, AI usage stats, user activity with last logins, hero workload comparison, AI moderation flags, and audit summary."
        },
        {
          heading: "Audit Log",
          content: "Settings → Audit Log tracks all significant actions: order changes, reassignments, user management, SOS events, and more. Filter by user or action type."
        },
        {
          heading: "Self-Registration",
          content: "New users can register from the login page. They start as unapproved and cannot sign in until an Admin approves them from the Users tab."
        },
      ]
    },
    {
      title: "Support Features",
      icon: <Shield className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Support Dashboard",
          content: "The Support Dashboard provides a hero overview with workload bars, upcoming OFF days, order trends, and an order reassignment panel. Use the time-range selector and week navigation for different views."
        },
        {
          heading: "Order Reassignment",
          content: "Reassign orders from two places: the Support Dashboard reassignment panel, or directly from the Orders tab by clicking the ⇄ button on any order card. Both methods notify the affected heroes and admins, and log the change in the audit trail."
        },
        {
          heading: "Managing Hero Orders",
          content: "Support users can update and delete any hero's orders, not just their own. Changes notify the assigned hero. Support can also view all orders across heroes."
        },
        {
          heading: "AI Hero Queries",
          content: "Support users can ask the AI questions about heroes: 'Which heroes are working today?', 'Who has the lightest workload?', 'Are any heroes on leave next week?', 'Which hero should I assign this KL order to?'."
        },
        {
          heading: "Settings Access",
          content: "Support users have access to the Settings tab for scheduling configuration, zone management, and other operational settings needed for their role."
        },
      ]
    },
  ];

  const [expandedTutorial, setExpandedTutorial] = useState<string | null>(null);

  const tutorials = activeTutorialTab === "basic" ? basicTutorials : advancedTutorials;

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setActiveTutorialTab("basic"); setExpandedTutorial(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTutorialTab === "basic"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-white/5 text-muted-foreground border border-transparent hover:bg-white/10"
          }`}
        >
          <BookOpen className="h-4 w-4" />Basic Usage
        </button>
        <button
          onClick={() => { setActiveTutorialTab("advanced"); setExpandedTutorial(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTutorialTab === "advanced"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-white/5 text-muted-foreground border border-transparent hover:bg-white/10"
          }`}
        >
          <GraduationCap className="h-4 w-4" />Advanced Features
        </button>
      </div>

      {/* Tutorial Cards */}
      <div className="space-y-2">
        {tutorials.map((tutorial) => {
          const isExpanded = expandedTutorial === tutorial.title;
          return (
            <div key={tutorial.title} className="rounded-xl border border-white/10 bg-card overflow-hidden">
              <button
                onClick={() => setExpandedTutorial(isExpanded ? null : tutorial.title)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">{tutorial.icon}</div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{tutorial.title}</p>
                    <p className="text-[0.625rem] text-muted-foreground">{tutorial.sections.length} topic{tutorial.sections.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 space-y-3">
                  {tutorial.sections.map((section, i) => (
                    <div key={i} className="pt-3 first:pt-3">
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">{i + 1}</span>
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-0.5">{section.heading}</p>
                          <p className="text-[0.75rem] text-muted-foreground leading-relaxed">{section.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ MAIN PAGE ============
export default function HomePage() {
  const { data: session, status } = useSession();

  // Capture the deep-link tab param BEFORE the session/loading early-returns, so it
  // survives the "Syncing..." splash + LoginPage redirect. Stored in a ref + sessionStorage.
  const pendingTabRef = useRef<string | null>(null);
  if (pendingTabRef.current === null && typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab) {
        pendingTabRef.current = tab;
        sessionStorage.setItem("sidekick_pending_tab", tab);
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        const saved = sessionStorage.getItem("sidekick_pending_tab");
        if (saved) pendingTabRef.current = saved;
      }
    } catch {}
  }
  const { data: stats, refetch: refetchStats } = useFetchData<Stats>("/api/stats");
  const { data: ordersData, refetch: refetchOrders } = useFetchData<{ orders: Order[]; total: number; page: number; totalPages: number, }>("/api/orders?limit=200");
  const { data: userZones } = useFetchData<UserZoneData[]>("/api/user-zones");
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const orders = ordersData?.orders ?? null;
  const { data: holidays, refetch: refetchHolidays } = useFetchData<Holiday[]>("/api/holidays");
  const [activeTab, setActiveTab] = useState("dashboard");
  // Deep-link from dashboard stat cards → Orders tab pre-filtered by status
  const [ordersStatusFilter, setOrdersStatusFilter] = useState("ALL");
  const [ordersFilterNonce, setOrdersFilterNonce] = useState(0);
  const [heroProfileOpen, setHeroProfileOpen] = useState(false);
  const goToOrdersWithStatus = (status: string) => { setOrdersStatusFilter(status); setOrdersFilterNonce(n => n + 1); setActiveTab("orders"); };
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false); // kept for future
  const [chatInitialMode, setChatInitialMode] = useState<"team" | "ai">("team");

  // Deep-link handler: read the pending tab (captured before the session gate above)
  // and open the matching drawer. Runs once when the main app mounts after login.
  useEffect(() => {
    const tab = pendingTabRef.current;
    if (!tab) return;
    pendingTabRef.current = null;
    try { sessionStorage.removeItem("sidekick_pending_tab"); } catch {}
    if (tab === "notifications" || tab === "notif") setNotifDrawerOpen(true);
    else if (tab === "chat") { setChatInitialMode("team"); setChatDrawerOpen(true); }
    else if (tab === "ai") { setChatInitialMode("ai"); setChatDrawerOpen(true); }
    else if (tab === "orders") setActiveTab("orders");
  }, []);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAppSplash, setShowAppSplash] = useState(true);
  const onboardingCheckedRef = useRef(false);

  // Neon Cockpit splash: brief brand reveal on first app mount, then fade out.
  useEffect(() => {
    if (status !== "authenticated") return;
    const t = setTimeout(() => setShowAppSplash(false), 1200);
    return () => clearTimeout(t);
  }, [status]);
  const [verifySessionId, setVerifySessionId] = useState<string | null>(null);
  const [geocodeSessionId, setGeocodeSessionId] = useState<string | null>(null);
  const [showVerifyProgress, setShowVerifyProgress] = useState(false);
  const onGeocodeStart = useCallback((sessionId: string) => {
    setGeocodeSessionId(sessionId);
  }, []);

  const onVerifyStart = useCallback((sessionId: string) => {
    setVerifySessionId(sessionId);
    setShowVerifyProgress(true);
  }, []);

  // Debounced refresh: rapid mutations (batch status, delete, etc.) coalesce into a
  // single refetch ~300ms after the last action, instead of N simultaneous heavy refetches.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAll = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refetchStats(); refetchOrders(); refetchHolidays(); setDashboardRefreshKey(k => k + 1);
    }, 300);
  }, [refetchStats, refetchOrders, refetchHolidays]);

  // Background auto-revalidation: re-fetch orders + stats every 45s so the data
  // self-heals even if a mutation's refresh was missed (fixes "quit app to see data").
  // Lightweight thanks to the cache: the UI already shows stale data, this just swaps
  // in fresh data. Pauses when the tab/document is hidden to save battery.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      refetchOrders();
      refetchStats();
    }, 45000);
    return () => clearInterval(interval);
  }, [refetchOrders, refetchStats]);

  // Revalidate immediately when the app returns to the foreground (user switches back).
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refreshAll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshAll]);

  // Check if onboarding has been completed for this user
  useEffect(() => {
    if (!session || onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;
    fetch("/api/settings").then(r => r.json()).then(settings => {
      if (!settings.onboardingCompleted) {
        // Show onboarding for first-time users
        setShowOnboarding(true);
      }
    }).catch(() => {});
  }, [session]);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingCompleted: "true" }),
    }).catch(() => {});
  }, []);

  // Check AI status
  useEffect(() => {
    if (!session) return;
    fetch("/api/ai/status").then(r => r.json()).then(data => {
      setAiEnabled(data.enabled && data.hasApiKey);
    }).catch(() => {});
  }, [session]);

  // Show loading — Neon Cockpit splash
  if (status === "loading") {
    return (
      <div className="nc-splash">
        <div className="nc-splash__inner">
          <div className="nc-splash__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="HERO Sidekick" className="h-9 w-9 rounded-lg" />
          </div>
          <div>
            <p className="nc-splash__title">HERO Sidekick</p>
            <p className="nc-splash__copy">Syncing operational telemetry...</p>
          </div>
          <div className="nc-splash__bar"><span /></div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  const roleStyle = session.user?.role === "ADMIN"
    ? { color: "var(--nc-danger)", borderColor: "rgba(248,113,113,0.30)", background: "rgba(248,113,113,0.10)" }
    : session.user?.role === "SUPPORT"
      ? { color: "var(--nc-info)", borderColor: "rgba(96,165,250,0.30)", background: "rgba(96,165,250,0.10)" }
      : undefined;

  return (
    <div className="nc-shell">
      <div className="w-full max-w-5xl mx-auto flex flex-col min-h-dvh relative">
      {/* Neon Cockpit splash overlay — fades out shortly after mount */}
      <div className={`nc-splash ${showAppSplash ? "" : "nc-splash--hidden"}`} aria-hidden="true">
        <div className="nc-splash__inner">
          <div className="nc-splash__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="HERO Sidekick" className="h-9 w-9 rounded-lg" />
          </div>
          <div>
            <p className="nc-splash__title">HERO Sidekick</p>
            <p className="nc-splash__copy">Syncing operational telemetry...</p>
          </div>
          <div className="nc-splash__bar"><span /></div>
        </div>
      </div>

      {/* Neon header — sticky so it never scrolls out of view */}
      <header className="nc-header sticky top-0 z-50">
        <div className="max-w-5xl mx-auto nc-brand-row" style={{ padding: "14px 16px 10px" }}>
          <div className="nc-brand">
            <div className="nc-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="HERO Sidekick" />
            </div>
            <div className="min-w-0">
              <div className="nc-wordmark truncate">HERO Sidekick</div>
              <div className="nc-sub">ERTH Pickup Automation</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell session={session} onOpen={() => setNotifDrawerOpen(true)} />
            <ChatBubble session={session} onOpen={() => setChatDrawerOpen(true)} />
            {session.user?.role && (
              <span className="nc-role-chip" style={roleStyle}>{session.user.role}</span>
            )}
          </div>
        </div>
        {/* Actions row — neon chips, evenly spaced, no overflow */}
        <div className="nc-actions-row max-w-5xl mx-auto">
          <button type="button" className="nc-action-chip nc-action-chip--primary" onClick={() => setActiveTab("dashboard")}><Truck className="h-4 w-4" /> Today</button>
          <a href="/route" className="nc-action-chip"><Zap className="h-4 w-4" /> Optimize</a>
          <button type="button" className="nc-action-chip" onClick={refreshAll} aria-label="Refresh data"><RotateCcw className="h-4 w-4" /> Refresh</button>
          <button type="button" className="nc-action-chip" onClick={() => setShowOnboarding(true)}><Info className="h-4 w-4" /> Tutorial</button>
          <button type="button" className="nc-action-chip nc-action-chip--danger" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Logout</button>
          <button type="button" className="nc-action-chip" onClick={() => setHeroProfileOpen(true)} title="Edit hero profile (vehicle, home address)" style={{ cursor: "pointer" }}>
            <UserIcon className="h-4 w-4" />
            <span className="max-w-[90px] truncate">{session.user?.name}</span>
          </button>
        </div>
      </header>

      {/* SOS Alert Banner */}
      {stats && (stats as any).activeSosCount > 0 && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-center animate-fade-in">
          <span className="text-sm font-medium text-red-400 flex items-center justify-center gap-2">
            <Siren className="h-4 w-4" />
            {(stats as any).activeSosCount} active SOS {(stats as any).activeSosCount === 1 ? "alert" : "alerts"} — tap <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("sos"); }} className="underline font-semibold">here</a> to view
          </span>
        </div>
      )}

      {/* Main - scrollable area */}
      <main className="flex-1 pb-28 sm:pb-8">
        <div className="max-w-5xl mx-auto w-full px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Desktop top tabs — Neon Cockpit */}
          <div className="hidden sm:block pb-3">
            <TabsList className={`grid w-full bg-white/5 border border-white/10 h-12 ${session.user?.role === "ADMIN" ? "grid-cols-7" : "grid-cols-6"}`}>
            <TabsTrigger value="dashboard" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12">
              <Truck className="h-4 w-4 hidden sm:block" />Dashboard
            </TabsTrigger>
            <TabsTrigger value="new-order" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12">
              <Plus className="h-4 w-4 hidden sm:block" />New
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12">
              <ClipboardList className="h-4 w-4 hidden sm:block" />Orders
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12">
              <Calendar className="h-4 w-4 hidden sm:block" />Schedule
            </TabsTrigger>
            <TabsTrigger value="sos" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12 relative">
              <Siren className="h-4 w-4 hidden sm:block" />SOS
              {stats && stats.activeSosCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[0.625rem] text-white items-center justify-center font-bold">{stats.activeSosCount}</span>
                </span>
              )}
            </TabsTrigger>
            {session.user?.role === "ADMIN" && (
              <TabsTrigger value="users" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12">
                <Shield className="h-4 w-4 hidden sm:block" />Users
              </TabsTrigger>
            )}
            <TabsTrigger value="settings" className="gap-1 text-xs sm:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12">
              <Settings className="h-4 w-4 hidden sm:block" />Settings
            </TabsTrigger>
          </TabsList>
          </div>

          <TabsContent value="dashboard"><div className="animate-fade-in-up"><DashboardTab stats={stats} onRefresh={refreshAll} dashboardRefreshKey={dashboardRefreshKey} userZones={userZones || undefined} onFilterOrders={goToOrdersWithStatus} /></div></TabsContent>
          <TabsContent value="new-order"><div className="animate-fade-in-up"><NewOrderTab onRefresh={refreshAll} onVerifyStart={onVerifyStart} /></div></TabsContent>
          <TabsContent value="orders"><div className="animate-fade-in-up"><OrdersTab orders={orders || []} onRefresh={refreshAll} holidays={holidays || []} offDays={stats?.offDays} userZones={userZones || undefined} onVerifyStart={onVerifyStart} onGeocodeStart={onGeocodeStart} initialStatusFilter={ordersStatusFilter} filterNonce={ordersFilterNonce} /></div></TabsContent>
          <TabsContent value="schedule"><div className="animate-fade-in-up"><ScheduleTab stats={stats} orders={orders || []} onRefresh={refreshAll} userZones={userZones || undefined} /></div></TabsContent>
          <TabsContent value="sos"><div className="animate-fade-in-up"><SosTab onRefresh={refreshAll} onGoToOrders={() => setActiveTab("orders")} userZones={userZones || undefined} /></div></TabsContent>
          {session.user?.role === "ADMIN" && (
            <TabsContent value="users"><UsersTab onRefresh={refreshAll} /></TabsContent>
          )}
          <TabsContent value="settings"><SettingsTab holidays={holidays || []} onRefresh={refreshAll} session={session} onReplayOnboarding={() => setShowOnboarding(true)} onVerifyStart={onVerifyStart} /></TabsContent>
        </Tabs>
        </div>
      </main>

      {/* Mobile Bottom Navigation — Neon Cockpit */}
      <nav className="nc-nav sm:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="nc-nav__grid" style={{ gridTemplateColumns: session.user?.role === "ADMIN" ? "repeat(7,1fr)" : "repeat(6,1fr)" }}>
          <button onClick={() => setActiveTab("dashboard")} className={`nc-nav__btn ${activeTab === "dashboard" ? "nc-nav__btn--active" : ""}`} aria-label="Dashboard">
            <Truck className="h-5 w-5" /><span className="truncate w-full text-center">Dashboard</span>
          </button>
          <button onClick={() => setActiveTab("new-order")} className={`nc-nav__btn ${activeTab === "new-order" ? "nc-nav__btn--active" : ""}`} aria-label="New Order">
            <Plus className="h-5 w-5" /><span className="truncate w-full text-center">New</span>
          </button>
          <button onClick={() => setActiveTab("orders")} className={`nc-nav__btn ${activeTab === "orders" ? "nc-nav__btn--active" : ""}`} aria-label="Orders">
            <ClipboardList className="h-5 w-5" /><span className="truncate w-full text-center">Orders</span>
          </button>
          <button onClick={() => setActiveTab("schedule")} className={`nc-nav__btn ${activeTab === "schedule" ? "nc-nav__btn--active" : ""}`} aria-label="Schedule">
            <Calendar className="h-5 w-5" /><span className="truncate w-full text-center">Schedule</span>
          </button>
          <button onClick={() => setActiveTab("sos")} className={`nc-nav__btn relative ${activeTab === "sos" ? "nc-nav__btn--active" : ""}`} aria-label="SOS">
            <Siren className="h-5 w-5" /><span className="truncate w-full text-center">SOS</span>
            {stats && stats.activeSosCount > 0 && (
              <span className="absolute -top-0.5 right-2 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[0.625rem] text-white items-center justify-center font-bold">{stats.activeSosCount}</span>
              </span>
            )}
          </button>
          {session.user?.role === "ADMIN" && (
            <button onClick={() => setActiveTab("users")} className={`nc-nav__btn ${activeTab === "users" ? "nc-nav__btn--active" : ""}`} aria-label="Users">
              <Shield className="h-5 w-5" /><span className="truncate w-full text-center">Users</span>
            </button>
          )}
          <button onClick={() => setActiveTab("settings")} className={`nc-nav__btn ${activeTab === "settings" ? "nc-nav__btn--active" : ""}`} aria-label="Settings">
            <Settings className="h-5 w-5" /><span className="truncate w-full text-center">Settings</span>
          </button>
        </div>
      </nav>

      {/* Drawers */}
      <NotificationDrawer open={notifDrawerOpen} onClose={() => setNotifDrawerOpen(false)} session={session} onNavigate={(target) => { if (target === "ai") { setChatInitialMode("ai"); setChatDrawerOpen(true); } else if (target === "chat") { setChatInitialMode("team"); setChatDrawerOpen(true); } else if (target === "orders") setActiveTab("orders"); }} />
      <ChatDrawer open={chatDrawerOpen} onClose={() => setChatDrawerOpen(false)} session={session} aiEnabled={aiEnabled} initialMode={chatInitialMode} />
      <HeroProfileDialog open={heroProfileOpen} onOpenChange={setHeroProfileOpen} />
      <GeocodeProgressDrawer sessionId={geocodeSessionId} onComplete={() => { setGeocodeSessionId(null); refreshAll(); }} />
      <VerificationProgressDrawer
        open={showVerifyProgress}
        onClose={() => { setShowVerifyProgress(false); setVerifySessionId(null); }}
        sessionId={verifySessionId}
        onComplete={() => refreshAll()}
      />

      {/* Onboarding Modal */}
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} onComplete={completeOnboarding} />
      </div>
    </div>
  );
}
