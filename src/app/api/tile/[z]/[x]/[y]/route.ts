import { NextRequest, NextResponse } from "next/server";

// GET /api/tile/[z]/[x]/[y] — Tile proxy.
//
// To comply with OSM Tile Usage Policy we do NOT hit tile.openstreetmap.org
// directly from the client. Instead we proxy through CARTO basemaps (which
// permit web usage) and forward a proper User-Agent. A tiny in-memory LRU
// cache keeps repeated tile fetches off the upstream provider.
//
// OSM attribution is required and is rendered in the UI overlay.

const UPSTREAMS = [
  "https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png",
  "https://cartodb-basemaps-b.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png",
  "https://cartodb-basemaps-c.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png",
];

const cache = new Map<string, { buf: Buffer; ts: number; ct: string }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE = 600;

function getCached(key: string) {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.ts > CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  return e;
}

function setCached(key: string, buf: Buffer, ct: string) {
  if (cache.size >= MAX_CACHE) {
    const ks = Array.from(cache.keys());
    for (let i = 0; i < Math.ceil(MAX_CACHE * 0.2); i++) cache.delete(ks[i]);
  }
  cache.set(key, { buf, ts: Date.now(), ct });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z, x, y } = await params;
  // y may arrive as "123.png" — strip the extension
  const yClean = y.replace(/\.png$/i, "");

  const zi = Number(z);
  const xi = Number(x);
  const yi = Number(yClean);
  if (!Number.isFinite(zi) || !Number.isFinite(xi) || !Number.isFinite(yi)) {
    return NextResponse.json({ error: "bad tile coords" }, { status: 400 });
  }

  const key = `${z}/${x}/${yClean}`;
  const hit = getCached(key);
  if (hit) {
    return new NextResponse(new Uint8Array(hit.buf), {
      headers: {
        "Content-Type": hit.ct,
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  }

  const url = UPSTREAMS[(xi + yi) % UPSTREAMS.length]
    .replace("{z}", z)
    .replace("{x}", x)
    .replace("{y}", yClean);

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
    setCached(key, buf, ct);
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