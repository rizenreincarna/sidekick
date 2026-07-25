"use client";

import { ZONES, STATUS_CONFIG, getZoneColor, CUSTOM_ZONE_START } from "@/lib/zones";
import { Badge } from "@/components/ui/badge";
import type { UserZoneData } from "@/types/page";

// ============ EVENT TYPE DISPLAY ============
const EVENT_TYPE_LABELS: Record<string, string> = {
  ROADSHOW: "Roadshow",
  EWASTE_COLLECTION: "E-Waste Collection",
  OTHER: "Other",
};
export function formatEventType(type: string | undefined | null): string {
  if (!type) return "Event";
  return EVENT_TYPE_LABELS[type] || type;
}

// ============ ZONE BADGE ============
export function ZoneBadge({ zone, compact, userZones, isDisabled }: { zone: number; compact?: boolean; userZones?: UserZoneData[]; isDisabled?: boolean }) {
  const z = ZONES[zone];
  const userZone = userZones?.find(uz => uz.zoneId === zone);
  // For custom zones (zoneId >= 100) with no ZONES entry and no userZone, return null
  if (!z && !userZone) return null;

  // Determine display name: user override first, then ZONES fallback
  const name = userZone?.name || z?.name || `Zone ${zone}`;

  // Determine colors: built-in zones use ZONES colors, custom zones use getZoneColor
  const isCustomZone = zone >= CUSTOM_ZONE_START;
  const customColors = isCustomZone ? getZoneColor(zone - CUSTOM_ZONE_START) : null;
  const bgColor = customColors?.bgColor || z?.bgColor || "bg-slate-500/15";
  const color = customColors?.color || z?.color || "text-slate-700";
  const borderColor = customColors?.borderColor || z?.borderColor || "border-slate-500/30";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.75rem] font-medium ${bgColor} ${color} ${borderColor} ${isDisabled ? "opacity-50 line-through" : ""}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `oklch(0.7 0.14 ${zone * 40 + 100})` }} />
      {compact ? name : `Z${zone} ${name}`}
      {isDisabled && !compact && <span className="text-[0.625rem] opacity-70 ml-0.5">(off)</span>}
    </span>
  );
}

// ============ STATUS BADGE ============
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status];
  if (!s) return <Badge variant="outline">{status}</Badge>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.75rem] font-medium ${s.bgColor} ${s.color} ${s.borderColor}`}>
      {s.label}
    </span>
  );
}