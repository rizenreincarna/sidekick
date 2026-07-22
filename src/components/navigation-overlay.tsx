"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Navigation, X, MapPin, Flag, Clock, ChevronUp, ExternalLink, Loader2 } from "lucide-react";

interface Stop {
  orderId: string;
  customerName: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
}

interface Props {
  stops: Stop[];
  driverPosition: { latitude: number; longitude: number } | null;
  onClose: () => void;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function NavigationOverlay({ stops, driverPosition, onClose }: Props) {
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [navitLaunched, setNavitLaunched] = useState(false);

  const currentDest = stops[currentStopIndex];
  const remainingStops = stops.length - currentStopIndex;

  // Launch Navit with google.navigation: URI for turn-by-turn navigation
  const launchNavit = useCallback((dest: Stop) => {
    const androidNav = (window as any).AndroidNav;
    if (androidNav) {
      try {
        androidNav.launchNavigation(dest.latitude, dest.longitude, dest.customerName);
        setNavitLaunched(true);
        return;
      } catch {}
    }
    // Fallback: use google.navigation: URI (works if Navit registered for the URI)
    window.location.href = `google.navigation:ll=${dest.latitude},${dest.longitude}&q=${encodeURIComponent(dest.customerName)}`;
    setNavitLaunched(true);
  }, []);

  // Auto-launch Navit when navigation starts (or when advancing to next stop)
  useEffect(() => {
    if (!currentDest || arrived) return;
    launchNavit(currentDest);
  }, [currentStopIndex, currentDest, arrived, launchNavit]);

  // Poll driver position to detect arrival
  useEffect(() => {
    if (!driverPosition || !currentDest || arrived) return;
    const dist = haversine(
      driverPosition.latitude, driverPosition.longitude,
      currentDest.latitude, currentDest.longitude
    );
    if (dist < 80) {
      setArrived(true);
    }
  }, [driverPosition, currentDest, arrived]);

  const goToNextStop = useCallback(() => {
    const nextIdx = currentStopIndex + 1;
    if (nextIdx >= stops.length) {
      onClose();
      return;
    }
    setCurrentStopIndex(nextIdx);
    setArrived(false);
    setNavitLaunched(false);
  }, [currentStopIndex, stops.length, onClose]);

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-md">
      <div className="mx-auto max-w-lg p-4 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Turn-by-Turn Navigation</h2>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground active:scale-90" title="Exit">
            <X className="h-5 w-5" />
          </button>
        </div>

        {arrived ? (
          /* Arrived screen */
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
              <Flag className="h-8 w-8 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Arrived at pickup</h3>
            <p className="mt-1 text-sm text-muted-foreground">{currentDest?.customerName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{currentDest?.address}</p>
            {currentStopIndex < stops.length - 1 ? (
              <button onClick={goToNextStop} className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-95">
                <Navigation className="h-4 w-4" /> Navigate to next stop ({remainingStops - 1} remaining)
              </button>
            ) : (
              <button onClick={onClose} className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-95">
                <Flag className="h-4 w-4" /> Finish navigation
              </button>
            )}
          </div>
        ) : (
          /* Navigation active — Navit is running */
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            {navitLaunched ? (
              <>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
                  <Navigation className="h-8 w-8 text-primary animate-pulse" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Navit is navigating</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Turn-by-turn voice navigation is active in Navit.
                </p>
                <p className="mt-3 text-xs text-muted-foreground max-w-xs">
                  Destination: <span className="font-medium text-foreground">{currentDest?.customerName}</span>
                  <br />
                  {currentDest?.address}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 text-primary" />
                  Stop {currentStopIndex + 1} of {stops.length}
                </div>
                <button
                  onClick={() => currentDest && launchNavit(currentDest)}
                  className="mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground active:scale-95"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Re-launch Navit
                </button>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">Launching Navit…</p>
                <p className="text-xs text-muted-foreground/70 mt-2 max-w-xs">
                  If Navit doesn't open, install it from the APK sent via Telegram.
                  Then tap "Re-launch Navit".
                </p>
                <button
                  onClick={() => currentDest && launchNavit(currentDest)}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground active:scale-95"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in Navit
                </button>
              </>
            )}

            {/* Stop list */}
            <div className="mt-8 w-full">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remaining stops</div>
              <div className="space-y-1.5">
                {stops.slice(currentStopIndex).map((s, i) => (
                  <div key={s.orderId} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${i === 0 ? "bg-primary/10 border border-primary/20" : "bg-white/5"}`}>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-white/10 text-muted-foreground"}`}>
                      {currentStopIndex + i + 1}
                    </span>
                    <span className="flex-1 truncate font-medium text-foreground">{s.customerName}</span>
                    {i === 0 && <span className="text-[0.625rem] text-primary font-bold">NAVIGATING</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Skip / arrive buttons */}
            <div className="mt-4 flex w-full gap-2">
              <button
                onClick={goToNextStop}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground active:scale-95"
              >
                <ChevronUp className="h-3.5 w-3.5" /> Skip to next stop
              </button>
              <button
                onClick={() => setArrived(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 active:scale-95"
              >
                <Flag className="h-3.5 w-3.5" /> Mark arrived
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
