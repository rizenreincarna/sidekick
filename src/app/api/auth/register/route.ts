import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const rlKey = clientKeyFromRequest(request);
    const rl = checkRateLimit("register", rlKey, 5, 15 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
    const body = await request.json();
    const { username, password, displayName } = body;

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

    // Rate limiting: limit total unapproved accounts to 10
    const unapprovedCount = await db.user.count({
      where: { isApproved: false },
    });
    if (unapprovedCount >= 10) {
      return NextResponse.json(
        { error: "Too many pending registration requests. Please try again later or contact an administrator." },
        { status: 429 }
      );
    }

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

    // Self-registration: HERO role, NOT approved yet (needs admin approval)
    const user = await db.user.create({
      data: {
        username,
        password: hashedPassword,
        displayName: displayName || username,
        role: "HERO",
        isActive: true,
        isApproved: false,
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
      data: holidays.map(h => ({ date: h.date, name: h.name, userId: user.id })),
    });

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isApproved: user.isApproved,
      message: "Account created! Waiting for admin approval before you can sign in.",
    }, { status: 201 });
  } catch (error) {
    console.error("[auth/register] POST error:", error);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
