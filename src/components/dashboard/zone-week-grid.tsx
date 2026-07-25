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

export function ZoneWeekGrid({ selSchedule, selWeekStart, offDays }: {
  selSchedule: Record<string, { orders: Order[]; totalPoints: number }> | null | undefined;
  selWeekStart?: string;
  offDays?: OffDay[];
}) {
  const startD = selWeekStart ? new Date(selWeekStart) : startOfWeek(new Date(), { weekStartsOn: 1 });
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(startD, i);
    const dateStr = format(d, "yyyy-MM-dd");
    const dayData = selSchedule?.[dateStr];
    const isOff = offDays?.some(od => od.date === dateStr);
    const isToday = todayStr === dateStr;
    const citySet = new Set<string>();
    if (dayData?.orders) for (const o of dayData.orders) if (o.city) citySet.add(o.city);
    return { dateStr, dayData, isOff, isToday, dayName: format(d, "EEE"), dayNum: format(d, "d"), cities: [...citySet].sort(), count: dayData?.orders.length || 0, total: dayData?.totalPoints || 0 };
  });
  const weekTotal = days.reduce((s, d) => s + d.total, 0);
  const weekOrders = days.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-1">
      {days.map(({ dateStr, dayData, isOff, isToday, dayName, dayNum, cities, count, total }) => (
        <div key={dateStr} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${isToday ? "border-primary/40 bg-primary/10" : "border-white/5"} ${isOff ? "bg-red-500/10" : ""}`}>
          {/* Date column */}
          <div className="w-12 shrink-0 text-center">
            <p className="text-[0.625rem] text-muted-foreground leading-none">{dayName}</p>
            <p className={`text-sm font-bold leading-tight ${isOff ? "text-red-400" : isToday ? "text-primary" : "text-foreground"}`}>{dayNum}</p>
          </div>
          {/* Cities column */}
          <div className="flex-1 min-w-0">
            {isOff ? (
              <span className="text-[0.75rem] text-red-400/80 italic">OFF day</span>
            ) : cities.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {cities.map((city) => (
                  <span key={city} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-white/10 text-muted-foreground">{city}</span>
                ))}
              </div>
            ) : (
              <span className="text-[0.75rem] text-muted-foreground/50 italic">No pickups</span>
            )}
          </div>
          {/* Stats column */}
          <div className="shrink-0 text-right">
            {count > 0 ? (
              <>
                <p className="text-[0.75rem] font-semibold text-foreground leading-none">{count} <span className="text-muted-foreground font-normal">ord</span></p>
                <p className="text-[0.625rem] text-muted-foreground leading-tight">{total}pt</p>
              </>
            ) : (
              <p className="text-[0.75rem] text-muted-foreground/40">—</p>
            )}
          </div>
        </div>
      ))}
      {/* Week summary footer */}
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10 text-[0.625rem] text-muted-foreground">
        <span>Week total</span>
        <span className="font-semibold text-foreground">{weekOrders} orders · {weekTotal}pt</span>
      </div>
    </div>
  );
}

