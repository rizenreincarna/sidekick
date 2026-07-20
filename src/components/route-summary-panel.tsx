"use client";

import { useMemo, useState } from "react";
import type { OptimizedRouteResult, VroomStopDetail, VroomLoadPlan } from "@/lib/vroom";
import { fmtMalaysiaTime, resolveIntId } from "@/lib/vroom";
import { FIXED_LOCATIONS, VEHICLE } from "@/lib/route-model";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Play, MapPin, Home, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  route: OptimizedRouteResult;
  selectedOrderId: string | null;
  onSelectStop: (stop: VroomStopDetail) => void;
  onStartRoute?: () => void;
  onSaveRoute?: () => void;
  saving?: boolean;
  routeStatus?: string;
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtKm(meters: number): string {
  return (meters / 1000).toFixed(1) + " km";
}

export default function RouteSummaryPanel({
  route,
  selectedOrderId,
  onSelectStop,
  onStartRoute,
  onSaveRoute,
  saving,
  routeStatus,
}: Props) {
  const [openLoad, setOpenLoad] = useState<number | null>(0);

  const stats = useMemo(() => {
    return {
      distance: fmtKm(route.totalDistanceMeters),
      duration: fmtDuration(route.totalDurationSeconds),
      stops: route.totalStops,
      points: route.totalPoints,
      capacity: route.capacity,
      loads: route.loads.length,
    };
  }, [route]);

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-white/10">
      {/* Header / summary */}
      <div className="border-b border-white/10 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Route Summary</h2>
          <Badge
            variant="outline"
            className={
              route.source === "vroom"
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-amber-500/40 bg-amber-500/15 text-amber-400"
            }
            title={
              route.source === "vroom"
                ? "Optimized by VROOM engine"
                : "VROOM server unavailable — used nearest-neighbour fallback"
            }
          >
            {route.source === "vroom" ? "VROOM" : "fallback"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Distance" value={stats.distance} />
          <Stat label="Duration" value={stats.duration} />
          <Stat label="Stops" value={String(stats.stops)} />
          <Stat label="Load" value={`${stats.points}/${stats.capacity} pts`} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {VEHICLE.name} · {stats.loads} load{stats.loads !== 1 ? "s" : ""} · {VEHICLE.startHour}:00–{VEHICLE.endHour}:00 MYT
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-b border-white/10 p-3">
        {onSaveRoute && (
          <Button
            onClick={onSaveRoute}
            disabled={saving}
            variant="outline"
            className="flex-1 gap-1.5 border-white/10 bg-white/5 hover:bg-white/10"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
        {onStartRoute && (
          <Button
            onClick={onStartRoute}
            disabled={saving || routeStatus === "STARTED"}
            className="flex-1 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-4 w-4" />
            {routeStatus === "STARTED" ? "Started" : "Start Route"}
          </Button>
        )}
      </div>

      {/* Loads & stops */}
      <div className="flex-1 overflow-y-auto p-3">
        {route.loads.length === 0 && (
          <p className="text-sm text-muted-foreground">No stops in this route.</p>
        )}
        {route.loads.map((load, li) => (
          <LoadBlock
            key={li}
            load={load}
            index={li}
            open={openLoad === li}
            onToggle={() => setOpenLoad(openLoad === li ? null : li)}
            selectedOrderId={selectedOrderId}
            onSelectStop={onSelectStop}
          />
        ))}

        {route.unassigned.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <p className="font-semibold text-amber-400">
              Unassigned ({route.unassigned.length})
            </p>
            <ul className="mt-1 space-y-1">
              {route.unassigned.map((u, i) => (
                <li key={i} className="text-xs text-amber-300/80">
                  {u.orderId} — {u.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Fixed locations legend */}
        <div className="mt-4 pt-3">
          <Separator className="mb-3 bg-white/10" />
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Legend
          </p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <LegendItem color="#22c55e" label={`${FIXED_LOCATIONS.HOME.name} (start/end)`} />
            <LegendItem color="#ef4444" label={`${FIXED_LOCATIONS.DROP_A.name} (drop-off)`} />
            <LegendItem color="#f97316" label={`${FIXED_LOCATIONS.DROP_B.name} (drop-off)`} />
            <li className="text-muted-foreground/70">Pin height ∝ e-waste points · color ∝ zone</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </li>
  );
}

function LoadBlock({
  load,
  index,
  open,
  onToggle,
  selectedOrderId,
  onSelectStop,
}: {
  load: VroomLoadPlan;
  index: number;
  open: boolean;
  onToggle: () => void;
  selectedOrderId: string | null;
  onSelectStop: (stop: VroomStopDetail) => void;
}) {
  const drop = load.dropOff === "DROP_B" ? FIXED_LOCATIONS.DROP_B : FIXED_LOCATIONS.DROP_A;
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 font-medium text-foreground">
          Load {index + 1} <span className="text-muted-foreground">→ {drop.name}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {load.stops.length} stops · {load.loadPoints} pts · {fmtKm(load.distanceMeters)}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/10">
          <ol>
            {load.stops.map((s, i) => {
              const selected = s.orderId === selectedOrderId;
              return (
                <li key={s.orderDbId}>
                  <button
                    onClick={() => onSelectStop(s)}
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/5 ${
                      selected ? "bg-primary/15 ring-1 ring-inset ring-primary/40" : ""
                    }`}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {s.customerName}{" "}
                        <span className="text-muted-foreground">· {s.orderId}</span>
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        ETA {fmtMalaysiaTime(s.arrival)} · {s.points} pts · zone {s.zone}
                        {s.isOffice ? " · office" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="space-y-1.5 border-t border-white/10 px-3 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Drop-off: {drop.name} @{" "}
                {fmtMalaysiaTime(load.dropOffArrival)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
              <span className="flex items-center gap-1">
                <Home className="h-3 w-3" /> Return home @ {fmtMalaysiaTime(load.homeArrival)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// resolveIntId is re-exported for consumers that need it
export { resolveIntId };