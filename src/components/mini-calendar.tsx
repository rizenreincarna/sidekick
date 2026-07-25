"use client";

import { useState, useMemo } from "react";
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isWeekend } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Holiday, OffDay } from "@/types/page";

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ============ MINI CALENDAR ============
export function MiniCalendar({
  selectedDate,
  onSelectDate,
  holidays = [],
  offDays = [],
  isOffice = false,
}: {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  holidays?: Holiday[];
  offDays?: OffDay[];
  isOffice?: boolean;
}) {
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) return parseISO(selectedDate);
    return new Date();
  });

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const holidaySet = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);
  const offDaySet = useMemo(() => new Set(offDays.map(o => o.date)), [offDays]);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setViewMonth(addMonths(viewMonth, -1))} className="h-9 w-9 p-0 hover:bg-white/10">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground">{format(viewMonth, "MMMM yyyy")}</span>
        <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setViewMonth(addMonths(viewMonth, 1))} className="h-9 w-9 p-0 hover:bg-white/10">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[0.625rem] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isTodayDate = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const isPast = dateStr < todayStr;
          const isOff = offDaySet.has(dateStr);
          const isHoliday = holidaySet.has(dateStr);
          const isWeekendDay = isWeekend(day);
          const isBlockedWeekend = isOffice && isWeekendDay;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => !isPast && !isOff && !isBlockedWeekend && onSelectDate(dateStr)}
              disabled={isPast || isOff || isBlockedWeekend}
              className={`relative rounded-md p-1 text-xs text-center transition-all min-h-[36px] flex flex-col items-center justify-center
                ${!isCurrentMonth ? "text-muted-foreground/20" : ""}
                ${isTodayDate && !isSelected ? "border border-primary/40 text-primary font-bold" : ""}
                ${isSelected ? "bg-primary text-primary-foreground font-bold rounded-md" : "hover:bg-white/10"}
                ${isPast ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
                ${isOff && isCurrentMonth ? "bg-red-500/10 text-red-400/60 cursor-not-allowed" : ""}
                ${isBlockedWeekend && isCurrentMonth ? "bg-red-500/10 text-red-400/60 cursor-not-allowed line-through" : ""}
              `}
            >
              <span>{format(day, "d")}</span>
              {((isOff || isBlockedWeekend) || isHoliday) && isCurrentMonth && !isSelected && (
                <span className="text-[0.625rem] leading-none mt-0.5">{(isOff || isBlockedWeekend) ? "OFF" : "🎉"}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 text-[0.625rem] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-primary" /> Selected</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/30" /> OFF</span>
        <span className="flex items-center gap-1">🎉 Holiday</span>
        {isOffice && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/30 line-through" /> Weekend</span>}
      </div>
    </div>
  );
}