"use client";

// Three.js 3D route map — CLIENT ONLY (uses window/document).
// Must be dynamically imported with ssr: false from a server component.
//
// Renders the Klang Valley as a flat plane textured with map tiles (proxied
// via /api/tile to comply with OSM policy), plots optimized route stops as 3D
// pins colored by zone, draws the route path as an animated 3D line, shows
// HOME / DROP_A / DROP_B as special markers, animates a vehicle dot along the
// route, and supports orbit/zoom + click-to-select stops with raycasting.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FIXED_LOCATIONS, VEHICLE } from "@/lib/route-model";
import type { OptimizedRouteResult, VroomStopDetail } from "@/lib/vroom";

// ---------------------------------------------------------------------------
// Flat local-tangent-plane projection (matches flat PlaneGeometry + tile tex)
// ---------------------------------------------------------------------------
const MAP_CENTER_LAT = 3.05;
const MAP_CENTER_LON = 101.6;
const SCALE = 10000; // meters per unit

function latLonToVector3(lat: number, lon: number): THREE.Vector3 {
  const latOffset = (lat - MAP_CENTER_LAT) * (Math.PI / 180) * SCALE;
  const lonOffset =
    (lon - MAP_CENTER_LON) *
    (Math.PI / 180) *
    SCALE *
    Math.cos(MAP_CENTER_LAT * (Math.PI / 180));
  return new THREE.Vector3(lonOffset, 0, -latOffset);
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

interface Props {
  route: OptimizedRouteResult;
  onSelectStop?: (stop: VroomStopDetail) => void;
  selectedOrderId?: string | null;
}

export default function RouteMap3D({ route, onSelectStop, selectedOrderId }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectStop);
  const selectedRef = useRef(selectedOrderId);
  const routeRef = useRef(route);
  onSelectRef.current = onSelectStop;
  selectedRef.current = selectedOrderId;
  routeRef.current = route;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f17); // match app base #0B0F17

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200000
    );
    // position/framing set after route bounds are known (see framing block)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;
    // minDistance/maxDistance set after framing is computed

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(1, 2, 1);
    scene.add(dir);

    // Collect all points for bounds
    const allPts: { lat: number; lon: number }[] = [
      FIXED_LOCATIONS.HOME,
      FIXED_LOCATIONS.DROP_A,
      FIXED_LOCATIONS.DROP_B,
    ].map((l) => ({ lat: l.latitude, lon: l.longitude }));
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

    // ---- Tile mosaic ground plane ----
    const disposables: (THREE.Material | THREE.BufferGeometry | THREE.Texture)[] = [];
    const z = 13;
    const x0 = Math.floor(lonToTileX(minLon, z));
    const x1 = Math.floor(lonToTileX(maxLon, z));
    const y0 = Math.floor(latToTileY(maxLat, z)); // maxLat -> smaller y
    const y1 = Math.floor(latToTileY(minLat, z));
    const tilesX = x1 - x0 + 1;
    const tilesY = y1 - y0 + 1;
    const TILE = 256;
    const canvas = document.createElement("canvas");
    canvas.width = tilesX * TILE;
    canvas.height = tilesY * TILE;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const mosaicTexture = new THREE.CanvasTexture(canvas);
    mosaicTexture.colorSpace = THREE.SRGBColorSpace;
    disposables.push(mosaicTexture);

    // Geographic bounds of the mosaic (corners of the tile grid)
    const mosaicLonL = tileXToLon(x0, z);
    const mosaicLonR = tileXToLon(x1 + 1, z);
    const mosaicLatT = tileYToLat(y0, z);
    const mosaicLatB = tileYToLat(y1 + 1, z);

    const tl = latLonToVector3(mosaicLatT, mosaicLonL);
    const br = latLonToVector3(mosaicLatB, mosaicLonR);
    const planeW = Math.abs(br.x - tl.x);
    const planeH = Math.abs(br.z - tl.z);
    const planeCenter = new THREE.Vector3(
      (tl.x + br.x) / 2,
      0,
      (tl.z + br.z) / 2
    );

    // ---- Scene framing: size everything proportionally to the map span ----
    // The ground plane is only ~tens of units across with SCALE=10000, so all
    // marker heights, the vehicle, the route line offsets and the camera
    // distance MUST be derived from `span` — hardcoding them produces giant
    // cones floating over an invisible plane (the "black screen + triangle"
    // bug).
    const span = Math.max(planeW, planeH, 1);
    camera.near = span * 0.01;
    camera.far = span * 100;
    camera.position.set(planeCenter.x, span * 0.65, planeCenter.z + span * 0.65);
    camera.lookAt(planeCenter);
    camera.updateProjectionMatrix();
    controls.target.copy(planeCenter);
    controls.minDistance = span * 0.1;
    controls.maxDistance = span * 6;
    controls.update();

    const planeGeo = new THREE.PlaneGeometry(planeW, planeH);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({ map: mosaicTexture });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.position.copy(planeCenter);
    scene.add(planeMesh);
    disposables.push(planeGeo, planeMat);

    // Load tiles asynchronously, update texture
    let loadedCount = 0;
    const totalTiles = tilesX * tilesY;
    for (let i = 0; i < tilesX; i++) {
      for (let j = 0; j < tilesY; j++) {
        const tx = x0 + i;
        const ty = y0 + j;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          ctx.drawImage(img, i * TILE, j * TILE, TILE, TILE);
          mosaicTexture.needsUpdate = true;
          loadedCount++;
        };
        img.onerror = () => { loadedCount++; };
        img.src = `/api/tile/${z}/${tx}/${ty}.png`;
      }
    }
    void totalTiles;

    // ---- Helper to make a pin marker ----
    function makeMarker(lat: number, lon: number, color: number, height: number, label: string) {
      const group = new THREE.Group();
      const coneGeo = new THREE.ConeGeometry(height * 0.35, height, 12);
      const coneMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        metalness: 0.3,
        roughness: 0.5,
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = height / 2;
      cone.userData.kind = label;
      group.add(cone);
      // base ring
      const ringGeo = new THREE.RingGeometry(height * 0.18, height * 0.5, 20);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 1;
      group.add(ring);
      disposables.push(coneGeo, coneMat, ringGeo, ringMat);

      const pos = latLonToVector3(lat, lon);
      group.position.copy(pos);
      scene.add(group);
      return { group, cone, hitMesh: cone };
    }

    // ---- Special markers ----
    const homeM = makeMarker(
      FIXED_LOCATIONS.HOME.latitude,
      FIXED_LOCATIONS.HOME.longitude,
      0x22c55e,
      span * 0.07,
      "HOME"
    );
    const dropAM = makeMarker(
      FIXED_LOCATIONS.DROP_A.latitude,
      FIXED_LOCATIONS.DROP_A.longitude,
      0xef4444,
      span * 0.07,
      "DROP_A"
    );
    const dropBM = makeMarker(
      FIXED_LOCATIONS.DROP_B.latitude,
      FIXED_LOCATIONS.DROP_B.longitude,
      0xf97316,
      span * 0.07,
      "DROP_B"
    );
    const specialMarkers = [homeM, dropAM, dropBM];

    // ---- Stop markers ----
    interface StopMesh {
      stop: VroomStopDetail;
      cone: THREE.Mesh;
      group: THREE.Group;
    }
    const stopMeshes: StopMesh[] = [];
    for (const load of route.loads) {
      for (const stop of load.stops) {
        const col = zoneColor(stop.zone);
        const h = span * 0.03 + stop.points * span * 0.004;
        const m = makeMarker(stop.latitude, stop.longitude, col, h, "STOP");
        m.cone.userData.stop = stop;
        stopMeshes.push({ stop, cone: m.cone, group: m.group });
      }
    }

    // ---- Route paths (animated draw) ----
    interface PathInfo {
      line: THREE.Line;
      points: THREE.Vector3[];
      glow: THREE.Line;
    }
    const paths: PathInfo[] = [];
    const loadColors = [0x38bdf8, 0xf472b6, 0xa3e635, 0xfbbf24, 0x67e8f9];
    route.loads.forEach((load, li) => {
      const pts: THREE.Vector3[] = [];
      pts.push(latLonToVector3(FIXED_LOCATIONS.HOME.latitude, FIXED_LOCATIONS.HOME.longitude));
      for (const s of load.stops) pts.push(latLonToVector3(s.latitude, s.longitude));
      const drop = load.dropOff === "DROP_B" ? FIXED_LOCATIONS.DROP_B : FIXED_LOCATIONS.DROP_A;
      pts.push(latLonToVector3(drop.latitude, drop.longitude));
      pts.push(latLonToVector3(FIXED_LOCATIONS.HOME.latitude, FIXED_LOCATIONS.HOME.longitude));

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

    // ---- Animated vehicle dot (follows first load) ----
    const vehicleGeo = new THREE.SphereGeometry(span * 0.018, 16, 16);
    const vehicleMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfacc15,
      emissiveIntensity: 0.8,
    });
    const vehicle = new THREE.Mesh(vehicleGeo, vehicleMat);
    vehicle.position.y = span * 0.05;
    scene.add(vehicle);
    disposables.push(vehicleGeo, vehicleMat);

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
        ...stopMeshes.map((s) => s.cone),
        ...specialMarkers.map((m) => m.cone),
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

    // precompute cumulative distances for vehicle motion
    const firstPath = paths[0]?.points ?? [];

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      controls.update();

      // animated route draw
      drawProgress = Math.min(1, drawProgress + dt * 0.25);
      for (const p of paths) {
        const count = Math.max(2, Math.floor(p.points.length * drawProgress));
        p.line.geometry.setFromPoints(p.points.slice(0, count));
        p.glow.geometry.setFromPoints(p.points.slice(0, count));
      }

      // vehicle motion along first path
      if (firstPath.length > 1) {
        vehicleT = (vehicleT + dt * 0.04) % 1;
        const totalSegs = firstPath.length - 1;
        const seg = Math.floor(vehicleT * totalSegs);
        const segT = vehicleT * totalSegs - seg;
        const a = firstPath[seg];
        const b = firstPath[Math.min(seg + 1, firstPath.length - 1)];
        vehicle.position.lerpVectors(a, b, segT);
        vehicle.position.y = span * 0.05;
      }

      // hover raycasting
      raycaster.setFromCamera(pointer, camera);
      const targets = [
        ...stopMeshes.map((s) => s.cone),
        ...specialMarkers.map((m) => m.cone),
      ];
      const hits = raycaster.intersectObjects(targets, false);
      setHovered((hits[0]?.object as THREE.Mesh) ?? null);

      // highlight selected stop
      const selId = selectedRef.current;
      for (const sm of stopMeshes) {
        const mat = sm.cone.material as THREE.MeshStandardMaterial;
        const base = sm.stop.orderId === selId ? 1.2 : origEmissive.get(sm.cone) ?? 0.35;
        if (sm.cone !== hovered) mat.emissiveIntensity = base;
      }

      renderer.render(scene, camera);
    }
    animate();

    // ---- Cleanup ----
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      for (const d of disposables) d.dispose();
      for (const p of paths) {
        p.line.geometry.dispose();
        (p.line.material as THREE.Material).dispose();
      }
      vehicleGeo.dispose();
      vehicleMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  return (
    <div
      ref={mountRef}
      className="relative h-full w-full"
      style={{ minHeight: 380, background: "#0b0f17" }}
    >
      {/* OSM attribution (required by tile policy) */}
      <div
        className="pointer-events-none absolute bottom-1 right-2 z-10 text-[10px] text-white/70"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
      >
        © OpenStreetMap contributors · CARTO
      </div>
    </div>
  );
}