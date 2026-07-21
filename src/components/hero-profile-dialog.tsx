"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Car, MapPin, LocateFixed, Home } from "lucide-react";

interface HeroProfileData {
  heroName: string;
  plateNumber: string;
  vehicleColor: string;
  vehicleModel: string;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
}

export function HeroProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [profile, setProfile] = useState<HeroProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hero/profile", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchProfile();
  }, [open, fetchProfile]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await fetch("/api/hero/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setProfile((p) => ({
          ...p!,
          homeLatitude: parseFloat(pos.coords.latitude.toFixed(6)),
          homeLongitude: parseFloat(pos.coords.longitude.toFixed(6)),
        }));
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <User className="h-5 w-5 text-primary" />
            Hero Profile
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="heroName">Hero Name</Label>
              <Input
                id="heroName"
                value={profile?.heroName || ""}
                onChange={(e) =>
                  setProfile((p) => ({ ...p!, heroName: e.target.value }))
                }
                className="border-white/10 bg-white/5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plateNumber">Plate Number</Label>
              <Input
                id="plateNumber"
                value={profile?.plateNumber || ""}
                onChange={(e) =>
                  setProfile((p) => ({ ...p!, plateNumber: e.target.value.toUpperCase() }))
                }
                placeholder="VGL1472"
                className="border-white/10 bg-white/5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vehicleModel">Vehicle Model</Label>
                <Input
                  id="vehicleModel"
                  value={profile?.vehicleModel || ""}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p!, vehicleModel: e.target.value }))
                  }
                  placeholder="Isuzu Dmax"
                  className="border-white/10 bg-white/5"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vehicleColor">Vehicle Color</Label>
                <Input
                  id="vehicleColor"
                  value={profile?.vehicleColor || ""}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p!, vehicleColor: e.target.value }))
                  }
                  placeholder="black"
                  className="border-white/10 bg-white/5"
                />
              </div>
            </div>

            {/* Home Location */}
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">Home Location</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Set where you start and end your route. This affects route optimization
                and the 3D map. Leave empty to use the default (BSP21, Bandar Saujana Putra).
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="homeLat" className="text-xs">Latitude</Label>
                  <Input
                    id="homeLat"
                    type="number"
                    step="0.000001"
                    value={profile?.homeLatitude ?? ""}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p!,
                        homeLatitude: e.target.value === "" ? null : parseFloat(e.target.value),
                      }))
                    }
                    placeholder="2.943743"
                    className="border-white/10 bg-white/5"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="homeLon" className="text-xs">Longitude</Label>
                  <Input
                    id="homeLon"
                    type="number"
                    step="0.000001"
                    value={profile?.homeLongitude ?? ""}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p!,
                        homeLongitude: e.target.value === "" ? null : parseFloat(e.target.value),
                      }))
                    }
                    placeholder="101.590034"
                    className="border-white/10 bg-white/5"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUseGps}
                disabled={gpsLoading}
                className="border-white/10 bg-white/5 hover:bg-white/10 w-full"
              >
                {gpsLoading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="mr-2 h-3.5 w-3.5" />
                )}
                Use my current GPS location
              </Button>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-muted-foreground">
              <Car className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
              <span>
                This info appears on the 3D route map and in customer tracking links
                so customers know who's coming.
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="border-white/10 bg-white/5 hover:bg-white/10">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}