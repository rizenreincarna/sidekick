import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const conversations = await db.aiConversation.findMany({
      where: { userId: user.id, isArchived: false },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return NextResponse.json(conversations.map(c => ({
      id: c.id,
      title: c.title,
      messageCount: c._count.messages,
      lastMessage: c.messages[0]?.content?.slice(0, 100) || "",
      lastMessageAt: c.updatedAt,
      createdAt: c.createdAt,
    })));
  } catch (error) {
    console.error("[ai/conversations] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch conversations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { title } = await request.json() as { title?: string };
    const conversation = await db.aiConversation.create({
      data: { userId: user.id, title: title || "New Chat" },
    });
    return NextResponse.json(conversation);
  } catch (error) {
    console.error("[ai/conversations] POST error:", error);
    return NextResponse.json({ error: "Failed to create conversation." }, { status: 500 });
  }
}
