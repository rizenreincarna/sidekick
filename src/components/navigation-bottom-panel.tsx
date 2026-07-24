"use client";

// Bottom navigation panel: next stop identity, ETA / remaining distance /
// remaining time, primary completion action, and overflow actions
// (call customer, skip stop). Thumb-friendly, dark cockpit styling.

import { useState } from "react";
import {
  Phone,
  SkipForward,
  CheckCircle2,
  Home,
  Package,
  MapPin,
  Loader2,
  ChevronUp,
  ChevronDown,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistance, formatDuration, formatEta } from "@/lib/geo-utils";
import { targetActionLabel, type NavigationTarget } from "@/lib/navigation";

interface Props {
  target: NavigationTarget;
  isLastTarget: boolean;
  totalTargets: number;
  completedCount: number;
  arrived: boolean;
  etaMs: number | null;
  remainingMeters: number | null;
  remainingSeconds: number | null;
  completing: boolean;
  completionError: string | null;
  onPrimaryAction: () => void;
  onSkip: () => void;
}

function kindIcon(kind: NavigationTarget["kind"]) {
  switch (kind) {
    case "home":
      return <Home className="h-4 w-4" />;
    case "dropoff":
      return <Package className="h-4 w-4" />;
    default:
      return <MapPin className="h-4 w-4" />;
  }
}

function kindLabel(kind: NavigationTarget["kind"]) {
  switch (kind) {
    case "pickup":
      return "PICKUP";
    case "dropoff":
      return "DROP-OFF";
    case "home":
      return "HOME";
    default:
      return "STOP";
  }
}

export default function NavigationBottomPanel({
  target,
  isLastTarget,
  totalTargets,
  completedCount,
  arrived,
  etaMs,
  remainingMeters,
  remainingSeconds,
  completing,
  completionError,
  onPrimaryAction,
  onSkip,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingSkip, setConfirmingSkip] = useState(false);

  return (
    <div className="pointer-events-auto rounded-t-2xl border-t border-white/10 bg-[#0b1417]/95 shadow-2xl shadow-black/60 backdrop-blur-md">
      {/* Grabber / progress */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-center gap-2 pt-2 pb-1"
        aria-label={expanded ? "Collapse stop details" : "Expand stop details"}
      >
        <span className="h-1 w-10 rounded-full bg-white/20" />
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      <div className="px-4 pb-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {/* Stop identity */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${arrived ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"}`}>
            {kindIcon(target.kind)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wider text-[#c9d9d6]">
                {kindLabel(target.kind)} · {completedCount + 1}/{totalTargets}
              </span>
              {target.points !== undefined && (
                <span className="text-[0.625rem] text-muted-foreground">{target.points} pts</span>
              )}
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold text-[#F0F6FC]">{target.title}</h2>
            {target.subtitle && (
              <p className="truncate text-xs text-muted-foreground">{target.subtitle}</p>
            )}
          </div>
        </div>

        {/* Expanded details: notes */}
        {expanded && (
          <div className="mt-3 space-y-2">
            {target.notes && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{target.notes}</span>
              </div>
            )}
            {target.address && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {target.address}
                {target.city ? `, ${target.city}` : ""}
              </p>
            )}
          </div>
        )}

        {/* ETA / distance / time */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center">
            <div className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">ETA</div>
            <div className="text-sm font-semibold text-[#F0F6FC] tabular-nums">{etaMs !== null ? formatEta(etaMs) : "—"}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center">
            <div className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">Distance</div>
            <div className="text-sm font-semibold text-[#F0F6FC] tabular-nums">{remainingMeters !== null ? formatDistance(remainingMeters) : "—"}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center">
            <div className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">Time</div>
            <div className="text-sm font-semibold text-[#F0F6FC] tabular-nums">{remainingSeconds !== null ? formatDuration(remainingSeconds) : "—"}</div>
          </div>
        </div>

        {/* Completion error */}
        {completionError && (
          <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs text-destructive">
            {completionError}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-stretch gap-2">
          <Button
            onClick={onPrimaryAction}
            disabled={completing}
            className={`h-14 flex-1 gap-2 text-base font-semibold ${
              arrived
                ? "bg-primary text-primary-foreground hover:bg-primary/90 nav-pulse-ring"
                : "bg-primary/85 text-primary-foreground hover:bg-primary"
            }`}
          >
            {completing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            {completing ? "Saving…" : targetActionLabel(target, isLastTarget)}
          </Button>

          {target.phone && (
            <a
              href={`tel:${target.phone.replace(/[^0-9+]/g, "")}`}
              aria-label={`Call ${target.title}`}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 transition-colors hover:bg-emerald-500/25"
            >
              <Phone className="h-5 w-5" />
            </a>
          )}

          {!isLastTarget && (
            <Button
              variant="outline"
              onClick={() => {
                if (confirmingSkip) {
                  setConfirmingSkip(false);
                  onSkip();
                } else {
                  setConfirmingSkip(true);
                  setTimeout(() => setConfirmingSkip(false), 3000);
                }
              }}
              aria-label="Skip this stop"
              className={`h-14 w-14 shrink-0 border-white/10 ${
                confirmingSkip ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          )}
        </div>
        {confirmingSkip && (
          <p className="mt-1.5 text-center text-[0.625rem] text-amber-400">Tap again to skip this stop (order status unchanged)</p>
        )}
      </div>
    </div>
  );
}
