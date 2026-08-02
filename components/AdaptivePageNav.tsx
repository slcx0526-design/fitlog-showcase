"use client";

import Link from "next/link";
import { localeText, useI18n } from "@/lib/i18n";

export default function AdaptivePageNav({ active }: { active: "policy" | "outcomes" }) {
  const { locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  return (
    <nav className="adaptive-page-nav" aria-label={t("训练计划视图", "Training plan views", "トレーニングプラン表示")}>
      <Link href="/schedule" className="press">{t("微周期", "Microcycle", "微周期")}</Link>
      <Link href="/training-policy" className="press" aria-current={active === "policy" ? "page" : undefined}>{t("动态计划", "Adaptive plan", "適応プラン")}</Link>
      <Link href="/adaptive-outcomes" className="press" aria-current={active === "outcomes" ? "page" : undefined}>{t("训练反应", "Response", "反応")}</Link>
    </nav>
  );
}
