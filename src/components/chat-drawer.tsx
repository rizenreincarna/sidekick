"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { MessageCircle, X, Send, Loader2, AtSign, Bot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiChatPanel } from "@/components/ai-assistant";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import type { ChatMsg } from "@/types/page";

export function ChatBubble({ session, onOpen }: { session: { user?: { id?: string; name?: string; role?: string } } | null; onOpen: () => void }) {
  const [hasNew, setHasNew] = useState(false);
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const pollNew = () => {
      fetch("/api/chat?limit=1").then(r => r.ok ? r.json() : null).then(msgs => {
        if (msgs && msgs.length > 0) {
          const latestId = msgs[0].id;
          if (lastSeenIdRef.current && latestId !== lastSeenIdRef.current && msgs[0].userId !== session.user?.id) {
            setHasNew(true);
          }
          if (!lastSeenIdRef.current) lastSeenIdRef.current = latestId;
        }
      }).catch(() => {});
    };
    pollNew();
    const interval = setInterval(pollNew, 10000);
    return () => clearInterval(interval);
  }, [session]);

  return (
    <button
      onClick={() => { setHasNew(false); onOpen(); }}
      className="relative h-12 w-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/30 transition-colors shadow-lg"
      aria-label="Chat"
    >
      <MessageCircle className="h-5 w-5" />
      {hasNew && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 text-[0.625rem] text-white items-center justify-center font-bold">!</span>
        </span>
      )}
    </button>
  );
}

// ============ CHAT DRAWER ============
export function ChatDrawer({ open, onClose, session, aiEnabled, initialMode }: { open: boolean; onClose: () => void; session: { user?: { id?: string; name?: string; role?: string; username?: string } } | null; aiEnabled: boolean; initialMode?: "team" | "ai" }) {
  const [chatMode, setChatMode] = useState<"team" | "ai">("team");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMsgIdRef = useRef<string | undefined>(undefined);
  const { toast } = useToast();

  // When the drawer opens with an initialMode (from a deep link), switch to it.
  useEffect(() => {
    if (open && initialMode) setChatMode(initialMode);
  }, [open, initialMode]);

  const isAdmin = session?.user?.role === "ADMIN";

  // Sync lastMsgIdRef with messages
  useEffect(() => {
    lastMsgIdRef.current = messages.length > 0 ? messages[messages.length - 1].id : undefined;
  }, [messages]);

  // Load users for @mention
  useEffect(() => {
    if (open && (session?.user?.role === "ADMIN" || session?.user?.role === "SUPPORT")) {
      fetch("/api/users").then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setAllUsers(d.map((u: { id: string; username: string; displayName: string }) => ({ id: u.id, username: u.username, displayName: u.displayName }))); }).catch(() => {});
    } else if (open) {
      fetch("/api/heroes").then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setAllUsers(d.map((u: { id: string; username: string; displayName: string }) => ({ id: u.id, username: u.username, displayName: u.displayName }))); }).catch(() => {});
    }
  }, [open, session]);

  // Load messages
  useEffect(() => {
    if (!open) return;
    fetch("/api/chat").then(r => r.ok ? r.json() : null).then(d => { if (d) setMessages(d); }).catch(() => {});
  }, [open]);

  // Poll for new messages
  useEffect(() => {
    if (!open || chatMode !== "team") return;
    const interval = setInterval(() => {
      const lastId = lastMsgIdRef.current;
      const url = lastId ? `/api/chat?after=${lastId}` : "/api/chat";
      fetch(url).then(r => r.ok ? r.json() : null).then(d => {
        if (d && d.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newMsgs = d.filter((m: ChatMsg) => !existingIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            return [...prev, ...newMsgs];
          });
        }
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [open, chatMode]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current && chatMode === "team") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMode]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: newMessage.trim() }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const msg = await res.json();
      setMessages(prev => [...prev, msg]);
      setNewMessage("");
      setMentionQuery(null);
    } catch (err: unknown) {
      toast({ title: "Failed to send message", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await fetch("/api/chat", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageIds: [msgId] }) });
      setMessages(prev => prev.filter(m => m.id !== msgId));
      toast({ title: "Message deleted" });
    } catch {
      toast({ title: "Failed to delete message", variant: "destructive" });
    }
  };

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    // Check for @mention
    const cursorPos = value.length;
    const textBeforeCursor = value.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex >= 0) {
      const afterAt = textBeforeCursor.substring(atIndex + 1);
      if (!afterAt.includes(" ") && afterAt.length <= 20) {
        setMentionQuery(afterAt.toLowerCase());
        return;
      }
    }
    setMentionQuery(null);
  };

  const insertMention = (username: string) => {
    const cursorPos = newMessage.length;
    const textBeforeCursor = newMessage.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const newText = newMessage.substring(0, atIndex + 1) + username + " " + newMessage.substring(cursorPos);
    setNewMessage(newText);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const filteredUsers = mentionQuery
    ? allUsers.filter(u => u.username.toLowerCase().includes(mentionQuery) || u.displayName?.toLowerCase().includes(mentionQuery))
    : [];

  const getRoleBadge = (role: string) => {
    if (role === "ADMIN") return <span className="text-[0.625rem] bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1">ADMIN</span>;
    if (role === "SUPPORT") return <span className="text-[0.625rem] bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded px-1">SUPPORT</span>;
    return <span className="text-[0.625rem] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-1">HERO</span>;
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="bg-background border-white/10 w-full sm:max-w-md h-full p-0 flex flex-col gap-0 overflow-hidden [&>button.absolute]:hidden">
        {/* Header with toggle — safe-top clears the Android status bar (edge-to-edge) */}
        <SheetHeader className="p-3 pb-0 border-b border-white/10 shrink-0 safe-top">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-foreground flex items-center gap-2 text-sm">
              {chatMode === "team" ? (
                <><MessageCircle className="h-4 w-4 text-emerald-400" />Team Chat</>
              ) : (
                <><Bot className="h-4 w-4 text-primary" />AI Assistant</>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {aiEnabled && (
                <div className="flex items-center rounded-lg bg-white/5 border border-white/10 p-0.5">
                  <button
                    onClick={() => setChatMode("team")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[0.625rem] font-medium transition-all ${
                      chatMode === "team" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <MessageCircle className="h-3 w-3" />Team
                  </button>
                  <button
                    onClick={() => setChatMode("ai")}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[0.625rem] font-medium transition-all ${
                      chatMode === "ai" ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Bot className="h-3 w-3" />AI
                  </button>
                </div>
              )}
              <SheetClose className="rounded-md p-1.5 opacity-60 hover:opacity-100 transition-opacity hover:bg-white/10" asChild>
                <button><X className="h-4 w-4" /><span className="sr-only">Close</span></button>
              </SheetClose>
            </div>
          </div>
          {chatMode === "team" && (
            <SheetDescription className="text-muted-foreground text-[0.625rem] pb-2">Use @username to mention someone</SheetDescription>
          )}
          {chatMode === "ai" && (
            <SheetDescription className="text-muted-foreground text-[0.625rem] pb-2">Ask about orders, zones, summaries · Changes need approval</SheetDescription>
          )}
        </SheetHeader>

        {/* Content area - proper flex layout to prevent overflow */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          {chatMode === "team" ? (
            <>
              {/* Team Chat Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {messages.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-xs">
                    <MessageCircle className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    No messages yet. Start the conversation!
                  </div>
                ) : messages.map(msg => {
                  const isOwn = msg.user.id === session?.user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-xl p-2 ${isOwn ? "bg-primary/20 border border-primary/30" : "bg-white/5 border border-white/10"}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[0.625rem] font-semibold text-foreground">{msg.user.displayName || msg.user.username}</span>
                          {getRoleBadge(msg.user.role)}
                          {isAdmin && !isOwn && (
                            <button onClick={() => handleDeleteMessage(msg.id)} className="ml-1 text-destructive/40 hover:text-destructive transition-colors" title="Delete">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
                          {msg.message.split(/(@\w+)/g).map((part, i) =>
                            part.startsWith("@") ? <span key={i} className="text-primary font-semibold">{part}</span> : part
                          )}
                        </p>
                        <p className="text-[0.625rem] text-muted-foreground/60 mt-0.5">{format(parseISO(msg.createdAt), "HH:mm")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Mention dropdown */}
              {mentionQuery !== null && filteredUsers.length > 0 && (
                <div className="border-t border-white/10 bg-background/95 backdrop-blur max-h-28 overflow-y-auto shrink-0">
                  {filteredUsers.slice(0, 5).map(u => (
                    <button
                      key={u.id}
                      onClick={() => insertMention(u.username)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
                    >
                      <AtSign className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium text-foreground">{u.username}</span>
                      {u.displayName && <span className="text-muted-foreground">({u.displayName})</span>}
                    </button>
                  ))}
                </div>
              )}
              {/* Team Chat Input */}
              <div className="p-2.5 border-t border-white/10 flex gap-2 shrink-0">
                <input
                  ref={inputRef}
                  value={newMessage}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type a message... @ to mention"
                  className="flex-1 h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="sm" className="h-9 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          ) : (
            /* AI Chat Panel - embedded */
            <AiChatPanel session={session} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============ ONBOARDING MODAL ============
interface OnboardingStep {
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

import { ONBOARDING_STEPS, OnboardingModal, TutorialSection } from "@/components/onboarding";

