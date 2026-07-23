"use client";

// MapLibre GL JS navigation surface — client-only (dynamically imported with
// ssr: false by the caller). Open-source stack only: OpenStreetMap tiles,
// no Google Maps, no Mapbox token.
//
// - Vector style via NEXT_PUBLIC_MAP_STYLE_URL when configured, otherwise a
//   built-in OSM raster style with proper attribution.
// - Optional 3D buildings fill-extrusion when the vector style exposes a
//   building layer (NEXT_PUBLIC_ENABLE_3D_BUILDINGS).
// - Optional dark cockpit filter applied to the map canvas only
//   (NEXT_PUBLIC_MAP_DARK_FILTER) — UI overlays are unaffected.
// - 3D third-person follow camera (pitch ~62°, zoom ~17, bearing follows
//   travel direction), smoothed vehicle orb marker with heading cone.

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  bearingAlongPath,
  lerpBearing,
  lerpLatLng,
  pointAlongPath,
  type LatLng,
  type PathPoint,
} from "@/lib/geo-utils";
import type { NavLeg } from "@/hooks/use-navigation-engine";
import type { NavigationTarget } from "@/lib/navigation";
import type { DriverFix } from "@/hooks/use-driver-location";

const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";
const MAP_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || "© OpenStreetMap contributors";
const ENABLE_3D_BUILDINGS = (process.env.NEXT_PUBLIC_ENABLE_3D_BUILDINGS || "true") === "true";
const MAP_DARK_FILTER = (process.env.NEXT_PUBLIC_MAP_DARK_FILTER || "true") === "true";

const FOLLOW_PITCH = 62;
const FOLLOW_ZOOM = 17;

const ROUTE_COLOR = "#2dd4bf"; // teal-400 — matches Sidekick primary
const ROUTE_CASING = "#042f2e";
const ROUTE_PASSED = "rgba(15, 23, 42, 0.85)";

function fallbackRasterStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: MAP_ATTRIBUTION,
      },
    },
    layers: [{ id: "osm-raster", type: "raster", source: "osm" }],
  };
}

export interface NavigationMapProps {
  /** Mutable ref to the latest driver fix (read inside the rAF loop). */
  fixRef: React.RefObject<DriverFix | null>;
  /** Active leg (route line + bounds). */
  leg: NavLeg | null;
  /** Along-path progress in meters — drives the dimmed "passed" segment. */
  progressMeters: number;
  /** All navigation targets (markers). */
  targets: NavigationTarget[];
  activeTargetId: string | null;
  completedIds: ReadonlySet<string>;
  /** Camera follow mode. */
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  /** Increment to trigger a fit-bounds overview. */
  overviewRequest: number;
  /** Initial map center when no GPS yet. */
  initialCenter: LatLng;
}

export default function NavigationMapMaplibre({
  fixRef,
  leg,
  progressMeters,
  targets,
  activeTargetId,
  completedIds,
  follow,
  onFollowChange,
  overviewRequest,
  initialCenter,
}: NavigationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const vehicleRef = useRef<maplibregl.Marker | null>(null);
  const vehicleElRef = useRef<HTMLDivElement | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const smoothedRef = useRef<{ pos: LatLng; bearing: number; initialized: boolean }>({
    pos: initialCenter,
    bearing: 0,
    initialized: false,
  });
  const followRef = useRef(follow);
  const legRef = useRef(leg);
  const progressRef = useRef(progressMeters);
  const lastPassedUpdateRef = useRef(-Infinity);

  followRef.current = follow;
  legRef.current = leg;
  progressRef.current = progressMeters;

  // -------------------------------------------------------------------------
  // Map init (once)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL || fallbackRasterStyle(),
      center: [initialCenter.lng, initialCenter.lat],
      zoom: 15,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: false },
      logoPosition: "bottom-left",
    });
    mapRef.current = map;
    // Debug/testing handle (also used by the ?simulate=1 helper)
    (window as unknown as { __navMap?: maplibregl.Map }).__navMap = map;

    // Graceful fallback: if a custom vector style fails to load, use raster OSM
    let styleLoaded = false;
    const onError = () => {
      if (!styleLoaded && MAP_STYLE_URL) {
        try {
          map.setStyle(fallbackRasterStyle());
        } catch {
          /* ignore */
        }
      }
    };
    map.on("error", onError);

    map.on("load", () => {
      styleLoaded = true;
      tryAdd3DBuildings(map);
      // Route sources + layers (empty initially)
      map.addSource("nav-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addSource("nav-route-passed", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "nav-route-casing",
        type: "line",
        source: "nav-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_CASING, "line-width": 9, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "nav-route-line",
        type: "line",
        source: "nav-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 5, "line-opacity": 0.95 },
      });
      map.addLayer({
        id: "nav-route-passed-line",
        type: "line",
        source: "nav-route-passed",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_PASSED, "line-width": 5, "line-opacity": 0.9 },
      });

      // Vehicle orb marker
      const el = document.createElement("div");
      el.className = "nav-vehicle";
      el.innerHTML = `<div class="nav-vehicle-cone"></div><div class="nav-vehicle-orb"></div>`;
      vehicleElRef.current = el;
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([initialCenter.lng, initialCenter.lat])
        .addTo(map);
      vehicleRef.current = marker;

      // Follow camera baseline
      map.setPitch(FOLLOW_PITCH);
      map.setZoom(FOLLOW_ZOOM);
    });

    // Manual pan disables follow mode
    map.on("dragstart", () => {
      if (followRef.current) onFollowChange(false);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      vehicleRef.current = null;
      vehicleElRef.current = null;
      delete (window as unknown as { __navMap?: maplibregl.Map }).__navMap;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-attempt 3D buildings after a style swap (fallback → no building layer, no-op)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onStyleData = () => tryAdd3DBuildings(map);
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Route line + passed segment updates
  // -------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("nav-route") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const coords = leg ? leg.path.map(([lat, lng]) => [lng, lat]) : [];
    src.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: coords },
    });
  }, [leg]);

  // Passed segment — throttled to meaningful progress changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource("nav-route-passed") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (!leg || leg.offline || leg.path.length < 2) {
      src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
      return;
    }
    if (Math.abs(progressMeters - lastPassedUpdateRef.current) < 15) return;
    lastPassedUpdateRef.current = progressMeters;

    // Split the path at progressMeters
    const cum = leg.cumDistances;
    let idx = 0;
    while (idx < cum.length - 1 && cum[idx + 1] < progressMeters) idx++;
    const passed: PathPoint[] = leg.path.slice(0, idx + 1);
    passed.push([pointAlongPath(leg.path, cum, progressMeters).lat, pointAlongPath(leg.path, cum, progressMeters).lng]);
    src.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: passed.map(([lat, lng]) => [lng, lat]) },
    });
  }, [leg, progressMeters]);

  // -------------------------------------------------------------------------
  // Stop markers
  // -------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of stopMarkersRef.current) m.remove();
    stopMarkersRef.current = [];

    for (const t of targets) {
      const el = document.createElement("div");
      const done = t.completed || completedIds.has(t.id);
      const isActive = t.id === activeTargetId;
      el.className = `nav-stop ${isActive ? "nav-stop-active" : ""} ${done ? "nav-stop-done" : ""}`;
      el.innerHTML =
        t.kind === "home"
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`
          : t.kind === "dropoff"
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`
            : `<span>${t.stopNumber ?? ""}</span>`;
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([t.lng, t.lat])
        .addTo(map);
      stopMarkersRef.current.push(marker);
    }

    return () => {
      for (const m of stopMarkersRef.current) m.remove();
      stopMarkersRef.current = [];
    };
  }, [targets, activeTargetId, completedIds]);

  // -------------------------------------------------------------------------
  // Overview (fit active route bounds)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (overviewRequest === 0) return;
    const map = mapRef.current;
    const currentLeg = legRef.current;
    if (!map || !currentLeg) return;
    const [[minLat, minLng], [maxLat, maxLng]] = currentLeg.bounds;
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      {
        padding: { top: 140, bottom: 300, left: 48, right: 48 },
        duration: 900,
        maxZoom: 16,
      }
    );
  }, [overviewRequest]);

  // When follow re-engages, snap back behind the vehicle
  useEffect(() => {
    if (!follow) return;
    const map = mapRef.current;
    if (!map) return;
    const s = smoothedRef.current;
    map.easeTo({
      center: [s.pos.lng, s.pos.lat],
      bearing: s.bearing,
      pitch: FOLLOW_PITCH,
      zoom: FOLLOW_ZOOM,
      duration: 600,
    });
  }, [follow]);

  // -------------------------------------------------------------------------
  // Animation loop: smooth vehicle marker + follow camera
  // -------------------------------------------------------------------------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const map = mapRef.current;
      const marker = vehicleRef.current;
      if (!map || !marker) return;

      const fix = fixRef.current;
      if (!fix) return;
      const s = smoothedRef.current;
      if (!s.initialized) {
        s.pos = { lat: fix.lat, lng: fix.lng };
        s.bearing = fix.heading ?? 0;
        s.initialized = true;
      }

      // Exponential smoothing toward the latest fix
      const k = 1 - Math.exp(-dt * 3.5);
      s.pos = lerpLatLng(s.pos, { lat: fix.lat, lng: fix.lng }, k);

      // Bearing: GPS heading when moving, else route bearing, else keep last
      let targetBearing = s.bearing;
      if (fix.heading !== null && (fix.speed === null || fix.speed > 1)) {
        targetBearing = fix.heading;
      } else {
        const currentLeg = legRef.current;
        if (currentLeg && !currentLeg.offline && currentLeg.path.length >= 2) {
          targetBearing = bearingAlongPath(currentLeg.path, currentLeg.cumDistances, progressRef.current);
        }
      }
      s.bearing = lerpBearing(s.bearing, targetBearing, 1 - Math.exp(-dt * 4));

      marker.setLngLat([s.pos.lng, s.pos.lat]);
      if (vehicleElRef.current) {
        vehicleElRef.current.style.transform = `rotate(${s.bearing}deg)`;
      }

      if (followRef.current && map.isStyleLoaded()) {
        map.jumpTo({
          center: [s.pos.lng, s.pos.lat],
          bearing: s.bearing,
          pitch: FOLLOW_PITCH,
          zoom: FOLLOW_ZOOM,
        });
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      // Inline position/size beats MapLibre's `.maplibregl-map { position: relative }`
      // stylesheet rule, which would otherwise collapse the container to 0-height.
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      className={MAP_DARK_FILTER ? "nav-map-dark" : undefined}
      aria-label="Navigation map"
    />
  );
}

// ---------------------------------------------------------------------------
// 3D buildings — only when the loaded vector style exposes a building layer.
// Silently skips on raster fallback or styles without buildings.
// ---------------------------------------------------------------------------
function tryAdd3DBuildings(map: maplibregl.Map) {
  if (!ENABLE_3D_BUILDINGS) return;
  try {
    if (map.getLayer("sidekick-3d-buildings")) return;
    const style = map.getStyle();
    if (!style?.layers) return;
    const buildingLayer = style.layers.find(
      (l) =>
        (l as { "source-layer"?: string })["source-layer"] === "building" &&
        (l.type === "fill" || l.type === "fill-extrusion")
    ) as (maplibregl.LayerSpecification & { source?: string; "source-layer"?: string }) | undefined;
    if (!buildingLayer || !buildingLayer.source || !buildingLayer["source-layer"]) return;

    const before = style.layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: "sidekick-3d-buildings",
        type: "fill-extrusion",
        source: buildingLayer.source,
        "source-layer": buildingLayer["source-layer"],
        minzoom: 15,
        paint: {
          "fill-extrusion-color": "#1e293b",
          "fill-extrusion-opacity": 0.6,
          "fill-extrusion-height": [
            "coalesce",
            ["get", "render_height"],
            ["get", "height"],
            10,
          ] as unknown as maplibregl.ExpressionSpecification,
          "fill-extrusion-base": [
            "coalesce",
            ["get", "render_min_height"],
            ["get", "min_height"],
            0,
          ] as unknown as maplibregl.ExpressionSpecification,
        },
      } as maplibregl.LayerSpecification,
      before
    );
  } catch {
    /* 3D buildings are best-effort only */
  }
}
