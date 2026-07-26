"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { format, parseISO } from "date-fns";
import {
  Truck, Calendar, CheckCircle2, Clock, AlertCircle, ChevronRight, ChevronLeft,
  Layers, Zap, Target, Flame, MapPin, Package, TrendingUp, Award, Gauge as GaugeIcon,
  CircleDot, Route,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_DAILY_POINTS } from "@/lib/zones";
import type { Stats, UserZoneData } from "@/types/page";
import { OrderCard } from "@/components/order-card";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { MomentumChart } from "@/components/dashboard/momentum-chart";
import {
  CountUp, CockpitGauge, PipelineFunnel, MixDonut, WeekCapacityGrid, Sparkline, useGaugeSize,
} from "@/components/dashboard/cockpit-viz";

/* ============================================================
   HERO Dashboard — Neon Cockpit command deck
   Layout:
     1. Command deck hero (greeting, live clock, day ring, load)
     2. Mission gauges (today capacity / week pts / completion)
     3. Pipeline funnel (status flow, tap → filtered orders)
     4. Momentum (created vs completed area chart)
     5. Week capacity strip + zone coverage
     6. Territory mix donut + size mix
     7. Today's pickups (kept, upgraded header)
   All SVG/CSS-viz is WebView-safe: transform/opacity animations,
   small static glow shadows, no backdrop-filter stacks.
   ============================================================ */

const STATUS_META = [
  { label: "Pending",    code: "PENDING",   color: "#FBBF24" },
  { label: "Scheduled",  code: "SCHEDULED", color: "#22D3EE" },
  { label: "Contacted",  code: "CONFIRMED", color: "#34D399" },
  { label: "Booked",     code: "BOOKED",    color: "#A78BFA" },
  { label: "Completed",  code: "COMPLETED", color: "#94A3B8" },
];

const SIZE_COLORS: Record<string, string> = {
  S: "#34D399", M: "#FBBF24", L: "#F87171", XL: "#A78BFA", XXL: "#EF4444",
};

const CITY_PALETTE = ["#34D399", "#22D3EE", "#A78BFA", "#FBBF24", "#F472B6", "#60A5FA", "#2DD4BF", "#FB923C"];

function greetingForHour(h: number) {
  if (h < 5) return "Night run";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HeroDashboard({
  stats,
  onRefresh,
  userZones,
  onFilterOrders,
}: {
  stats: Stats | null;
  onRefresh: () => void;
  userZones?: UserZoneData[];
  onFilterOrders?: (status: string) => void;
}) {
  const { data: session } = useSession();
  const [timeRange, setTimeRange] = useState("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [rangeStats, setRangeStats] = useState<Stats | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [pickupPage, setPickupPage] = useState(0);
  const [showAllPickups, setShowAllPickups] = useState(false);
  const heroGaugeSize = useGaugeSize(132);
  const missionGaugeSize = useGaugeSize(132);

  // Live clock — 1s tick, cheap (single small text node)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch range-specific stats (weekOffset cycles the week views)
  useEffect(() => {
    fetch(`/api/stats?range=${timeRange}&weekOffset=${weekOffset}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setRangeStats(d); })
      .catch(() => {});
  }, [timeRange, weekOffset]);

  const effectiveStats = rangeStats || stats;

  const derived = useMemo(() => {
    if (!effectiveStats) return null;
    const s = effectiveStats;
    const activePipe =
      s.pendingCount + s.scheduledCount + s.confirmedCount + s.bookedCount;
    const totalHandled = activePipe + s.completedCount;
    const completionRate =
      totalHandled > 0 ? Math.round((s.completedCount / totalHandled) * 100) : 0;
    const dayPct = Math.min(s.todayPoints / MAX_DAILY_POINTS, 1);
    const trendCompleted = (s.trends || []).map(t => t.completed);
    const bestDayPts = Object.values(s.selWeekScheduleByDate || {}).reduce(
      (m, d) => Math.max(m, d.totalPoints), 0,
    );
    return { activePipe, totalHandled, completionRate, dayPct, trendCompleted, bestDayPts };
  }, [effectiveStats]);

  if (!effectiveStats || !derived) {
    return (
      <div className="space-y-4">
        <div className="ck-hero-skel skeleton-shimmer" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <div key={i} className="h-36 rounded-xl skeleton-shimmer" />)}
        </div>
        <div className="h-52 rounded-xl skeleton-shimmer" />
      </div>
    );
  }

  const s = effectiveStats;
  const firstName = (session?.user?.name || "Hero").split(" ")[0];
  const selSchedule = s.selWeekScheduleByDate || s.scheduleByDate;

  const funnelItems = STATUS_META.map(m => ({
    ...m,
    count:
      m.code === "PENDING" ? s.pendingCount
      : m.code === "SCHEDULED" ? s.scheduledCount
      : m.code === "CONFIRMED" ? s.confirmedCount
      : m.code === "BOOKED" ? s.bookedCount
      : s.completedCount,
  }));

  const cityData = Object.entries(s.byCity || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value], i) => ({
      name: name || "Unknown",
      value,
      color: CITY_PALETTE[i % CITY_PALETTE.length],
    }));

  const sizeData = Object.entries(s.bySize || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, value]) => ({ name, value, color: SIZE_COLORS[name] || "#8B949E" }));

  return (
    <div className="space-y-4">

      {/* ============ 1. COMMAND DECK HERO ============ */}
      <section className="ck-hero" aria-label="Command deck">
        <div className="ck-hero__grid" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0 basis-48">
            <p className="ck-hero__eyebrow">
              <CircleDot className="h-3 w-3 text-primary animate-pulse" />
              LIVE · {format(now, "HH:mm:ss")}
            </p>
            <h2 className="ck-hero__title truncate">
              {greetingForHour(now.getHours())}, {firstName}
            </h2>
            <p className="ck-hero__sub">
              {format(now, "EEEE, d MMMM")} · {s.todayOrders.length} pickup{s.todayOrders.length === 1 ? "" : "s"} on deck
            </p>
            {/* Quick micro-stats */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <div className="ck-microstat">
                <span className="ck-microstat__val text-primary"><CountUp value={derived.activePipe} /></span>
                <span className="ck-microstat__lbl">in pipeline</span>
              </div>
              <div className="ck-microstat">
                <span className="ck-microstat__val text-cyan-400"><CountUp value={s.weekPoints} suffix="pt" /></span>
                <span className="ck-microstat__lbl">this week</span>
              </div>
              <div className="hidden xs:block sm:block">
                <Sparkline data={derived.trendCompleted} color="#34D399" width={84} height={26} />
              </div>
            </div>
          </div>

          {/* Day capacity ring */}
          <div className="shrink-0 mx-auto sm:mx-0">
            <CockpitGauge
              value={s.todayPoints}
              max={MAX_DAILY_POINTS}
              label="Today's Load"
              sub={s.todayPoints >= MAX_DAILY_POINTS ? "MAXED" : `${MAX_DAILY_POINTS - s.todayPoints}pt free`}
              color={s.todayPoints >= MAX_DAILY_POINTS ? "#FBBF24" : "#34D399"}
              size={heroGaugeSize}
              icon={<GaugeIcon className="h-[18px] w-[18px]" />}
              onClick={() => onFilterOrders?.("SCHEDULED")}
            />
          </div>
        </div>

        {/* Overload / clear-day banner */}
        {derived.bestDayPts > MAX_DAILY_POINTS && (
          <div className="ck-banner ck-banner--warn mt-3">
            <Flame className="h-3.5 w-3.5" />
            <span>Peak day this week hits {derived.bestDayPts}pt — over the {MAX_DAILY_POINTS}pt cap. Consider rebalancing.</span>
          </div>
        )}
      </section>

      {/* ============ 2. UPCOMING HOLIDAYS ============ */}
      {s.holidays.length > 0 && (
        <section className="ck-panel p-3">
          <header className="ck-panel__head mb-2">
            <h3 className="ck-panel__title"><AlertCircle className="h-4 w-4 text-amber-400" />Upcoming Holidays</h3>
            <span className="text-[0.625rem] text-muted-foreground tabular-nums">{s.holidays.length} scheduled</span>
          </header>
          <div className="flex flex-wrap gap-2">
            {s.holidays.slice(0, 4).map(h => {
              const days = Math.ceil((parseISO(h.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={h.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-amber-400/20 bg-amber-400/5 text-xs flex-1 basis-40 min-w-0">
                  <Calendar className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="font-medium truncate flex-1 min-w-0">{h.name}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">{format(parseISO(h.date), "dd MMM")}</span>
                  <span className={`tabular-nums font-bold shrink-0 ${days <= 3 ? "text-red-400" : days <= 7 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {days <= 0 ? "today" : days === 1 ? "tomorrow" : `${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ============ 3. MISSION GAUGES ============ */}
      <section className="grid grid-cols-3 gap-1.5 sm:gap-3">
        <div className="ck-panel flex justify-center py-2 px-1">
          <CockpitGauge
            value={s.todayPoints}
            max={MAX_DAILY_POINTS}
            label="Capacity"
            sub={`${Math.round(derived.dayPct * 100)}%`}
            color="#34D399"
            size={missionGaugeSize}
            icon={<Target className="h-[22px] w-[22px]" />}
            onClick={() => onFilterOrders?.("SCHEDULED")}
          />
        </div>
        <div className="ck-panel flex justify-center py-2 px-1">
          <CockpitGauge
            value={Math.min(s.weekPoints, Math.max(derived.bestDayPts * 7, MAX_DAILY_POINTS * 5))}
            max={Math.max(derived.bestDayPts * 7, MAX_DAILY_POINTS * 5, 1)}
            label="Week Pts"
            sub={`${s.weekPoints}pt`}
            color="#22D3EE"
            size={missionGaugeSize}
            icon={<Zap className="h-[22px] w-[22px]" />}
          />
        </div>
        <div className="ck-panel flex justify-center py-2 px-1">
          <CockpitGauge
            value={derived.completionRate}
            max={100}
            label="Completed"
            sub={`${s.completedCount} done`}
            color="#A78BFA"
            size={missionGaugeSize}
            icon={<Award className="h-[22px] w-[22px]" />}
            onClick={() => onFilterOrders?.("COMPLETED")}
          />
        </div>
      </section>

      {/* ============ 4. PIPELINE FUNNEL ============ */}
      <section className="ck-panel p-4">
        <header className="ck-panel__head">
          <h3 className="ck-panel__title"><Route className="h-4 w-4 text-primary" />Pipeline</h3>
          <span className="text-[0.625rem] text-muted-foreground">tap a stage → orders</span>
        </header>
        <PipelineFunnel items={funnelItems} onSelect={(code) => onFilterOrders?.(code)} />
      </section>

      {/* ============ 5. MOMENTUM ============ */}
      <section className="ck-panel p-4">
        <header className="ck-panel__head flex-wrap gap-2">
          <h3 className="ck-panel__title"><TrendingUp className="h-4 w-4 text-cyan-400" />Momentum</h3>
          <TimeRangeSelector range={timeRange} setRange={setTimeRange} />
        </header>

        {/* Range totals strip */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="ck-rangestat">
            <p className="ck-rangestat__lbl">Created</p>
            <p className="ck-rangestat__val text-cyan-400"><CountUp value={s.createdInRange ?? 0} /></p>
          </div>
          <div className="ck-rangestat">
            <p className="ck-rangestat__lbl">Completed</p>
            <p className="ck-rangestat__val text-primary"><CountUp value={s.completedInRange ?? 0} /></p>
          </div>
          <div className="ck-rangestat">
            <p className="ck-rangestat__lbl">Points</p>
            <p className="ck-rangestat__val text-amber-400"><CountUp value={s.pointsInRange ?? 0} suffix="pt" /></p>
          </div>
        </div>

        <MomentumChart data={s.trends || []} range={timeRange} />
      </section>

      {/* ============ 6. WEEK CAPACITY + ZONE COVERAGE ============ */}
      <section className="ck-panel ck-panel--glow p-4">
        <header className="ck-panel__head">
          <h3 className="ck-panel__title">
            <Layers className="h-4 w-4 text-primary" style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.5))" }} />
            Week Load
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setWeekOffset(w => w - 1)} className="ck-navbtn" aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[0.625rem] text-muted-foreground text-center min-w-[100px] tabular-nums">
              {s.selWeekStart && s.selWeekEnd ? `${s.selWeekStart.slice(5)} → ${s.selWeekEnd.slice(5)}` : "This week"}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="ck-navbtn" aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)} className="text-[0.625rem] text-primary hover:underline mb-2">
            ← Back to current week
          </button>
        )}

        <WeekCapacityGrid
          schedule={selSchedule}
          weekStart={s.selWeekStart}
          offDays={s.offDays}
          maxDaily={MAX_DAILY_POINTS}
        />

        {/* Week totals summary */}
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[0.625rem] text-muted-foreground">
          <span className="tabular-nums">Week total: <strong className="text-foreground">{Object.values(selSchedule || {}).reduce((s, d) => s + (d.totalPoints || 0), 0)}pt</strong> across <strong className="text-foreground">{Object.values(selSchedule || {}).reduce((s, d) => s + (d.orders?.length || 0), 0)}</strong> orders</span>
          <span className="tabular-nums">Cap: <strong className="text-primary">{MAX_DAILY_POINTS}pt/day</strong></span>
        </div>
      </section>

      {/* ============ 7. TERRITORY + SIZE MIX ============ */}
      {(cityData.length > 0 || sizeData.length > 0) && (
        <section className="grid sm:grid-cols-2 gap-2 sm:gap-3">
          {cityData.length > 0 && (
            <div className="ck-panel p-4">
              <header className="ck-panel__head">
                <h3 className="ck-panel__title"><MapPin className="h-4 w-4 text-pink-400" />Territory</h3>
                <span className="text-[0.625rem] text-muted-foreground capitalize">{timeRange}</span>
              </header>
              <MixDonut data={cityData} centerLabel="orders" size={132} />
            </div>
          )}
          {sizeData.length > 0 && (
            <div className="ck-panel p-4">
              <header className="ck-panel__head">
                <h3 className="ck-panel__title"><Package className="h-4 w-4 text-amber-400" />Load Mix</h3>
                <span className="text-[0.625rem] text-muted-foreground capitalize">{timeRange}</span>
              </header>
              <MixDonut data={sizeData} centerLabel="orders" size={132} />
            </div>
          )}
        </section>
      )}

      {/* ============ 7. TODAY'S PICKUPS ============ */}
      <section className="ck-panel earth-glow p-4">
        <header className="ck-panel__head mb-3">
          <h3 className="ck-panel__title text-base"><Truck className="h-5 w-5 text-primary" />Today&apos;s Pickups</h3>
          <Badge variant="outline" className="text-xs border-primary/30 text-primary tabular-nums">
            {s.todayPoints}/{MAX_DAILY_POINTS} pt
          </Badge>
        </header>
        <Progress value={derived.dayPct * 100} className="h-1.5 mb-3" />
        {s.todayOrders.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="h-8 w-8 text-primary/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Deck is clear — no pickups today</p>
          </div>
        ) : (() => {
          const PAGE = 6;
          const totalPages = Math.ceil(s.todayOrders.length / PAGE);
          const safePage = Math.min(pickupPage, Math.max(totalPages - 1, 0));
          const visible = s.todayOrders.slice(safePage * PAGE, safePage * PAGE + PAGE);
          return (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {visible.map(o => (
                  <div key={o.id} className={o.isEvent ? "pl-2 bg-amber-500/5 rounded-l-md" : o.isErthbox ? "pl-2 bg-emerald-500/5 rounded-l-md" : ""}>
                    <OrderCard order={o} compact onRefresh={onRefresh} holidays={s.holidays} offDays={s.offDays} userZones={userZones} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground tabular-nums">
                  Showing {safePage * PAGE + 1}–{Math.min((safePage + 1) * PAGE, s.todayOrders.length)} of {s.todayOrders.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={safePage === 0}
                    onClick={() => setPickupPage(p => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => setPickupPage(p => Math.min(totalPages - 1, p + 1))}
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-primary"
                    onClick={() => setShowAllPickups(true)}
                  >
                    View all
                  </Button>
                </div>
              </div>
              <Dialog open={showAllPickups} onOpenChange={setShowAllPickups}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" /> Today&apos;s Pickups ({s.todayOrders.length})
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {s.todayOrders.map(o => (
                      <div key={o.id} className={o.isEvent ? "pl-2 bg-amber-500/5 rounded-l-md" : o.isErthbox ? "pl-2 bg-emerald-500/5 rounded-l-md" : ""}>
                        <OrderCard order={o} compact onRefresh={onRefresh} holidays={s.holidays} offDays={s.offDays} userZones={userZones} />
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          );
        })()}
      </section>

      {/* ============ 8. END ============ */}
    </div>
  );
}
