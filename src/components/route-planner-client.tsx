"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, MapPin, Sparkles, ArrowLeft, Route as RouteIcon } from "lucide-react";
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

  // Load any saved route for the selected date
  const loadSaved = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/route/preview?date=${d}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.route) {
          setRoute(data.route.routeData);
          setRouteStatus(data.route.status);
          return;
        }
      }
      setRoute(null);
      setRouteStatus("OPTIMIZED");
    } catch {
      /* ignore */
    }
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const saveRoute = async (status?: string) => {
    if (!route) return;
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
      } else {
        setError(data.error || "Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const onSelectStop = (stop: VroomStopDetail) => setSelectedOrderId(stop.orderId);

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
              onStartRoute={() => saveRoute("STARTED")}
              saving={saving}
              routeStatus={routeStatus}
            />
          </aside>
        )}
      </div>
    </div>
  );
}