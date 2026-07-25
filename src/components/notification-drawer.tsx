"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Bell, X, CheckCircle, Trash2, Loader2, Siren, Shield, AtSign, ClipboardList, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { NotificationItem } from "@/types/page";

export function NotificationBell({ session, onOpen }: { session: { user?: { id?: string; name?: string; role?: string } } | null; onOpen: () => void }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session) return;
    const fetchUnread = () => {
      fetch("/api/notifications?limit=50").then(r => r.ok ? r.json() : null).then(d => {
        if (d?.notifications) {
          setUnreadCount(d.notifications.filter((n: NotificationItem) => !n.isRead).length);
        }
      }).catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <button
      onClick={onOpen}
      className="relative h-12 w-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/30 transition-colors shadow-lg"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 text-[0.625rem] text-white items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>
        </span>
      )}
    </button>
  );
}

// ============ NOTIFICATION DRAWER ============
export function NotificationDrawer({ open, onClose, session, onNavigate }: { open: boolean; onClose: () => void; session: { user?: { id?: string; name?: string; role?: string } } | null; onNavigate?: (target: "ai" | "chat" | "orders" | "notifications") => void }) {
  const [activeTab, setActiveTab] = useState<"system" | "normal">("system");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    fetch(`/api/notifications?type=${activeTab}&limit=50`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d?.notifications) { setNotifications(d.notifications); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, session, activeTab]);

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isRead: true }) });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    for (const n of unread) {
      await markAsRead(n.id);
    }
  };

  const getIcon = (type: string, title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes("sos")) return <Siren className="h-4 w-4 text-red-400" />;
    if (lower.includes("role") || lower.includes("account")) return <Shield className="h-4 w-4 text-amber-400" />;
    if (lower.includes("mention")) return <AtSign className="h-4 w-4 text-primary" />;
    if (lower.includes("order")) return <ClipboardList className="h-4 w-4 text-emerald-400" />;
    if (type === "system") return <AlertCircle className="h-4 w-4 text-amber-400" />;
    return <Bell className="h-4 w-4 text-primary" />;
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="bg-background border-white/10 h-full sm:h-[70vh] sm:max-w-lg mx-auto rounded-t-2xl">
        <SheetHeader className="pb-2 safe-top">
          <SheetTitle className="text-foreground flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />Notifications
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">Stay updated with system and chat notifications</SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab("system")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeTab === "system" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-transparent"}`}
          >
            <AlertCircle className="h-3 w-3 inline mr-1" />System
          </button>
          <button
            onClick={() => setActiveTab("normal")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeTab === "normal" ? "bg-primary/20 text-primary border border-primary/30" : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-transparent"}`}
          >
            <Bell className="h-3 w-3 inline mr-1" />Notifications
          </button>
          {notifications.some(n => !n.isRead) && (
            <button onClick={markAllRead} className="ml-auto text-[0.625rem] text-primary hover:underline">Mark all read</button>
          )}
        </div>
        <ScrollArea className="flex-1 h-[calc(70vh-140px)]">
          {loading && notifications.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No {activeTab} notifications
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {notifications.map(n => {
                const lower = (n.title + " " + n.message).toLowerCase();
                const navigateTo = () => {
                  markAsRead(n.id);
                  onClose();
                  if (!onNavigate) return;
                  if (lower.includes("summary") || lower.includes("daily")) onNavigate("ai");
                  else if (lower.includes("sos")) onNavigate("orders");
                  else if (lower.includes("mention") || lower.includes("chat")) onNavigate("chat");
                };
                return (
                <button
                  key={n.id}
                  onClick={navigateTo}
                  className={`w-full text-left p-3 rounded-lg transition-colors hover:bg-white/5 ${!n.isRead ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">{getIcon(n.type, n.title)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{n.title}</span>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[0.625rem] text-muted-foreground/60 mt-1">{format(parseISO(n.createdAt), "dd MMM yyyy HH:mm")}</p>
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ============ CHAT BUBBLE ============
