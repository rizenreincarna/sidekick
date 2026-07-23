"use client";

// Keeps the screen awake during active navigation.
// Strategy: Screen Wake Lock API where available (re-acquired on visibility
// change) + the Android WebView bridge (AndroidBridge.setKeepScreenOn) which
// sets FLAG_KEEP_SCREEN_ON natively inside the Sidekick APK.

import { useEffect, useRef } from "react";

interface AndroidBridgeKeepScreen {
  setKeepScreenOn?: (on: boolean) => void;
}

function getAndroidBridge(): AndroidBridgeKeepScreen | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { AndroidBridge?: AndroidBridgeKeepScreen }).AndroidBridge ?? null;
}

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
        };
        if (nav.wakeLock?.request) {
          const sentinel = await nav.wakeLock.request("screen");
          if (cancelled) {
            await sentinel.release().catch(() => {});
            return;
          }
          sentinelRef.current = sentinel;
        }
      } catch {
        /* Wake Lock denied / unsupported — Android bridge may still cover it */
      }
    };

    // Native APK bridge (no-op in plain browsers)
    try {
      getAndroidBridge()?.setKeepScreenOn?.(true);
    } catch {
      /* ignore */
    }

    request();
    const onVis = () => {
      if (!document.hidden) request();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
      try {
        getAndroidBridge()?.setKeepScreenOn?.(false);
      } catch {
        /* ignore */
      }
    };
  }, [active]);
}
