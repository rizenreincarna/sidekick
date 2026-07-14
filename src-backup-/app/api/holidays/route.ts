import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/holidays - List holidays for current user
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const holidays = await db.holiday.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(holidays);
  } catch (error) {
    console.error("[holidays] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch holidays." }, { status: 500 });
  }
}

// POST /api/holidays - Add a holiday for current user
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const body = await request.json();
    const { date, name } = body;

    if (!date || !name) {
      return NextResponse.json({ error: "Missing required fields: date, name" }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Date must be in YYYY-MM-DD format" }, { status: 400 });
    }

    if (String(name).length > 100) {
      return NextResponse.json({ error: "Holiday name must be 100 characters or less" }, { status: 400 });
    }

    const holiday = await db.holiday.create({
      data: { date, name, userId: user.id },
    });
    return NextResponse.json(holiday, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "A holiday already exists for this date. Please delete it first if you want to change it." },
      { status: 409 }
    );
  }
}
