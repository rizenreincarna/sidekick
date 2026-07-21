// Map ambient system — time-of-day lighting, weather effects, and flying objects.
// Imported by route-map-3d.tsx to make the 3D map feel alive.

import * as THREE from "three";

// ===== Time of Day =====
export type TimePeriod = "morning" | "afternoon" | "evening" | "night";

export interface TimeOfDayConfig {
  period: TimePeriod;
  skyColor: number;
  ambientColor: number;
  ambientIntensity: number;
  directionalColor: number;
  directionalIntensity: number;
  directionalPos: [number, number, number];
  fogColor: number;
  fogNear: number;
  fogFar: number;
  label: string;
  icon: string;
  isDark: boolean;
}

/** Returns the current time-of-day config based on real Malaysia time (UTC+8). */
export function getTimeOfDay(): TimeOfDayConfig {
  const now = new Date();
  const fractionalHour = (now.getUTCHours() + 8) % 24 + now.getUTCMinutes() / 60;

  if (fractionalHour >= 6 && fractionalHour < 11) {
    return {
      period: "morning",
      skyColor: 0x131c2a,
      ambientColor: 0xffe4c4,
      ambientIntensity: 0.65,
      directionalColor: 0xffd699,
      directionalIntensity: 0.75,
      directionalPos: [-0.5, 0.8, 0.3],
      fogColor: 0x131c2a,
      fogNear: 150000,
      fogFar: 600000,
      label: "Morning",
      icon: "🌅",
      isDark: false,
    };
  } else if (fractionalHour >= 11 && fractionalHour < 16.5) {
    return {
      period: "afternoon",
      skyColor: 0x0b0f17,
      ambientColor: 0xffffff,
      ambientIntensity: 0.85,
      directionalColor: 0xffffff,
      directionalIntensity: 0.65,
      directionalPos: [0.3, 1, 0.2],
      fogColor: 0x0b0f17,
      fogNear: 200000,
      fogFar: 800000,
      label: "Afternoon",
      icon: "☀️",
      isDark: false,
    };
  } else if (fractionalHour >= 16.5 && fractionalHour < 19) {
    return {
      period: "evening",
      skyColor: 0x1f1525,
      ambientColor: 0xff9966,
      ambientIntensity: 0.55,
      directionalColor: 0xff6633,
      directionalIntensity: 0.45,
      directionalPos: [0.8, 0.3, 0.1],
      fogColor: 0x1f1525,
      fogNear: 120000,
      fogFar: 500000,
      label: "Evening",
      icon: "🌇",
      isDark: false,
    };
  } else {
    return {
      period: "night",
      skyColor: 0x050810,
      ambientColor: 0x4a6fa5,
      ambientIntensity: 0.3,
      directionalColor: 0x6b8cce,
      directionalIntensity: 0.2,
      directionalPos: [0.2, 0.5, 0.3],
      fogColor: 0x050810,
      fogNear: 100000,
      fogFar: 400000,
      label: "Night",
      icon: "🌙",
      isDark: true,
    };
  }
}

// ===== Weather =====
export interface WeatherInfo {
  code: number;
  label: string;
  icon: string;
  isRaining: boolean;
  isHeavyRain: boolean;
  isFoggy: boolean;
  isCloudy: boolean;
  isClear: boolean;
  isThunderstorm: boolean;
  cloudCover: number;
}

function parseWeather(code: number, cloudCover: number): WeatherInfo {
  const isThunderstorm = code >= 95;
  const isHeavyRain = (code >= 61 && code <= 65) || (code >= 80 && code <= 82) || isThunderstorm;
  const isRaining = isHeavyRain || (code >= 51 && code <= 57) || (code >= 66 && code <= 67);
  const isFoggy = code >= 45 && code <= 48;
  const isCloudy = cloudCover > 50 || code === 2 || code === 3;
  const isClear = code === 0 || code === 1;

  let label = "Clear";
  let icon = "☀️";
  if (isThunderstorm) { label = "Thunderstorm"; icon = "⛈️"; }
  else if (isHeavyRain) { label = "Heavy Rain"; icon = "🌧️"; }
  else if (isRaining) { label = "Light Rain"; icon = "🌦️"; }
  else if (isFoggy) { label = "Foggy"; icon = "🌫️"; }
  else if (isCloudy) { label = "Cloudy"; icon = "☁️"; }
  else if (isClear) { label = "Clear"; icon = "☀️"; }

  return { code, label, icon, isRaining, isHeavyRain, isFoggy, isCloudy, isClear, isThunderstorm, cloudCover };
}

/** Fetch current weather from Open-Meteo (free, no API key, CORS-enabled). */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherInfo | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=weather_code,cloud_cover`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const code = data.current?.weather_code ?? 0;
    const cloudCover = data.current?.cloud_cover ?? 0;
    return parseWeather(code, cloudCover);
  } catch {
    return null;
  }
}

// ===== Color helpers =====
function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function tintHex(hex: number, tint: number, amount: number): number {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const tr = (tint >> 16) & 255;
  const tg = (tint >> 8) & 255;
  const tb = tint & 255;
  const nr = Math.round(r * (1 - amount) + tr * amount);
  const ng = Math.round(g * (1 - amount) + tg * amount);
  const nb = Math.round(b * (1 - amount) + tb * amount);
  return (nr << 16) | (ng << 8) | nb;
}

// ===== Bird species definitions =====
interface BirdSpecies {
  name: string;
  bodyColor: number;
  wingColor: number;
  tipColor: number;
  beakColor: number;
  size: number; // scale multiplier
}

const BIRD_SPECIES: BirdSpecies[] = [
  // White dove / seagull
  { name: "dove", bodyColor: 0xf5f0e8, wingColor: 0xe8e0d0, tipColor: 0x333333, beakColor: 0xffaa33, size: 1.0 },
  // Brown sparrow
  { name: "sparrow", bodyColor: 0x8b6b47, wingColor: 0xa07850, tipColor: 0x3a2a18, beakColor: 0xffcc55, size: 0.75 },
  // Grey pigeon
  { name: "pigeon", bodyColor: 0x808890, wingColor: 0x9098a0, tipColor: 0x4a5560, beakColor: 0xff9944, size: 0.9 },
  // Blue kingfisher
  { name: "kingfisher", bodyColor: 0x2a6cc4, wingColor: 0x3a8ce4, tipColor: 0xff6633, beakColor: 0xff4422, size: 0.7 },
  // Black crow
  { name: "crow", bodyColor: 0x1a1a22, wingColor: 0x2a2a35, tipColor: 0x4a5c8a, beakColor: 0x444444, size: 1.1 },
  // Red parrot
  { name: "parrot", bodyColor: 0xcc3322, wingColor: 0x22aa44, tipColor: 0x4488ff, beakColor: 0xffcc22, size: 0.85 },
];

// ===== Ambient Life System =====
export interface AmbientSystem {
  update: (dt: number, elapsedTime: number, camera: THREE.Camera, controlsTarget: THREE.Vector3) => void;
  dispose: () => void;
  setWeather: (weather: WeatherInfo | null) => void;
  setTimeOfDay: (tod: TimeOfDayConfig) => void;
}

interface Bird {
  group: THREE.Group;
  leftWingPivot: THREE.Group;
  rightWingPivot: THREE.Group;
  bodyMats: THREE.MeshBasicMaterial[];
  wingMats: THREE.MeshBasicMaterial[];
  radius: number;
  speed: number;
  angle: number;
  height: number;
  centerX: number;
  centerZ: number;
  flapSpeed: number;
  species: BirdSpecies;
}

interface Cloud {
  group: THREE.Group;
  speed: number;
  startX: number;
  altitude: number;
}

interface Plane {
  group: THREE.Group;
  strobeMat: THREE.MeshBasicMaterial;
  navLightMats: { red: THREE.MeshBasicMaterial; green: THREE.MeshBasicMaterial };
  speed: number;
  active: boolean;
  timer: number;
  spawnInterval: number;
  startSide: number;
}

interface Drone {
  group: THREE.Group;
  rotors: THREE.Mesh[];
  ledMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshBasicMaterial;
  centerX: number;
  centerZ: number;
  radius: number;
  speed: number;
  angle: number;
  height: number;
  rotorSpin: number;
}

export function createAmbientLife(
  scene: THREE.Scene,
  span: number,
  initialWeather: WeatherInfo | null,
  initialTod: TimeOfDayConfig
): AmbientSystem {
  const disposables: (THREE.Material | THREE.BufferGeometry)[] = [];
  const H = span * 0.01;

  // ---- BIRDS ----
  const birds: Bird[] = [];
  const birdCount = 6;
  const allBirdMats: { body: THREE.MeshBasicMaterial[]; wing: THREE.MeshBasicMaterial[] } = {
    body: [],
    wing: [],
  };

  function createWingGeometryWithTipColors(
    length: number, rootWidth: number, tipWidth: number, sweep: number,
    wingColor: number, tipColor: number
  ): { geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial } {
    // Split wing into two segments: inner (wingColor) and outer tip (tipColor)
    const splitAt = length * 0.65;
    const innerSweep = sweep * 0.5;
    const outerLen = length - splitAt;
    const innerTipWidth = rootWidth * 0.7;
    const outerTipWidth = tipWidth;

    // 6 vertices: root LE, root TE, mid LE, mid TE, tip LE, tip TE
    const verts = new Float32Array([
      0, 0, 0,                          // 0: root leading
      0, 0, rootWidth,                  // 1: root trailing
      splitAt, 0, -innerSweep,          // 2: mid leading
      splitAt, 0, -innerSweep + innerTipWidth, // 3: mid trailing
      length, 0, -sweep,                // 4: tip leading
      length, 0, -sweep + outerTipWidth, // 5: tip trailing
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    // Inner wing triangles (root → mid)
    // Outer wing triangles (mid → tip)
    geo.setIndex([
      0, 1, 2,  1, 2, 3,   // inner
      2, 3, 4,  3, 4, 5,   // outer
    ]);
    geo.computeVertexNormals();

    // Vertex colors: inner = wingColor, outer = tipColor
    const [wr, wg, wb] = hexToRgb(wingColor);
    const [tr, tg, tb] = hexToRgb(tipColor);
    const colors = new Float32Array([
      wr, wg, wb,  // 0: root LE
      wr, wg, wb,  // 1: root TE
      wr, wg, wb,  // 2: mid LE (transition point — still wing color)
      wr, wg, wb,  // 3: mid TE
      tr, tg, tb,  // 4: tip LE
      tr, tg, tb,  // 5: tip TE
    ]);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    disposables.push(mat);
    return { geo, mat };
  }

  for (let i = 0; i < birdCount; i++) {
    const species = BIRD_SPECIES[i % BIRD_SPECIES.length];
    const s = species.size;
    const group = new THREE.Group();

    // Body: elongated cone pointing forward (-Z)
    const bodyMat = new THREE.MeshBasicMaterial({
      color: species.bodyColor,
      transparent: true,
      opacity: 0.9,
    });
    disposables.push(bodyMat);
    allBirdMats.body.push(bodyMat);

    const bodyGeo = new THREE.ConeGeometry(H * 0.12 * s, H * 0.5 * s, 6);
    bodyGeo.rotateX(Math.PI / 2); // point forward (-Z)
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);
    disposables.push(bodyGeo);

    // Head: small sphere at front
    const headGeo = new THREE.SphereGeometry(H * 0.09 * s, 6, 6);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.z = -H * 0.28 * s;
    group.add(head);
    disposables.push(headGeo);

    // Beak: tiny cone, colored
    const beakMat = new THREE.MeshBasicMaterial({
      color: species.beakColor,
      transparent: true,
      opacity: 0.9,
    });
    disposables.push(beakMat);
    const beakGeo = new THREE.ConeGeometry(H * 0.03 * s, H * 0.08 * s, 4);
    beakGeo.rotateX(Math.PI / 2);
    const beak = new THREE.Mesh(beakGeo, beakMat);
    beak.position.z = -H * 0.37 * s;
    group.add(beak);
    disposables.push(beakGeo);

    // Tail: small flattened triangle at back
    const tailGeo = new THREE.BufferGeometry();
    const tailVerts = new Float32Array([
      0, 0, H * 0.25 * s,           // root (at body back)
      -H * 0.08 * s, 0, H * 0.38 * s,  // left tip
      H * 0.08 * s, 0, H * 0.38 * s,   // right tip
    ]);
    tailGeo.setAttribute("position", new THREE.BufferAttribute(tailVerts, 3));
    tailGeo.computeVertexNormals();
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    group.add(tail);
    disposables.push(tailGeo);

    // Wings: two-tone (wing color + tip color) with vertex colors
    const wingLen = H * 1.8 * s;
    const wingRootW = H * 0.14 * s;
    const wingTipW = H * 0.06 * s;
    const wingSweep = H * 0.4 * s;

    // Right wing
    const rightWingPivot = new THREE.Group();
    const { geo: rightWingGeo, mat: rightWingMat } = createWingGeometryWithTipColors(
      wingLen, wingRootW, wingTipW, wingSweep, species.wingColor, species.tipColor
    );
    const rightWing = new THREE.Mesh(rightWingGeo, rightWingMat);
    rightWingPivot.add(rightWing);
    group.add(rightWingPivot);
    disposables.push(rightWingGeo);
    allBirdMats.wing.push(rightWingMat);

    // Left wing (mirrored)
    const leftWingPivot = new THREE.Group();
    const { geo: leftWingGeo, mat: leftWingMat } = createWingGeometryWithTipColors(
      wingLen, wingRootW, wingTipW, wingSweep, species.wingColor, species.tipColor
    );
    const leftWing = new THREE.Mesh(leftWingGeo, leftWingMat);
    leftWing.scale.x = -1; // mirror
    leftWingPivot.add(leftWing);
    group.add(leftWingPivot);
    disposables.push(leftWingGeo);
    allBirdMats.wing.push(leftWingMat);

    // Position
    const radius = span * (0.3 + Math.random() * 0.4);
    const angle = Math.random() * Math.PI * 2;
    const height = span * (0.15 + Math.random() * 0.12);
    const centerX = (Math.random() - 0.5) * span * 0.5;
    const centerZ = (Math.random() - 0.5) * span * 0.5;

    group.position.set(
      centerX + Math.cos(angle) * radius,
      height,
      centerZ + Math.sin(angle) * radius
    );
    scene.add(group);
    birds.push({
      group, leftWingPivot, rightWingPivot,
      bodyMats: [bodyMat, beakMat],
      wingMats: [rightWingMat, leftWingMat],
      radius, speed: 0.12 + Math.random() * 0.1,
      angle, height, centerX, centerZ,
      flapSpeed: 5 + Math.random() * 3,
      species,
    });
  }

  // ---- CLOUDS ----
  const clouds: Cloud[] = [];
  const cloudCount = 7;
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: initialTod.isDark ? 0.08 : 0.25,
    depthWrite: false,
  });
  disposables.push(cloudMat);

  for (let i = 0; i < cloudCount; i++) {
    const group = new THREE.Group();
    const puffCount = 4 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffCount; j++) {
      const r = H * (3 + Math.random() * 5);
      const puffGeo = new THREE.SphereGeometry(r, 8, 6);
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set(
        (Math.random() - 0.5) * H * 10,
        (Math.random() - 0.5) * H * 2,
        (Math.random() - 0.5) * H * 8
      );
      group.add(puff);
      disposables.push(puffGeo);
    }
    const altitude = span * (0.4 + Math.random() * 0.2);
    const startX = (Math.random() - 0.5) * span * 2;
    group.position.set(startX, altitude, (Math.random() - 0.5) * span * 1.5);
    scene.add(group);
    clouds.push({ group, speed: 0.3 + Math.random() * 0.5, startX, altitude });
  }

  // ---- PLANES ----
  const planes: Plane[] = [];
  const planeCount = 2;

  // Shared geometries (reused across planes)
  const fuselageGeo = new THREE.ConeGeometry(H * 0.08, H * 1.0, 8);
  fuselageGeo.rotateX(Math.PI / 2); // point forward (-Z)
  disposables.push(fuselageGeo);

  const planeWingGeo = new THREE.BoxGeometry(H * 0.9, H * 0.03, H * 0.18);
  disposables.push(planeWingGeo);

  const tailFinGeo = new THREE.BufferGeometry();
  const tailVerts = new Float32Array([
    0, 0, 0,           // base
    0, H * 0.15, 0,    // top
    0, 0, H * 0.12,    // back
  ]);
  tailFinGeo.setAttribute("position", new THREE.BufferAttribute(tailVerts, 3));
  tailFinGeo.computeVertexNormals();
  disposables.push(tailFinGeo);

  const tailPlaneGeo = new THREE.BoxGeometry(H * 0.25, H * 0.02, H * 0.1);
  disposables.push(tailPlaneGeo);

  const strobeGeo = new THREE.SphereGeometry(H * 0.04, 6, 6);
  disposables.push(strobeGeo);

  const navLightGeo = new THREE.SphereGeometry(H * 0.03, 6, 6);
  disposables.push(navLightGeo);

  for (let i = 0; i < planeCount; i++) {
    const group = new THREE.Group();

    // White fuselage
    const bodyMat = new THREE.MeshBasicMaterial({
      color: 0xf0f0f4, transparent: true, opacity: 0.95,
    });
    disposables.push(bodyMat);
    const body = new THREE.Mesh(fuselageGeo, bodyMat);
    group.add(body);

    // Wings — silver/white with colored tips
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0xd0d0d8, transparent: true, opacity: 0.95,
    });
    disposables.push(wingMat);
    const wing = new THREE.Mesh(planeWingGeo, wingMat);
    wing.position.z = H * 0.1;
    group.add(wing);

    // Tail fin — red
    const tailFinMat = new THREE.MeshBasicMaterial({
      color: 0xcc2222, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
    });
    disposables.push(tailFinMat);
    const tailFin = new THREE.Mesh(tailFinGeo, tailFinMat);
    tailFin.position.z = H * 0.45;
    group.add(tailFin);

    // Horizontal tail plane
    const tailPlane = new THREE.Mesh(tailPlaneGeo, wingMat);
    tailPlane.position.z = H * 0.42;
    group.add(tailPlane);

    // Navigation lights: red on left wing tip, green on right wing tip
    const redNavMat = new THREE.MeshBasicMaterial({
      color: 0xff2222, transparent: true, opacity: 1,
    });
    const greenNavMat = new THREE.MeshBasicMaterial({
      color: 0x22ff22, transparent: true, opacity: 1,
    });
    disposables.push(redNavMat, greenNavMat);

    const redNav = new THREE.Mesh(navLightGeo, redNavMat);
    redNav.position.set(-H * 0.45, 0, H * 0.1);
    group.add(redNav);

    const greenNav = new THREE.Mesh(navLightGeo, greenNavMat);
    greenNav.position.set(H * 0.45, 0, H * 0.1);
    group.add(greenNav);

    // Blinking strobe light on top
    const strobeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1,
    });
    disposables.push(strobeMat);
    const strobe = new THREE.Mesh(strobeGeo, strobeMat);
    strobe.position.set(0, H * 0.08, -H * 0.1);
    group.add(strobe);

    group.visible = false;
    scene.add(group);
    planes.push({
      group, strobeMat,
      navLightMats: { red: redNavMat, green: greenNavMat },
      speed: 8 + Math.random() * 4,
      active: false,
      timer: i * 15,
      spawnInterval: 25 + Math.random() * 30,
      startSide: Math.random() > 0.5 ? 1 : -1,
    });
  }

  // ---- DRONES ----
  const drones: Drone[] = [];
  const droneCount = 2;

  // Shared geometries
  const droneBodyGeo = new THREE.BoxGeometry(H * 0.25, H * 0.1, H * 0.25);
  disposables.push(droneBodyGeo);
  const droneArmGeo = new THREE.BoxGeometry(H * 0.04, H * 0.02, H * 0.18);
  disposables.push(droneArmGeo);
  const droneRotorGeo = new THREE.CircleGeometry(H * 0.11, 12);
  droneRotorGeo.rotateX(-Math.PI / 2);
  disposables.push(droneRotorGeo);
  const droneLedGeo = new THREE.SphereGeometry(H * 0.05, 6, 6);
  disposables.push(droneLedGeo);

  const droneColors = [
    { body: 0x222233, led: 0xff3344, name: "red-drone" },
    { body: 0x222244, led: 0x33aaff, name: "blue-drone" },
  ];

  for (let i = 0; i < droneCount; i++) {
    const colors = droneColors[i];
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshBasicMaterial({
      color: colors.body, transparent: true, opacity: 0.9,
    });
    disposables.push(bodyMat);
    const body = new THREE.Mesh(droneBodyGeo, bodyMat);
    group.add(body);

    // Colored accent stripe on top
    const stripeMat = new THREE.MeshBasicMaterial({
      color: colors.led, transparent: true, opacity: 0.8,
    });
    disposables.push(stripeMat);
    const stripeGeo = new THREE.BoxGeometry(H * 0.2, H * 0.02, H * 0.05);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = H * 0.05;
    group.add(stripe);
    disposables.push(stripeGeo);

    // 4 rotor arms + disks
    const rotorMat = new THREE.MeshBasicMaterial({
      color: 0x444455, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    });
    disposables.push(rotorMat);
    const rotors: THREE.Mesh[] = [];
    const armPositions = [
      [H * 0.2, 0, H * 0.2], [-H * 0.2, 0, H * 0.2],
      [H * 0.2, 0, -H * 0.2], [-H * 0.2, 0, -H * 0.2],
    ];
    for (const [ax, , az] of armPositions) {
      const arm = new THREE.Mesh(droneArmGeo, bodyMat);
      arm.position.set(ax * 0.5, 0, az * 0.5);
      arm.lookAt(ax, 0, az);
      group.add(arm);

      const rotor = new THREE.Mesh(droneRotorGeo, rotorMat);
      rotor.position.set(ax, H * 0.07, az);
      group.add(rotor);
      rotors.push(rotor);
    }

    // LED light underneath — colored per drone
    const ledMat = new THREE.MeshBasicMaterial({
      color: colors.led, transparent: true, opacity: 1,
    });
    disposables.push(ledMat);
    const led = new THREE.Mesh(droneLedGeo, ledMat);
    led.position.y = -H * 0.06;
    group.add(led);

    const radius = span * (0.1 + Math.random() * 0.15);
    const angle = Math.random() * Math.PI * 2;
    const height = span * (0.08 + Math.random() * 0.06);
    const centerX = (Math.random() - 0.5) * span * 0.3;
    const centerZ = (Math.random() - 0.5) * span * 0.3;

    group.position.set(
      centerX + Math.cos(angle) * radius,
      height,
      centerZ + Math.sin(angle) * radius
    );
    scene.add(group);
    drones.push({
      group, rotors, ledMat, bodyMat,
      centerX, centerZ, radius,
      speed: 0.3 + Math.random() * 0.2,
      angle, height, rotorSpin: 0,
    });
  }

  // ---- RAIN PARTICLES ----
  let rainPoints: THREE.Points | null = null;
  let rainVelocities: Float32Array | null = null;
  const rainMaxCount = 800;
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(rainMaxCount * 3);
  rainVelocities = new Float32Array(rainMaxCount);
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  disposables.push(rainGeo);

  const rainMat = new THREE.PointsMaterial({
    color: 0x88aacc, size: H * 0.3, transparent: true, opacity: 0.5, depthWrite: false,
  });
  disposables.push(rainMat);

  function initRain() {
    if (rainPoints) return;
    for (let i = 0; i < rainMaxCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * span * 2;
      rainPositions[i * 3 + 1] = Math.random() * span * 0.4;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * span * 2;
      rainVelocities![i] = span * (0.15 + Math.random() * 0.1);
    }
    rainGeo.attributes.position.needsUpdate = true;
    rainPoints = new THREE.Points(rainGeo, rainMat);
    rainPoints.visible = false;
    scene.add(rainPoints);
  }

  function updateRain(dt: number, camTarget: THREE.Vector3) {
    if (!rainPoints || !rainPoints.visible || !rainVelocities) return;
    const pos = rainGeo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < rainMaxCount; i++) {
      arr[i * 3 + 1] -= rainVelocities[i] * dt;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = span * 0.4;
        arr[i * 3] = camTarget.x + (Math.random() - 0.5) * span * 1.5;
        arr[i * 3 + 2] = camTarget.z + (Math.random() - 0.5) * span * 1.5;
      }
    }
    pos.needsUpdate = true;
    rainPoints.position.x = camTarget.x;
    rainPoints.position.z = camTarget.z;
  }

  // ---- STARS (night only) ----
  let starPoints: THREE.Points | null = null;
  function initStars() {
    if (starPoints) return;
    const starCount = 200;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.4;
      const r = span * 3;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    disposables.push(starGeo);
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: H * 0.15, transparent: true, opacity: 0.7, depthWrite: false,
    });
    disposables.push(starMat);
    starPoints = new THREE.Points(starGeo, starMat);
    starPoints.visible = false;
    scene.add(starPoints);
  }

  // ---- WEATHER + TIME STATE ----
  let currentWeather: WeatherInfo | null = initialWeather;
  let isDarkTime = initialTod.isDark;
  let currentPeriod: TimePeriod = initialTod.period;

  function applyWeather(weather: WeatherInfo | null) {
    currentWeather = weather;
    if (weather?.isRaining) {
      initRain();
      if (rainPoints) {
        rainPoints.visible = true;
        rainMat.opacity = weather.isHeavyRain ? 0.6 : 0.35;
        rainMat.size = H * (weather.isHeavyRain ? 0.4 : 0.25);
      }
    } else {
      if (rainPoints) rainPoints.visible = false;
    }
    const cloudOpacity = weather?.isCloudy
      ? (isDarkTime ? 0.15 : 0.4)
      : (isDarkTime ? 0.06 : 0.2);
    cloudMat.opacity = cloudOpacity;
  }

  function applyTimeOfDay(tod: TimeOfDayConfig) {
    isDarkTime = tod.isDark;
    currentPeriod = tod.period;

    // Stars at night
    if (tod.isDark) {
      initStars();
      if (starPoints) starPoints.visible = true;
    } else {
      if (starPoints) starPoints.visible = false;
    }

    // Cloud tint by time of day
    let cloudTint = 0xffffff;
    let tintAmount = 0;
    if (tod.period === "morning") { cloudTint = 0xffe4c4; tintAmount = 0.15; }
    else if (tod.period === "evening") { cloudTint = 0xff9966; tintAmount = 0.25; }
    else if (tod.period === "night") { cloudTint = 0x4a6fa5; tintAmount = 0.4; }
    cloudMat.color.setHex(tintHex(0xffffff, cloudTint, tintAmount));

    // Dim bird colors slightly at night
    const dimAmount = tod.isDark ? 0.4 : 0;
    for (const bird of birds) {
      for (const mat of bird.bodyMats) {
        mat.color.setHex(tintHex(bird.species.bodyColor, 0x1a2a4a, dimAmount));
      }
      // Wings keep vertex colors but we can't easily tint them; keep as-is
    }

    applyWeather(currentWeather);
  }

  // Initialize
  applyWeather(initialWeather);
  applyTimeOfDay(initialTod);

  // ---- UPDATE FUNCTION ----
  function update(
    dt: number,
    elapsedTime: number,
    camera: THREE.Camera,
    controlsTarget: THREE.Vector3
  ) {
    const camDist = camera.position.distanceTo(controlsTarget);
    const zoomedIn = camDist < span * 1.5;

    // Birds: fly in circles, flap wings, bank in turns, only visible when zoomed in
    for (const bird of birds) {
      bird.group.visible = zoomedIn;
      if (!zoomedIn) continue;
      bird.angle += bird.speed * dt;
      bird.group.position.x = bird.centerX + Math.cos(bird.angle) * bird.radius;
      bird.group.position.z = bird.centerZ + Math.sin(bird.angle) * bird.radius;
      bird.group.position.y = bird.height + Math.sin(elapsedTime * 0.5 + bird.angle) * H * 2;
      // Face direction of travel
      bird.group.rotation.y = -bird.angle - Math.PI / 2;
      // Slight banking in turns
      bird.group.rotation.z = Math.sin(elapsedTime * 0.3 + bird.angle) * 0.15;
      // Flap wings — pivot from body center
      const flap = Math.sin(elapsedTime * bird.flapSpeed) * 0.7;
      bird.rightWingPivot.rotation.z = flap;
      bird.leftWingPivot.rotation.z = -flap;
    }

    // Clouds: drift slowly, always visible
    for (const cloud of clouds) {
      cloud.group.position.x += cloud.speed * dt * H * 2;
      if (cloud.group.position.x > span * 1.2) {
        cloud.group.position.x = -span * 1.2;
        cloud.group.position.z = (Math.random() - 0.5) * span * 1.5;
      }
    }

    // Planes: spawn periodically, fly across, blink strobe + nav lights
    for (const plane of planes) {
      if (!plane.active) {
        plane.timer += dt;
        if (plane.timer >= plane.spawnInterval) {
          plane.active = true;
          plane.timer = 0;
          plane.spawnInterval = 30 + Math.random() * 45;
          const altitude = span * (0.5 + Math.random() * 0.3);
          plane.group.position.set(
            -span * 1.5 * plane.startSide,
            altitude,
            (Math.random() - 0.5) * span * 1.5
          );
          plane.group.rotation.y = plane.startSide > 0 ? Math.PI / 2 : -Math.PI / 2;
          plane.group.visible = true;
        }
      } else {
        plane.group.position.x += plane.speed * dt * H * 10 * plane.startSide;
        // Blink strobe light (white flash every ~0.5s)
        const strobeOn = Math.sin(elapsedTime * 12) > 0.7;
        plane.strobeMat.color.setHex(strobeOn ? 0xffffff : 0x222222);
        plane.strobeMat.opacity = strobeOn ? 1 : 0.3;
        // Nav lights pulse gently
        const navPulse = 0.6 + Math.sin(elapsedTime * 3) * 0.4;
        plane.navLightMats.red.opacity = navPulse;
        plane.navLightMats.green.opacity = navPulse;
        // Despawn when off-screen
        if (plane.startSide > 0 ? plane.group.position.x > span * 1.5 : plane.group.position.x < -span * 1.5) {
          plane.active = false;
          plane.group.visible = false;
        }
      }
    }

    // Drones: hover in circles, spin rotors, pulse LED, only visible when zoomed in
    for (const drone of drones) {
      drone.group.visible = zoomedIn;
      if (!zoomedIn) continue;
      drone.angle += drone.speed * dt;
      drone.group.position.x = drone.centerX + Math.cos(drone.angle) * drone.radius;
      drone.group.position.z = drone.centerZ + Math.sin(drone.angle) * drone.radius;
      drone.group.position.y = drone.height + Math.sin(elapsedTime * 1.5 + drone.angle * 2) * H * 1.5;
      drone.group.rotation.y = -drone.angle - Math.PI / 2;
      // Spin rotors
      drone.rotorSpin += dt * 30;
      for (const rotor of drone.rotors) {
        rotor.rotation.y = drone.rotorSpin;
      }
      // LED pulse
      drone.ledMat.opacity = 0.4 + Math.sin(elapsedTime * 4) * 0.6;
    }

    // Rain
    updateRain(dt, controlsTarget);
  }

  // ---- DISPOSE ----
  function dispose() {
    for (const d of disposables) d.dispose();
    if (rainPoints) scene.remove(rainPoints);
    if (starPoints) scene.remove(starPoints);
    for (const bird of birds) scene.remove(bird.group);
    for (const cloud of clouds) scene.remove(cloud.group);
    for (const plane of planes) scene.remove(plane.group);
    for (const drone of drones) scene.remove(drone.group);
  }

  return {
    update,
    dispose,
    setWeather: applyWeather,
    setTimeOfDay: applyTimeOfDay,
  };
}