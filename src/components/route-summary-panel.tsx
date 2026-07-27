"use client";

import { useMemo, useState, useEffect } from "react";
import type { OptimizedRouteResult, VroomStopDetail, VroomLoadPlan } from "@/lib/vroom";
import { fmtMalaysiaTime, resolveIntId } from "@/lib/vroom";
import { FIXED_LOCATIONS, VEHICLE } from "@/lib/route-model";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Play, MapPin, Home, ChevronDown, ChevronRight, Navigation, MessageCircle, CheckCircle2, RotateCcw, GripVertical, ArrowUpDown, ChevronUp, Clock, Pencil } from "lucide-react";

interface Props {
  route: OptimizedRouteResult;
  selectedOrderId: string | null;
  onSelectStop: (stop: VroomStopDetail) => void;
  onStartRoute?: () => void;
  onSaveRoute?: () => void;
  saving?: boolean;
  routeStatus?: string;
  trackingTokens?: Record<string, { token: string; completed: boolean }>;
  routeDate?: string;
  onMarkComplete?: (orderId: string, token: string) => void;
  onUndoComplete?: (orderId: string, token: string) => void;
  onToggleDropOff?: (loadIndex: number, dropOff: "DROP_A" | "DROP_B") => void;
  onReorderStops?: (loadIndex: number, fromIndex: number, toIndex: number) => void;
  onReverseLoad?: (loadIndex: number) => void;
  onSetPlannedArrival?: (orderDbId: string, arrivalUnix: number | null) => void;
  routeTemplate?: string;
}

function gmapsNavUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
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

/* Inline arrival editor — tap pencil to set a manual planned time override */
function ArrivalEditor({
  stop,
  editing,
  onEdit,
  onSetPlanned,
  minsUntil,
}: {
  stop: VroomStopDetail;
  editing: boolean;
  onEdit: (id: string | null) => void;
  onSetPlanned?: (orderDbId: string, arrivalUnix: number | null) => void;
  minsUntil: (sec: number) => number | null;
}) {
  const [timeVal, setTimeVal] = useState("");
  const effSec = stop.plannedArrival ?? stop.arrival;
  const mins = minsUntil(effSec);

  const save = () => {
    const [h, mm] = timeVal.split(":");
    if (h && mm) {
      const d = new Date();
      d.setHours(+h, +mm, 0, 0);
      onSetPlanned?.(stop.orderDbId, Math.floor(d.getTime() / 1000));
    }
    onEdit(null);
  };

  if (editing) {
    return (
      <span className="mt-0.5 block text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <input
            type="time"
            value={timeVal}
            onChange={e => setTimeVal(e.target.value)}
            className="h-5 w-20 rounded border border-primary/40 bg-transparent px-1 text-[0.7rem] text-foreground"
            autoFocus
            onBlur={save}
            onKeyDown={e => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") onEdit(null);
            }}
          />
          <button
            onClick={() => { onSetPlanned?.(stop.orderDbId, null); onEdit(null); }}
            className="text-[0.6rem] text-muted-foreground hover:text-red-400"
          >
            reset
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="mt-0.5 block text-muted-foreground">
      ETA {fmtMalaysiaTime(effSec)}
      {stop.plannedArrival != null && <span className="text-[0.5625rem] text-amber-400/70 ml-0.5 italic">planned</span>}
      <button
        onClick={(ev) => {
          ev.stopPropagation();
          const d = new Date(effSec * 1000);
          setTimeVal(`${String(d.getUTCHours() + 8).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`);
          onEdit(stop.orderDbId);
        }}
        className="inline-flex items-center ml-1 p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
        title="Set planned arrival"
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
      {(() => {
        if (mins === null) return null;
        if (mins < 0) return <span className="text-amber-400"> · {Math.abs(mins)}min overdue</span>;
        if (mins === 0) return <span className="text-emerald-400"> · arriving now</span>;
        return <span className="text-primary/70"> · in {mins}min</span>;
      })()}
      · {stop.points} pts · zone {stop.zone}
      {stop.isOffice ? " · office" : ""}
    </span>
  );
}

export default function RouteSummaryPanel({
  route,
  selectedOrderId,
  onSelectStop,
  onStartRoute,
  onSaveRoute,
  saving,
  routeStatus,
  trackingTokens,
  routeDate,
  onMarkComplete,
  onUndoComplete,
  onToggleDropOff,
  onReorderStops,
  onReverseLoad,
  onSetPlannedArrival,
  routeTemplate,
}: Props) {
  const [openLoad, setOpenLoad] = useState<number | null>(0);
  const [now, setNow] = useState(Date.now());

  // Live clock — updates every 60 seconds for countdown calculations
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    return {
      distance: fmtKm(route.totalDistanceMeters),
      duration: fmtDuration(route.totalDurationSeconds),
      stops: route.totalStops,
      points: route.totalPoints,
      capacity: route.capacity,
      loads: route.loads.length,
      targetKm: 100,
      overTarget: route.totalDistanceMeters > 100_000,
      alternativeDistance: fmtKm(route.totalAlternativeDistanceMeters),
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
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            {VEHICLE.name} · {stats.loads} load{stats.loads !== 1 ? "s" : ""} · {VEHICLE.startHour}:00–{VEHICLE.endHour}:00 MYT
          </p>
          <p>
            Target ≤100 km · selected total <span className={stats.overTarget ? "text-amber-400 font-medium" : "text-emerald-400 font-medium"}>{stats.distance}</span>
            {typeof route.totalAlternativeDistanceMeters === "number" && route.totalAlternativeDistanceMeters > 0 && (
              <> · alternative drop total {stats.alternativeDistance}</>
            )}
          </p>
        </div>
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
            trackingTokens={trackingTokens}
            routeDate={routeDate}
            onMarkComplete={onMarkComplete}
            onUndoComplete={onUndoComplete}
            onToggleDropOff={onToggleDropOff}
            onReorderStops={onReorderStops}
            onReverseLoad={onReverseLoad}
            now={now}
            onSetPlannedArrival={onSetPlannedArrival}
            routeTemplate={routeTemplate}
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
          <p className="mb-2 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Legend
          </p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <LegendItem color="#22c55e" label="Home (start/end)" />
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
      <div className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
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
  trackingTokens,
  routeDate,
  onMarkComplete,
  onUndoComplete,
  onToggleDropOff,
  onReorderStops,
  onReverseLoad,
  now,
  onSetPlannedArrival,
  routeTemplate,
}: {
  load: VroomLoadPlan;
  index: number;
  open: boolean;
  onToggle: () => void;
  selectedOrderId: string | null;
  onSelectStop: (stop: VroomStopDetail) => void;
  trackingTokens?: Record<string, { token: string; completed: boolean }>;
  routeDate?: string;
  onMarkComplete?: (orderId: string, token: string) => void;
  onUndoComplete?: (orderId: string, token: string) => void;
  onToggleDropOff?: (loadIndex: number, dropOff: "DROP_A" | "DROP_B") => void;
  onReorderStops?: (loadIndex: number, fromIndex: number, toIndex: number) => void;
  onReverseLoad?: (loadIndex: number) => void;
  now?: number;
  onSetPlannedArrival?: (orderDbId: string, arrivalUnix: number | null) => void;
  routeTemplate?: string;
}) {
  const drop = load.dropOff === "DROP_B" ? FIXED_LOCATIONS.DROP_B : FIXED_LOCATIONS.DROP_A;
  const alt = load.alternative;
  const altDrop = alt?.dropOff === "DROP_B" ? FIXED_LOCATIONS.DROP_B : FIXED_LOCATIONS.DROP_A;
  const minsUntil = (arrivalSec: number) => now ? Math.round((arrivalSec * 1000 - now) / 60000) : null;

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Arrival editing state — which stop is being edited
  const [editingArrivalId, setEditingArrivalId] = useState<string | null>(null);

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
          Load {index + 1}{" "}
          <span className="text-muted-foreground">→ {drop.name}</span>
          {onToggleDropOff && alt && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const forced = load.dropOff === "DROP_A" ? "DROP_B" : "DROP_A";
                onToggleDropOff(index, forced);
              }}
              title={`Switch drop-off to ${altDrop.name} (${alt ? fmtKm(alt.distanceMeters) : "?"} alternative)`}
              className="ml-2 inline-flex items-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
            >
              switch to {altDrop.name.split("(")[0].trim()}
            </button>
          )}
        </span>
        <span className="shrink-0 flex items-center gap-1">
          {onReverseLoad && load.stops.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onReverseLoad(index);
              }}
              title="Reverse stop order"
              className="inline-flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:bg-amber-500/20 hover:text-amber-400"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            {load.stops.length} stops · {load.loadPoints} pts · {fmtKm(load.distanceMeters)}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-white/10">
          <ol>
            {load.stops.map((s, i) => {
              const selected = s.orderId === selectedOrderId;
              const tracking = trackingTokens?.[s.orderId];
              const trackUrl = tracking
                ? `${typeof window !== "undefined" ? window.location.origin : ""}/track/${tracking.token}`
                : null;
              const waMsg = routeTemplate
                ? (() => { const ar = fmtMalaysiaTime(s.plannedArrival ?? s.arrival); return routeTemplate.replace(/\{customerName\}/g, s.customerName).replace(/\{date\}/g, routeDate || "TBD").replace(/\{address\}/g, s.address).replace(/\{arrival\}/g, ar).replace(/\{trackUrl\}/g, trackUrl || ""); })()
                : trackUrl
                  ? `Hi ${s.customerName}, your pickup is on ${routeDate || ""} at ${s.address}. ETA: ${fmtMalaysiaTime(s.plannedArrival ?? s.arrival)}. Track: ${trackUrl}`
                  : null;
              const waUrl = waMsg
                ? s.phone
                  ? `https://wa.me/${s.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(waMsg)}`
                  : `https://wa.me/?text=${encodeURIComponent(waMsg)}`
                : null;
              const isDragActive = dragIndex === i;
              const isDragOver = dragOverIndex === i && dragIndex !== i;
              return (
                <li
                  key={s.orderDbId}
                  draggable={!!onReorderStops}
                  onDragStart={(e) => {
                    if (!onReorderStops) return;
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                  }}
                  onDragOver={(e) => {
                    if (!onReorderStops) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverIndex(i);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!onReorderStops || dragIndex === null || dragIndex === i) {
                      setDragIndex(null);
                      setDragOverIndex(null);
                      return;
                    }
                    onReorderStops(index, dragIndex, i);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  // Touch drag support — replicates HTML5 drag on touch devices
                  onTouchStart={(e) => {
                    if (!onReorderStops) return;
                    // Only activate when touching the grip handle
                    const grip = (e.currentTarget as HTMLElement).querySelector('[data-grip]');
                    if (!grip) return;
                    const touch = e.touches[0];
                    const gripRect = grip.getBoundingClientRect();
                    if (touch.clientX < gripRect.left - 10 || touch.clientX > gripRect.right + 10 ||
                        touch.clientY < gripRect.top - 10 || touch.clientY > gripRect.bottom + 10) return;
                    setDragIndex(i);
                  }}
                  onTouchMove={(e) => {
                    if (dragIndex === null) return;
                    const touch = e.touches[0];
                    const el = document.elementFromPoint(touch.clientX, touch.clientY);
                    const li = el?.closest('[data-stop-index]') as HTMLElement | null;
                    if (li) {
                      const idx = parseInt(li.dataset.stopIndex || "", 10);
                      if (!isNaN(idx)) setDragOverIndex(idx);
                    }
                  }}
                  onTouchEnd={(e) => {
                    if (!onReorderStops || dragIndex === null) {
                      setDragIndex(null);
                      setDragOverIndex(null);
                      return;
                    }
                    const touch = e.changedTouches[0];
                    const el = document.elementFromPoint(touch.clientX, touch.clientY);
                    const li = el?.closest('[data-stop-index]') as HTMLElement | null;
                    const targetIdx = li ? parseInt(li.dataset.stopIndex || "", 10) : -1;
                    if (!isNaN(targetIdx) && targetIdx >= 0 && targetIdx !== dragIndex) {
                      onReorderStops(index, dragIndex, targetIdx);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  data-stop-index={i}
                >
                  <div
                    className={`flex w-full flex-col px-3 py-2.5 text-left text-xs transition-colors hover:bg-white/5 ${
                      selected ? "bg-primary/15 ring-1 ring-inset ring-primary/40" : ""
                    } ${isDragActive ? "opacity-40" : ""} ${isDragOver ? "border-t-2 border-primary/60" : ""} ${tracking?.completed ? "opacity-60" : ""}`}
                  >
                    <button
                      onClick={() => onSelectStop(s)}
                      className="flex w-full items-start gap-2.5 text-left"
                    >
                      {onReorderStops && (
                        <span data-grip className="mt-0.5 flex h-5 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing touch-none">
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[0.625rem] font-bold text-primary">
                        {i + 1}
                      </span>
                      {/* Move up/down arrow buttons */}
                      {onReorderStops && (
                        <span className="flex shrink-0 flex-col gap-px">
                          <button
                            onClick={(e) => { e.stopPropagation(); if (i > 0) onReorderStops(index, i, i - 1); }}
                            disabled={i === 0}
                            className="flex h-3.5 w-4 items-center justify-center rounded text-muted-foreground/60 hover:bg-white/10 hover:text-foreground disabled:opacity-25 disabled:cursor-default"
                            aria-label={`Move stop ${i + 1} up`}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (i < load.stops.length - 1) onReorderStops(index, i, i + 1); }}
                            disabled={i >= load.stops.length - 1}
                            className="flex h-3.5 w-4 items-center justify-center rounded text-muted-foreground/60 hover:bg-white/10 hover:text-foreground disabled:opacity-25 disabled:cursor-default"
                            aria-label={`Move stop ${i + 1} down`}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {s.customerName}{" "}
                          <span className="text-muted-foreground">· {s.orderId}</span>
                        </span>
                        <ArrivalEditor
                          stop={s}
                          editing={editingArrivalId === s.orderDbId}
                          onEdit={setEditingArrivalId}
                          onSetPlanned={onSetPlannedArrival}
                          minsUntil={minsUntil}
                        />
                        {tracking?.completed && (
                          <span className="mt-0.5 block text-emerald-400">
                            ✓ Pickup done
                          </span>
                        )}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1.5 mt-2">
                      <a
                        href={gmapsNavUrl(s.latitude, s.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Navigate to ${s.customerName}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-primary transition-colors hover:bg-primary/20 hover:border-primary/40"
                      >
                        <Navigation className="h-5 w-5" />
                      </a>
                      {waUrl && !tracking?.completed && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Send tracking link to ${s.customerName} via WhatsApp`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20"
                        >
                          <MessageCircle className="h-5 w-5" />
                        </a>
                      )}
                      {tracking && !tracking.completed && onMarkComplete && (
                        <button
                          onClick={() => onMarkComplete(s.orderId, tracking.token)}
                          title={`Mark ${s.customerName} as picked up`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-emerald-400 transition-colors hover:bg-emerald-500/20 hover:border-emerald-500/40"
                        >
                          <CheckCircle2 className="h-5 w-5" />
                        </button>
                      )}
                      {tracking?.completed && onUndoComplete && (
                        <button
                          onClick={() => onUndoComplete(s.orderId, tracking.token)}
                          title={`Undo — mark ${s.customerName} as not picked up`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-400 transition-colors hover:bg-amber-500/20 hover:border-amber-500/40"
                        >
                          <RotateCcw className="h-5 w-5" />
                        </button>
                      )}
                      {tracking?.completed && !onUndoComplete && (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center text-emerald-400">
                          <CheckCircle2 className="h-5 w-5" />
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="space-y-1.5 border-t border-white/10 px-3 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Drop-off: {drop.name} @{" "}
                  {fmtMalaysiaTime(load.dropOffArrival)}
                </span>
              </span>
              <a
                href={gmapsNavUrl(drop.latitude, drop.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                title={`Navigate to ${drop.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-primary transition-colors hover:bg-primary/20 hover:border-primary/40"
              >
                <Navigation className="h-5 w-5" />
              </a>
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