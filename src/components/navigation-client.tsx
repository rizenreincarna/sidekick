"use client";

// In-app turn-by-turn navigation — full-screen driver mode.
// Orchestrates: saved-route loading, navigation targets, GPS, the navigation
// engine, voice guidance, wake lock, stop completion, resume, and simulation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  Loader2,
  MapPin,
  Volume2,
  VolumeX,
  Maximize2,
  LocateFixed,
  X,
  AlertTriangle,
  CheckCircle2,
  Play,
  RotateCcw,
  ArrowLeft,
  Satellite,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import NavigationManeuverCard from "@/components/navigation-maneuver-card";
import NavigationBottomPanel from "@/components/navigation-bottom-panel";
import NavigationExitDialog from "@/components/navigation-exit-dialog";
import { useDriverLocation } from "@/hooks/use-driver-location";
import { useSpeechNavigation } from "@/hooks/use-speech-navigation";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useNavigationEngine } from "@/hooks/use-navigation-engine";
import {
  buildNavigationTargets,
  clearNavSession,
  loadNavSession,
  type NavigationTarget,
} from "@/lib/navigation";
import { FIXED_LOCATIONS } from "@/lib/route-model";
import type { OptimizedRouteResult } from "@/lib/vroom";
import type { PathPoint } from "@/lib/geo-utils";

// MapLibre must never render on the server
const NavigationMap = dynamic(() => import("@/components/navigation-map-maplibre"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b1417] text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading map…
    </div>
  ),
});

type Phase = "loading" | "no-route" | "not-started" | "confirm" | "nav" | "load-error";

interface LoadedRoute {
  status: string;
  routeData: OptimizedRouteResult;
}

const HOME_POS: PathPoint[] = [
  [FIXED_LOCATIONS.HOME.latitude, FIXED_LOCATIONS.HOME.longitude],
  [FIXED_LOCATIONS.HOME.latitude + 0.00005, FIXED_LOCATIONS.HOME.longitude + 0.00005],
];

export default function NavigationClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get("date") || format(new Date(), "yyyy-MM-dd");
  const simulate = searchParams.get("simulate") === "1";
  // Simulation speed in m/s (default ~40 km/h; capped at 120 m/s for fast dev testing)
  const simSpeed = Math.min(120, Math.max(2, Number(searchParams.get("speed")) || 11));

  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [route, setRoute] = useState<LoadedRoute | null>(null);
  const [tokens, setTokens] = useState<Record<string, { token: string; completed: boolean }>>({});
  const [navWarnings, setNavWarnings] = useState<string[]>([]);
  const [resumeIndex, setResumeIndex] = useState<number | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [follow, setFollow] = useState(true);
  const [overviewRequest, setOverviewRequest] = useState(0);
  const [startingRoute, setStartingRoute] = useState(false);

  // -------------------------------------------------------------------------
  // Load the saved route for this date
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      try {
        const res = await fetch(`/api/route/navigation?date=${date}`, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          router.push("/");
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "Failed to load the route.");
          setPhase("load-error");
          return;
        }
        if (!data.route) {
          setPhase("no-route");
          return;
        }
        setRoute({ status: data.route.status, routeData: data.route.routeData });
        setTokens(data.tokens || {});
        setPhase(data.route.status === "STARTED" ? "confirm" : "not-started");
      } catch {
        if (!cancelled) {
          setLoadError("Network error — could not reach the server.");
          setPhase("load-error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, router]);

  // -------------------------------------------------------------------------
  // Navigation targets from the optimized VROOM route
  // -------------------------------------------------------------------------
  const baseTargets = useMemo(() => {
    if (!route) return [] as NavigationTarget[];
    const completedOrderIds = new Set(
      Object.entries(tokens)
        .filter(([, v]) => v.completed)
        .map(([orderId]) => orderId)
    );
    const { targets, warnings } = buildNavigationTargets(route.routeData, { completedOrderIds });
    setNavWarnings(warnings);
    return targets;
  }, [route, tokens]);

  const targets = useMemo(
    () => baseTargets.map((t) => (doneIds.has(t.id) ? { ...t, completed: true } : t)),
    [baseTargets, doneIds]
  );

  // Check for a resumable session once targets are known
  useEffect(() => {
    if (phase !== "confirm" || targets.length === 0) return;
    const session = loadNavSession();
    if (session && session.date === date && session.activeTargetIndex > 0) {
      setResumeIndex(session.activeTargetIndex);
    } else {
      setResumeIndex(null);
    }
  }, [phase, targets.length, date]);

  // -------------------------------------------------------------------------
  // Hooks: speech, location, engine
  // -------------------------------------------------------------------------
  const speech = useSpeechNavigation();

  const engineRef = useRef<ReturnType<typeof useNavigationEngine> | null>(null);

  const [simulatePath, setSimulatePath] = useState<PathPoint[] | null>(simulate ? HOME_POS : null);
  const locationActive = phase === "confirm" || phase === "nav";
  const { fix, fixRef, status: gpsStatus } = useDriverLocation({
    enabled: locationActive,
    report: phase === "nav" && !simulate,
    reportExtra: { routeDate: date },
    simulatePath,
    simulateSpeed: simSpeed,
  });

  const engine = useNavigationEngine({
    targets,
    initialTargetIndex: startIndex,
    position: fix,
    active: phase === "nav",
    routeDate: date,
    speak: speech.speak,
    muted: speech.muted,
    onArrive: (t) => {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* unsupported */
      }
      speech.speak(`Arriving at ${t.title}`, { force: true });
    },
  });
  engineRef.current = engine;

  useWakeLock(phase === "nav" && engine.status !== "completed" && engine.status !== "error");

  // Simulation follows the active leg path once available
  useEffect(() => {
    if (!simulate) return;
    if (engine.leg && engine.leg.path.length >= 2) {
      setSimulatePath(engine.leg.path);
    }
  }, [simulate, engine.leg]);

  // Native GPS foreground service while navigating (Android WebView APK).
  // Supports both bridge flavors: AndroidBridge (startGpsTracking) and the
  // dev APK's AndroidGps (start(routeDate)/stop).
  useEffect(() => {
    if (phase !== "nav" || simulate) return;
    const w = window as unknown as {
      AndroidBridge?: { startGpsTracking?: () => void; stopGpsTracking?: () => void };
      AndroidGps?: { start?: (routeDate?: string) => void; stop?: () => void };
    };
    const usingBridge = !!w.AndroidBridge?.startGpsTracking;
    try {
      if (usingBridge) w.AndroidBridge!.startGpsTracking!();
      else w.AndroidGps?.start?.(date);
    } catch {
      /* not in APK */
    }
    return () => {
      try {
        if (usingBridge) w.AndroidBridge!.stopGpsTracking!();
        else w.AndroidGps?.stop?.();
      } catch {
        /* ignore */
      }
    };
  }, [phase, simulate, date]);

  // Clear stale session when the route completes
  useEffect(() => {
    if (engine.status === "completed") clearNavSession();
  }, [engine.status]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const beginNavigation = (index: number) => {
    speech.unlock();
    setStartIndex(index);
    setFollow(true);
    setPhase("nav");
  };

  const startRouteAndNavigate = async () => {
    if (!route) return;
    setStartingRoute(true);
    try {
      const res = await fetch("/api/route/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, routeData: route.routeData, status: "STARTED" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error || "Failed to start the route.");
        return;
      }
      if (data.trackingTokens) {
        const map: Record<string, { token: string; completed: boolean }> = {};
        for (const t of data.trackingTokens as { orderId: string; token: string }[]) {
          map[t.orderId] = { token: t.token, completed: false };
        }
        setTokens((prev) => ({ ...map, ...prev }));
      }
      setPhase("confirm");
    } finally {
      setStartingRoute(false);
    }
  };

  /** Primary button: complete the active target. */
  const handlePrimaryAction = useCallback(async () => {
    const eng = engineRef.current;
    const target = eng?.activeTarget;
    if (!eng || !target) return;
    setCompletionError(null);

    if (target.kind === "pickup") {
      const tracking = target.orderId ? tokens[target.orderId] : undefined;
      if (!tracking?.token) {
        setCompletionError("No tracking link found for this stop — try refreshing, or skip it.");
        return;
      }
      setCompleting(true);
      try {
        const res = await fetch(`/api/track/${tracking.token}/complete`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setCompletionError(data.error || `Could not complete the pickup (HTTP ${res.status}). Tap to retry.`);
          return;
        }
        setTokens((prev) => ({ ...prev, [target.orderId!]: { ...prev[target.orderId!], completed: true } }));
      } catch {
        setCompletionError("Network error — pickup not saved yet. Tap to retry.");
        return;
      } finally {
        setCompleting(false);
      }
    }

    setDoneIds((prev) => new Set(prev).add(target.id));
    eng.confirmActiveTargetComplete();
  }, [tokens]);

  const handleExit = useCallback(() => {
    speech.stop();
    router.push("/route");
  }, [router, speech]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const initialCenter = useMemo(() => {
    const first = targets.find((t) => !t.completed);
    return first
      ? { lat: first.lat, lng: first.lng }
      : { lat: FIXED_LOCATIONS.HOME.latitude, lng: FIXED_LOCATIONS.HOME.longitude };
  }, [targets]);

  const activeStep = engine.leg?.steps[engine.currentStepIndex] ?? null;
  const nextStep = engine.leg?.steps[engine.currentStepIndex + 1] ?? null;
  const navigating = phase === "nav";
  const isLastTarget = engine.upcomingCount <= 1;

  // ---------- Full-screen states ----------

  if (phase === "loading") {
    return (
      <FullScreenMessage>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Loading route for {date}…</p>
      </FullScreenMessage>
    );
  }

  if (phase === "no-route") {
    return (
      <FullScreenMessage>
        <MapPin className="h-10 w-10 text-primary/50" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">No saved route</h1>
        <p className="mt-1 max-w-xs text-center text-sm text-muted-foreground">
          There is no route saved for {date}. Optimize and start a route from the planner first.
        </p>
        <Button onClick={() => router.push("/route")} className="mt-5 gap-2 bg-primary text-primary-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Route Planner
        </Button>
      </FullScreenMessage>
    );
  }

  if (phase === "load-error") {
    return (
      <FullScreenMessage>
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Could not load route</h1>
        <p className="mt-1 max-w-xs text-center text-sm text-muted-foreground">{loadError}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => router.push("/route")} className="border-white/10 bg-white/5">
            Back
          </Button>
          <Button onClick={() => window.location.reload()} className="bg-primary text-primary-foreground">
            Retry
          </Button>
        </div>
      </FullScreenMessage>
    );
  }

  if (phase === "not-started") {
    return (
      <FullScreenMessage>
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Route not started</h1>
        <p className="mt-1 max-w-xs text-center text-sm text-muted-foreground">
          The saved route for {date} exists but hasn&apos;t been started. Start it to enable
          navigation and customer live-tracking.
        </p>
        {loadError && <p className="mt-2 text-sm text-destructive">{loadError}</p>}
        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => router.push("/route")} className="border-white/10 bg-white/5">
            Back
          </Button>
          <Button
            onClick={startRouteAndNavigate}
            disabled={startingRoute}
            className="gap-2 bg-primary text-primary-foreground"
          >
            {startingRoute ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start Route
          </Button>
        </div>
      </FullScreenMessage>
    );
  }

  // ---------- Start / resume confirmation ----------
  if (phase === "confirm") {
    const upcoming = targets.filter((t) => !t.completed);
    return (
      <FullScreenMessage>
        <Satellite className="h-10 w-10 text-primary" />
        <h1 className="mt-3 text-lg font-semibold text-foreground">Ready to navigate</h1>
        <p className="mt-1 max-w-xs text-center text-sm text-muted-foreground">
          {upcoming.length} stop{upcoming.length === 1 ? "" : "s"} remaining for {date}.
          {gpsStatus === "denied"
            ? " GPS permission is denied — navigation will start from Home."
            : gpsStatus === "active"
              ? " GPS locked."
              : " Waiting for GPS…"}
        </p>
        {navWarnings.length > 0 && (
          <div className="mt-3 max-w-xs rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {navWarnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
          </div>
        )}
        <div className="mt-5 flex flex-col items-center gap-2">
          {resumeIndex !== null && resumeIndex > 0 && resumeIndex < upcoming.length ? (
            <>
              <Button onClick={() => beginNavigation(resumeIndex)} className="h-12 w-64 gap-2 bg-primary text-primary-foreground text-base">
                <Play className="h-5 w-5" /> Resume navigation
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  clearNavSession();
                  beginNavigation(0);
                }}
                className="h-12 w-64 gap-2 border-white/10 bg-white/5"
              >
                <RotateCcw className="h-4 w-4" /> Start from beginning
              </Button>
            </>
          ) : (
            <Button onClick={() => beginNavigation(0)} className="h-12 w-64 gap-2 bg-primary text-primary-foreground text-base">
              <Play className="h-5 w-5" /> Start navigation
            </Button>
          )}
          <Button variant="ghost" onClick={() => router.push("/route")} className="text-muted-foreground">
            Back to planner
          </Button>
        </div>
        {simulate && (
          <p className="mt-4 rounded bg-primary/10 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-primary">
            Simulation mode — GPS is simulated, nothing is reported
          </p>
        )}
      </FullScreenMessage>
    );
  }

  // ---------- Completed ----------
  if (engine.status === "completed") {
    return (
      <FullScreenMessage>
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/15">
          <CheckCircle2 className="h-12 w-12 text-primary" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-foreground">Route Complete!</h1>
        <p className="mt-1 text-sm text-muted-foreground">Great work out there, HERO.</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center">
            <div className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">Stops</div>
            <div className="text-xl font-bold text-foreground">{engine.completedCount}/{engine.totalTargets}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center">
            <div className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">Distance</div>
            <div className="text-xl font-bold text-foreground">{((route?.routeData.totalDistanceMeters ?? 0) / 1000).toFixed(1)}<span className="text-xs"> km</span></div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center">
            <div className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">Planned</div>
            <div className="text-xl font-bold text-foreground">{Math.round((route?.routeData.totalDurationSeconds ?? 0) / 60)}<span className="text-xs"> min</span></div>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => router.push("/route")} className="h-12 gap-2 bg-primary text-primary-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Route
          </Button>
          <Button variant="outline" onClick={() => router.push("/")} className="h-12 border-white/10 bg-white/5">
            Close
          </Button>
        </div>
      </FullScreenMessage>
    );
  }

  // ---------- Navigation mode ----------
  return (
    <div className="fixed inset-0 h-dvh w-full overflow-hidden bg-[#0b1417]">
      {/* Map */}
      <NavigationMap
        fixRef={fixRef}
        leg={engine.leg}
        progressMeters={engine.progressMeters}
        targets={targets}
        activeTargetId={engine.activeTarget?.id ?? null}
        completedIds={doneIds}
        follow={follow}
        onFollowChange={setFollow}
        overviewRequest={overviewRequest}
        initialCenter={initialCenter}
      />

      {/* Top: maneuver card + warnings */}
      <div
        className="absolute inset-x-0 top-0 z-10 space-y-2 px-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <NavigationManeuverCard
          step={activeStep}
          nextStep={nextStep}
          distanceToManeuver={engine.distanceToManeuver}
          offRoute={engine.offRoute}
          rerouting={engine.status === "rerouting"}
          offline={engine.leg?.offline ?? false}
        />
        {(engine.status === "requesting-directions") && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0b1417]/95 px-4 py-2.5 text-sm text-[#c9d9d6] backdrop-blur-md">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Getting directions…
          </div>
        )}
        {engine.warning && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-xs text-amber-200 backdrop-blur-md">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{engine.warning}</span>
            <button onClick={engine.clearWarning} aria-label="Dismiss warning" className="shrink-0 text-amber-200/70 hover:text-amber-200">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {gpsStatus === "denied" && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/15 px-4 py-2.5 text-xs text-destructive backdrop-blur-md">
            GPS permission denied — enable location for accurate guidance.
          </div>
        )}
        {simulate && (
          <div className="w-fit rounded bg-primary/15 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-primary">
            Simulation
            {fix && (
              <span className="ml-1.5 font-mono normal-case text-primary/80">
                {fix.lat.toFixed(5)},{fix.lng.toFixed(5)} · {engine.status}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Floating controls (right edge) */}
      <div
        className="absolute right-3 z-10 flex flex-col gap-2"
        style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 7.5rem)" }}
      >
        {!follow && (
          <FabButton label="Recenter" onClick={() => setFollow(true)} highlight>
            <LocateFixed className="h-5 w-5" />
          </FabButton>
        )}
        <FabButton
          label={speech.muted ? "Unmute voice guidance" : "Mute voice guidance"}
          onClick={() => speech.setMuted(!speech.muted)}
        >
          {speech.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </FabButton>
        <FabButton
          label="Overview"
          onClick={() => {
            setFollow(false);
            setOverviewRequest((n) => n + 1);
          }}
        >
          <Maximize2 className="h-5 w-5" />
        </FabButton>
        <FabButton label="Exit navigation" onClick={() => setExitOpen(true)} danger>
          <X className="h-5 w-5" />
        </FabButton>
      </div>

      {/* Bottom panel */}
      {engine.activeTarget && (
        <div className="absolute inset-x-0 bottom-0 z-10">
          <NavigationBottomPanel
            target={engine.activeTarget}
            isLastTarget={isLastTarget}
            stopIndex={engine.completedCount + 1}
            totalTargets={engine.totalTargets}
            completedCount={engine.completedCount}
            arrived={engine.status === "arrived"}
            etaMs={engine.etaMs}
            remainingMeters={engine.remainingMeters}
            remainingSeconds={engine.remainingSeconds}
            completing={completing}
            completionError={completionError}
            onPrimaryAction={handlePrimaryAction}
            onSkip={() => engine.skipActiveTarget()}
          />
        </div>
      )}

      <NavigationExitDialog open={exitOpen} onOpenChange={setExitOpen} onConfirmExit={handleExit} />
    </div>
  );
}

function FabButton({
  children,
  label,
  onClick,
  highlight,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg shadow-black/40 backdrop-blur-md transition-transform active:scale-90 ${
        highlight
          ? "border-primary/50 bg-primary text-primary-foreground"
          : danger
            ? "border-white/10 bg-[#0b1417]/90 text-destructive hover:bg-[#0b1417]"
            : "border-white/10 bg-[#0b1417]/90 text-[#c9d9d6] hover:bg-[#0b1417]"
      }`}
    >
      {children}
    </button>
  );
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center bg-background px-6 text-center">
      {children}
    </div>
  );
}
