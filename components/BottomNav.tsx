"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pulseFeedback } from "@/lib/feedback";

const TABS = [
  {
    href: "/",
    label: "今天",
    icon: TodayIcon,
    match: (path: string) =>
      path === "/" ||
      path.startsWith("/nutrition") ||
      path.startsWith("/cardio") ||
      path.startsWith("/settings"),
  },
  {
    href: "/train",
    label: "训练",
    icon: TrainingIcon,
    match: (path: string) =>
      path.startsWith("/train") ||
      path.startsWith("/schedule") ||
      path.startsWith("/templates"),
  },
  {
    href: "/progress",
    label: "进度",
    icon: ProgressIcon,
    match: (path: string) =>
      path.startsWith("/progress") ||
      path.startsWith("/data") ||
      path.startsWith("/history"),
  },
  {
    href: "/cut",
    label: "减脂",
    icon: CutIcon,
    match: (path: string) => path.startsWith("/cut"),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="app-nav fixed inset-x-0 bottom-0 z-20 border-t border-border/80 bg-surface/95 backdrop-blur-xl"
      aria-label="主导航"
    >
      <div className="mx-auto grid max-w-app grid-cols-4 gap-1 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              data-active={active}
              onClick={() => {
                if (!active) pulseFeedback("nav");
              }}
              className={
                "nav-item press relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pt-1 " +
                (active ? "text-accent" : "text-faint")
              }
            >
              <span
                className={
                  "nav-icon-shell grid h-7 w-10 place-items-center rounded-lg " +
                  (active ? "bg-accent-soft" : "bg-transparent")
                }
              >
                <Icon active={active} />
              </span>
              <span className="text-[11px] font-semibold leading-none">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function stroke(active: boolean) {
  return active ? "var(--accent)" : "currentColor";
}

function TodayIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4.5" width="16" height="16" rx="3.5" stroke={stroke(active)} strokeWidth="1.7" />
      <path d="M8 3V6M16 3V6M4 9H20" stroke={stroke(active)} strokeWidth="1.7" strokeLinecap="round" />
      {active && <path d="M9 14H15M12 11V17" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function TrainingIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M5 9H19M5 15H19" stroke={stroke(active)} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.5 11V13M20.5 11V13M7 7V17M17 7V17" stroke={stroke(active)} strokeWidth="1.7" strokeLinecap="round" />
      {active && <circle cx="12" cy="12" r="2" fill="var(--accent)" />}
    </svg>
  );
}

function ProgressIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 18.5H20" stroke={stroke(active)} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M6 15L10 10.5L13.5 13L18.5 6" stroke={stroke(active)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {active && <path d="M18.5 6V10.5H14" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function CutIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 4.5V19.5" stroke={stroke(active)} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 8.5H15.5M8.5 15.5H17" stroke={stroke(active)} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="8.5" r="2.7" stroke={stroke(active)} strokeWidth="1.7" />
      {active && <circle cx="17" cy="15.5" r="2" fill="var(--accent)" />}
    </svg>
  );
}
