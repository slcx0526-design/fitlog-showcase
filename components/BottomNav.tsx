"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pulseFeedback } from "@/lib/feedback";
import { useI18n } from "@/lib/i18n";

const TABS = [
  { href: "/", label: "今天", icon: TodayIcon, match: (path: string) => path === "/" || path.startsWith("/nutrition") || path.startsWith("/cardio") },
  { href: "/train", label: "训练", icon: TrainingIcon, match: (path: string) => path.startsWith("/train") || path.startsWith("/schedule") || path.startsWith("/templates") },
  { href: "/progress", label: "进度", icon: ProgressIcon, match: (path: string) => path.startsWith("/progress") || path.startsWith("/data") || path.startsWith("/history") },
  { href: "/cut", label: "减脂", icon: CutIcon, match: (path: string) => path.startsWith("/cut") },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { tr } = useI18n();
  return <nav className="app-nav fixed inset-x-0 bottom-0 z-20 border-t border-border/80 bg-surface/95 backdrop-blur-xl" aria-label={tr("主导航")}>
    <div className="mx-auto grid max-w-app grid-cols-4 gap-1 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5">
      {TABS.map((tab) => {
        const active = tab.match(pathname); const Icon = tab.icon;
        return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} data-active={active} onClick={() => { if (!active) pulseFeedback("nav"); }} className={`nav-item press relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pt-1 ${active ? "text-accent" : "text-faint"}`}>
          <span className={`nav-icon-shell grid h-7 w-10 place-items-center rounded-lg ${active ? "bg-accent-soft" : "bg-transparent"}`}><Icon active={active} /></span>
          <span className="text-[11px] font-semibold leading-none">{tr(tab.label)}</span>
        </Link>;
      })}
    </div>
  </nav>;
}

function color(active: boolean) { return active ? "var(--accent)" : "currentColor"; }
function TodayIcon({ active }: { active: boolean }) { const c = color(active); return <svg className="nav-glyph" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 4.5H17L20 7.5V19H5Z" stroke={c} strokeWidth="1.85" strokeLinejoin="round" /><path d="M8 3V6M16 3V6M5 9H20" stroke={c} strokeWidth="1.85" strokeLinecap="square" />{active && <path d="M8 12H13L11.2 14.8H16.7L12.5 19L13.4 16H8.4Z" fill="var(--accent)" />}</svg>; }
function TrainingIcon({ active }: { active: boolean }) { const c = color(active); return <svg className="nav-glyph" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6.5 8.5V15.5M17.5 8.5V15.5M3.7 10V14M20.3 10V14M6.5 10.5H17.5V13.5H6.5Z" stroke={c} strokeWidth="1.85" strokeLinejoin="round" />{active && <path d="M4.4 9H6.4V15H4.4ZM17.6 9H19.6V15H17.6Z" fill="var(--accent)" />}</svg>; }
function ProgressIcon({ active }: { active: boolean }) { const c = color(active); return <svg className="nav-glyph" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 18.5H20" stroke={c} strokeWidth="1.85" /><path d="M5.5 15.8L10 11.3L13 13.2L18.5 6.4" stroke={c} strokeWidth="1.95" strokeLinecap="square" /><path d="M14.7 6.4H18.5V10.2" stroke={c} strokeWidth="1.85" strokeLinecap="square" />{active && <path d="M6.1 17L10.2 12.9L13.1 14.8L18.5 8.1V11L13.5 16.4L10.5 14.5L7.1 18Z" fill="var(--accent)" opacity=".38" />}</svg>; }
function CutIcon({ active }: { active: boolean }) { const c = color(active); return <svg className="nav-glyph" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3.8V20.2M6.2 8.6H15.8M8.7 15.5H18" stroke={c} strokeWidth="1.85" strokeLinecap="square" /><path d="M12 5.4L14.8 8.5L12 11.6L9.2 8.5Z" stroke={c} strokeWidth="1.65" strokeLinejoin="round" />{active && <path d="M17 13.8L19.8 15.5L17 17.2L14.2 15.5Z" fill="var(--accent)" />}</svg>; }