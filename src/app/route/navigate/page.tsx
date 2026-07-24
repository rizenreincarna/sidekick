import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import NavigationClient from "@/components/navigation-client";
import { Loader2 } from "lucide-react";

// In-app turn-by-turn navigation (MapLibre + OSRM + OSM — no Google Maps).
// Server component guards auth; the client component runs the whole driver mode.
export default async function RouteNavigatePage() {
  const user = await requireAuth();
  if (!user) redirect("/");

  return (
    <Suspense
      fallback={
        <div className="flex h-dvh w-full items-center justify-center bg-background text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading navigation…
        </div>
      }
    >
      <NavigationClient />
    </Suspense>
  );
}
