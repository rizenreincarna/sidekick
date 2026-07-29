"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { MarieConfigInput } from "@/lib/marie-config";

/**
 * Marie automation controls: 3-way contact mode switch (Allow all / Whitelist only /
 * Stop Automation) and the order whitelist manager. Admin-only section.
 */

interface OrderLookup {
  orderId: string;
  customerName: string;
  status: string;
  scheduledDate: string | null;
}

export function MarieAutomationSection() {
  const { toast } = useToast();
  const [config, setConfig] = useState<MarieConfigInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newOrderId, setNewOrderId] = useState("");
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderLookup | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/marie/config");
      if (res.ok) {
        const data = (await res.json()) as MarieConfigInput;
        setConfig(data);
      }
    } catch {
      toast({ title: "Failed to load Marie config", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Resolve human-readable details for each whitelisted order.
  useEffect(() => {
    if (!config) return;
    const missing = config.orderAllowlist.filter(id => !(id in orderDetails));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const resolved: Record<string, OrderLookup | null> = {};
      for (const orderId of missing) {
        try {
          const res = await fetch(`/api/orders?all=true&search=${encodeURIComponent(orderId)}`);
          if (!res.ok) { resolved[orderId] = null; continue; }
          const data = await res.json() as { orders?: OrderLookup[] };
          resolved[orderId] = data.orders?.find(o => o.orderId === orderId) ?? null;
        } catch {
          resolved[orderId] = null;
        }
      }
      if (!cancelled) setOrderDetails(prev => ({ ...prev, ...resolved }));
    })();
    return () => { cancelled = true; };
  }, [config?.orderAllowlist]);

  const save = useCallback(async (next: MarieConfigInput) => {
    setSaving(true);
    try {
      const res = await fetch("/api/marie/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfig(next);
      toast({ title: "Marie settings saved" });
    } catch {
      toast({ title: "Failed to save Marie settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [toast]);

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading Marie settings...</div>;
  }
  if (!config) {
    return <div className="p-4 text-sm text-muted-foreground">Marie configuration unavailable.</div>;
  }

  const setMode = (mode: "ALL" | "WHITELIST" | "STOPPED") => save({ ...config, contactMode: mode });

  const addOrder = async () => {
    const id = newOrderId.trim();
    if (!id) return;
    if (config.orderAllowlist.includes(id)) {
      toast({ title: `Order ${id} is already whitelisted` });
      return;
    }
    // Validate the order exists before allowing the add.
    try {
      const res = await fetch(`/api/orders?all=true&search=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { orders?: OrderLookup[] };
      const found = data.orders?.find(o => o.orderId === id);
      if (!found) {
        toast({ title: `Order ${id} not found`, variant: "destructive" });
        return;
      }
      const next = { ...config, orderAllowlist: [...config.orderAllowlist, id] };
      await save(next);
      setOrderDetails(prev => ({ ...prev, [id]: found }));
      setNewOrderId("");
    } catch {
      toast({ title: "Could not verify the order number", variant: "destructive" });
    }
  };

  const removeOrder = (id: string) => {
    save({ ...config, orderAllowlist: config.orderAllowlist.filter(item => item !== id) });
  };

  const modes = [
    { value: "ALL" as const, label: "Allow all", hint: "Marie contacts every eligible order", tone: "text-emerald-400" },
    { value: "WHITELIST" as const, label: "Whitelist only", hint: "Only the orders listed below", tone: "text-amber-400" },
    { value: "STOPPED" as const, label: "Stop Automation", hint: "Halts outreach; stale orders still auto-cancel", tone: "text-red-400" },
  ];

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-sm font-medium mb-2">Contact mode</div>
        <div className="grid grid-cols-3 gap-2">
          {modes.map(mode => {
            const active = config.contactMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                disabled={saving}
                onClick={() => setMode(mode.value)}
                className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-white/5"} ${saving ? "opacity-50" : ""}`}
              >
                <div className={`text-sm font-semibold ${mode.tone}`}>{mode.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{mode.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {config.contactMode === "WHITELIST" && (
        <div className="space-y-3">
          <div className="text-sm font-medium">Whitelisted orders</div>

          <div className="flex gap-2">
            <Input
              value={newOrderId}
              onChange={e => setNewOrderId(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOrder(); } }}
              placeholder="Order number, e.g. 26176"
              disabled={saving}
            />
            <Button type="button" onClick={addOrder} disabled={saving || !newOrderId.trim()} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add/unignore
            </Button>
          </div>

          {config.orderAllowlist.length === 0 ? (
            <div className="text-sm text-muted-foreground">No orders whitelisted. Marie will not contact anyone in this mode.</div>
          ) : (
            <div className="space-y-2">
              {config.orderAllowlist.map(id => {
                const order = orderDetails[id];
                return (
                  <div key={id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="outline" className="shrink-0">#{id}</Badge>
                      {order ? (
                        <div className="min-w-0">
                          <div className="text-sm truncate">{order.customerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {order.status}{order.scheduledDate ? ` · ${order.scheduledDate}` : ""}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Order not found (may have been deleted)</div>
                      )}
                    </div>
                    <Button
                      type="button" variant="ghost" size="icon" disabled={saving}
                      onClick={() => removeOrder(id)}
                      aria-label={`Remove order ${id} from whitelist`}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {config.contactMode === "STOPPED" && (
        <div className="text-sm text-muted-foreground rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          All customer messaging is halted. Stale CONTACTED orders will still auto-cancel after the no-reply deadline.
        </div>
      )}
    </div>
  );
}
