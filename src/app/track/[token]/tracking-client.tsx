"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Shield, Truck, Navigation, Pin, CheckCircle2, Loader2, Clock, Info, Phone, MessageCircle, MapPin, X } from "lucide-react";
import dynamic from "next/dynamic";
import type { OptimizedRouteResult, VroomStopDetail, VroomLoadPlan } from "@/lib/vroom";

// Dynamically import the 3D map (client-only, uses window/document)
const RouteMap3D = dynamic(() => import("@/components/route-map-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
    </div>
  ),
});

interface MapStop {
  stopNumber: number;
  latitude: number;
  longitude: number;
  customerName: string;
  arrival: number;
  serviceSeconds: number;
  points: number;
  size: string;
  completed: boolean;
  isMine: boolean;
}

interface TrackingData {
  status: "active" | "completed";
  driverStopped?: boolean;
  routeStatus?: string;
  customerName?: string;
  customerAddress?: string | null;
  customerPosition?: { latitude: number; longitude: number };
  stopNumber?: number;
  plannedEta?: string | null;
  driverPosition?: { latitude: number; longitude: number; updatedAt: string } | null;
  eta?: { minutes: number; distanceKm: number; stopsBefore: number } | null;
  routePath?: [number, number][];
  mapStops?: MapStop[];
  currentTime?: string;
  heroName?: string;
  vehicleModel?: string;
  plateNumber?: string;
  vehicleColor?: string;
  routeDate?: string;
  completedAt?: string;
  error?: string;
}

type TrackState = "scheduled" | "live" | "completed" | "stopped";

function convertTrackingToRoute(data: TrackingData): OptimizedRouteResult {
  const stops: VroomStopDetail[] = (data.mapStops || []).map((s, i) => ({
    intId: i + 1,
    orderId: `stop-${s.stopNumber}`,
    orderDbId: `stop-${s.stopNumber}`,
    customerName: s.customerName || `Stop ${s.stopNumber}`,
    address: "",
    city: "",
    phone: "",
    points: s.points || 0,
    zone: 1,
    size: s.size || "",
    notes: null,
    isOffice: false,
    latitude: s.latitude,
    longitude: s.longitude,
    dropOff: "DROP_A" as const,
    arrival: s.arrival || 0,
    departure: (s.arrival || 0) + (s.serviceSeconds || 0),
    serviceSeconds: s.serviceSeconds || 0,
    loadAfter: 0,
  }));

  const load: VroomLoadPlan = {
    vehicleId: 1,
    dropOff: "DROP_A",
    stops,
    dropOffArrival: 0,
    homeArrival: 0,
    durationSeconds: 0,
    distanceMeters: 0,
    loadPoints: 0,
    alternative: {
      dropOff: "DROP_B",
      distanceMeters: 0,
      durationSeconds: 0,
      dropOffArrival: 0,
      homeArrival: 0,
    },
  };

  return {
    date: data.routeDate || "",
    idMapping: [],
    loads: [load],
    totalDistanceMeters: 0,
    totalDurationSeconds: 0,
    totalStops: stops.length,
    totalPoints: 0,
    capacity: 20,
    unassigned: [],
    totalAlternativeDistanceMeters: 0,
    totalAlternativeDurationSeconds: 0,
    source: "vroom",
    summary: { cost: 0, routes: 1, unassigned: 0, duration: 0, distance: 0 },
  };
}

function buildTrackingTokens(data: TrackingData): Record<string, { token: string; completed: boolean }> {
  const tokens: Record<string, { token: string; completed: boolean }> = {};
  for (const s of data.mapStops || []) {
    tokens[`stop-${s.stopNumber}`] = { token: "", completed: s.completed };
  }
  return tokens;
}

function formatMY(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function TrackingClient({ token }: { token: string }) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [toastTimer, setToastTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [followDriver, setFollowDriver] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(interval);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer) clearTimeout(toastTimer);
    setToastTimer(setTimeout(() => setToast(null), 2300));
  }, [toastTimer]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/track/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        setData({ status: "completed", error: json.error || "Tracking link not found" });
      }
    } catch {
      setData({ status: "completed", error: "Failed to load tracking data" });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    // Poll every 5 seconds for near-instant status/GPS updates
    const interval = setInterval(fetchData, 5_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Pre-fetch map tiles (fire-and-forget)
  useEffect(() => {
    if (!data?.mapStops?.length) return;
    const lats = data.mapStops.map(s => s.latitude).filter(Boolean);
    const lons = data.mapStops.map(s => s.longitude).filter(Boolean);
    if (!lats.length || !lons.length) return;
    fetch("/api/tile/prefetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minLat: Math.min(...lats) - 0.02,
        maxLat: Math.max(...lats) + 0.02,
        minLon: Math.min(...lons) - 0.02,
        maxLon: Math.max(...lons) + 0.02,
        zoomLevels: [10, 13, 15, 16, 17],
      }),
    }).catch(() => {});
  }, [data?.mapStops]);

  // Derive route from mapStops ONLY. Serialize the stops for stable comparison
  // so the RouteMap3D init effect doesn't tear down/rebuild the scene on every
  // GPS poll (each poll creates new array references from JSON.parse).
  const stopsKey = JSON.stringify(data?.mapStops?.map((s) => ({ s: s.stopNumber, la: s.latitude, lo: s.longitude, c: s.completed, m: s.isMine })));
  const routeData = useMemo(() => {
    if (!data || data.status !== "active" || !data.mapStops) return null;
    return convertTrackingToRoute(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, data?.status]);

  const trackingTokens = useMemo(() => {
    if (!data || data.status !== "active" || !data.mapStops) return undefined;
    return buildTrackingTokens(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, data?.status]);

  const customerOrderId = data?.stopNumber ? `stop-${data.stopNumber}` : null;
  const heroProfile = useMemo(() => data ? {
    heroName: data.heroName || "Driver",
    plateNumber: data.plateNumber || "",
    vehicleColor: data.vehicleColor || "",
    vehicleModel: data.vehicleModel || "",
  } : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [data?.heroName, data?.plateNumber, data?.vehicleColor, data?.vehicleModel]);

  const myStop = data?.mapStops?.find(s => s.isMine);
  const state: TrackState = !data || data.error ? "scheduled"
    : data.status === "completed" ? "completed"
    : data.driverStopped ? "stopped"
    : data.driverPosition ? "live" : "scheduled";

  const plannedDate = data?.plannedEta ? new Date(data.plannedEta) : null;
  const completedDate = data?.completedAt ? new Date(data.completedAt) : null;

  // ---- Loading: Neon splash ----
  if (loading) {
    return (
      <div className="nc-splash">
        <div className="nc-splash__inner">
          <div className="nc-splash__logo"><Shield className="h-8 w-8" /></div>
          <div>
            <p className="nc-splash__title">Live Tracking</p>
            <p className="nc-splash__copy">Syncing operational telemetry...</p>
          </div>
          <div className="nc-splash__bar"><span /></div>
        </div>
      </div>
    );
  }

  // ---- Error ----
  if (data?.error) {
    return (
      <div className="nc-shell">
        <div className="nc-phone" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="nc-card nc-card--glow" style={{ maxWidth: 360, margin: 24, textAlign: "center" }}>
            <div className="nc-logo" style={{ margin: "0 auto 14px" }}><Pin className="h-6 w-6" /></div>
            <h2 className="text-lg font-extrabold">{data.error}</h2>
            <p className="nc-splash__copy mt-2">This tracking link may have expired or is invalid.</p>
          </div>
        </div>
      </div>
    );
  }

  const statusBadgeClass = state === "live" ? "nc-badge nc-badge--success" : state === "completed" ? "nc-badge nc-badge--success" : state === "stopped" ? "nc-badge nc-badge--danger" : "nc-badge nc-badge--info";
  const statusLabel = state === "live" ? "Live" : state === "completed" ? "Completed" : state === "stopped" ? "Paused" : "Scheduled";

  // Timeline step completion
  const steps = [
    { title: "Order confirmed", desc: `E-waste pickup scheduled for ${data?.routeDate || "today"}.`, done: true },
    { title: "Driver assigned", desc: `${data?.heroName || "Driver"} • ${data?.vehicleModel || "Vehicle"} • ${data?.plateNumber || ""}`, done: true },
    { title: "Driver en route", desc: state === "stopped" ? "Driver has paused live tracking. They may be switching apps or handling an issue." : "Live location appears when the driver starts the route.", done: state === "completed", current: state === "live" || state === "stopped" },
    { title: "Pickup completed", desc: "Your e-waste items are collected and verified.", done: state === "completed" },
  ];
  const progressPct = state === "completed" ? 100 : state === "live" ? 62 : state === "stopped" ? 50 : 35;

  return (
    <div className="nc-shell">
      <div className="nc-phone">
        {/* Neon header */}
        <header className="nc-header">
          <div className="nc-brand-row">
            <div className="nc-brand">
              <div className="nc-logo"><Shield className="h-5 w-5" /></div>
              <div>
                <div className="nc-wordmark">Live Tracking</div>
                <div className="nc-sub">Powered by HERO Sidekick</div>
              </div>
            </div>
            <span className={statusBadgeClass}>
              <span className="inline-block h-[7px] w-[7px] rounded-full bg-current" style={{ boxShadow: "0 0 12px currentColor", animation: state === "live" ? "pulse-soft 1.4s ease-in-out infinite" : undefined }} />
              {statusLabel}
            </span>
          </div>

          {/* Driver chips bar */}
          <div className="nc-actions-row">
            <span className="nc-action-chip" style={{ cursor: "default" }}><Truck className="h-4 w-4" />{data?.heroName || "Driver"}</span>
            {data?.vehicleModel && <span className="nc-action-chip" style={{ cursor: "default" }}><Navigation className="h-4 w-4" />{data.vehicleModel}{data.vehicleColor ? ` • ${data.vehicleColor}` : ""}</span>}
            {data?.plateNumber && <span className="nc-action-chip" style={{ cursor: "default" }}><Shield className="h-4 w-4" />{data.plateNumber}</span>}
            <span className="nc-action-chip" style={{ cursor: "default", color: "var(--nc-muted)" }}><Clock className="h-4 w-4" />Local time {data?.currentTime || "--:--"}</span>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-y-auto" style={{ padding: 16, paddingBottom: 116 }}>
          <div className="space-y-3.5">
            {/* News ticker — continuously running status until pickup completed */}
            {(() => {
              const total = data?.mapStops?.length || 1;
              const stop = data?.stopNumber || 1;
              const tickerText = state === "completed"
                ? `✓ Pickup completed${completedDate ? ` at ${formatMY(completedDate)}` : ""}. Thank you for recycling with ERTH. `
                : state === "stopped"
                  ? `⚠ Driver has paused live tracking. They may be switching apps or handling an issue. Your pickup is still scheduled — please wait. `
                : state === "live" && data?.eta
                  ? `${data.eta.minutes} min estimated arrival • ${data.eta.distanceKm} km away • Stop ${stop} of ${total} • Driver is on the way to ${data?.customerName || "your pickup"}. `
                  : `Pickup scheduled for ${data?.routeDate || "today"}${plannedDate ? ` at ${formatMY(plannedDate)}` : ""} • Stop ${stop} of ${total} • Live driver location will appear once the route starts. `;
              return (
                <div className="nc-ticker" role="status" aria-live="polite" style={state === "stopped" ? { borderColor: "rgba(251,113,133,0.35)" } : undefined}>
                  <div className="nc-ticker__track" style={{ animationPlayState: state === "completed" ? "paused" : "running" }}>
                    <span>{tickerText}</span>
                    <span>{tickerText}</span>
                  </div>
                </div>
              );
            })()}

            {/* Driver stopped exception banner */}
            {state === "stopped" && (
              <div className="nc-card" style={{ padding: 16, borderColor: "rgba(251,113,133,0.35)", background: "rgba(251,113,133,0.06)" }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: "rgba(251,113,133,0.18)", color: "#fb7185" }}>
                    <Info className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-extrabold" style={{ color: "#fb7185" }}>Live tracking paused</div>
                    <div className="text-[0.78rem] mt-1 leading-relaxed" style={{ color: "var(--nc-muted)" }}>
                      The driver ({data?.heroName || "your driver"}) has stopped sharing their live location. This can happen when switching to another app (like Google Maps) or in case of an emergency. Your pickup is still scheduled — please wait for tracking to resume or contact us if you need help.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3D Live Map card */}
            <article className="nc-map-card" aria-label="Live tracking map" style={{ minHeight: 430 }}>
              <div className="absolute inset-0">
                {routeData ? (
                  <RouteMap3D
                    route={routeData}
                    heroProfile={heroProfile}
                    driverPosition={data?.driverPosition ? {
                      latitude: data.driverPosition.latitude,
                      longitude: data.driverPosition.longitude,
                    } : null}
                    routeStatus="STARTED"
                    trackingTokens={trackingTokens}
                    variant="tracking"
                    customerOrderId={customerOrderId}
                    selectedOrderId={customerOrderId}
                    etaInfo={data?.eta ?? null}
                    customRoutePath={data?.routePath ?? null}
                    followDriver={followDriver && state === "live"}
                  />
                ) : state === "completed" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center" style={{ background: "oklch(0.13 0.02 180)" }}>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(52,211,153,0.15)" }}>
                      <CheckCircle2 className="h-8 w-8" style={{ color: "var(--nc-primary)" }} />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold" style={{ color: "var(--nc-text)" }}>Pickup completed</p>
                      <p className="mt-1 text-xs" style={{ color: "var(--nc-muted)" }}>
                        {data?.completedAt ? `Completed at ${formatMY(new Date(data.completedAt))}` : "Thank you for recycling with ERTH."}
                      </p>
                    </div>
                  </div>
                ) : state === "scheduled" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center" style={{ background: "oklch(0.13 0.02 180)" }}>
                    <MapPin className="h-8 w-8" style={{ color: "var(--nc-muted)" }} />
                    <p className="text-xs" style={{ color: "var(--nc-muted)" }}>Live map will appear once the driver starts the route.</p>
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center" style={{ background: "oklch(0.13 0.02 180)" }}>
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                    <p className="text-xs text-muted-foreground">Loading map…</p>
                  </div>
                )}
              </div>

              {/* (removed "3D Live Map" chip — it was blocking the map) */}


              {/* Follow-driver toggle (live only) — bottom-right, sits above the map attribution */}
              {state === "live" && (
                <button
                  type="button"
                  onClick={() => setFollowDriver(v => !v)}
                  title="Follow the driver on the map"
                  className="absolute right-3 bottom-12 z-[4] flex items-center gap-1.5 px-3 py-2 rounded-full text-[0.72rem] font-bold transition-all"
                  style={{
                    background: followDriver ? "linear-gradient(135deg, var(--nc-primary), var(--nc-teal))" : "rgba(7,11,17,0.84)",
                    color: followDriver ? "#04110B" : "var(--nc-text)",
                    border: `1px solid ${followDriver ? "transparent" : "rgba(52,211,153,0.30)"}`,
                    backdropFilter: "blur(8px)",
                    boxShadow: followDriver ? "0 0 18px rgba(52,211,153,0.35)" : undefined,
                  }}
                >
                  <Navigation className="h-3.5 w-3.5" />{followDriver ? "Following" : "Follow"}
                </button>
              )}
            </article>

            {/* Pickup Status timeline */}
            <article className="nc-card nc-card--glow">
              <div className="flex items-center justify-between mb-2.5">
                <span className="nc-micro-label">Pickup Status</span>
                <span className="nc-micro-label">{state === "completed" ? "Completed" : state === "live" ? "Driver en route" : "Scheduled"}</span>
              </div>
              <div className="nc-progress"><span style={{ width: `${progressPct}%` }} /></div>
              <div className="space-y-2.5 mt-3">
                {steps.map((step, i) => {
                  const isDone = step.done;
                  const isCurrent = step.current;
                  return (
                    <div key={i} className="flex gap-3 items-start rounded-[15px] p-3 border" style={{
                      opacity: isDone || isCurrent ? 1 : 0.62,
                      background: isCurrent ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)",
                      borderColor: isCurrent ? "rgba(52,211,153,0.30)" : "rgba(255,255,255,0.07)",
                    }}>
                      <div className="w-[30px] h-[30px] rounded-[11px] grid place-items-center shrink-0" style={{
                        background: isCurrent ? "linear-gradient(135deg, var(--nc-primary), var(--nc-teal))" : isDone ? "var(--nc-primary-soft)" : "rgba(255,255,255,0.05)",
                        color: isCurrent ? "#04110B" : isDone ? "var(--nc-primary)" : "var(--nc-muted)",
                        border: `1px solid ${isCurrent ? "transparent" : isDone ? "rgba(52,211,153,0.30)" : "rgba(255,255,255,0.10)"}`,
                        boxShadow: isCurrent ? "0 0 18px rgba(52,211,153,0.25)" : undefined,
                        animation: isCurrent ? "pulse-soft 1.8s ease-in-out infinite" : undefined,
                      }}>
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Navigation className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="text-[0.86rem] font-extrabold">{step.title}</div>
                        <div className="mt-1 text-[0.76rem] leading-relaxed" style={{ color: "var(--nc-muted)" }}>{step.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            {/* Pickup Details */}
            <article className="nc-card">
              <div className="flex items-center justify-between mb-2.5">
                <span className="nc-micro-label">Pickup Details</span>
                <span className="nc-micro-label">Stop {data?.stopNumber || 1}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="nc-stat">
                  <button type="button" onClick={() => setShowAddress(true)} className="text-left w-full" title="Tap to view full address">
                    <div className="text-[0.94rem] font-extrabold truncate">{data?.customerName || "Your pickup"}</div>
                    <div className="nc-micro-label mt-1 flex items-center gap-1" style={{ color: "var(--nc-primary)" }}>
                      <MapPin className="h-3 w-3" /> Tap to view full address
                    </div>
                  </button>
                </div>
                <div className="nc-stat">
                  <div className="text-[0.94rem] font-extrabold">{plannedDate ? formatMY(plannedDate) : "—"}</div>
                  <div className="nc-micro-label mt-1">Planned arrival</div>
                </div>
                <div className="nc-stat">
                  <div className="text-[0.94rem] font-extrabold">{myStop?.size || "—"}</div>
                  <div className="nc-micro-label mt-1">Pickup size</div>
                </div>
                <div className="nc-stat">
                  <div className="text-[0.94rem] font-extrabold">Stop {data?.stopNumber || 1} of {data?.mapStops?.length || 1}</div>
                  <div className="nc-micro-label mt-1">Route sequence</div>
                </div>
              </div>

              {/* Hero driver row */}
              <div className="flex items-center gap-3 mt-3 rounded-2xl p-3 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.07)" }}>
                <div className="w-[46px] h-[46px] rounded-2xl grid place-items-center text-base font-black" style={{ color: "#04110B", background: "linear-gradient(135deg, var(--nc-primary), var(--nc-teal))", boxShadow: "0 0 24px rgba(52,211,153,0.20)" }}>
                  {(data?.heroName || "D").charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-[0.92rem] font-extrabold">{data?.heroName || "Driver"}</div>
                  <div className="mt-1 text-[0.76rem]" style={{ color: "var(--nc-muted)" }}>
                    HERO driver • {data?.vehicleModel || "Vehicle"}{data?.vehicleColor ? ` • ${data.vehicleColor}` : ""} • {data?.plateNumber || ""}
                  </div>
                </div>
              </div>

            </article>

            {/* Pickup address popup card */}
            {showAddress && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowAddress(false)}>
                <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
                <div className="relative w-full max-w-sm nc-card nc-card--glow" onClick={(e) => e.stopPropagation()} style={{ padding: 20 }}>
                  <button type="button" onClick={() => setShowAddress(false)} className="absolute right-3 top-3 p-1.5 rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground" title="Close">
                    <X className="h-5 w-5" />
                  </button>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: "linear-gradient(135deg, var(--nc-primary), var(--nc-teal))", color: "#04110B" }}>
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-extrabold">Pickup Address</div>
                      <div className="text-[0.72rem]" style={{ color: "var(--nc-muted)" }}>Stop {data?.stopNumber || 1} of {data?.mapStops?.length || 1}</div>
                    </div>
                  </div>
                  <div className="rounded-xl border p-3 mb-3" style={{ background: "rgba(52,211,153,0.06)", borderColor: "rgba(52,211,153,0.20)" }}>
                    <div className="text-[0.625rem] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--nc-muted)" }}>Customer</div>
                    <div className="text-[0.9rem] font-bold mb-2">{data?.customerName || "Your pickup"}</div>
                    <div className="text-[0.625rem] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--nc-muted)" }}>Full address</div>
                    <div className="text-[0.86rem] leading-relaxed" style={{ color: "var(--nc-text)" }}>{data?.customerAddress || "Address not available"}</div>
                  </div>
                  {data?.customerPosition && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${data.customerPosition.latitude},${data.customerPosition.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full rounded-xl px-4 py-3 text-[0.82rem] font-bold transition-colors"
                      style={{ background: "linear-gradient(135deg, var(--nc-primary), var(--nc-teal))", color: "#04110B" }}
                    >
                      <Navigation className="h-4 w-4" /> Open in Google Maps
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="text-center text-[0.68rem] leading-relaxed px-1.5" style={{ color: "rgba(139,148,158,0.8)" }}>
              Live tracking is provided by HERO Sidekick for ERTH e-waste pickups.
              Driver location updates automatically while the route is active.
            </div>
          </div>
        </main>

        {/* Toast */}
        {toast && (
          <div className="absolute left-1/2 z-[120] px-4 py-2.5 rounded-[14px] text-[0.82rem] font-bold" style={{
            bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
            transform: "translateX(-50%)",
            background: "rgba(13,18,26,0.96)",
            border: "1px solid rgba(52,211,153,0.30)",
            color: "var(--nc-text)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.4)",
            maxWidth: "min(92%, 400px)",
          }} role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}