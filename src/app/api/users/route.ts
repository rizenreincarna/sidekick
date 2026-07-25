import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";

// GET /api/users - List all users (Admin only)
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Access denied. Admin privileges required." }, { status: 403 });

  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        isApproved: true,
        createdAt: true,
        _count: {
          select: {
            orders: true,
            sosRequests: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("[users] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch users." }, { status: 500 });
  }
}

// POST /api/users - Create a new user (Admin only)
export async function POST(request: NextRequest) {
  const currentUser = await requireAuth();
  if (!currentUser) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Access denied. Admin privileges required." }, { status: 403 });

  try {
    const body = await request.json();
    const { username, password, displayName, role } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters" },
        { status: 400 }
      );
    }

    if (username.length > 30) {
      return NextResponse.json(
        { error: "Username must be 30 characters or less" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 12) {
      return NextResponse.json(
        { error: "Password must be at least 12 characters" },
        { status: 400 }
      );
    }

    if (password.length > 100) {
      return NextResponse.json(
        { error: "Password must be 100 characters or less" },
        { status: 400 }
      );
    }

    if (displayName && String(displayName).length > 100) {
      return NextResponse.json(
        { error: "Display name must be 100 characters or less" },
        { status: 400 }
      );
    }

    const validRoles = ["ADMIN", "HERO", "SUPPORT"];
    const userRole = role && validRoles.includes(role) ? role : "HERO";

    // Check if username already exists
    const existing = await db.user.findUnique({
      where: { username },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Username already taken. Please choose a different username." },
        { status: 409 }
      );
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.user.create({
      data: {
        username,
        password: hashedPassword,
        displayName: displayName || username,
        role: userRole,
        isActive: true,
        isApproved: true,
      },
    });

    // Seed default Malaysian holidays for new user
    const holidays = [
      { date: "2025-01-01", name: "New Year's Day" },
      { date: "2025-01-29", name: "Thaipusam" },
      { date: "2025-01-31", name: "Chinese New Year" },
      { date: "2025-02-01", name: "Chinese New Year (2nd day)" },
      { date: "2025-03-31", name: "Hari Raya Aidilfitri" },
      { date: "2025-04-01", name: "Hari Raya Aidilfitri (2nd day)" },
      { date: "2025-05-01", name: "Labour Day" },
      { date: "2025-05-12", name: "Vesak Day" },
      { date: "2025-06-02", name: "Yang di-Pertuan Agong Birthday" },
      { date: "2025-08-31", name: "National Day" },
      { date: "2025-09-16", name: "Malaysia Day" },
      { date: "2025-10-20", name: "Deepavali" },
      { date: "2025-12-25", name: "Christmas" },
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-02-17", name: "Chinese New Year" },
      { date: "2026-03-20", name: "Hari Raya Aidilfitri" },
      { date: "2026-05-01", name: "Labour Day" },
      { date: "2026-05-26", name: "Hari Raya Haja" },
      { date: "2026-06-01", name: "Yang di-Pertuan Agong Birthday" },
      { date: "2026-08-31", name: "National Day" },
      { date: "2026-09-16", name: "Malaysia Day" },
      { date: "2026-11-08", name: "Deepavali" },
      { date: "2026-12-25", name: "Christmas" },
    ];

    await db.holiday.createMany({
      data: holidays.map(h => ({ date: h.date, name: h.name, userId: newUser.id })),
    });

    // Audit log
    await logAudit({
      userId: currentUser.id,
      action: "CREATE",
      entity: "User",
      entityId: newUser.id,
      details: JSON.stringify({ username: newUser.username, role: newUser.role }),
    });

    return NextResponse.json({
      id: newUser.id,
      username: newUser.username,
      displayName: newUser.displayName,
      role: newUser.role,
      isActive: newUser.isActive,
      isApproved: newUser.isApproved,
    }, { status: 201 });
  } catch (error) {
    console.error("[users] POST error:", error);
    return NextResponse.json({ error: "Failed to create user. Please try again." }, { status: 500 });
  }
}
