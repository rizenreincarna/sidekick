"use client";

// Turn-by-turn navigation engine — the state machine that ties GPS fixes,
// OSRM legs, voice cues, off-route detection and arrival detection together.
//
// States: loading → ready → requesting-directions → navigating ⇄ rerouting
//         navigating → arrived → (next leg) … → completed
//         any → error (recoverable via retry)
//
// All high-frequency values live in refs; React state updates at GPS cadence
// (throttled upstream in use-driver-location).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cumulativeDistances,
  formatDistance,
  haversineMeters,
  projectOntoPath,
  type LatLng,
  type PathPoint,
} from "@/lib/geo-utils";
import type { NavStep, NavRouteResult } from "@/lib/osrm";
import {
  saveNavSession,
  type NavigationTarget,
  type NavEngineState,
} from "@/lib/navigation";
import { FIXED_LOCATIONS } from "@/lib/route-model";
import type { DriverFix } from "./use-driver-location";

export interface NavLeg {
  path: PathPoint[];
  steps: NavStep[];
  /** Cumulative path distance at which each step's maneuver sits. */
  stepStartDistances: number[];
  /** Cumulative distance at each path vertex. */
  cumDistances: number[];
  distanceMeters: number;
  durationSeconds: number;
  bounds: [[number, number], [number, number]];
  /** True when OSRM was unreachable and this is a straight-line fallback. */
  offline: boolean;
}

interface EngineOptions {
  targets: NavigationTarget[];
  /** Index into the upcoming-target list to start from (resume). */
  initialTargetIndex?: number;
  /** Latest GPS fix (throttled state from use-driver-location). */
  position: DriverFix | null;
  /** Start the machine (user confirmed start/resume). */
  active: boolean;
  /** Route date — used for session persistence. */
  routeDate?: string;
  /** Voice output. */
  speak: (text: string, opts?: { force?: boolean }) => void;
  muted: boolean;
  /** Called whenever the machine detects arrival at the active target. */
  onArrive?: (target: NavigationTarget) => void;
  /** GPS acquisition state from use-driver-location ("idle" | "requesting" |
   *  "active" | "denied" | "unavailable"). Used to decide whether to wait for
   *  a real fix or fall back to Home. */
  gpsStatus?: "idle" | "requesting" | "active" | "denied" | "unavailable";
}

const OFF_ROUTE_THRESHOLD_M = 40;
const OFF_ROUTE_SUSTAIN_MS = 4000;
const REROUTE_COOLDOWN_MS = 15000;
const ARRIVAL_RADIUS_M = 35;
const ARRIVAL_RADIUS_MAX_ACCURACY_M = 60; // auto-arrive only with decent accuracy
const SLOW_ARRIVAL_RADIUS_M = 80;
const SLOW_ARRIVAL_SPEED_MPS = 1.6;
const SLOW_ARRIVAL_SUSTAIN_MS = 6000;
const DEFAULT_SPEED_MPS = 25_000 / 3600; // 25 km/h offline ETA fallback
const FAR_FROM_ROUTE_KM = 100;

export function useNavigationEngine(options: EngineOptions) {
  const { targets, initialTargetIndex = 0, position, active, routeDate, speak, muted, onArrive, gpsStatus = "requesting" } = options;

  const [status, setStatus] = useState<NavEngineState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [startIndex, setStartIndex] = useState(initialTargetIndex);
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => new Set(targets.filter((t) => t.completed).map((t) => t.id))
  );
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [leg, setLeg] = useState<NavLeg | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToManeuver, setDistanceToManeuver] = useState<number | null>(null);
  const [remainingMeters, setRemainingMeters] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [etaMs, setEtaMs] = useState<number | null>(null);
  const [offRoute, setOffRoute] = useState(false);
  const [progressMeters, setProgressMeters] = useState(0);

  const legRef = useRef<NavLeg | null>(null);
  const positionRef = useRef<DriverFix | null>(null);
  const statusRef = useRef<NavEngineState>(status);
  const targetsRef = useRef(targets);
  const completedIdsRef = useRef(completedIds);
  const skippedIdsRef = useRef(skippedIds);
  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const offRouteSinceRef = useRef<number | null>(null);
  const slowSinceRef = useRef<number | null>(null);
  const lastRerouteAtRef = useRef(0);
  const smoothedAlongRef = useRef(0);
  const announcedRef = useRef<{ stepIndex: number; near100: boolean; near300: boolean }>({ stepIndex: -1, near100: false, near300: false });
  const speakRef = useRef(speak);
  const onArriveRef = useRef(onArrive);

  speakRef.current = speak;
  onArriveRef.current = onArrive;
  targetsRef.current = targets;
  statusRef.current = status;
  positionRef.current = position;
  completedIdsRef.current = completedIds;
  skippedIdsRef.current = skippedIds;

  // Resume support: the engine hook mounts before the user taps Start/Resume,
  // so the initialTargetIndex prop can change after mount. Honor it — but only
  // while the machine hasn't started moving (loading/ready), never mid-leg.
  useEffect(() => {
    if (status === "loading" || status === "ready") {
      setStartIndex(initialTargetIndex);
    }
  }, [initialTargetIndex, status]);

  // Abort any in-flight leg request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /** Upcoming = not completed, not skipped. Index 0 is always the next stop;
   *  startIndex only matters for the very first leg (resume support). */
  const upcoming = useMemo(
    () => targets.filter((t) => !t.completed && !completedIds.has(t.id) && !skippedIds.has(t.id)),
    [targets, completedIds, skippedIds]
  );
  const activeTarget: NavigationTarget | null = upcoming[Math.min(startIndex, Math.max(0, upcoming.length - 1))] ?? null;
  const activeTargetRef = useRef(activeTarget);
  activeTargetRef.current = activeTarget;

  // -------------------------------------------------------------------------
  // Leg request (OSRM via server proxy, with offline straight-line fallback)
  // -------------------------------------------------------------------------

  const buildOfflineLeg = useCallback(
    (origin: { lat: number; lng: number }, target: NavigationTarget, speedMps: number | null): NavLeg => {
      const dist = haversineMeters(origin, target);
      const secs = dist / (speedMps && speedMps > 1 ? speedMps : DEFAULT_SPEED_MPS);
      const path: PathPoint[] = [
        [origin.lat, origin.lng],
        [target.lat, target.lng],
      ];
      const steps: NavStep[] = [
        {
          instruction: `Head to ${target.title}`,
          voiceInstruction: `Offline routing. Head directly to ${target.title}.`,
          distanceMeters: dist,
          durationSeconds: secs,
          maneuverType: "offline",
          maneuverModifier: null,
          name: null,
          ref: null,
          location: { lat: origin.lat, lng: origin.lng },
        },
        {
          instruction: "Arrive at destination",
          voiceInstruction: "You have arrived",
          distanceMeters: 0,
          durationSeconds: 0,
          maneuverType: "arrive",
          maneuverModifier: null,
          name: null,
          ref: null,
          location: { lat: target.lat, lng: target.lng },
        },
      ];
      return {
        path,
        steps,
        stepStartDistances: [0, dist],
        cumDistances: cumulativeDistances(path),
        distanceMeters: dist,
        durationSeconds: secs,
        bounds: [
          [Math.min(origin.lat, target.lat), Math.min(origin.lng, target.lng)],
          [Math.max(origin.lat, target.lat), Math.max(origin.lng, target.lng)],
        ],
        offline: true,
      };
    },
    []
  );

  const resetLegTracking = useCallback((newLeg: NavLeg) => {
    legRef.current = newLeg;
    setLeg(newLeg);
    smoothedAlongRef.current = 0;
    announcedRef.current = { stepIndex: -1, near100: false, near300: false };
    offRouteSinceRef.current = null;
    slowSinceRef.current = null;
    setOffRoute(false);
    setProgressMeters(0);
    setCurrentStepIndex(0);
    setRemainingMeters(newLeg.distanceMeters);
    setRemainingSeconds(newLeg.durationSeconds);
    setEtaMs(Date.now() + newLeg.durationSeconds * 1000);
  }, []);

  const requestLeg = useCallback(
    async (origin: { lat: number; lng: number }, target: NavigationTarget, opts?: { reroute?: boolean }) => {
      const seq = ++requestSeqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus(opts?.reroute ? "rerouting" : "requesting-directions");
      if (opts?.reroute) speakRef.current("Rerouting", { force: true });
      setError(null);

      try {
        const res = await fetch("/api/navigation/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: target.lat, lng: target.lng },
          }),
          signal: controller.signal,
        });
        if (seq !== requestSeqRef.current) return; // stale
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Routing failed (HTTP ${res.status})`);
        }
        const data = (await res.json()) as NavRouteResult & { cached?: boolean };
        if (!data.path || data.path.length < 2) throw new Error("Routing returned an empty path");

        const stepStartDistances: number[] = [];
        let acc = 0;
        for (const s of data.steps) {
          stepStartDistances.push(acc);
          acc += s.distanceMeters;
        }
        resetLegTracking({
          path: data.path,
          steps: data.steps,
          stepStartDistances,
          cumDistances: cumulativeDistances(data.path),
          distanceMeters: data.distanceMeters,
          durationSeconds: data.durationSeconds,
          bounds: data.bounds,
          offline: false,
        });
        // Do not clobber a completed route if the driver finished mid-request
        if (statusRef.current !== "completed") setStatus("navigating");
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        // Offline fallback — straight line to the same target, never Google.
        const msg = err instanceof Error ? err.message : "Routing unavailable";
        resetLegTracking(buildOfflineLeg(origin, target, positionRef.current?.speed ?? null));
        setWarning(`Offline routing — ${msg}. Following a straight line to the next stop.`);
        setStatus("navigating");
      }
    },
    [buildOfflineLeg, resetLegTracking]
  );

  const requestLegRef = useRef(requestLeg);
  requestLegRef.current = requestLeg;

  // -------------------------------------------------------------------------
  // Lifecycle: loading → ready → first leg request
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!active) return;
    if (status !== "loading") return;
    if (targets.length === 0) {
      setError("No navigable stops in this route.");
      setStatus("error");
      return;
    }
    if (upcoming.length === 0) {
      setStatus("completed");
      return;
    }
    setStatus("ready");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, status, targets.length, upcoming.length]);

  useEffect(() => {
    if (!active || status !== "ready") return;
    const target = activeTargetRef.current;
    if (!target) return;
    const fix = positionRef.current;
    if (fix) {
      const distToTargetKm = haversineMeters(fix, target) / 1000;
      if (distToTargetKm > FAR_FROM_ROUTE_KM) {
        setWarning(`You are ${Math.round(distToTargetKm)} km from the next stop — check the route date.`);
      }
      requestLegRef.current({ lat: fix.lat, lng: fix.lng }, target);
    } else if (gpsStatus === "denied" || gpsStatus === "unavailable") {
      // GPS truly failed — start from Home so the driver still gets a line.
      setWarning("GPS unavailable — starting from Home. Follow the line to your first stop.");
      requestLegRef.current(
        { lat: FIXED_LOCATIONS.HOME.latitude, lng: FIXED_LOCATIONS.HOME.longitude },
        target
      );
    }
    // else: GPS still acquiring (requesting/active) — hold in "ready" and wait
    // for a real fix rather than prematurely snapping to Home. This effect
    // re-runs whenever `position` or `gpsStatus` change, so the first real fix
    // triggers the leg immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, status, position, gpsStatus]);

  // Persist lightweight session for resume (non-sensitive fields only)
  useEffect(() => {
    if (!active || !routeDate) return;
    saveNavSession({
      date: routeDate,
      activeTargetIndex: targets.length - upcoming.length,
      muted,
      updatedAt: Date.now(),
    });
  }, [active, routeDate, targets.length, upcoming.length, muted]);

  // -------------------------------------------------------------------------
  // Per-fix processing: progress, steps, voice, off-route, arrival
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!position || !active) return;
    const currentLeg = legRef.current;
    if (!currentLeg) return;
    const s = statusRef.current;
    if (s !== "navigating" && s !== "rerouting" && s !== "arrived") return;
    const target = activeTargetRef.current;
    if (!target) return;

    // --- progress along path ---
    let along: number;
    let crossTrack: number;
    if (currentLeg.offline) {
      const remaining = haversineMeters(position, target);
      along = Math.max(0, currentLeg.distanceMeters - remaining);
      crossTrack = 0;
    } else {
      const proj = projectOntoPath(position as LatLng, currentLeg.path, currentLeg.cumDistances);
      if (!proj) return;
      along = proj.alongMeters;
      crossTrack = proj.distanceMeters;
    }
    const prevAlong = smoothedAlongRef.current;
    along = Math.max(prevAlong - 25, along);
    smoothedAlongRef.current = along;
    setProgressMeters(along);

    const remaining = Math.max(0, currentLeg.distanceMeters - along);
    const frac = currentLeg.distanceMeters > 0 ? remaining / currentLeg.distanceMeters : 0;
    const secs = currentLeg.durationSeconds * frac;
    setRemainingMeters(remaining);
    setRemainingSeconds(secs);
    setEtaMs(Date.now() + secs * 1000);

    // --- current step + distance to next maneuver ---
    const starts = currentLeg.stepStartDistances;
    let stepIdx = 0;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] <= along + 5) stepIdx = i;
      else break;
    }
    if (stepIdx !== currentStepIndex) setCurrentStepIndex(stepIdx);
    const stepEnd = stepIdx + 1 < starts.length ? starts[stepIdx + 1] : currentLeg.distanceMeters;
    const toManeuver = Math.max(0, stepEnd - along);
    setDistanceToManeuver(toManeuver);

    // --- voice cues ---
    const step = currentLeg.steps[stepIdx];
    if (step) {
      const announced = announcedRef.current;
      if (announced.stepIndex !== stepIdx) {
        announcedRef.current = { stepIndex: stepIdx, near100: false, near300: false };
        if (step.maneuverType === "arrive") {
          speakRef.current(step.voiceInstruction);
        } else if (step.maneuverType === "depart" || step.maneuverType === "offline") {
          speakRef.current(step.voiceInstruction);
        } else {
          const distText = formatDistance(toManeuver);
          speakRef.current(toManeuver > 200 ? `In ${distText}, ${step.voiceInstruction}` : step.voiceInstruction);
        }
      } else {
        if (!announced.near300 && toManeuver <= 300 && toManeuver > 100 && step.maneuverType !== "arrive" && step.maneuverType !== "depart") {
          announcedRef.current.near300 = true;
          speakRef.current(`In 300 meters, ${step.voiceInstruction}`);
        }
        if (!announced.near100 && toManeuver <= 100 && step.maneuverType !== "arrive" && step.maneuverType !== "depart") {
          announcedRef.current.near100 = true;
          speakRef.current(step.voiceInstruction);
        }
      }
    }

    // --- off-route detection: sustained cross-track error, then reroute (cooled down) ---
    if (!currentLeg.offline && s === "navigating") {
      if (crossTrack > OFF_ROUTE_THRESHOLD_M) {
        if (offRouteSinceRef.current === null) offRouteSinceRef.current = Date.now();
        setOffRoute(true);
        const sustained = Date.now() - offRouteSinceRef.current > OFF_ROUTE_SUSTAIN_MS;
        const cooled = Date.now() - lastRerouteAtRef.current > REROUTE_COOLDOWN_MS;
        if (sustained && cooled) {
          lastRerouteAtRef.current = Date.now();
          offRouteSinceRef.current = null;
          requestLegRef.current({ lat: position.lat, lng: position.lng }, target, { reroute: true });
        }
      } else {
        offRouteSinceRef.current = null;
        setOffRoute(false);
      }
    }

    // --- arrival detection ---
    if (s !== "arrived") {
      const distToTarget = haversineMeters(position, target);
      const accuracyOk = position.accuracy === null || position.accuracy <= ARRIVAL_RADIUS_MAX_ACCURACY_M;
      let arrivedNow = false;
      if (distToTarget <= ARRIVAL_RADIUS_M && accuracyOk) {
        arrivedNow = true;
      } else if (
        distToTarget <= SLOW_ARRIVAL_RADIUS_M &&
        (position.speed === null || position.speed < SLOW_ARRIVAL_SPEED_MPS)
      ) {
        if (slowSinceRef.current === null) slowSinceRef.current = Date.now();
        if (Date.now() - slowSinceRef.current > SLOW_ARRIVAL_SUSTAIN_MS) arrivedNow = true;
      } else {
        slowSinceRef.current = null;
      }
      if (arrivedNow) {
        setStatus("arrived");
        speakRef.current(`Arriving at ${target.title}`, { force: true });
        onArriveRef.current?.(target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, active]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /** Mark the active target complete and advance to the next one. */
  const confirmActiveTargetComplete = useCallback(() => {
    const target = activeTargetRef.current;
    if (!target) return;
    const nextCompleted = new Set(completedIdsRef.current).add(target.id);
    setCompletedIds(nextCompleted);

    const remaining = targetsRef.current.filter(
      (t) => !t.completed && !nextCompleted.has(t.id) && !skippedIdsRef.current.has(t.id)
    );
    if (remaining.length === 0) {
      setStatus("completed");
      speakRef.current("Route complete. Great work!", { force: true });
      return;
    }
    setStartIndex(0);
    const next = remaining[0];
    const origin = positionRef.current
      ? { lat: positionRef.current.lat, lng: positionRef.current.lng }
      : { lat: target.lat, lng: target.lng };
    requestLegRef.current(origin, next);
  }, []);

  /** Skip the active target without completing it (does not change order status). */
  const skipActiveTarget = useCallback(() => {
    const target = activeTargetRef.current;
    if (!target) return;
    const nextSkipped = new Set(skippedIdsRef.current).add(target.id);
    setSkippedIds(nextSkipped);

    const remaining = targetsRef.current.filter(
      (t) => !t.completed && !completedIdsRef.current.has(t.id) && !nextSkipped.has(t.id)
    );
    if (remaining.length === 0) {
      setStatus("completed");
      return;
    }
    setStartIndex(0);
    const origin = positionRef.current
      ? { lat: positionRef.current.lat, lng: positionRef.current.lng }
      : { lat: target.lat, lng: target.lng };
    requestLegRef.current(origin, remaining[0]);
  }, []);

  const retryLeg = useCallback(() => {
    const target = activeTargetRef.current;
    if (!target) return;
    const origin = positionRef.current
      ? { lat: positionRef.current.lat, lng: positionRef.current.lng }
      : { lat: FIXED_LOCATIONS.HOME.latitude, lng: FIXED_LOCATIONS.HOME.longitude };
    requestLegRef.current(origin, target);
  }, []);

  const clearWarning = useCallback(() => setWarning(null), []);

  return {
    status,
    error,
    warning,
    clearWarning,
    setError,
    setStatus,
    activeTarget,
    upcomingCount: upcoming.length,
    totalTargets: targets.length,
    completedCount: targets.filter((t) => t.completed || completedIds.has(t.id)).length,
    leg,
    currentStepIndex,
    distanceToManeuver,
    remainingMeters,
    remainingSeconds,
    etaMs,
    offRoute,
    progressMeters,
    confirmActiveTargetComplete,
    skipActiveTarget,
    retryLeg,
  };
}
