"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useUIMode } from "@/lib/uiMode";
import { useToday } from "@/lib/hooks";
import { formatDisplay, validPastOrToday } from "@/lib/date";
import { dateKeyWeekdayIndex, getScheduledType } from "@/lib/schedule";
import { usePersona } from "@/lib/copy";
import { localeText, useI18n } from "@/lib/i18n";
import { workingSets } from "@/lib/trainingMetrics";
import { requiresCycleReviewBeforeWorkout } from "@/lib/cyclePlanning";
import type { TrainingType } from "@/lib/types";
import TrainingModuleStable from "@/components/TrainingModuleStable";
import SessionVolumePlan from "@/components/SessionVolumePlan";
import PulseSessionConsole from "@/components/PulseSessionConsole";
import MidnightSessionDeck from "@/components/MidnightSessionDeck";
import SurvivalSessionGuide from "@/components/SurvivalSessionGuide";
import LiteSessionGuide from "@/components/LiteSessionGuide";
import CycleReviewPanel from "@/components/CycleReviewPanel";

const START_TYPES: TrainingType[] = ["push", "pull", "legs", "rest", "custom"];

export default function TrainPage() { return <Suspense fallback={<Skeleton />}><TrainInner /></Suspense>; }
function Skeleton() { return <div className="space-y-3"><div className="h-12 rounded-2xl bg-surface-2" /><div className="h-52 rounded-2xl bg-surface-2" /></div>; }

function TrainInner() {
  const { locale } = useI18n();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const { typeName } = usePersona();
  const { loaded, data, getDay, setWorkoutType, applyTemplate } = useStore();
  const { mode } = useUIMode();
  const params = useSearchParams();
  const today = useToday();
  const paramDate = validPastOrToday(params?.get("date") ?? null);
  const date = paramDate ?? today;
  const isPast = !!paramDate && paramDate !== today;
  const workout = getDay(date)?.workout;
  const workingCount = workout?.exercises.reduce((sum, exercise) => sum + workingSets(exercise.sets).length, 0) ?? 0;
  const done = workout?.done ?? false;
  const isActive = !!workout?.type && workout.type !== "rest" && workingCount > 0 && !done;
  const scheduled = getScheduledType(data.schedule, dateKeyWeekdayIndex(today));
  const requested = params.get("start");
  const requestedType = !isPast && requested && START_TYPES.includes(requested as TrainingType) ? requested as TrainingType : null;
  const requestedTemplate = !isPast ? params.get("template") : null;
  const requestedStepId = !isPast ? params.get("cycleStep") : null;
  const cycleReviewRequired = !isPast && !workout && requiresCycleReviewBeforeWorkout(data, date);

  useEffect(() => {
    if (!loaded || isPast || workout || !requestedType || cycleReviewRequired) return;
    const cycleStep = requestedStepId
      ? data.microcycle?.steps?.find((step) => step.id === requestedStepId && step.type === requestedType)
      : undefined;
    const liveTemplate = requestedTemplate ? data.templates?.find((item) => item.id === requestedTemplate && item.type === requestedType) : undefined;
    if (requestedTemplate && (liveTemplate || cycleStep?.templateId === requestedTemplate)) {
      applyTemplate(requestedTemplate, date, { microcycleStepId: cycleStep?.id });
      return;
    }
    setWorkoutType(date, requestedType, { microcycleStepId: cycleStep?.id });
  }, [applyTemplate, cycleReviewRequired, data.microcycle, data.templates, loaded, isPast, workout, requestedStepId, requestedTemplate, requestedType, date, setWorkoutType]);

  if (!loaded) return <Skeleton />;
  const headerType = workout?.type ?? (isPast ? null : scheduled);
  const title = isPast ? t("补记训练", "Backfill workout", "過去のトレーニング") : headerType ? typeName[headerType](mode) : t("训练", "Training", "トレーニング");
  return <div>
    <header className="mb-4">
      <div className="mb-2 flex items-center justify-between"><Link href={isPast ? "/progress?tab=log" : "/"} className="press flex items-center gap-1 text-[13px] font-semibold text-muted"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{isPast ? t("日志", "Log", "ログ") : t("今天", "Today", "今日")}</Link><div className="flex items-center gap-2"><Link href="/schedule" className="press rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-muted">{t("计划", "Plan", "プラン")}</Link><Link href="/templates" className="press rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-semibold text-muted">{t("模板", "Templates", "テンプレート")}</Link></div></div>
      <div className="control-card p-3.5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{isPast ? t("历史训练", "PAST SESSION", "過去のセッション") : t("训练", "TRAINING", "トレーニング")}</p><div className="mt-1 flex items-end justify-between gap-3"><div><h1 className="text-[25px] font-bold tracking-tight text-fg">{title}</h1><p className="tnum mt-1 text-[11px] text-faint">{formatDisplay(date, locale)}</p></div>{done ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">{t("已完成", "Completed", "完了")}</span> : isActive ? <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent"><span className="active-dot h-1.5 w-1.5 rounded-full bg-accent" />{t("进行中", "In progress", "進行中")}</span> : null}</div>{!workout && !isPast && scheduled && <p className="mt-3 border-t border-border/70 pt-2.5 text-[11px] text-muted">{t(`今日建议：${typeName[scheduled](mode)}。计划不会自动写入训练日志。`, `Suggested today: ${typeName[scheduled](mode)}. This will not be written to your workout log automatically.`, `今日の提案：${typeName[scheduled](mode)}。トレーニングログには自動で保存されません。`)}</p>}</div>
    </header>
    {cycleReviewRequired ? <div className="space-y-3">
      <div className="control-card px-3.5 py-3">
        <p className="text-[14px] font-semibold text-fg">{t("先完成本轮复盘", "Review the completed cycle first", "完了した周期を先にレビュー")}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{t("确认下一周期类型和模板调整后，再开始新的训练记录。", "Confirm the next cycle type and template changes before starting another workout.", "次周期の種類とテンプレート変更を確認してから、新しい記録を開始します。")}</p>
      </div>
      <CycleReviewPanel />
    </div> : <>
      {!isPast && (mode === "pulse" ? <PulseSessionConsole /> : mode === "midnight" ? <MidnightSessionDeck /> : mode === "survival" ? <SurvivalSessionGuide /> : <LiteSessionGuide />)}
      <SessionVolumePlan date={date} workout={workout} />
      <TrainingModuleStable date={date} suggestedType={isPast ? null : scheduled} />
    </>}
  </div>;
}
