"use client";

export function TimeRangeSelector({ range, setRange }: { range: string; setRange: (r: string) => void }) {
  const options = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "year", label: "Year" },
    { value: "all", label: "All" },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg p-0.5 ck-panel overflow-x-auto max-w-full" style={{ scrollbarWidth: "none" }}>
      {options.map(o => (
        <button key={o.value} onClick={() => setRange(o.value)}
          className={`px-2 py-1 rounded-md text-[0.625rem] font-medium transition-all whitespace-nowrap shrink-0 ${
            range === o.value ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
          }`}
        >{o.label}</button>
      ))}
    </div>
  );
}
