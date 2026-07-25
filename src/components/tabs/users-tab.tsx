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

export function UsersTab({ onRefresh }: { onRefresh: () => void }) {
  const { data: session } = useSession();
  const { data: users, refetch } = useFetchData<ManagedUser[]>("/api/users");
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [loading, setLoading] = useState(false);

  // Add user form state
  const [addForm, setAddForm] = useState({ username: "", password: "", displayName: "", role: "HERO" as string });

  // Edit user form state
  const [editRole, setEditRole] = useState<string>("");
  const [editPassword, setEditPassword] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");

  const roleBadgeClass: Record<string, string> = {
    ADMIN: "bg-red-500/15 text-red-400 border-red-500/30",
    HERO: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    SUPPORT: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      toast({ title: `User "${addForm.username}" created`, description: `Role: ${addForm.role}` });
      setAddForm({ username: "", password: "", displayName: "", role: "HERO" });
      setShowAddDialog(false);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to create user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (user: ManagedUser) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      toast({ title: user.isActive ? "User deactivated" : "User activated", description: `${user.username} is now ${user.isActive ? "inactive" : "active"}` });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to update status", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      toast({ title: "User deleted" });
      setShowDeleteConfirm(null);
      refetch();
      onRefresh();
    } catch (err: unknown) {
      toast({ title: "Failed to delete user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {};
      if (editRole && editRole !== selectedUser.role) body.role = editRole;
      if (editPassword) body.password = editPassword;
      if (editDisplayName && editDisplayName !== selectedUser.displayName) body.displayName = editDisplayName;

      if (Object.keys(body).length === 0) {
        toast({ title: "No changes to save" });
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      toast({ title: "User updated" });
      setShowEditDialog(false);
      setSelectedUser(null);
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to update user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (user: ManagedUser) => {
    setSelectedUser(user);
    setEditRole(user.role);
    setEditPassword("");
    setEditDisplayName(user.displayName);
    setShowEditDialog(true);
  };

  const allUsers = users || [];
  const pendingUsers = allUsers.filter(u => !u.isApproved);
  const activeUsers = allUsers.filter(u => u.isApproved);
  const sortedUsers = [...pendingUsers, ...activeUsers];

  const handleApproveUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isApproved: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve user");
      toast({ title: "User approved", description: `${data.username} can now sign in` });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to approve user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject user");
      toast({ title: "User registration rejected" });
      refetch();
    } catch (err: unknown) {
      toast({ title: "Failed to reject user", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-400" />User Management
          {pendingUsers.length > 0 && (
            <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-400">
              {pendingUsers.length} pending
            </span>
          )}
        </h3>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground h-10 px-4">
          <UserPlus className="h-4 w-4" />Create User
        </Button>
      </div>

      {sortedUsers.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-8 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No users found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedUsers.map(user => {
            const isSelf = user.id === session?.user?.id;
            const isPending = !user.isApproved;
            return (
              <div key={user.id} className={`rounded-xl border bg-card p-4 ${isPending ? "border-amber-500/20" : !user.isActive ? "border-red-500/20 opacity-60" : "border-white/10"}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                      user.role === "ADMIN" ? "bg-red-500/20 text-red-400" :
                      user.role === "SUPPORT" ? "bg-blue-500/20 text-blue-400" :
                      "bg-emerald-500/20 text-emerald-400"
                    }`}>
                      {user.displayName?.charAt(0)?.toUpperCase() || user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{user.displayName || user.username}</span>
                        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.625rem] font-semibold ${roleBadgeClass[user.role] || ""}`}>
                          {user.role}
                        </span>
                        {isPending && (
                          <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-400">
                            PENDING
                          </span>
                        )}
                        {!user.isActive && !isPending && (
                          <span className="inline-flex items-center rounded-md border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-red-400">
                            INACTIVE
                          </span>
                        )}
                        {isSelf && (
                          <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-primary">
                            YOU
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">@{user.username} &middot; {user._count.orders} orders &middot; {user._count.sosRequests} SOS &middot; {format(parseISO(user.createdAt), "dd MMM yyyy")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(user)} className="gap-1 h-8 px-2.5 text-xs border-white/10 bg-white/5 hover:bg-white/10">
                      <UserCog className="h-3 w-3" />Edit
                    </Button>
                    {isPending ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApproveUser(user.id)}
                          disabled={isSelf}
                          className="gap-1 h-8 px-2.5 text-xs border-white/10 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20"
                        >
                          <CheckCircle2 className="h-3 w-3" />Approve
                        </Button>
                        {!isSelf && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectUser(user.id)}
                            className="gap-1 h-8 px-2.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20"
                          >
                            <Trash2 className="h-3 w-3" />Reject
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(user)}
                          disabled={isSelf}
                          className={`gap-1 h-8 px-2.5 text-xs border-white/10 ${user.isActive ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20"}`}
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        {!isSelf && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDeleteConfirm(user.id)}
                            className="gap-1 h-8 px-2.5 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Delete confirmation */}
                {showDeleteConfirm === user.id && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-red-300">Delete <strong>{user.username}</strong> and all their data? This cannot be undone.</p>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(null)} className="h-8 text-xs border-white/10">Cancel</Button>
                      <Button size="sm" onClick={() => handleDeleteUser(user.id)} className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white">Delete</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-background border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" />Create New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Username *</Label>
              <Input value={addForm.username} onChange={e => setAddForm({...addForm, username: e.target.value})} placeholder="username" className="h-11 bg-white/5 border-white/10" required minLength={3} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Password *</Label>
              <Input type="password" value={addForm.password} onChange={e => setAddForm({...addForm, password: e.target.value})} placeholder="••••••••" className="h-11 bg-white/5 border-white/10" required minLength={4} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Display Name</Label>
              <Input value={addForm.displayName} onChange={e => setAddForm({...addForm, displayName: e.target.value})} placeholder="Full name" className="h-11 bg-white/5 border-white/10" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role *</Label>
              <Select value={addForm.role} onValueChange={v => setAddForm({...addForm, role: v})}>
                <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HERO">HERO - Field pickup driver</SelectItem>
                  <SelectItem value="SUPPORT">SUPPORT - Assign & manage orders</SelectItem>
                  <SelectItem value="ADMIN">ADMIN - Full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="border-white/10">Cancel</Button>
              <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {loading ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-background border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCog className="h-5 w-5 text-primary" />Edit User: {selectedUser?.username}</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Display Name</Label>
                <Input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} placeholder="Display name" className="h-11 bg-white/5 border-white/10" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="h-11 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HERO">HERO</SelectItem>
                    <SelectItem value="SUPPORT">SUPPORT</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Key className="h-3 w-3" />Change Password</Label>
                <Input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Leave empty to keep current" className="h-11 bg-white/5 border-white/10" minLength={editPassword ? 4 : undefined} />
                <p className="text-[0.625rem] text-muted-foreground mt-1">Minimum 4 characters. Leave empty to keep the current password.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setShowEditDialog(false); setSelectedUser(null); }} className="border-white/10">Cancel</Button>
                <Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  {loading ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

