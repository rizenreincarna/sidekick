"use client";

import { useState, useEffect } from "react";
import { Clock, MapPin, Phone, Building2, AlertCircle, Zap, RotateCcw, Trash2, MessageCircle, X, ChevronRight, ChevronLeft, Route, Download, Upload, Eye, Shield, ShieldCheck, Info, Layers, CalendarDays, ArrowRightLeft, LogOut, User as UserIcon, FileSpreadsheet, FileDown, FileUp, CheckCircle, CheckCircle2, AlertTriangle, Pencil, Save, Siren, StickyNote, Users, UserPlus, Key, UserCog, Undo2, MapPinOff, Globe, PlusCircle, Bell, Search, ChevronDown, ChevronUp, AtSign, BookOpen, GraduationCap, Lightbulb, Sparkles, Target, ArrowRight, Play, History, Tag, Star, Bot, Loader2, Package, BarChart3, Smartphone, XCircle, RefreshCw, Truck, Plus, Calendar, ClipboardList, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ZONES, MAX_DAILY_POINTS } from "@/lib/zones";
import { BarChartIcon } from "@/components/tabs/schedule-tab";
import type { OnboardingStep } from "@/types/page";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to HERO Sidekick! 🎉",
    icon: <Sparkles className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your all-in-one tool for managing ERTH e-waste pickup orders. Let&apos;s take a quick tour of the key features.
        </p>
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs text-primary font-medium">This walkthrough will take about 2 minutes. You can always revisit tutorials from the Settings page.</p>
        </div>
      </div>
    ),
  },
  {
    title: "Dashboard Overview",
    icon: <Truck className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Your Dashboard is tailored to your role — Heroes, Support, and Admin each see different data:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-yellow-500/15 flex items-center justify-center shrink-0 mt-0.5"><Clock className="h-3.5 w-3.5 text-yellow-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Status Cards</p><p className="text-[0.75rem] text-muted-foreground">Count of Pending, Scheduled, Contacted, Booked, and Completed orders</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5"><Truck className="h-3.5 w-3.5 text-emerald-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Today&apos;s Pickups</p><p className="text-[0.75rem] text-muted-foreground">Orders scheduled for today with a progress bar showing your daily point total (max {MAX_DAILY_POINTS}pts/day)</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><Route className="h-3.5 w-3.5 text-primary" /></div>
            <div><p className="text-xs font-semibold text-foreground">Route Planning</p><p className="text-[0.75rem] text-muted-foreground">Download today&apos;s route as XLSX for Zeo Route Planner</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5"><AlertCircle className="h-3.5 w-3.5 text-amber-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Upcoming Holidays</p><p className="text-[0.75rem] text-muted-foreground">Public holidays that affect office pickup scheduling</p></div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Creating New Orders",
    icon: <Plus className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Click the <span className="font-semibold text-foreground">New</span> tab to create pickup orders:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">1</span>
            <div><p className="text-xs font-semibold text-foreground">Fill in the order details</p><p className="text-[0.75rem] text-muted-foreground">Order ID, customer name, phone, address, and city/area</p></div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">2</span>
            <div><p className="text-xs font-semibold text-foreground">Set the size & points</p><p className="text-[0.75rem] text-muted-foreground">S=1pt, M=2pt, L=3pt, XL=4pt, XXL=15pt. Override points up to 20 if needed.</p></div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">3</span>
            <div><p className="text-xs font-semibold text-foreground">Mark as Office (optional)</p><p className="text-[0.75rem] text-muted-foreground">Office pickups won&apos;t be scheduled on weekends or public holidays</p></div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">4</span>
            <div><p className="text-xs font-semibold text-foreground">Auto zone detection</p><p className="text-[0.75rem] text-muted-foreground">The city/area is matched to a zone automatically. You can customize zones in Settings.</p></div>
          </div>
        </div>
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-2.5">
          <p className="text-[0.75rem] text-orange-300 flex items-center gap-1.5"><FileUp className="h-3.5 w-3.5 shrink-0" />You can also bulk import orders from an Encore CSV file!</p>
        </div>
      </div>
    ),
  },
  {
    title: "Scheduling Pickups",
    icon: <Calendar className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">The <span className="font-semibold text-foreground">Schedule</span> tab helps you plan your pickups:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center shrink-0 mt-0.5"><Zap className="h-3.5 w-3.5 text-primary" /></div>
            <div><p className="text-xs font-semibold text-foreground">Auto-Schedule</p><p className="text-[0.75rem] text-muted-foreground">One click to auto-schedule all pending orders across available days (max {MAX_DAILY_POINTS}pts/day)</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5"><Calendar className="h-3.5 w-3.5 text-emerald-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Calendar View</p><p className="text-[0.75rem] text-muted-foreground">See your scheduled orders on a monthly calendar. Click any day to see details.</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5"><BarChartIcon className="h-3.5 w-3.5 text-amber-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Weekly Load Bar</p><p className="text-[0.75rem] text-muted-foreground">Visualize how full each day is — green (&lt;6pts), amber (6-9pts), red (10+pts)</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5"><FileDown className="h-3.5 w-3.5 text-primary" /></div>
            <div><p className="text-xs font-semibold text-foreground">Zeo Export</p><p className="text-[0.75rem] text-muted-foreground">Export any day&apos;s route as XLSX for Zeo Route Planner</p></div>
          </div>
        </div>
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5">
          <p className="text-[0.75rem] text-rose-300">💡 You can also manually reschedule individual orders by clicking the 📅 icon on any order card.</p>
        </div>
      </div>
    ),
  },
  {
    title: "Managing Orders & SOS",
    icon: <ClipboardList className="h-12 w-12 text-primary" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Keep your orders organized and get help when needed:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-cyan-500/15 flex items-center justify-center shrink-0 mt-0.5"><ClipboardList className="h-3.5 w-3.5 text-cyan-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">Orders Tab</p><p className="text-[0.75rem] text-muted-foreground">View all orders, filter by status, zone, or hero. Support/Admin can also reassign orders to different heroes.</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5"><MessageCircle className="h-3.5 w-3.5 text-emerald-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">WhatsApp</p><p className="text-[0.75rem] text-muted-foreground">Send WhatsApp messages to customers for scheduled/contacted orders with one click</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5"><Siren className="h-3.5 w-3.5 text-red-400" /></div>
            <div><p className="text-xs font-semibold text-foreground">SOS (Help!)</p><p className="text-[0.75rem] text-muted-foreground">Can&apos;t handle an order? Send an SOS and other drivers can take it over</p></div>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
          <p className="text-[0.75rem] text-muted-foreground">Order status flow: <span className="text-yellow-300">Pending</span> → <span className="text-cyan-300">Scheduled</span> → <span className="text-emerald-300">Contacted</span> → <span className="text-amber-300">Booked</span> → <span className="text-emerald-300">Completed</span></p>
        </div>
      </div>
    ),
  },
  {
    title: "You're All Set! 🚀",
    icon: <Target className="h-12 w-12 text-emerald-400" />,
    content: (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">You now know the basics! Here are some tips to get the most out of HERO Sidekick:</p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-muted-foreground">Customize your <span className="text-foreground font-medium">zones</span> in Settings to match your coverage areas</p>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-muted-foreground">Set <span className="text-foreground font-medium">OFF days</span> when you don&apos;t work to prevent auto-scheduling on those days</p>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-muted-foreground">Use the <span className="text-foreground font-medium">🔔 notification bell</span> and <span className="text-foreground font-medium">💬 chat</span> to stay connected with your team</p>
          </div>
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[0.75rem] text-muted-foreground">Visit <span className="text-foreground font-medium">Settings → Tutorial</span> anytime for detailed guides on advanced features</p>
          </div>
        </div>
      </div>
    ),
  },
];

export function OnboardingModal({ open, onClose, onComplete }: { open: boolean; onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === ONBOARDING_STEPS.length - 1;
  const isFirst = step === 0;

  useEffect(() => { if (open) { const id = setTimeout(() => setStep(0), 0); return () => clearTimeout(id); } }, [open]);

  const handleNext = () => {
    if (isLast) {
      onComplete();
      onClose();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
    onClose();
  };

  const currentStep = ONBOARDING_STEPS[step];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="bg-card border-white/10 sm:max-h-[85vh] overflow-y-auto">
        {/* Progress bar */}
        <div className="h-1 bg-white/5">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
        </div>
        <div className="p-6">
          <DialogHeader>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="mb-3 p-3 rounded-2xl bg-primary/10 earth-glow">
                {currentStep.icon}
              </div>
              <DialogTitle className="text-lg font-bold">{currentStep.title}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="mb-6">
            {currentStep.content}
          </div>
          {/* Step indicators */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {ONBOARDING_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/40" : "w-3 bg-white/10"}`}
              />
            ))}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              {!isFirst && (
                <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1 border-white/10 bg-white/5">
                  <ChevronLeft className="h-3.5 w-3.5" />Back
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                Skip Tour
              </Button>
            </div>
            <Button onClick={handleNext} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
              {isLast ? (
                <><CheckCircle2 className="h-4 w-4" />Get Started</>
              ) : (
                <>Next <ChevronRight className="h-3.5 w-3.5" /></>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ TUTORIAL SECTION (Settings) ============
export function TutorialSection() {
  const [activeTutorialTab, setActiveTutorialTab] = useState<"basic" | "advanced">("basic");

  const basicTutorials = [
    {
      title: "Getting Started",
      icon: <Sparkles className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "What is HERO Sidekick?",
          content: "HERO Sidekick is your pickup order management system for ERTH e-waste collection. It helps you create, schedule, and track pickup orders across different zones in Malaysia."
        },
        {
          heading: "Navigation",
          content: "Use the tabs at the top to switch between Dashboard, New Order, Orders, Schedule, SOS, and Settings. On mobile, swipe the tab bar to see more options."
        },
        {
          heading: "Your Profile",
          content: "Your username and role are shown in the top-right corner. Click the refresh button ↻ to reload all data, or the logout button to sign out."
        },
      ]
    },
    {
      title: "Dashboard",
      icon: <Truck className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Role-Based Dashboards",
          content: "Each role sees a different dashboard: Heroes see their personal workload, Support sees hero overview and order management, Admin sees system statistics. Switch time ranges with Day/Week/Month/Year/All Time selector."
        },
        {
          heading: "Hero Dashboard",
          content: "Heroes see their status cards, today's pickups, weekly workload with selectable weeks, order trends chart, interactive order location map with day filtering, and route planning for Zeo export. Use the time range selector for detailed statistics. The map supports filtering by day (Today, Tomorrow, or custom date) and shows all your orders with coordinates."
        },
        {
          heading: "Support Dashboard",
          content: "Support users see hero overview with workload bars, upcoming OFF days, and an order reassignment panel to move orders between heroes. Support can also update/delete any hero's orders and ask the AI about hero schedules."
        },
        {
          heading: "Admin Dashboard",
          content: "Admins see system-wide statistics: order counts, AI usage, user activity with last logins, hero workload comparison, AI moderation flags, and audit summary. All with time-range filtering for granular analysis."
        },
      ]
    },
    {
      title: "Creating Orders",
      icon: <Plus className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Single Order",
          content: "Go to the 'New' tab. Fill in Order ID, customer name, phone, full address, and city/area. Select the size (S/M/L), and optionally add notes. Click 'Add Order' to create it."
        },
        {
          heading: "Zone Auto-Detection",
          content: "When you enter a city/area, the system automatically detects which zone it belongs to based on your zone configuration. The zone appears on the order card after creation."
        },
        {
          heading: "Bulk Import from Encore",
          content: "Below the order form, use the CSV import option. Upload a CSV exported from Encore with columns: Order #, Client name, Address, Special Note. Duplicates are auto-skipped by Order ID."
        },
        {
          heading: "Office vs Residential",
          content: "Check 'Office Address' if the pickup is at an office. Office pickups won't be scheduled on weekends or public holidays."
        },
      ]
    },
    {
      title: "Scheduling",
      icon: <Calendar className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Auto-Schedule",
          content: "Click 'Auto-Schedule All Pending' to automatically distribute pending orders across available days. The system respects the 12-point daily limit, avoids OFF days, holidays, and event days."
        },
        {
          heading: "Manual Rescheduling",
          content: "On any order card, click the 📅 calendar icon to manually pick a new date using the mini calendar. You can only reschedule orders that are Pending, Scheduled, or Contacted."
        },
        {
          heading: "Calendar View",
          content: "The Schedule tab shows a monthly calendar with color-coded days: green (<6pts), amber (6-9pts), red (10+pts). Click any day to see its orders and export to Zeo. Event days and ERTHBOX orders are shown with special labels."
        },
        {
          heading: "Weekly Load",
          content: "The weekly bar chart shows your loading for each day. Use this to quickly see which days are free and which are fully booked."
        },
        {
          heading: "Events & ERTHBOX",
          content: "Events (roadshows, e-waste drives) block auto-scheduling on their date. ERTHBOX orders are manually scheduled — they stay PENDING until you assign a date. Both are shown in the calendar with special indicators."
        },
      ]
    },
    {
      title: "Viewing & Managing Orders",
      icon: <ClipboardList className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Filtering",
          content: "Use the status, zone, and hero filters on the Orders tab to find specific orders. You can also search by Order ID or customer name."
        },
        {
          heading: "Changing Status",
          content: "Click the status badge on any order to open the status picker. Orders flow: Pending → Scheduled → Contacted → Booked → Completed. You can set any status directly."
        },
        {
          heading: "Editing Points & Notes",
          content: "Click the points value (e.g. 'S(1pt)') to override points. Click notes text to edit them. Both are saved immediately."
        },
        {
          heading: "WhatsApp Customer",
          content: "Click the 💬 WhatsApp icon on any order to open the message editor. Choose a template, edit the message, and then send it via WhatsApp. Works for Scheduled, Contacted, Booked, and Completed orders."
        },
        {
          heading: "Support: All Heroes' Orders",
          content: "Support users automatically see ALL orders across all heroes in the Orders tab. Use the hero filter dropdown to view orders for a specific hero. Click the reassign button (⇄) on any order card to move it to a different hero — both heroes and admins are notified, and the change is audit-logged."
        },
      ]
    },
  ];

  const advancedTutorials = [
    {
      title: "Zone Management",
      icon: <Layers className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Understanding Zones",
          content: "Zones group areas together for easier order management. The default zones cover Selangor & KL (5 zones) and Other States (7 zones). Each zone has a list of areas that auto-match when creating orders."
        },
        {
          heading: "Enable/Disable Zones",
          content: "In Settings → Zone Map, toggle zones on/off. Disabled zones won't be used for auto-detection. Other States zones are disabled by default."
        },
        {
          heading: "Custom Zones",
          content: "Click 'New Zone' to create your own zone. Give it a name, select a state/region, and add comma-separated areas. Custom zones get auto-assigned zone IDs starting from 100."
        },
        {
          heading: "Renaming Zones",
          content: "Click any zone name in the Zone Map to rename it. This only changes the display name for your account."
        },
        {
          heading: "Adding/Excluding Areas",
          content: "Expand a zone to see its areas. Add new areas with the input field. Hover over any area to exclude it (it moves to the 'Excluded' list) or click the ✕ on custom-added areas to remove them."
        },
      ]
    },
    {
      title: "SOS System",
      icon: <Siren className="h-5 w-5 text-red-400" />,
      sections: [
        {
          heading: "Sending an SOS",
          content: "If you can't handle an order (too far, schedule conflict, etc.), click the 🚨 SOS button on the order card. Provide a reason and the order will be broadcast to other drivers."
        },
        {
          heading: "Answering an SOS",
          content: "Active SOS requests appear in the SOS tab. Click 'ANSWER SOS' to take over the order. It will be transferred to your account and you can schedule it."
        },
        {
          heading: "Admin/Support: Assigning SOS",
          content: "Admin and Support users can assign SOS requests to specific heroes instead of taking them directly. Select a hero from the dropdown and click 'ASSIGN'."
        },
      ]
    },
    {
      title: "Import & Export",
      icon: <FileSpreadsheet className="h-5 w-5 text-orange-400" />,
      sections: [
        {
          heading: "Encore CSV Import",
          content: "Upload a CSV exported from Encore. Required columns: Order #, Client name, Address, Special Note. The system auto-detects city/area and assigns zones. Duplicate Order IDs are skipped."
        },
        {
          heading: "Zeo Route Planner Export",
          content: "Export scheduled/contacted orders as an XLSX file formatted for Zeo Route Planner. Choose a specific date or export today's route from the Dashboard or Schedule tab."
        },
        {
          heading: "Google Sheets Sync",
          content: "In Settings → Integrations, set up Google Sheets sync to push orders to a spreadsheet or import from it. Requires a Google Service Account with Sheets API access."
        },
      ]
    },
    {
      title: "Scheduling Settings",
      icon: <CalendarDays className="h-5 w-5 text-amber-400" />,
      sections: [
        {
          heading: "Daily Capacity",
          content: "Each day has a maximum of 20 points. Small orders = 1pt, Medium = 2pt, Large = 3pt. You can override points per order (1-20) if an order requires extra effort."
        },
        {
          heading: "Public Holidays",
          content: "Add holidays in Settings → Scheduling. Office pickups won't be scheduled on these dates, but residential pickups can still be scheduled."
        },
        {
          heading: "OFF Days",
          content: "Mark days as OFF when you don't work at all. No orders (residential or office) will be scheduled on OFF days. This overrides everything."
        },
        {
          heading: "Weekend Rule",
          content: "Office pickups are NOT scheduled on weekends (Sat/Sun). Residential pickups can be scheduled any day. This is automatic and cannot be overridden."
        },
        {
          heading: "Event Days",
          content: "Event days automatically block auto-scheduling. When you create an event (roadshow, e-waste collection drive, etc.) on a specific date, no regular orders will be auto-assigned to that day. You can still manually schedule orders on event days."
        },
        {
          heading: "ERTHBOX Manager",
          content: "Manage ERTHBOX collection locations in Settings → Scheduling → ERTHBOX Manager. Add locations with PIC details and notes, then create ERTHBOX orders from the New Order tab. ERTHBOX orders are manually scheduled (not auto-scheduled)."
        },
      ]
    },
    {
      title: "Notifications & Chat",
      icon: <Bell className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Notifications",
          content: "Click the 🔔 bell icon to see notifications. System notifications (amber) are important alerts. Normal notifications include SOS requests and other updates."
        },
        {
          heading: "Team Chat",
          content: "Click the 💬 chat bubble (bottom-right) to open the chat drawer. In Team mode, you can chat with team members and @mention others by typing @ followed by their name. Admins can delete inappropriate messages."
        },
        {
          heading: "AI Chat Mode",
          content: "Inside the chat drawer, use the Team/AI toggle at the top to switch to AI Assistant mode. The AI can answer questions about your orders, schedule, zones, and more. All AI-proposed actions need your approval."
        },
      ]
    },
    {
      title: "WhatsApp Messaging",
      icon: <MessageCircle className="h-5 w-5 text-emerald-400" />,
      sections: [
        {
          heading: "Message Editor",
          content: "Click the 💬 WhatsApp icon on any order to open the message editor. The default template is auto-filled with the order's details. You can freely edit the message before sending."
        },
        {
          heading: "Message Templates",
          content: "In Settings → WhatsApp, manage your message templates. Create templates with variables like {customerName}, {date}, {address} that auto-fill when sending. Set a default template for quick access."
        },
        {
          heading: "Quick Variable Insert",
          content: "In the message editor, expand 'Insert Variable' to add order details at your cursor position. Variables like {orderId}, {size}, {city}, and {notes} are available."
        },
        {
          heading: "Country Code Prefix",
          content: "In Settings → WhatsApp, set your country code prefix (default: 60 for Malaysia). Phone numbers are auto-formatted with this prefix when sending WhatsApp messages."
        },
      ]
    },
    {
      title: "AI Assistant",
      icon: <Bot className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Opening the AI Chat",
          content: "Click the 💬 chat bubble (bottom-right) to open the chat drawer. Inside, use the Team/AI toggle at the top to switch to AI mode. The AI knows your order data and can answer questions about your schedule, orders, and more."
        },
        {
          heading: "Asking Smart Questions",
          content: "Ask the AI things like: 'Do I have events next week?', 'Orders in KL next week?', 'What's my schedule tomorrow?', or 'How many points do I have today?'. The AI has full context of your orders, events, ERTHBOX collections, and holidays."
        },
        {
          heading: "Schedule Analysis",
          content: "The AI can analyze your schedule and provide insights — busy days, light days, conflicts with events, approaching the 12pt daily cap, and suggested actions. Ask 'What should I know about this week?' for a full breakdown."
        },
        {
          heading: "Daily Summary",
          content: "Click 'Daily Summary' in the AI chat to get a personalized summary of your day — completed orders, points earned, orders with notes needing attention, and tomorrow's schedule preview."
        },
        {
          heading: "Order Changes & Creation",
          content: "The AI can suggest changes to orders (status updates, adding notes, etc.) and create new orders. Any proposed changes require your approval before being applied — you'll see pending actions in the chat."
        },
        {
          heading: "Malaysia Timezone",
          content: "The AI always knows the current date and time in Malaysia (UTC+8). It uses this to accurately answer time-based questions like 'next week' or 'tomorrow'. No need to specify dates manually."
        },
        {
          heading: "Admin Controls",
          content: "Admins can enable/disable AI system-wide, configure the API key, model, base URL, and system prompt in Settings → AI Assistant. The model field is a dropdown that auto-fetches available models from your provider (Ollama, OpenAI, etc.) with a Refresh button. Flagged messages from dangerous or strange requests are visible to admins only."
        },
        {
          heading: "Photo Upload (Vision)",
          content: "Tap the image icon next to the message box to attach a photo (or take one in the Android app). The AI uses a vision-capable model (minimax-m3:cloud) to describe or analyze the image. Attach up to 4 photos per message; they're downsized to 1024px automatically. Useful for identifying items, reading labels, or documenting pickups."
        },
      ]
    },
    {
      title: "Android App & Notifications",
      icon: <Smartphone className="h-5 w-5 text-emerald-400" />,
      sections: [
        {
          heading: "Installing the App",
          content: "HERO Sidekick is available as a native Android app wrapping the web platform. Install the APK on your phone and log in — your session persists across launches. The app works offline-ish (cached) and supports pull-to-refresh."
        },
        {
          heading: "Push Notifications",
          content: "The app receives push notifications for: SOS requests (Support/Admin), new orders assigned/reassigned to you, system alerts from admins, and chat mentions. Notifications route to dedicated channels (Orders, SOS, System, Chat) so you can configure each separately in Android settings."
        },
        {
          heading: "Foreground Sync Fallback",
          content: "If Firebase Cloud Messaging isn't configured, the app runs a foreground service that polls for new notifications every 60s (with adaptive backoff when idle). This ensures you still get notified even without push setup. On first install it bootstraps silently — no flood of old notifications."
        },
        {
          heading: "Photo Upload from App",
          content: "When chatting with the AI in the Android app, the image picker offers both Gallery and Camera options. Take a photo directly or pick from your gallery — it's sent to the vision model just like on the web."
        },
      ]
    },
    {
      title: "2FA & Security",
      icon: <Shield className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "What is 2FA?",
          content: "Two-Factor Authentication adds an extra security layer. After entering your password, you'll also need a 6-digit code from Google Authenticator on your phone."
        },
        {
          heading: "Setting Up",
          content: "Go to Settings → Security → Start 2FA Setup. Scan the QR code with Google Authenticator (free app). Enter the 6-digit code to verify and enable."
        },
        {
          heading: "Signing In with 2FA",
          content: "After entering username and password, you'll be asked for your 2FA code. Open Google Authenticator and type the 6-digit code. Codes refresh every 30 seconds."
        },
        {
          heading: "Disabling 2FA",
          content: "Go to Settings → Security → Disable 2FA. You'll need to enter your current authenticator code to confirm. Only disable if you've lost access to your authenticator app."
        },
      ]
    },
    {
      title: "AI Order Creation",
      icon: <Bot className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Creating Orders with AI",
          content: "Open the chat bubble → switch to AI mode using the Team/AI toggle. Say something like \"Create an order for John at Ampang\". AI will ask for missing details (order ID, phone, etc.) then propose the order for your approval."
        },
        {
          heading: "Creating Events with AI",
          content: "Tell the AI \"Create a roadshow event at KLCC next Monday\" or \"Schedule an e-waste collection event on 2026-06-20\". AI will create an EVENT-XXX order with the correct type and date for your approval."
        },
        {
          heading: "Creating ERTHBOX Orders with AI",
          content: "Tell the AI \"Create an ERTHBOX collection for [location name]\". The AI will look up the ERTHBOX location and create an ERTHBOX-XXX order with the location's details auto-populated. You must have ERTHBOX locations set up first (Settings → Scheduling → ERTHBOX Manager)."
        },
        {
          heading: "Smart Zone Detection",
          content: "When AI creates an order, it automatically detects the zone from the address. If the area is new, AI suggests adding it to the nearest zone — you can approve this in Settings → Zone Map."
        },
        {
          heading: "BOOKED Order Protection",
          content: "Orders with BOOKED status are locked. AI cannot suggest changes to them to prevent conflicts with confirmed customer schedules."
        },
      ]
    },
    {
      title: "Event Scheduling",
      icon: <Calendar className="h-5 w-5 text-amber-400" />,
      sections: [
        {
          heading: "What are Events?",
          content: "Events are full-day activities like roadshows, e-waste collection drives, or other special occasions. They are different from regular orders — they take up the entire day and block auto-scheduling for that date."
        },
        {
          heading: "Creating Events",
          content: "In the New Order tab, toggle the 'Event' switch on. Select an event type (Roadshow, E-Waste Collection, or Other), enter the event name, date, and optionally city and notes. Event IDs are auto-generated (EVENT-001, EVENT-002, etc.)."
        },
        {
          heading: "Event Days & Auto-Scheduling",
          content: "When a day has an event scheduled, the auto-scheduler will NOT assign regular orders to that day. This ensures you're free for the full-day event. You can still manually schedule orders on event days if needed."
        },
        {
          heading: "Event Types",
          content: "ROADSHOW — promotional events at malls or public venues. EWASTE_COLLECTION — organized e-waste collection drives. OTHER — any other full-day activity. Each type is shown with a distinctive label on your schedule."
        },
        {
          heading: "Events via AI",
          content: "You can also create events through the AI Assistant. Say \"Create a roadshow event next Friday\" and the AI will handle the details. Event creation through AI still requires your approval before it's added."
        },
      ]
    },
    {
      title: "ERTHBOX Management",
      icon: <Package className="h-5 w-5 text-emerald-400" />,
      sections: [
        {
          heading: "What are ERTHBOX Orders?",
          content: "ERTHBOX orders are for collecting ERTHBOX collection boxes from fixed locations like malls, offices, or community centers. They are typically scheduled weekly when you have orders in the nearby area."
        },
        {
          heading: "Universal Locations",
          content: "ERTHBOX locations are shared across all users — any hero, admin, or support can see and use all active locations. When creating an ERTHBOX order, you'll see locations added by all users, with a 'by [name]' badge showing who created each location. Only the owner, admin, or support can edit or delete a location."
        },
        {
          heading: "Managing ERTHBOX Locations",
          content: "Go to Settings → Scheduling → ERTHBOX Manager. Here you can add, edit, and deactivate collection locations. Each location stores the location name, address, city, Person in Charge (PIC) name, PIC phone number, and notes. If there are many locations, use the search bar to filter by name, city, or address."
        },
        {
          heading: "Adding a Location",
          content: "Click 'Add Location' in the ERTHBOX Manager. Fill in the location name, address, city, PIC name, PIC phone, and any notes (e.g. 'Mall area, cannot enter between 12PM-2PM'). Active locations are available for everyone to use when creating ERTHBOX orders."
        },
        {
          heading: "Creating ERTHBOX Orders",
          content: "In the New Order tab, toggle the 'ERTHBOX' switch on. A search-enabled location list appears — search by name, city, or address, then click a location to select it. The address, PIC name, and phone are auto-filled. ERTHBOX orders get auto-generated IDs (ERTHBOX-001, etc.) and default to PENDING status."
        },
        {
          heading: "Scheduling ERTHBOX Collections",
          content: "ERTHBOX orders are NOT auto-scheduled. They stay in PENDING status until you manually assign a date. This is because ERTHBOX collections depend on whether you have nearby orders that week. Use the calendar picker on the order to set a date."
        },
        {
          heading: "ERTHBOX via AI",
          content: "Tell the AI \"Create an ERTHBOX collection for [location name]\" and it will create the order for your approval. You can optionally include a date: \"Create ERTHBOX for Mid Valley on Friday\"."
        },
      ]
    },
    {
      title: "Admin Features",
      icon: <Shield className="h-5 w-5 text-amber-400" />,
      sections: [
        {
          heading: "User Management",
          content: "Admins see a 'Users' tab to manage accounts. Create new users (HERO, SUPPORT, or ADMIN), approve/reject registrations, activate/deactivate accounts, and reset passwords."
        },
        {
          heading: "Admin Dashboard",
          content: "The Admin Dashboard shows system-wide statistics with time-range filtering: order counts/trends, AI usage stats, user activity with last logins, hero workload comparison, AI moderation flags, and audit summary."
        },
        {
          heading: "Audit Log",
          content: "Settings → Audit Log tracks all significant actions: order changes, reassignments, user management, SOS events, and more. Filter by user or action type."
        },
        {
          heading: "Self-Registration",
          content: "New users can register from the login page. They start as unapproved and cannot sign in until an Admin approves them from the Users tab."
        },
      ]
    },
    {
      title: "Support Features",
      icon: <Shield className="h-5 w-5 text-primary" />,
      sections: [
        {
          heading: "Support Dashboard",
          content: "The Support Dashboard provides a hero overview with workload bars, upcoming OFF days, order trends, and an order reassignment panel. Use the time-range selector and week navigation for different views."
        },
        {
          heading: "Order Reassignment",
          content: "Reassign orders from two places: the Support Dashboard reassignment panel, or directly from the Orders tab by clicking the ⇄ button on any order card. Both methods notify the affected heroes and admins, and log the change in the audit trail."
        },
        {
          heading: "Managing Hero Orders",
          content: "Support users can update and delete any hero's orders, not just their own. Changes notify the assigned hero. Support can also view all orders across heroes."
        },
        {
          heading: "AI Hero Queries",
          content: "Support users can ask the AI questions about heroes: 'Which heroes are working today?', 'Who has the lightest workload?', 'Are any heroes on leave next week?', 'Which hero should I assign this KL order to?'."
        },
        {
          heading: "Settings Access",
          content: "Support users have access to the Settings tab for scheduling configuration, zone management, and other operational settings needed for their role."
        },
      ]
    },
  ];

  const [expandedTutorial, setExpandedTutorial] = useState<string | null>(null);

  const tutorials = activeTutorialTab === "basic" ? basicTutorials : advancedTutorials;

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setActiveTutorialTab("basic"); setExpandedTutorial(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTutorialTab === "basic"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-white/5 text-muted-foreground border border-transparent hover:bg-white/10"
          }`}
        >
          <BookOpen className="h-4 w-4" />Basic Usage
        </button>
        <button
          onClick={() => { setActiveTutorialTab("advanced"); setExpandedTutorial(null); }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTutorialTab === "advanced"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-white/5 text-muted-foreground border border-transparent hover:bg-white/10"
          }`}
        >
          <GraduationCap className="h-4 w-4" />Advanced Features
        </button>
      </div>

      {/* Tutorial Cards */}
      <div className="space-y-2">
        {tutorials.map((tutorial) => {
          const isExpanded = expandedTutorial === tutorial.title;
          return (
            <div key={tutorial.title} className="rounded-xl border border-white/10 bg-card overflow-hidden">
              <button
                onClick={() => setExpandedTutorial(isExpanded ? null : tutorial.title)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">{tutorial.icon}</div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{tutorial.title}</p>
                    <p className="text-[0.625rem] text-muted-foreground">{tutorial.sections.length} topic{tutorial.sections.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 space-y-3">
                  {tutorial.sections.map((section, i) => (
                    <div key={i} className="pt-3 first:pt-3">
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-[0.625rem] font-bold text-primary shrink-0 mt-0.5">{i + 1}</span>
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-0.5">{section.heading}</p>
                          <p className="text-[0.75rem] text-muted-foreground leading-relaxed">{section.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ MAIN PAGE ============
