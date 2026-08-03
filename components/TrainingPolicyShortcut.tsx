"use client";

import Link from "next/link";
import { localeText, useI18n } from "@/lib/i18n";

export default function TrainingPolicyShortcut({ className = "" }: { className?: string }) {
  const { locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const label = t("打开动态训练计划", "Open adaptive training plan", "適応トレーニングプランを開く");

  return (
    <Link
      href="/training-policy"
      title={label}
      aria-label={label}
      data-training-policy-shortcut
      className={`page-icon-button press text-accent ${className}`.trim()}
    >
      <PlanIcon />
    </Link>
  );
}

function PlanIcon() {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M5 7H19M5 12H15M5 17H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M17 14V20M14 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
