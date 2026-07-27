"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useUIMode, type UIMode } from "@/lib/uiMode";

type RouteMotion = { id: number; mode: UIMode };

const MOTION_DURATION = 220;

export default function AppMotionLayer() {
  const pathname = usePathname();
  const { mode, loaded } = useUIMode();
  const previousPath = useRef<string | null>(null);
  const [routeMotion, setRouteMotion] = useState<RouteMotion | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (previousPath.current === null) {
      previousPath.current = pathname;
      return;
    }
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;

    const next: RouteMotion = { id: Date.now(), mode };
    setRouteMotion(next);
    const timer = window.setTimeout(
      () => setRouteMotion((current) => current?.id === next.id ? null : current),
      MOTION_DURATION,
    );
    return () => window.clearTimeout(timer);
  }, [loaded, mode, pathname]);

  if (!routeMotion) return null;
  return <span key={routeMotion.id} className="app-route-cue" data-mode-cue={routeMotion.mode} aria-hidden="true"><span /></span>;
}
