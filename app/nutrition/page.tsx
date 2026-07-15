"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
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
  const { loaded } = useStore();
  const params = useSearchParams();
  const today = useToday();
  const paramDate = validPastOrToday(params?.get("date") ?? null);
  const date = paramDate ?? today;
  const isPast = !!paramDate && paramDate !== today;
  if (!loaded) return <Skeleton />;

  return (
    <div>
      <header className="mb-4">
        <Link href={isPast ? "/progress?tab=log" : "/"} className="press mb-1 flex items-center gap-1 text-[13px] font-medium text-muted"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{tr(isPast ? "日志" : "今天")}</Link>
        <div className="control-card p-3.5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">NUTRITION</p><h1 className="mt-1 text-[24px] font-bold tracking-tight text-fg">{isPast ? tr("补记饮食") : tr("饮食")}</h1><p className="mt-1 text-[12px] text-muted">{formatDisplay(date, locale)} · 先记总热量，宏量只在需要时展开。</p></div>
      </header>
      <SimpleNutritionLog date={date} />
    </div>
  );
}
