"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useUIMode } from "@/lib/uiMode";
import { workingSets } from "@/lib/prescription";

function two(value: number) {
  return String(value).padStart(2, "0");
}

function routeLabel(pathname: string) {
  if (pathname.startsWith("/train")) return "TRAINING PERIOD";
  if (pathname.startsWith("/nutrition")) return "FUEL PERIOD";
  if (pathname.startsWith("/cut")) return "CONDITION CHECK";
  if (pathname.startsWith("/progress") || pathname.startsWith("/data") || pathname.startsWith("/history")) return "MEMORY ROOM";
  if (pathname.startsWith("/cardio")) return "MOTION PERIOD";
  if (pathname.startsWith("/settings")) return "SETTINGS";
  return "DAILY SCHEDULE";
}

function phaseFor(hour: number) {
  if (hour < 5) return { label: "DEEP NIGHT", glyph: "●" };
  if (hour < 9) return { label: "FIRST LIGHT", glyph: "◐" };
  if (hour < 17) return { label: "DAYTIME", glyph: "○" };
  if (hour < 21) return { label: "EVENING", glyph: "◑" };
  return { label: "MOON HOUR", glyph: "●" };
}

/**
 * A moonlit daily status layer: current hour, route, and today's logged state.
 * It uses existing FitLog data only and adds no fictional progression system.
 */
export default function MidnightAmbientStatus() {
  const pathname = usePathname();
  const today = useToday();
  const { mode } = useUIMode();
  const { data } = useStore();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const summary = useMemo(() => {
    const day = data.days[today];
    const trained = !!day?.workout?.done || (day?.workout?.exercises.some((exercise) => workingSets(exercise.sets).length > 0) ?? false);
    const ate = (day?.nutrition?.calories ?? 0) > 0;
    const moved = (day?.cardio ?? []).length > 0;
    return `${trained ? "TRAINING LOGGED" : "TRAINING OPEN"} · ${ate ? "FUEL LOGGED" : "FUEL OPEN"} · ${moved ? "MOVE LOGGED" : "REST WINDOW"}`;
  }, [data.days, today]);

  if (mode !== "midnight" || pathname.startsWith("/settings") || pathname.startsWith("/train")) return null;
  const phase = phaseFor(clock.getHours());
  const time = `${two(clock.getHours())}:${two(clock.getMinutes())}`;

  return (
    <section className="midnight-ambient-status" aria-label="午夜模式状态">
      <div className="midnight-ambient-status__moon" aria-hidden="true">{phase.glyph}</div>
      <div className="min-w-0">
        <p className="midnight-ambient-status__eyebrow">{phase.label} // {routeLabel(pathname)}</p>
        <p className="truncate midnight-ambient-status__summary">{summary}</p>
      </div>
      <div className="midnight-ambient-status__time tnum">{time}</div>
    </section>
  );
}
