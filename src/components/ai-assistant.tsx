"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Send, Plus, Trash2, MessageSquare, Sparkles, X,
  ChevronLeft, CheckCircle2, XCircle, AlertTriangle,
  FileText, MapPin, Loader2, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// ============ TYPES ============
interface AiChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

interface AiConversationItem {
  id: string;
  title: string;
  messageCount: number;
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
}

interface AiActionItem {
  conversationId: string;
  id: string;
  conversationId?: string;
  actionType: string;
  description: string;
  status: string;
  entityType: string;
  entityId: string;
  payload: string;
  createdAt: string;
  user?: { id: string; username: string; displayName: string; role: string };
}

// ============ COMPACT TEXT RENDERER ============
// Replaces ReactMarkdown with a lightweight renderer that won't overflow on mobile
function CompactText({ content }: { content: string }) {
  // Strip action blocks from display
  const cleanContent = content.replace(/\[ACTION:[^\]]+\]/g, "").trim();
  
  // Split into lines and render with basic formatting
  const lines = cleanContent.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Bullet points
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <div key={key++} className="flex gap-1.5 pl-1">
          <span className="text-violet-400 shrink-0">•</span>
          <span className="break-words overflow-wrap-anywhere">{renderInline(trimmed.slice(2))}</span>
        </div>
      );
      continue;
    }

    // Numbered items (1. 2. etc)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      elements.push(
        <div key={key++} className="flex gap-1.5 pl-1">
          <span className="text-violet-400 shrink-0 font-medium">{numMatch[1]}.</span>
          <span className="break-words overflow-wrap-anywhere">{renderInline(numMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Headers (## or ###)
    if (trimmed.startsWith("### ")) {
      elements.push(<p key={key++} className="font-semibold text-xs mt-1">{renderInline(trimmed.slice(4))}</p>);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(<p key={key++} className="font-semibold text-xs mt-1">{renderInline(trimmed.slice(3))}</p>);
      continue;
    }

    // Regular paragraph
    elements.push(<p key={key++} className="break-words overflow-wrap-anywhere">{renderInline(trimmed)}</p>);
  }

  if (elements.length === 0) return <span>{cleanContent}</span>;
  return <>{elements}</>;
}

// Inline formatting: bold, italic, code, emojis
function renderInline(text: string): React.ReactNode {
  // Split by bold markers **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  if (parts.length <= 1) return text;

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-white/10 rounded px-1 text-[10px]">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

// ============ AI CHAT PANEL (embeddable) ============
function AiChatPanel({ session }: { session: { user?: { id?: string; name?: string; role?: string } } | null }) {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<AiConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingActions, setPendingActions] = useState<AiActionItem[]>([]);
  const [showConversations, setShowConversations] = useState(false);
  const [dailySummary, setDailySummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      if (res.ok) setConversations(await res.json());
    } catch { /* ignore */ }
  }, []);

  // Load pending actions
  const loadPendingActions = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/actions");
      if (res.ok) setPendingActions(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { loadConversations(); loadPendingActions(); });
  }, [loadConversations, loadPendingActions]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConvId) { queueMicrotask(() => setMessages([])); return; }
    fetch(`/api/ai/conversations/${activeConvId}`)
      .then(r => { setLoading(true); return r.ok ? r.json() : null; })
      .then(data => {
        if (data?.messages) setMessages(data.messages);
        if (data?.actions) setPendingActions(prev => [...prev.filter(a => a.conversationId !== activeConvId), ...data.actions]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeConvId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMessage = input.trim();
    setInput("");

    const tempUserMsg: AiChatMessage = {
      id: `temp-${Date.now()}`, role: "user", content: userMessage, createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setSending(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, conversationId: activeConvId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "Failed", variant: "destructive" });
        setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
        setInput(userMessage);
        return;
      }
      if (!activeConvId) { setActiveConvId(data.conversationId); loadConversations(); }

      const aiMsg: AiChatMessage = {
        id: `ai-${Date.now()}`, role: "assistant", content: data.response, createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), aiMsg]);

      if (data.actions?.length > 0) {
        setPendingActions(prev => [...prev, ...data.actions]);
        toast({ title: `${data.actions.length} action(s) need approval`, description: "Tap ✓ to approve or ✗ to reject" });
      }
      if (data.flagged) toast({ title: "Message flagged", description: "Sent for admin review", variant: "destructive" });
    } catch {
      toast({ title: "Failed to send", variant: "destructive" });
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      setInput(userMessage);
    } finally { setSending(false); }
  };

  const newConversation = () => { setActiveConvId(null); setMessages([]); setShowConversations(false); inputRef.current?.focus(); };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
        toast({ title: "Deleted" });
      }
    } catch { /* ignore */ }
  };

  const reviewAction = async (actionId: string, status: "APPROVED" | "REJECTED") => {
    try {
      const res = await fetch(`/api/ai/actions/${actionId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setPendingActions(prev => prev.filter(a => a.id !== actionId));
        toast({ title: status === "APPROVED" ? "Approved ✓" : "Rejected ✗" });
      }
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  };

  const getDailySummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch("/api/ai/daily-summary");
      const data = await res.json();
      if (res.ok) setDailySummary(data.summary);
      else toast({ title: data.error || "Failed", variant: "destructive" });
    } catch { toast({ title: "Failed", variant: "destructive" }); }
    finally { setLoadingSummary(false); }
  };

  // Quick prompts - compact for mobile
  const quickPrompts = [
    { icon: FileText, label: "Summary", action: getDailySummary, loading: loadingSummary },
    { icon: MessageSquare, label: "Orders", prompt: "Quick status of my orders?" },
    { icon: MapPin, label: "Zones", prompt: "Any zone tips for my orders?" },
    { icon: Sparkles, label: "Help", prompt: "Quick help with the app?" },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Sub-header with AI actions */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setShowConversations(!showConversations)} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
          <History className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" onClick={newConversation} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[9px] text-muted-foreground ml-auto">
          {activeConvId ? `Chat · ${messages.length} msgs` : "New chat"}
        </span>
      </div>

      {/* Conversations overlay */}
      {showConversations && (
        <div className="absolute inset-0 z-20 bg-background/98 flex flex-col" style={{ top: 0 }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setShowConversations(false)} className="h-7 w-7 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold">History</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No chats yet</p>
            )}
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => { setActiveConvId(conv.id); setShowConversations(false); }}
                className={`w-full text-left p-2.5 rounded-lg transition-colors group ${
                  activeConvId === conv.id ? "bg-violet-500/15 border border-violet-500/30" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{conv.title}</p>
                    <p className="text-[9px] text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={(e) => deleteConversation(conv.id, e)} className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages area - proper scroll containment with flex-1 and min-h-0 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-2"
      >
        {messages.length === 0 && !dailySummary ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-6">
            <div className="h-12 w-12 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
              <Bot className="h-6 w-6 text-violet-400" />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-[200px]">
              Ask about orders, zones, summaries, or app help
            </p>
            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[240px]">
              {quickPrompts.map((qp, i) => (
                <Button
                  key={i} variant="outline" size="sm"
                  className="h-auto py-1.5 px-2 flex items-center gap-1.5 text-[10px] border-white/10 bg-white/5 hover:bg-violet-500/10 hover:border-violet-500/30"
                  onClick={() => { if (qp.action) qp.action(); else if (qp.prompt) setInput(qp.prompt); }}
                  disabled={qp.loading}
                >
                  {qp.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <qp.icon className="h-3 w-3 text-violet-400" />}
                  {qp.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {dailySummary && (
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                  <span className="text-[10px] font-semibold text-violet-400">Daily Summary</span>
                  <button onClick={() => setDailySummary(null)} className="ml-auto"><X className="h-3 w-3 text-muted-foreground" /></button>
                </div>
                <div className="text-xs break-words overflow-wrap-anywhere">
                  <CompactText content={dailySummary} />
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-xl px-2.5 py-1.5 ${
                  msg.role === "user"
                    ? "bg-violet-500/20 border border-violet-500/30"
                    : "bg-white/5 border border-white/10"
                }`}>
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-1 mb-0.5">
                      <Bot className="h-3 w-3 text-violet-400" />
                      <span className="text-[9px] text-violet-400 font-medium">AI</span>
                    </div>
                  )}
                  <div className="text-xs break-words overflow-wrap-anywhere leading-relaxed">
                    {msg.role === "assistant" ? (
                      <CompactText content={msg.content} />
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Bot className="h-3 w-3 text-violet-400" />
                    <span className="text-[9px] text-violet-400 font-medium">AI</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="inline-block h-1.5 w-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="inline-block h-1.5 w-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Pending Actions - compact strip */}
      {pendingActions.length > 0 && (
        <div className="border-t border-white/10 bg-amber-500/5 px-3 py-1.5 shrink-0">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] font-semibold text-amber-400">{pendingActions.length} pending</span>
          </div>
          <div className="space-y-1 max-h-20 overflow-y-auto">
            {pendingActions.map(action => (
              <div key={action.id} className="flex items-center gap-1.5 p-1.5 rounded bg-white/5 border border-white/10">
                <p className="text-[10px] flex-1 truncate">{action.description}</p>
                <Button size="sm" variant="ghost" onClick={() => reviewAction(action.id, "APPROVED")} className="h-5 w-5 p-0 text-emerald-400 shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => reviewAction(action.id, "REJECTED")} className="h-5 w-5 p-0 text-destructive shrink-0">
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input - always visible at bottom, fixed position within flex */}
      <div className="border-t border-white/10 bg-background/95 px-3 py-2 shrink-0">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder="Ask AI..."
            className="resize-none min-h-[36px] max-h-[72px] text-xs border-white/10 bg-white/5 py-2"
            rows={1}
            disabled={sending}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || sending} size="sm" className="h-9 w-9 p-0 bg-violet-600 hover:bg-violet-700 shrink-0">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

type AiProvider = "deepseek" | "agnes" | "custom";

const PROVIDER_OPTIONS: { value: AiProvider; label: string; baseUrl: string; model: string; keyLabel: string }[] = [
  { value: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", keyLabel: "DeepSeek API Key" },
  { value: "agnes", label: "Agnes AI", baseUrl: "https://apihub.agnes-ai.com", model: "agnes-2.0-flash", keyLabel: "Agnes AI API Key" },
  { value: "custom", label: "Custom", baseUrl: "", model: "", keyLabel: "API Key" },
];

// ============ AI SETTINGS SECTION (for Settings tab) ============
function AiSettingsSection() {
  const { toast } = useToast();
  const [provider, setProvider] = useState<AiProvider>("deepseek");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-chat");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [hasAgnesKey, setHasAgnesKey] = useState(false);
  const [keyPreview, setKeyPreview] = useState("");
  const [agnesKeyPreview, setAgnesKeyPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [aiFlags, setAiFlags] = useState<Array<{
    id: string; messageContent: string; reason: string; severity: string;
    isResolved: boolean; createdAt: string;
    user: { username: string; displayName: string; role: string };
  }>>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/ai/settings").then(r => r.json()).then(data => {
      // Provider
      if (data.ai_provider) setProvider(data.ai_provider as AiProvider);
      if (data.ai_enabled) setAiEnabled(data.ai_enabled === "true");
      if (data.ai_base_url) setBaseUrl(data.ai_base_url);
      if (data.ai_model) setModel(data.ai_model);
      if (data.ai_system_prompt) setSystemPrompt(data.ai_system_prompt);
      // DeepSeek / custom key
      if (data.ai_has_api_key) setHasKey(data.ai_has_api_key);
      if (data.ai_api_key_preview) setKeyPreview(data.ai_api_key_preview);
      // Agnes key
      if (data.ai_agnes_has_key) setHasAgnesKey(data.ai_agnes_has_key);
      if (data.ai_agnes_key_preview) setAgnesKeyPreview(data.ai_agnes_key_preview);
    }).catch(() => {});
  }, []);

  // When provider changes, auto-switch baseUrl and model to defaults
  useEffect(() => {
    const opt = PROVIDER_OPTIONS.find(o => o.value === provider);
    if (opt && provider !== "custom") {
      setBaseUrl(opt.baseUrl);
      setModel(opt.model);
    }
  }, [provider]);

  const loadFlags = () => {
    fetch("/api/ai/flags").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setAiFlags(data);
    }).catch(() => {});
  };

  useEffect(() => { if (isOpen) loadFlags(); }, [isOpen]);

  const saveAiSettings = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {
        ai_provider: provider,
        ai_enabled: aiEnabled.toString(),
        ai_base_url: baseUrl,
        ai_model: model,
        ai_system_prompt: systemPrompt,
      };
      // Send appropriate key based on provider
      if (apiKey) {
        if (provider === "agnes") {
          body.ai_agnes_api_key = apiKey;
        } else {
          body.ai_api_key = apiKey;
        }
      }
      const res = await fetch("/api/ai/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Failed to save", variant: "destructive" }); return; }
      setApiKey("");
      if (provider === "agnes") setHasAgnesKey(true);
      else setHasKey(true);
      toast({ title: "AI settings saved" });
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const validateKey = async () => {
    if (!apiKey) return;
    setValidating(true);
    try {
      const body: Record<string, string> = {
        ai_provider: provider,
        ai_base_url: baseUrl,
        ai_model: model,
      };
      if (provider === "agnes") {
        body.ai_agnes_api_key = apiKey;
      } else {
        body.ai_api_key = apiKey;
      }
      const res = await fetch("/api/ai/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        if (provider === "agnes") setHasAgnesKey(true);
        else setHasKey(true);
        setApiKey("");
        toast({ title: "API key validated ✓" });
      } else {
        toast({ title: data.error || "Invalid key", variant: "destructive" });
      }
    } catch { toast({ title: "Validation failed", variant: "destructive" }); }
    finally { setValidating(false); }
  };

  const resolveFlag = async (flagId: string) => {
    try {
      const res = await fetch("/api/ai/flags", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId }),
      });
      if (res.ok) { setAiFlags(prev => prev.filter(f => f.id !== flagId)); toast({ title: "Flag resolved" }); }
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 rounded-lg bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/15 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-violet-400" />
          <span className="font-semibold text-sm">AI Assistant</span>
          {aiEnabled ? (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px]">Active</Badge>
          ) : (
            <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[9px]">Disabled</Badge>
          )}
        </div>
        {isOpen ? <X className="h-4 w-4" /> : <span className="text-muted-foreground text-xs">▶</span>}
      </button>

      {isOpen && (
        <div className="space-y-4 p-4 rounded-lg border border-white/10 bg-white/5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Enable AI Assistant</Label>
              <p className="text-[10px] text-muted-foreground">System-wide toggle</p>
            </div>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
          </div>
          <Separator className="bg-white/10" />

          {/* Provider Selector */}
          <div className="space-y-2">
            <Label className="text-sm">AI Provider</Label>
            <p className="text-[10px] text-muted-foreground">Choose your AI backend</p>
            <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
              <SelectTrigger className="border-white/10 bg-white/5 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">{PROVIDER_OPTIONS.find(o => o.value === provider)?.keyLabel || "API Key"}</Label>
            {provider === "agnes" && hasAgnesKey ? (
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Key set: {agnesKeyPreview}
              </p>
            ) : provider !== "agnes" && hasKey ? (
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Key set: {keyPreview}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={(provider === "agnes" && hasAgnesKey) || (provider !== "agnes" && hasKey) ? "Enter new key" : "sk-..."} className="border-white/10 bg-white/5 text-sm" />
              <Button variant="outline" size="sm" onClick={validateKey} disabled={!apiKey || validating} className="border-white/10 bg-white/5 shrink-0">
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Validate"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">API Base URL</Label>
            <p className="text-[10px] text-muted-foreground">Auto-set from provider, override if needed</p>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" className="border-white/10 bg-white/5 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Model</Label>
            <p className="text-[10px] text-muted-foreground">Auto-set from provider, override if needed</p>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" className="border-white/10 bg-white/5 text-sm" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Custom System Prompt</Label>
            <p className="text-[10px] text-muted-foreground">Leave empty for default</p>
            <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are ERTH Assistant..." className="border-white/10 bg-white/5 text-sm min-h-[80px]" />
          </div>
          <Button onClick={saveAiSettings} disabled={saving} className="w-full bg-violet-600 hover:bg-violet-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save AI Settings
          </Button>
          <Separator className="bg-white/10" />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold">Flagged Messages</span>
              {aiFlags.length > 0 && <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[9px]">{aiFlags.length}</Badge>}
            </div>
            {aiFlags.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No flagged messages</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2">
                {aiFlags.map(flag => (
                  <div key={flag.id} className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-amber-400 font-medium">{flag.severity} — {flag.user.displayName || flag.user.username}</span>
                      <Button variant="ghost" size="sm" onClick={() => resolveFlag(flag.id)} className="h-5 text-[9px] px-2">Resolve</Button>
                    </div>
                    <p className="text-[11px] truncate">&ldquo;{flag.messageContent}&rdquo;</p>
                    <p className="text-[10px] text-muted-foreground">{flag.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ EXPORTS ============
export { AiChatPanel, AiSettingsSection };
