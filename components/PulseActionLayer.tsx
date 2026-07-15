"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Impact = { id: number; x: number; y: number; label: string };

const ROUTE: Record<string, string> = {
  train: "LOCK THE SESSION",
  nutrition: "LOG THE FUEL",
  cut: "CONTROL THE PACE",
  progress: "CHECK THE PROOF",
  cardio: "KEEP THE MOTION",
  settings: "SET THE TERMS",
  home: "OWN THE DAY",
};

function routeKey(pathname: string) {
  if (pathname.startsWith("/train")) return "train";
  if (pathname.startsWith("/nutrition")) return "nutrition";
  if (pathname.startsWith("/cut")) return "cut";
  if (pathname.startsWith("/progress") || pathname.startsWith("/data") || pathname.startsWith("/history")) return "progress";
  if (pathname.startsWith("/cardio")) return "cardio";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}

function impactLabel(target: HTMLElement) {
  const label = target.closest<HTMLElement>("button,a,[role='button']")?.textContent ?? "";
  if (/结束训练|完成|保存|确认|finish/i.test(label)) return "SECURED";
  if (/开始|训练|记录|套用|继续|start/i.test(label)) return "EXECUTE";
  if (/删除|移除|clear/i.test(label)) return "CLEAR";
  return "MARK";
}

/** Pulse uses brief poster cuts and action tags, never a bright full-page flash. */
export default function PulseActionLayer() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const impactTimer = useRef<number | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [routeTick, setRouteTick] = useState(0);

  useEffect(() => {
    if (document.documentElement.dataset.mode !== "pulse") { previous.current = pathname; return; }
    if (previous.current !== pathname) { previous.current = pathname; setRouteTick((value) => value + 1); }
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (document.documentElement.dataset.mode !== "pulse") return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const control = target.closest<HTMLElement>("button,a,[role='button']");
      if (!control || control.matches("[disabled],[aria-disabled='true']") || control.closest("[data-no-pulse-impact]")) return;
      const next = { id: Date.now(), x: event.clientX, y: event.clientY, label: impactLabel(target) };
      setImpact(next);
      if (impactTimer.current != null) window.clearTimeout(impactTimer.current);
      impactTimer.current = window.setTimeout(() => setImpact((current) => current?.id === next.id ? null : current), 260);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (impactTimer.current != null) window.clearTimeout(impactTimer.current);
    };
  }, []);

  return <>
    {impact && <span key={impact.id} className="pulse-impact" aria-hidden="true" style={{ left: impact.x, top: impact.y }}><span>{impact.label}</span></span>}
    {routeTick > 0 && <div key={`${pathname}-${routeTick}`} className="pulse-route-wipe" aria-hidden="true"><span className="pulse-route-wipe__shadow" /><span className="pulse-route-wipe__paper" /><span className="pulse-route-wipe__red" /><span className="pulse-route-wipe__label">{ROUTE[routeKey(pathname)]}</span></div>}
  </>;
}
