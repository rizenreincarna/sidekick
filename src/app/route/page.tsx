import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import RoutePlannerClient from "@/components/route-planner-client";

// Server component — guards auth, renders the client planner which
// dynamically imports the Three.js 3D map with ssr: false.
export default async function RoutePage() {
  const user = await requireAuth();
  if (!user) redirect("/");

  return <RoutePlannerClient />;
}