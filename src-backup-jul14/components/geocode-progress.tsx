"use client";

import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";

interface GeoProgress {
  total: number;
  done: number;
  status: "running" | "complete" | "cancelled";
  currentOrder?: string | null;
  results?: Array<{ orderId: string; lat: number | null; lng: number | null; error?: string }>;
}

export function GeocodeProgressDrawer({
  sessionId,
  onComplete,
}: {
  sessionId: string | null;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState<GeoProgress | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/geocode?sessionId=${sessionId}`);
        if (res.status === 404) return;
        if (!res.ok) return;
        const data = await res.json() as GeoProgress;
        setProgress(data);
        if (data.status === "complete") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimeout(() => onComplete(), 3000);
        }
      } catch {}
    };

    poll();
    intervalRef.current = setInterval(poll, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [sessionId]);

  if (!sessionId || !progress || dismissed) return null;

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const succeeded = progress.results?.filter(r => r.lat && r.lng).length || 0;
  const failed = progress.results?.filter(r => !r.lat || !r.lng).length || 0;
  const isComplete = progress.status === "complete";

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[320px] max-w-[90vw] pointer-events-auto">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0f172a] border border-white/10 shadow-xl text-xs"
        >
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">Geocoding</span>
          <div className="flex-1 mx-2"><Progress value={pct} className="h-1.5" /></div>
          <span className="text-primary font-semibold">{pct}%</span>
          {!isComplete && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-[#0f172a] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-primary/10 border-b border-white/5">
            <div className="flex items-center gap-2">
              {!isComplete && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              <span className="text-xs font-semibold text-foreground">Geocoding Orders</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setCollapsed(true)} className="p-1 hover:bg-white/10 rounded">
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {isComplete && (
                <button onClick={() => { setDismissed(true); onComplete(); }} className="p-1 hover:bg-white/10 rounded">
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          <div className="p-3 space-y-2">
            <div className="flex items-center gap-3">
              <Progress value={pct} className="flex-1 h-2" />
              <span className="text-[11px] font-semibold text-primary">{pct}%</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>{progress.done}/{progress.total} processed</span>
              <span className="text-emerald-400">{succeeded} found</span>
              {failed > 0 && <span className="text-red-400">{failed} failed</span>}
            </div>
            {progress.currentOrder && !isComplete && (
              <div className="text-[10px] text-muted-foreground bg-white/5 rounded px-2 py-1 truncate">
                Geocoding: #{progress.currentOrder}
              </div>
            )}
            {isComplete && (
              <div className="text-[10px] text-emerald-400 font-medium">
                {succeeded > 0 && `${succeeded} coordinates found. `}
                {failed > 0 && `${failed} failed — check addresses or geocode again.`}
                {succeeded > 0 && !failed && "All addresses geocoded successfully!"}
              </div>
            )}
          </div>
        </div>
    )}
    </div>
  );
}
