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

export function OrdersTab({ orders, onRefresh, holidays, offDays, userZones, onVerifyStart, onGeocodeStart, initialStatusFilter, filterNonce }: { orders: Order[]; onRefresh: () => void; holidays?: Holiday[]; offDays?: OffDay[]; userZones?: UserZoneData[]; onVerifyStart?: (sessionId: string) => void; onGeocodeStart?: (sessionId: string) => void; initialStatusFilter?: string; filterNonce?: number }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("ALL");
  // Apply deep-link status filter dispatched from the dashboard stat cards.
  // Depends on filterNonce so re-clicking the same status still re-applies it.
  useEffect(() => { if (initialStatusFilter) setFilterStatus(initialStatusFilter); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterNonce]);
  const [filterZone, setFilterZone] = useState("ALL");
  const [filterHero, setFilterHero] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [disabledZones, setDisabledZones] = useState<number[]>([]);
  const [timelineOrder, setTimelineOrder] = useState<Order | null>(null);
  const [timelineLogs, setTimelineLogs] = useState<AuditLogEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    if (!timelineOrder) return;
    setTimelineLoading(true);
    setTimelineLogs([]);
    fetch("/api/audit-logs?entity=Order&entityId=" + timelineOrder.id + "&limit=100")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setTimelineLogs(d.logs || []); })
      .catch(() => {})
      .finally(() => setTimelineLoading(false));
  }, [timelineOrder?.id]);
  const isSupportOrAdmin = session?.user?.role === "SUPPORT" || session?.user?.role === "ADMIN";
  const isAdmin = session?.user?.role === "ADMIN";
  const isSupport = session?.user?.role === "SUPPORT";

  // Support sees all orders by default; Admin uses toggle
  const [showAllOrders, setShowAllOrders] = useState(isSupport);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  // Orders fetched by a specific status (used for deep-link + manual status filter)
  // so the list matches the dashboard count instead of the 100-most-recent cap.
  const [statusFilteredOrders, setStatusFilteredOrders] = useState<Order[] | null>(null);
  const [loadingStatusFiltered, setLoadingStatusFiltered] = useState(false);
  const [heroes, setHeroes] = useState<HeroOption[]>([]);
  const [filterDate, setFilterDate] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState("");
  const [batchDate, setBatchDate] = useState("");
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [sortOrder, setSortOrder] = useState("created-desc");

  // Fetch disabled zones from settings
  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : Promise.resolve({})).then((s: any) => {
      if (s?.disabledZones) {
        try { setDisabledZones(JSON.parse(s.disabledZones)); } catch { /* ignore */ }
      }
    }).catch(() => {});
  }, []);

  // Fetch heroes for reassignment dropdown
  useEffect(() => {
    if (!isSupportOrAdmin) return;
    fetch("/api/heroes").then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setHeroes(d); }).catch(() => {});
  }, [isSupportOrAdmin]);

  // Fetch all orders when toggle is on (Support auto, Admin manual)
  useEffect(() => {
    if (!showAllOrders || !isSupportOrAdmin) return;
    let cancelled = false;
    setTimeout(() => setLoadingAll(true), 0);
    fetch("/api/orders?all=true&limit=200")
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then((d: any) => { if (!cancelled && d.orders && Array.isArray(d.orders)) { setAllOrders(d.orders); setLoadingAll(false); } })
      .catch(() => { if (!cancelled) setLoadingAll(false); });
    return () => { cancelled = true; };
  }, [showAllOrders, isSupportOrAdmin]);

  // Fetch all orders of the selected status so the filtered list is complete
  // (matches the dashboard stat counts). Skipped for the support/admin "all heroes" view.
  useEffect(() => {
    if (filterStatus === "ALL" || (isSupportOrAdmin && showAllOrders)) { setStatusFilteredOrders(null); return; }
    let cancelled = false;
    setLoadingStatusFiltered(true);
    fetch(`/api/orders?status=${filterStatus}&limit=200`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (!cancelled && d?.orders) { setStatusFilteredOrders(d.orders); setLoadingStatusFiltered(false); } })
      .catch(() => { if (!cancelled) setLoadingStatusFiltered(false); });
    return () => { cancelled = true; };
  }, [filterStatus, isSupportOrAdmin, showAllOrders]);

  const displayOrders = (showAllOrders && isSupportOrAdmin) ? allOrders : (filterStatus !== "ALL" && statusFilteredOrders ? statusFilteredOrders : orders);

  // Universal search: matches any text-based order field
  const searchLower = searchQuery.toLowerCase().trim();
  const filtered = displayOrders.filter(o => {
    if (filterStatus !== "ALL" && o.status !== filterStatus) return false;
    if (filterZone !== "ALL" && o.zone !== parseInt(filterZone)) return false;
    if (filterHero !== "ALL" && o.user?.id !== filterHero) return false;
    if (filterDate && o.scheduledDate !== filterDate) return false;
    if (searchLower) {
      const zoneName = userZones?.find(uz => uz.zoneId === o.zone)?.name || getZoneName(o.zone);
      const heroName = o.user?.displayName || o.user?.username || "";
      const haystack = [
        o.orderId, o.customerName, o.phone, o.address, o.city,
        o.size, o.status, o.scheduledDate, o.notes,
        o.eventType, zoneName, heroName,
        o.isOffice ? "office" : "",
        o.isEvent ? "event" : "",
        o.isErthbox ? "erthbox" : "",
      ].join(" ").toLowerCase();
      return haystack.includes(searchLower);
    }
    return true;
  });

  // Sort the filtered orders
  const toTs = (v: string) => {
    const n = typeof v === "string" ? Date.parse(v) : 0;
    return isNaN(n) ? (typeof v === "string" ? parseInt(v, 10) || 0 : 0) : n;
  };
  const sorted = [...filtered].sort((a, b) => {
    switch (sortOrder) {
      case "created-desc":
        return toTs(b.createdAt) - toTs(a.createdAt);
      case "created-asc":
        return toTs(a.createdAt) - toTs(b.createdAt);
      case "id-asc": {
        const aNum = parseInt(String(a.orderId).replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(String(b.orderId).replace(/\D/g, ""), 10) || 0;
        if (aNum !== bNum) return aNum - bNum;
        return String(a.orderId).localeCompare(String(b.orderId));
      }
      case "id-desc": {
        const aNum = parseInt(String(a.orderId).replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(String(b.orderId).replace(/\D/g, ""), 10) || 0;
        if (aNum !== bNum) return bNum - aNum;
        return String(b.orderId).localeCompare(String(a.orderId));
      }
      case "updated-desc":
        return toTs(b.updatedAt) - toTs(a.updatedAt);
      case "updated-asc":
        return toTs(a.updatedAt) - toTs(b.updatedAt);
      default:
        return 0;
    }
  });

  // Reassign handler
  const handleReassign = async (orderId: string, targetHeroId: string) => {
    try {
      const res = await fetch("/api/orders/reassign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, targetHeroId, reason: `${isSupport ? "Support" : "Admin"} reassignment from Orders tab` }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const result = await res.json();
      toast({ title: "Order reassigned", description: `→ ${result.to}` });
      onRefresh();
      // Refresh all orders list
      fetch("/api/orders?all=true&limit=200").then(r => r.ok ? r.json() : Promise.resolve({})).then((d: any) => { if (d.orders && Array.isArray(d.orders)) setAllOrders(d.orders); }).catch(() => {});
    } catch (err: unknown) {
      toast({ title: "Reassignment failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  // Batch status change
  const handleBatchStatusChange = async () => {
    if (selectedIds.size === 0 || !batchStatus) return;
    setBatchUpdating(true);
    try {
      const res = await fetch("/api/orders/batch/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: Array.from(selectedIds), status: batchStatus }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      toast({ title: `Updated ${data.updated}/${selectedIds.size} orders to ${batchStatus}` });
      setSelectedIds(new Set());
      setSelectMode(false);
      setBatchStatus("");
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Batch update failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setBatchUpdating(false); }
  };

  const handleBatchDateChange = async () => {
    if (selectedIds.size === 0 || !batchDate) return;
    setBatchUpdating(true);
    try {
      const res = await fetch("/api/orders/batch/date", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: Array.from(selectedIds), scheduledDate: batchDate }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      toast({ title: `Scheduled ${data.updated}/${selectedIds.size} orders on ${batchDate}` });
      setSelectedIds(new Set());
      setSelectMode(false);
      setBatchDate("");
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Batch date update failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setBatchUpdating(false); }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      let deleted = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          const res = await fetch(`/api/orders/${id}`, { method: "DELETE" });
          if (res.ok) deleted++; else failed++;
        } catch { failed++; }
      }
      toast({ title: `Deleted ${deleted}/${ids.length} orders`, description: failed > 0 ? `${failed} failed` : undefined, variant: failed > 0 ? "destructive" : "default" });
      setSelectedIds(new Set());
      setSelectMode(false);
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Batch delete failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setBatchUpdating(false); }
  };

  // Geocode missing orders
  const [geocoding, setGeocoding] = useState(false);
  const missingGeocode = displayOrders.filter(o => !o.latitude || !o.longitude).length;

  const handleGeocodeMissing = async () => {
    if (missingGeocode === 0) return;
    setGeocoding(true);
    try {
      const res = await fetch("/api/orders/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200 }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      if (data.sessionId) {
        toast({ title: `Started geocoding ${data.total} orders`, description: "Progress bar appears at bottom right" });
        onGeocodeStart?.(data.sessionId);
      }
      setGeocoding(false);
    } catch (err: unknown) {
      toast({ title: "Geocoding failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      setGeocoding(false);
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map(o => o.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const unverifiedCount = filtered.filter(o => !o.addressVerified).length;
  const handleVerifyAll = async () => {
    if (verifyingAll) return;
    setVerifyingAll(true);
    try {
      const res = await fetch("/api/orders/verify-address/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: filtered.filter(o => !o.addressVerified).slice(0, 20).map(o => o.id) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      if (data.sessionId) onVerifyStart?.(data.sessionId);
      toast({ title: `Verification queued for ${Math.min(filtered.filter(o => !o.addressVerified).length, 20)} orders` });
    } catch (err: unknown) {
      toast({ title: "Verification failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setVerifyingAll(false); }
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Sticky Collapsible Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm -mx-1 px-1 pb-1">
        {/* Search + compact controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search orders..."
              className="w-full h-11 pl-10 pr-10 rounded-lg border border-white/10 bg-white/5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/40 flex items-center justify-center transition-colors">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-muted-foreground shrink-0" onClick={() => setFiltersCollapsed(v => !v)} title={filtersCollapsed ? "Show filters" : "Hide filters"}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          </Button>
          <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground shrink-0 hidden sm:inline-flex">
            {loadingAll ? "Loading..." : `${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
          </Badge>
        </div>

        {/* Collapsible filter row */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${filtersCollapsed ? "max-h-0 opacity-0 mt-0" : "max-h-[500px] opacity-100 mt-2"}`}>
          <div className="flex flex-col sm:flex-row gap-2 sm:flex-wrap sm:items-center">
            {isSupport && (
              <div className="flex items-center gap-2 mr-2">
                <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.625rem] h-5">
                  <Users className="h-3 w-3 mr-1" />All Heroes&apos; Orders
                </Badge>
              </div>
            )}
            {isAdmin && (
              <div className="flex items-center gap-2 mr-2">
                <Switch checked={showAllOrders} onCheckedChange={setShowAllOrders} id="show-all-orders" />
                <Label htmlFor="show-all-orders" className="text-xs text-muted-foreground cursor-pointer">Show All Users&apos; Orders</Label>
              </div>
            )}
            {showAllOrders && isSupportOrAdmin && heroes.length > 0 && (
              <Select value={filterHero} onValueChange={setFilterHero}>
                <SelectTrigger className="sm:w-[140px] w-full h-11 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Hero" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Heroes</SelectItem>
                  {heroes.map(h => <SelectItem key={h.id} value={h.id}>{h.displayName || h.username}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="sm:w-[140px] w-full h-11 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="CONFIRMED">Contacted</SelectItem>
                <SelectItem value="BOOKED">Booked</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger className="sm:w-[150px] w-full h-11 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Zone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Zones</SelectItem>
                {Object.keys(ZONES).filter(z => !disabledZones.includes(parseInt(z))).map(z => {
                  const zoneNum = parseInt(z);
                  const override = userZones?.find(uz => uz.zoneId === zoneNum);
                  return <SelectItem key={z} value={z}>Z{z} {override?.name || getZoneName(zoneNum)}</SelectItem>;
                })}
                {disabledZones.filter(z => ZONES[z]).length > 0 && (<>
                  <div className="px-2 py-1 text-[0.625rem] text-muted-foreground uppercase tracking-wider">Disabled</div>
                  {disabledZones.filter(z => ZONES[z]).map(z => {
                    const override = userZones?.find(uz => uz.zoneId === z);
                    return <SelectItem key={String(z)} value={String(z)} className="opacity-50">Z{z} {override?.name || getZoneName(z)}</SelectItem>;
                  })}
                </>)}
                {userZones?.filter(uz => uz.isCustom && uz.isEnabled).map(uz => (
                  <SelectItem key={uz.zoneId} value={String(uz.zoneId)}>Z{uz.zoneId} {uz.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-full sm:w-[160px] h-12 sm:h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-foreground [color-scheme:dark]" />
            {filterDate && <button onClick={() => setFilterDate("")} className="text-[0.625rem] text-muted-foreground hover:text-foreground hover:underline cursor-pointer">Clear</button>}
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="sm:w-[150px] w-full h-11 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created-desc">Latest created first</SelectItem>
                <SelectItem value="created-asc">Oldest created first</SelectItem>
                <SelectItem value="id-asc">Order ID ascending</SelectItem>
                <SelectItem value="id-desc">Order ID descending</SelectItem>
                <SelectItem value="updated-desc">Latest updated first</SelectItem>
                <SelectItem value="updated-asc">Oldest updated first</SelectItem>
              </SelectContent>
            </Select>
            {unverifiedCount > 0 && (
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" disabled={verifyingAll} onClick={handleVerifyAll}>
              {verifyingAll ? <><RotateCcw className="h-3 w-3 animate-spin" />Verifying...</> : <><ShieldCheck className="h-3 w-3" />Verify {unverifiedCount}</>}
            </Button>
            )}
            {missingGeocode > 0 && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-amber-400 hover:text-amber-300" disabled={geocoding} onClick={handleGeocodeMissing}>
                {geocoding ? <><RotateCcw className="h-3 w-3 animate-spin" />Geocoding...</> : <><MapPin className="h-3 w-3" />Geocode {missingGeocode} Missing</>}
              </Button>
            )}
            <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground sm:hidden">
              {loadingAll ? "Loading..." : `${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
            </Badge>
            <Button size="sm" variant={selectMode ? "default" : "ghost"} className={`h-8 gap-1.5 text-xs ${selectMode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} onClick={() => { setSelectMode(v => !v); clearSelection(); }}>
              {selectMode ? "Exit Select" : "Select"}
            </Button>
            {selectMode && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={selectedIds.size === filtered.length ? clearSelection : selectAllFiltered}>
                {selectedIds.size === filtered.length ? "Deselect All" : `Select All (${filtered.length})`}
              </Button>
            )}
            {searchLower && filtered.length > 0 && (
              <button onClick={() => { setFilterStatus("ALL"); setFilterZone("ALL"); setFilterHero("ALL"); setFilterDate(""); }} className="text-[0.625rem] text-primary hover:underline cursor-pointer">Reset filters</button>
            )}
          </div>
        </div>
        {filtersCollapsed && (
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            {filterStatus !== "ALL" && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.625rem]">{filterStatus}</span>}
            {filterZone !== "ALL" && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.625rem]">Z{filterZone}</span>}
            {filterDate && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.625rem]">{filterDate}</span>}
            {filterHero !== "ALL" && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.625rem]">Hero</span>}
            <span className="text-[0.625rem]">{filtered.length} of {displayOrders.length} orders</span>
          </div>
        )}
      </div>
      {selectMode && selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <span className="text-xs font-medium text-foreground">{selectedIds.size} selected</span>
          <Select value={batchStatus} onValueChange={setBatchStatus}>
            <SelectTrigger className="sm:w-[130px] w-full h-9 text-xs bg-white/5 border-white/10"><SelectValue placeholder="Status..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
              <SelectItem value="CONFIRMED">Contacted</SelectItem>
              <SelectItem value="BOOKED">Booked</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELED">Canceled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9 gap-1.5 text-xs bg-primary hover:bg-primary/90" disabled={!batchStatus || batchUpdating} onClick={handleBatchStatusChange}>
            {batchUpdating ? <><RotateCcw className="h-3 w-3 animate-spin" />...</> : <><Zap className="h-3 w-3" />Set Status</>}
          </Button>
          <div className="w-px h-7 bg-white/10" />
          <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className="w-full sm:w-[150px] h-11 sm:h-9 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-foreground [color-scheme:dark]" />
          <Button size="sm" className="h-9 gap-1.5 text-xs bg-primary hover:bg-primary/90" disabled={!batchDate || batchUpdating} onClick={handleBatchDateChange}>
            {batchUpdating ? <><RotateCcw className="h-3 w-3 animate-spin" />...</> : <><Calendar className="h-3 w-3" />Set Date</>}
          </Button>
          <Button size="sm" variant="destructive" className="h-9 gap-1.5 text-xs" disabled={batchUpdating} onClick={handleBatchDelete}>
            {batchUpdating ? <><RotateCcw className="h-3 w-3 animate-spin" />...</> : <><Trash2 className="h-3 w-3" />Delete ({selectedIds.size})</>}
          </Button>
          <Button size="sm" variant="ghost" className="h-9 text-xs text-muted-foreground ml-auto" onClick={clearSelection}>Cancel</Button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto stagger-fade">
        {sorted.map(o => <OrderCard key={o.id} order={o} onRefresh={onRefresh} holidays={holidays} offDays={offDays} isAdminView={showAllOrders && isSupportOrAdmin} heroes={showAllOrders && isSupportOrAdmin ? heroes : undefined} onReassign={showAllOrders && isSupportOrAdmin ? handleReassign : undefined} userZones={userZones} disabledZones={disabledZones} selected={selectMode ? selectedIds.has(o.id) : undefined} onToggleSelect={selectMode ? () => toggleSelectOrder(o.id) : undefined} onShowTimeline={() => setTimelineOrder(o)} />)}
        {filtered.length === 0 && (
          <div className="text-center py-16 px-6">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-5 opacity-70">
              <rect x="20" y="30" width="80" height="60" rx="8" stroke="currentColor" strokeWidth="2" className="text-border" fill="currentColor" fillOpacity="0.03"/>
              <rect x="28" y="38" width="40" height="6" rx="3" fill="currentColor" fillOpacity="0.08" className="text-muted-foreground"/>
              <rect x="28" y="50" width="55" height="4" rx="2" fill="currentColor" fillOpacity="0.05" className="text-muted-foreground"/>
              <rect x="28" y="60" width="35" height="4" rx="2" fill="currentColor" fillOpacity="0.05" className="text-muted-foreground"/>
              <circle cx="90" cy="80" r="18" className="text-primary" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M84 78h12M90 72v12" className="text-primary" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M96 20l4 4-8 8" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M96 20l4 4-8 8" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.4" transform="translate(-1,1)"/>
            </svg>
            <p className="text-base font-medium text-foreground mb-1">{searchLower ? `No orders matching "${searchQuery}"` : "No orders yet"}</p>
            <p className="text-sm text-muted-foreground/70">{searchLower ? "Try adjusting your search or filters" : "Orders will appear here once they are created or imported"}</p>
            {searchLower && <button onClick={() => setSearchQuery("")} className="mt-4 text-sm text-primary hover:underline font-medium">Clear search</button>}
          </div>
        )}
      </div>
      <Dialog open={!!timelineOrder} onOpenChange={(open) => { if (!open) setTimelineOrder(null); }}>
      <DialogContent className="bg-card border-white/10 sm:max-w-lg max-h-[85vh] overflow-y-auto">
      {timelineOrder && (
      <>
      <DialogHeader>
      <DialogTitle className="text-foreground flex items-center gap-2">
      <Clock className="h-4 w-4" />
      Timeline &mdash; {timelineOrder.orderId}
      </DialogTitle>
      </DialogHeader>
      <div className="py-4">
      <div className="text-xs text-muted-foreground mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
      <div className="font-medium text-foreground mb-1">{timelineOrder.customerName}</div>
      <div>{timelineOrder.address}, {timelineOrder.city}</div>
      <div className="mt-1 flex flex-wrap gap-1.5 items-center">
      <span className="text-[0.625rem] px-1.5 py-0.5 rounded border border-white/10">{timelineOrder.size}({timelineOrder.points}pt)</span>
      <StatusBadge status={timelineOrder.status} />
      <span className="text-[0.625rem] text-muted-foreground">Created: {format(parseISO(timelineOrder.createdAt), "dd MMM yyyy, HH:mm")}</span>
      {timelineOrder.updatedAt !== timelineOrder.createdAt && (
      <span className="text-[0.625rem] text-muted-foreground">Updated: {format(parseISO(timelineOrder.updatedAt), "dd MMM yyyy, HH:mm")}</span>
      )}
      </div>
      </div>
      {timelineLoading ? (
      <div className="text-center py-8 text-muted-foreground text-sm">Loading timeline...</div>
      ) : timelineLogs.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground text-sm">No audit logs found for this order.</div>
      ) : (
      <div className="relative">
      <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-white/10" />
      {timelineLogs.map((log) => (
      <div key={log.id} className="relative pl-9 pb-4 last:pb-0">
      <div className={"absolute left-[5px] top-[5px] w-[13px] h-[13px] rounded-full border-2 " + (log.action === "CREATE" ? "bg-emerald-500 border-emerald-500/30" : log.action.startsWith("DELETE") ? "bg-red-500 border-red-500/30" : "bg-amber-500 border-amber-500/30")} />
      <div className="bg-white/5 rounded-lg border border-white/10 p-3">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
      <span className={"text-[0.625rem] px-1.5 py-0.5 rounded font-semibold " + (log.action === "CREATE" ? "bg-emerald-500/15 text-emerald-400" : log.action.startsWith("DELETE") ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400")}>{log.action}</span>
      {log.user && <span className="text-[0.625rem] text-muted-foreground">by {log.user.displayName || log.user.username} <span className="text-[0.625rem]">({log.user.role})</span></span>}
      <span className="text-[0.625rem] text-muted-foreground ml-auto">{format(parseISO(log.createdAt), "dd MMM HH:mm")}</span>
      </div>
      {log.details && (() => {
        try {
          const parsed = JSON.parse(log.details);
          const changes = parsed.changes || {};
          const changeEntries = Object.entries(changes);
          if (changeEntries.length === 0) return null;
          
          // Human-readable field labels
          const fieldLabels: Record<string, string> = {
            status: "Status",
            points: "Points",
            size: "Size",
            notes: "Notes",
            scheduledDate: "Schedule Date",
            address: "Address",
            city: "City",
            phone: "Phone",
            customerName: "Customer Name",
            latitude: "Latitude",
            longitude: "Longitude",
            isOffice: "Office Flag",
            zone: "Zone",
          };
          
          // Human-readable status values
          const statusLabels: Record<string, string> = {
            PENDING: "Pending",
            SCHEDULED: "Scheduled",
            CONFIRMED: "Contacted",
            BOOKED: "Booked",
            COMPLETED: "Completed",
            CANCELED: "Canceled",
          };
          
          const formatValue = (val: any, field: string) => {
            if (val === null || val === undefined) return "—";
            if (field === "status" && typeof val === "string") return statusLabels[val] || val;
            if (field === "scheduledDate" && typeof val === "string") {
              try { return format(parseISO(val), "dd MMM yyyy"); } catch { return val; }
            }
            if (field === "isOffice") return val ? "Yes" : "No";
            return String(val);
          };
          
          return (
            <div className="mt-1.5 space-y-1">
              {changeEntries.map(([field, change]: [string, any]) => {
                const label = fieldLabels[field] || field;
                const from = formatValue(change.from, field);
                const to = formatValue(change.to, field);
                const isDelete = change.to === null || change.to === undefined;
                return (
                  <div key={field} className="flex items-center gap-1.5 text-[0.625rem] flex-wrap">
                    <span className="text-muted-foreground font-medium">{label}:</span>
                    {!isDelete ? (
                      <>
                        <span className="text-red-400/70 line-through">{from}</span>
                        <span className="text-muted-foreground/50">&rarr;</span>
                        <span className="text-emerald-400 font-medium">{to}</span>
                      </>
                    ) : (
                      <span className="text-red-400">{from} <span className="text-muted-foreground/50">(removed)</span></span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        } catch {
          return <pre className="mt-1 text-[0.625rem] text-muted-foreground bg-black/20 rounded p-2 overflow-x-auto whitespace-pre-wrap">{log.details}</pre>;
        }
      })()}
      </div>
      </div>
      ))}
      </div>
      )}
      </div>
      </>
      )}
      </DialogContent>
      </Dialog>
    </div>
  );
}

