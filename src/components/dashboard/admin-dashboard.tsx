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
export function AdminDashboard({ onRefresh, refreshKey, userZones }: { onRefresh: () => void; refreshKey: number; userZones?: UserZoneData[] }) {
  const [timeRange, setTimeRange] = useState("week");
  const [balance, setBalance] = useState<{ balance: number; total_balance: number; status: string } | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [adminData, setAdminData] = useState<{
    orders: { total: number; created: number; completed: number; deleted: number; imported: number; byStatus: Record<string, number>; bySize: Record<string, number>; byZone: Record<string, number>; trends: Array<{ date: string; created: number; completed: number }> };
    users: { total: number; active: number; heroes: number; support: number; admins: number; recentLogins: number; unapproved: number; list: Array<{ id: string; username: string; displayName: string | null; role: string; lastLoginAt: string | null; createdAt: string }>; pendingApprovals: Array<{ id: string; username: string; displayName: string | null; role: string; createdAt: string }> };
    ai: { totalMessages: number; actionsCreated: number; actionsApproved: number; actionsRejected: number; flagsPending: number; conversations: number; pendingFlags: Array<{ id: string; reason: string; severity: string; isResolved: boolean; messageContent: string; createdAt: string; user: { username: string; displayName: string | null } }> };
    audit: { byAction: Record<string, number>; byEntity: Record<string, number> };
    heroWorkload: Array<{ id: string; name: string; activeOrders: number; activePoints: number; pendingCount: number; scheduledCount: number }>;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/stats/admin?range=${timeRange}&_k=${refreshKey}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setAdminData(d); }).catch(() => {});
  }, [timeRange, refreshKey]);

  useEffect(() => {
    fetch("/api/ai/balance").then(r => r.ok ? r.json() : null).then(d => { if (d && "balance" in d) setBalance(d as { balance: number; total_balance: number; status: string }); else setBalanceError(true); }).catch(() => setBalanceError(true));
  }, []);

  if (!adminData) return <div className="text-center py-12 text-muted-foreground">Loading admin dashboard...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Shield className="h-5 w-5 text-primary" />Admin Dashboard</h2>
        <TimeRangeSelector range={timeRange} setRange={setTimeRange} />
      </div>

      {/* DeepSeek Balance */}
      {balance && (
        <div className="rounded-xl border border-primary/20 bg-card p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">DeepSeek Balance</span>
          </div>
          <span className={`text-sm font-bold ${balance.balance > 0 ? "text-emerald-400" : "text-red-400"}`}>
            ${balance.balance.toFixed(4)}
          </span>
        </div>
      )}

      {/* Order Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Total Orders</p>
          <p className="text-xl font-bold text-cyan-400">{adminData.orders.total}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Created ({timeRange})</p>
          <p className="text-xl font-bold text-emerald-400">{adminData.orders.created}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Completed ({timeRange})</p>
          <p className="text-xl font-bold text-primary">{adminData.orders.completed}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-3">
          <p className="text-[0.625rem] text-muted-foreground">Deleted ({timeRange})</p>
          <p className="text-xl font-bold text-red-400">{adminData.orders.deleted}</p>
        </div>
      </div>

      {/* Order Trends */}
      {adminData.orders.trends.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-2"><BarChart3 className="h-4 w-4 text-cyan-400" />Order Trends</h3>
          <MiniBarChart data={adminData.orders.trends} />
        </div>
      )}

      {/* Order Status & Size Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs mb-2">Orders by Status</h3>
          <div className="space-y-1">
            {Object.entries(adminData.orders.byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
              const max = Math.max(...Object.values(adminData.orders.byStatus));
              return (
                <div key={status} className="flex items-center gap-2">
                  <span className="text-[0.625rem] text-muted-foreground w-20 shrink-0">{status}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-3"><div className="bg-primary/60 rounded-full h-3" style={{ width: `${(count / max) * 100}%` }} /></div>
                  <span className="text-[0.625rem] font-bold text-foreground w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs mb-2">Orders by Size</h3>
          <div className="space-y-1">
            {Object.entries(adminData.orders.bySize).sort((a, b) => b[1] - a[1]).map(([size, count]) => {
              const max = Math.max(...Object.values(adminData.orders.bySize));
              return (
                <div key={size} className="flex items-center gap-2">
                  <span className="text-[0.625rem] text-muted-foreground w-20 shrink-0">{size === "S" ? "Small (1pt)" : size === "M" ? "Medium (2pt)" : "Large (3pt)"}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-3"><div className="bg-emerald-500/60 rounded-full h-3" style={{ width: `${(count / max) * 100}%` }} /></div>
                  <span className="text-[0.625rem] font-bold text-foreground w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Activity */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><Users className="h-4 w-4 text-amber-400" />User Activity</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          <div className="text-center"><p className="text-lg font-bold text-foreground">{adminData.users.total}</p><p className="text-[0.625rem] text-muted-foreground">Total</p></div>
          <div className="text-center"><p className="text-lg font-bold text-emerald-400">{adminData.users.active}</p><p className="text-[0.625rem] text-muted-foreground">Active</p></div>
          <div className="text-center"><p className="text-lg font-bold text-cyan-400">{adminData.users.heroes}</p><p className="text-[0.625rem] text-muted-foreground">Heroes</p></div>
          <div className="text-center"><p className="text-lg font-bold text-primary">{adminData.users.support}</p><p className="text-[0.625rem] text-muted-foreground">Support</p></div>
          <div className="text-center"><p className="text-lg font-bold text-primary">{adminData.users.recentLogins}</p><p className="text-[0.625rem] text-muted-foreground">Recent Logins</p></div>
        </div>
        {adminData.users.unapproved > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mb-3">
            <p className="text-xs text-amber-400 font-medium">⚠️ {adminData.users.unapproved} unapproved user(s) pending</p>
          </div>
        )}
        <div className="max-h-48 overflow-y-auto space-y-1">
          {adminData.users.list.map(u => (
            <div key={u.id} className="flex items-center justify-between text-[0.625rem] py-1 border-b border-white/5 last:border-0">
              <span className="font-medium text-foreground">{u.displayName || u.username}</span>
              <span className="text-muted-foreground">{u.role}</span>
              <span className="text-muted-foreground">{u.lastLoginAt ? format(parseISO(u.lastLoginAt), "dd MMM HH:mm") : "Never"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hero Workload */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><Truck className="h-4 w-4 text-cyan-400" />Hero Workload</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {adminData.heroWorkload.sort((a, b) => b.activeOrders - a.activeOrders).map(h => {
            const maxPts = Math.max(...adminData.heroWorkload.map(x => x.activePoints), 1);
            return (
              <div key={h.id} className="flex items-center gap-3">
                <span className="text-xs font-medium w-24 shrink-0 truncate">{h.name}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white/5 rounded-full h-2"><div className="bg-cyan-500/60 rounded-full h-2" style={{ width: `${(h.activePoints / maxPts) * 100}%` }} /></div>
                    <span className="text-[0.625rem] text-muted-foreground w-16">{h.activePoints}pts</span>
                  </div>
                </div>
                <span className="text-[0.625rem] text-muted-foreground w-24">{h.activeOrders} orders</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Usage & Moderation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><Bot className="h-4 w-4 text-primary" />AI Usage</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center"><p className="text-lg font-bold text-primary">{adminData.ai.totalMessages}</p><p className="text-[0.625rem] text-muted-foreground">Messages</p></div>
            <div className="text-center"><p className="text-lg font-bold text-primary">{adminData.ai.conversations}</p><p className="text-[0.625rem] text-muted-foreground">Conversations</p></div>
            <div className="text-center"><p className="text-lg font-bold text-emerald-400">{adminData.ai.actionsApproved}</p><p className="text-[0.625rem] text-muted-foreground">Approved</p></div>
            <div className="text-center"><p className="text-lg font-bold text-red-400">{adminData.ai.actionsRejected}</p><p className="text-[0.625rem] text-muted-foreground">Rejected</p></div>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-card p-4">
          <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-amber-400" />Moderation {adminData.ai.flagsPending > 0 && <Badge variant="destructive" className="text-[0.625rem] ml-1">{adminData.ai.flagsPending}</Badge>}</h3>
          {adminData.ai.pendingFlags.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pending flags 🎉</p>
          ) : (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {adminData.ai.pendingFlags.map(f => (
                <div key={f.id} className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.625rem] font-medium text-foreground">{f.user.displayName || f.user.username}</span>
                    <Badge variant="outline" className={`text-[0.625rem] ${f.severity === "CRITICAL" ? "border-red-500/50 text-red-400" : f.severity === "HIGH" ? "border-amber-500/50 text-amber-400" : "border-white/20 text-muted-foreground"}`}>{f.severity}</Badge>
                  </div>
                  <p className="text-[0.625rem] text-muted-foreground mt-0.5">{f.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audit Summary */}
      <div className="rounded-xl border border-white/10 bg-card p-4">
        <h3 className="font-semibold text-xs flex items-center gap-2 mb-3"><History className="h-4 w-4 text-emerald-100" />Audit Summary ({timeRange})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(adminData.audit.byAction).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
            <div key={action} className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-sm font-bold text-foreground">{count}</p>
              <p className="text-[0.625rem] text-muted-foreground">{action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

