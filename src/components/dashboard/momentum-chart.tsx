"use client";

import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

/* Momentum chart — created vs completed area chart with neon gradient fills.
   Interactive: hover/touch tooltip, tap legend chips to toggle series. */

const chartConfig = {
  created: { label: "Created", color: "#22D3EE" },
  completed: { label: "Completed", color: "#34D399" },
} satisfies ChartConfig;

function MomentumTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="ck-tooltip">
      <p className="text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[0.75rem]">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.dataKey === "created" ? "#22D3EE" : "#34D399", boxShadow: `0 0 5px ${p.dataKey === "created" ? "#22D3EE" : "#34D399"}` }}
          />
          <span className="text-muted-foreground capitalize">{p.dataKey}</span>
          <span className="ml-auto font-bold tabular-nums text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function MomentumChart({
  data,
  range,
}: {
  data: Array<{ date: string; created: number; completed: number }>;
  range: string;
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const formatted = useMemo(() => {
    return data.map((d) => ({
      ...d,
      label: range === "year"
        ? d.date.slice(5) // MM
        : d.date.slice(5).replace("-", "/"), // MM/DD
    }));
  }, [data, range]);

  const toggle = (key: string) => setHidden((h) => ({ ...h, [key]: !h[key] }));

  if (!data || data.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">No trend data for this range</p>;
  }

  return (
    <div className="space-y-2">
      {/* Legend chips — tap to toggle series */}
      <div className="flex items-center gap-2">
        {(["created", "completed"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`ck-legend-chip ${hidden[key] ? "ck-legend-chip--off" : ""}`}
            aria-pressed={!hidden[key]}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: chartConfig[key].color,
                boxShadow: hidden[key] ? "none" : `0 0 6px ${chartConfig[key].color}`,
                opacity: hidden[key] ? 0.3 : 1,
              }}
            />
            {chartConfig[key].label}
          </button>
        ))}
      </div>

      <ChartContainer config={chartConfig} className="h-44 w-full aspect-auto">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formatted} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="ckCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="ckCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 9 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 9 }}
              allowDecimals={false}
              width={30}
            />
            <Tooltip content={<MomentumTooltip />} cursor={{ stroke: "rgba(255,255,255,0.15)", strokeDasharray: "3 3" }} />
            {!hidden.created && (
              <Area
                type="monotone"
                dataKey="created"
                stroke="#22D3EE"
                strokeWidth={2}
                fill="url(#ckCreated)"
                dot={false}
                activeDot={{ r: 3.5, fill: "#22D3EE", stroke: "none" }}
                animationDuration={900}
                animationEasing="ease-out"
              />
            )}
            {!hidden.completed && (
              <Area
                type="monotone"
                dataKey="completed"
                stroke="#34D399"
                strokeWidth={2}
                fill="url(#ckCompleted)"
                dot={false}
                activeDot={{ r: 3.5, fill: "#34D399", stroke: "none" }}
                animationDuration={900}
                animationEasing="ease-out"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
