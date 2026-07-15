"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type FieldMark = { id: number; x: number; y: number; text: string };

const ROUTE: Record<string, string> = {
  train: "FIELD NOTE // TRAINING ROUTE",
  nutrition: "FIELD NOTE // RATIONS",
  cut: "FIELD NOTE // CONDITION",
  progress: "FIELD NOTE // MAP ARCHIVE",
  cardio: "FIELD NOTE // DISTANCE",
  settings: "FIELD NOTE // PACK CHECK",
  home: "FIELD NOTE // DAY LOG",
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

function stampFor(target: HTMLElement) {
  const label = target.closest<HTMLElement>("button,a,[role='button']")?.textContent ?? "";
  if (/保存|完成|结束训练|confirm|finish/i.test(label)) return "LOGGED";
  if (/开始|训练|记录|套用|继续|start/i.test(label)) return "ROUTE SET";
  if (/删除|移除|clear/i.test(label)) return "CROSSED OUT";
  return null;
}

/** Field feedback appears on meaningful logging actions, like a quick notebook stamp. */
export default function SurvivalInteractionLayer() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const markTimer = useRef<number | null>(null);
  const [mark, setMark] = useState<FieldMark | null>(null);
  const [routeTick, setRouteTick] = useState(0);

  useEffect(() => {
    if (document.documentElement.dataset.mode !== "survival") { previous.current = pathname; return; }
    if (previous.current !== pathname) { previous.current = pathname; setRouteTick((value) => value + 1); }
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (document.documentElement.dataset.mode !== "survival") return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const control = target.closest<HTMLElement>("button,a,[role='button']");
      if (!control || control.matches("[disabled],[aria-disabled='true']") || control.closest("[data-no-survival-mark]")) return;
      const text = stampFor(target);
      if (!text) return;
      const next = { id: Date.now(), x: event.clientX, y: event.clientY, text };
      setMark(next);
      if (markTimer.current != null) window.clearTimeout(markTimer.current);
      markTimer.current = window.setTimeout(() => setMark((current) => current?.id === next.id ? null : current), 360);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (markTimer.current != null) window.clearTimeout(markTimer.current);
    };
  }, []);

  return <>
    {mark && <span key={mark.id} className="survival-field-mark" aria-hidden="true" style={{ left: mark.x, top: mark.y }}>{mark.text}</span>}
    {routeTick > 0 && <div key={`${pathname}-${routeTick}`} className="survival-route-note" aria-hidden="true"><span>{ROUTE[routeKey(pathname)]}</span></div>}
  </>;
}
