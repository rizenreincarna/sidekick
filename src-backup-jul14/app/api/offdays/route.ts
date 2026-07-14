import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/offdays - List off days for current user
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const offDays = await db.offDay.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(offDays);
  } catch (error) {
    console.error("[offdays] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch off days." }, { status: 500 });
  }
}

// POST /api/offdays - Add an off day
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { date, reason } = await request.json();
    if (!date) return NextResponse.json({ error: "Date is required" }, { status: 400 });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Date must be in YYYY-MM-DD format" }, { status: 400 });
    }

    if (reason && String(reason).length > 200) {
      return NextResponse.json({ error: "Reason must be 200 characters or less" }, { status: 400 });
    }

    const offDay = await db.offDay.create({
      data: { date, reason: reason || null, userId: user.id },
    });
    return NextResponse.json(offDay, { status: 201 });
  } catch {
    return NextResponse.json({ error: "An off day already exists for this date." }, { status: 409 });
  }
}
