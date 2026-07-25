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

export function AuditLogSection() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: page.toString(), limit: "25" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    fetch(`/api/audit-logs?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled) {
          if (d) {
            setLogs(d.logs || []);
            setTotalPages(d.pagination?.totalPages || 1);
            setTotal(d.pagination?.total || 0);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, debouncedSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const getActionBadge = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes("delete")) return <span className="text-[0.625rem] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 font-semibold">{action}</span>;
    if (lower.includes("create") || lower.includes("sos_create")) return <span className="text-[0.625rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 font-semibold">{action}</span>;
    if (lower.includes("update") || lower.includes("sos_answer")) return <span className="text-[0.625rem] bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 font-semibold">{action}</span>;
    return <span className="text-[0.625rem] bg-white/10 text-muted-foreground border border-white/10 rounded px-1.5 py-0.5 font-semibold">{action}</span>;
  };

  const getRoleBadge = (role: string) => {
    if (role === "ADMIN") return <span className="text-[0.625rem] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1">ADMIN</span>;
    if (role === "SUPPORT") return <span className="text-[0.625rem] bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded px-1">SUPPORT</span>;
    return <span className="text-[0.625rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1">HERO</span>;
  };

  return (
    <div className="px-4 pb-4 border-t border-white/5">
      {/* Search */}
      <form onSubmit={handleSearch} className="pt-3 mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search audit logs..."
            className="h-9 text-xs pl-8 bg-white/5 border-white/10"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" className="h-9 border-white/10 bg-white/5 text-xs gap-1">
          <Search className="h-3 w-3" />Search
        </Button>
      </form>

      <p className="text-[0.625rem] text-muted-foreground mb-2">{total} log entries</p>

      {/* Table */}
      {loading && logs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">No audit logs found</div>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {logs.map(log => {
            const isExpanded = expandedDetails.has(log.id);
            let parsedDetails: string | null = null;
            try { parsedDetails = log.details ? JSON.stringify(JSON.parse(log.details), null, 2) : null; } catch { parsedDetails = log.details; }
            return (
              <div key={log.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground text-[0.625rem] shrink-0">{format(parseISO(log.createdAt), "dd MMM HH:mm")}</span>
                  <span className="font-medium text-foreground">{log.user?.displayName || log.user?.username || "Unknown"}</span>
                  {log.user?.role && getRoleBadge(log.user.role)}
                  {getActionBadge(log.action)}
                  <span className="text-muted-foreground">{log.entity}</span>
                  {log.entityId && <span className="text-muted-foreground/60 text-[0.625rem] truncate max-w-[100px]">{log.entityId.substring(0, 8)}...</span>}
                  {parsedDetails && (
                    <button onClick={() => setExpandedDetails(prev => { const next = new Set(prev); if (next.has(log.id)) next.delete(log.id); else next.add(log.id); return next; })} className="ml-auto text-primary/60 hover:text-primary text-[0.625rem]">
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  )}
                </div>
                {isExpanded && parsedDetails && (
                  <pre className="mt-1.5 p-2 rounded bg-white/5 text-[0.625rem] text-muted-foreground whitespace-pre-wrap overflow-x-auto">{parsedDetails}</pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 bg-white/5" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" className="h-8 text-xs border-white/10 bg-white/5" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Load More</Button>
        </div>
      )}
    </div>
  );
}

