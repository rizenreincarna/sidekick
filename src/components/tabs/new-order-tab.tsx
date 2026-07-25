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

export function NewOrderTab({ onRefresh, onVerifyStart }: { onRefresh: () => void; onVerifyStart?: (sessionId: string) => void; onGeocodeStart?: (sessionId: string) => void }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const isSupportOrAdmin = session?.user?.role === "SUPPORT" || session?.user?.role === "ADMIN";
  const { data: heroes } = useFetchData<HeroOption[]>(isSupportOrAdmin ? "/api/heroes" : "");
  const [assignToUserId, setAssignToUserId] = useState<string>("");
  const [isEventOrder, setIsEventOrder] = useState(false);
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [isErthboxOrder, setIsErthboxOrder] = useState(false);
  const [erthboxLocationId, setErthboxLocationId] = useState("");
  const [erthboxSearch, setErthboxSearch] = useState("");
  const { data: erthboxLocations } = useFetchData<ErthboxLocation[]>("/api/erthbox");
  const [form, setForm] = useState({
    orderId: "", customerName: "", phone: "", address: "", city: "", size: "M", points: 2, isOffice: false, notes: "",
  });
  const [importing, setImporting] = useState(false);

  const handleSizeChange = (newSize: string) => {
    const defaultPts = SIZE_CONFIG[newSize]?.points ?? 2;
    setForm(prev => ({ ...prev, size: newSize, points: defaultPts }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: Record<string, unknown> = { ...form };
      if (isEventOrder) {
        body.isEvent = true;
        body.eventType = eventType || "OTHER";
        body.orderId = ""; // backend will auto-generate EVENT-XXX
        body.phone = "N/A";
        if (!form.address.trim()) body.address = "N/A";
        if (eventDate) body.scheduledDate = eventDate;
      }
      if (isErthboxOrder) {
        body.isErthbox = true;
        body.erthboxLocationId = erthboxLocationId;
        body.orderId = ""; // backend will auto-generate ERTHBOX-XXX
        // Auto-populate from selected location
        const loc = erthboxLocations?.find(l => l.id === erthboxLocationId);
        if (loc) {
          if (!form.customerName.trim()) body.customerName = loc.name;
          if (!form.phone.trim()) body.phone = loc.picPhone;
          if (!form.address.trim()) body.address = loc.address;
          if (!form.city.trim()) body.city = loc.city;
        }
      }
      if (isSupportOrAdmin && assignToUserId && assignToUserId !== "__self__") body.assignToUserId = assignToUserId;
      const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const order = await res.json();
      toast({ title: isEventOrder ? `Event ${order.orderId} created!` : isErthboxOrder ? `ERTHBOX ${order.orderId} created!` : `Order ${form.orderId} added!`, description: `Auto-detected: Zone ${order.zone} (${getZoneName(order.zone)})${assignToUserId && assignToUserId !== "__self__" ? " → Assigned to hero" : ""}` });
      // Show duplicate warning if present
      if (order._warning) {
        toast({ title: "⚠️ Duplicate Warning", description: order._warning, variant: "destructive" });
      }
      setForm({ orderId: "", customerName: "", phone: "", address: "", city: "", size: "S", points: 1, isOffice: false, notes: "" });
      setAssignToUserId("");
      setEventType("");
      setEventDate("");
      setIsEventOrder(false);
      setIsErthboxOrder(false);
      setErthboxLocationId("");
      onRefresh();
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed to add order", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-xl border border-primary/20 bg-card earth-glow p-6">
        <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Plus className="h-5 w-5 text-primary" />New Pickup Order</h3>
        {/* Event Toggle */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <Switch id="event-toggle" checked={isEventOrder} onCheckedChange={(v) => { setIsEventOrder(v); if (v) setIsErthboxOrder(false); }} />
          <Label htmlFor="event-toggle" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">📌 Event Order</Label>
          {isEventOrder && <span className="text-[0.625rem] text-amber-400 ml-auto">Event orders auto-generate Order ID</span>}
        </div>
        {/* ERTHBOX Toggle */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
          <Switch id="erthbox-toggle" checked={isErthboxOrder} onCheckedChange={(v) => { setIsErthboxOrder(v); if (v) setIsEventOrder(false); if (!v) setErthboxSearch(""); }} />
          <Label htmlFor="erthbox-toggle" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">📦 ERTHBOX Collection</Label>
          {isErthboxOrder && <span className="text-[0.625rem] text-emerald-400 ml-auto">ERTHBOX orders auto-generate Order ID</span>}
        </div>
        {/* ERTHBOX Location Selector */}
        {isErthboxOrder && (
          <div className="mb-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 space-y-3">
            <div>
              <Label className="text-xs text-emerald-300 mb-1.5 block font-medium">Select ERTHBOX Location *</Label>
              {erthboxLocationId && (() => {
                const loc = erthboxLocations?.find(l => l.id === erthboxLocationId);
                if (loc) return (
                  <div className="flex items-center gap-2 mb-2 p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                    <Package className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-emerald-300">{loc.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {loc.city}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setErthboxLocationId(""); setErthboxSearch(""); }}><X className="h-3 w-3" /></Button>
                  </div>
                );
                return null;
              })()}
              {!erthboxLocationId && (
                <>
                  <div className="relative mb-1.5">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={erthboxSearch}
                      onChange={e => setErthboxSearch(e.target.value)}
                      placeholder="Search locations by name, city, or address..."
                      className="h-9 pl-8 text-xs bg-white/5 border-white/10 border-emerald-500/30"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                    {(() => {
                      const activeLocs = erthboxLocations?.filter(l => l.isActive) || [];
                      const filtered = erthboxSearch.trim()
                        ? activeLocs.filter(l =>
                            l.name.toLowerCase().includes(erthboxSearch.toLowerCase()) ||
                            l.city.toLowerCase().includes(erthboxSearch.toLowerCase()) ||
                            l.address.toLowerCase().includes(erthboxSearch.toLowerCase())
                          )
                        : activeLocs;
                      if (filtered.length === 0) return (
                        <p className="text-[0.625rem] text-muted-foreground text-center py-3">
                          {activeLocs.length === 0 ? "No ERTHBOX locations added yet. Add them in Settings → Scheduling → ERTHBOX Manager." : "No locations match your search."}
                        </p>
                      );
                      return filtered.map(loc => (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => { setErthboxLocationId(loc.id); setErthboxSearch(""); }}
                          className="w-full text-left p-2.5 hover:bg-white/10 transition-colors border-b border-white/5 last:border-b-0"
                        >
                          <div className="flex items-center gap-2">
                            <Package className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <span className="text-xs font-medium text-foreground">{loc.name}</span>
                            <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-emerald-500/30 text-emerald-400">{loc.city}</Badge>
                            {loc.user && loc.user.id !== session?.user?.id && (
                              <Badge variant="outline" className="text-[0.625rem] h-4 px-1 border-white/10 text-muted-foreground">by {loc.user.displayName || loc.user.username}</Badge>
                            )}
                          </div>
                          <p className="text-[0.625rem] text-muted-foreground ml-5.5 mt-0.5">{loc.address}</p>
                        </button>
                      ));
                    })()}
                  </div>
                </>
              )}
            </div>
            {erthboxLocationId && (() => {
              const loc = erthboxLocations?.find(l => l.id === erthboxLocationId);
              if (!loc) return null;
              return (
                <div className="rounded-lg border border-emerald-500/20 bg-white/5 p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center gap-2"><MapPin className="h-3 w-3 text-emerald-400 shrink-0" /><span className="text-muted-foreground">{loc.address}, {loc.city}</span></div>
                  <div className="flex items-center gap-2"><UserIcon className="h-3 w-3 text-emerald-400 shrink-0" /><span className="text-muted-foreground">PIC: {loc.picName} ({loc.picPhone})</span></div>
                  {loc.notes && <div className="flex items-center gap-2"><StickyNote className="h-3 w-3 text-amber-400 shrink-0" /><span className="text-amber-300/80">{loc.notes}</span></div>}
                </div>
              );
            })()}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!isEventOrder && !isErthboxOrder && (
              <div><Label className="text-xs text-muted-foreground">Order ID *</Label><Input value={form.orderId} onChange={e => setForm({...form, orderId: e.target.value})} placeholder="ERTH-1234" className="h-11 bg-white/5 border-white/10" required /></div>
            )}
            <div><Label className="text-xs text-muted-foreground">{isEventOrder ? "Event Name *" : isErthboxOrder ? "Label (optional)" : "Customer Name *"}</Label><Input value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} placeholder={isEventOrder ? "e.g. Shah Alam Roadshow" : isErthboxOrder ? "e.g. Weekly collection" : "Ahmad"} className="h-11 bg-white/5 border-white/10" required={!isErthboxOrder} /></div>
            {isEventOrder && (
              <div>
                <Label className="text-xs text-muted-foreground">Event Type *</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROADSHOW">Roadshow</SelectItem>
                    <SelectItem value="EWASTE_COLLECTION">E-Waste Collection</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {!isEventOrder && !isErthboxOrder && (
              <div><Label className="text-xs text-muted-foreground">Phone *</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="0123456789" className="h-11 bg-white/5 border-white/10" required /></div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Size *</Label>
              <Select value={form.size} onValueChange={handleSizeChange}>
                <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">Small (1 pt)</SelectItem>
                  <SelectItem value="M">Medium (2 pts)</SelectItem>
                  <SelectItem value="L">Large (3 pts)</SelectItem>
                  <SelectItem value="XL">X-Large (4 pts)</SelectItem>
                  <SelectItem value="XXL">XX-Large (15 pts)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Points selector 1-MAX_DAILY_POINTS */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Points (1–{MAX_DAILY_POINTS}) — defaults from size, can override</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: MAX_DAILY_POINTS }, (_, i) => i + 1).map(p => (
                <Button
                  key={p}
                  type="button"
                  variant={form.points === p ? "default" : "outline"}
                  size="sm"
                  className={`h-12 text-sm font-semibold ${form.points === p ? "bg-primary text-primary-foreground" : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"}`}
                  onClick={() => setForm(prev => ({ ...prev, points: p }))}
                >
                  {p}
                </Button>
              ))}
            </div>
            <p className="text-[0.625rem] text-muted-foreground mt-1">
              Size {form.size} default: {SIZE_CONFIG[form.size]?.points ?? 2}pt — click any value to override
            </p>
          </div>
          <div><Label className="text-xs text-muted-foreground">Address {isEventOrder || isErthboxOrder ? "(optional — auto-filled from location)" : "*"}</Label><Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder={isEventOrder ? "Event location (optional)" : isErthboxOrder ? "Auto-filled from ERTHBOX location" : "Full pickup address"} className="h-11 bg-white/5 border-white/10" required={!isEventOrder && !isErthboxOrder} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label className="text-xs text-muted-foreground">City/Area {isErthboxOrder ? "(optional)" : "*"}</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder={isErthboxOrder ? "Auto-filled from location" : "e.g. Shah Alam"} className="h-11 bg-white/5 border-white/10" required={!isErthboxOrder} /></div>
            {isEventOrder ? (
              <div>
                <Label className="text-xs text-muted-foreground">Schedule Date *</Label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  required
                  className="flex h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            ) : (
              <div className="flex items-end gap-3 pb-1">
                {!isErthboxOrder && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="isOffice" checked={form.isOffice} onCheckedChange={c => setForm({...form, isOffice: !!c})} />
                    <Label htmlFor="isOffice" className="text-xs flex items-center gap-1 text-muted-foreground"><Building2 className="h-3 w-3" />Office Address</Label>
                  </div>
                )}
              </div>
            )}
          </div>
          <div><Label className="text-xs text-muted-foreground">Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Special instructions..." className="h-16 text-xs bg-white/5 border-white/10" /></div>
          {isSupportOrAdmin && heroes && heroes.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><UserIcon className="h-3 w-3" />Assign to Hero (optional)</Label>
              <Select value={assignToUserId} onValueChange={setAssignToUserId}>
                <SelectTrigger className="h-11 bg-white/5 border-white/10">
                  <SelectValue placeholder="Your account (default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__self__">Your account (default)</SelectItem>
                  {heroes.map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.displayName || h.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[0.625rem] text-muted-foreground mt-1">Leave default to create order under your account, or select a hero to assign.</p>
            </div>
          )}
          <Button type="submit" className={`w-full gap-2 h-14 font-semibold text-base px-4 py-3 ${isEventOrder ? "bg-amber-600 hover:bg-amber-700 text-white" : isErthboxOrder ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}>
            {isEventOrder ? <><Calendar className="h-5 w-5" /> Create Event</> : isErthboxOrder ? <><Package className="h-5 w-5" /> Create ERTHBOX</> : <><Plus className="h-5 w-5" /> Add Order</>}
          </Button>
        </form>
      </div>
    </div>
  );
}

