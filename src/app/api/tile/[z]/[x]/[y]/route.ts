import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// GET /api/tile/[z]/[x]/[y] — Tile proxy with persistent disk cache.
//
// Uses CARTO dark_matter tiles (OSM-based, full coverage), falling back to
// Esri Dark Gray Canvas. Tiles are cached in-memory AND on disk.
// CARTO/OSM uses standard {z}/{x}/{y} ordering. Esri uses {z}/{y}/{x}.

const UPSTREAMS = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
];

const TILE_CACHE_DIR = path.join(process.cwd(), "tile-cache");

// In-memory cache (fastest, but cleared on restart)
const memCache = new Map<string, { buf: Buffer; ct: string }>();
const MAX_MEM = 800;

// Disk cache: tiles/{z}/{x}/{y}.png — persistent across restarts
async function getDiskTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const fp = path.join(TILE_CACHE_DIR, String(z), String(x), `${y}.png`);
  try {
    return await fs.readFile(fp);
  } catch {
    return null;
  }
}

async function writeDiskTile(z: number, x: number, y: number, buf: Buffer): Promise<void> {
  try {
    const dir = path.join(TILE_CACHE_DIR, String(z), String(x));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${y}.png`), buf);
  } catch {
    // ignore disk errors — memory cache still works
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params;
  const yClean = y.replace(/\.png$/i, "");

  const zi = Number(z);
  const xi = Number(x);
  const yi = Number(yClean);
  if (!Number.isFinite(zi) || !Number.isFinite(xi) || !Number.isFinite(yi)) {
    return NextResponse.json({ error: "bad tile coords" }, { status: 400 });
  }

  const key = `${z}/${x}/${yClean}`;

  // 1. Check in-memory cache (instant)
  const memHit = memCache.get(key);
  if (memHit) {
    return new NextResponse(new Uint8Array(memHit.buf), {
      headers: {
        "Content-Type": memHit.ct,
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  }

  // 2. Check disk cache (fast — no network)
  const diskBuf = await getDiskTile(zi, xi, yi);
  if (diskBuf) {
    // Populate memory cache for next time
    if (memCache.size >= MAX_MEM) {
      const ks = Array.from(memCache.keys());
      for (let i = 0; i < Math.ceil(MAX_MEM * 0.2); i++) memCache.delete(ks[i]);
    }
    memCache.set(key, { buf: diskBuf, ct: "image/png" });
    return new NextResponse(new Uint8Array(diskBuf), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  }

  // 3. Fetch from Esri (slow — network round-trip)
  const url = UPSTREAMS[(xi + yi) % UPSTREAMS.length]
    .replace("{z}", z)
    .replace("{y}", yClean)
    .replace("{x}", x);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HERO-Sidekick/1.0 (route planner tile proxy)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "tile fetch failed" }, { status: 502 });
    }
    const ct = res.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await res.arrayBuffer());

    // Write to both caches
    if (memCache.size >= MAX_MEM) {
      const ks = Array.from(memCache.keys());
      for (let i = 0; i < Math.ceil(MAX_MEM * 0.2); i++) memCache.delete(ks[i]);
    }
    memCache.set(key, { buf, ct });
    writeDiskTile(zi, xi, yi, buf); // async — don't block response

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "tile proxy error" }, { status: 502 });
  }
}