"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarDays, ChartNoAxesCombined, Dumbbell, type LucideIcon } from "lucide-react";
import { pulseFeedback } from "@/lib/feedback";
import { useI18n } from "@/lib/i18n";

const TABS: Array<{ href: string; label: string; icon: LucideIcon; match: (path: string) => boolean }> = [
  { href: "/", label: "今天", icon: CalendarDays, match: (path) => path === "/" || path.startsWith("/nutrition") || path.startsWith("/cardio") },
  { href: "/train", label: "训练", icon: Dumbbell, match: (path) => path.startsWith("/train") || path.startsWith("/schedule") || path.startsWith("/templates") || path.startsWith("/training-policy") || path.startsWith("/adaptive-outcomes") },
  { href: "/progress", label: "进度", icon: ChartNoAxesCombined, match: (path) => path.startsWith("/progress") || path.startsWith("/data") || path.startsWith("/history") },
  { href: "/cut", label: "减脂", icon: Activity, match: (path) => path.startsWith("/cut") },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { tr } = useI18n();
  return <nav className="app-nav fixed inset-x-0 bottom-0 z-20 mx-auto border-t border-border/80 bg-surface/95 backdrop-blur-xl" aria-label={tr("主导航")}>
    <div className="mx-auto grid max-w-app grid-cols-4 gap-1 px-3 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1">
      {TABS.map((tab) => {
        const active = tab.match(pathname); const Icon = tab.icon;
        return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} data-active={active} onClick={() => { if (!active) pulseFeedback("nav"); }} className={`nav-item press relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md px-1 pt-1 ${active ? "text-accent" : "text-faint"}`}>
          <span className="nav-icon-shell h-7 w-8"><Icon className="nav-glyph" aria-hidden="true" size={21} strokeWidth={active ? 2.25 : 1.8} /></span>
          <span className="text-[11px] font-semibold leading-none">{tr(tab.label)}</span>
        </Link>;
      })}
    </div>
  </nav>;
}
