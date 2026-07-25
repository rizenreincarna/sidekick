"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { format, addDays, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, isWeekend } from "date-fns";
import { Truck, Plus, Calendar, ClipboardList, Settings, Send, CheckCircle2, Clock, MapPin, Phone, Building2, Home, AlertCircle, Zap, RotateCcw, Trash2, MessageCircle, X, ChevronRight, ChevronLeft, Route, Download, Upload, Eye, Shield, ShieldCheck, Info, Layers, CalendarDays, ArrowRightLeft, LogOut, User as UserIcon, FileSpreadsheet, FileDown, FileUp, CheckCircle, AlertTriangle, Pencil, Save, Siren, StickyNote, Users, UserPlus, Key, UserCog, Undo2, MapPinOff, Globe, PlusCircle, Bell, Search, ChevronDown, ChevronUp, AtSign, BookOpen, GraduationCap, Lightbulb, Sparkles, Target, ArrowRight, Play, History, Tag, Star, Bot, Loader2, Package, BarChart3, Smartphone, XCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { ZONES, STATUS_CONFIG, SIZE_CONFIG, getZoneName, getZoneColor, MAX_DAILY_POINTS, CUSTOM_ZONE_START } from "@/lib/zones";
import { AiChatPanel, AiSettingsSection } from "@/components/ai-assistant";
import { VerificationProgressDrawer } from "@/components/verification-progress";
import { GeocodeProgressDrawer } from "@/components/geocode-progress";
import { HeroProfileDialog } from "@/components/hero-profile-dialog";
import type { Order, Holiday, OffDay, ZoneConfig, UserZoneData, SOSRequest, Stats, ManagedUser, HeroOption, NotificationItem, ChatMsg, AuditLogEntry, ErthboxLocation, WhatsAppTemplate } from "@/types/page";
import { WHATSAPP_VARIABLES, DEFAULT_WHATSAPP_TEMPLATES } from "@/types/page";
import { fillTemplate, formatPhoneForWhatsApp, getWhatsAppLink } from "@/lib/whatsapp";
import { useFetchData } from "@/lib/use-fetch-data";
import { formatEventType, ZoneBadge, StatusBadge } from "@/components/ui/shared-badges";
import { MiniCalendar } from "@/components/mini-calendar";
import { OrderCard } from "@/components/order-card";

export function ScheduleTab({ stats, orders, onRefresh, userZones }: { stats: Stats | null; orders: Order[]; onRefresh: () => void; userZones?: UserZoneData[] }) {
  const [scheduling, setScheduling] = useState(false);
  const [exporting, setExporting] = useState("");
  const [result, setResult] = useState<{ scheduled: number; unscheduled: number } | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const { toast } = useToast();

  const handleAutoSchedule = async () => {
    setScheduling(true);
    try {
      const res = await fetch("/api/schedule", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult({ scheduled: data.scheduled.length, unscheduled: data.unscheduled.length });
      toast({ title: `Auto-scheduled ${data.scheduled.length} orders`, description: data.unscheduled.length > 0 ? `${data.unscheduled.length} couldn't be scheduled` : undefined });
      onRefresh();
    } catch { toast({ title: "Auto-schedule failed", variant: "destructive" }); }
    finally { setScheduling(false); }
  };

  const handleZeoExportDay = async (date: string) => {
    setExporting(date);
    try {
      const res = await fetch("/api/export/zeo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Zeo_Export_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Zeo export downloaded", description: `Upload this file to Zeo Route Planner for ${date}` });
    } catch (err: unknown) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setExporting("");
    }
  };

  // Calendar computations
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  const offDaySet = useMemo(() => new Set((stats?.offDays || []).map(o => o.date)), [stats?.offDays]);
  const holidayMap = useMemo(() => new Map((stats?.holidays || []).map(h => [h.date, h.name])), [stats?.holidays]);

  const getDayPoints = (dateStr: string): number => {
    return stats?.scheduleByDate[dateStr]?.totalPoints || 0;
  };

  const getDayHasEvent = (dateStr: string): boolean => {
    const dayOrders = stats?.scheduleByDate[dateStr]?.orders || [];
    return dayOrders.some((o: Order) => o.isEvent);
  };

  const getDayHasErthbox = (dateStr: string): boolean => {
    const dayOrders = stats?.scheduleByDate[dateStr]?.orders || [];
    return dayOrders.some((o: Order) => o.isErthbox);
  };

  const getDayColor = (day: Date, points: number): string => {
    const dateStr = format(day, "yyyy-MM-dd");
    const hasEvent = getDayHasEvent(dateStr);
    const hasErthbox = getDayHasErthbox(dateStr);
    if (offDaySet.has(dateStr)) return "bg-red-500/10 text-red-400/60 opacity-60"; // OFF DAY - no scheduling
    if (!isSameMonth(day, currentDate)) return "bg-white/3 text-muted-foreground/30";
    if (hasEvent) return "bg-amber-500/15 border-amber-500/30 text-amber-300"; // EVENT day
    if (hasErthbox && !hasEvent) return "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"; // ERTHBOX day
    if (holidayMap.has(dateStr) && points === 0) return "bg-amber-500/5 border-amber-500/10 text-amber-300/70"; // Holiday - no office pickups
    if (points > MAX_DAILY_POINTS) return "bg-red-500/20 border-red-500/30 text-red-300";
    if (points >= 10) return "bg-red-500/15 border-red-500/20 text-red-300";
    if (points >= 6) return "bg-amber-500/15 border-amber-500/20 text-amber-300";
    if (points > 0) return "bg-emerald-500/15 border-emerald-500/20 text-emerald-300";
    return "bg-white/5 text-muted-foreground";
  };

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedOrders = selectedDateStr ? (stats?.scheduleByDate[selectedDateStr]?.orders || orders.filter(o => o.scheduledDate === selectedDateStr && ["SCHEDULED", "CONFIRMED", "BOOKED"].includes(o.status))) : [];
  const selectedPoints = selectedDateStr ? getDayPoints(selectedDateStr) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleAutoSchedule} disabled={scheduling} className="gap-2 h-12 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-3 text-base font-semibold">
          <Zap className="h-5 w-5" />{scheduling ? "Scheduling..." : "Auto-Schedule All Pending"}
        </Button>
        {result && <span className="text-sm text-muted-foreground">Last: {result.scheduled} scheduled, {result.unscheduled} unscheduled</span>}
        <p className="text-xs text-muted-foreground">Every day is a working day. Only OFF DAYS block scheduling. Holidays block office pickups only.</p>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setCurrentDate(addMonths(currentDate, -1))} className="h-9 w-9 p-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h3 className="font-semibold text-base">{format(currentDate, "MMMM yyyy")}</h3>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="h-9 w-9 p-0">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} className="text-center text-[0.625rem] font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const pts = getDayPoints(dateStr);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrent = isToday(day);
            const colorClass = getDayColor(day, pts);
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(day)}
                className={`relative rounded-lg border p-1 min-h-[44px] flex flex-col items-center justify-center transition-all ${colorClass} ${isSelected ? "ring-2 ring-primary" : ""} ${isCurrent ? "border-primary/40" : "border-white/5"} hover:bg-white/10`}
              >
                <span className={`text-xs font-medium ${isCurrent ? "text-primary" : ""}`}>{format(day, "d")}</span>
                {pts > 0 && isSameMonth(day, currentDate) && (
                  <span className="text-[0.625rem] font-bold">{pts}pt</span>
                )}
                {getDayHasEvent(dateStr) && isSameMonth(day, currentDate) && (
                  <span className="text-[0.625rem]">📌</span>
                )}
                {getDayHasErthbox(dateStr) && isSameMonth(day, currentDate) && !getDayHasEvent(dateStr) && (
                  <span className="text-[0.625rem]">📦</span>
                )}
                {holidayMap.has(dateStr) && (
                  <span className="text-[0.625rem] text-amber-400">🎉</span>
                )}
                {offDaySet.has(dateStr) && (
                  <span className="text-[0.625rem] text-red-400">OFF</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[0.625rem] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/15 border border-emerald-500/20" /> &lt;6pts</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/15 border border-amber-500/20" /> 6-9pts</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/15 border border-red-500/20" /> 10+pts</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/15 border border-amber-500/30" /> 📌 Event</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/10 border border-red-500/20" /> OFF Day</span>
          <span className="flex items-center gap-1">🎉 Holiday</span>
        </div>
      </div>

      {/* Load Visualization Bar - Current Week */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChartIcon className="h-4 w-4 text-primary" />This Week&apos;s Load</h3>
        <div className="space-y-2">
          {weekDays.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const pts = getDayPoints(dateStr);
            const isOff = offDaySet.has(dateStr);
            const isHoliday = holidayMap.has(dateStr);
            const hasEvent = getDayHasEvent(dateStr);
            const hasErthbox = getDayHasErthbox(dateStr);
            const pct = isOff ? 0 : Math.min((pts / MAX_DAILY_POINTS) * 100, 100);
            const barColor = isOff ? "bg-red-500/30" : hasEvent ? "bg-amber-500" : hasErthbox ? "bg-emerald-500" : pts >= 10 ? "bg-red-500" : pts >= 6 ? "bg-amber-500" : pts > 0 ? "bg-emerald-500" : "bg-white/10";
            return (
              <div key={dateStr} className="flex items-center gap-2">
                <span className={`text-[0.75rem] w-8 text-right ${isToday(day) ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  {format(day, "EEE").charAt(0)}{format(day, "EEE").charAt(1)}
                </span>
                <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[0.75rem] w-10 text-right text-muted-foreground">
                  {isOff ? "OFF" : hasEvent ? `${pts}📌` : hasErthbox ? `${pts}📦` : isHoliday ? `${pts}🎉` : `${pts}/${MAX_DAILY_POINTS}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Detail Panel */}
      {selectedDate && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {format(selectedDate, "dd MMM yyyy (EEE)")}
              {isToday(selectedDate) && <Badge className="bg-primary text-primary-foreground text-[0.625rem] ml-1">Today</Badge>}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">{selectedPoints}/{MAX_DAILY_POINTS} pts</Badge>
              {selectedOrders.length > 0 && (
                <Button size="sm" variant="ghost" className="h-9 gap-1 text-[0.75rem] text-muted-foreground hover:bg-muted hover:text-foreground" disabled={exporting === selectedDateStr} onClick={() => selectedDateStr && handleZeoExportDay(selectedDateStr)}>
                  <FileDown className="h-3.5 w-3.5" />{exporting === selectedDateStr ? "..." : "Zeo XLSX"}
                </Button>
              )}
            </div>
          </div>
          {selectedOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">No orders scheduled for this day</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {selectedOrders.map(o => (
                <div key={o.id} className={o.isEvent || o.isErthbox ? "relative" : ""}>
                  {o.isEvent && (
                    <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-amber-500 z-10" />
                  )}
                  {o.isErthbox && !o.isEvent && (
                    <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-emerald-500 z-10" />
                  )}
                  <div className={o.isEvent ? "pl-2 bg-amber-500/5" : o.isErthbox ? "pl-2 border-l-2 border-emerald-500/40" : ""}>
                    {o.isEvent && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.625rem] h-5 px-1.5">📌 EVENT</Badge>
                        {o.eventType && <Badge variant="outline" className="text-[0.625rem] h-5 border-amber-500/30 text-amber-400">{formatEventType(o.eventType)}</Badge>}
                      </div>
                    )}
                    {o.isErthbox && !o.isEvent && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[0.625rem] h-5 px-1.5">📦 ERTHBOX</Badge>
                      </div>
                    )}
                    <OrderCard order={o} compact onRefresh={onRefresh} holidays={stats?.holidays} offDays={stats?.offDays} userZones={userZones} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Simple bar chart icon since we don't import from recharts

export function BarChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}


function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

