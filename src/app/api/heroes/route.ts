import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextResponse } from "next/server";

let heroesCache: { data: unknown; ts: number } | null = null;
const HEROES_CACHE_TTL = 5000; // 5 seconds

// GET /api/heroes - List active heroes (Support and Admin only)
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (user.role !== "SUPPORT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Access denied. Support or Admin privileges required." }, { status: 403 });
  }

  try {
    const now = Date.now();
    if (heroesCache && now - heroesCache.ts < HEROES_CACHE_TTL) {
      return NextResponse.json(heroesCache.data);
    }

    const heroes = await db.user.findMany({
      where: {
        role: "HERO",
        isActive: true,
        isApproved: true,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
      orderBy: { displayName: "asc" },
    });

    heroesCache = { data: heroes, ts: now };
    return NextResponse.json(heroes);
  } catch (error) {
    console.error("[heroes] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch heroes list." }, { status: 500 });
  }
}
