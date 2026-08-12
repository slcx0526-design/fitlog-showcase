"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useUIMode } from "@/lib/uiMode";
import { useToday } from "@/lib/hooks";
import { formatDisplay, validPastOrToday } from "@/lib/date";
import { usePersona } from "@/lib/copy";
import { localeText, useI18n } from "@/lib/i18n";
import { requiresCycleReviewBeforeWorkout } from "@/lib/cyclePlanning";
import { currentMicrocycleProgress, templateForMicrocycleStep } from "@/lib/microcycle";
import { isWorkoutSessionClosed } from "@/lib/trainingMetrics";
import type { TrainingType } from "@/lib/types";
import TrainingModuleStable from "@/components/TrainingModuleStable";
import SessionVolumePlan from "@/components/SessionVolumePlan";
import SessionGuide from "@/components/SessionGuide";
import CycleReviewPanel from "@/components/CycleReviewPanel";
import IntegratedCoachBrief from "@/components/IntegratedCoachBrief";
import TrainingPolicyShortcut from "@/components/TrainingPolicyShortcut";

const START_TYPES: TrainingType[] = ["push", "pull", "legs", "rest", "custom"];

export default function TrainPage() { return <Suspense fallback={<Skeleton />}><TrainInner /></Suspense>; }
function Skeleton() { return <div className="space-y-3"><div className="h-12 rounded-2xl bg-surface-2" /><div className="h-52 rounded-2xl bg-surface-2" /></div>; }

function TrainInner() {
  const { locale, tr } = useI18n();
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
  const done = isWorkoutSessionClosed(workout);
  const isActive = !!workout?.type && workout.type !== "rest" && !done;
  const requested = params.get("start");
  const requestedType = !isPast && requested && START_TYPES.includes(requested as TrainingType) ? requested as TrainingType : null;
  const requestedTemplate = !isPast ? params.get("template") : null;
  const requestedStepId = !isPast ? params.get("cycleStep") : null;
  const cycleReviewRequired = !workout && requiresCycleReviewBeforeWorkout(data, date);
  const scheduledStep = isPast || cycleReviewRequired ? null : currentMicrocycleProgress(data, today).next;
  const scheduled = scheduledStep?.type ?? null;

  useEffect(() => {
    if (!loaded || isPast || workout || !requestedType || cycleReviewRequired) return;
    const cycleStep = requestedStepId
      ? data.microcycle?.steps?.find((step) => step.id === requestedStepId && step.type === requestedType)
      : undefined;
    const requestedTemplateData = requestedTemplate
      ? templateForMicrocycleStep({ microcycle: data.microcycle, templates: data.templates }, cycleStep?.id, requestedTemplate)
      : undefined;
    if (requestedTemplate && requestedTemplateData?.type === requestedType && requestedTemplateData.items.length > 0) {
      applyTemplate(requestedTemplate, date, { microcycleStepId: cycleStep?.id });
      return;
    }
    setWorkoutType(date, requestedType, { microcycleStepId: cycleStep?.id });
  }, [applyTemplate, cycleReviewRequired, data.microcycle, data.templates, loaded, isPast, workout, requestedStepId, requestedTemplate, requestedType, date, setWorkoutType]);

  if (!loaded) return <Skeleton />;
  const headerType = workout?.type ?? (isPast ? null : scheduled);
  const title = isPast
    ? t("补记训练", "Backfill workout", "過去のトレーニング")
    : workout?.type
      ? typeName[workout.type](mode)
      : scheduledStep
        ? tr(scheduledStep.label)
        : headerType
          ? typeName[headerType](mode)
          : t("训练", "Training", "トレーニング");
  return <div>
    <header className="mb-5">
      <div className="mb-2 flex items-center justify-between"><Link href={isPast ? "/progress?tab=log" : "/"} className="page-back-link press"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>{isPast ? t("日志", "Log", "ログ") : t("今天", "Today", "今日")}</Link><div className="flex items-center gap-2"><Link href="/schedule" className="page-utility-link press">{t("计划", "Plan", "プラン")}</Link><Link href="/templates" className="page-utility-link press">{t("模板", "Templates", "テンプレート")}</Link><TrainingPolicyShortcut /></div></div>
      <div className="page-heading">
        <div><p className="page-heading__eyebrow">{isPast ? t("历史训练", "Past session", "過去のセッション") : t("训练记录", "Training log", "トレーニング記録")}</p><h1>{title}</h1><p className="page-heading__meta tnum">{formatDisplay(date, locale)}</p></div>
        {done ? <span className="page-status">{t("已完成", "Completed", "完了")}</span> : isActive ? <span className="page-status"><span className="active-dot h-1.5 w-1.5 rounded-full bg-accent" />{t("进行中", "In progress", "進行中")}</span> : null}
      </div>
      {!workout && !isPast && scheduled && <p className="inline-panel mt-3 text-[11px] text-muted">{scheduledStep
        ? t(`本轮下一步：${tr(scheduledStep.label)}。开始后才会写入训练日志。`, `Next in this cycle: ${tr(scheduledStep.label)}. It is logged only after you start.`, `今周期の次：${tr(scheduledStep.label)}。開始後にのみ記録されます。`)
        : t(`今日建议：${typeName[scheduled](mode)}。计划不会自动写入训练日志。`, `Suggested today: ${typeName[scheduled](mode)}. This will not be written to your workout log automatically.`, `今日の提案：${typeName[scheduled](mode)}。トレーニングログには自動で保存されません。`)}</p>}
    </header>
    {cycleReviewRequired ? <div className="space-y-3">
      <div className="control-card px-3.5 py-3">
        <p className="text-[14px] font-semibold text-fg">{t("先完成本轮复盘", "Review the completed cycle first", "完了した周期を先にレビュー")}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{isPast
          ? t("该日期位于已完成周期之后。先确认周期复盘，补记训练会进入正确的下一轮。", "This date follows a completed cycle. Review it first so the backfilled workout enters the correct next cycle.", "この日付は完了した周期の後です。先にレビューすると、追加入力が正しい次周期に入ります。")
          : t("确认下一周期类型和模板调整后，再开始新的训练记录。", "Confirm the next cycle type and template changes before starting another workout.", "次周期の種類とテンプレート変更を確認してから、新しい記録を開始します。")}</p>
      </div>
      <CycleReviewPanel reviewDate={date} />
    </div> : <>
      {!isPast && !workout && <IntegratedCoachBrief compact showAction={false} />}
      {!isPast && <SessionGuide workout={workout} />}
      <SessionVolumePlan date={date} workout={workout} />
      <TrainingModuleStable date={date} suggestedType={isPast ? null : scheduled} />
    </>}
  </div>;
}
