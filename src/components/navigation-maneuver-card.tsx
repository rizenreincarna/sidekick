"use client";

// Top maneuver banner: big icon, distance-to-maneuver, instruction text,
// street name, and a "Then …" preview of the following step.

import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  CornerUpLeft,
  CornerUpRight,
  Undo2,
  RefreshCw,
  Merge,
  Split,
  Flag,
  Navigation,
  LogIn,
  LogOut,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { maneuverIconKey, type NavStep } from "@/lib/osrm";
import { formatDistance } from "@/lib/geo-utils";

const ICONS: Record<string, LucideIcon> = {
  straight: ArrowUp,
  left: ArrowLeft,
  right: ArrowRight,
  "slight-left": ArrowUpLeft,
  "slight-right": ArrowUpRight,
  "sharp-left": CornerUpLeft,
  "sharp-right": CornerUpRight,
  uturn: Undo2,
  roundabout: RefreshCw,
  merge: Merge,
  "fork-left": Split,
  "fork-right": Split,
  ramp: LogIn,
  exit: LogOut,
  arrive: Flag,
  depart: Navigation,
  offline: Compass,
};

export function ManeuverIcon({ type, modifier, className }: { type: string; modifier?: string | null; className?: string }) {
  const key = maneuverIconKey(type, modifier ?? null);
  const Icon = ICONS[key] ?? ArrowUp;
  return <Icon className={className} aria-hidden />;
}

interface Props {
  step: NavStep | null;
  nextStep: NavStep | null;
  distanceToManeuver: number | null;
  offRoute: boolean;
  rerouting: boolean;
  offline: boolean;
  etaMs: number | null;
}

export default function NavigationManeuverCard({ step, nextStep, distanceToManeuver, offRoute, rerouting, offline, etaMs }: Props) {
  return (
    <div className="pointer-events-auto rounded-2xl border border-white/10 bg-[#0b1417]/95 shadow-2xl shadow-black/50 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Maneuver icon */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          {step ? (
            <ManeuverIcon type={step.maneuverType} modifier={step.maneuverModifier} className="h-8 w-8" />
          ) : (
            <Navigation className="h-8 w-8" aria-hidden />
          )}
        </div>
        {/* Distance + instruction */}
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold leading-tight text-[#F0F6FC] tabular-nums">
            {rerouting ? (
              "Rerouting…"
            ) : distanceToManeuver !== null ? (
              formatDistance(distanceToManeuver)
            ) : (
              "—"
            )}
          </div>
          <div className="truncate text-sm font-medium text-[#c9d9d6]">
            {rerouting ? "Finding a new route…" : step?.instruction ?? "Follow the route"}
          </div>
          {step?.name && !rerouting && (
            <div className="truncate text-xs text-muted-foreground">{step.name}</div>
          )}
        </div>
      </div>

      {/* Status strip + next-step preview + ETA */}
      {(offRoute || offline || nextStep || etaMs) && (
        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-1.5 text-xs">
          {offRoute && !rerouting && (
            <span className="font-semibold text-amber-400">Off route</span>
          )}
          {offline && (
            <span className="font-semibold text-amber-400">Offline routing</span>
          )}
          {etaMs && !rerouting && (
            <span className="font-medium text-primary">
              Arrive {new Date(etaMs).toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true })}
            </span>
          )}
          {nextStep && !rerouting && (
            <span className="ml-auto flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="shrink-0">Then</span>
              <ManeuverIcon type={nextStep.maneuverType} modifier={nextStep.maneuverModifier} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{nextStep.instruction}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
