"use client";

import { useState, useCallback, useEffect } from "react";

const FETCH_CACHE_PREFIX = "sidekick_cache_";

export function useFetchData<T>(url: string) {
  const cacheKey = url ? FETCH_CACHE_PREFIX + url : "";
  const [data, setData] = useState<T | null>(() => {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);
  // isLoading = true only on the very first load when we have no cached data.
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!cacheKey) return false;
    try { return !localStorage.getItem(cacheKey); } catch { return true; }
  });
  const [revalidating, setRevalidating] = useState(false);
  const [version, setVersion] = useState(0);
  const refetch = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // Set loading flags BEFORE the fetch so they're not race-late.
    if (data == null) setIsLoading(true);
    setRevalidating(true);
    setError(null);
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => {
        if (cancelled) return;
        setData(d);
        setError(null);
        // Persist to cache so the next mount paints instantly.
        try { localStorage.setItem(cacheKey, JSON.stringify(d)); } catch { /* quota */ }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
        setRevalidating(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, version]);

  return { data, error, isLoading, revalidating, refetch };
}