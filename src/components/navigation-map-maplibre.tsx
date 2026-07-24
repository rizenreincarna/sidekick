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
// When using the built-in dark-tile basemap the canvas is already dark, so the
// invert filter is OFF by default. Set NEXT_PUBLIC_MAP_DARK_FILTER=true only if
// you switch NEXT_PUBLIC_MAP_STYLE_URL to a LIGHT vector/raster style.
const MAP_DARK_FILTER = (process.env.NEXT_PUBLIC_MAP_DARK_FILTER || "false") === "true";

const FOLLOW_PITCH = 62;
const FOLLOW_ZOOM = 17;

const ROUTE_COLOR = "#67e8f9"; // cyan-300 — bright high-contrast on the dark basemap
const ROUTE_CASING = "#155e75"; // cyan-900 casing for edge definition
const ROUTE_PASSED = "rgba(15, 23, 42, 0.85)";

function fallbackRasterStyle(): maplibregl.StyleSpecification {
  // Use the app's own dark-tile proxy (CARTO dark_matter, OSM-based, disk+memory
  // cached) as the default basemap. This gives a true dark cockpit look WITHOUT
  // a canvas filter, so the teal route line renders crisp and visible.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    version: 8,
    sources: {
      sidekick: {
        type: "raster",
        tiles: [`${origin}/api/tile/{z}/{x}/{y}.png`],
        tileSize: 256,
        // OSM via CARTO dark_matter — required attribution.
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    layers: [{ id: "sidekick-raster", type: "raster", source: "sidekick" }],
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
  // SVG overlay route line: avoids MapLibre v6 GeoJSON worker deadlocks.
  const routeSvgRef = useRef<SVGPolylineElement | null>(null);
  const routePathRef = useRef<PathPoint[]>([]);

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
      attributionControl: { compact: true },
      logoPosition: "bottom-left",
    });
    mapRef.current = map;
    // Debug/testing handle (also used by the ?simulate=1 helper)
    (window as unknown as { __navMap?: maplibregl.Map }).__navMap = map;

    // Graceful fallback: if a custom vector style fails to load, use raster OSM
    let styleLoaded = false;
    const onError = (e: maplibregl.ErrorEvent) => {
      const msg = e?.error ? String(e.error.message || e.error) : String(e?.type || "error");
      // Surface map errors (failed tiles, source/layer/paint issues) for diagnosis.
      const prev = document.documentElement.getAttribute("data-nav-map-error") || "";
      if (!prev.includes(msg.slice(0, 60))) {
        document.documentElement.setAttribute("data-nav-map-error", (prev + " | " + msg.slice(0, 140)).slice(0, 500));
      }
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
      document.documentElement.setAttribute("data-nav-load", "1");
      try { tryAdd3DBuildings(map); } catch (e) { document.documentElement.setAttribute("data-nav-load-err", "3d:"+e); }
      // Create empty route source+layers; actual geometry is injected via
      // syncRouteSource once the leg is known.
      try { ensureRouteLayers(map); } catch (e) { document.documentElement.setAttribute("data-nav-load-err", "layers:"+e); }
      try { map.setPitch(FOLLOW_PITCH); map.setZoom(FOLLOW_ZOOM); } catch {}
    });

    // Manual pan disables follow mode
    map.on("dragstart", () => {
      if (followRef.current) onFollowChange(false);
    });

    // SVG route-line overlay (reliable fallback for MapLibre v6 GeoJSON worker)
    const mount = containerRef.current;
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "nav-route-svg");
    svg.style.position = "absolute";
    svg.style.inset = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.pointerEvents = "none";
    svg.style.zIndex = "1";
    const polyline = document.createElementNS(svgNs, "polyline");
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", ROUTE_COLOR);
    polyline.setAttribute("stroke-width", "5");
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    svg.appendChild(polyline);
    if (mount) mount.appendChild(svg);
    routeSvgRef.current = polyline;

    const updateOverlay = () => updateRouteOverlay(map, routeSvgRef.current, routePathRef.current);
    map.on("move", updateOverlay);
    map.on("resize", updateOverlay);

    return () => {
      map.off("move", updateOverlay);
      map.off("resize", updateOverlay);
      svg.remove();
      map.remove();
      mapRef.current = null;
      vehicleRef.current = null;
      vehicleElRef.current = null;
      routeSvgRef.current = null;
      delete (window as unknown as { __navMap?: maplibregl.Map }).__navMap;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-attempt 3D buildings + re-sync route layers after style (re)loads.
  // Covers: leg arriving before the style finished loading, and style swaps
  // (custom style → raster fallback) which wipe previously added layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onStyleData = () => {
      // Create the vehicle marker on styledata too — with the raster dark-tile
      // proxy the "load" event sometimes never fires (only styledata does),
      // which would otherwise leave the orb marker uncreated.
      if (!vehicleRef.current) {
        const el = document.createElement("div");
        el.innerHTML = `<div class="nav-vehicle"><div class="nav-vehicle-cone"></div><div class="nav-vehicle-orb"></div></div>`;
        vehicleElRef.current = el.firstElementChild as HTMLDivElement;
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([initialCenter.lng, initialCenter.lat])
          .addTo(map);
        vehicleRef.current = marker;
      }
      tryAdd3DBuildings(map);
      ensureRouteLayers(map);
      updateRouteOverlay(map, routeSvgRef.current, routePathRef.current);
      lastPassedUpdateRef.current = -Infinity; // force passed-segment refresh
      syncPassedSource(map, legRef.current, progressRef.current, lastPassedUpdateRef);
      // Debug: the main route line is SVG; only passed-segment layer exists here.
      try {
        const feats = map.queryRenderedFeatures(undefined, { layers: ["nav-route-passed-line"] });
        document.documentElement.setAttribute("data-nav-rendered-features", String(feats.length));
      } catch (e) {
        document.documentElement.setAttribute("data-nav-rendered-features", "err:" + e);
      }
    };
    map.on("styledata", onStyleData);
    // Trigger once immediately if the style is already loaded.
    if (map.isStyleLoaded()) onStyleData();
    return () => {
      map.off("styledata", onStyleData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Route line + passed segment updates
  // -------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routePathRef.current = leg?.path || [];
    syncRouteSource(map, leg);
    updateRouteOverlay(map, routeSvgRef.current, routePathRef.current);
  }, [leg]);

  // Passed segment — throttled to meaningful progress changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncPassedSource(map, leg, progressMeters, lastPassedUpdateRef);
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

      if (followRef.current) {
        // jumpTo/easeTo operate on the map transform and do not require a
        // fully-loaded style. Guarding with isStyleLoaded() caused the camera
        // to stay stuck at the initial center until the user pressed Recenter.
        const center: [number, number] = [s.pos.lng, s.pos.lat];
        try {
          map.jumpTo({
            center,
            bearing: s.bearing,
            pitch: FOLLOW_PITCH,
            zoom: FOLLOW_ZOOM,
          });
        } catch {
          // If jumpTo fails during a style transition, fall back to easeTo.
          map.easeTo({
            center,
            bearing: s.bearing,
            pitch: FOLLOW_PITCH,
            zoom: FOLLOW_ZOOM,
            duration: 0,
          });
        }
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
// Route sources/layers — idempotent helpers (safe to call on every styledata)
// ---------------------------------------------------------------------------
function ensureRouteLayers(map: maplibregl.Map) {
  try {
    // Passed-segment source + layer
    if (!map.getSource("nav-route-passed")) {
      map.addSource("nav-route-passed", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
    }
    if (!map.getLayer("nav-route-passed-line")) {
      map.addLayer({
        id: "nav-route-passed-line",
        type: "line",
        source: "nav-route-passed",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_PASSED, "line-width": 8, "line-opacity": 0.9 },
      });
    }

    // Debug hook - confirms the passed-segment layer exists on the live map.
    // The main route line is rendered via the SVG overlay, not MapLibre layers.
    const root = document.documentElement;
    root.setAttribute("data-nav-source", "0");
    root.setAttribute("data-nav-layer", map.getLayer("nav-route-passed-line") ? "1" : "0");
  } catch (e) {
    document.documentElement.setAttribute("data-nav-ensure-error", String(e));
  }
}

function syncRouteSource(map: maplibregl.Map, leg: NavLeg | null) {
  // The primary route line is the SVG overlay drawn in updateRouteOverlay.
  // We no longer maintain a MapLibre GeoJSON source for the main route line
  // because MapLibre v6's GeoJSON worker can deadlock and render stray lines.
  const coords = leg ? leg.path.map(([lat, lng]) => [lng, lat]) : [];
  document.documentElement.setAttribute("data-nav-route-points", String(coords.length));
  document.documentElement.removeAttribute("data-nav-sync-error");
}

function updateRouteOverlay(
  map: maplibregl.Map,
  polyline: SVGPolylineElement | null,
  path: PathPoint[]
) {
  if (!polyline) return;
  if (path.length < 2) {
    polyline.setAttribute("points", "");
    return;
  }
  const w = map.getCanvas().clientWidth;
  const h = map.getCanvas().clientHeight;
  // Sub-sample: one projected point per ~3 px of path is plenty for a smooth line.
  const step = Math.max(1, Math.floor(path.length / 400));
  const pts: string[] = [];
  for (let i = 0; i < path.length; i += step) {
    const [lat, lng] = path[i];
    const p = map.project([lng, lat]);
    // Include points slightly outside viewport so lines crossing the edge render.
    if (p.x > -100 && p.x < w + 100 && p.y > -100 && p.y < h + 100) {
      pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
  }
  // Always include the last point.
  const [lat, lng] = path[path.length - 1];
  const p = map.project([lng, lat]);
  pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  polyline.setAttribute("points", pts.join(" "));
}

function syncPassedSource(
  map: maplibregl.Map,
  leg: NavLeg | null,
  progressMeters: number,
  lastUpdateRef: React.MutableRefObject<number>
) {
  const src = map.getSource("nav-route-passed") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  if (!leg || leg.offline || leg.path.length < 2) {
    src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
    return;
  }
  if (Math.abs(progressMeters - lastUpdateRef.current) < 15) return;
  lastUpdateRef.current = progressMeters;

  // Split the path at progressMeters
  const cum = leg.cumDistances;
  let idx = 0;
  while (idx < cum.length - 1 && cum[idx + 1] < progressMeters) idx++;
  const passed: PathPoint[] = leg.path.slice(0, idx + 1);
  const snap = pointAlongPath(leg.path, cum, progressMeters);
  passed.push([snap.lat, snap.lng]);
  src.setData({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: passed.map(([lat, lng]) => [lng, lat]) },
  });
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
