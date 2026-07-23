"use client";

// Voice guidance hook. Prefers the Android WebView native TTS bridge
// (window.AndroidTTS.speak, injected by the Sidekick APK) and falls back to
// the browser SpeechSynthesis API. Mute preference persists in localStorage.
// Speech must be unlocked by a user gesture on some browsers/WebViews — call
// unlock() from a tap handler.

import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "sidekick-nav-muted";

interface AndroidTTSBridge {
  speak: (text: string) => void;
  stop?: () => void;
}

function getAndroidTTS(): AndroidTTSBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { AndroidTTS?: AndroidTTSBridge }).AndroidTTS;
  return bridge && typeof bridge.speak === "function" ? bridge : null;
}

export function useSpeechNavigation() {
  const [muted, setMutedState] = useState(false);
  const [supported, setSupported] = useState(true);
  const unlockedRef = useRef(false);
  const lastSpokenRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  // Hydrate mute preference + detect support
  useEffect(() => {
    try {
      setMutedState(window.localStorage.getItem(MUTE_KEY) === "1");
    } catch {
      /* ignore */
    }
    setSupported(!!getAndroidTTS() || ("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"));
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) {
      // Stop any in-flight speech immediately
      getAndroidTTS()?.stop?.();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }
  }, []);

  /** Warm up speech engines — call from a user gesture (tap). */
  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    if ("speechSynthesis" in window) {
      try {
        // Chrome requires an utterance after a gesture to enable later programmatic speech
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch {
        /* ignore */
      }
    }
  }, []);

  /** Speak an instruction. Dedupes repeats within 4s. No-op when muted. */
  const speak = useCallback(
    (text: string, opts?: { force?: boolean }) => {
      if (muted || !text) return;
      const now = Date.now();
      if (!opts?.force && lastSpokenRef.current.text === text && now - lastSpokenRef.current.at < 4000) return;
      lastSpokenRef.current = { text, at: now };

      const android = getAndroidTTS();
      if (android) {
        try {
          android.speak(text);
          return;
        } catch {
          /* fall through to web speech */
        }
      }
      if ("speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.rate = 1.0;
          u.pitch = 1.0;
          window.speechSynthesis.speak(u);
        } catch {
          /* ignore */
        }
      }
    },
    [muted]
  );

  const stop = useCallback(() => {
    getAndroidTTS()?.stop?.();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return { muted, setMuted, speak, stop, unlock, supported };
}
