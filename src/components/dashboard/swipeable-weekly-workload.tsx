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

export function SwipeableWeeklyWorkload({ weekOffset, onWeekChange, schedule, weekStart, offDays }: {
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  schedule: Record<string, { orders: Order[]; totalPoints: number }> | null | undefined;
  weekStart?: string;
  offDays?: OffDay[];
}) {
  const MIN_OFFSET = -4;
  const MAX_OFFSET = 12;
  const SLIDE_COUNT = MAX_OFFSET - MIN_OFFSET + 1;
  const [dragX, setDragX] = useState(0);
  const [viewportW, setViewportW] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const draggingRef = useRef(false);

  const weekStartForOffset = (offset: number): string => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return format(addDays(monday, offset * 7), "yyyy-MM-dd");
  };

  // Measure the viewport width for pixel-based transforms.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewportW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goTo = useCallback((offset: number) => {
    const clamped = Math.min(MAX_OFFSET, Math.max(MIN_OFFSET, offset));
    onWeekChange(clamped);
  }, [onWeekChange]);

  const go = useCallback((dir: number) => goTo(weekOffset + dir), [weekOffset, goTo]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    draggingRef.current = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!draggingRef.current || touchStartXRef.current == null) return;
    setDragX(e.touches[0].clientX - touchStartXRef.current);
  };
  const onTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const threshold = viewportW ? viewportW * 0.2 : 80;
    if (dragX <= -threshold) go(1);
    else if (dragX >= threshold) go(-1);
    setDragX(0);
    touchStartXRef.current = null;
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const activeIndex = weekOffset - MIN_OFFSET;
  const translatePx = viewportW > 0 ? -activeIndex * viewportW + dragX : 0;
  const activeWeekStart = weekStart || weekStartForOffset(weekOffset);
  const activeWeekEnd = format(addDays(new Date(activeWeekStart), 6), "yyyy-MM-dd");

  return (
    <div className="rounded-xl border border-white/10 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2"><CalendarDays className="h-5 w-5 text-amber-400" />Weekly Workload</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => go(-1)} disabled={weekOffset <= MIN_OFFSET} className="p-1 rounded hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="h-4 w-4 text-muted-foreground" /></button>
          <button onClick={() => go(1)} disabled={weekOffset >= MAX_OFFSET} className="p-1 rounded hover:bg-white/10 disabled:opacity-30"><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
        </div>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.625rem] text-muted-foreground truncate">
          {activeWeekStart} → {activeWeekEnd}
          <span className="ml-1">{weekOffset === 0 ? "(Now)" : weekOffset < 0 ? `(${Math.abs(weekOffset)}w ago)` : `(+${weekOffset}w)`}</span>
        </span>
        {weekOffset !== 0 && <button onClick={() => goTo(0)} className="text-[0.625rem] text-primary hover:underline shrink-0 ml-2">Today</button>}
      </div>
      {/* Carousel viewport — pixel-based transform */}
      <div
        ref={viewportRef}
        className="overflow-hidden touch-pan-y select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="flex"
          style={{
            width: `${SLIDE_COUNT * 100}%`,
            transform: `translateX(${translatePx}px)`,
            transition: draggingRef.current ? "none" : "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {Array.from({ length: SLIDE_COUNT }, (_, i) => {
            const offset = MIN_OFFSET + i;
            // Only the active week has data (from the parent's fetch). Other slides
            // render the date grid without data — the parent fetches when you land on them.
            const isActive = offset === weekOffset;
            const ws = isActive && weekStart ? weekStart : weekStartForOffset(offset);
            const startD = new Date(ws);
            const days = Array.from({ length: 7 }, (_, di) => {
              const d = addDays(startD, di);
              const dateStr = format(d, "yyyy-MM-dd");
              const dayData = isActive ? schedule?.[dateStr] : undefined;
              const isOff = offDays?.some(od => od.date === dateStr);
              const isToday = todayStr === dateStr;
              return { dateStr, dayData, isOff, isToday, dayName: format(d, "EEE"), dayNum: format(d, "d") };
            });
            const totalPts = days.reduce((s, x) => s + (x.dayData?.totalPoints || 0), 0);
            return (
              <div key={offset} className="shrink-0" style={{ width: `${100 / SLIDE_COUNT}%` }}>
                <div className="px-0.5">
                  <div className="grid grid-cols-7 gap-1">
                    {days.map(({ dateStr, dayData, isOff, isToday, dayName, dayNum }) => (
                      <div key={dateStr} className={`rounded-lg p-2 text-center border ${isToday ? "border-primary/40 bg-primary/10" : "border-white/5"} ${isOff ? "bg-red-500/10" : ""}`}>
                        <p className="text-[0.625rem] text-muted-foreground">{dayName}</p>
                        <p className={`text-sm font-bold ${isOff ? "text-red-400" : isToday ? "text-primary" : "text-foreground"}`}>{dayNum}</p>
                        <p className="text-[0.625rem] text-muted-foreground">{dayData ? `${dayData.totalPoints}pt` : isOff ? "OFF" : "—"}</p>
                        <p className="text-[0.625rem] text-muted-foreground">{dayData ? `${dayData.orders.length} ord` : ""}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-[0.625rem] text-muted-foreground">{isActive ? `${totalPts}pt total` : "Swipe to load"}</span>
                    <span className="text-[0.625rem] text-muted-foreground">{offset === 0 ? "Current" : offset < 0 ? `${Math.abs(offset)}w ago` : `+${offset}w`}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
        {Array.from({ length: SLIDE_COUNT }, (_, i) => {
          const offset = MIN_OFFSET + i;
          if (Math.abs(offset - weekOffset) > 3 && offset !== 0) return null;
          return (
            <button
              key={offset}
              onClick={() => goTo(offset)}
              className={`h-1.5 rounded-full transition-all ${offset === weekOffset ? "w-4 bg-primary" : "w-1.5 bg-white/20 hover:bg-white/40"}`}
              aria-label={`Week ${offset}`}
            />
          );
        })}
      </div>
    </div>
  );
}

