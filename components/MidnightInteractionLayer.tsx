"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Ripple = { id: number; x: number; y: number };

const ROUTE: Record<string, string> = {
  train: "MIDNIGHT SESSION",
  progress: "LONG VIEW ARCHIVE",
  cut: "TIME WINDOW",
  nutrition: "NIGHT FUEL LOG",
  cardio: "QUIET MOTION",
  settings: "PERSONAL ROOM",
  home: "DAILY SCHEDULE",
};

function routeKey(pathname: string) {
  if (pathname.startsWith("/train")) return "train";
  if (pathname.startsWith("/progress") || pathname.startsWith("/data") || pathname.startsWith("/history")) return "progress";
  if (pathname.startsWith("/cut")) return "cut";
  if (pathname.startsWith("/nutrition")) return "nutrition";
  if (pathname.startsWith("/cardio")) return "cardio";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

/** Midnight uses low-light reflections and a single time-line pass. */
export default function MidnightInteractionLayer() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const rippleTimer = useRef<number | null>(null);
  const [ripple, setRipple] = useState<Ripple | null>(null);
  const [routeTick, setRouteTick] = useState(0);

  useEffect(() => {
    if (document.documentElement.dataset.mode !== "midnight") { previous.current = pathname; return; }
    if (previous.current !== pathname) { previous.current = pathname; setRouteTick((value) => value + 1); }
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (document.documentElement.dataset.mode !== "midnight") return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const control = target.closest<HTMLElement>("button,a,[role='button']");
      if (!control || control.matches("[disabled],[aria-disabled='true']") || control.closest("[data-no-midnight]")) return;
      const next = { id: Date.now(), x: event.clientX, y: event.clientY };
      setRipple(next);
      if (rippleTimer.current != null) window.clearTimeout(rippleTimer.current);
      rippleTimer.current = window.setTimeout(() => setRipple((current) => current?.id === next.id ? null : current), 380);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (rippleTimer.current != null) window.clearTimeout(rippleTimer.current);
    };
  }, []);

  return <>
    {ripple && <span key={ripple.id} className="midnight-tap-ripple" aria-hidden="true" style={{ left: ripple.x, top: ripple.y }} />}
    {routeTick > 0 && <div key={`${pathname}-${routeTick}`} className="midnight-route-scan" aria-hidden="true"><span className="midnight-route-scan__line" /><span className="midnight-route-scan__label">{ROUTE[routeKey(pathname)]}</span></div>}
  </>;
}
