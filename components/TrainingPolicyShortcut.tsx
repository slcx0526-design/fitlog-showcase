"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { localeText, useI18n } from "@/lib/i18n";

const VISIBLE_ROUTES = ["/schedule", "/templates", "/train"];

export default function TrainingPolicyShortcut() {
  const pathname = usePathname();
  const { locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  if (pathname === "/training-policy" || pathname === "/adaptive-outcomes") return null;
  if (!VISIBLE_ROUTES.some((route) => pathname.startsWith(route))) return null;
  const label = t("打开动态训练计划", "Open adaptive training plan", "適応トレーニングプランを開く");

  return (
    <Link
      href="/training-policy"
      title={label}
      aria-label={label}
      data-training-policy-shortcut
      className="page-icon-button press fixed right-4 z-[18] border border-border bg-surface/95 text-accent shadow-md backdrop-blur-xl"
      style={{ bottom: "calc(4.85rem + env(safe-area-inset-bottom))" }}
    >
      <PlanIcon />
    </Link>
  );
}

function PlanIcon() {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M5 7H19M5 12H15M5 17H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M17 14V20M14 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
