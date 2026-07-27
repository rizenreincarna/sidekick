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
import { ErthboxManagerSection } from "@/components/tabs/erthbox-manager-section";
import { AuditLogSection } from "@/components/tabs/audit-log-section";
import { CHANGELOG } from "@/lib/changelog";
import { TutorialSection } from "@/components/onboarding";

export function SettingsTab({ holidays, onRefresh, session, onReplayOnboarding, onVerifyStart }: { holidays: Holiday[]; onRefresh: () => void; session: { user?: { id?: string; name?: string; role?: string; username?: string } } | null; onReplayOnboarding?: () => void; onVerifyStart?: (sessionId: string) => void; onGeocodeStart?: (sessionId: string) => void }) {
  const { toast } = useToast();
  const [zeoKey, setZeoKey] = useState("");
  const [zeoBase, setZeoBase] = useState("Cyberjaya, Selangor");
  const [zeoDriverId, setZeoDriverId] = useState("");
  const [sheetsId, setSheetsId] = useState("");
  const [sheetsCreds, setSheetsCreds] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; duplicates: string[]; errors: number } | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  // OFF Days state
  const [offDays, setOffDays] = useState<OffDay[]>([]);
  const [offDayDate, setOffDayDate] = useState("");
  const [offDayReason, setOffDayReason] = useState("");
  const [loadingOffDays, setLoadingOffDays] = useState(false);

  // Zone Map state
  const [customZones, setCustomZones] = useState<ZoneConfig[]>([]);
  const [userZones, setUserZones] = useState<UserZoneData[]>([]);
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set());
  const [newZoneArea, setNewZoneArea] = useState<Record<number, string>>({});
  const [loadingZones, setLoadingZones] = useState(false);
  // Default disabled zones: Other States (zones 8-14) disabled by default
  const defaultDisabledZones = Object.entries(ZONES).filter(([_, z]) => !z.isDefaultEnabled).map(([n]) => parseInt(n));
  const [disabledZones, setDisabledZones] = useState<number[]>(defaultDisabledZones);
  // Custom zone creation state
  const [showCreateZone, setShowCreateZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneRegion, setNewZoneRegion] = useState("");
  const [newZoneNewRegion, setNewZoneNewRegion] = useState("");
  const [newZoneAreas, setNewZoneAreas] = useState("");
  // Zone rename state
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [editingZoneName, setEditingZoneName] = useState("");

  // 2FA state
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFAHasSecret, setTwoFAHasSecret] = useState(false);
  const [twoFASetupStep, setTwoFASetupStep] = useState<"idle"|"setup"|"verify"|"done">("idle");
  const [twoFAQrCode, setTwoFAQrCode] = useState("");
  const [twoFASecret, setTwoFASecret] = useState("");
  const [twoFAVerifyCode, setTwoFAVerifyCode] = useState("");
  const [twoFADisableCode, setTwoFADisableCode] = useState("");
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  // AI Zone Suggestions state
  const [aiZoneSuggestions, setAiZoneSuggestions] = useState<Array<{id: string; entityId: string; description: string; payload: string; createdAt: string}>>([]);

  // WhatsApp settings state
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>(DEFAULT_WHATSAPP_TEMPLATES);
  const [waPhonePrefix, setWaPhonePrefix] = useState("60");
  const [waEditingTemplate, setWaEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [waShowCreate, setWaShowCreate] = useState(false);
  const [waNewName, setWaNewName] = useState("");
  const [waNewMessage, setWaNewMessage] = useState("");
  const [waRouteTemplate, setWaRouteTemplate] = useState("");
  const [waRouteEditing, setWaRouteEditing] = useState(false);

  // Collapsible settings sections
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["import-export"]));
  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Load settings & 2FA status on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.json()).catch(() => null),
      fetch("/api/2fa/setup").then(r => r.json()).catch(() => null),
    ]).then(([s, twoFaData]) => {
      if (s) {
        if (s.zeo_api_key) setZeoKey(s.zeo_api_key);
        if (s.zeo_base_address) setZeoBase(s.zeo_base_address);
        if (s.zeo_driver_id) setZeoDriverId(s.zeo_driver_id);
        if (s.google_sheets_id) setSheetsId(s.google_sheets_id);
        if (s.disabledZones !== undefined && s.disabledZones !== null) {
          try { setDisabledZones(JSON.parse(s.disabledZones)); } catch { /* ignore */ }
        }
        if (s.whatsappTemplates) {
          try { setWaTemplates(JSON.parse(s.whatsappTemplates)); } catch { /* ignore */ }
        }
        if (s.whatsappPhonePrefix) setWaPhonePrefix(s.whatsappPhonePrefix);
        if (s.whatsappRouteTemplate) setWaRouteTemplate(s.whatsappRouteTemplate);
      }
      if (twoFaData) {
        setTwoFAEnabled(twoFaData.enabled || false);
        setTwoFAHasSecret(twoFaData.hasSecret || false);
      }
    });
  }, []);

  // Load off days on mount
  useEffect(() => {
    fetch("/api/offdays").then(r => r.json()).then(d => { if (Array.isArray(d)) setOffDays(d); }).catch(() => {});
  }, []);

  // Load zone data + AI zone suggestions on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/zones").then(r => r.json()).catch(() => null),
      fetch("/api/user-zones").then(r => r.json()).catch(() => null),
      fetch("/api/ai/zone-suggestions").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([zonesData, userZonesData, aiSuggestions]) => {
      if (Array.isArray(zonesData)) setCustomZones(zonesData);
      if (Array.isArray(userZonesData)) setUserZones(userZonesData);
      if (Array.isArray(aiSuggestions)) setAiZoneSuggestions(aiSuggestions);
    });
  }, []);

  // Reload zone data (used after approving AI zone suggestions)
  const loadZoneData = async () => {
    try {
      const [zonesRes, userZonesRes] = await Promise.all([
        fetch("/api/zones"),
        fetch("/api/user-zones"),
      ]);
      const zonesData = await zonesRes.json();
      const userZonesData = await userZonesRes.json();
      if (Array.isArray(zonesData)) setCustomZones(zonesData);
      if (Array.isArray(userZonesData)) setUserZones(userZonesData);
    } catch { /* ignore */ }
  };

  // 2FA handlers
  const handle2FASetup = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch("/api/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setTwoFAQrCode(data.qrCode);
        setTwoFASecret(data.secret);
        setTwoFASetupStep("setup");
      } else {
        toast({ title: data.error || "Setup failed", variant: "destructive" });
      }
    } catch { toast({ title: "Setup failed", variant: "destructive" }); }
    finally { setTwoFALoading(false); }
  };

  const handle2FAVerify = async () => {
    if (!twoFAVerifyCode || twoFAVerifyCode.length !== 6) {
      toast({ title: "Enter 6-digit code", variant: "destructive" });
      return;
    }
    setTwoFALoading(true);
    try {
      const res = await fetch("/api/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFAVerifyCode, enable: true }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setTwoFAEnabled(true);
        setTwoFASetupStep("done");
        toast({ title: "2FA enabled! ✓" });
      } else {
        toast({ title: data.error || "Invalid code", variant: "destructive" });
      }
    } catch { toast({ title: "Verification failed", variant: "destructive" }); }
    finally { setTwoFALoading(false); }
  };

  const handle2FADisable = async () => {
    if (!twoFADisableCode || twoFADisableCode.length !== 6) {
      toast({ title: "Enter 6-digit code to disable", variant: "destructive" });
      return;
    }
    setTwoFALoading(true);
    try {
      const res = await fetch("/api/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFADisableCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setTwoFAEnabled(false);
        setTwoFAHasSecret(false);
        setTwoFASetupStep("idle");
        setTwoFADisableCode("");
        toast({ title: "2FA disabled" });
      } else {
        toast({ title: data.error || "Failed to disable", variant: "destructive" });
      }
    } catch { toast({ title: "Failed to disable", variant: "destructive" }); }
    finally { setTwoFALoading(false); }
  };

  // AI Zone Suggestion handlers
  const approveZoneSuggestion = async (suggestionId: string) => {
    try {
      const res = await fetch(`/api/ai/actions/${suggestionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (res.ok) {
        setAiZoneSuggestions(prev => prev.filter(s => s.id !== suggestionId));
        toast({ title: "Zone area added ✓" });
        loadZoneData();
      }
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const rejectZoneSuggestion = async (suggestionId: string) => {
    try {
      const res = await fetch(`/api/ai/actions/${suggestionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      if (res.ok) {
        setAiZoneSuggestions(prev => prev.filter(s => s.id !== suggestionId));
        toast({ title: "Suggestion rejected" });
      }
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        zeo_api_key: zeoKey, zeo_base_address: zeoBase, zeo_driver_id: zeoDriverId,
      }) });
      toast({ title: "Settings saved" });
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const saveWhatsAppSettings = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        whatsappTemplates: JSON.stringify(waTemplates),
        whatsappPhonePrefix: waPhonePrefix,
        whatsappRouteTemplate: waRouteTemplate,
      }) });
      toast({ title: "WhatsApp settings saved" });
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const addWhatsAppTemplate = async () => {
    if (!waNewName.trim() || !waNewMessage.trim()) {
      toast({ title: "Name and message are required", variant: "destructive" });
      return;
    }
    const newTemplate: WhatsAppTemplate = {
      id: `custom-${Date.now()}`,
      name: waNewName.trim(),
      message: waNewMessage.trim(),
      isDefault: false,
    };
    const updated = [...waTemplates, newTemplate];
    setWaTemplates(updated);
    setWaNewName("");
    setWaNewMessage("");
    setWaShowCreate(false);
    // Auto-save
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappTemplates: JSON.stringify(updated) }) });
    if (!res.ok) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    toast({ title: "Template created" });
  };

  const updateWhatsAppTemplate = async () => {
    if (!waEditingTemplate || !waEditingTemplate.name.trim() || !waEditingTemplate.message.trim()) return;
    const updated = waTemplates.map(t => t.id === waEditingTemplate.id ? waEditingTemplate : t);
    setWaTemplates(updated);
    setWaEditingTemplate(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappTemplates: JSON.stringify(updated) }) });
    if (!res.ok) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    toast({ title: "Template updated" });
  };

  const deleteWhatsAppTemplate = async (id: string) => {
    const template = waTemplates.find(t => t.id === id);
    if (template?.isDefault && waTemplates.length <= 1) {
      toast({ title: "Cannot delete the only default template", variant: "destructive" });
      return;
    }
    const updated = waTemplates.filter(t => t.id !== id);
    // If we deleted the default, make the first remaining one default
    if (template?.isDefault && updated.length > 0) {
      updated[0] = { ...updated[0], isDefault: true };
    }
    setWaTemplates(updated);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappTemplates: JSON.stringify(updated) }) });
    if (!res.ok) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    toast({ title: "Template deleted" });
  };

  const setDefaultTemplate = async (id: string) => {
    const updated = waTemplates.map(t => ({ ...t, isDefault: t.id === id }));
    setWaTemplates(updated);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsappTemplates: JSON.stringify(updated) }) });
    if (!res.ok) {
      toast({ title: "Failed to save", variant: "destructive" });
      return;
    }
    toast({ title: "Default template updated" });
  };

  const handleSheetsSync = async (action: "sync" | "import") => {
    setSyncing(true);
    try {
      const body: Record<string, string> = { action };
      if (sheetsId) body.spreadsheetId = sheetsId;
      if (sheetsCreds) body.serviceAccount = sheetsCreds;
      const res = await fetch("/api/sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: action === "sync" ? `Synced ${data.rowsWritten} rows to Sheets` : `Imported ${data.imported} orders from Sheets` });
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Sheets sync failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setSyncing(false); }
  };

  const downloadTemplate = () => {
    const headers = ["Order #", "Client name", "Address", "Special Note"];
    const sampleRows = [
      ["25659", "+60 16-303 8834", "No.15, Persiaran Pasak Bumi Seksyen U8, Shah Alam, Selangor, 40150", ""],
      ["25660", "CLEVER", "2A, Jalan Sungai Burung W 32/W, Bukit Rimau, Shah Alam, Selangor, 40460", "Biz hours only"],
      ["25661", "+60 12-398 9734", "38, Jalan BP 1/5, Bandar Bukit Puchong, Puchong, Selangor, 47100", "Agreed to pay RM35"],
    ];
    const csvContent = [headers, ...sampleRows].map(row =>
      row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Encore_Import_Template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Template downloaded", description: "Matches Encore export format — export from Encore, then import here" });
  };

  const handleEncoreImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/encore", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setImportResult({ imported: data.imported, skipped: data.skipped, duplicates: data.duplicates, errors: data.errors });

      if (data.imported > 0) {
        toast({ title: `Imported ${data.imported} orders from Encore`, description: data.skipped > 0 ? `${data.skipped} duplicates skipped` : undefined });
        if (data.newOrderIds?.length > 0) {
          fetch("/api/orders/verify-address/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderIds: data.newOrderIds }),
          }).then(r => r.json()).then(vData => {
            if (vData.sessionId) onVerifyStart?.(vData.sessionId);
          }).catch(() => {});
        }
        onRefresh();
      } else if (data.skipped > 0) {
        toast({ title: "No new orders imported", description: `${data.skipped} orders already exist (duplicates)`, variant: "destructive" });
      } else {
        toast({ title: "No orders found in file", variant: "destructive" });
      }
    } catch (err: unknown) {
      toast({ title: "Import failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleZeoExport = async (date: string) => {
    setExporting(true);
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
      setExporting(false);
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: newDate, name: newName }) });
      if (!res.ok) throw new Error();
      toast({ title: "Holiday added" });
      setNewDate(""); setNewName(""); onRefresh();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const deleteHoliday = async (id: string) => {
    await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    toast({ title: "Holiday deleted" }); onRefresh();
  };

  // OFF Days handlers
  const addOffDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offDayDate) return;
    setLoadingOffDays(true);
    try {
      const res = await fetch("/api/offdays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: offDayDate, reason: offDayReason || null }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const newOffDay = await res.json();
      setOffDays(prev => [...prev, newOffDay].sort((a, b) => a.date.localeCompare(b.date)));
      setOffDayDate(""); setOffDayReason("");
      toast({ title: "OFF day added" });
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Failed to add OFF day", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setLoadingOffDays(false); }
  };

  const deleteOffDay = async (id: string) => {
    try {
      await fetch(`/api/offdays/${id}`, { method: "DELETE" });
      setOffDays(prev => prev.filter(o => o.id !== id));
      toast({ title: "OFF day removed" });
      onRefresh();
    } catch { toast({ title: "Failed to remove", variant: "destructive" }); }
  };

  // Zone Map handlers
  const toggleZone = (zone: number) => {
    setExpandedZones(prev => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone); else next.add(zone);
      return next;
    });
  };

  const addZoneArea = async (zone: number) => {
    const area = newZoneArea[zone]?.trim();
    if (!area || area.length < 2) return;
    setLoadingZones(true);
    try {
      const res = await fetch("/api/zones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone, area }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const newConfig = await res.json();
      setCustomZones(prev => [...prev, newConfig]);
      setNewZoneArea(prev => ({ ...prev, [zone]: "" }));
      toast({ title: `Added "${area}" to Zone ${zone}` });
    } catch (err: unknown) {
      toast({ title: "Failed to add area", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setLoadingZones(false); }
  };

  const deleteZoneArea = async (id: string) => {
    try {
      const res = await fetch("/api/zones", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setCustomZones(prev => prev.filter(z => z.id !== id));
      toast({ title: "Area removed" });
    } catch (err: unknown) { toast({ title: "Failed to remove area", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" }); }
  };

  const excludeZoneArea = async (zone: number, area: string) => {
    setLoadingZones(true);
    try {
      const res = await fetch("/api/zones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone, area, isExcluded: true }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      // Reload custom zones so the exclusion appears
      const zonesRes = await fetch("/api/zones");
      const zonesData = await zonesRes.json();
      if (Array.isArray(zonesData)) setCustomZones(zonesData);
      toast({ title: `"${area}" excluded from Zone ${zone}` });
    } catch (err: unknown) {
      toast({ title: "Failed to exclude area", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setLoadingZones(false); }
  };

  const restoreZoneArea = async (id: string, area: string, zone: number) => {
    try {
      const res = await fetch("/api/zones", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setCustomZones(prev => prev.filter(z => z.id !== id));
      toast({ title: `"${area}" restored to Zone ${zone}` });
    } catch (err: unknown) {
      toast({ title: "Failed to restore area", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const toggleZoneEnabled = async (zone: number, enabled: boolean) => {
    const newDisabled = enabled
      ? disabledZones.filter(z => z !== zone)
      : [...disabledZones.filter(z => z !== zone), zone];
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabledZones: JSON.stringify(newDisabled) }) });
      if (!res.ok) throw new Error("Failed");
      setDisabledZones(newDisabled);
      // Also update user zone override if exists
      const existingOverride = userZones.find(uz => uz.zoneId === zone);
      if (existingOverride) {
        await fetch("/api/user-zones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zoneId: zone, isEnabled: enabled }) });
      }
      const zoneName = userZones.find(uz => uz.zoneId === zone)?.name || ZONES[zone]?.name || `Zone ${zone}`;
      toast({ title: `${zoneName} ${enabled ? "enabled" : "disabled"}` });
    } catch {
      toast({ title: "Failed to update zone", variant: "destructive" });
    }
  };

  const renameZone = async (zoneId: number, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/user-zones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zoneId, name: newName.trim() }) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setUserZones(prev => {
        const existing = prev.find(uz => uz.zoneId === zoneId);
        if (existing) return prev.map(uz => uz.zoneId === zoneId ? { ...uz, name: newName.trim() } : uz);
        return [...prev, { id: data.id, zoneId, name: newName.trim(), region: ZONES[zoneId]?.region || "Custom", isCustom: false, isEnabled: true, areas: [], order: 0 }];
      });
      setEditingZoneId(null);
      toast({ title: `Zone renamed to "${newName.trim()}"` });
    } catch {
      toast({ title: "Failed to rename zone", variant: "destructive" });
    }
  };

  const createCustomZone = async () => {
    const region = newZoneNewRegion.trim() || newZoneRegion;
    if (!newZoneName.trim() || !region) return;
    const areas = newZoneAreas.split(",").map(a => a.trim().toLowerCase()).filter(a => a.length >= 2);
    try {
      const res = await fetch("/api/user-zones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newZoneName.trim(), region, areas, isCustom: true }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setUserZones(prev => [...prev, { id: data.id, zoneId: data.zoneId, name: data.name, region: data.region, isCustom: true, isEnabled: true, areas, order: data.order }]);
      setShowCreateZone(false);
      setNewZoneName("");
      setNewZoneRegion("");
      setNewZoneNewRegion("");
      setNewZoneAreas("");
      toast({ title: `Zone "${data.name}" created in ${region}` });
    } catch (err: unknown) {
      toast({ title: "Failed to create zone", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const deleteCustomZone = async (zoneId: number) => {
    try {
      const res = await fetch("/api/user-zones", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zoneId }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setUserZones(prev => prev.filter(uz => uz.zoneId !== zoneId));
      setCustomZones(prev => prev.filter(z => z.zone !== zoneId));
      toast({ title: "Custom zone deleted" });
    } catch (err: unknown) {
      toast({ title: "Failed to delete zone", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  // Build the full zone list for display (built-in + custom)
  const allZones = useMemo(() => {
    const result: { zoneId: number; name: string; region: string; isCustom: boolean; isBuiltIn: boolean; color: string; bgColor: string; borderColor: string }[] = [];
    // Add built-in zones
    for (const [num, z] of Object.entries(ZONES)) {
      const zoneId = parseInt(num);
      const override = userZones.find(uz => uz.zoneId === zoneId);
      result.push({
        zoneId,
        name: override?.name || z.name,
        region: override?.region || z.region,
        isCustom: false,
        isBuiltIn: true,
        color: z.color,
        bgColor: z.bgColor,
        borderColor: z.borderColor,
      });
    }
    // Add custom zones
    for (const uz of userZones.filter(uz => uz.isCustom)) {
      const colorIdx = result.length;
      const zc = getZoneColor(colorIdx);
      result.push({
        zoneId: uz.zoneId,
        name: uz.name,
        region: uz.region,
        isCustom: true,
        isBuiltIn: false,
        color: zc.color,
        bgColor: zc.bgColor,
        borderColor: zc.borderColor,
      });
    }
    return result;
  }, [userZones]);

  // Get unique regions in display order
  const allRegions = useMemo(() => {
    const regions = new Map<string, number>();
    // Built-in regions first (in ZONES order)
    for (const z of Object.values(ZONES)) {
      if (!regions.has(z.region)) regions.set(z.region, regions.size);
    }
    // Custom regions
    for (const uz of userZones.filter(uz => uz.isCustom)) {
      if (!regions.has(uz.region)) regions.set(uz.region, regions.size);
    }
    return Array.from(regions.keys());
  }, [userZones]);

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {/* ====== IMPORT / EXPORT (open by default) ====== */}
      <div className="rounded-xl border border-orange-500/20 bg-card overflow-hidden">
        <button onClick={() => toggleSection("import-export")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-orange-400" />Import & Export</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("import-export") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("import-export") && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/5">
            {/* Encore Import */}
            <div className="pt-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileUp className="h-4 w-4 text-orange-400" />Import from Encore</h4>
              <p className="text-xs text-muted-foreground mb-2">Upload CSV from Encore. Format: Order #, Client name, Address, Special Note. Duplicates auto-skipped.</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept=".csv" onChange={handleEncoreImport} className="hidden" disabled={importing} />
                  <Button variant="outline" className="gap-2 h-11 border-orange-500/30 text-orange-400 hover:bg-orange-500/15 px-4 py-3" disabled={importing} asChild>
                    <span>
                      {importing ? <><RotateCcw className="h-3 w-3 animate-spin" />Importing...</> : <><FileUp className="h-3 w-3" />Choose Encore CSV</>}
                    </span>
                  </Button>
                </label>
                <Button onClick={downloadTemplate} variant="outline" className="gap-2 h-11 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/15 px-4 py-3"><FileSpreadsheet className="h-3 w-3" />Download Template</Button>
              </div>
              {importResult && (
                <div className={`rounded-lg border p-3 text-xs flex gap-2 mt-2 ${importResult.imported > 0 ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"}`}>
                  {importResult.imported > 0 ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-semibold">Import Result</p>
                    <p>✅ {importResult.imported} orders imported</p>
                    {importResult.skipped > 0 && <p>⏭️ {importResult.skipped} duplicates skipped</p>}
                    {importResult.errors > 0 && <p className="text-destructive">❌ {importResult.errors} errors</p>}
                  </div>
                </div>
              )}
            </div>
            <Separator className="bg-white/5" />
            {/* Zeo Export */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><FileDown className="h-4 w-4 text-primary" />Export to Zeo Route Planner</h4>
              <p className="text-xs text-muted-foreground mb-2">Export scheduled orders as XLSX. Order ID in Customer name column for easy identification.</p>
              <div className="flex items-center gap-3">
                <Input type="date" id="zeo-export-date" className="h-11 w-auto bg-white/5 border-white/10" defaultValue={new Date().toISOString().split("T")[0]} />
                <Button onClick={() => {
                  const input = document.getElementById("zeo-export-date") as HTMLInputElement;
                  if (input?.value) handleZeoExport(input.value);
                }} disabled={exporting} className="gap-2 h-11 bg-muted hover:bg-muted/80 text-foreground px-4 py-3">
                  {exporting ? <><RotateCcw className="h-3 w-3 animate-spin" />Exporting...</> : <><FileDown className="h-3 w-3" />Export XLSX</>}
                </Button>
              </div>
            </div>
            <Separator className="bg-white/5" />
          </div>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <button onClick={() => toggleSection("scheduling")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Scheduling</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("scheduling") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("scheduling") && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/5">
            {/* Capacity info */}
            <div className="pt-3">
              <h4 className="text-sm font-semibold mb-2">Daily Capacity</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2"><p className="text-lg font-bold text-emerald-400">1</p><p className="text-[0.625rem] text-muted-foreground">Small (S)</p></div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2"><p className="text-lg font-bold text-amber-400">2</p><p className="text-[0.625rem] text-muted-foreground">Medium (M)</p></div>
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2"><p className="text-lg font-bold text-rose-400">3</p><p className="text-[0.625rem] text-muted-foreground">Large (L)</p></div>
              </div>
              <p className="text-xs text-center mt-2 font-semibold">Max {MAX_DAILY_POINTS} points/day</p>
              <p className="text-[0.625rem] text-center text-muted-foreground">Every day is a working day. Only OFF DAYS block scheduling. Office pickups are not scheduled on weekends and public holidays.</p>
            </div>
            <Separator className="bg-white/5" />
            {/* Public Holidays */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><AlertCircle className="h-4 w-4 text-amber-400" />Public Holidays</h4>
              <form onSubmit={addHoliday} className="flex gap-2 flex-wrap mb-2">
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-10 w-auto text-xs bg-white/5 border-white/10" required />
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Holiday name" className="h-10 flex-1 min-w-[120px] text-xs bg-white/5 border-white/10" required />
                <Button type="submit" size="sm" className="gap-1 h-10 px-3"><Plus className="h-3 w-3" />Add</Button>
              </form>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {holidays.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No holidays set</p>}
                {holidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5">
                    <span className="text-xs"><span className="font-medium">{h.name}</span> <span className="text-muted-foreground ml-2">{format(parseISO(h.date), "dd MMM yyyy (EEE)")}</span></span>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/15" onClick={() => deleteHoliday(h.id)}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>
            <Separator className="bg-white/5" />
            {/* OFF Days */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Home className="h-4 w-4 text-rose-400" />OFF Days</h4>
              <p className="text-[0.625rem] text-muted-foreground mb-2">No scheduling on these days. Working days are every day — only OFF DAYS block scheduling.</p>
              <form onSubmit={addOffDay} className="flex gap-2 flex-wrap mb-2">
                <Input type="date" value={offDayDate} onChange={e => setOffDayDate(e.target.value)} className="h-10 w-auto text-xs bg-white/5 border-white/10" required />
                <Input value={offDayReason} onChange={e => setOffDayReason(e.target.value)} placeholder="Reason (optional)" className="h-10 flex-1 min-w-[120px] text-xs bg-white/5 border-white/10" />
                <Button type="submit" size="sm" className="gap-1 h-10 px-3" disabled={loadingOffDays || !offDayDate}><Plus className="h-3 w-3" />Add</Button>
              </form>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {offDays.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No OFF days set</p>}
                {offDays.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/5">
                    <span className="text-xs">
                      <span className="font-medium text-rose-300">OFF</span>
                      <span className="text-muted-foreground ml-2">{format(parseISO(o.date), "dd MMM yyyy (EEE)")}</span>
                      {o.reason && <span className="text-muted-foreground ml-2 text-[0.625rem]">({o.reason})</span>}
                    </span>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/15" onClick={() => deleteOffDay(o.id)}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            </div>
            <Separator className="bg-white/5" />
            {/* ERTHBOX Manager */}
            <ErthboxManagerSection />
          </div>
        )}
      </div>

      {/* ====== ZONE MAP ====== */}
      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <button onClick={() => toggleSection("zone-map")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><Layers className="h-5 w-5 text-primary" />Zone Map</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("zone-map") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("zone-map") && (
          <div className="px-4 pb-4 border-t border-white/5">
            {/* Create Zone button */}
            <div className="flex items-center justify-between pt-3 mb-2">
              <p className="text-[0.625rem] text-muted-foreground">Manage mini zones within each state. Click zone name to rename.</p>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[0.625rem] border-primary/30 text-primary hover:bg-primary/10" onClick={() => setShowCreateZone(!showCreateZone)}>
                <PlusCircle className="h-3 w-3" />{showCreateZone ? "Cancel" : "New Zone"}
              </Button>
            </div>

            {/* Create Zone Form */}
            {showCreateZone && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-3 space-y-2">
                <p className="text-xs font-semibold text-primary">Create Custom Zone</p>
                <Input value={newZoneName} onChange={e => setNewZoneName(e.target.value)} placeholder="Zone name (e.g. KL South)" className="h-8 text-xs bg-white/5 border-white/10" />
                <div className="flex gap-2">
                  <Select value={newZoneRegion} onValueChange={setNewZoneRegion}>
                    <SelectTrigger className="h-8 text-xs bg-white/5 border-white/10 flex-1"><SelectValue placeholder="Select state..." /></SelectTrigger>
                    <SelectContent>
                      {allRegions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      <SelectItem value="__new__">+ New state...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newZoneRegion === "__new__" && (
                  <Input value={newZoneNewRegion} onChange={e => setNewZoneNewRegion(e.target.value)} placeholder="New state name (e.g. Perlis)" className="h-8 text-xs bg-white/5 border-white/10" />
                )}
                <Input value={newZoneAreas} onChange={e => setNewZoneAreas(e.target.value)} placeholder="Areas (comma-separated, e.g. area1, area2, area3)" className="h-8 text-xs bg-white/5 border-white/10" />
                <Button size="sm" className="h-8 gap-1 text-xs w-full" onClick={createCustomZone} disabled={!newZoneName.trim() || (!newZoneRegion && !newZoneNewRegion.trim())}>
                  <PlusCircle className="h-3 w-3" />Create Zone
                </Button>
              </div>
            )}

            {/* Zone groups by region */}
            {allRegions.map(region => {
              const zonesInRegion = allZones.filter(z => z.region === region);
              if (zonesInRegion.length === 0) return null;
              return (
                <div key={region} className="mt-3 first:mt-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{region}</h4>
                    <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-white/10">{zonesInRegion.length} zone{zonesInRegion.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="space-y-2">
                    {zonesInRegion.map(az => {
                      const isExpanded = expandedZones.has(az.zoneId);
                      const isDisabled = disabledZones.includes(az.zoneId);
                      const isCustomZone = az.isCustom;
                      const zoneCustoms = customZones.filter(c => c.zone === az.zoneId);
                      const zoneExclusions = zoneCustoms.filter(c => c.isExcluded);
                      const excludedAreas = new Set(zoneExclusions.map(c => c.area.toLowerCase()));
                      // Get areas: for built-in zones, use ZONES definition; for custom, use userZones data
                      const customZoneData = userZones.find(uz => uz.zoneId === az.zoneId);
                      const builtInAreas = ZONES[az.zoneId]?.areas || [];
                      const customZoneAreas = customZoneData?.areas || [];
                      const allBuiltInAreas = isCustomZone ? customZoneAreas : builtInAreas;
                      const visibleAreas = allBuiltInAreas.filter(a => !excludedAreas.has(a.toLowerCase()));
                      const isEditing = editingZoneId === az.zoneId;
                      return (
                        <div key={az.zoneId} className={`rounded-lg border ${isDisabled ? "border-white/5 opacity-50" : az.borderColor || "border-white/10"}`}>
                          <div className={`w-full flex items-center justify-between p-2.5 text-left ${isDisabled ? "bg-white/5" : az.bgColor || "bg-white/5"}`}>
                            <button onClick={() => toggleZone(az.zoneId)} className="flex-1 text-left min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isEditing ? (
                                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                    <Input
                                      value={editingZoneName}
                                      onChange={e => setEditingZoneName(e.target.value)}
                                      className="h-6 text-xs w-32 bg-white/5 border-white/10"
                                      autoFocus
                                      onKeyDown={e => { if (e.key === "Enter") renameZone(az.zoneId, editingZoneName); if (e.key === "Escape") setEditingZoneId(null); }}
                                    />
                                    <Button size="sm" variant="ghost" className="h-6 px-1 text-[0.625rem] text-emerald-400 hover:text-emerald-300" onClick={() => renameZone(az.zoneId, editingZoneName)}>✓</Button>
                                    <Button size="sm" variant="ghost" className="h-6 px-1 text-[0.625rem] text-destructive hover:text-destructive/80" onClick={() => setEditingZoneId(null)}>✕</Button>
                                  </div>
                                ) : (
                                  <span
                                    className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors"
                                    onClick={(e) => { e.stopPropagation(); setEditingZoneId(az.zoneId); setEditingZoneName(az.name); }}
                                    title="Click to rename"
                                  >
                                    {az.name}
                                  </span>
                                )}
                                {isCustomZone && <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-primary/30 text-primary">Custom</Badge>}
                                {isDisabled && <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-destructive/30 text-destructive">Off</Badge>}
                                <span className="text-[0.625rem] text-muted-foreground">({visibleAreas.length} areas{zoneExclusions.length > 0 ? `, ${zoneExclusions.length} excluded` : ""}{zoneCustoms.filter(c => !c.isExcluded).length > 0 ? `, +${zoneCustoms.filter(c => !c.isExcluded).length} custom` : ""})</span>
                              </div>
                            </button>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isCustomZone && (
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive/50 hover:text-destructive" onClick={() => deleteCustomZone(az.zoneId)} title="Delete custom zone"><Trash2 className="h-3 w-3" /></Button>
                              )}
                              <Switch
                                checked={!isDisabled}
                                onCheckedChange={(checked) => toggleZoneEnabled(az.zoneId, checked)}
                                className="scale-75"
                              />
                              <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="p-2.5 space-y-1.5 border-t border-white/5">
                              {/* Active areas */}
                              <div className="flex flex-wrap gap-0.5">
                                {visibleAreas.map((area, i) => (
                                  <span key={i} className="group text-[0.625rem] bg-white/5 border border-white/10 rounded px-1 py-0.5 text-muted-foreground inline-flex items-center gap-0.5 hover:bg-white/10 transition-colors">
                                    {area}
                                    <button onClick={() => excludeZoneArea(az.zoneId, area)} className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity ml-0.5"><X className="h-2 w-2" /></button>
                                  </span>
                                ))}
                              </div>
                              {/* Excluded areas with restore button */}
                              {zoneExclusions.length > 0 && (
                                <div className="mt-1">
                                  <p className="text-[0.625rem] text-muted-foreground mb-0.5 flex items-center gap-1"><MapPinOff className="h-2.5 w-2.5" />Excluded</p>
                                  <div className="flex flex-wrap gap-0.5">
                                    {zoneExclusions.map(c => (
                                      <span key={c.id} className="group text-[0.625rem] bg-destructive/10 border border-destructive/20 rounded px-1 py-0.5 text-destructive/70 inline-flex items-center gap-0.5 hover:bg-destructive/15 transition-colors">
                                        <s>{c.area}</s>
                                        <button onClick={() => restoreZoneArea(c.id, c.area, az.zoneId)} className="opacity-0 group-hover:opacity-100 hover:text-emerald-400 transition-opacity ml-0.5" title="Restore area"><Undo2 className="h-2.5 w-2.5" /></button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Custom-added areas with delete button */}
                              {zoneCustoms.filter(c => !c.isExcluded).length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {zoneCustoms.filter(c => !c.isExcluded).map(c => (
                                    <span key={c.id} className="text-[0.625rem] bg-primary/10 border border-primary/20 rounded px-1 py-0.5 text-primary inline-flex items-center gap-0.5">
                                      {c.area}
                                      <button onClick={() => deleteZoneArea(c.id)} className="hover:text-destructive ml-0.5"><X className="h-2 w-2" /></button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Add area input */}
                              <div className="flex items-center gap-2 mt-1">
                                <Input
                                  value={newZoneArea[az.zoneId] || ""}
                                  onChange={e => setNewZoneArea(prev => ({ ...prev, [az.zoneId]: e.target.value }))}
                                  placeholder="Add area..."
                                  className="h-8 text-xs bg-white/5 border-white/10 flex-1"
                                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addZoneArea(az.zoneId); } }}
                                />
                                <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => addZoneArea(az.zoneId)} disabled={loadingZones || !newZoneArea[az.zoneId]?.trim()}>
                                  <Plus className="h-3 w-3" />Add
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* AI Zone Suggestions */}
            {aiZoneSuggestions.length > 0 && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-primary">AI Zone Suggestions</span>
                  <Badge className="bg-primary/10 text-primary border-primary/30 text-[0.625rem]">{aiZoneSuggestions.length}</Badge>
                </div>
                <p className="text-[0.625rem] text-muted-foreground mb-2">New areas discovered from orders. Review and approve to add them to zones.</p>
                <div className="space-y-2">
                  {aiZoneSuggestions.map(s => (
                    <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.75rem] font-medium truncate">{s.description}</p>
                        <p className="text-[0.625rem] text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => approveZoneSuggestion(s.id)} className="h-8 w-8 p-0 text-emerald-400 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => rejectZoneSuggestion(s.id)} className="h-8 w-8 p-0 text-destructive shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== AUDIT LOG (Admin Only) ====== */}
      {session?.user?.role === "ADMIN" && (
        <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
          <button onClick={() => toggleSection("audit-log")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
            <h3 className="font-semibold flex items-center gap-2"><Shield className="h-5 w-5 text-amber-400" />Audit Log</h3>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("audit-log") ? "rotate-90" : ""}`} />
          </button>
          {openSections.has("audit-log") && (
            <AuditLogSection />
          )}
        </div>
      )}

      {/* ====== INTEGRATIONS ====== */}
      <div className="rounded-xl border border-white/10 bg-card overflow-hidden">
        <button onClick={() => toggleSection("integrations")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><Route className="h-5 w-5 text-primary" />Integrations</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("integrations") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("integrations") && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/5">
            {/* Zeo Route Planner */}
            <div className="pt-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Route className="h-4 w-4 text-primary" />Zeo Route Planner</h4>
              <div className="space-y-2">
                <div><Label className="text-[0.625rem] text-muted-foreground">API Key</Label><Input value={zeoKey} onChange={e => setZeoKey(e.target.value)} placeholder="Enter Zeo API key" className="h-10 text-xs bg-white/5 border-white/10" /></div>
                <div><Label className="text-[0.625rem] text-muted-foreground">Base/Start Address</Label><Input value={zeoBase} onChange={e => setZeoBase(e.target.value)} placeholder="Your home or ERTH HQ" className="h-10 text-xs bg-white/5 border-white/10" /></div>
                <div><Label className="text-[0.625rem] text-muted-foreground">Driver ID (optional)</Label><Input value={zeoDriverId} onChange={e => setZeoDriverId(e.target.value)} placeholder="Auto-detected from API" className="h-10 text-xs bg-white/5 border-white/10" /></div>
                <Button onClick={saveSettings} disabled={saving} className="gap-2 h-10 bg-primary hover:bg-primary/90 text-white px-4">{saving ? "Saving..." : "Save Settings"}</Button>
                <p className="text-[0.625rem] text-muted-foreground">Get your API key from <a href="https://zeorouteplanner.com/app/team/settings/genrate-token" target="_blank" rel="noopener" className="text-primary underline">Zeo Settings</a></p>
              </div>
            </div>
            <Separator className="bg-white/5" />
            {/* Google Sheets */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><ClipboardList className="h-4 w-4 text-emerald-400" />Google Sheets Sync</h4>
              <div className="space-y-2">
                <div><Label className="text-[0.625rem] text-muted-foreground">Spreadsheet ID</Label><Input value={sheetsId} onChange={e => setSheetsId(e.target.value)} placeholder="From the Google Sheets URL" className="h-10 text-xs bg-white/5 border-white/10" /></div>
                <div><Label className="text-[0.625rem] text-muted-foreground">Service Account JSON (one-time)</Label><Textarea value={sheetsCreds} onChange={e => setSheetsCreds(e.target.value)} placeholder='{"type":"service_account","project_id":"..."}' className="h-20 text-[0.625rem] font-mono bg-white/5 border-white/10" /></div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={() => handleSheetsSync("sync")} disabled={syncing} variant="outline" className="gap-2 h-10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15 px-3 text-xs"><Upload className="h-3 w-3" />{syncing ? "Syncing..." : "Push to Sheets"}</Button>
                  <Button onClick={() => handleSheetsSync("import")} disabled={syncing} variant="outline" className="gap-2 h-10 border-primary/30 text-primary hover:bg-primary/15 px-3 text-xs"><Download className="h-3 w-3" />Import from Sheets</Button>
                </div>
                <details className="text-[0.625rem] text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground transition-colors">Setup Instructions</summary>
                  <ol className="list-decimal ml-3 mt-1 space-y-0.5">
                    <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener" className="underline">Google Cloud Console</a></li>
                    <li>Create a project → Enable Google Sheets API</li>
                    <li>Create Service Account → Download JSON key</li>
                    <li>Share your spreadsheet with the service account email</li>
                    <li>Paste the Spreadsheet ID and JSON above</li>
                  </ol>
                </details>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====== WHATSAPP ====== */}
      <div className="rounded-xl border border-emerald-500/20 bg-card overflow-hidden">
        <button onClick={() => toggleSection("whatsapp")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-400" />WhatsApp</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[0.625rem] border-emerald-500/30 text-emerald-400 px-2 py-0">{waTemplates.length} templates</Badge>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("whatsapp") ? "rotate-90" : ""}`} />
          </div>
        </button>
        {openSections.has("whatsapp") && (
          <div className="px-4 pb-4 space-y-4 border-t border-white/5">
            {/* Phone Prefix */}
            <div className="pt-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Phone className="h-4 w-4 text-emerald-400" />Phone Settings</h4>
              <div className="space-y-2">
                <div>
                  <Label className="text-[0.625rem] text-muted-foreground">Country Code Prefix</Label>
                  <div className="flex items-center gap-2">
                    <Input value={waPhonePrefix} onChange={e => setWaPhonePrefix(e.target.value.replace(/[^0-9]/g, ""))} placeholder="60" className="h-10 w-24 text-xs bg-white/5 border-white/10" />
                    <span className="text-xs text-muted-foreground">Phone numbers will be formatted as +{waPhonePrefix}XXXXXXXX</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Templates */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold flex items-center gap-2"><StickyNote className="h-4 w-4 text-emerald-400" />Message Templates</h4>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[0.625rem] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15" onClick={() => { setWaShowCreate(true); setWaNewName(""); setWaNewMessage(""); }}>
                  <PlusCircle className="h-3 w-3" />New Template
                </Button>
              </div>
              <p className="text-[0.625rem] text-muted-foreground mb-3">Templates are pre-filled when you click the WhatsApp button on an order. You can edit the message before sending.</p>

              {/* Create New Template */}
              {waShowCreate && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-400">New Template</p>
                  <div>
                    <Label className="text-[0.625rem] text-muted-foreground">Template Name</Label>
                    <Input value={waNewName} onChange={e => setWaNewName(e.target.value)} placeholder="e.g. Follow Up" className="h-9 text-xs bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-[0.625rem] text-muted-foreground">Message (use variables like {"{customerName}"}, {"{date}"}, {"{address}"})</Label>
                    <Textarea value={waNewMessage} onChange={e => setWaNewMessage(e.target.value)} placeholder="Hi {customerName}, your pickup is scheduled for {date}..." className="min-h-[80px] text-xs bg-white/5 border-white/10" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 gap-1.5 text-[0.625rem] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={addWhatsAppTemplate}><CheckCircle className="h-3 w-3" />Create</Button>
                    <Button size="sm" variant="outline" className="h-8 text-[0.625rem] border-white/10" onClick={() => setWaShowCreate(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {/* Template List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {waTemplates.map(t => (
                  <div key={t.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    {waEditingTemplate?.id === t.id ? (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-[0.625rem] text-muted-foreground">Name</Label>
                          <Input value={waEditingTemplate.name} onChange={e => setWaEditingTemplate({ ...waEditingTemplate, name: e.target.value })} className="h-9 text-xs bg-white/5 border-white/10" />
                        </div>
                        <div>
                          <Label className="text-[0.625rem] text-muted-foreground">Message</Label>
                          <Textarea value={waEditingTemplate.message} onChange={e => setWaEditingTemplate({ ...waEditingTemplate, message: e.target.value })} className="min-h-[80px] text-xs bg-white/5 border-white/10" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-8 gap-1.5 text-[0.625rem] bg-primary hover:bg-primary/90 text-primary-foreground" onClick={updateWhatsAppTemplate}><CheckCircle className="h-3 w-3" />Save</Button>
                          <Button size="sm" variant="outline" className="h-8 text-[0.625rem] border-white/10" onClick={() => setWaEditingTemplate(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{t.name}</span>
                            {t.isDefault && <Badge className="text-[0.625rem] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Default</Badge>}
                          </div>
                          <div className="flex items-center gap-1">
                            {!t.isDefault && (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-emerald-400" onClick={() => setDefaultTemplate(t.id)} title="Set as default">
                                <Star className="h-3 w-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setWaEditingTemplate({ ...t })} title="Edit">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteWhatsAppTemplate(t.id)} title="Delete">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-[0.75rem] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{t.message}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Variable Reference */}
            <details className="text-[0.625rem] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors text-xs font-medium">Available Variables Reference</summary>
              <div className="mt-2 rounded-lg bg-white/5 border border-white/5 p-3">
                <p className="text-[0.625rem] text-muted-foreground mb-2">Use these variables in your templates. They will be auto-filled with order data when sending.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {WHATSAPP_VARIABLES.map(v => (
                    <div key={v.key} className="flex items-center gap-2">
                      <code className="text-[0.625rem] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{v.key}</code>
                      <span className="text-[0.625rem] text-muted-foreground">{v.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            <Separator className="bg-white/5" />

            {/* Route Optimizer Template */}
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-2 mb-2"><Route className="h-4 w-4 text-emerald-400" />Route Optimizer Message</h4>
              <p className="text-[0.625rem] text-muted-foreground mb-2">Template used when sending WhatsApp from the route optimizer. Variables: {"{customerName}"}, {"{date}"}, {"{address}"}, {"{arrival}"}, {"{trackUrl}"}.</p>
              {waRouteEditing ? (
                <div className="space-y-2">
                  <Textarea value={waRouteTemplate} onChange={e => setWaRouteTemplate(e.target.value)} className="min-h-[80px] text-xs bg-white/5 border-white/10" placeholder="Hi {customerName}, pickup on {date} at {address}. ETA: {arrival}. Track: {trackUrl}" />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 gap-1.5 text-[0.625rem] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setWaRouteEditing(false); saveWhatsAppSettings(); }}>
                      <CheckCircle className="h-3 w-3" />Save
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-[0.625rem] border-white/10" onClick={() => setWaRouteEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[0.75rem] text-muted-foreground whitespace-pre-wrap flex-1">{waRouteTemplate || <span className="italic text-muted-foreground/50">No template set — defaults to tracking-link message</span>}</p>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[0.625rem] shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15" onClick={() => setWaRouteEditing(true)}>
                    <Pencil className="h-3 w-3" />Edit
                  </Button>
                </div>
              )}
            </div>

            {/* Save Button */}
            <Button onClick={saveWhatsAppSettings} disabled={saving} className="gap-2 h-10 bg-emerald-600 hover:bg-emerald-700 text-white px-4 w-full sm:w-auto">
              {saving ? <><RotateCcw className="h-3 w-3 animate-spin" />Saving...</> : <><CheckCircle className="h-4 w-4" />Save WhatsApp Settings</>}
            </Button>
          </div>
        )}
      </div>

      {/* ====== AI ASSISTANT (Admin Only) ====== */}
      {session?.user?.role === "ADMIN" && (
        <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
          <AiSettingsSection />
        </div>
      )}

      {/* ====== SECURITY (All Users) ====== */}
      <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
        <button onClick={() => setSecurityOpen(!securityOpen)} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">Security</span>
            {twoFAEnabled ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[0.625rem]">2FA ON</Badge>
            ) : (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[0.625rem]">2FA OFF</Badge>
            )}
          </div>
          {securityOpen ? <X className="h-4 w-4" /> : <span className="text-muted-foreground text-xs">▶</span>}
        </button>
        {securityOpen && (
          <div className="p-4 border-t border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Two-Factor Authentication</p>
                <p className="text-[0.625rem] text-muted-foreground">Extra security with Google Authenticator</p>
              </div>
              <Badge className={twoFAEnabled ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[0.625rem]" : "bg-slate-500/15 text-emerald-100 border-slate-500/30 text-[0.625rem]"}>
                {twoFAEnabled ? "ENABLED" : "DISABLED"}
              </Badge>
            </div>

            {!twoFAEnabled && twoFASetupStep === "idle" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground space-y-1">
                  <p><strong>What is 2FA?</strong> Two-factor authentication adds an extra layer of security.</p>
                  <p>Even if someone gets your password, they can&apos;t sign in without your phone.</p>
                  <p><strong>How to set up:</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Install Google Authenticator on your phone</li>
                    <li>Click &quot;Start Setup&quot; below</li>
                    <li>Scan the QR code with the app</li>
                    <li>Enter the 6-digit code to verify</li>
                  </ol>
                </div>
                <Button onClick={handle2FASetup} disabled={twoFALoading} className="w-full bg-primary hover:bg-primary/90">
                  {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                  Start 2FA Setup
                </Button>
              </div>
            )}

            {twoFASetupStep === "setup" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">1. Scan this QR code with Google Authenticator</p>
                <div className="flex justify-center">
                  {twoFAQrCode && <img src={twoFAQrCode} alt="2FA QR Code" className="w-48 h-48 rounded-lg bg-white p-2" />}
                </div>
                <div className="text-center">
                  <p className="text-[0.625rem] text-muted-foreground">Or enter this code manually:</p>
                  <code className="text-xs bg-white/5 px-2 py-1 rounded font-mono break-all">{twoFASecret}</code>
                </div>
                <Separator className="bg-white/10" />
                <p className="text-xs text-muted-foreground">2. Enter the 6-digit code from your authenticator:</p>
                <Input
                  value={twoFAVerifyCode}
                  onChange={(e) => setTwoFAVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="h-11 bg-white/5 border-white/10 text-center text-lg tracking-[0.5em] font-mono"
                  maxLength={6}
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setTwoFASetupStep("idle")} className="flex-1 border-white/10">Cancel</Button>
                  <Button onClick={handle2FAVerify} disabled={twoFAVerifyCode.length !== 6 || twoFALoading} className="flex-1 bg-primary">
                    {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Enable"}
                  </Button>
                </div>
              </div>
            )}

            {twoFASetupStep === "done" && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                ✅ 2FA is now enabled! You&apos;ll need your authenticator code every time you sign in.
              </div>
            )}

            {twoFAEnabled && (
              <div className="space-y-3">
                <Separator className="bg-white/10" />
                <p className="text-xs font-medium text-destructive">Disable 2FA</p>
                <p className="text-[0.625rem] text-muted-foreground">Enter your current authenticator code to disable</p>
                <Input
                  value={twoFADisableCode}
                  onChange={(e) => setTwoFADisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter code to disable"
                  className="h-10 bg-white/5 border-white/10 text-center tracking-widest font-mono"
                  maxLength={6}
                />
                <Button variant="destructive" onClick={handle2FADisable} disabled={twoFADisableCode.length !== 6 || twoFALoading} className="w-full">
                  {twoFALoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Disable 2FA
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== TUTORIAL ====== */}
      <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
        <button onClick={() => toggleSection("tutorial")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />Tutorial & Help</h3>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("tutorial") ? "rotate-90" : ""}`} />
        </button>
        {openSections.has("tutorial") && (
          <div className="px-4 pb-4 border-t border-white/5">
            <div className="pt-3 mb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Learn how to use HERO Sidekick effectively</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-[0.625rem] border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => {
                    onReplayOnboarding?.();
                  }}
                >
                  <Play className="h-3 w-3" />Replay Onboarding
                </Button>
              </div>
            </div>
            <TutorialSection />
          </div>
        )}
      </div>

      {/* ====== CHANGELOG ====== */}
      <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
        <button onClick={() => toggleSection("changelog")} className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
          <h3 className="font-semibold flex items-center gap-2"><History className="h-5 w-5 text-primary" />Changelog</h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[0.625rem] border-primary/30 text-primary px-2 py-0">v1.28</Badge>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.has("changelog") ? "rotate-90" : ""}`} />
          </div>
        </button>
        {openSections.has("changelog") && (
          <div className="px-4 pb-4 border-t border-white/5">
            <div className="pt-3 mb-4">
              <p className="text-xs text-muted-foreground">Track what's new in HERO Sidekick. Current version: <span className="text-primary font-semibold">v1.28</span></p>
            </div>
            <div className="space-y-4">
              {CHANGELOG.map((entry, idx) => (
                <div key={entry.version} className="relative">
                  {/* Timeline line */}
                  {idx < CHANGELOG.length - 1 && (
                    <div className="absolute left-[11px] top-8 bottom-0 w-px bg-white/10" />
                  )}
                  <div className="flex gap-3">
                    {/* Version dot */}
                    <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5 ${
                      idx === 0
                        ? "bg-primary/20 border-2 border-primary"
                        : "bg-white/5 border border-white/20"
                    }`}>
                      <Tag className={`h-3 w-3 ${idx === 0 ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold ${idx === 0 ? "text-primary" : "text-foreground"}`}>{entry.version}</span>
                        <span className="text-[0.625rem] text-muted-foreground">{entry.date}</span>
                        {idx === 0 && (
                          <Badge className="text-[0.625rem] px-1.5 py-0 h-4 bg-primary/20 text-primary border-primary/30">Latest</Badge>
                        )}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">{entry.title}</p>

                      {/* Highlights */}
                      <div className="mt-2 space-y-1">
                        {entry.highlights.map((h, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Sparkles className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                            <span className="text-xs text-foreground/90">{h}</span>
                          </div>
                        ))}
                      </div>

                      {/* Expandable changes */}
                      <ChangelogChanges version={entry.version} changes={entry.changes} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function ChangelogChanges({ version, changes }: { version: string; changes: readonly string[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide details" : `${changes.length} changes`}
      </button>
      {expanded && (
        <div className="mt-1.5 pl-1 space-y-1 border-l-2 border-white/5">
          {changes.map((c, i) => (
            <div key={i} className="flex items-start gap-2 pl-3">
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground">{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

