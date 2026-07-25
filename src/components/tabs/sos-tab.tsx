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

export function SosTab({ onRefresh, onGoToOrders, userZones }: { onRefresh: () => void; onGoToOrders?: () => void; userZones?: UserZoneData[] }) {
  const { data: session } = useSession();
  const { data: sosRequests, refetch: refetchSos } = useFetchData<SOSRequest[]>("/api/sos");
  const { toast } = useToast();
  const [answering, setAnswering] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedHeroId, setSelectedHeroId] = useState<Record<string, string>>({});
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");

  const isSupportOrAdmin = session?.user?.role === "SUPPORT" || session?.user?.role === "ADMIN";
  const { data: heroes } = useFetchData<HeroOption[]>(isSupportOrAdmin ? "/api/heroes" : "");

  const handleAnswerSos = async (sosId: string) => {
    setAnswering(sosId);
    try {
      const res = await fetch(`/api/sos/${sosId}`, { method: "POST" });
      if (res.status === 409) {
        const d = await res.json();
        setConflictMessage(d.error || "This order already exists in the system.");
        setShowConflictDialog(true);
        return;
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      toast({ title: "SOS answered! Order transferred to you.", description: "Check your orders to schedule it." });
      refetchSos();
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Failed to answer SOS", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setAnswering(null);
    }
  };

  const handleAssignSos = async (sosId: string) => {
    const heroId = selectedHeroId[sosId];
    if (!heroId) {
      toast({ title: "Select a hero first", variant: "destructive" });
      return;
    }
    setAssigning(sosId);
    try {
      const res = await fetch(`/api/sos/${sosId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignToUserId: heroId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const heroName = heroes?.find(h => h.id === heroId)?.displayName || "hero";
      toast({ title: "SOS assigned!", description: `Order transferred to ${heroName}` });
      setSelectedHeroId(prev => { const next = { ...prev }; delete next[sosId]; return next; });
      refetchSos();
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Failed to assign SOS", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  const activeSos = (sosRequests || []).filter(s => s.status === "ACTIVE");

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* SOS Conflict Dialog */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="bg-card border-white/10">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-400" />Order Already Exists</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">This order already exists in your orders. Delete the existing order first before accepting this SOS.</p>
            {conflictMessage && <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">{conflictMessage}</p>}
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" className="border-white/10 bg-white/5">Cancel</Button>
            </DialogClose>
            <Button onClick={() => { setShowConflictDialog(false); onGoToOrders?.(); }} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
              <ClipboardList className="h-4 w-4" />Go to Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex items-center gap-3">
        <h3 className="font-semibold text-lg flex items-center gap-2"><Siren className="h-5 w-5 text-red-400" />SOS Requests</h3>
        {activeSos.length > 0 && (
          <Badge variant="destructive" className="animate-pulse">{activeSos.length} active</Badge>
        )}
      </div>

      {activeSos.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-8 text-center">
          <Siren className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No active SOS requests right now</p>
          <p className="text-xs text-muted-foreground mt-1">When other drivers need help, their requests appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeSos.map(sos => {
            const sizeConf = SIZE_CONFIG[sos.size] || SIZE_CONFIG.S;
            const fromUser = (sos as SOSRequest & { fromUser?: { id: string; username: string; displayName: string } }).fromUser;
            return (
              <div key={sos.id} className="rounded-xl border border-red-500/20 bg-red-500/5 bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="font-bold text-sm text-foreground">{sos.orderRef}</span>
                      <ZoneBadge zone={sos.zone} compact userZones={userZones} />
                      <span className={`text-[0.75rem] font-semibold ${sizeConf.color}`}>{sos.size}({sos.points}pt)</span>
                      {sos.isOffice && (
                        <span className="inline-flex items-center gap-0.5 rounded-md border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 text-[0.75rem] font-medium text-orange-400">
                          <Building2 className="h-3 w-3" />Office
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground/90">{sos.customerName}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{sos.address}, {sos.city}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{sos.phone}</p>
                    {fromUser && isSupportOrAdmin && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><UserIcon className="h-3 w-3" />From: {fromUser.displayName || fromUser.username}</p>
                    )}
                    {sos.notes && <p className="text-xs text-muted-foreground mt-1 italic flex items-center gap-1"><StickyNote className="h-3 w-3" />{sos.notes}</p>}
                    <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                      <p className="text-xs font-semibold text-red-300 flex items-center gap-1"><Siren className="h-3 w-3" />SOS Reason:</p>
                      <p className="text-xs text-red-200 mt-0.5">{sos.sosNote}</p>
                    </div>
                  </div>
                  {!isSupportOrAdmin ? (
                    <Button
                      onClick={() => handleAnswerSos(sos.id)}
                      disabled={answering === sos.id}
                      className="h-12 gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3 text-sm font-semibold shrink-0"
                    >
                      {answering === sos.id ? (
                        <><RotateCcw className="h-5 w-5 animate-spin" />Taking...</>
                      ) : (
                        <><Siren className="h-5 w-5" />ANSWER SOS</>
                      )}
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        onClick={() => handleAnswerSos(sos.id)}
                        disabled={answering === sos.id}
                        className="h-10 gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-xs font-semibold"
                      >
                        {answering === sos.id ? (
                          <><RotateCcw className="h-4 w-4 animate-spin" />Taking...</>
                        ) : (
                          <><Siren className="h-4 w-4" />TAKE</>
                        )}
                      </Button>
                      {heroes && heroes.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <Select value={selectedHeroId[sos.id] || ""} onValueChange={v => setSelectedHeroId(prev => ({ ...prev, [sos.id]: v }))}>
                            <SelectTrigger className="h-8 text-[0.75rem] bg-white/5 border-white/10 w-36">
                              <SelectValue placeholder="Assign to..." />
                            </SelectTrigger>
                            <SelectContent>
                              {heroes.map(h => (
                                <SelectItem key={h.id} value={h.id}>{h.displayName || h.username}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() => handleAssignSos(sos.id)}
                            disabled={assigning === sos.id || !selectedHeroId[sos.id]}
                            className="h-8 gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 text-[0.75rem] font-semibold"
                          >
                            {assigning === sos.id ? (
                              <><RotateCcw className="h-3 w-3 animate-spin" />...</>
                            ) : (
                              <><UserIcon className="h-3 w-3" />ASSIGN</>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[0.625rem] text-muted-foreground mt-2">{format(parseISO(sos.createdAt), "dd MMM yyyy HH:mm")}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

