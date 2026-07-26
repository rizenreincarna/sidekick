"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  format, addDays, parseISO, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay,
  isToday, isWeekend
} from "date-fns";
import {
  Truck, Plus, Calendar, ClipboardList, Settings, Send, CheckCircle2,
  Clock, MapPin, Phone, Building2, Home, AlertCircle, Zap, RotateCcw,
  Trash2, MessageCircle, X, ChevronRight, ChevronLeft, Route, Download, Upload,
  Eye, Shield, ShieldCheck, Info, Layers, CalendarDays, ArrowRightLeft, LogOut, User as UserIcon,
  FileSpreadsheet, FileDown, FileUp, CheckCircle, AlertTriangle, Pencil, Save,
  Siren, StickyNote, Users, UserPlus, Key, UserCog, Undo2, MapPinOff, Globe, PlusCircle,
  Bell, Search, ChevronDown, ChevronUp, AtSign, BookOpen, GraduationCap, Lightbulb,
  Sparkles, Target, ArrowRight, Play, History, Tag, Star, Bot, Loader2, Package, BarChart3,
  Smartphone, XCircle
} from "lucide-react";
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

import { CHANGELOG } from "@/lib/changelog";
import { ONBOARDING_STEPS, OnboardingModal, TutorialSection } from "@/components/onboarding";

import { useFetchData } from "@/lib/use-fetch-data";
import { formatEventType, ZoneBadge, StatusBadge } from "@/components/ui/shared-badges";

import { MiniCalendar } from "@/components/mini-calendar";
import { OrderCard } from "@/components/order-card";

import { ZoneWeekGrid } from "@/components/dashboard/zone-week-grid";
import { SwipeableWeeklyWorkload } from "@/components/dashboard/swipeable-weekly-workload";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { MiniBarChart } from "@/components/dashboard/mini-bar-chart";
import { HeroDashboard } from "@/components/dashboard/hero-dashboard";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { SupportDashboard } from "@/components/dashboard/support-dashboard";
import { DashboardTab } from "@/components/dashboard/dashboard-tab";

import { NewOrderTab } from "@/components/tabs/new-order-tab";
import { ScheduleTab, BarChartIcon } from "@/components/tabs/schedule-tab";
import { SosTab } from "@/components/tabs/sos-tab";
import { OrdersTab } from "@/components/tabs/orders-tab";
import { AuditLogSection } from "@/components/tabs/audit-log-section";
import { ErthboxManagerSection } from "@/components/tabs/erthbox-manager-section";
import { SettingsTab } from "@/components/tabs/settings-tab";
import { UsersTab } from "@/components/tabs/users-tab";

// ============ LOGIN PAGE ============
import { LoginPage } from "@/components/login-page";
import { NotificationBell, NotificationDrawer } from "@/components/notification-drawer";
import { ChatBubble, ChatDrawer } from "@/components/chat-drawer";

export default function HomePage() {
  const { data: session, status } = useSession();

  // Capture the deep-link tab param BEFORE the session/loading early-returns, so it
  // survives the "Syncing..." splash + LoginPage redirect. Stored in a ref + sessionStorage.
  const pendingTabRef = useRef<string | null>(null);
  if (pendingTabRef.current === null && typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab) {
        pendingTabRef.current = tab;
        sessionStorage.setItem("sidekick_pending_tab", tab);
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        const saved = sessionStorage.getItem("sidekick_pending_tab");
        if (saved) pendingTabRef.current = saved;
      }
    } catch {}
  }
  const { data: stats, refetch: refetchStats } = useFetchData<Stats>("/api/stats");
  const { data: ordersData, refetch: refetchOrders } = useFetchData<{ orders: Order[]; total: number; page: number; totalPages: number, }>("/api/orders?limit=200");
  const { data: userZones } = useFetchData<UserZoneData[]>("/api/user-zones");
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const orders = ordersData?.orders ?? null;
  const { data: holidays, refetch: refetchHolidays } = useFetchData<Holiday[]>("/api/holidays");
  const [activeTab, setActiveTab] = useState("dashboard");
  // Deep-link from dashboard stat cards → Orders tab pre-filtered by status
  const [ordersStatusFilter, setOrdersStatusFilter] = useState("ALL");
  const [ordersFilterNonce, setOrdersFilterNonce] = useState(0);
  const [heroProfileOpen, setHeroProfileOpen] = useState(false);
  const goToOrdersWithStatus = (status: string) => { setOrdersStatusFilter(status); setOrdersFilterNonce(n => n + 1); setActiveTab("orders"); };
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false); // kept for future
  const [chatInitialMode, setChatInitialMode] = useState<"team" | "ai">("team");

  // Deep-link handler: read the pending tab (captured before the session gate above)
  // and open the matching drawer. Runs once when the main app mounts after login.
  useEffect(() => {
    const tab = pendingTabRef.current;
    if (!tab) return;
    pendingTabRef.current = null;
    try { sessionStorage.removeItem("sidekick_pending_tab"); } catch {}
    if (tab === "notifications" || tab === "notif") setNotifDrawerOpen(true);
    else if (tab === "chat") { setChatInitialMode("team"); setChatDrawerOpen(true); }
    else if (tab === "ai") { setChatInitialMode("ai"); setChatDrawerOpen(true); }
    else if (tab === "orders") setActiveTab("orders");
  }, []);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAppSplash, setShowAppSplash] = useState(true);
  const onboardingCheckedRef = useRef(false);

  // Neon Cockpit splash: brief brand reveal on first app mount, then fade out.
  useEffect(() => {
    if (status !== "authenticated") return;
    const t = setTimeout(() => setShowAppSplash(false), 1200);
    return () => clearTimeout(t);
  }, [status]);
  const [verifySessionId, setVerifySessionId] = useState<string | null>(null);
  const [geocodeSessionId, setGeocodeSessionId] = useState<string | null>(null);
  const [showVerifyProgress, setShowVerifyProgress] = useState(false);
  const onGeocodeStart = useCallback((sessionId: string) => {
    setGeocodeSessionId(sessionId);
  }, []);

  const onVerifyStart = useCallback((sessionId: string) => {
    setVerifySessionId(sessionId);
    setShowVerifyProgress(true);
  }, []);

  // Debounced refresh: rapid mutations (batch status, delete, etc.) coalesce into a
  // single refetch ~300ms after the last action, instead of N simultaneous heavy refetches.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAll = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refetchStats(); refetchOrders(); refetchHolidays(); setDashboardRefreshKey(k => k + 1);
    }, 300);
  }, [refetchStats, refetchOrders, refetchHolidays]);

  // Background auto-revalidation: re-fetch orders + stats every 45s so the data
  // self-heals even if a mutation's refresh was missed (fixes "quit app to see data").
  // Lightweight thanks to the cache: the UI already shows stale data, this just swaps
  // in fresh data. Pauses when the tab/document is hidden to save battery.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      refetchOrders();
      refetchStats();
    }, 45000);
    return () => clearInterval(interval);
  }, [refetchOrders, refetchStats]);

  // Revalidate immediately when the app returns to the foreground (user switches back).
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refreshAll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshAll]);

  // Check if onboarding has been completed for this user
  useEffect(() => {
    if (!session || onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;
    fetch("/api/settings").then(r => r.json()).then(settings => {
      if (!settings.onboardingCompleted) {
        // Show onboarding for first-time users
        setShowOnboarding(true);
      }
    }).catch(() => {});
  }, [session]);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingCompleted: "true" }),
    }).catch(() => {});
  }, []);

  // Check AI status
  useEffect(() => {
    if (!session) return;
    fetch("/api/ai/status").then(r => r.json()).then(data => {
      setAiEnabled(data.enabled && data.hasApiKey);
    }).catch(() => {});
  }, [session]);

  // Show loading — Neon Cockpit splash
  if (status === "loading") {
    return (
      <div className="nc-splash">
        <div className="nc-splash__inner">
          <div className="nc-splash__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="HERO Sidekick" className="h-9 w-9 rounded-lg" />
          </div>
          <div>
            <p className="nc-splash__title">HERO Sidekick</p>
            <p className="nc-splash__copy">Syncing operational telemetry...</p>
          </div>
          <div className="nc-splash__bar"><span /></div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  const roleStyle = session.user?.role === "ADMIN"
    ? { color: "var(--nc-danger)", borderColor: "rgba(248,113,113,0.30)", background: "rgba(248,113,113,0.10)" }
    : session.user?.role === "SUPPORT"
      ? { color: "var(--nc-info)", borderColor: "rgba(96,165,250,0.30)", background: "rgba(96,165,250,0.10)" }
      : undefined;

  return (
    <div className="nc-shell">
      <div className="w-full max-w-5xl mx-auto flex flex-col min-h-dvh relative">
      {/* Neon Cockpit splash overlay — fades out shortly after mount */}
      <div className={`nc-splash ${showAppSplash ? "" : "nc-splash--hidden"}`} aria-hidden="true">
        <div className="nc-splash__inner">
          <div className="nc-splash__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="HERO Sidekick" className="h-9 w-9 rounded-lg" />
          </div>
          <div>
            <p className="nc-splash__title">HERO Sidekick</p>
            <p className="nc-splash__copy">Syncing operational telemetry...</p>
          </div>
          <div className="nc-splash__bar"><span /></div>
        </div>
      </div>

      {/* Neon header — sticky so it never scrolls out of view */}
      <header className="nc-header sticky top-0 z-50">
        <div className="max-w-5xl mx-auto nc-brand-row" style={{ padding: "14px 16px 10px" }}>
          <div className="nc-brand">
            <div className="nc-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="HERO Sidekick" />
            </div>
            <div className="min-w-0">
              <div className="nc-wordmark truncate">HERO Sidekick</div>
              <div className="nc-sub">ERTH Pickup Automation</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell session={session} onOpen={() => setNotifDrawerOpen(true)} />
            <ChatBubble session={session} onOpen={() => setChatDrawerOpen(true)} />
            {session.user?.role && (
              <span className="nc-role-chip" style={roleStyle}>{session.user.role}</span>
            )}
          </div>
        </div>
        {/* Actions row — neon chips, evenly spaced, no overflow */}
        <div className="nc-actions-row max-w-5xl mx-auto">
          <button type="button" className="nc-action-chip nc-action-chip--primary" onClick={() => setActiveTab("dashboard")}><Truck className="h-4 w-4" /> Today</button>
          <a href="/route" className="nc-action-chip"><Zap className="h-4 w-4" /> Optimize</a>
          <button type="button" className="nc-action-chip" onClick={refreshAll} aria-label="Refresh data"><RotateCcw className="h-4 w-4" /> Refresh</button>
          <button type="button" className="nc-action-chip" onClick={() => setShowOnboarding(true)}><Info className="h-4 w-4" /> Tutorial</button>
          <button type="button" className="nc-action-chip nc-action-chip--danger" onClick={() => signOut()}><LogOut className="h-4 w-4" /> Logout</button>
          <button type="button" className="nc-action-chip" onClick={() => setHeroProfileOpen(true)} title="Edit hero profile (vehicle, home address)" style={{ cursor: "pointer" }}>
            <UserIcon className="h-4 w-4" />
            <span className="max-w-[90px] truncate">{session.user?.name}</span>
          </button>
        </div>
      </header>

      {/* SOS Alert Banner */}
      {stats && (stats as any).activeSosCount > 0 && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-center animate-fade-in">
          <span className="text-sm font-medium text-red-400 flex items-center justify-center gap-2">
            <Siren className="h-4 w-4" />
            {(stats as any).activeSosCount} active SOS {(stats as any).activeSosCount === 1 ? "alert" : "alerts"} — tap <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("sos"); }} className="underline font-semibold">here</a> to view
          </span>
        </div>
      )}

      {/* Main - scrollable area */}
      <main className="flex-1 pb-28 sm:pb-8">
        <div className="max-w-5xl mx-auto w-full px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Desktop top tabs — Neon Cockpit */}
          <div className="hidden sm:block pb-3">
            <TabsList className={`grid w-full bg-white/5 border border-white/10 h-12 gap-0 ${session.user?.role === "ADMIN" ? "grid-cols-7" : "grid-cols-6"}`}>
            <TabsTrigger value="dashboard" className="gap-1 text-xs md:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12 min-w-0 px-1">
              <Truck className="h-4 w-4 hidden md:block shrink-0" /><span className="truncate">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="new-order" className="gap-1 text-xs md:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12 min-w-0 px-1">
              <Plus className="h-4 w-4 hidden md:block shrink-0" /><span className="truncate">New</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1 text-xs md:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12 min-w-0 px-1">
              <ClipboardList className="h-4 w-4 hidden md:block shrink-0" /><span className="truncate">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1 text-xs md:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12 min-w-0 px-1">
              <Calendar className="h-4 w-4 hidden md:block shrink-0" /><span className="truncate">Schedule</span>
            </TabsTrigger>
            <TabsTrigger value="sos" className="gap-1 text-xs md:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12 relative min-w-0 px-1">
              <Siren className="h-4 w-4 hidden md:block shrink-0" /><span className="truncate">SOS</span>
              {stats && stats.activeSosCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[0.625rem] text-white items-center justify-center font-bold">{stats.activeSosCount}</span>
                </span>
              )}
            </TabsTrigger>
            {session.user?.role === "ADMIN" && (
              <TabsTrigger value="users" className="gap-1 text-xs md:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12 min-w-0 px-1">
                <Shield className="h-4 w-4 hidden md:block shrink-0" /><span className="truncate">Users</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="settings" className="gap-1 text-xs md:text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary h-12 min-w-0 px-1">
              <Settings className="h-4 w-4 hidden md:block shrink-0" /><span className="truncate">Settings</span>
            </TabsTrigger>
          </TabsList>
          </div>

          <TabsContent value="dashboard"><div className="animate-fade-in-up"><DashboardTab stats={stats} onRefresh={refreshAll} dashboardRefreshKey={dashboardRefreshKey} userZones={userZones || undefined} onFilterOrders={goToOrdersWithStatus} /></div></TabsContent>
          <TabsContent value="new-order"><div className="animate-fade-in-up"><NewOrderTab onRefresh={refreshAll} onVerifyStart={onVerifyStart} /></div></TabsContent>
          <TabsContent value="orders"><div className="animate-fade-in-up"><OrdersTab orders={orders || []} onRefresh={refreshAll} holidays={holidays || []} offDays={stats?.offDays} userZones={userZones || undefined} onVerifyStart={onVerifyStart} onGeocodeStart={onGeocodeStart} initialStatusFilter={ordersStatusFilter} filterNonce={ordersFilterNonce} /></div></TabsContent>
          <TabsContent value="schedule"><div className="animate-fade-in-up"><ScheduleTab stats={stats} orders={orders || []} onRefresh={refreshAll} userZones={userZones || undefined} /></div></TabsContent>
          <TabsContent value="sos"><div className="animate-fade-in-up"><SosTab onRefresh={refreshAll} onGoToOrders={() => setActiveTab("orders")} userZones={userZones || undefined} /></div></TabsContent>
          {session.user?.role === "ADMIN" && (
            <TabsContent value="users"><UsersTab onRefresh={refreshAll} /></TabsContent>
          )}
          <TabsContent value="settings"><SettingsTab holidays={holidays || []} onRefresh={refreshAll} session={session} onReplayOnboarding={() => setShowOnboarding(true)} onVerifyStart={onVerifyStart} /></TabsContent>
        </Tabs>
        </div>
      </main>

      {/* Mobile Bottom Navigation — Neon Cockpit */}
      <nav className="nc-nav sm:hidden fixed bottom-0 left-0 right-0 z-50">
        <div className="nc-nav__grid" style={{ gridTemplateColumns: session.user?.role === "ADMIN" ? "repeat(7,1fr)" : "repeat(6,1fr)" }}>
          <button onClick={() => setActiveTab("dashboard")} className={`nc-nav__btn ${activeTab === "dashboard" ? "nc-nav__btn--active" : ""}`} aria-label="Dashboard">
            <Truck className="h-5 w-5" /><span className="truncate w-full text-center">Dashboard</span>
          </button>
          <button onClick={() => setActiveTab("new-order")} className={`nc-nav__btn ${activeTab === "new-order" ? "nc-nav__btn--active" : ""}`} aria-label="New Order">
            <Plus className="h-5 w-5" /><span className="truncate w-full text-center">New</span>
          </button>
          <button onClick={() => setActiveTab("orders")} className={`nc-nav__btn ${activeTab === "orders" ? "nc-nav__btn--active" : ""}`} aria-label="Orders">
            <ClipboardList className="h-5 w-5" /><span className="truncate w-full text-center">Orders</span>
          </button>
          <button onClick={() => setActiveTab("schedule")} className={`nc-nav__btn ${activeTab === "schedule" ? "nc-nav__btn--active" : ""}`} aria-label="Schedule">
            <Calendar className="h-5 w-5" /><span className="truncate w-full text-center">Schedule</span>
          </button>
          <button onClick={() => setActiveTab("sos")} className={`nc-nav__btn relative ${activeTab === "sos" ? "nc-nav__btn--active" : ""}`} aria-label="SOS">
            <Siren className="h-5 w-5" /><span className="truncate w-full text-center">SOS</span>
            {stats && stats.activeSosCount > 0 && (
              <span className="absolute -top-0.5 right-2 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[0.625rem] text-white items-center justify-center font-bold">{stats.activeSosCount}</span>
              </span>
            )}
          </button>
          {session.user?.role === "ADMIN" && (
            <button onClick={() => setActiveTab("users")} className={`nc-nav__btn ${activeTab === "users" ? "nc-nav__btn--active" : ""}`} aria-label="Users">
              <Shield className="h-5 w-5" /><span className="truncate w-full text-center">Users</span>
            </button>
          )}
          <button onClick={() => setActiveTab("settings")} className={`nc-nav__btn ${activeTab === "settings" ? "nc-nav__btn--active" : ""}`} aria-label="Settings">
            <Settings className="h-5 w-5" /><span className="truncate w-full text-center">Settings</span>
          </button>
        </div>
      </nav>

      {/* Drawers */}
      <NotificationDrawer open={notifDrawerOpen} onClose={() => setNotifDrawerOpen(false)} session={session} onNavigate={(target) => { if (target === "ai") { setChatInitialMode("ai"); setChatDrawerOpen(true); } else if (target === "chat") { setChatInitialMode("team"); setChatDrawerOpen(true); } else if (target === "orders") setActiveTab("orders"); }} />
      <ChatDrawer open={chatDrawerOpen} onClose={() => setChatDrawerOpen(false)} session={session} aiEnabled={aiEnabled} initialMode={chatInitialMode} />
      <HeroProfileDialog open={heroProfileOpen} onOpenChange={setHeroProfileOpen} />
      <GeocodeProgressDrawer sessionId={geocodeSessionId} onComplete={() => { setGeocodeSessionId(null); refreshAll(); }} />
      <VerificationProgressDrawer
        open={showVerifyProgress}
        onClose={() => { setShowVerifyProgress(false); setVerifySessionId(null); }}
        sessionId={verifySessionId}
        onComplete={() => refreshAll()}
      />

      {/* Onboarding Modal */}
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} onComplete={completeOnboarding} />
      </div>
    </div>
  );
}
