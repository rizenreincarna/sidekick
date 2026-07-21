import { TrackingClient } from "./tracking-client";

// Server component — renders the public tracking page (no auth required)
export default async function TrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TrackingClient token={token} />;
}