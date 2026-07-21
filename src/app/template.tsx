"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * template.tsx wraps every route segment and re-mounts on navigation
 * (unlike layout.tsx, which persists). We use it to animate route
 * transitions: a short fade-up entrance keyed on the pathname so each
 * page arrival gets a calm, state-conveying motion instead of an
 * instant cut. Reduced-motion users get the content immediately
 * (the CSS guard in globals.css neutralizes the animation).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, [pathname]);

  // On first paint we don't want a flash; render immediately once mounted.
  if (!mounted) return <>{children}</>;

  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}