"use client";

import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2, XCircle, AlertTriangle, Loader2, Search, ChevronDown, ChevronUp, LucideIcon } from "lucide-react";

interface VerificationResult {
  orderId: string;
  verified: boolean;
  confidence: "high" | "medium" | "low";
  note: string;
  normalizedAddress?: string;
  suggestedCity?: string;
  suggestedZone?: number;
}

interface VerificationError {
  orderId: string;
  error: string;
}

interface ProgressData {
  sessionId: string;
  total: number;
  done: number;
  status: "running" | "complete" | "error";
  currentOrder?: string;
  results: VerificationResult[];
  errors: VerificationError[];
  summary: { verified: number; unverified: number; failed: number };
}

export function VerificationProgressDrawer({
  open,
  onClose,
  sessionId,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
  onComplete?: () => void;
}) {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [log, setLog] = useState<Array<VerificationResult | VerificationError>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!sessionId || !open) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/verify-address/batch?sessionId=${sessionId}`);
        if (!res.ok) return;
        const data = await res.json() as ProgressData;
        setProgress(data);

        const newEntries: Array<VerificationResult | VerificationError> = [];
        if (data.results) newEntries.push(...data.results);
        if (data.errors) newEntries.push(...(data.errors.map(e => ({ ...e, verified: false, confidence: "low" as const, note: e.error }))));

        setLog(prev => {
          const seen = new Set(prev.map(e => "orderId" in e ? e.orderId : ""));
          const fresh = newEntries.filter(e => !seen.has("orderId" in e ? e.orderId : ""));
          return [...prev, ...fresh];
        });

        if (data.status === "complete" || data.status === "error") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (data.status === "complete") setTimeout(() => onComplete?.(), 2000);
        }
      } catch {}
    };

    poll();
    intervalRef.current = setInterval(poll, 800);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [sessionId, open]);

  if (!open || dismissed) return null;

  const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;
  const isRunning = progress?.status === "running";
  const isComplete = progress?.status === "complete";

  return (
    <div className="fixed bottom-4 right-4 z-[9998] w-[480px] max-w-[92vw] pointer-events-auto">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0f172a] border border-white/10 shadow-xl text-xs"
        >
          <Shield className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">Address Verification</span>
          <div className="flex-1 mx-2"><Progress value={pct} className="h-1.5" /></div>
          <span className="text-primary font-semibold">{pct}%</span>
          {isRunning && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-[#0f172a] shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`p-1.5 rounded-lg shrink-0 ${isRunning ? "bg-primary/20" : "bg-emerald-500/20"}`}>
                {isRunning ? <Search className="h-4 w-4 text-primary" /> : <Shield className="h-4 w-4 text-emerald-400" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">AI Address Verification</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {isRunning ? `Verifying ${progress?.total ?? "?"} addresses...` : isComplete ? "Verification complete" : "Waiting..."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button onClick={() => setCollapsed(true)} className="p-1.5 hover:bg-white/10 rounded-lg">
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {isComplete && (
                <button onClick={() => { setDismissed(true); onComplete?.(); }} className="p-1.5 hover:bg-white/10 rounded-lg">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Progress bar + current order */}
          <div className="px-4 py-2.5 shrink-0 space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{progress?.done ?? 0} of {progress?.total ?? 0} addresses</span>
              <span className="font-semibold text-primary">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2" />
            {isRunning && progress?.currentOrder && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Verifying: <span className="text-foreground font-medium">#{progress.currentOrder}</span>
              </p>
            )}
          </div>

          {/* Summary badges */}
          {progress && progress.done > 0 && (
            <div className="px-4 pb-2 flex gap-2 shrink-0">
              <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-400 text-[10px] h-5">
                <CheckCircle2 className="h-3 w-3" /> {progress.summary.verified} verified
              </Badge>
              <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-400 text-[10px] h-5">
                <AlertTriangle className="h-3 w-3" /> {progress.summary.unverified} unverified
              </Badge>
              {progress.summary.failed > 0 && (
                <Badge variant="outline" className="gap-1 border-red-500/30 text-red-400 text-[10px] h-5">
                  <XCircle className="h-3 w-3" /> {progress.summary.failed} errors
                </Badge>
              )}
            </div>
          )}

          {/* Results log */}
          <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
            {log.length === 0 && isRunning && (
              <div className="flex flex-col items-center justify-center h-24 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                <p className="text-xs">Starting address verification...</p>
              </div>
            )}
            <div className="space-y-1">
              {log.map((entry, i) => {
                const isResult = "confidence" in entry && entry.confidence !== undefined;
                const isError = "error" in entry && !("confidence" in entry);
                const orderId = "orderId" in entry ? entry.orderId : "";
                const note = isResult ? (entry as VerificationResult).note : (entry as VerificationError).error;

                return (
                  <div
                    key={`${orderId}-${i}`}
                    className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                      isError ? "bg-red-500/5 border border-red-500/10" :
                      isResult ? ((entry as VerificationResult).verified ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-amber-500/5 border border-amber-500/10") :
                      "bg-white/[0.02] border border-white/5"
                    }`}
                  >
                    {isError ? (
                      <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    ) : isResult && (entry as VerificationResult).verified ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-foreground">#{orderId}</span>
                        {isResult && (entry as VerificationResult).confidence && (
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${
                            (entry as VerificationResult).confidence === "high" ? "border-emerald-500/40 text-emerald-400" :
                            (entry as VerificationResult).confidence === "medium" ? "border-amber-500/40 text-amber-400" :
                            "border-red-500/40 text-red-400"
                          }`}>
                            {(entry as VerificationResult).confidence}
                          </Badge>
                        )}
                        {isResult && (entry as VerificationResult).suggestedCity && (
                          <span className="text-[9px] text-muted-foreground">→{(entry as VerificationResult).suggestedCity}</span>
                        )}
                        {isResult && (entry as VerificationResult).suggestedZone && (
                          <span className="text-[9px] text-muted-foreground">Z{(entry as VerificationResult).suggestedZone}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{note}</p>
                      {isResult && (entry as VerificationResult).normalizedAddress && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-1 truncate">
                          Normalized: {(entry as VerificationResult).normalizedAddress}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status footer */}
          <div className="px-4 py-2.5 border-t border-white/5 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isComplete ? (
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />All addresses processed
                </span>
              ) : progress?.status === "error" ? (
                <span className="flex items-center gap-1.5 text-[11px] text-red-400">
                  <XCircle className="h-3.5 w-3.5" />Verification failed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />In progress
                </span>
              )}
            </div>
            <button
              onClick={() => { setDismissed(true); onComplete?.(); }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1 rounded-lg hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
