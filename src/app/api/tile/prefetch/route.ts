import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAuth } from "@/lib/session";

// POST /api/tile/prefetch — Pre-warm the tile cache for a bounding box.
//
// Body: { minLat, maxLat, minLon, maxLon, zoomLevels?: number[], style?: "dark"|"light" }

const UPSTREAM_DARK = "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const UPSTREAM_LIGHT = "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
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

async function fetchAndCache(style: string, upstream: string, z: number, x: number, y: number): Promise<boolean> {
  const fp = path.join(TILE_CACHE_DIR, style, String(z), String(x), `${y}.png`);
  try {
    await fs.access(fp);
    return true;
  } catch {
    // Legacy fallback for dark tiles
    if (style === "dark") {
      const oldFp = path.join(TILE_CACHE_DIR, String(z), String(x), `${y}.png`);
      try { await fs.access(oldFp); return true; } catch {}
    }
  }

  const url = upstream.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HERO-Sidekick/1.0 (route planner tile proxy)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const dir = path.join(TILE_CACHE_DIR, style, String(z), String(x));
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
  const { minLat, maxLat, minLon, maxLon, style } = body || {};
  const nums = [minLat, maxLat, minLon, maxLon];
  if (
    !body ||
    !nums.every((n) => typeof n === "number" && Number.isFinite(n)) ||
    minLat < -90 || maxLat > 90 || minLat >= maxLat ||
    minLon < -180 || maxLon > 180 || minLon >= maxLon
  ) {
    return NextResponse.json({ error: "invalid bbox" }, { status: 400 });
  }
  const mapStyle = style === "light" ? "light" : "dark";
  const upstream = mapStyle === "light" ? UPSTREAM_LIGHT : UPSTREAM_DARK;

  const rawZoom: unknown = body.zoomLevels ?? [10, 13, 14, 15, 16, 17];
  if (!Array.isArray(rawZoom) || rawZoom.length === 0 || rawZoom.length > 8) {
    return NextResponse.json({ error: "invalid zoomLevels" }, { status: 400 });
  }
  const zoomLevels = [...new Set(rawZoom)].filter(
    (z): z is number => Number.isInteger(z) && (z as number) >= 8 && (z as number) <= 17
  );
  if (zoomLevels.length !== rawZoom.length) {
    return NextResponse.json({ error: "zoom levels must be integers between 8 and 17" }, { status: 400 });
  }

  // Hard cap total tiles across the whole request (resource-exhaustion guard).
  let totalTiles = 0;
  for (const z of zoomLevels) {
    const tX = lonToTileX(maxLon, z) - lonToTileX(minLon, z) + 1;
    const tY = latToTileY(minLat, z) - latToTileY(maxLat, z) + 1;
    if (tX * tY > 200) {
      return NextResponse.json({ error: `bbox too large at zoom ${z} (max 200 tiles per level)` }, { status: 400 });
    }
    totalTiles += tX * tY;
  }
  if (totalTiles > 500) {
    return NextResponse.json({ error: `total tile count ${totalTiles} exceeds limit of 500` }, { status: 400 });
  }

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
        batch.map((t) => fetchAndCache(mapStyle, upstream, z, t.x, t.y))
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
    style: mapStyle,
    fetched,
    cached,
    failed,
    zoomLevels,
  });
}