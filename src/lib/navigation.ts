// Navigation target model — converts an optimized VROOM route into an ordered
// sequence of navigation targets (pickups, drop-offs, home) while preserving
// the exact VROOM stop order. Client-safe.

import type { OptimizedRouteResult } from "./vroom";
import { FIXED_LOCATIONS } from "./route-model";

export type NavigationTargetKind = "pickup" | "dropoff" | "home" | "unknown";

export interface NavigationTarget {
  id: string;
  kind: NavigationTargetKind;
  title: string;
  subtitle: string;
  orderId?: string;
  orderDbId?: string;
  lat: number;
  lng: number;
  /** 1-based position across the whole route (customer stops only). */
  stopNumber?: number;
  points?: number;
  notes?: string | null;
  phone?: string;
  address?: string;
  city?: string;
  completed?: boolean;
}

/** Navigation engine states. */
export type NavEngineState =
  | "loading"
  | "ready"
  | "requesting-directions"
  | "navigating"
  | "rerouting"
  | "arrived"
  | "completed"
  | "error";

/**
 * Build the navigation stop sequence from an optimized route.
 *
 * Per load: pickups in VROOM order → drop-off waypoint → (home between loads
 * and a final home at the very end, matching the VROOM plan which starts and
 * ends each vehicle at HOME).
 *
 * Stops with missing/unusable coordinates are returned in `warnings` and
 * excluded from the sequence.
 */
export function buildNavigationTargets(
  route: OptimizedRouteResult,
  opts?: {
    /** orderIds already completed (e.g. from tracking tokens) — marked completed. */
    completedOrderIds?: Set<string>;
    /** Include a HOME target after each load's drop-off (default true). */
    includeHome?: boolean;
  }
): { targets: NavigationTarget[]; warnings: string[] } {
  const targets: NavigationTarget[] = [];
  const warnings: string[] = [];
  const includeHome = opts?.includeHome !== false;
  let stopNumber = 0;

  const usable = (lat: number | undefined | null, lng: number | undefined | null) =>
    typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0);

  route.loads.forEach((load, loadIndex) => {
    for (const s of load.stops) {
      stopNumber++;
      if (!usable(s.latitude, s.longitude)) {
        warnings.push(`${s.customerName} (${s.orderId}) has no usable GPS coordinates — skipped in navigation.`);
        continue;
      }
      targets.push({
        id: `pickup-${s.orderDbId || s.orderId}`,
        kind: "pickup",
        title: s.customerName,
        subtitle: [s.address, s.city].filter(Boolean).join(", "),
        orderId: s.orderId,
        orderDbId: s.orderDbId,
        lat: s.latitude,
        lng: s.longitude,
        stopNumber,
        points: s.points,
        notes: s.notes,
        phone: s.phone,
        address: s.address,
        city: s.city,
        completed: opts?.completedOrderIds?.has(s.orderId) ?? false,
      });
    }

    const drop = load.dropOff === "DROP_B" ? FIXED_LOCATIONS.DROP_B : FIXED_LOCATIONS.DROP_A;
    targets.push({
      id: `dropoff-${loadIndex}-${load.dropOff}`,
      kind: "dropoff",
      title: drop.name,
      subtitle: drop.address,
      lat: drop.latitude,
      lng: drop.longitude,
      address: drop.address,
    });

    if (includeHome) {
      const isLastLoad = loadIndex === route.loads.length - 1;
      targets.push({
        id: isLastLoad ? "home-final" : `home-${loadIndex}`,
        kind: "home",
        title: isLastLoad ? "Return Home" : `Home (load ${loadIndex + 1} done)`,
        subtitle: FIXED_LOCATIONS.HOME.address,
        lat: FIXED_LOCATIONS.HOME.latitude,
        lng: FIXED_LOCATIONS.HOME.longitude,
        address: FIXED_LOCATIONS.HOME.address,
      });
    }
  });

  // Exclude already-completed stops from the upcoming sequence, but keep them
  // around for the "completed" count (marked, filtered by callers as needed).
  return { targets, warnings };
}

/** Upcoming (not yet completed) targets. */
export function upcomingTargets(targets: NavigationTarget[]): NavigationTarget[] {
  return targets.filter((t) => !t.completed);
}

/** Primary action label for a target. */
export function targetActionLabel(target: NavigationTarget | null, isLast: boolean): string {
  if (!target) return "Continue";
  if (target.kind === "pickup") return "Complete Pickup";
  if (target.kind === "dropoff") return "Confirm Drop-off";
  if (target.kind === "home") return isLast ? "Finish Route" : "Confirm Arrival";
  return "Confirm";
}

// ---------------------------------------------------------------------------
// Session persistence (localStorage) — lightweight resume support.
// Only non-sensitive fields are stored: no customer names/phones/addresses.
// ---------------------------------------------------------------------------

export interface NavSession {
  date: string;
  activeTargetIndex: number;
  muted: boolean;
  updatedAt: number;
}

const NAV_SESSION_KEY = "sidekick-nav-session";

export function loadNavSession(): NavSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NAV_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NavSession>;
    if (typeof parsed.date !== "string" || typeof parsed.activeTargetIndex !== "number") return null;
    return {
      date: parsed.date,
      activeTargetIndex: parsed.activeTargetIndex,
      muted: parsed.muted === true,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveNavSession(session: NavSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage full / private mode — ignore */
  }
}

export function clearNavSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NAV_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
