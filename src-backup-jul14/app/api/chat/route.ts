import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// GET /api/chat - Get recent chat messages (last 200, not deleted). Supports ?after=<id> for polling.
export async function GET(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const afterId = searchParams.get("after");

    const where: Record<string, unknown> = { isDeleted: false };

    // If afterId is specified, only get messages after that ID
    // We use createdAt > the createdAt of the afterId message
    if (afterId) {
      const afterMessage = await db.chatMessage.findUnique({
        where: { id: afterId },
        select: { createdAt: true },
      });
      if (afterMessage) {
        where.createdAt = { gt: afterMessage.createdAt };
      }
    }

    const messages = await db.chatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
    });

    // Return in chronological order (oldest first)
    return NextResponse.json(messages.reverse());
  } catch (error) {
    console.error("[chat] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch chat messages." }, { status: 500 });
  }
}

// POST /api/chat - Send a message. Parse @username mentions. Create notifications for mentioned users.
export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: "Message must be 2000 characters or less" }, { status: 400 });
    }

    // Parse @username mentions from message text
    const mentionRegex = /@(\w+)/g;
    const mentionedUsernames: string[] = [];
    let match;
    while ((match = mentionRegex.exec(message)) !== null) {
      mentionedUsernames.push(match[1]);
    }

    // Find user IDs for mentioned usernames
    const mentionedUsers = mentionedUsernames.length > 0
      ? await db.user.findMany({
          where: {
            username: { in: [...new Set(mentionedUsernames)] },
            isActive: true,
            isApproved: true,
          },
          select: { id: true, username: true },
        })
      : [];

    const mentionedUserIds = mentionedUsers.map(u => u.id);

    const chatMessage = await db.chatMessage.create({
      data: {
        userId: user.id,
        message: message.trim(),
        mentions: JSON.stringify(mentionedUserIds),
      },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
    });

    // Create notifications for mentioned users
    for (const mentionedUser of mentionedUsers) {
      await db.notification.create({
        data: {
          userId: mentionedUser.id,
          type: "normal",
          title: "You were mentioned in chat",
          message: `${user.displayName || user.username} mentioned you: "${message.trim().substring(0, 100)}${message.trim().length > 100 ? "..." : ""}"`,
        },
      }).catch(() => {
        // Silently fail notification creation
      });
    }

    return NextResponse.json(chatMessage, { status: 201 });
  } catch (error) {
    console.error("[chat] POST error:", error);
    return NextResponse.json({ error: "Failed to send message. Please try again." }, { status: 500 });
  }
}

// DELETE /api/chat - Admin only. Soft-delete messages. Body: { messageIds: string[] }
export async function DELETE(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Access denied. Admin privileges required." }, { status: 403 });

  try {
    const body = await request.json();
    const { messageIds } = body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: "messageIds array is required" }, { status: 400 });
    }

    if (messageIds.length > 100) {
      return NextResponse.json({ error: "Cannot delete more than 100 messages at once" }, { status: 400 });
    }

    await db.chatMessage.updateMany({
      where: { id: { in: messageIds } },
      data: { isDeleted: true, deletedBy: user.id },
    });

    return NextResponse.json({ success: true, deletedCount: messageIds.length });
  } catch (error) {
    console.error("[chat] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete messages." }, { status: 500 });
  }
}
