"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { localeText, useI18n } from "@/lib/i18n";
import { useToday } from "@/lib/hooks";
import { formatDisplay, validPastOrToday } from "@/lib/date";
import SimpleNutritionLog from "@/components/SimpleNutritionLog";

export default function NutritionPage() {
  return <Suspense fallback={<Skeleton />}><NutritionInner /></Suspense>;
}

function Skeleton() {
  return <div className="pt-2"><div className="h-7 w-32 rounded bg-surface-2" /><div className="mt-4 h-44 rounded-lg bg-surface-2" /></div>;
}

function NutritionInner() {
  const { tr, locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const { loaded } = useStore();
  const params = useSearchParams();
  const today = useToday();
  const paramDate = validPastOrToday(params?.get("date") ?? null);
  const date = paramDate ?? today;
  const isPast = !!paramDate && paramDate !== today;
  if (!loaded) return <Skeleton />;

  return (
    <div>
      <header className="mb-5">
        <Link href={isPast ? "/progress?tab=log" : "/"} className="page-back-link press mb-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{tr(isPast ? "日志" : "今天")}</Link>
        <div className="page-heading"><div><p className="page-heading__eyebrow">{t("饮食记录", "Nutrition log", "食事記録")}</p><h1>{isPast ? tr("补记饮食") : tr("饮食")}</h1><p className="page-heading__meta">{formatDisplay(date, locale)} · {t("先记总热量，宏量按需展开", "Log total calories first; expand macros when needed", "まず総カロリーを記録し、必要な時だけマクロを開く")}</p></div></div>
      </header>
      <SimpleNutritionLog date={date} />
    </div>
  );
}
