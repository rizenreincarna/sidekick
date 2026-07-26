"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ============================================================
   Cockpit viz primitives — HERO dashboard
   Neon Cockpit design language: dark panel, emerald/teal glow,
   mono micro labels, exponential ease-out motion.
   ============================================================ */

/* Animated count-up number — exponential ease-out, ~900ms */
export function CountUp({
  value,
  duration = 900,
  suffix = "",
  className = "",
}: {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(2, -10 * p); // easeOutExpo
      const v = Math.round(from + (value - from) * (p === 1 ? 1 : eased));
      setDisplay(v);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return (
    <span className={`tabular-nums ${className}`}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ---------- Radial gauge (SVG arc, 240° sweep) ---------- */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start <= 180 ? "0" : "1";
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

const GAUGE_START = -120;
const GAUGE_SWEEP = 240;

/* Mobile-aware gauge size: shrinks on narrow viewports so 3 gauges fit. */
export function useGaugeSize(desktopSize: number): number {
  const [size, setSize] = useState(desktopSize);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 380) setSize(Math.max(96, desktopSize - 32));
      else if (w < 480) setSize(Math.max(112, desktopSize - 16));
      else setSize(desktopSize);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [desktopSize]);
  return size;
}

export function CockpitGauge({
  value,
  max,
  label,
  sub,
  color = "#34D399",
  size = 128,
  strokeWidth = 9,
  icon,
  onClick,
}: {
  value: number;
  max: number;
  label: string;
  sub?: string;
  color?: string;
  size?: number;
  strokeWidth?: number;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const [animPct, setAnimPct] = useState(0);
  const [animVal, setAnimVal] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromPctRef = useRef(0);
  const fromValRef = useRef(0);

  useEffect(() => {
    const fromPct = fromPctRef.current;
    const fromVal = fromValRef.current;
    const start = performance.now();
    const dur = 1000;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(2, -10 * p);
      setAnimPct(fromPct + (pct - fromPct) * (p === 1 ? 1 : eased));
      setAnimVal(fromVal + (value - fromVal) * (p === 1 ? 1 : eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else { fromPctRef.current = pct; fromValRef.current = value; }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [pct, value]);

  const c = size / 2;
  const r = c - strokeWidth - 4;
  const trackPath = arcPath(c, c, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP);
  const fillPath = arcPath(c, c, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP * animPct);
  const endDot = polar(c, c, r, GAUGE_START + GAUGE_SWEEP * animPct);
  // Icon anchor: above the arc top, away from the numeric readout
  const iconAnchor = polar(c, c, r + strokeWidth + 4, GAUGE_START + GAUGE_SWEEP / 2);
  const gid = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <button
      type="button"
      onClick={onClick}
      className="ck-gauge group"
      style={{ width: size }}
      aria-label={`${label}: ${value} of ${max}`}
    >
      <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        {/* track */}
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeWidth} strokeLinecap="round" />
        {/* tick marks */}
        {Array.from({ length: 9 }, (_, i) => {
          const a = GAUGE_START + (GAUGE_SWEEP / 8) * i;
          const p1 = polar(c, c, r - strokeWidth - 3, a);
          const p2 = polar(c, c, r - strokeWidth - 7, a);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.14)" strokeWidth="1" />;
        })}
        {/* fill */}
        {animPct > 0.004 && (
          <path
            d={fillPath}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
          />
        )}
        {/* tip dot */}
        {animPct > 0.004 && (
          <circle cx={endDot.x} cy={endDot.y} r={strokeWidth / 2 + 1} fill={color} style={{ filter: `drop-shadow(0 0 5px ${color})` }} />
        )}
        {/* center readout */}
        <text x={c} y={c + 4} textAnchor="middle" fill="var(--nc-text, #E8F0F5)" fontSize={size * 0.21} fontWeight="700" fontFamily="inherit" className="tabular-nums">
          {Math.round(animVal)}
        </text>
        <text x={c} y={c + size * 0.18} textAnchor="middle" fill="var(--nc-muted, #8B949E)" fontSize={size * 0.085} fontFamily="inherit">
          / {max}
        </text>
        {icon && (() => {
          const iconSize = Math.max(20, Math.round(size * 0.17));
          return (
            <foreignObject x={iconAnchor.x - iconSize / 2} y={iconAnchor.y - iconSize / 2} width={iconSize} height={iconSize}>
              <div className="flex items-center justify-center h-full w-full" style={{ color }}>{icon}</div>
            </foreignObject>
          );
        })()}
      </svg>
      <div className="text-center -mt-2">
        <p className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-muted-foreground leading-tight">{label}</p>
        {sub && <p className="text-[0.625rem] font-semibold leading-tight mt-0.5" style={{ color }}>{sub}</p>}
      </div>
    </button>
  );
}

/* ---------- Pipeline funnel (status flow) ---------- */
export function PipelineFunnel({
  items,
  onSelect,
}: {
  items: Array<{ label: string; code: string; count: number; color: string }>;
  onSelect?: (code: string) => void;
}) {
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <div className="space-y-1.5 pr-1">
      {items.map((item, idx) => {
        // Cap bar width so count label always fits inside the panel.
        // Reserve the rightmost ~22% of the row for the count label.
        const w = item.count > 0
          ? Math.min(Math.max((item.count / max) * 78, 8), 78)
          : 4;
        const inside = item.count > 0 && (item.count / max) >= 0.18;
        // Muted/slate stages (Completed) get a denser fill so dark text reads on the bar.
        const isMuted = item.color === "#94A3B8";
        const barBg = isMuted
          ? `linear-gradient(90deg, ${item.color}88, ${item.color})`
          : `linear-gradient(90deg, ${item.color}33, ${item.color}66)`;
        return (
          <button
            key={item.code}
            type="button"
            onClick={() => onSelect?.(item.code)}
            className="ck-funnel-row group"
            style={{ "--i": idx } as React.CSSProperties}
            aria-label={`${item.label}: ${item.count} orders — tap to view`}
          >
            <span className="ck-funnel-label">{item.label}</span>
            <div className="flex-1 h-7 relative min-w-0">
              <div
                className="ck-funnel-bar"
                style={{
                  width: `${w}%`,
                  background: barBg,
                  borderColor: `${item.color}88`,
                  boxShadow: item.count > 0 ? `0 0 12px ${item.color}40, inset 0 1px 0 ${item.color}40` : undefined,
                }}
              >
                <span className="ck-funnel-sheen" style={{ background: `linear-gradient(90deg, transparent, ${item.color}55, transparent)` }} />
              </div>
              <span
                className="absolute top-1/2 -translate-y-1/2 text-[0.8125rem] font-extrabold tabular-nums transition-all whitespace-nowrap"
                style={inside
                  ? {
                      right: "8px",
                      color: isMuted ? "#0b1220" : "#0b1220",
                      textShadow: isMuted ? "0 0 4px rgba(255,255,255,0.6)" : "0 0 4px rgba(255,255,255,0.45)",
                    }
                  : { left: `calc(${w}% + 8px)`, color: item.color, textShadow: `0 0 6px ${item.color}80` }}
              >
                <CountUp value={item.count} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Donut (territory / size mix) ---------- */
export function MixDonut({
  data,
  size = 148,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  data: Array<{ name: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const c = size / 2;
  const r = c - thickness / 2 - 2;
  const circ = 2 * Math.PI * r;
  const [anim, setAnim] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const p = Math.min((t - start) / 900, 1);
      setAnim(1 - Math.pow(2, -10 * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  // Precompute cumulative fractions for segment offsets (pure reduce, no mutation)
  const segments = useMemo(() => {
    const built = data.reduce<Array<{ name: string; value: number; color: string; frac: number; offsetFrac: number }>>(
      (acc, d) => {
        const frac = total > 0 ? d.value / total : 0;
        const offsetFrac = acc.length > 0 ? acc[acc.length - 1].offsetFrac + acc[acc.length - 1].frac : 0;
        acc.push({ ...d, frac, offsetFrac });
        return acc;
      },
      [],
    );
    return built;
  }, [data, total]);

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness} />
        {segments.map((d) => {
          if (d.value === 0) return null;
          const dash = d.frac * circ * anim;
          const gap = circ - dash;
          const offset = -d.offsetFrac * circ;
          return (
            <circle
              key={d.name}
              cx={c} cy={c} r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              style={{ filter: `drop-shadow(0 0 4px ${d.color}55)`, transition: "opacity 200ms" }}
            />
          );
        })}
        <text x={c} y={c - 4} textAnchor="middle" fill="var(--nc-text,#E8F0F5)" fontSize={size * 0.17} fontWeight="700" transform={`rotate(90 ${c} ${c})`} className="tabular-nums">
          {centerValue ?? total}
        </text>
        {centerLabel && (
          <text x={c} y={c + size * 0.11} textAnchor="middle" fill="var(--nc-muted,#8B949E)" fontSize={size * 0.075} transform={`rotate(90 ${c} ${c})`}>
            {centerLabel}
          </text>
        )}
      </svg>
      <div className="flex-1 min-w-0 space-y-1">
        {data.slice(0, 6).map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-[0.75rem]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.color, boxShadow: `0 0 6px ${d.color}88` }} />
            <span className="flex-1 min-w-0 truncate text-muted-foreground">{d.name}</span>
            <span className="font-semibold tabular-nums text-foreground">{d.value}</span>
            <span className="text-[0.625rem] text-muted-foreground/70 tabular-nums w-9 text-right">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Week capacity list (horizontal day rows, expandable) ----------
   Each row: day label + points on the left, area chips on the right.
   Tapping a row expands it to show ALL areas + order count + capacity %.
   Designed for narrow WebView widths (Android app). */
export function WeekCapacityGrid({
  schedule,
  weekStart,
  offDays,
  maxDaily,
}: {
  schedule: Record<string, { orders: { city?: string | null }[]; totalPoints: number }> | null | undefined;
  weekStart?: string;
  offDays?: Array<{ date: string }>;
  maxDaily: number;
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [expanded, setExpanded] = useState<string | null>(todayStr);
  const startD = weekStart ? new Date(weekStart + "T00:00:00") : (() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d; })();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startD);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const ordersForDay = schedule?.[dateStr]?.orders || [];
    const pts = schedule?.[dateStr]?.totalPoints || 0;
    const count = ordersForDay.length;
    const pct = maxDaily > 0 ? Math.min(pts / maxDaily, 1) : 0;
    const cities = [...new Set(ordersForDay.map(o => o.city).filter(Boolean))] as string[];
    return {
      dateStr,
      pts,
      count,
      pct,
      cities,
      isOff: offDays?.some(od => od.date === dateStr),
      isToday: dateStr === todayStr,
      dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: d.getDate(),
    };
  });

  return (
    <div className="space-y-1">
      {days.map((d) => {
        const overload = d.pts > maxDaily;
        const isOpen = expanded === d.dateStr;
        const accent = d.isOff ? "#F87171" : overload ? "#F87171" : d.pts > 0 ? "#34D399" : "#8B949E";
        return (
          <div
            key={d.dateStr}
            className={`rounded-lg border overflow-hidden transition-colors ${d.isToday ? "ring-1 ring-primary/50" : ""}`}
            style={{
              background: isOpen ? "rgba(20,184,166,0.08)" : "rgba(255,255,255,0.02)",
              borderColor: d.isOff
                ? "rgba(248,113,113,0.30)"
                : d.isToday
                  ? "rgba(20,184,166,0.40)"
                  : "rgba(255,255,255,0.07)",
            }}
          >
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : d.dateStr)}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left active:bg-white/5"
              aria-expanded={isOpen}
              aria-label={`${d.dayName} ${d.dayNum}: ${d.count} orders, ${d.pts} points${d.cities.length ? `, areas: ${d.cities.join(", ")}` : ""}${d.isOff ? ", off day" : ""}`}
            >
              {/* Day label (left) */}
              <div className="shrink-0 w-12 text-center">
                <p className={`text-[0.625rem] font-semibold uppercase leading-tight ${d.isToday ? "text-primary" : d.isOff ? "text-red-300/80" : "text-muted-foreground"}`}>
                  {d.dayName}
                </p>
                <p className={`text-base font-bold tabular-nums leading-tight ${d.isOff ? "text-red-300/70" : d.pts > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                  {d.dayNum}
                </p>
              </div>

              {/* Points + capacity bar (middle) */}
              <div className="shrink-0 w-14 flex flex-col gap-1">
                <p className="text-[0.75rem] font-bold tabular-nums leading-none" style={{ color: accent }}>
                  {d.isOff ? "OFF" : `${d.pts}pt`}
                </p>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((d.isOff ? 0 : d.pct) * 100, 100)}%`,
                      background: overload
                        ? "linear-gradient(90deg, #F87171, #EF4444)"
                        : d.isOff
                          ? "transparent"
                          : "linear-gradient(90deg, #14b8a6, #34D399)",
                    }}
                  />
                </div>
                {!d.isOff && (
                  <p className="text-[0.5625rem] text-muted-foreground tabular-nums leading-none">
                    {d.count} ord · {Math.round(d.pct * 100)}%
                  </p>
                )}
              </div>

              {/* Areas (right) — preview chips when collapsed */}
              <div className="flex-1 min-w-0 flex flex-wrap gap-1 justify-end">
                {d.isOff ? (
                  <span className="text-[0.625rem] text-red-300/60 italic">off day</span>
                ) : d.cities.length === 0 ? (
                  <span className="text-[0.625rem] text-muted-foreground/40 italic">no area</span>
                ) : (
                  <>
                    {d.cities.slice(0, isOpen ? 99 : 2).map(c => (
                      <span
                        key={c}
                        className="text-[0.625rem] leading-tight px-1.5 py-0.5 rounded border border-white/10 bg-white/5 truncate"
                        style={{ maxWidth: "96px" }}
                        title={c}
                      >
                        {c}
                      </span>
                    ))}
                    {!isOpen && d.cities.length > 2 && (
                      <span className="text-[0.5625rem] text-muted-foreground/70 self-center">
                        +{d.cities.length - 2}
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Expand chevron */}
              {d.cities.length > 2 && !d.isOff && (
                <span className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} style={{ fontSize: "0.625rem" }}>
                  ▸
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Sparkline (tiny inline trend) ---------- */
export function Sparkline({
  data,
  color = "#34D399",
  width = 72,
  height = 24,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / range) * (height - 4)}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 3px ${color}66)` }} />
    </svg>
  );
}
