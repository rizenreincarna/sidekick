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

export function ErthboxManagerSection() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [locations, setLocations] = useState<ErthboxLocation[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<ErthboxLocation | null>(null);
  const [form, setForm] = useState({ name: "", address: "", city: "", picName: "", picPhone: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [managerSearch, setManagerSearch] = useState("");

  const isAdminOrSupport = session?.user?.role === "ADMIN" || session?.user?.role === "SUPPORT";

  const loadLocations = useCallback(() => {
    // Admin/Support: fetch all locations including inactive; Hero: fetch all active (universal)
    const url = isAdminOrSupport ? "/api/erthbox?all=true" : "/api/erthbox";
    fetch(url).then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setLocations(d); }).catch(() => {});
  }, [isAdminOrSupport]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.picName.trim() || !form.picPhone.trim()) {
      toast({ title: "Name, address, city, PIC name, and PIC phone are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/erthbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast({ title: `ERTHBOX location "${form.name}" added` });
      setForm({ name: "", address: "", city: "", picName: "", picPhone: "", notes: "" });
      setShowAddForm(false);
      loadLocations();
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed to add location", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleUpdate = async () => {
    if (!editingLocation) return;
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.picName.trim() || !form.picPhone.trim()) {
      toast({ title: "Name, address, city, PIC name, and PIC phone are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/erthbox/${editingLocation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast({ title: `ERTHBOX location "${form.name}" updated` });
      setEditingLocation(null);
      setForm({ name: "", address: "", city: "", picName: "", picPhone: "", notes: "" });
      loadLocations();
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed to update location", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/erthbox/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: `ERTHBOX location "${name}" deleted` });
      loadLocations();
    } catch { toast({ title: "Failed to delete", variant: "destructive" }); }
  };

  const handleToggleActive = async (loc: ErthboxLocation) => {
    try {
      const res = await fetch(`/api/erthbox/${loc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !loc.isActive }) });
      if (!res.ok) throw new Error();
      toast({ title: `"${loc.name}" ${loc.isActive ? "disabled" : "enabled"}` });
      loadLocations();
    } catch { toast({ title: "Failed to update", variant: "destructive" }); }
  };

  const startEdit = (loc: ErthboxLocation) => {
    setEditingLocation(loc);
    setForm({ name: loc.name, address: loc.address, city: loc.city, picName: loc.picName, picPhone: loc.picPhone, notes: loc.notes || "" });
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingLocation(null);
    setForm({ name: "", address: "", city: "", picName: "", picPhone: "", notes: "" });
  };

  // Check if user can edit/delete a location
  const canModify = (loc: ErthboxLocation) => {
    if (isAdminOrSupport) return true;
    return loc.userId === session?.user?.id;
  };

  // Filter locations by search
  const activeLocations = locations.filter(l => l.isActive);
  const inactiveLocations = locations.filter(l => !l.isActive);
  const filteredActive = managerSearch.trim()
    ? activeLocations.filter(l =>
        l.name.toLowerCase().includes(managerSearch.toLowerCase()) ||
        l.city.toLowerCase().includes(managerSearch.toLowerCase()) ||
        l.address.toLowerCase().includes(managerSearch.toLowerCase())
      )
    : activeLocations;
  const filteredInactive = managerSearch.trim()
    ? inactiveLocations.filter(l =>
        l.name.toLowerCase().includes(managerSearch.toLowerCase()) ||
        l.city.toLowerCase().includes(managerSearch.toLowerCase())
      )
    : inactiveLocations;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-emerald-400" />ERTHBOX Manager</h4>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[0.625rem] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" onClick={() => showAddForm ? cancelForm() : setShowAddForm(true)}>
          <PlusCircle className="h-3 w-3" />{showAddForm || editingLocation ? "Cancel" : "Add Location"}
        </Button>
      </div>
      <p className="text-[0.625rem] text-muted-foreground mb-3">Manage ERTHBOX collection locations. Locations are shared universally — any hero, admin, or support can use them when creating ERTHBOX orders. Only the owner, admin, or support can edit or delete.</p>

      {/* Add/Edit Form */}
      {(showAddForm || editingLocation) && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 mb-3 space-y-2">
          <p className="text-xs font-semibold text-emerald-400">{editingLocation ? "Edit Location" : "Add New Location"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Location name * (e.g. IKEA Damansara)" className="h-9 text-xs bg-white/5 border-white/10" />
            <Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="City/Area * (e.g. Petaling Jaya)" className="h-9 text-xs bg-white/5 border-white/10" />
          </div>
          <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Full address *" className="h-9 text-xs bg-white/5 border-white/10" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input value={form.picName} onChange={e => setForm({...form, picName: e.target.value})} placeholder="Person in Charge name *" className="h-9 text-xs bg-white/5 border-white/10" />
            <Input value={form.picPhone} onChange={e => setForm({...form, picPhone: e.target.value})} placeholder="PIC phone number *" className="h-9 text-xs bg-white/5 border-white/10" />
          </div>
          <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes (e.g. Mall area, cannot enter between 12PM-2PM)" className="h-16 text-xs bg-white/5 border-white/10" />
          <Button size="sm" className="h-9 gap-1 text-xs w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={editingLocation ? handleUpdate : handleAdd} disabled={loading}>
            {loading ? <><Loader2 className="h-3 w-3 animate-spin" />Saving...</> : editingLocation ? <><Pencil className="h-3 w-3" />Update Location</> : <><Plus className="h-3 w-3" />Add Location</>}
          </Button>
        </div>
      )}

      {/* Search bar */}
      {locations.length > 5 && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={managerSearch}
            onChange={e => setManagerSearch(e.target.value)}
            placeholder="Search locations..."
            className="h-8 pl-8 text-xs bg-white/5 border-white/10"
          />
        </div>
      )}

      {/* Location List */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {locations.length === 0 && !showAddForm && <p className="text-xs text-muted-foreground text-center py-3">No ERTHBOX locations yet. Add one to get started!</p>}
        {filteredActive.map(loc => (
          <div key={loc.id} className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Package className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-300">{loc.name}</span>
                  <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-emerald-500/30 text-emerald-400">{loc.city}</Badge>
                  {loc._count && <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-white/10 text-muted-foreground">{loc._count.orders} order{loc._count.orders !== 1 ? "s" : ""}</Badge>}
                  {loc.user && loc.userId !== session?.user?.id && (
                    <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-cyan-500/30 text-cyan-400">by {loc.user.displayName || loc.user.username}</Badge>
                  )}
                </div>
                <p className="text-[0.625rem] text-muted-foreground mt-0.5 ml-5.5 pl-0.5">{loc.address}</p>
                <div className="flex items-center gap-3 mt-0.5 ml-5.5 pl-0.5">
                  <span className="text-[0.625rem] text-muted-foreground flex items-center gap-1"><UserIcon className="h-2.5 w-2.5" />{loc.picName}</span>
                  <span className="text-[0.625rem] text-muted-foreground flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{loc.picPhone}</span>
                </div>
                {loc.notes && <p className="text-[0.625rem] text-amber-300/70 mt-0.5 ml-5.5 pl-0.5 flex items-center gap-1"><StickyNote className="h-2.5 w-2.5 shrink-0" />{loc.notes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canModify(loc) && (
                  <>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15" onClick={() => startEdit(loc)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/15" onClick={() => handleToggleActive(loc)} title="Disable location"><X className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/15" onClick={() => handleDelete(loc.id, loc.name)}><Trash2 className="h-3 w-3" /></Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredInactive.length > 0 && isAdminOrSupport && (
          <div className="pt-2">
            <p className="text-[0.625rem] text-muted-foreground mb-1">Disabled locations</p>
            {filteredInactive.map(loc => (
              <div key={loc.id} className="rounded-lg border border-white/5 bg-white/3 p-2 opacity-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.625rem] text-muted-foreground line-through">{loc.name} — {loc.city}</span>
                    {loc.user && (
                      <span className="text-[0.625rem] text-muted-foreground">by {loc.user.displayName || loc.user.username}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canModify(loc) && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15" onClick={() => handleToggleActive(loc)} title="Re-enable"><CheckCircle2 className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/15" onClick={() => handleDelete(loc.id, loc.name)}><Trash2 className="h-2.5 w-2.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

