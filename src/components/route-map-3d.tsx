"use client";

// Three.js 3D route map — CLIENT ONLY (uses window/document).
// Must be dynamically imported with ssr: false from a server component.
//
// Renders the Klang Valley as a flat plane textured with map tiles (proxied
// via /api/tile to comply with OSM policy), plots optimized route stops as 3D
// pins colored by zone, draws the route path as an animated 3D line, shows
// HOME / DROP_A / DROP_B as special markers, animates a vehicle dot along the
// route, and supports zoom/pan + click-to-select stops with raycasting.
//
// Rotation is DISABLED — the map is 2D, so the viewing angle is fixed.
// HTML overlay labels (stop number, customer, ETA) are projected from 3D
// positions to screen space every frame for a tasteful information layer.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FIXED_LOCATIONS, VEHICLE } from "@/lib/route-model";
import { fmtMalaysiaTime } from "@/lib/vroom";
import type { OptimizedRouteResult, VroomStopDetail } from "@/lib/vroom";
import { Navigation, X, Phone, MapPin, Home as HomeIcon, Clock, Package, Lock, Unlock, CheckCircle2 } from "lucide-react";
import { getTimeOfDay, fetchWeather, createAmbientLife, type AmbientSystem, type TimeOfDayConfig, type WeatherInfo } from "@/lib/map-ambient";

// ---------------------------------------------------------------------------
// Flat local-tangent-plane projection (matches flat PlaneGeometry + tile tex)
// ---------------------------------------------------------------------------
const MAP_CENTER_LAT = 3.05;
const MAP_CENTER_LON = 101.6;
const SCALE = 10000; // meters per unit

// Background map layer bounding box — covers all of Selangor + KL
const SELANGOR_KL_BBOX = { minLat: 2.7, maxLat: 3.7, minLon: 101.2, maxLon: 102.0 };

function latLonToVector3(lat: number, lon: number): THREE.Vector3 {
  const latOffset = (lat - MAP_CENTER_LAT) * (Math.PI / 180) * SCALE;
  const lonOffset =
    (lon - MAP_CENTER_LON) *
    (Math.PI / 180) *
    SCALE *
    Math.cos(MAP_CENTER_LAT * (Math.PI / 180));
  return new THREE.Vector3(lonOffset, 0, -latOffset);
}

/** Inverse projection: 3D world position → { lat, lon } */
function vector3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const lat = MAP_CENTER_LAT - v.z * (180 / Math.PI) / SCALE;
  const lon = MAP_CENTER_LON + v.x * (180 / Math.PI) / (SCALE * Math.cos(MAP_CENTER_LAT * Math.PI / 180));
  return { lat, lon };
}

// Zone -> color (cycle through a palette)
const ZONE_COLORS = [
  0x4f8cff, 0xf97316, 0x22c55e, 0xa855f7, 0xef4444, 0x06b6d4,
  0xeab308, 0xec4899, 0x14b8a6, 0x8b5cf6, 0xf59e0b, 0x10b981,
  0x6366f1, 0xdb2777,
];
function zoneColor(zone: number): number {
  return ZONE_COLORS[(zone - 1) % ZONE_COLORS.length];
}
function zoneColorHex(zone: number): string {
  return "#" + zoneColor(zone).toString(16).padStart(6, "0");
}

// Color logic for stop markers: office=blue, done=green, not done=orange
function stopColorHex(stop: { isOffice: boolean; orderId: string }, trackingTokens?: Record<string, { token: string; completed: boolean }>): string {
  if (stop.isOffice) return "#3b82f6";
  if (trackingTokens?.[stop.orderId]?.completed) return "#22c55e";
  return "#f97316";
}

// Google Maps navigation URL
function gmapsNavUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

// ---------------------------------------------------------------------------
// Web Mercator tile math
// ---------------------------------------------------------------------------
function lonToTileX(lon: number, z: number) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}
function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, z)
  );
}
function tileYToLat(y: number, z: number) {
  const n = Math.pow(2, z);
  const r = Math.PI * (1 - (2 * y) / n);
  return (Math.atan(Math.sinh(r)) * 180) / Math.PI;
}
function tileXToLon(x: number, z: number) {
  const n = Math.pow(2, z);
  return (x / n) * 360 - 180;
}

// ---------------------------------------------------------------------------
// Label CSS (injected once)
// ---------------------------------------------------------------------------
const LABEL_CSS = `
body { overscroll-behavior-y: none; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.r3d-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 20; }
.r3d-label {
  position: absolute; transform: translate(-50%, -100%);
  display: flex; align-items: flex-start; gap: 4px;
  white-space: nowrap; transition: opacity 0.2s;
  will-change: left, top;
}
.r3d-label-num {
  flex-shrink: 0; width: 18px; height: 18px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 0.625rem; font-weight: 700; color: #fff;
  border: 1.5px solid rgba(255,255,255,0.3);
  box-shadow: 0 1px 4px rgba(0,0,0,0.6);
}
.r3d-label-body {
  background: oklch(0.13 0.02 180 / 0.82); border: 1px solid oklch(0.28 0.03 180 / 0.5);
  border-radius: 8px; padding: 2px 7px;
  font-size: 0.75rem; line-height: 1.3; color: oklch(0.93 0.01 180);
  backdrop-filter: blur(6px); max-width: 160px; overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.r3d-label-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.r3d-label-meta { font-size: 0.625rem; color: oklch(0.6 0.02 180); }
.r3d-label-special .r3d-label-body { font-weight: 700; font-size: 0.625rem; letter-spacing: 0.05em; }
.r3d-label-selected .r3d-label-body {
  border-color: oklch(0.7 0.14 180 / 0.6); box-shadow: 0 0 0 1px oklch(0.7 0.14 180 / 0.3), 0 2px 12px rgba(0,0,0,0.5);
}
`;

interface Props {
  route: OptimizedRouteResult;
  onSelectStop?: (stop: VroomStopDetail) => void;
  selectedOrderId?: string | null;
  heroProfile?: { heroName: string; plateNumber: string; vehicleColor: string; vehicleModel: string; homeLatitude?: number | null; homeLongitude?: number | null } | null;
  driverPosition?: { latitude: number; longitude: number } | null;
  routeStatus?: string;
  trackingTokens?: Record<string, { token: string; completed: boolean }>;
  variant?: "planner" | "tracking";
  customerOrderId?: string | null;
  etaInfo?: { minutes: number; distanceKm: number; stopsBefore: number } | null;
  customRoutePath?: [number, number][] | null;
}

// Escape user-supplied text before inserting into innerHTML (prevent XSS)
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default function RouteMap3D({ route, onSelectStop, selectedOrderId, heroProfile, driverPosition, routeStatus, trackingTokens, variant = "planner", customerOrderId, etaInfo, customRoutePath }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectStop);
  const selectedRef = useRef(selectedOrderId);
  const routeRef = useRef(route);
  // Touch gesture lock: when locked, 1-finger touches scroll the page and only
  // 2-finger gestures interact with the map (pan + pinch-zoom).
  // When unlocked, 1-finger drag pans the map (standard OrbitControls behavior).
  const [locked, setLocked] = useState(true);
  const [weatherInfo, setWeatherInfo] = useState<WeatherInfo | null>(null);
  const [timeOfDayInfo, setTimeOfDayInfo] = useState<TimeOfDayConfig | null>(null);
  const lockedRef = useRef(true);
  const controlsRef = useRef<OrbitControls | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const driverPosRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const routeStatusRef = useRef<string | undefined>(undefined);
  const trackingTokensRef = useRef<Record<string, { token: string; completed: boolean }> | undefined>(undefined);
  // Refs for updating stop marker colors when tracking tokens change
  const stopMeshesRef = useRef<{ orderId: string; isOffice: boolean; materials: THREE.MeshStandardMaterial[] }[]>([]);
  const stopLabelsRef = useRef<{ orderId: string; numEl: HTMLDivElement | null; nameEl: HTMLDivElement | null }[]>([]);
  onSelectRef.current = onSelectStop;
  selectedRef.current = selectedOrderId;
  routeRef.current = route;
  lockedRef.current = locked;
  driverPosRef.current = driverPosition ?? null;
  routeStatusRef.current = routeStatus;
  trackingTokensRef.current = trackingTokens;

  // ---- Derived data for React overlays ----
  const allStops = useMemo(() => {
    const list: { stop: VroomStopDetail; num: number; loadIdx: number }[] = [];
    let n = 0;
    route.loads.forEach((load, li) => {
      load.stops.forEach((s) => {
        n++;
        list.push({ stop: s, num: n, loadIdx: li });
      });
    });
    return list;
  }, [route]);

  const selectedInfo = useMemo(() => {
    if (!selectedOrderId) return null;
    for (const { stop, num, loadIdx } of allStops) {
      if (stop.orderId === selectedOrderId) return { stop, num, loadIdx };
    }
    return null;
  }, [allStops, selectedOrderId]);

  const stats = useMemo(() => {
    const km = (route.totalDistanceMeters / 1000).toFixed(1);
    const h = Math.floor(route.totalDurationSeconds / 3600);
    const m = Math.round((route.totalDurationSeconds % 3600) / 60);
    return {
      km,
      dur: h > 0 ? `${h}h ${m}m` : `${m}m`,
      stops: route.totalStops,
      loads: route.loads.length,
      pts: route.totalPoints,
      cap: route.capacity,
    };
  }, [route]);

  useEffect(() => {
    const mount = mountRef.current;
    const labelsContainer = labelsRef.current;
    if (!mount || !labelsContainer) return;
    const mountEl: HTMLDivElement = mount;
    const labelsEl: HTMLDivElement = labelsContainer;

    // Inject label CSS once
    if (!document.getElementById("r3d-label-css")) {
      const style = document.createElement("style");
      style.id = "r3d-label-css";
      style.textContent = LABEL_CSS;
      document.head.appendChild(style);
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17); // will be updated by time-of-day
    const isTracking = variant === "tracking";
    // ---- Time of Day: set scene colors based on real Malaysia time ----
    const tod = getTimeOfDay();
    scene.background = new THREE.Color(tod.skyColor);
    scene.fog = new THREE.Fog(tod.fogColor, tod.fogNear, tod.fogFar);
    // Resolve home location: use hero profile's custom home if set, else default
    const homeLoc = (heroProfile?.homeLatitude != null && heroProfile?.homeLongitude != null)
      ? { latitude: heroProfile.homeLatitude, longitude: heroProfile.homeLongitude, name: "Home", address: "Custom home" }
      : FIXED_LOCATIONS.HOME;

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // ---- DISABLE ROTATION: map is 2D, keep a fixed viewing angle ----
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = true;
    // ---- Remap 1-finger touch from ROTATE to PAN ----
    // OrbitControls defaults: 1-finger=rotate, 2-finger=dolly+pan.
    // Since rotation is disabled (2D map), remap 1-finger to PAN so
    // single-finger drag pans the map (standard map behavior).
    controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // ---- Touch gesture lock ----
    // When locked: 1-finger touches pass through to the page (scroll),
    // 2-finger gestures pan + zoom the map.
    // When unlocked: 1-finger drag pans the map (standard).
    controlsRef.current = controls;
    canvasRef.current = renderer.domElement;
    const initTA = lockedRef.current ? "pan-y" : "none";
    renderer.domElement.style.touchAction = initTA;
    mountEl.style.touchAction = initTA;
    mountEl.style.overscrollBehaviorY = "none";
    controls.enabled = !lockedRef.current; // disabled when locked (re-enabled on 2-finger)

    const onTouchChange = (e: TouchEvent) => {
      if (!lockedRef.current) return; // unlocked = controls always on
      const twoFingers = e.touches.length >= 2;
      controls.enabled = twoFingers;
    };
    renderer.domElement.addEventListener("touchstart", onTouchChange, { capture: true });
    renderer.domElement.addEventListener("touchmove", onTouchChange, { capture: true });
    renderer.domElement.addEventListener("touchend", onTouchChange, { capture: true });
    renderer.domElement.addEventListener("touchcancel", onTouchChange, { capture: true });

    // Handle WebGL context loss — prevents crash when GPU resources are reclaimed
    const onContextLost = (e: Event) => {
      e.preventDefault();
      console.warn("[RouteMap3D] WebGL context lost");
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);

    // Lights — dynamic based on time of day
    const ambient = new THREE.AmbientLight(tod.ambientColor, tod.ambientIntensity);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(tod.directionalColor, tod.directionalIntensity);
    dir.position.set(...tod.directionalPos);
    scene.add(dir);

    // Collect all points for bounds (exclude HOME and DROP locations in tracking variant)
    const allPts: { lat: number; lon: number }[] = isTracking
      ? []
      : [homeLoc, FIXED_LOCATIONS.DROP_A, FIXED_LOCATIONS.DROP_B].map((l) => ({ lat: l.latitude, lon: l.longitude }));
    // In tracking mode, include driver position in bounds if available
    if (isTracking && driverPosition) {
      allPts.push({ lat: driverPosition.latitude, lon: driverPosition.longitude });
    }
    for (const load of route.loads) {
      for (const s of load.stops) {
        allPts.push({ lat: s.latitude, lon: s.longitude });
      }
    }

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of allPts) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }
    // padding
    const padLat = (maxLat - minLat) * 0.15 || 0.05;
    const padLon = (maxLon - minLon) * 0.15 || 0.05;
    minLat -= padLat; maxLat += padLat;
    minLon -= padLon; maxLon += padLon;

    // ---- Tile plane helper (used for both background and detail layers) ----
    const disposables: (THREE.Material | THREE.BufferGeometry | THREE.Texture)[] = [];

    function createTilePlane(
      bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number },
      zoom: number,
      yOffset: number
    ): { center: THREE.Vector3; width: number; depth: number } {
      let tz = zoom;
      let tx0 = Math.floor(lonToTileX(bbox.minLon, tz));
      let tx1 = Math.floor(lonToTileX(bbox.maxLon, tz));
      let ty0 = Math.floor(latToTileY(bbox.maxLat, tz));
      let ty1 = Math.floor(latToTileY(bbox.minLat, tz));
      let tX = tx1 - tx0 + 1;
      let tY = ty1 - ty0 + 1;
      // Fall back to lower zoom if too many tiles
      while (tX * tY > 80 && tz > 1) {
        tz--;
        tx0 = Math.floor(lonToTileX(bbox.minLon, tz));
        tx1 = Math.floor(lonToTileX(bbox.maxLon, tz));
        ty0 = Math.floor(latToTileY(bbox.maxLat, tz));
        ty1 = Math.floor(latToTileY(bbox.minLat, tz));
        tX = tx1 - tx0 + 1;
        tY = ty1 - ty0 + 1;
      }
      const TILE = 256;
      const canvas = document.createElement("canvas");
      canvas.width = tX * TILE;
      canvas.height = tY * TILE;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter; // mipmaps fix pixelation at zoom-out
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      disposables.push(tex);
      // Geographic bounds of the mosaic
      const lonL = tileXToLon(tx0, tz);
      const lonR = tileXToLon(tx1 + 1, tz);
      const latT = tileYToLat(ty0, tz);
      const latB = tileYToLat(ty1 + 1, tz);
      const tl3 = latLonToVector3(latT, lonL);
      const br3 = latLonToVector3(latB, lonR);
      const pw = Math.abs(br3.x - tl3.x);
      const ph = Math.abs(br3.z - tl3.z);
      const pc = new THREE.Vector3((tl3.x + br3.x) / 2, 0, (tl3.z + br3.z) / 2);
      const geo = new THREE.PlaneGeometry(pw, ph);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pc);
      mesh.position.y = yOffset;
      scene.add(mesh);
      disposables.push(geo, mat);
      // Load tiles asynchronously
      for (let i = 0; i < tX; i++) {
        for (let j = 0; j < tY; j++) {
          const tx = tx0 + i;
          const ty = ty0 + j;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            ctx.drawImage(img, i * TILE, j * TILE, TILE, TILE);
            tex.needsUpdate = true;
          };
          img.onerror = () => {};
          img.src = `/api/tile/${tz}/${tx}/${ty}.png?v=esri1`;
        }
      }
      return { center: pc, width: pw, depth: ph };
    }

    // ---- Background layer: covers all of Selangor + KL at z=10 ----
    const bgPlane = createTilePlane(SELANGOR_KL_BBOX, 10, 0);

    // ---- Dynamic detail tile layer ----
    // Loads tiles at a zoom level matching the camera's current view distance.
    // When the user zooms in, higher-resolution tiles (z=14–17) are loaded.
    // When zooming out, lower-resolution tiles are loaded. This avoids the
    // pixelation that occurs when static z=13 tiles are stretched.
    const detailCanvas = document.createElement("canvas");
    detailCanvas.width = 256;
    detailCanvas.height = 256;
    const detailCtx = detailCanvas.getContext("2d")!;
    detailCtx.fillStyle = "#1a1a2e";
    detailCtx.fillRect(0, 0, 256, 256);
    const detailTex = new THREE.CanvasTexture(detailCanvas);
    detailTex.colorSpace = THREE.SRGBColorSpace;
    detailTex.minFilter = THREE.LinearFilter; // no mipmaps — detail tiles update frequently during pan/zoom
    detailTex.magFilter = THREE.LinearFilter;
    detailTex.generateMipmaps = false;
    const detailMat = new THREE.MeshBasicMaterial({ map: detailTex, transparent: true, opacity: 1 });
    const detailGeo = new THREE.PlaneGeometry(1, 1);
    detailGeo.rotateX(-Math.PI / 2);
    const detailMesh = new THREE.Mesh(detailGeo, detailMat);
    detailMesh.position.y = 0.01;
    detailMesh.visible = false; // hidden until first tiles load
    scene.add(detailMesh);
    disposables.push(detailTex, detailMat, detailGeo);

    let detailZoom = -1;
    let detailTx0 = 0, detailTy0 = 0;
    let detailLoadId = 0;
    let lastDetailCheck = 0;
    let detailTexDirty = false; // batch texture updates

    function updateDetailTiles() {
      // Throttle: only check every 300ms (not every frame)
      const now = performance.now();
      if (now - lastDetailCheck < 300) return;
      lastDetailCheck = now;
      const tgt = controls.target;
      const dist = camera.position.distanceTo(tgt);
      const viewSpan = dist * 2.0;
      const spanDeg = viewSpan * (180 / Math.PI) / SCALE;
      const cosLat = Math.cos(MAP_CENTER_LAT * Math.PI / 180);
      const center = vector3ToLatLon(tgt);
      const halfSpanLat = spanDeg * 0.5;
      const halfSpanLon = spanDeg * 0.5 / cosLat;

      // Find the highest zoom level (13–17) that fits within 100 tiles
      let zoom = -1;
      let tx0 = 0, tx1 = 0, ty0 = 0, ty1 = 0, tX = 0, tY = 0;
      for (let z = 17; z >= 13; z--) {
        const x0 = Math.floor(lonToTileX(center.lon - halfSpanLon, z));
        const x1 = Math.floor(lonToTileX(center.lon + halfSpanLon, z));
        const y0 = Math.floor(latToTileY(center.lat + halfSpanLat, z));
        const y1 = Math.floor(latToTileY(center.lat - halfSpanLat, z));
        const nx = x1 - x0 + 1;
        const ny = y1 - y0 + 1;
        if (nx * ny <= 100) {
          zoom = z;
          tx0 = x0; tx1 = x1; ty0 = y0; ty1 = y1;
          tX = nx; tY = ny;
          break;
        }
      }

      // No suitable zoom found (view too wide even at z=13) — hide detail, background suffices
      if (zoom === -1) {
        detailMesh.visible = false;
        return;
      }
      if (zoom === detailZoom && tx0 === detailTx0 && ty0 === detailTy0) return;

      detailZoom = zoom;
      detailTx0 = tx0;
      detailTy0 = ty0;
      const loadId = ++detailLoadId;
      const TILE = 256;
      const newW = tX * TILE;
      const newH = tY * TILE;

      // Resize canvas if needed — preserve old content as placeholder (no dark flash).
      // Setting canvas.width clears it, so we save → resize → restore old content
      // stretched to the new dimensions. New tiles then load on top progressively.
      if (detailCanvas.width !== newW || detailCanvas.height !== newH) {
        const tmp = document.createElement("canvas");
        tmp.width = detailCanvas.width;
        tmp.height = detailCanvas.height;
        tmp.getContext("2d")!.drawImage(detailCanvas, 0, 0);
        detailCanvas.width = newW;
        detailCanvas.height = newH;
        // Restore old content stretched as placeholder
        detailCtx.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, newW, newH);
      }

      // Update plane geometry to match tile grid geographic bounds
      const lonL = tileXToLon(tx0, zoom);
      const lonR = tileXToLon(tx1 + 1, zoom);
      const latT = tileYToLat(ty0, zoom);
      const latB = tileYToLat(ty1 + 1, zoom);
      const tl3 = latLonToVector3(latT, lonL);
      const br3 = latLonToVector3(latB, lonR);
      const pw = Math.abs(br3.x - tl3.x);
      const ph = Math.abs(br3.z - tl3.z);
      const pc = new THREE.Vector3((tl3.x + br3.x) / 2, 0.01, (tl3.z + br3.z) / 2);
      const newGeo = new THREE.PlaneGeometry(pw, ph);
      newGeo.rotateX(-Math.PI / 2);
      detailMesh.geometry.dispose();
      detailMesh.geometry = newGeo;
      detailMesh.position.copy(pc);
      detailMesh.visible = true;

      // Load tiles asynchronously — draw directly onto detailCanvas (progressive update).
      // Each tile overwrites the placeholder as it arrives. No waiting for all tiles.
      for (let i = 0; i < tX; i++) {
        for (let j = 0; j < tY; j++) {
          const tx = tx0 + i;
          const ty = ty0 + j;
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (loadId !== detailLoadId) return; // stale load — skip
            detailCtx.drawImage(img, i * TILE, j * TILE, TILE, TILE);
            detailTexDirty = true; // batch: update texture once per frame
          };
          img.onerror = () => {};
          img.src = `/api/tile/${zoom}/${tx}/${ty}.png?v=esri1`;
        }
      }
      detailTexDirty = true;
    }

    // ---- Scene framing: focus on the pickup area (stops) ----
    // Calculate span from stops bbox (not from static detail plane)
    const stopsTl = latLonToVector3(maxLat, minLon);
    const stopsBr = latLonToVector3(minLat, maxLon);
    const stopsCenter = new THREE.Vector3((stopsTl.x + stopsBr.x) / 2, 0, (stopsTl.z + stopsBr.z) / 2);
    const span = Math.max(Math.abs(stopsBr.x - stopsTl.x), Math.abs(stopsBr.z - stopsTl.z), 1);
    const bgSpan = Math.max(bgPlane.width, bgPlane.depth, 1);
    camera.near = span * 0.01;
    camera.far = bgSpan * 100;
    // Camera looks at the stops area — the wider map is visible when panning/zooming out
    camera.position.set(
      stopsCenter.x,
      span * 0.8,
      stopsCenter.z + span * 0.4
    );
    camera.lookAt(stopsCenter);
    camera.updateProjectionMatrix();
    controls.target.copy(stopsCenter);
    controls.minDistance = span * 0.08;
    controls.maxDistance = bgSpan * 3;
    controls.update();

    // ---- Ambient life system: birds, clouds, planes, drones, rain, stars ----
    // Weather is fetched async (Open-Meteo API) — map starts with null weather.
    // Respect reduced-motion: skip the animated particle life when the user
    // prefers reduced motion (keeps the static scene + lighting, drops the motion).
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let ambientSystem: AmbientSystem | null = null;
    let currentWeatherInfo: WeatherInfo | null = null;
    let currentTod: TimeOfDayConfig = tod;

    // Create ambient life after we know the span (skip particles if reduced motion)
    ambientSystem = prefersReducedMotion ? null : createAmbientLife(scene, span, null, tod);

    // Fetch weather for the map center area (Selangor/KL)
    const weatherLat = (minLat + maxLat) / 2;
    const weatherLon = (minLon + maxLon) / 2;
    fetchWeather(weatherLat, weatherLon).then((w) => {
      if (w) {
        currentWeatherInfo = w;
        ambientSystem?.setWeather(w);
        setWeatherInfo(w);
      }
    });

    // Set initial time-of-day label for UI
    setTimeOfDayInfo(tod);

    // ---- 3D model helpers ----
    // House model: box body + 4-sided pyramid roof — used for HOME location
    function makeHouse(lat: number, lon: number, color: number, size: number) {
      const group = new THREE.Group();
      const wallMat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.25, metalness: 0.1, roughness: 0.8,
      });
      const roofMat = new THREE.MeshStandardMaterial({
        color: 0x6b4226, emissive: 0x2a1810, emissiveIntensity: 0.15, metalness: 0.1, roughness: 0.9,
      });
      // House body (box)
      const bodyGeo = new THREE.BoxGeometry(size, size * 0.4, size);
      const body = new THREE.Mesh(bodyGeo, wallMat);
      body.position.y = size * 0.2;
      body.userData.kind = "HOME";
      group.add(body);
      // Roof (4-sided pyramid)
      const roofGeo = new THREE.ConeGeometry(size * 0.72, size * 0.35, 4);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = size * 0.4 + size * 0.175;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      // Ground ring
      const ringGeo = new THREE.RingGeometry(size * 0.45, size * 0.7, 20);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.5;
      group.add(ring);
      disposables.push(bodyGeo, roofGeo, wallMat, roofMat, ringGeo, ringMat);
      const pos = latLonToVector3(lat, lon);
      group.position.copy(pos);
      scene.add(group);
      return { group, hitMesh: body };
    }

    // Office building model: wide base + tall tower — used for DROP_A / DROP_B
    function makeOffice(lat: number, lon: number, color: number, size: number) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.3, metalness: 0.4, roughness: 0.5,
      });
      // Base (wider, shorter)
      const baseGeo = new THREE.BoxGeometry(size * 0.85, size * 0.15, size * 0.85);
      const base = new THREE.Mesh(baseGeo, mat);
      base.position.y = size * 0.075;
      group.add(base);
      // Tower (tall, narrower)
      const towerGeo = new THREE.BoxGeometry(size * 0.5, size * 0.8, size * 0.5);
      const tower = new THREE.Mesh(towerGeo, mat);
      tower.position.y = size * 0.15 + size * 0.4;
      tower.userData.kind = "OFFICE";
      group.add(tower);
      // Ground ring
      const ringGeo = new THREE.RingGeometry(size * 0.5, size * 0.75, 20);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.5;
      group.add(ring);
      disposables.push(baseGeo, towerGeo, mat, ringGeo, ringMat);
      const pos = latLonToVector3(lat, lon);
      group.position.copy(pos);
      scene.add(group);
      return { group, hitMesh: tower };
    }

    // Stop pin: thin stem + sphere on top — compact marker for customer pickups
    function makeStopPin(lat: number, lon: number, color: number, size: number) {
      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.5,
      });
      // Thin stem
      const stemGeo = new THREE.CylinderGeometry(size * 0.06, size * 0.1, size * 0.5, 8);
      const stem = new THREE.Mesh(stemGeo, mat);
      stem.position.y = size * 0.25;
      group.add(stem);
      // Sphere on top (the clickable hit target)
      const ballGeo = new THREE.SphereGeometry(size * 0.13, 12, 12);
      const ball = new THREE.Mesh(ballGeo, mat);
      ball.position.y = size * 0.5 + size * 0.13;
      ball.userData.kind = "STOP";
      group.add(ball);
      // Small ground ring
      const ringGeo = new THREE.RingGeometry(size * 0.1, size * 0.18, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.5;
      group.add(ring);
      disposables.push(stemGeo, ballGeo, mat, ringGeo, ringMat);
      const pos = latLonToVector3(lat, lon);
      group.position.copy(pos);
      scene.add(group);
      return { group, hitMesh: ball };
    }

    // Clear refs from previous render
    stopMeshesRef.current = [];
    stopLabelsRef.current = [];

    // ---- Special markers: house for HOME, office buildings for drop-offs ----
    // In tracking variant, hide HOME and DROP_A/DROP_B (customer doesn't see driver's home or drop-off locations)
    const homeM = isTracking ? null : makeHouse(
      homeLoc.latitude,
      homeLoc.longitude,
      0xfde047, // yellow
      span * 0.02
    );
    const dropAM = isTracking ? null : makeOffice(
      FIXED_LOCATIONS.DROP_A.latitude,
      FIXED_LOCATIONS.DROP_A.longitude,
      0xef4444, // red
      span * 0.022
    );
    const dropBM = isTracking ? null : makeOffice(
      FIXED_LOCATIONS.DROP_B.latitude,
      FIXED_LOCATIONS.DROP_B.longitude,
      0xef4444, // red
      span * 0.022
    );
    const specialMarkers = [homeM, dropAM, dropBM].filter(Boolean) as { group: THREE.Group; hitMesh: THREE.Mesh }[];

    // ---- Stop markers: compact pins for customer pickups ----
    interface StopMesh {
      stop: VroomStopDetail;
      hitMesh: THREE.Mesh;
      group: THREE.Group;
      num: number;
    }
    const stopMeshes: StopMesh[] = [];
    let stopCounter = 0;
    for (const load of route.loads) {
      for (const stop of load.stops) {
        stopCounter++;
        // Color logic: office=blue, done=green, not done=orange
        let col: number;
        if (stop.isOffice) {
          col = 0x3b82f6; // blue for offices
        } else if (trackingTokens?.[stop.orderId]?.completed) {
          col = 0x22c55e; // green for done
        } else {
          col = 0xf97316; // orange for not done
        }
        const h = span * 0.02 + stop.points * span * 0.003;
        const m = makeStopPin(stop.latitude, stop.longitude, col, h);
        m.hitMesh.userData.stop = stop;
        stopMeshes.push({ stop, hitMesh: m.hitMesh, group: m.group, num: stopCounter });
        // Store ref for color updates
        stopMeshesRef.current.push({ orderId: stop.orderId, isOffice: stop.isOffice, materials: [m.hitMesh.material as THREE.MeshStandardMaterial] });
      }
    }

    // ---- Route paths (animated draw) ----
    // In tracking variant, use customRoutePath (driver → stops → customer) if available
    interface PathInfo {
      line: THREE.Line;
      points: THREE.Vector3[];
      glow: THREE.Line;
    }
    const paths: PathInfo[] = [];
    const loadColors = [0x38bdf8, 0xf472b6, 0xa3e635, 0xfbbf24, 0x67e8f9];
    if (isTracking && customRoutePath && customRoutePath.length >= 2) {
      // Use the custom path from the tracking API (driver pos → stops → customer)
      const pts = customRoutePath.map(([lat, lon]) => latLonToVector3(lat, lon));
      const col = 0x22c55e; // green for tracking route
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: col, linewidth: 2, transparent: true, opacity: 0.9 });
      const line = new THREE.Line(geo, mat);
      line.position.y = span * 0.006;
      scene.add(line);
      const glowMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.25 });
      const glow = new THREE.Line(geo.clone(), glowMat);
      glow.position.y = span * 0.004;
      scene.add(glow);
      disposables.push(geo, mat, glowMat, glow.geometry);
      paths.push({ line, points: pts, glow });
    } else {
    route.loads.forEach((load, li) => {
      const pts: THREE.Vector3[] = [];
      pts.push(latLonToVector3(homeLoc.latitude, homeLoc.longitude));
      for (const s of load.stops) pts.push(latLonToVector3(s.latitude, s.longitude));
      // In tracking variant, don't draw path to drop-off or return home
      // (customer shouldn't see where driver goes after their pickup)
      if (!isTracking) {
        const drop = load.dropOff === "DROP_B" ? FIXED_LOCATIONS.DROP_B : FIXED_LOCATIONS.DROP_A;
        pts.push(latLonToVector3(drop.latitude, drop.longitude));
        pts.push(latLonToVector3(homeLoc.latitude, homeLoc.longitude));
      }

      const col = loadColors[li % loadColors.length];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: col, linewidth: 2, transparent: true, opacity: 0.9 });
      const line = new THREE.Line(geo, mat);
      line.position.y = span * 0.006;
      scene.add(line);

      // glow underlay (thicker, dimmer)
      const glowMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.25 });
      const glow = new THREE.Line(geo.clone(), glowMat);
      glow.position.y = span * 0.004;
      glow.scale.set(1, 1, 1);
      scene.add(glow);
      disposables.push(geo, mat, glowMat, glow.geometry);

      paths.push({ line, points: pts, glow });
    });
    } // end else (planner path building)

    // ---- Animated vehicle dot (follows first load) ----
    const vehicleGeo = new THREE.SphereGeometry(span * 0.009, 12, 12);
    const vehicleMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfacc15,
      emissiveIntensity: 0.8,
    });
    const vehicle = new THREE.Mesh(vehicleGeo, vehicleMat);
    vehicle.position.y = span * 0.03;
    scene.add(vehicle);
    disposables.push(vehicleGeo, vehicleMat);

    // Vertical beam shooting to the sky from the vehicle position
    const beamHeight = span * 0.15;
    const beamGeo = new THREE.CylinderGeometry(span * 0.002, span * 0.002, beamHeight, 6);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.6,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(vehicle.position);
    beam.position.y = span * 0.03 + beamHeight / 2;
    scene.add(beam);
    disposables.push(beamGeo, beamMat);

    // Ground glow ring under vehicle
    const glowRingGeo = new THREE.RingGeometry(span * 0.005, span * 0.012, 24);
    glowRingGeo.rotateX(-Math.PI / 2);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.position.copy(vehicle.position);
    glowRing.position.y = 0.5;
    scene.add(glowRing);
    disposables.push(glowRingGeo, glowRingMat);

    // ---- HTML overlay labels (projected per-frame) ----
    interface LabelEntry {
      el: HTMLDivElement;
      worldPos: THREE.Vector3;
      isStop: boolean;
      orderId?: string;
    }
    const labelEntries: LabelEntry[] = [];

    function createLabel(
      worldPos: THREE.Vector3,
      html: string,
      isStop: boolean,
      orderId?: string,
      extraClass = ""
    ): LabelEntry {
      const el = document.createElement("div");
      el.className = `r3d-label ${extraClass}`;
      el.innerHTML = html;
      labelsEl.appendChild(el);
      const entry: LabelEntry = { el, worldPos, isStop, orderId };
      labelEntries.push(entry);
      return entry;
    }

    // Special marker labels (hide HOME, DROP_A/DROP_B in tracking variant)
    if (!isTracking) {
      const homePos = latLonToVector3(homeLoc.latitude, homeLoc.longitude);
      createLabel(homePos, `<div class="r3d-label-body" style="color:#fde047">⌂ HOME</div>`, false, undefined, "r3d-label-special");
      const dropAPos = latLonToVector3(FIXED_LOCATIONS.DROP_A.latitude, FIXED_LOCATIONS.DROP_A.longitude);
      createLabel(dropAPos, `<div class="r3d-label-body" style="color:#ef4444">▼ DROP_A</div>`, false, undefined, "r3d-label-special");
      const dropBPos = latLonToVector3(FIXED_LOCATIONS.DROP_B.latitude, FIXED_LOCATIONS.DROP_B.longitude);
      createLabel(dropBPos, `<div class="r3d-label-body" style="color:#ef4444">▼ DROP_B</div>`, false, undefined, "r3d-label-special");
    }

    // Stop labels
    for (const sm of stopMeshes) {
      // Color logic: office=blue, done=green, not done=orange
      let colHex: string;
      let checkmark = "";
      if (sm.stop.isOffice) {
        colHex = "#3b82f6"; // blue for offices
      } else if (trackingTokens?.[sm.stop.orderId]?.completed) {
        colHex = "#22c55e"; // green for done
        checkmark = " ✓";
      } else {
        colHex = "#f97316"; // orange for not done
      }
      const name = sm.stop.customerName.length > 14 ? sm.stop.customerName.slice(0, 13) + "…" : sm.stop.customerName;
      const eta = fmtMalaysiaTime(sm.stop.arrival);
      const html = `
        <div class="r3d-label-num" style="background:${colHex}">${sm.num}${checkmark}</div>
        <div class="r3d-label-body">
          <div class="r3d-label-name" style="color:${colHex}">${escapeHtml(name)}</div>
          <div class="r3d-label-meta">${eta} · ${sm.stop.points}pt</div>
        </div>`;
      createLabel(sm.group.position.clone(), html, true, sm.stop.orderId);
      // Store label ref for color updates
      const labelEntry = labelEntries[labelEntries.length - 1];
      stopLabelsRef.current.push({
        orderId: sm.stop.orderId,
        numEl: labelEntry.el.querySelector(".r3d-label-num"),
        nameEl: labelEntry.el.querySelector(".r3d-label-name"),
      });
    }

    // Vehicle label — shows hero name + plate number (after label infra is set up)
    const heroName = heroProfile?.heroName || "Driver";
    const plateNum = heroProfile?.plateNumber || "";
    const vehicleLabel = createLabel(
      vehicle.position.clone(),
      `<div class="r3d-label-body" style="color:#fde047; border-color:rgba(253,224,71,0.3)"><strong>${heroName}</strong>${plateNum ? ` · ${plateNum}` : ""}</div>`,
      false,
      undefined,
      "r3d-label-special"
    );
    vehicleLabel.el.querySelector(".r3d-label-body")?.insertAdjacentHTML("afterbegin", "<span style=\"display:inline-block;width:6px;height:6px;border-radius:50%;background:#fde047;margin-right:4px;animation:pulse 1.5s infinite\"></span>");

    // ---- Raycaster for click selection ----
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered: THREE.Mesh | null = null;
    const origEmissive = new Map<THREE.Mesh, number>();

    function setHovered(m: THREE.Mesh | null) {
      if (hovered === m) return;
      if (hovered) {
        const mat = hovered.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = origEmissive.get(hovered) ?? 0.35;
      }
      hovered = m;
      if (hovered) {
        const mat = hovered.material as THREE.MeshStandardMaterial;
        if (!origEmissive.has(hovered)) origEmissive.set(hovered, mat.emissiveIntensity);
        mat.emissiveIntensity = 1.0;
        renderer.domElement.style.cursor = "pointer";
      } else {
        renderer.domElement.style.cursor = "default";
      }
    }

    function onPointerMove(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    function onClick(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const targets = [
        ...stopMeshes.map((s) => s.hitMesh),
        ...specialMarkers.map((m) => m.hitMesh),
      ];
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length) {
        const hit = hits[0].object as THREE.Mesh;
        const stop = hit.userData.stop as VroomStopDetail | undefined;
        if (stop && onSelectRef.current) onSelectRef.current(stop);
      }
    }
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("click", onClick);

    // ---- Resize ----
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ---- Animation loop ----
    let raf = 0;
    const clock = new THREE.Clock();
    let drawProgress = 0;
    let vehicleT = 0;
    const tempVec = new THREE.Vector3();
    const firstPath = paths[0]?.points ?? [];

    function projectLabel(entry: LabelEntry) {
      tempVec.copy(entry.worldPos);
      tempVec.project(camera);
      // Behind camera?
      if (tempVec.z > 1 || tempVec.z < -1) {
        entry.el.style.opacity = "0";
        return;
      }
      const w = mountEl.clientWidth;
      const h = mountEl.clientHeight;
      const x = (tempVec.x * 0.5 + 0.5) * w;
      const y = (-tempVec.y * 0.5 + 0.5) * h;
      // Off-screen?
      if (x < -50 || x > w + 50 || y < -30 || y > h + 30) {
        entry.el.style.opacity = "0";
        return;
      }
      entry.el.style.opacity = "1";
      entry.el.style.left = `${x}px`;
      entry.el.style.top = `${y - 12}px`; // 12px above the pin tip
    }

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      controls.update();

      // Ambient life: birds, clouds, planes, drones, rain, stars
      if (ambientSystem) {
        ambientSystem.update(dt, clock.elapsedTime, camera, controls.target);
      }

      // Auto-resize fallback: if mount got dimensions after init, resize renderer
      if (mountEl.clientWidth > 0 && mountEl.clientHeight > 0) {
        const cw = renderer.domElement.width;
        const expectedW = Math.round(mountEl.clientWidth * Math.min(window.devicePixelRatio, 2));
        if (cw !== expectedW) {
          camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
        }
      }

      // Dynamic detail tiles: reload when camera zoom/pan changes significantly
      updateDetailTiles();
      // Batch texture update: only upload to GPU once per frame (not per tile)
      if (detailTexDirty) {
        detailTex.needsUpdate = true;
        detailTexDirty = false;
      }

      // animated route draw
      drawProgress = Math.min(1, drawProgress + dt * 0.25);
      for (const p of paths) {
        const count = Math.max(2, Math.floor(p.points.length * drawProgress));
        p.line.geometry.setFromPoints(p.points.slice(0, count));
        p.glow.geometry.setFromPoints(p.points.slice(0, count));
      }

      // vehicle motion: use real GPS position when route is started + GPS available,
      // otherwise animate along the first path (demo mode)
      const gpsPos = driverPosRef.current;
      const isStarted = routeStatusRef.current === "STARTED";
      if (isStarted && gpsPos) {
        // Real GPS position
        const gpsVec = latLonToVector3(gpsPos.latitude, gpsPos.longitude);
        vehicle.position.set(gpsVec.x, span * 0.03, gpsVec.z);
        vehicleLabel.worldPos.copy(vehicle.position);
      } else if (firstPath.length > 1) {
        // Animated demo motions along first path
        vehicleT = (vehicleT + dt * 0.04) % 1;
        const totalSegs = firstPath.length - 1;
        const seg = Math.floor(vehicleT * totalSegs);
        const segT = vehicleT * totalSegs - seg;
        const a = firstPath[seg];
        const b = firstPath[Math.min(seg + 1, firstPath.length - 1)];
        vehicle.position.lerpVectors(a, b, segT);
        vehicle.position.y = span * 0.03;
        vehicleLabel.worldPos.copy(vehicle.position);
      }

      // Pulsing animation for vehicle, beam, and glow ring
      const pulseT = clock.elapsedTime;
      const pulseScale = 1 + Math.sin(pulseT * 3) * 0.2; // 0.8 - 1.2 scale
      vehicle.scale.setScalar(pulseScale);

      // Update beam position to follow vehicle + pulse opacity
      beam.position.x = vehicle.position.x;
      beam.position.z = vehicle.position.z;
      beam.position.y = span * 0.03 + beamHeight / 2;
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(pulseT * 3) * 0.25;

      // Update glow ring to follow vehicle + pulse
      glowRing.position.x = vehicle.position.x;
      glowRing.position.z = vehicle.position.z;
      glowRing.position.y = 0.5;
      const ringPulse = 1 + Math.sin(pulseT * 3) * 0.4;
      glowRing.scale.setScalar(ringPulse);
      (glowRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(pulseT * 3) * 0.3;

      // hover raycasting
      raycaster.setFromCamera(pointer, camera);
      const targets = [
        ...stopMeshes.map((s) => s.hitMesh),
        ...specialMarkers.map((m) => m.hitMesh),
      ];
      const hits = raycaster.intersectObjects(targets, false);
      setHovered((hits[0]?.object as THREE.Mesh) ?? null);

      // highlight selected stop
      const selId = selectedRef.current;
      for (const sm of stopMeshes) {
        const mat = sm.hitMesh.material as THREE.MeshStandardMaterial;
        const base = sm.stop.orderId === selId ? 1.2 : origEmissive.get(sm.hitMesh) ?? 0.4;
        if (sm.hitMesh !== hovered) mat.emissiveIntensity = base;
      }

      // ---- Update HTML overlay labels ----
      const camDist = camera.position.distanceTo(controls.target);
      const showStopLabels = camDist < span * 2.5;
      for (const entry of labelEntries) {
        if (entry.isStop && !showStopLabels) {
          entry.el.style.opacity = "0";
          continue;
        }
        // Highlight selected label
        if (entry.orderId) {
          if (entry.orderId === selId) entry.el.classList.add("r3d-label-selected");
          else entry.el.classList.remove("r3d-label-selected");
        }
        projectLabel(entry);
      }

      renderer.render(scene, camera);
    }
    animate();

    // ---- Cleanup ----
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (ambientSystem) ambientSystem.dispose();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("touchstart", onTouchChange, { capture: true } as EventListenerOptions);
      renderer.domElement.removeEventListener("touchmove", onTouchChange, { capture: true } as EventListenerOptions);
      renderer.domElement.removeEventListener("touchend", onTouchChange, { capture: true } as EventListenerOptions);
      renderer.domElement.removeEventListener("touchcancel", onTouchChange, { capture: true } as EventListenerOptions);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost, false);
      controls.dispose();
      for (const d of disposables) d.dispose();
      for (const p of paths) {
        p.line.geometry.dispose();
        (p.line.material as THREE.Material).dispose();
      }
      vehicleGeo.dispose();
      vehicleMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
      // Clean up label DOM elements
      for (const entry of labelEntries) {
        entry.el.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Update stop marker + label colors when tracking tokens change (done/not done)
  useEffect(() => {
    const tokens = trackingTokens;
    if (!tokens) return;
    for (const entry of stopMeshesRef.current) {
      let col: number;
      if (entry.isOffice) {
        col = 0x3b82f6; // blue
      } else if (tokens[entry.orderId]?.completed) {
        col = 0x22c55e; // green
      } else {
        col = 0xf97316; // orange
      }
      for (const mat of entry.materials) {
        mat.color.setHex(col);
        mat.emissive.setHex(col);
      }
    }
    for (const entry of stopLabelsRef.current) {
      let hex: string;
      let checkmark = "";
      if (entry.numEl) {
        // Determine color from orderId
        const isOffice = stopMeshesRef.current.find(m => m.orderId === entry.orderId)?.isOffice;
        if (isOffice) {
          hex = "#3b82f6";
        } else if (tokens[entry.orderId]?.completed) {
          hex = "#22c55e";
          checkmark = " ✓";
        } else {
          hex = "#f97316";
        }
        // Find the stop number from current label text (strip checkmark)
        const currentText = entry.numEl.textContent?.replace(" ✓", "") || "";
        entry.numEl.style.background = hex;
        entry.numEl.textContent = currentText + checkmark;
      }
      if (entry.nameEl) {
        const isOffice = stopMeshesRef.current.find(m => m.orderId === entry.orderId)?.isOffice;
        if (!isOffice) {
          entry.nameEl.style.color = tokens[entry.orderId]?.completed ? "#22c55e" : "#f97316";
        } else {
          entry.nameEl.style.color = "#3b82f6";
        }
      }
    }
  }, [trackingTokens]);

  return (
    <div
      ref={mountRef}
      className="relative h-full w-full r3d-mount"
      style={{ minHeight: 380, background: "oklch(0.13 0.02 180)" }}
    >
      {/* HTML overlay labels (populated by useEffect) */}
      <div ref={labelsRef} className="r3d-labels" />

      {variant === "planner" ? (
        <>
          {/* Route stats overlay (top-left) */}
          <div className="pointer-events-none absolute left-3 top-3 z-30 flex flex-wrap gap-2">
            <div className="rounded-lg border border-white/10 bg-background/80 px-3 py-1.5 text-xs backdrop-blur-md">
              <span className="font-semibold text-primary">{stats.km}</span>
              <span className="text-muted-foreground"> km</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-background/80 px-3 py-1.5 text-xs backdrop-blur-md">
              <Clock className="mr-1 inline h-3 w-3 text-muted-foreground" />
              <span className="font-semibold text-foreground">{stats.dur}</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-background/80 px-3 py-1.5 text-xs backdrop-blur-md">
              <MapPin className="mr-1 inline h-3 w-3 text-muted-foreground" />
              <span className="font-semibold text-foreground">{stats.stops}</span>
              <span className="text-muted-foreground"> stops</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-background/80 px-3 py-1.5 text-xs backdrop-blur-md">
              <Package className="mr-1 inline h-3 w-3 text-muted-foreground" />
              <span className="font-semibold text-foreground">{stats.pts}</span>
              <span className="text-muted-foreground">/{stats.cap} pts</span>
            </div>
            {stats.loads > 1 && (
              <div className="rounded-lg border border-white/10 bg-background/80 px-3 py-1.5 text-xs backdrop-blur-md">
                <span className="font-semibold text-foreground">{stats.loads}</span>
                <span className="text-muted-foreground"> loads</span>
              </div>
            )}
          </div>

          {/* Selected stop info card (bottom-left) */}
          {selectedInfo && (
            <div className="absolute bottom-3 left-3 z-30 w-[280px] rounded-xl border border-white/10 bg-card/90 p-3.5 shadow-2xl backdrop-blur-md">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: stopColorHex(selectedInfo.stop, trackingTokens) }}
                  >
                    {selectedInfo.num}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {selectedInfo.stop.customerName}
                    </div>
                    <div className="text-[0.625rem] text-muted-foreground">
                      {selectedInfo.stop.orderId} · Load {selectedInfo.loadIdx + 1}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onSelectRef.current?.(selectedInfo.stop)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                  <span className="text-foreground/90">{selectedInfo.stop.address}{selectedInfo.stop.city ? `, ${selectedInfo.stop.city}` : ""}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0 text-primary/60" />
                  <span>ETA <span className="font-medium text-foreground">{fmtMalaysiaTime(selectedInfo.stop.arrival)}</span></span>
                  <span className="text-white/20">·</span>
                  <Package className="h-3 w-3 shrink-0 text-primary/60" />
                  <span><span className="font-medium text-foreground">{selectedInfo.stop.points}</span> pts · {selectedInfo.stop.size}</span>
                </div>
                {selectedInfo.stop.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0 text-primary/60" />
                    <a href={`tel:${selectedInfo.stop.phone}`} className="text-primary hover:underline">
                      {selectedInfo.stop.phone}
                    </a>
                  </div>
                )}
                {selectedInfo.stop.notes && (
                  <div className="rounded-md bg-white/5 px-2 py-1 text-[0.75rem] text-foreground/70">
                    {selectedInfo.stop.notes}
                  </div>
                )}
              </div>

              <a
                href={gmapsNavUrl(selectedInfo.stop.latitude, selectedInfo.stop.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Navigation className="h-3.5 w-3.5" />
                Navigate in Google Maps
              </a>
            </div>
          )}

        </>
      ) : (
        /* ---- Tracking variant overlays ---- */
        <>
          {/* ETA info bar (top-center) */}
          {etaInfo && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-background/85 px-4 py-2 backdrop-blur-md">
                <div className="text-center">
                  <div className="text-lg font-bold text-emerald-400">{etaInfo.minutes}</div>
                  <div className="text-[0.625rem] text-muted-foreground">min ETA</div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="text-center">
                  <div className="text-lg font-bold text-foreground">{etaInfo.distanceKm}</div>
                  <div className="text-[0.625rem] text-muted-foreground">km away</div>
                </div>
                {etaInfo.stopsBefore > 0 && (
                  <>
                    <div className="h-8 w-px bg-white/10" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-amber-400">{etaInfo.stopsBefore}</div>
                      <div className="text-[0.625rem] text-muted-foreground">stops before you</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

        </>
      )}

      {/* Touch gesture lock/unlock button (top-right) — shown in both variants */}
      <button
        onClick={() => {
          const next = !lockedRef.current;
          lockedRef.current = next;
          setLocked(next);
          const ta = next ? "pan-y" : "none";
          if (canvasRef.current) canvasRef.current.style.touchAction = ta;
          if (mountRef.current) mountRef.current.style.touchAction = ta;
          if (controlsRef.current) {
            controlsRef.current.enabled = !next;
          }
        }}
        className="absolute right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-background/80 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-white/10 hover:text-foreground"
        title={locked ? "Unlock: enable 1-finger map drag" : "Lock: 1-finger scrolls page, 2-finger moves map"}
        aria-label={locked ? "Unlock map controls" : "Lock map controls"}
      >
        {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </button>

      {/* Time + Weather badge (bottom-left) */}
      {timeOfDayInfo && (
        <div className="pointer-events-none absolute bottom-1 left-2 z-10 flex items-center gap-1.5 rounded-md border border-white/10 bg-background/70 px-2 py-1 text-[0.625rem] text-white/70 backdrop-blur-sm">
          <span title={timeOfDayInfo.label}>{timeOfDayInfo.icon}</span>
          {weatherInfo && (
            <>
              <span className="text-white/20">&middot;</span>
              <span title={weatherInfo.label}>{weatherInfo.icon}</span>
            </>
          )}
        </div>
      )}

      {/* OSM attribution (required by tile policy) */}
      <div
        className="pointer-events-none absolute bottom-1 right-2 z-10 text-[0.625rem] text-white/50"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
      >
        © OpenStreetMap contributors · Esri
      </div>
    </div>
  );
}