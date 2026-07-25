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
export function SupportDashboard({ onRefresh, refreshKey, userZones }: { onRefresh: () => void; refreshKey: number; userZones?: UserZoneData[] }) {
  const [timeRange, setTimeRange] = useState("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [supportData, setSupportData] = useState<{
    heroOverview: Array<{ id: string; name: string; lastLogin: string | null; totalOrders: number; activeOrders: number; completedOrders: number; weekOrders: number; weekPoints: number; todayOrders: number; todayPoints: number; offDays: Array<{ id: string; date: string; reason: string | null }>; offDaysThisWeek: Array<{ id: string; date: string; reason: string | null }>; holidays: Array<{ id: string; date: string; name: string }>; pendingCount: number; scheduledCount: number }>;
    allActiveOrders: Array<{ id: string; orderId: string; customerName: string; status: string; city: string; zone: number; points: number; size: string; scheduledDate: string | null; userId: string; user: { id: string; username: string; displayName: string; role: string } }>;
    orders: { total: number; byStatus: Record<string, number>; trends: Array<{ date: string; created: number; completed: number }> };
    sos: { active: number; recent: number };
    heroOffDaysUpcoming: Array<{ id: string; date: string; reason: string | null; user: { id: string; username: string; displayName: string } }>;
    heroes: Array<{ id: string; name: string; username: string }>;
  } | null>(null);
  const [reassignLoading, setReassignLoading] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/stats/support?range=${timeRange}&weekOffset=${weekOffset}&_k=${refreshKey}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setSupportData(d); }).catch(() => {});
  }, [timeRange, weekOffset, refreshKey]);

  const handleReassign = async (orderId: string) => {
    const targetId = reassignTarget[orderId];
    if (!targetId) { toast({ title: "Select a hero first", variant: "destructive" }); return; }
    setReassignLoading(orderId);
    try {
      const res = await fetch("/api/orders/reassign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, targetHeroId: targetId, reason: "Support reassignment" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const result = await res.json();
      toast({ title: "Order reassigned", description: `#${orderId} → ${result.to}` });
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Reassignment failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setReassignLoading(null); }
  };

  if (!supportData) return <div className="text-center py-12 text-muted-foreground">Loading support dashboard...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />Support Dashboard</h2>
        <TimeRangeSelector range={timeRange} setRange={setTimeRange} />
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Total Orders ({timeRange})</p>
          <p className="text-xl font-bold text-cyan-400">{supportData.orders.total}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Active SOS</p>
          <p className="text-xl font-bold text-red-400">{supportData.sos.active}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Active Heroes</p>
          <p className="text-xl font-bold text-emerald-400">{supportData.heroes.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Active Orders</p>
          <p className="text-xl font-bold text-primary">{supportData.allActiveOrders.length}</p>
        </div>
      </div>

      {/* Order Trends */}
      {supportData.orders.trends.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-2"><BarChart3 className="h-4 w-4 text-cyan-400" />Order Trends</h3>
          <MiniBarChart data={supportData.orders.trends} />
        </div>
      )}

      {/* Hero Overview */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-xs flex items-center gap-2"><Users className="h-4 w-4 text-cyan-400" />Hero Overview</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-white/10"><ChevronLeft className="h-3 w-3 text-muted-foreground" /></button>
            <span className="text-[0.625rem] text-muted-foreground">Week {weekOffset === 0 ? "(Current)" : weekOffset < 0 ? `(${Math.abs(weekOffset)} ago)` : `(+${weekOffset})`}</span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-white/10"><ChevronRight className="h-3 w-3 text-muted-foreground" /></button>
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-[0.625rem] text-primary hover:underline">Now</button>}
          </div>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {supportData.heroOverview.sort((a, b) => b.activeOrders - a.activeOrders).map(h => (
            <div key={h.id} className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{h.name}</span>
                  {h.offDaysThisWeek.length > 0 && <Badge variant="outline" className="text-[0.625rem] border-red-500/30 text-red-400">OFF {h.offDaysThisWeek.map(d => d.date.slice(-5)).join(", ")}</Badge>}
                </div>
                <div className="flex items-center gap-3 text-[0.625rem] text-muted-foreground">
                  <span>Today: <span className="text-foreground font-medium">{h.todayPoints}pts</span></span>
                  <span>Week: <span className="text-foreground font-medium">{h.weekPoints}pts</span></span>
                  <span>Active: <span className="text-foreground font-medium">{h.activeOrders}</span></span>
                  <span>Pending: <span className="text-yellow-400 font-medium">{h.pendingCount}</span></span>
                </div>
              </div>
              {/* Workload bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/5 rounded-full h-2">
                  <div className={`rounded-full h-2 ${h.weekPoints >= 60 ? "bg-red-500/60" : h.weekPoints >= 36 ? "bg-amber-500/60" : "bg-emerald-500/60"}`}
                    style={{ width: `${Math.min((h.weekPoints / 84) * 100, 100)}%` }} />
                </div>
                <span className="text-[0.625rem] text-muted-foreground">{h.weekPoints}/84pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Hero OFF Days */}
      {supportData.heroOffDaysUpcoming.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-2"><CalendarDays className="h-4 w-4 text-red-400" />Hero OFF Days (Next 2 Weeks)</h3>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {supportData.heroOffDaysUpcoming.map(d => (
              <div key={d.id} className="flex items-center justify-between text-[0.625rem] py-0.5">
                <span className="text-foreground font-medium">{d.user.displayName || d.user.username}</span>
                <span className="text-muted-foreground">{d.date}{d.reason ? ` (${d.reason})` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Reassignment */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><ArrowRightLeft className="h-4 w-4 text-primary" />Reassign Orders</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {supportData.allActiveOrders.slice(0, 20).map(o => (
            <div key={o.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2 border border-white/5 flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <p className="text-[0.625rem] font-medium text-foreground">#{o.orderId} {o.customerName}</p>
                <p className="text-[0.625rem] text-muted-foreground">{o.city} Z{o.zone} · {o.size}({o.points}pt) · <span className="text-amber-400">{o.user.displayName || o.user.username}</span></p>
              </div>
              <Select value={reassignTarget[o.id] || ""} onValueChange={v => setReassignTarget(prev => ({ ...prev, [o.id]: v }))}>
                <SelectTrigger className="text-[0.625rem] bg-white/5 border border-white/10 h-7 w-[110px]">
                  <SelectValue placeholder="Assign to..." />
                </SelectTrigger>
                <SelectContent>
                  {supportData.heroes.filter(h => h.id !== o.user.id).map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="text-[0.625rem] h-6 px-2" disabled={reassignLoading === o.id || !reassignTarget[o.id]} onClick={() => handleReassign(o.id)}>
                {reassignLoading === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightLeft className="h-3 w-3" />}
              </Button>
            </div>
          ))}
          {supportData.allActiveOrders.length > 20 && <p className="text-[0.625rem] text-muted-foreground text-center">Showing 20 of {supportData.allActiveOrders.length} active orders</p>}
        </div>
      </div>

      {/* Orders by Status */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs mb-2">Orders by Status ({timeRange})</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {Object.entries(supportData.orders.byStatus).map(([status, count]) => (
            <div key={status} className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-sm font-bold text-foreground">{count}</p>
              <p className="text-[0.625rem] text-muted-foreground">{status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

