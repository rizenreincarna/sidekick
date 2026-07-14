import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const conversation = await db.aiConversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        actions: { where: { status: "PENDING" } },
      },
    });

    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (conversation.userId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("[ai/conversations/[id]] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch conversation." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const conversation = await db.aiConversation.findUnique({ where: { id } });
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (conversation.userId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.aiConversation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ai/conversations/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete conversation." }, { status: 500 });
  }
}
