"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { Clock, MapPin, Phone, Building2, AlertCircle, Zap, RotateCcw, Trash2, MessageCircle, X, Calendar, MapPinOff, Siren, StickyNote, Pencil, Send, CheckCircle, CheckCircle2, Shield, ShieldCheck, CalendarDays, ArrowRightLeft, XCircle, User as UserIcon, Save, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { Order, Holiday, OffDay, HeroOption, UserZoneData, WhatsAppTemplate } from "@/types/page";
import { WHATSAPP_VARIABLES, DEFAULT_WHATSAPP_TEMPLATES } from "@/types/page";
import { ZONES, SIZE_CONFIG, STATUS_CONFIG, MAX_DAILY_POINTS, getZoneName } from "@/lib/zones";
import { formatPhoneForWhatsApp, fillTemplate } from "@/lib/whatsapp";
import { formatEventType, ZoneBadge, StatusBadge } from "@/components/ui/shared-badges";
import { MiniCalendar } from "@/components/mini-calendar";

// ============ ORDER CARD ============
export function OrderCard({ order, compact, onRefresh, holidays, offDays, isAdminView, heroes, onReassign, userZones, disabledZones, selected, onToggleSelect, onShowTimeline }: { order: Order; compact?: boolean; onRefresh: () => void; holidays?: Holiday[]; offDays?: OffDay[]; isAdminView?: boolean; heroes?: HeroOption[]; onReassign?: (orderId: string, targetHeroId: string) => Promise<void>; userZones?: UserZoneData[]; disabledZones?: number[]; selected?: boolean; onToggleSelect?: () => void; onShowTimeline?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDateDialog, setShowDateDialog] = useState(false);
  const [showPointsDialog, setShowPointsDialog] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showSosDialog, setShowSosDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({ customerName: "", phone: "", address: "", city: "", notes: "", isOffice: false });
  const [waMessage, setWaMessage] = useState("");
  const [waSelectedTemplate, setWaSelectedTemplate] = useState<string>("");
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([]);
  const [waPhonePrefix, setWaPhonePrefix] = useState("60");
  const [newDate, setNewDate] = useState(order.scheduledDate || "");
  const [newPoints, setNewPoints] = useState(order.points.toString());
  const [newNotes, setNewNotes] = useState(order.notes || "");
  const [sosNote, setSosNote] = useState("");
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [reassignTargetId, setReassignTargetId] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);

  // Optimistic status: reflect the change in the badge instantly without waiting
  // for the PATCH round-trip + 300ms debounced refetch (which feels laggy on real
  // networks / production builds). Cleared once the refetched order.status catches up.
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  useEffect(() => { setOptimisticStatus(null); }, [order.status]);
  const displayStatus = optimisticStatus ?? order.status;

  const updateStatus = async (newStatus: string) => {
    setLoading(true);
    setOptimisticStatus(newStatus); // instant UI feedback
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) {
        setOptimisticStatus(null); // revert on failure
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed", description: (err as Record<string, string>).error || `Server error ${res.status}`, variant: "destructive" });
        return;
      }
      toast({ title: `${order.orderId} → ${newStatus}` });
      onRefresh();
    } catch { setOptimisticStatus(null); toast({ title: "Network error", description: "Could not reach server. Check your connection.", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const deleteOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Failed to delete", description: (err as Record<string, string>).error || "Unknown error", variant: "destructive" });
        return;
      }
      toast({ title: `${order.orderId} deleted` });
      onRefresh();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setLoading(false); setShowDeleteConfirm(false); }
  };

  const changeDate = async () => {
    if (!newDate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledDate: newDate }) });
      if (!res.ok) throw new Error();
      toast({ title: `${order.orderId} rescheduled to ${format(parseISO(newDate), "dd MMM yyyy (EEE)")}` });
      onRefresh();
    } catch { toast({ title: "Failed to reschedule", variant: "destructive" }); }
    finally { setLoading(false); setShowDateDialog(false); }
  };

  const clearDate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledDate: null }) });
      if (!res.ok) throw new Error();
      toast({ title: `Date cleared for ${order.orderId}` });
      onRefresh();
    } catch { toast({ title: "Failed to clear date", variant: "destructive" }); }
    finally { setLoading(false); setShowDateDialog(false); }
  };

  const changePoints = async () => {
    const pts = parseInt(newPoints);
    if (isNaN(pts) || pts < 1 || pts > 20) {
      toast({ title: "Points must be between 1 and 20", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: pts }) });
      if (!res.ok) throw new Error();
      toast({ title: `${order.orderId} points changed to ${pts}` });
      onRefresh();
    } catch { toast({ title: "Failed to change points", variant: "destructive" }); }
    finally { setLoading(false); setShowPointsDialog(false); }
  };

  const changeNotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: newNotes }) });
      if (!res.ok) throw new Error();
      toast({ title: `${order.orderId} notes updated` });
      onRefresh();
    } catch { toast({ title: "Failed to update notes", variant: "destructive" }); }
    finally { setLoading(false); setShowNotesDialog(false); }
  };

  const submitSos = async () => {
    if (!sosNote.trim()) {
      toast({ title: "Please provide a reason for SOS", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, sosNote: sosNote.trim() }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast({ title: `SOS sent for ${order.orderId}`, description: "Other drivers will be notified" });
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "SOS failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally { setLoading(false); setShowSosDialog(false); setSosNote(""); }
  };

  const nextStatus: Record<string, string | null> = { PENDING: "SCHEDULED", SCHEDULED: "CONFIRMED", CONFIRMED: "BOOKED", BOOKED: "COMPLETED" };
  const ns = nextStatus[displayStatus];
  // UI-side transition map — any status can be changed to any other status.
  // This gives full flexibility: cancel from any state, restore from cancel to any state.
  const ALL_STATUSES = ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"];
  const VALID_TRANSITIONS_UI: Record<string, string[]> = {
    PENDING: ["SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"],
    SCHEDULED: ["PENDING", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"],
    CONFIRMED: ["PENDING", "SCHEDULED", "BOOKED", "COMPLETED", "CANCELED"],
    BOOKED: ["PENDING", "SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELED"],
    COMPLETED: ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "CANCELED"],
    CANCELED: ["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED"],
  };
  const z = ZONES[order.zone];
  const sizeConf = SIZE_CONFIG[order.size] || SIZE_CONFIG.S;
  const canDelete = displayStatus !== "COMPLETED" || isAdminView;
  const canChangeDate = ["PENDING", "SCHEDULED", "CONFIRMED"].includes(displayStatus);
  const canSos = ["PENDING", "SCHEDULED"].includes(displayStatus);
  const canReassign = isAdminView && heroes && heroes.length > 0 && displayStatus !== "COMPLETED" && onReassign;

  return (
    <div role="button" tabIndex={0} aria-label={`Order ${order.orderId} timeline`} className={`card-touch rounded-xl border p-2.5 sm:p-3 ${z?.bgColor || "bg-white/5"} ${z?.borderColor || "border-white/10"} backdrop-blur-sm transition-all active:scale-[0.995] ${selected ? "ring-2 ring-primary/50 border-primary/30" : ""}`} onClick={(e) => { const t = e.target as HTMLElement; if (t.closest("button,a,input,select,textarea,[role=\"button\"],[data-no-timeline]")) return; onShowTimeline?.(); }} onKeyDown={(e) => { const t = e.target as HTMLElement; if (t.closest("button,a,input,select,textarea,[role=\"button\"],[data-no-timeline],[contenteditable]")) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onShowTimeline?.(); } }}>
      {onToggleSelect && (
        <div className="flex items-center gap-2 mb-2">
          <Checkbox checked={!!selected} onCheckedChange={onToggleSelect} className="h-4 w-4" />
          <span className="text-[0.625rem] text-muted-foreground">tSelect</span>
        </div>
      )}
      {isAdminView && order.user && (
        <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-white/5">
          <UserIcon className="h-3 w-3 text-muted-foreground" />
          <span className="text-[0.625rem] font-medium text-muted-foreground">{order.user.displayName || order.user.username}</span>
          {order.user.role === "ADMIN" && <span className="text-[0.625rem] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1">ADMIN</span>}
          {order.user.role === "SUPPORT" && <span className="text-[0.625rem] bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded px-1">SUPPORT</span>}
          {order.user.role === "HERO" && <span className="text-[0.625rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1">HERO</span>}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-foreground">{order.orderId}</span>
            {order.isEvent && (
              <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[0.625rem] h-4 px-1">📌 EVENT</Badge>
            )}
            {order.isEvent && order.eventType && (
              <Badge variant="outline" className="text-[0.625rem] h-4 border-amber-500/30 text-amber-400 px-1">{formatEventType(order.eventType)}</Badge>
              )}
            <ZoneBadge zone={order.zone} compact userZones={userZones} isDisabled={disabledZones?.includes(order.zone)} />{!order.latitude && (<span className="text-[0.625rem] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 ml-1" title="No GPS coordinates">⚠</span>)}
            <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
              <DialogTrigger asChild>
                <span data-no-timeline role="button" tabIndex={0} className="cursor-pointer hover:opacity-80 transition-opacity" onClick={(e) => e.stopPropagation()}><StatusBadge status={displayStatus} /></span>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Change Status</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <p className="text-sm text-muted-foreground">Set status for <span className="font-semibold text-foreground">{order.orderId}</span></p>
                  <div className="grid grid-cols-1 gap-2">
                    {(["PENDING", "SCHEDULED", "CONFIRMED", "BOOKED", "COMPLETED", "CANCELED"] as const).map(s => {
                      const conf = STATUS_CONFIG[s];
                      return (
                        <Button
                          key={s}
                          type="button"
                          variant={displayStatus === s ? "default" : "outline"}
                          className={`h-11 justify-start gap-2 text-sm font-medium ${displayStatus === s ? "bg-primary text-primary-foreground" : `${conf?.bgColor || "bg-white/5"} ${conf?.color || "text-foreground"} ${conf?.borderColor || "border-white/10"} border hover:bg-white/10`}`}
                          onClick={() => { updateStatus(s); setShowStatusDialog(false); }}
                          disabled={loading || (s !== "CANCELED" && VALID_TRANSITIONS_UI[displayStatus]?.includes(s) === false && displayStatus !== s)}
                        >
                          {s === "PENDING" && <Clock className="h-4 w-4" />}
                          {s === "SCHEDULED" && <Calendar className="h-4 w-4" />}
                          {s === "CONFIRMED" && <CheckCircle2 className="h-4 w-4" />}
                          {s === "BOOKED" && <Building2 className="h-4 w-4" />}
                          {s === "COMPLETED" && <CheckCircle className="h-4 w-4" />}
                          {s === "CANCELED" && <XCircle className="h-4 w-4" />}
                          {conf?.label || s}
                          {displayStatus === s && <span className="ml-auto text-xs opacity-70">Current</span>}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showPointsDialog} onOpenChange={(open) => { setShowPointsDialog(open); if (open) setNewPoints(order.points.toString()); }}>
              <DialogTrigger asChild>
                <span data-no-timeline role="button" tabIndex={0} className={`text-[0.75rem] font-semibold ${sizeConf.color} cursor-pointer hover:underline underline-offset-2 decoration-dotted inline-flex items-center gap-0.5`} title="Click to change points" onClick={(e) => e.stopPropagation()}>
                  {order.size}({order.points}pt)<Pencil className="h-2.5 w-2.5 opacity-50" />
                </span>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Change Points</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">Set custom points for <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Size: <span className={`font-semibold ${sizeConf.color}`}>{order.size}</span></span>
                    <span>·</span>
                    <span>Default: <span className="font-semibold">{SIZE_CONFIG[order.size]?.points ?? 1}pt</span></span>
                    <span>·</span>
                    <span>Current: <span className="font-semibold text-foreground">{order.points}pt</span></span>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">New points value (1–{MAX_DAILY_POINTS})</Label>
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: MAX_DAILY_POINTS }, (_, i) => i + 1).map(p => (
                        <Button
                          key={p}
                          type="button"
                          variant={newPoints === p.toString() ? "default" : "outline"}
                          size="sm"
                          className={`h-9 ${newPoints === p.toString() ? "bg-primary text-primary-foreground" : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"}`}
                          onClick={() => setNewPoints(p.toString())}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={changePoints} disabled={loading || newPoints === order.points.toString()} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Zap className="h-4 w-4" />{loading ? "Saving..." : "Update Points"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {order.isOffice && (
              <span className="inline-flex items-center gap-0.5 rounded-md border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 text-[0.75rem] font-medium text-orange-400">
                <Building2 className="h-3 w-3" />Office
              </span>
            )}
          </div>
          {!compact && (
            <>
              <p className="text-base sm:text-sm mt-1 font-medium text-foreground/90">{order.customerName}</p>
              <p className="text-sm sm:text-xs text-muted-foreground flex items-center gap-1">
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address + ', ' + order.city + ', Malaysia')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors" title="Open in Google Maps">
                  <MapPin className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  {order.address}, {order.city}
                </a>
              </p>
              <p className="text-sm sm:text-xs text-muted-foreground flex items-center gap-1">
                <a href={`https://wa.me/60${order.phone?.replace(/[^0-9]/g, '').replace(/^0/, '')}?text=Hi ${encodeURIComponent(order.customerName)}, regarding your e-waste pickup (${order.orderId})`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground transition-colors" title="Chat on WhatsApp">
                  <Phone className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  {order.phone}
                </a>
              </p>
              {order.scheduledDate && (
                <p className="text-sm sm:text-xs text-emerald-400 flex items-center gap-1 mt-1">
                  <Calendar className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                  {format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)")}
                </p>
              )}
              {order.addressVerified ? (
                <span className="text-xs sm:text-[0.625rem] text-emerald-400 flex items-center gap-0.5 mt-0.5"><ShieldCheck className="h-3.5 w-3.5 sm:h-3 sm:w-3" />Verified</span>
              ) : (
                <button onClick={async (e) => { e.stopPropagation(); setVerifying(true); try { const r = await fetch("/api/orders/verify-address", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({orderId: order.id}) }); if(!r.ok) throw new Error(); onRefresh(); } catch{ toast({title:"Verify failed", variant:"destructive"}); } finally { setVerifying(false); } }} className="text-xs sm:text-[0.625rem] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mt-0.5 hover:underline" disabled={verifying}>
                  <Shield className="h-3.5 w-3.5 sm:h-3 sm:w-3" />{verifying ? "Verifying..." : "Verify"}
                </button>
              )}
              {order.notes && (
                <div
                  className="text-sm sm:text-xs text-muted-foreground mt-1 italic cursor-pointer hover:text-foreground transition-colors flex items-center gap-1 group"
                  onClick={() => { setShowNotesDialog(true); setNewNotes(order.notes || ""); }}
                  title="Click to edit notes"
                >
                  <StickyNote className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" />
                  <span className="line-clamp-2">{order.notes}</span>
                  <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50 shrink-0" />
                </div>
              )}
            </>
          )}
          {compact && <p className="text-xs text-muted-foreground mt-0.5">{order.customerName} · {order.city}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(displayStatus === "SCHEDULED" || displayStatus === "CONFIRMED" || displayStatus === "BOOKED" || displayStatus === "COMPLETED") && (
            <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15" onClick={() => {
              // Load templates and open dialog
              fetch("/api/settings").then(r => r.json()).then(s => {
                const templates: WhatsAppTemplate[] = s.whatsappTemplates ? JSON.parse(s.whatsappTemplates) : DEFAULT_WHATSAPP_TEMPLATES;
                const prefix = s.whatsappPhonePrefix || "60";
                setWaTemplates(templates);
                setWaPhonePrefix(prefix);
                const defaultTmpl = templates.find(t => t.isDefault) || templates[0];
                setWaSelectedTemplate(defaultTmpl.id);
                setWaMessage(fillTemplate(defaultTmpl.message, order));
                setShowWhatsAppDialog(true);
              }).catch(() => {
                setWaTemplates(DEFAULT_WHATSAPP_TEMPLATES);
                setWaPhonePrefix("60");
                setWaSelectedTemplate(DEFAULT_WHATSAPP_TEMPLATES[0].id);
                setWaMessage(fillTemplate(DEFAULT_WHATSAPP_TEMPLATES[0].message, order));
                setShowWhatsAppDialog(true);
              });
            }} title="WhatsApp">
              <MessageCircle className="h-5 w-5" />
            </Button>
          )}
          {canChangeDate && (
            <Dialog open={showDateDialog} onOpenChange={(open) => { setShowDateDialog(open); if (open) setNewDate(order.scheduledDate || ""); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-amber-400 hover:text-amber-300 hover:bg-amber-500/15" title="Change date">
                  <CalendarDays className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Reschedule Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">Change date for <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}</p>
                  {order.scheduledDate && (
                    <p className="text-xs text-muted-foreground">Current: {format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)")}</p>
                  )}
                  <MiniCalendar
                    selectedDate={newDate}
                    onSelectDate={setNewDate}
                    holidays={holidays}
                    offDays={offDays}
                    isOffice={order.isOffice}
                  />
                  {newDate && newDate !== order.scheduledDate && (
                    <p className="text-xs text-primary font-medium text-center">→ {format(parseISO(newDate), "dd MMM yyyy (EEE)")}</p>
                  )}
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" className="border-white/10 bg-white/5" onClick={clearDate} disabled={loading || !order.scheduledDate}>
                    <X className="h-4 w-4" />{loading ? "Saving..." : "Clear Date"}
                  </Button>
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={changeDate} disabled={loading || !newDate} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <CalendarDays className="h-4 w-4" />{loading ? "Saving..." : "Reschedule"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {!compact && (
            <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-sky-400 hover:text-sky-300 hover:bg-sky-500/15" title="Edit notes">
                  <StickyNote className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Edit Notes</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">Notes for <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}</p>
                  <Textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder="Add notes, special instructions, Encore import notes..."
                    className="h-28 text-sm bg-white/5 border-white/10"
                  />
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={changeNotes} disabled={loading} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <StickyNote className="h-4 w-4" />{loading ? "Saving..." : "Save Notes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canSos && (
            <Dialog open={showSosDialog} onOpenChange={setShowSosDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/15" title="SOS — Request help from other drivers">
                  <Siren className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-foreground flex items-center gap-2"><Siren className="h-5 w-5 text-red-400" />SOS Request</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">Send an SOS for <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}. Other drivers will see this and can take the order.</p>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Why do you need help? *</Label>
                    <Textarea
                      value={sosNote}
                      onChange={e => setSosNote(e.target.value)}
                      placeholder="E.g. Too far from my area, schedule conflict, vehicle issue..."
                      className="h-24 text-sm bg-white/5 border-white/10"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={submitSos} disabled={loading || !sosNote.trim()} className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                    <Siren className="h-4 w-4" />{loading ? "Sending..." : "Send SOS"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {!compact && (
            <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (open) setEditForm({ customerName: order.customerName, phone: order.phone, address: order.address, city: order.city, notes: order.notes || "", isOffice: !!order.isOffice }); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-sky-400 hover:text-sky-300 hover:bg-sky-500/15" title="Edit order">
                  <Pencil className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Edit Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">Editing <span className="font-semibold text-foreground">{order.orderId}</span></p>
                  {order.addressVerified && <p className="text-xs text-amber-400">Changing the address below will trigger re-verification.</p>}
                  <div>
                    <Label className="text-xs text-muted-foreground">Order ID</Label>
                    <Input value={order.orderId} disabled className="h-11 bg-white/5 border-white/10 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Customer Name</Label>
                    <Input value={editForm.customerName} onChange={e => setEditForm(f => ({ ...f, customerName: e.target.value }))} className="h-12 sm:h-11 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="h-11 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="h-11 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">City</Label>
                    <Input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} className="h-11 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="bg-white/5 border-white/10" rows={3} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                    <div>
                      <Label className="text-sm flex items-center gap-1.5"><Building2 className="h-4 w-4 text-amber-400" />Office Location</Label>
                      <p className="text-[0.625rem] text-muted-foreground">Tag this pickup as an office (no weekend/holiday scheduling)</p>
                    </div>
                    <Switch checked={editForm.isOffice} onCheckedChange={(v) => setEditForm(f => ({ ...f, isOffice: v }))} />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={async () => {
                    setLoading(true);
                    try {
                      const body: Record<string, unknown> = {};
                      if (editForm.customerName !== order.customerName) body.customerName = editForm.customerName;
                      if (editForm.phone !== order.phone) body.phone = editForm.phone;
                      if (editForm.address !== order.address) body.address = editForm.address;
                      if (editForm.city !== order.city) body.city = editForm.city;
                      if (editForm.notes !== (order.notes || "")) body.notes = editForm.notes;
                      if (editForm.isOffice !== !!order.isOffice) body.isOffice = editForm.isOffice;
                      if (Object.keys(body).length === 0) { toast({ title: "No changes made" }); setShowEditDialog(false); return; }
                      const res = await fetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                      if (!res.ok) throw new Error();
                      toast({ title: "Order updated" });
                      setShowEditDialog(false);
                      // If address or city changed, trigger re-verification
                      if (body.address || body.city) {
                        try {
                          const vr = await fetch("/api/orders/verify-address", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id }) });
                          if (vr.ok) toast({ title: "Address re-verified" });
                        } catch { /* silent */ }
                      }
                      onRefresh();
                    } catch { toast({ title: "Failed to update order", variant: "destructive" }); }
                    finally { setLoading(false); }
                  }} disabled={loading} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Save className="h-4 w-4" />{loading ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {onShowTimeline && (
            <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/15" onClick={(e) => { e.stopPropagation(); onShowTimeline(); }} title="Audit trail">
              <History className="h-5 w-5" />
            </Button>
          )}
          {canDelete && (
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-destructive hover:bg-destructive/15" title="Delete">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Delete Order</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground py-2">
                  Are you sure you want to delete <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}? This cannot be undone.
                </p>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button onClick={deleteOrder} disabled={loading} variant="destructive" className="gap-2">
                    <Trash2 className="h-4 w-4" />{loading ? "Deleting..." : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canReassign && (
            <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-11 w-11 p-0 text-primary hover:text-primary hover:bg-primary/10" title="Reassign to another hero">
                  <ArrowRightLeft className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-foreground flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" />Reassign Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">
                    Reassign <span className="font-semibold text-foreground">{order.orderId}</span> — {order.customerName}
                    {order.user && <span className="text-xs"> (from <span className="text-amber-400 font-medium">{order.user.displayName || order.user.username}</span>)</span>}
                  </p>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Assign to Hero</Label>
                    <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
                      <SelectTrigger className="bg-white/5 border-white/10 h-10">
                        <SelectValue placeholder="Select a hero..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-white/10">
                        {heroes!.filter(h => h.id !== order.user?.id).map(h => (
                          <SelectItem key={h.id} value={h.id}>{h.displayName || h.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
                  </DialogClose>
                  <Button
                    onClick={async () => {
                      if (!reassignTargetId || !onReassign) return;
                      setReassignLoading(true);
                      try {
                        await onReassign(order.id, reassignTargetId);
                        setShowReassignDialog(false);
                        setReassignTargetId("");
                      } finally {
                        setReassignLoading(false);
                      }
                    }}
                    disabled={reassignLoading || !reassignTargetId}
                    className="gap-2 bg-primary hover:bg-primary/90 text-white"
                  >
                    <ArrowRightLeft className="h-4 w-4" />{reassignLoading ? "Reassigning..." : "Reassign"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* WhatsApp Message Editor Dialog */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent className="bg-card border-white/10 sm:max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-400" />
              WhatsApp — {order.customerName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Template Selector */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Message Template</Label>
              <Select value={waSelectedTemplate} onValueChange={(val) => {
                setWaSelectedTemplate(val);
                const tmpl = waTemplates.find(t => t.id === val);
                if (tmpl) setWaMessage(fillTemplate(tmpl.message, order));
              }}>
                <SelectTrigger className="bg-white/5 border-white/10 h-10">
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-white/10">
                  {waTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        {t.name}
                        {t.isDefault && <span className="text-[0.625rem] text-primary">(default)</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Message Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs text-muted-foreground">Message</Label>
                <span className="text-[0.625rem] text-muted-foreground">{waMessage.length} chars</span>
              </div>
              <Textarea
                value={waMessage}
                onChange={e => setWaMessage(e.target.value)}
                className="min-h-[120px] text-sm bg-white/5 border-white/10 resize-y"
                placeholder="Type your message..."
              />
              <p className="text-[0.625rem] text-muted-foreground mt-1">Edit the message above before sending. Template variables have been filled in.</p>
            </div>

            {/* Quick Variable Insert */}
            <details className="text-[0.625rem] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors text-xs">Insert Variable</summary>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {WHATSAPP_VARIABLES.map(v => (
                  <button
                    key={v.key}
                    className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 text-[0.625rem] transition-colors"
                    onClick={() => {
                      const filled = v.key === "{date}"
                        ? (order.scheduledDate ? format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)") : "TBD")
                        : v.key === "{customerName}" ? order.customerName
                        : v.key === "{address}" ? order.address
                        : v.key === "{phone}" ? order.phone
                        : v.key === "{orderId}" ? order.orderId
                        : v.key === "{size}" ? order.size
                        : v.key === "{points}" ? order.points.toString()
                        : v.key === "{city}" ? order.city
                        : v.key === "{notes}" ? (order.notes || "N/A")
                        : "";
                      setWaMessage(prev => prev + filled);
                    }}
                    title={`${v.label} (e.g. ${v.example})`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </details>

            {/* Order Info Summary */}
            <div className="rounded-lg bg-white/5 border border-white/5 p-3 space-y-1">
              <p className="text-[0.625rem] text-muted-foreground font-semibold uppercase tracking-wider">Order Details</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Order:</span><span className="text-foreground font-medium">{order.orderId}</span>
                <span className="text-muted-foreground">Customer:</span><span className="text-foreground">{order.customerName}</span>
                <span className="text-muted-foreground">Phone:</span><span className="text-foreground">{order.phone}</span>
                <span className="text-muted-foreground">Date:</span><span className="text-foreground">{order.scheduledDate ? format(parseISO(order.scheduledDate), "dd MMM yyyy (EEE)") : "TBD"}</span>
                <span className="text-muted-foreground">Size:</span><span className="text-foreground">{order.size} ({order.points}pt)</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => {
                const phone = formatPhoneForWhatsApp(order.phone, waPhonePrefix);
                const url = `https://wa.me/${phone}?text=${encodeURIComponent(waMessage)}`;
                window.open(url, "_blank");
                setShowWhatsAppDialog(false);
              }}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="h-4 w-4" />Open WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}