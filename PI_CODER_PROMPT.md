# PROJECT: Sidekick Native Route Optimizer (Replace ZEO + 3D Map Interface)

## Objective
Build a native route optimization system that replaces the current ZEO Route Planner export workflow in the HERO Sidekick app. Instead of exporting orders to ZEO and picking up routes manually, optimize routes end-to-end within the app using the VROOM project engine, and visualize them on a 3D map built with Three.js.

## Existing App Context (READ THIS FIRST)

### App Location
- **Path:** `/root/my-app/`
- **Stack:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Prisma + SQLite
- **Dev URL:** https://sidekickdev.rizen.space/ (proxies to `127.0.0.1:3002`)
- **Prod URL:** https://sidekick.rizen.space/ (proxies to `127.0.0.1:3001`)
- **Package Manager:** Bun (bun.lock present)
- **Timezone:** VPS is `Asia/Kuala_Lumpur` (UTC+8). All route time windows MUST be computed in local time and converted to Unix timestamps correctly. Do NOT rely on `new Date()` defaults — explicitly use `Asia/Kuala_Lumpur` offset (+08:00) when building VROOM `time_window` timestamps.

### Database Schema (Prisma — `/root/my-app/prisma/schema.prisma`)
The `Order` model is the primary data source for route optimization:

```prisma
model Order {
  id               String   @id @default(cuid())
  orderId          String
  customerName     String
  phone            String
  address          String
  city             String
  size             String   // S, M, L
  points           Int      // 1-12 (e-waste weight proxy)
  zone             Int      // 1-14 built-in, 100+ custom zones
  isOffice         Boolean  @default(false)
  isEvent          Boolean  @default(false)
  isErthbox        Boolean  @default(false)
  erthboxLocationId String?
  status           String   @default("PENDING") // PENDING, SCHEDULED, CONFIRMED, BOOKED, COMPLETED
  scheduledDate    String?  // YYYY-MM-DD
  notes            String?
  latitude         Float?
  longitude        Float?
  addressVerified  Boolean  @default(false)
  userId           String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@unique([userId, orderId])
  @@index([userId, status])
  @@index([userId, scheduledDate])
}
```

**⚠️ ID MAPPING:** VROOM requires integer job IDs, but `Order.id` is a cuid string. You MUST implement an explicit bidirectional ID-mapping layer:
- Before optimization: assign each order a sequential integer (1, 2, 3...) and store the `intId → orderId` mapping.
- After optimization: map VROOM's integer step IDs back to `orderId` strings for the frontend and DB.

### Existing Route Model (`/root/my-app/src/lib/route-model.ts`)
```typescript
export const FIXED_LOCATIONS = {
  HOME: {
    name: "BSP21 (Home)",
    latitude: 2.9437430334894716,
    longitude: 101.59003412883487,
    address: "BSP21, Bandar Saujana Putra",
  },
  DROP_A: {
    name: "ERTH HQ, Cyberjaya",
    latitude: 2.9135695,
    longitude: 101.6553101,
    address: "ERTH HQ, Near Kanvas SOHO, Cyberjaya",
  },
  DROP_B: {
    name: "Section 51A, PJ",
    latitude: 3.0942469,
    longitude: 101.6316896,
    address: "Extra Space Asia, Section 51A, Petaling Jaya",
  },
};

export const VEHICLE = {
  name: "Isuzu D-Max 4x4 (2021)",
  capacity: 80,          // max points per load
  startHour: 10,         // first pickup at 10:00 AM
  endHour: 16,           // must be back home by 4:00 PM
  serviceTimePickup: 8,  // minutes per pickup
  serviceTimeDrop: 10,   // minutes per drop-off
  avgSpeed: 40,          // km/h fallback
};

export interface PickupNode {
  id: string;
  orderId: string;
  customerName: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  points: number;
  zone: number;
  size: string;
  notes?: string;
  phone: string;
}
```

**⚠️ CAPACITY RESET / DROP-OFF LOGIC:** The vehicle capacity is 80 points per load. DROP_A (ERTH HQ) and DROP_B (Section 51A) are drop-off / unloading waypoints where accumulated e-waste is emptied, resetting the load. VROOM cannot reset vehicle capacity mid-route on its own — it has no "unload" primitive. You MUST handle this with one of these strategies:

1. **Multi-vehicle approach (RECOMMENDED):** Model each "load" as a separate vehicle. Vehicle 1: HOME → pickups (≤80 pts) → DROP_A → HOME. Vehicle 2: HOME → more pickups → DROP_A → HOME. VROOM optimizes across all vehicles simultaneously, and the frontend stitches the sub-routes into one daily plan.
2. **Shipment approach:** Model each drop-off as a VROOM `shipment` where pickup = customer location and delivery = DROP_A/DROP_B. The `amount` field on the shipment reduces vehicle load when delivered.
3. **Guard-rail assumption (simplest):** If a day's total points ≤ 80 (single load), proceed with a single vehicle, HOME start/end. If > 80, split orders into sub-routes manually by zone, optimize each group separately, and insert DROP_A as the endpoint of each sub-route.

**Document which strategy you chose in a comment in `vroom.ts`.**

### Existing ZEO Integration (DO NOT modify — just replace the dependency)
- `/root/my-app/src/lib/zeo.ts` — ZEO API client (to be replaced by VROOM)
- `/root/my-app/src/app/api/zeo/route.ts` — ZEO API route handler (to be replaced)
- `/root/my-app/src/app/api/export/zeo/route.ts` — ZEO XLSX export (keep as legacy export)

### Existing Geocoding (`/root/my-app/src/lib/geocode.ts`)
- Uses Google Maps Geocoding API (key in `.env` as `GOOGLE_MAPS_API_KEY`)
- Falls back to Nominatim (OpenStreetMap)
- All orders with `latitude`/`longitude` are geocoded already
- The Google Maps Distance Matrix API key is available and can be used to precompute a travel-time matrix if you choose Option C routing (see below)

### Auth (`/root/my-app/src/lib/session.ts`)
- Uses NextAuth with Prisma adapter
- `requireAuth()` returns the logged-in user or null
- Hero role users can only see their own orders

## What to Build

### Phase 1: VROOM Backend Integration

#### 1.1 — Choose a Routing Strategy (pick ONE)

**Option A (VROOM + OSRM via Docker — full self-hosted):**
Requires a `config.yml` that links VROOM to the OSRM routing engine. A bare `docker run` without config will NOT route.

```yaml
# /root/vroom/config.yml
cli_args: ""
file_uploads: false
max_vehicles: 10
max_jobs: 1000
geometry: true
timeout: 10000

routing:
  engine: osrm
  host: osrm
  port: 5000
```

```bash
# Network: both containers must share a Docker network
docker network create route-net

# OSRM (Malaysia routing graph)
docker run -d --name osrm --network route-net \
  -p 5000:5000 \
  -v /root/osrm-data:/data \
  osrm/osrm-backend osrm-routed --algorithm mld /data/malaysia-latest.osrm

# VROOM (must mount config.yml)
docker run -d --name vroom --network route-net \
  -p 3000:3000 \
  -v /root/vroom/config.yml:/config.yml \
  ghcr.io/vroom-project/vroom-docker:v1.14.0
```

OSRM graph build (one-time, ~10 min CPU):
```bash
wget https://download.geofabrik.de/asia/malaysia-latest.osm.pbf
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/malaysia-latest.osm.pbf
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-partition /data/malaysia-latest.osrm
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-customize /data/malaysia-latest.osrm
```

**Option B (VROOM Cloud API — no local setup):**
- POST optimization problem to `https://api.vroom-project.org/v1/`
- No Docker, no OSRM, but has rate limits and requires an API key
- Set `VROOM_API_URL=https://api.vroom-project.org/v1` and `VROOM_API_KEY=<key>`

**Option C (VROOM + precomputed matrix — skip OSRM entirely):**
- Use the Google Maps Distance Matrix API (key already available) to compute a travel-time matrix between all stops
- Pass the matrix directly to VROOM via the `matrices` field (no routing engine needed)
- VROOM optimizes using your matrix; you skip Docker/OSRM entirely
- Lightest infrastructure footprint for a single VPS
- Reference: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md#matrices

#### 1.2 — VROOM API Format
VROOM accepts a JSON problem and returns an optimized solution.

**Input format (key fields):**
```json
{
  "vehicles": [
    {
      "id": 1,
      "start": [101.590034, 2.943743],
      "end": [101.590034, 2.943743],
      "capacity": [80],
      "time_window": [1721445600, 1721467200]
    }
  ],
  "jobs": [
    {
      "id": 1,
      "service": 480,
      "delivery": [3],
      "location": [101.6553, 2.9135],
      "time_windows": [[1721445600, 1721467200]]
    }
  ]
}
```

**Output format (key fields):**
```json
{
  "code": 0,
  "summary": {
    "cost": 18711,
    "routes": 1,
    "unassigned": 0,
    "duration": 18711,
    "distance": 312359
  },
  "routes": [
    {
      "vehicle": 1,
      "duration": 6565,
      "distance": 95606,
      "steps": [
        {
          "type": "start",
          "location": [101.590034, 2.943743],
          "arrival": 1721446272
        },
        {
          "type": "job",
          "id": 1,
          "location": [101.6553, 2.9135],
          "arrival": 1721448600,
          "service": 480,
          "load": [3]
        },
        {
          "type": "end",
          "location": [101.590034, 2.943743],
          "arrival": 1721452837
        }
      ]
    }
  ],
  "unassigned": []
}
```

**IMPORTANT:**
- VROOM coordinates are `[lon, lat]`, NOT `[lat, lng]`.
- All timings are in seconds (Unix timestamps).
- All distances are in meters.
- Job `id` fields are integers — map them to `orderId` strings via your ID-mapping layer.
- Time windows must be computed in `Asia/Kuala_Lumpur` (UTC+8), then converted to Unix timestamps.

#### 1.3 — Create VROOM Library
Create `/root/my-app/src/lib/vroom.ts`:

```typescript
// VROOM Route Optimization Client
// Docs: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md

const VROOM_API_URL = process.env.VROOM_API_URL || "http://127.0.0.1:3000";
const VROOM_API_KEY = process.env.VROOM_API_KEY || ""; // only for cloud API

export interface VroomVehicle {
  id: number;
  start: [number, number];
  end: [number, number];
  capacity: number[];
  time_window: [number, number];
}

export interface VroomJob {
  id: number;
  service: number;
  delivery: number[];
  location: [number, number];
  time_windows?: [[number, number]];
}

export interface VroomProblem {
  vehicles: VroomVehicle[];
  jobs: VroomJob[];
}

export interface VroomSolution {
  code: number;
  summary: {
    cost: number;
    routes: number;
    unassigned: number;
    duration: number;
    distance: number;
  };
  routes: VroomRoute[];
  unassigned: { id: number; reason: string }[];
}

export interface VroomRoute {
  vehicle: number;
  duration: number;
  distance: number;
  steps: VroomStep[];
}

export interface VroomStep {
  type: "start" | "job" | "end";
  location: [number, number];
  arrival: number;
  service: number;
  id?: number;
  load?: number[];
}

// ID-MAPPING LAYER (required — VROOM needs int IDs, Order.id is cuid string)
export interface IdMapping {
  intId: number;
  orderId: string;
  orderDbId: string;
}

export function buildIdMappings(orders: { id: string; orderId: string }[]): IdMapping[] {
  return orders.map((o, i) => ({ intId: i + 1, orderId: o.orderId, orderDbId: o.id }));
}

export function resolveStepToOrder(step: VroomStep, mapping: IdMapping[]): IdMapping | null {
  if (step.type !== "job" || step.id === undefined) return null;
  return mapping.find(m => m.intId === step.id) || null;
}

// TIMEZONE HELPER — ensures Malaysia time windows are correct
export function buildTimeWindow(date: string): [number, number] {
  // date = "2026-07-20"
  // 10:00 AM to 4:00 PM Malaysia time (UTC+8)
  const startStr = `${date}T10:00:00+08:00`;
  const endStr = `${date}T16:00:00+08:00`;
  return [Math.floor(new Date(startStr).getTime() / 1000), Math.floor(new Date(endStr).getTime() / 1000)];
}

// Implement: buildVroomProblemFromOrders(), solveVroomProblem(), etc.
// Document the capacity-reset strategy you chose (see route-model.ts notes).
```

#### 1.4 — Create API Routes
- `/api/route/optimize` (POST) — Takes `{ date }`, fetches orders for that date, builds VROOM problem, calls VROOM, returns optimized route
- `/api/route/preview` (GET) — Returns saved route for a date
- `/api/route/save` (POST) — Persists optimized route to DB (new `Route` model in Prisma)

Create a new Prisma model:
```prisma
model Route {
  id            String   @id @default(cuid())
  date          String
  userId        String
  vehicleId     Int
  routeData     String
  idMapping     String   // JSON blob of intId → orderId mapping
  totalDistance Float
  totalDuration Int
  stopCount     Int
  status        String   @default("OPTIMIZED")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, date])
  @@index([userId, date])
}
```

**⚠️ Prisma gotcha:** The `Route` model has a relation to `User`. You MUST add the reciprocal relation field on the `User` model:
```prisma
// In the User model, add:
model User {
  // ... existing fields ...
  routes         Route[]
}
```
After modifying the schema, run `npx prisma db push` to sync the SQLite database.

### Phase 2: Three.js 3D Map Interface

#### 2.1 — Install Dependencies
```bash
cd /root/my-app
bun add three @types/three
```

#### 2.2 — Create 3D Route Map Component
Create `/root/my-app/src/components/route-map-3d.tsx`:

**⚠️ Next.js gotcha:** Three.js uses `window` and `document` which don't exist server-side. This component MUST be:
1. Marked `"use client"` at the top of the file
2. Dynamically imported with `ssr: false` from the parent page:
```tsx
// In route/page.tsx:
import dynamic from "next/dynamic";
const RouteMap3D = dynamic(() => import("@/components/route-map-3d"), { ssr: false });
```

A Three.js-powered 3D map that:
- Renders Malaysia (Klang Valley focus) as a 3D terrain with map tile textures
- Plots all optimized route stops as 3D pins/markers colored by zone
- Draws the optimized route path as a 3D line connecting stops (animated draw)
- Shows the HOME location, DROP_A, and DROP_B as special markers
- Displays the vehicle's current position (animated dot moving along the route)
- Supports camera orbit (drag), zoom (scroll), and click-to-select stops
- Shows a side panel with stop details (orderId, customer, address, points, ETA)
- Mobile-responsive (touch controls)

**Technical requirements:**
- Use `THREE.WebGLRenderer` with antialiasing
- Use `THREE.PerspectiveCamera` with orbit controls
- Tile-based ground plane (see OSM Tile Policy below)
- Route path: `THREE.Line` with `LineBasicMaterial` (glowing effect)
- Stop markers: Custom geometry (cone/cylinder) with hover raycasting
- Animate route draw on load (progressive line drawing)
- Cleanup: dispose geometries/materials on unmount

**⚠️ COORDINATE MATH (flat local-tangent-plane, NOT spherical):**
The 3D map is a flat plane textured with map tiles. Do NOT use spherical/globe projection — it won't match the flat tiles. Use a flat local-tangent-plane conversion centered on Klang Valley:

```typescript
// Flat local-tangent-plane projection (matches flat PlaneGeometry + tile texture)
// Center on Klang Valley: lat=3.05, lon=101.6
const MAP_CENTER_LAT = 3.05;
const MAP_CENTER_LON = 101.6;
const SCALE = 10000; // meters per unit (tune for scene scale)

function latLonToVector3(lat: number, lon: number): THREE.Vector3 {
  // Flat equirectangular projection — matches OSM tile plane perfectly
  const latOffset = (lat - MAP_CENTER_LAT) * (Math.PI / 180) * SCALE;
  const lonOffset = (lon - MAP_CENTER_LON) * (Math.PI / 180) * SCALE * Math.cos(MAP_CENTER_LAT * Math.PI / 180);
  // x = east (longitude), z = north (latitude), y = up (0 for ground)
  return new THREE.Vector3(lonOffset, 0, -latOffset);
}
```
This produces flat (x, 0, z) coordinates that align perfectly with a flat `PlaneGeometry` ground mesh textured with OSM tiles.

**⚠️ OSM TILE USAGE POLICY:**
Hitting `tile.openstreetmap.org` directly from a client app violates OSM's Tile Usage Policy and risks an IP ban. You MUST do one of:
1. **Proxy through your own backend:** Create a Next.js API route `/api/tile/{z}/{x}/{y}` that fetches and caches tiles server-side with proper User-Agent and rate-limiting.
2. **Use a compliant provider:** Stamen, CARTO, or Esri provide free tile endpoints that permit web usage. Example: `https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png`
3. **Self-host:** Download Klang Valley tiles for z=11-14 and serve them from `/public/tiles/`.

Always include OSM attribution in the UI (a small "© OpenStreetMap contributors" text overlay).

#### 2.3 — Create Route Page
Create `/root/my-app/src/app/route/page.tsx`:
- This is a SERVER COMPONENT. Do NOT import Three.js here directly.
- Dynamically import the 3D map component with `ssr: false` (see gotcha above)
- Date picker (default today)
- "Optimize Route" button → calls `/api/route/optimize`
- Loading state during optimization
- 3D map render on left (70% width on desktop, 100% on mobile)
- Route summary panel on right (30% width):
  - Total distance (km)
  - Total duration (formatted as h m)
  - Number of stops
  - Vehicle load (points used / capacity)
  - Unassigned stops (if any) with reason
  - Ordered list of stops with ETA, orderId, customer name, address, points
- "Start Route" button → saves route and sets status to STARTED

### Phase 3: End-to-End Route Workflow
Replace the current ZEO export flow with:
1. User selects date → clicks "Optimize"
2. Backend fetches geocoded orders for that date (filter: `latitude` and `longitude` not null, status in CONFIRMED/BOOKED)
3. Builds VROOM problem with HOME as start/end, vehicle capacity, time windows (Malaysia timezone)
4. Calls VROOM API → gets optimized route
5. Returns solution → frontend renders 3D map + ordered stop list
6. User reviews → clicks "Start Route" → route saved to DB
7. During route: user marks stops as COMPLETED (existing order status update API)
8. Route map updates in real-time (vehicle position advances to next stop)

## Key Constraints
- **Do NOT break existing functionality** — add new pages/routes, don't modify existing ZEO export
- **Auth is required** — all new API routes must use `requireAuth()` from `@/lib/session`
- **DB is SQLite** — use `db/custom.db` via Prisma client
- **Environment:** Add `VROOM_API_URL` and optionally `VROOM_API_KEY` to `.env`
- **Dev server:** Runs on port 3002 (`next dev -p 3002`)
- **Mobile-first:** Tars uses this on his phone during routes
- **Timezone:** Always compute route time windows in `Asia/Kuala_Lumpur` (UTC+8)

## File Checklist (what to create)
```
/root/my-app/src/lib/vroom.ts                          ← VROOM client + ID mapping + timezone helpers
/root/my-app/src/app/api/route/optimize/route.ts       ← Optimization endpoint
/root/my-app/src/app/api/route/preview/route.ts        ← Get saved route
/root/my-app/src/app/api/route/save/route.ts           ← Persist route
/root/my-app/src/app/api/tile/[z]/[x]/[y]/route.ts     ← OSM tile proxy (if using Option 1)
/root/my-app/src/components/route-map-3d.tsx           ← Three.js 3D map (client-only, dynamic import)
/root/my-app/src/components/route-summary-panel.tsx    ← Side panel
/root/my-app/src/app/route/page.tsx                    ← Route planner page (server component)
/root/my-app/prisma/schema.prisma                      ← Add Route model + user.routes relation
```

## Definition of Done (per phase)

### Phase 1 — VROOM Backend
- [ ] `vroom.ts` compiles with all TypeScript interfaces
- [ ] ID-mapping layer works (int → orderId, both directions)
- [ ] Timezone helper produces correct Unix timestamps for Malaysia time
- [ ] `/api/route/optimize` returns a valid VROOM solution for a test date
- [ ] `/api/route/save` persists route to SQLite via Prisma
- [ ] `npx prisma db push` succeeds after adding Route model
- [ ] Capacity-reset strategy is documented in `vroom.ts` comments

### Phase 2 — Three.js 3D Map
- [ ] Three.js renders without SSR errors (dynamic import with `ssr: false`)
- [ ] Map tiles load via proxy or compliant provider (no direct OSM tile hits)
- [ ] OSM attribution visible in UI
- [ ] Route path draws as animated 3D line connecting stops
- [ ] Stop markers render with hover/click raycasting
- [ ] Coordinate conversion uses flat local-tangent-plane (not spherical)
- [ ] Camera orbit + zoom works on desktop and mobile (touch)
- [ ] No WebGL context leaks (geometries/materials disposed on unmount)

### Phase 3 — End-to-End Workflow
- [ ] Date → Optimize → 3D map renders route → Save → Start Route flow works
- [ ] Marking a stop as COMPLETED during a route works (existing order API)
- [ ] Route summary panel shows correct distance, duration, stops, load
- [ ] Builds cleanly: `cd /root/my-app && bun run build` with zero TypeScript errors
- [ ] Mobile viewport: 3D map + panel are usable on phone-sized screens
- [ ] Navigate to `https://sidekickdev.rizen.space/route` — page loads and renders

## Existing Resources (read before starting)
1. `/root/my-app/src/lib/route-model.ts` — Vehicle config, fixed locations, PickupNode interface
2. `/root/my-app/src/lib/zeo.ts` — Existing ZEO integration (reference for order→route mapping)
3. `/root/my-app/src/lib/geocode.ts` — Geocoding service (all orders have lat/lon; Google Maps API key available)
4. `/root/my-app/src/lib/db.ts` — Prisma client instance
5. `/root/my-app/src/lib/session.ts` — Auth helper (`requireAuth()`)
6. `/root/my-app/prisma/schema.prisma` — Full database schema

## VROOM API Reference
- **Repo:** https://github.com/VROOM-Project/vroom
- **API docs:** https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
- **Docker:** https://github.com/VROOM-Project/vroom-docker
- **Coordinates are `[lon, lat]`** (not `[lat, lng]`)
- **All timings in seconds, distances in meters**
- **Vehicles need `start` and `end` for round-trip routing**
- **Jobs need `service` (stop duration in seconds) and `location`**
- **Job IDs are integers** — map them to `orderId` strings

## ZEO Reference (what we're replacing)
- **Site:** https://zeorouteplanner.com/
- **Current flow:** Export orders → manually import to ZEO → ZEO optimizes → copy route back
- **New flow:** Click "Optimize" → VROOM optimizes in-app → 3D map renders route
