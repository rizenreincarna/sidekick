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

import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { MiniBarChart } from "@/components/dashboard/mini-bar-chart";
import { ZoneWeekGrid } from "@/components/dashboard/zone-week-grid";
export function HeroDashboard({ stats, onRefresh, userZones, onFilterOrders }: { stats: Stats | null; onRefresh: () => void; userZones?: UserZoneData[]; onFilterOrders?: (status: string) => void }) {
  const { data: session } = useSession();
  const [timeRange, setTimeRange] = useState("week");
  const [weekOffset, setWeekOffset] = useState(0);

  const [rangeStats, setRangeStats] = useState<Stats | null>(null);

  // Fetch range-specific stats (weekOffset cycles the Zone Coverage week)
  useEffect(() => {
    fetch(`/api/stats?range=${timeRange}&weekOffset=${weekOffset}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setRangeStats(d); }).catch(() => {});
  }, [timeRange, weekOffset]);

  const effectiveStats = rangeStats || stats;

  if (!effectiveStats) return <div className="text-center py-12 text-muted-foreground">Loading dashboard...</div>;

  const statusItems = [
    { label: "Pending", code: "PENDING", count: effectiveStats.pendingCount, color: "text-yellow-400", bg: "bg-yellow-500/15", icon: Clock },
    { label: "Scheduled", code: "SCHEDULED", count: effectiveStats.scheduledCount, color: "text-cyan-400", bg: "bg-cyan-500/15", icon: Calendar },
    { label: "Contacted", code: "CONFIRMED", count: effectiveStats.confirmedCount, color: "text-emerald-400", bg: "bg-emerald-500/15", icon: CheckCircle2 },
    { label: "Booked", code: "BOOKED", count: effectiveStats.bookedCount, color: "text-amber-400", bg: "bg-amber-500/15", icon: Building2 },
    { label: "Completed", code: "COMPLETED", count: effectiveStats.completedCount, color: "text-emerald-100", bg: "bg-slate-500/15", icon: CheckCircle2 },
  ];

  const selSchedule = effectiveStats.selWeekScheduleByDate || effectiveStats.scheduleByDate;

  return (
    <div className="space-y-4">
      {/* Header with time range */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Truck className="h-5 w-5 text-primary" />My Dashboard</h2>
        <TimeRangeSelector range={timeRange} setRange={setTimeRange} />
      </div>

      {/* Status Cards — tap a card to jump to Orders pre-filtered by that status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {statusItems.map(({ label, code, count, color, bg, icon: Icon }) => (
          <button key={label} type="button" onClick={() => onFilterOrders?.(code)} className={`text-left rounded-xl border border-white/10 ${bg} p-3 sm:p-4 bg-card earth-glow transition-transform active:scale-95 hover:border-primary/40 hover:shadow-[0_0_16px_rgba(52,211,153,0.18)]`}>
            <div className="flex items-center gap-2">
              <Icon className={`h-6 w-6 ${color}`} />
              <div><p className={`text-2xl font-bold ${color}`}>{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>
            </div>
          </button>
        ))}
      </div>

      {/* Range Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Created ({timeRange})</p>
          <p className="text-xl font-bold text-cyan-400">{effectiveStats.createdInRange ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Completed ({timeRange})</p>
          <p className="text-xl font-bold text-emerald-400">{effectiveStats.completedInRange ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Points Earned ({timeRange})</p>
          <p className="text-xl font-bold text-primary">{effectiveStats.pointsInRange ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Today</p>
          <p className="text-xl font-bold text-amber-400">{effectiveStats.todayPoints}/{MAX_DAILY_POINTS} pts</p>
        </div>
      </div>

      {/* Order Trends */}
      {effectiveStats.trends && effectiveStats.trends.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-2"><BarChart3 className="h-4 w-4 text-cyan-400" />Order Trends <span className="text-[0.625rem] text-muted-foreground">(cyan=created, green=completed)</span></h3>
          <MiniBarChart data={effectiveStats.trends} />
        </div>
      )}

      {/* Today's Pickups (full width — Route Planning widget removed; Zeo export lives in Schedule tab) */}
      <div className="rounded-xl border border-white/10 bg-card earth-glow p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><Truck className="h-5 w-5 text-primary" />Today&apos;s Pickups</h3>
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">{effectiveStats.todayPoints}/{MAX_DAILY_POINTS} pts</Badge>
        </div>
        <Progress value={(effectiveStats.todayPoints / MAX_DAILY_POINTS) * 100} className="h-2 mb-3" />
        {effectiveStats.todayOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No pickups today</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {effectiveStats.todayOrders.map(o => (
              <div key={o.id} className={o.isEvent ? "pl-2 bg-amber-500/5 rounded-l-md" : o.isErthbox ? "pl-2 bg-emerald-500/5 rounded-l-md" : ""}>
                <OrderCard order={o} compact onRefresh={onRefresh} holidays={effectiveStats.holidays} offDays={effectiveStats.offDays} userZones={userZones} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zone Coverage - 7-day week view (all 7 days always visible) */}
      <div className="nc-card nc-card--glow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2"><Layers className="h-5 w-5 text-primary" style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.5))" }} />Zone Coverage</h3>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-white/10"><ChevronLeft className="h-4 w-4 text-muted-foreground" /></button>
            <span className="text-[0.625rem] text-muted-foreground text-center min-w-[110px]">
              {effectiveStats.selWeekStart && effectiveStats.selWeekEnd ? `${effectiveStats.selWeekStart} → ${effectiveStats.selWeekEnd}` : "This Week"}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-white/10"><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
          </div>
        </div>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)} className="text-[0.625rem] text-primary hover:underline mb-2">← Back to current week</button>
        )}
        {/* 7-day grid: always shows the full selected week (Mon–Sun) */}
        <ZoneWeekGrid selSchedule={selSchedule} selWeekStart={effectiveStats.selWeekStart} offDays={effectiveStats.offDays} />
      </div>

      {/* Upcoming Holidays */}
      {effectiveStats.holidays.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-2"><AlertCircle className="h-5 w-5 text-amber-400" />Upcoming Public Holidays</h3>
          <div className="space-y-1.5">
            {effectiveStats.holidays.map(h => (
              <div key={h.id} className="flex justify-between items-center text-sm">
                <span className="font-medium">{h.name}</span>
                <span className="text-muted-foreground">{format(parseISO(h.date), "dd MMM yyyy (EEE)")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

