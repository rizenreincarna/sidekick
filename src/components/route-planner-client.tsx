"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, MapPin, Sparkles, ArrowLeft, Route as RouteIcon, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RouteSummaryPanel from "@/components/route-summary-panel";
import type { OptimizedRouteResult, VroomStopDetail } from "@/lib/vroom";

// Three.js uses window/document — MUST be imported with ssr: false.
const RouteMap3D = dynamic(() => import("@/components/route-map-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading 3D map…
    </div>
  ),
});

export default function RoutePlannerClient() {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [route, setRoute] = useState<OptimizedRouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [routeStatus, setRouteStatus] = useState<string>("OPTIMIZED");
  const [panelOpen, setPanelOpen] = useState(true);
  const [trackingTokens, setTrackingTokens] = useState<Record<string, { token: string; completed: boolean }>>({});
  const [heroProfile, setHeroProfile] = useState<{ heroName: string; plateNumber: string; vehicleColor: string; vehicleModel: string; homeLatitude?: number | null; homeLongitude?: number | null } | null>(null);
  const [driverPosition, setDriverPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  // Load any saved route for the selected date
  const loadSaved = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/route/preview?date=${d}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.route) {
          setRoute(data.route.routeData);
          setRouteStatus(data.route.status);
          // Pre-fetch map tiles for the route area (fire-and-forget)
          const rd = data.route.routeData;
          if (rd?.loads?.length) {
            const allStops = rd.loads.flatMap((l) => l.stops);
            const lats = allStops.map((s) => s.latitude).filter(Boolean);
            const lons = allStops.map((s) => s.longitude).filter(Boolean);
            if (lats.length && lons.length) {
              fetch("/api/tile/prefetch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  minLat: Math.min(...lats) - 0.02,
                  maxLat: Math.max(...lats) + 0.02,
                  minLon: Math.min(...lons) - 0.02,
                  maxLon: Math.max(...lons) + 0.02,
                }),
              }).catch(() => {});
            }
          }
          // Load tracking tokens for this date
          const trackRes = await fetch(`/api/route/track-tokens?date=${d}`, { cache: "no-store" });
          if (trackRes.ok) {
            const trackData = await trackRes.json();
            if (trackData.tokens) setTrackingTokens(trackData.tokens);
          }
          return;
        }
      }
      setRoute(null);
      setRouteStatus("OPTIMIZED");
      setTrackingTokens({});
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch hero profile once
  useEffect(() => {
    fetch("/api/hero/profile", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d?.profile ? setHeroProfile(d.profile) : null)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSaved(date);
  }, [date, loadSaved]);

  const optimize = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/route/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Optimization failed");
        setRoute(null);
      } else {
        setRoute(data.route);
        setRouteStatus("OPTIMIZED");
        // Pre-fetch map tiles for the route area (fire-and-forget, runs in background)
        if (data.route?.loads?.length) {
          const allStops = data.route.loads.flatMap((l) => l.stops);
          if (allStops.length > 0) {
            const lats = allStops.map((s) => s.latitude).filter(Boolean);
            const lons = allStops.map((s) => s.longitude).filter(Boolean);
            if (lats.length && lons.length) {
              fetch("/api/tile/prefetch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  minLat: Math.min(...lats) - 0.02,
                  maxLat: Math.max(...lats) + 0.02,
                  minLon: Math.min(...lons) - 0.02,
                  maxLon: Math.max(...lons) + 0.02,
                }),
              }).catch(() => {});
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const saveRoute = async (status?: string): Promise<boolean> => {
    if (!route) return false;
    setSaving(true);
    try {
      const res = await fetch("/api/route/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, routeData: route, status }),
      });
      const data = await res.json();
      if (res.ok) {
        if (status === "STARTED") setRouteStatus("STARTED");
        // Store tracking tokens from save response
        if (data.trackingTokens) {
          const tokens: Record<string, { token: string; completed: boolean }> = {};
          for (const t of data.trackingTokens) {
            tokens[t.orderId] = { token: t.token, completed: false };
          }
          setTrackingTokens(tokens);
        }
        return true;
      } else {
        setError(data.error || "Save failed");
        return false;
      }
    } finally {
      setSaving(false);
    }
  };

  // Start Route → save as STARTED (keeps tracking links + live GPS behavior),
  // then enter the full-screen in-app navigation mode.
  const startAndNavigate = async () => {
    const ok = await saveRoute("STARTED");
    if (ok) router.push(`/route/navigate?date=${date}`);
  };

  // Send GPS location continuously when route is started.
  // Uses watchPosition (fires on real movement) + a backup 10s interval
  // for reliability (WebView watchPosition can stall on some devices).
  const [gpsStatus, setGpsStatus] = useState<"idle" | "active" | "error">("idle");
  useEffect(() => {
    if (routeStatus !== "STARTED") return;

    // --- Native foreground service (Android APK) ---
    // When running inside the WebView APK, start the native GPS foreground service
    // so location keeps uploading even when the app is backgrounded (e.g. driver
    // switches to Google Maps). The bridge is injected by MainActivity as AndroidBridge.
    const androidBridge = (window as any).AndroidBridge;
    if (androidBridge) {
      try { androidBridge.startGpsTracking(); } catch {}
    }

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }
    let watchId: number | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let lastSent = 0;

    const sendPos = (pos: GeolocationPosition) => {
      // Throttle to every 5s max (watchPosition can fire rapidly)
      const now = Date.now();
      if (now - lastSent < 5000) return;
      lastSent = now;
      setGpsStatus("active");
      fetch("/api/driver/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          routeDate: date,
        }),
      }).catch(() => {});
    };

    const onError = (err: GeolocationPositionError) => {
      console.warn("[GPS] geolocation error:", err.code, err.message);
      setGpsStatus("error");
    };

    const opts = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 };

    // Primary: watchPosition (continuous, fires on movement)
    try {
      watchId = navigator.geolocation.watchPosition(sendPos, onError, opts);
    } catch {
      // Fallback to interval-only polling
    }

    // Backup: also poll every 10s (in case watchPosition stalls)
    const poll = () => navigator.geolocation.getCurrentPosition(sendPos, onError, opts);
    interval = setInterval(poll, 10_000);

    // Resume tracking when the page becomes visible again (after backgrounding)
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      // Stop the native foreground GPS service when the route is no longer active
      const androidBridge = (window as any).AndroidBridge;
      if (androidBridge) { try { androidBridge.stopGpsTracking(); } catch {} }
    };
  }, [routeStatus, date]);

  // Poll driver GPS position for the 3D map orb (every 10s when route is started)
  useEffect(() => {
    if (routeStatus !== "STARTED") return;
    const fetchLoc = async () => {
      try {
        const res = await fetch("/api/driver/location", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.location) {
            setDriverPosition({ latitude: data.location.latitude, longitude: data.location.longitude });
          } else {
            setDriverPosition(null);
          }
        }
      } catch {
        /* ignore */
      }
    };
    fetchLoc();
    const interval = setInterval(fetchLoc, 10_000);
    return () => clearInterval(interval);
  }, [routeStatus]);

  // Mark a pickup as complete
  const markComplete = useCallback(async (orderId: string, token: string) => {
    try {
      const res = await fetch(`/api/track/${token}/complete`, { method: "POST" });
      if (res.ok) {
        setTrackingTokens((prev) => ({
          ...prev,
          [orderId]: { ...prev[orderId], completed: true },
        }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Undo a completed pickup
  const undoComplete = useCallback(async (orderId: string, token: string) => {
    try {
      const res = await fetch(`/api/track/${token}/complete`, { method: "DELETE" });
      if (res.ok) {
        setTrackingTokens((prev) => ({
          ...prev,
          [orderId]: { ...prev[orderId], completed: false },
        }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onSelectStop = useCallback((stop: VroomStopDetail) => {
    setSelectedOrderId((prev) => (prev === stop.orderId ? null : stop.orderId));
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Header — matches main app brand row */}
      <header className="border-b border-white/10 bg-background">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          {/* Back to app */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="h-5 w-px bg-white/10" />
          {/* Brand */}
          <div className="flex items-center gap-2 min-w-0">
            <RouteIcon className="h-5 w-5 shrink-0 text-primary" />
            <h1 className="text-sm font-semibold uppercase tracking-widest text-[#F0F6FC] leading-tight truncate">
              Route Optimizer
            </h1>
            {routeStatus === "STARTED" && (
              <button
                type="button"
                onClick={() => {
                  if (!confirm("Stop GPS tracking? The customer's live tracking link will go offline.")) return;
                  // Stop native foreground service
                  const androidBridge = (window as any).AndroidBridge;
                  if (androidBridge) { try { androidBridge.stopGpsTracking(); } catch {} }
                  setGpsStatus("error");
                  setRouteStatus("STOPPED");
                  // Persist STOPPED status so the tracking API knows the driver stopped
                  saveRoute("STOPPED");
                  // Clear driver position on the server so the tracking link shows the exception
                  fetch("/api/driver/location", { method: "DELETE" }).catch(() => {});
                }}
                title="Emergency: stop GPS tracking immediately"
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[0.625rem] font-bold transition-transform active:scale-90"
                style={{
                  background: gpsStatus === "active" ? "rgba(52,211,153,0.15)" : gpsStatus === "error" ? "rgba(251,113,133,0.15)" : "rgba(148,163,184,0.10)",
                  color: gpsStatus === "active" ? "#34D399" : gpsStatus === "error" ? "#fb7185" : "#8aa8a3",
                }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "currentColor", boxShadow: gpsStatus === "active" ? "0 0 8px currentColor" : undefined, animation: gpsStatus === "active" ? "pulse-soft 1.4s ease-in-out infinite" : undefined }} />
                GPS {gpsStatus === "active" ? "live" : gpsStatus === "error" ? "off" : "…"}
              </button>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-[150px] border-white/10 bg-white/5 text-sm text-foreground"
            />
            <Button
              onClick={optimize}
              disabled={loading}
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Optimize
            </Button>
            {route && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPanelOpen((v) => !v)}
                className="gap-1.5 border-white/10 bg-white/5 hover:bg-white/10 lg:hidden"
              >
                {panelOpen ? "Map" : "Stops"}
              </Button>
            )}
            {route && routeStatus === "STARTED" && (
              <Button
                onClick={() => router.push(`/route/navigate?date=${date}`)}
                size="sm"
                className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Navigation className="h-4 w-4" />
                Navigate
              </Button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Body: map (flex-1) + panel (fixed width on lg) */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div
          className={`relative flex-1 ${panelOpen ? "hidden lg:block" : "block"}`}
          style={{ minHeight: 300 }}
        >
          {route ? (
            <RouteMap3D
              route={route}
              onSelectStop={onSelectStop}
              selectedOrderId={selectedOrderId}
              heroProfile={heroProfile}
              driverPosition={driverPosition}
              routeStatus={routeStatus}
              trackingTokens={trackingTokens}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-background text-center text-muted-foreground">
              <MapPin className="mb-3 h-12 w-12 text-primary/40" />
              <p className="max-w-xs text-sm leading-relaxed">
                Pick a date and tap{" "}
                <span className="font-semibold text-primary">Optimize</span> to
                plan your pickups on a 3D map.
              </p>
            </div>
          )}
        </div>

        {route && (
          <aside
            className={`w-full shrink-0 bg-card lg:w-[340px] lg:min-w-[320px] ${
              panelOpen ? "block" : "hidden lg:block"
            }`}
            style={{ height: "100%" }}
          >
            <RouteSummaryPanel
              route={route}
              selectedOrderId={selectedOrderId}
              onSelectStop={onSelectStop}
              onSaveRoute={() => saveRoute()}
              onStartRoute={startAndNavigate}
              saving={saving}
              routeStatus={routeStatus}
              trackingTokens={trackingTokens}
              routeDate={date}
              onMarkComplete={markComplete}
              onUndoComplete={undoComplete}
            />
          </aside>
        )}
      </div>

    </div>
  );
}