"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useUIMode } from "@/lib/uiMode";
import { useToday } from "@/lib/hooks";
import { formatDisplay, validPastOrToday } from "@/lib/date";
import { getScheduledType, todayWeekdayIndex } from "@/lib/schedule";
import { usePersona } from "@/lib/copy";
import { useI18n } from "@/lib/i18n";
import type { TrainingType } from "@/lib/types";
import TrainingModule from "@/components/TrainingModule";

const START_TYPES: TrainingType[] = ["push", "pull", "legs", "rest", "custom"];

export default function TrainPage() { return <Suspense fallback={<Skeleton />}><TrainInner /></Suspense>; }
function Skeleton() { return <div className="space-y-3"><div className="h-12 rounded-2xl bg-surface-2" /><div className="h-52 rounded-2xl bg-surface-2" /></div>; }

function TrainInner() {
  const { tr, locale } = useI18n();
  const { persona, typeName } = usePersona();
  const { loaded, data, getDay, setWorkoutType, applyTemplate } = useStore();
  const { mode } = useUIMode();
  const params = useSearchParams();
  const today = useToday();
  const paramDate = validPastOrToday(params?.get("date") ?? null);
  const date = paramDate ?? today;
  const isPast = !!paramDate && paramDate !== today;
  const workout = getDay(date)?.workout;
  const setCount = workout?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) ?? 0;
  const done = workout?.done ?? false;
  const isActive = !!workout?.type && workout.type !== "rest" && setCount > 0 && !done;
  const scheduled = getScheduledType(data.schedule, todayWeekdayIndex());
  const requested = params.get("start");
  const requestedType = !isPast && requested && START_TYPES.includes(requested as TrainingType) ? requested as TrainingType : null;
  const requestedTemplate = !isPast ? params.get("template") : null;

  // A plan never creates a workout by itself. This only fires after an explicit CTA containing ?start=type.
  useEffect(() => {
    if (!loaded || isPast || workout || !requestedType) return;
    const tpl = requestedTemplate ? data.templates?.find((item) => item.id === requestedTemplate && item.type === requestedType) : null;
    if (tpl) {
      applyTemplate(tpl.id, date);
      return;
    }
    setWorkoutType(date, requestedType);
  }, [applyTemplate, data.templates, loaded, isPast, workout, requestedTemplate, requestedType, date, setWorkoutType]);

  if (!loaded) return <Skeleton />;
  const headerType = workout?.type ?? (isPast ? null : scheduled);
  return <div>
    <header className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <Link href={isPast ? "/progress?tab=log" : "/"} className="press flex items-center gap-1 text-[13px] font-semibold text-muted"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{isPast ? tr("日志") : tr("今天")}</Link>
        <div className="flex items-center gap-2">
          <Link href="/schedule" className="press rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-muted">计划</Link>
          <Link href="/templates" className="press rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-muted">模板</Link>
        </div>
      </div>
      <div className="control-card p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{isPast ? "PAST SESSION" : "TRAINING"}</p>
        <div className="mt-1 flex items-end justify-between gap-3"><div><h1 className="text-[25px] font-bold tracking-tight text-fg">{isPast ? tr("补记训练") : headerType ? typeName[headerType](mode) : tr("训练")}</h1><p className="tnum mt-1 text-[11px] text-faint">{formatDisplay(date, locale)}</p></div>{done ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">已完成</span> : isActive ? <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent"><span className="active-dot h-1.5 w-1.5 rounded-full bg-accent" />进行中</span> : null}</div>
        {!workout && !isPast && scheduled && <p className="mt-3 border-t border-border/70 pt-2.5 text-[11px] text-muted">今日建议：{typeName[scheduled](mode)}。计划不会自动写入训练日志。</p>}
      </div>
    </header>
    <TrainingModule date={date} suggestedType={isPast ? null : scheduled} />
  </div>;
}
