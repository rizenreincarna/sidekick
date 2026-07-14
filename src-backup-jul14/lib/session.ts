import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { db } from "./db";
import { Role } from "@prisma/client";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, displayName: true, role: true, isActive: true, isApproved: true },
  });
  
  // Block inactive or unapproved users
  if (user && (!user.isActive || !user.isApproved)) return null;
  
  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) return null;
  return user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireAuth();
  if (!user) return { user: null, error: "Unauthorized" as const };
  if (!roles.includes(user.role)) return { user: null, error: "Forbidden" as const };
  return { user, error: null };
}

export async function requireAdmin() {
  return requireRole("ADMIN");
}
