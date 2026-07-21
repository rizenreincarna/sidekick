import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAuth } from "@/lib/session";

// POST /api/tile/prefetch — Pre-warm the tile cache for a bounding box at
// multiple zoom levels. Called after route optimization so that when the user
// zooms/pan the 3D map, tiles are served from disk/memory cache instantly
// instead of fetching from Esri's servers (200-500ms per tile).
//
// Body: { minLat, maxLat, minLon, maxLon, zoomLevels?: number[] }
// Default zoom levels: [10, 13, 14, 15, 16, 17]

const UPSTREAM = "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const TILE_CACHE_DIR = path.join(process.cwd(), "tile-cache");

function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}
function latToTileY(lat: number, z: number) {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

async function fetchAndCache(z: number, x: number, y: number): Promise<boolean> {
  // Check disk first
  const fp = path.join(TILE_CACHE_DIR, String(z), String(x), `${y}.png`);
  try {
    await fs.access(fp);
    return true; // already cached
  } catch {
    // not cached — fetch from Esri
  }

  const url = UPSTREAM.replace("{z}", String(z)).replace("{y}", String(y)).replace("{x}", String(x));
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HERO-Sidekick/1.0 (route planner tile proxy)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const dir = path.join(TILE_CACHE_DIR, String(z), String(x));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${y}.png`), buf);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Auth required — prevent abuse/DoS from unauthenticated tile prefetching
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.minLat !== "number") {
    return NextResponse.json({ error: "missing bbox" }, { status: 400 });
  }

  const { minLat, maxLat, minLon, maxLon } = body;
  // Validate bbox ranges
  if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
    return NextResponse.json({ error: "invalid bbox" }, { status: 400 });
  }
  const zoomLevels: number[] = body.zoomLevels || [10, 13, 14, 15, 16, 17];

  let fetched = 0;
  let cached = 0;
  let failed = 0;

  // Process each zoom level sequentially (avoid overwhelming Esri servers)
  for (const z of zoomLevels) {
    const tx0 = lonToTileX(minLon, z);
    const tx1 = lonToTileX(maxLon, z);
    const ty0 = latToTileY(maxLat, z);
    const ty1 = latToTileY(minLat, z);
    const tX = tx1 - tx0 + 1;
    const tY = ty1 - ty0 + 1;

    // Skip if too many tiles at this zoom level
    if (tX * tY > 200) continue;

    // Fetch tiles with limited concurrency (4 at a time)
    const tiles: { x: number; y: number }[] = [];
    for (let i = 0; i < tX; i++) {
      for (let j = 0; j < tY; j++) {
        tiles.push({ x: tx0 + i, y: ty0 + j });
      }
    }

    // Batch of 4
    for (let i = 0; i < tiles.length; i += 4) {
      const batch = tiles.slice(i, i + 4);
      const results = await Promise.all(
        batch.map((t) => fetchAndCache(z, t.x, t.y))
      );
      for (const r of results) {
        if (r) cached++;
        else failed++;
      }
      fetched += batch.length;
    }
  }

  return NextResponse.json({
    ok: true,
    fetched,
    cached,
    failed,
    zoomLevels,
  });
}