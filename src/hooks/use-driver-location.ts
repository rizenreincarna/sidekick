"use client";

// Live driver GPS hook: wraps navigator.geolocation.watchPosition with
// jump-filtering, derived heading, throttled React state, driver-location
// reporting to the existing /api/driver/location endpoint, and a simulation
// mode (?simulate=1) that animates along a path WITHOUT reporting to the server.

import { useEffect, useRef, useState } from "react";
import { bearingDegrees, haversineMeters, pointAlongPath, cumulativeDistances, type LatLng, type PathPoint } from "@/lib/geo-utils";

export interface DriverFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  /** m/s (null when unknown) */
  speed: number | null;
  /** degrees 0..360 (null when unknown and not derivable) */
  heading: number | null;
  timestamp: number;
}

export type GpsStatus = "idle" | "requesting" | "active" | "denied" | "unavailable";

interface Options {
  /** Enable the watcher (default true). */
  enabled?: boolean;
  /** Report position to /api/driver/location every ~10s (default true). */
  report?: boolean;
  /** Extra fields sent with the location report (e.g. routeDate). */
  reportExtra?: Record<string, unknown>;
  /** Simulation path ([lat,lng] tuples). When set, GPS is NOT used and nothing is reported. */
  simulatePath?: PathPoint[] | null;
  /** Simulation speed in m/s (default ~33 km/h). */
  simulateSpeed?: number;
}

const REPORT_INTERVAL_MS = 10_000;
const STATE_THROTTLE_MS = 750;
const MAX_ACCEPTED_ACCURACY_M = 150;
const JUMP_DISTANCE_M = 250; // ignore teleports larger than this within 3s
const JUMP_TIME_MS = 3000;

export function useDriverLocation(options?: Options) {
  const enabled = options?.enabled !== false;
  const report = options?.report !== false;
  const simulatePath = options?.simulatePath ?? null;
  const simulateSpeed = options?.simulateSpeed ?? 9;

  const [fix, setFix] = useState<DriverFix | null>(null);
  const [status, setStatus] = useState<GpsStatus>("idle");

  /** Latest fix — updated immediately (not throttled). Safe for animation loops. */
  const fixRef = useRef<DriverFix | null>(null);
  const lastStateAtRef = useRef(0);
  const lastReportAtRef = useRef(0);
  const lastAcceptedRef = useRef<DriverFix | null>(null);
  const reportExtraRef = useRef(options?.reportExtra);
  const reportRef = useRef(report);
  reportExtraRef.current = options?.reportExtra;
  reportRef.current = report;

  const simulating = !!simulatePath && simulatePath.length >= 2;

  // Push a new fix into ref + throttled state, optionally report to server.
  const acceptFix = (next: DriverFix, isSim: boolean) => {
    fixRef.current = next;
    const now = Date.now();
    if (now - lastStateAtRef.current >= STATE_THROTTLE_MS) {
      lastStateAtRef.current = now;
      setFix(next);
    }
    if (!isSim && reportRef.current && now - lastReportAtRef.current >= REPORT_INTERVAL_MS) {
      lastReportAtRef.current = now;
      fetch("/api/driver/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: next.lat,
          longitude: next.lng,
          heading: next.heading,
          speed: next.speed,
          ...(reportExtraRef.current ?? {}),
        }),
      }).catch(() => {});
    }
  };

  // --- Simulation mode: animate along the given path. ---
  // Uses a timer (not rAF) with real elapsed time so progress stays correct
  // even when the browser throttles animation frames (headless / background).
  useEffect(() => {
    if (!enabled || !simulating || !simulatePath) return;
    setStatus("active");
    const cum = cumulativeDistances(simulatePath);
    const total = cum[cum.length - 1];
    let along = 0;
    let last = Date.now();

    const tick = () => {
      const now = Date.now();
      const dt = Math.min(2, (now - last) / 1000);
      last = now;
      along = Math.min(total, along + simulateSpeed * dt);
      const p = pointAlongPath(simulatePath, cum, along);
      const ahead = pointAlongPath(simulatePath, cum, Math.min(total, along + 8));
      acceptFix(
        {
          lat: p.lat,
          lng: p.lng,
          accuracy: 5,
          speed: simulateSpeed,
          heading: bearingDegrees(p, ahead),
          timestamp: now,
        },
        true
      );
    };
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, simulating]);

  // --- Real GPS mode ---
  useEffect(() => {
    if (!enabled || simulating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("requesting");

    const onSuccess = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      const candidate: DriverFix = {
        lat: latitude,
        lng: longitude,
        accuracy: typeof accuracy === "number" ? accuracy : null,
        speed: typeof speed === "number" && isFinite(speed) && speed >= 0 ? speed : null,
        heading: typeof heading === "number" && isFinite(heading) && !Number.isNaN(heading) ? heading : null,
        timestamp: pos.timestamp || Date.now(),
      };

      // Filter wildly inaccurate fixes once we have a lock
      const prev = lastAcceptedRef.current;
      if (prev && candidate.accuracy !== null && candidate.accuracy > MAX_ACCEPTED_ACCURACY_M) {
        return;
      }
      // Filter GPS jumps (teleport glitches)
      if (prev) {
        const dist = haversineMeters(prev, candidate);
        const dt = candidate.timestamp - prev.timestamp;
        if (dist > JUMP_DISTANCE_M && dt < JUMP_TIME_MS) return;
        // Derive heading from movement when the device doesn't provide it
        if (candidate.heading === null && dist > 3) {
          candidate.heading = bearingDegrees(prev, candidate);
        }
        // Derive speed if missing
        if (candidate.speed === null && dt > 500) {
          candidate.speed = dist / (dt / 1000);
        }
      }

      lastAcceptedRef.current = candidate;
      setStatus("active");
      acceptFix(candidate, false);
    };

    const onError = (err: GeolocationPositionError) => {
      setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
    };

    const opts: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 };
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(onSuccess, onError, opts);
    } catch {
      setStatus("unavailable");
    }
    // Backup poll — some WebViews stall watchPosition
    const poll = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(onSuccess, () => {}, opts);
    }, 5000);
    const onVis = () => {
      if (!document.hidden) navigator.geolocation.getCurrentPosition(onSuccess, () => {}, opts);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, simulating]);

  return { fix, fixRef, status, simulating };
}
