"use client";

import { useState } from "react";
import Link from "next/link";
import type { DayLog, Exercise } from "@/lib/types";
import { formatCompact, relativeLabel } from "@/lib/date";
import { typeLabel } from "@/lib/exercises";
import { exercisePrescription, exerciseTrackLabel } from "@/lib/prescription";
import { hasSetPerformance, summarizeWorkoutWork } from "@/lib/trainingMetrics";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { workoutLogState, type WorkoutLogState } from "@/lib/trainingHistory";
import { zoneMeta } from "@/lib/hr";
import { localeText, useI18n, type Locale } from "@/lib/i18n";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

function summarize(exercise: Exercise, locale: Locale) {
  const meaningful = exercise.sets.filter(hasSetPerformance);
  if (!meaningful.length) return "—";
  const mode = exercisePrescription(exercise).performanceMode ?? "reps";
  return meaningful.map((set) => {
    const prefix = set.type === "warmup"
      ? tx(locale, "热身 ", "Warm-up ", "ウォームアップ ")
      : set.completion === "skipped"
        ? tx(locale, "跳过 ", "Skipped ", "スキップ ")
        : set.completion === "partial"
          ? tx(locale, "部分 ", "Partial ", "部分 ")
          : set.technique === "rehab"
            ? tx(locale, "康复 ", "Rehab ", "リハビリ ")
            : "";
    if (mode === "duration") return `${prefix}${set.durationSeconds ?? 0}${tx(locale, "秒", "s", "秒")}`;
    if (mode === "distance") return `${prefix}${set.distanceMeters ?? 0}m`;
    return `${prefix}${set.weight > 0 ? `${set.weight}kg × ` : ""}${set.reps}${tx(locale, "次", "", "回")}`;
  }).join("  ·  ");
}

export default function HistoryRow({ date, day }: { date: string; day: DayLog | undefined }) {
  const { tr, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const workout = day?.workout;
  const state = workoutLogState(workout);
  const work = summarizeWorkoutWork(workout);
  const execution = summarizeSessionExecution(workout);
  const isRest = state === "rest";
  const hasWorkout = Boolean(workout);
  const hasTrainingWork = work.workingSets > 0;
  const kcal = day?.nutrition?.calories ?? 0;
  const hasNutrition = Boolean(day?.nutrition && (kcal > 0 || day.nutrition.protein > 0 || day.nutrition.carbs > 0 || day.nutrition.fat > 0));
  const cardio = day?.cardio ?? [];
  const cardioMin = cardio.reduce((sum, entry) => sum + entry.minutes, 0);
  const hasCardio = cardioMin > 0;
  const visibleExercises = workout?.exercises.filter((exercise) => exercise.sets.some(hasSetPerformance)) ?? [];
  const { md } = formatCompact(date, locale);

  return <div className="soft-divider border-b">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="press flex w-full min-w-0 items-center gap-2.5 py-3 text-left">
      <div className="w-14 shrink-0"><p className="text-[13px] font-semibold text-fg">{relativeLabel(date, locale)}</p><p className="tnum text-[11px] text-faint">{md}</p></div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {isRest ? <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">{tx(locale, "休息", "Rest", "休息")}</span> : hasTrainingWork ? <>
          <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">{tr(typeLabel(workout!.type))}</span>
          <span className="tnum min-w-0 truncate text-[11px] text-faint">{execution.plannedSets ? `${formatSetCredit(execution.planCredits)}/${execution.plannedSets}` : formatSetCredit(execution.completionCredits)} {tx(locale, "组", "sets", "セット")}</span>
        </> : hasWorkout ? <span className="truncate text-[12px] text-faint">{tx(locale, "训练草稿", "Workout draft", "トレーニング下書き")}</span> : <span className="tnum truncate text-[11px] text-muted">{[hasCardio ? tx(locale, `有氧 ${cardioMin}′`, `Cardio ${cardioMin}′`, `有酸素 ${cardioMin}′`) : "", hasNutrition ? `${kcal} kcal` : ""].filter(Boolean).join(" · ")}</span>}
        {(hasNutrition || hasCardio) && <span className="tnum ml-auto hidden shrink-0 items-center gap-2 text-[11px] text-muted min-[420px]:flex">{hasCardio && <span>{tx(locale, `有氧 ${cardioMin}′`, `Cardio ${cardioMin}′`, `有酸素 ${cardioMin}′`)}</span>}{hasNutrition && <span>{kcal} kcal</span>}</span>}
      </div>
      {state && <StateBadge state={state} locale={locale} />}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-faint" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>

    {open && <div className="animate-slidedown space-y-3 pb-3.5">
      {workout && !isRest && <div className="control-strip rounded-xl p-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-faint">
          <span>{tx(locale, `${work.exercisesWithWork} 个动作`, `${work.exercisesWithWork} exercises`, `${work.exercisesWithWork} 種目`)}</span>
          <span>·</span>
          <span>{tx(locale, `${work.workingSets} 个有效工作组`, `${work.workingSets} valid work sets`, `有効ワーキングセット ${work.workingSets}`)}</span>
          {workout.difficulty && <><span>·</span><span>{difficultyLabel(workout.difficulty, locale)}</span></>}
        </div>
        {visibleExercises.length ? visibleExercises.map((exercise) => <div key={exercise.id} className="soft-divider border-t py-2 first:border-t-0 first:pt-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{tr(exercise.name)}{exercise.isMain && <span className="ml-1 text-[10px] text-accent">{tx(locale, "主", "Main", "メイン")}</span>}</span>
            <span className="max-w-[48%] truncate rounded bg-surface px-1.5 py-0.5 text-[9px] text-faint">{tr(exerciseTrackLabel(exercise))}</span>
          </div>
          <p className="tnum mt-1 break-words text-[11px] leading-relaxed text-muted">{summarize(exercise, locale)}</p>
        </div>) : <p className="text-[11px] text-faint">{tx(locale, "还没有有效组记录。", "No valid set has been logged yet.", "有効なセット記録はまだありません。")}</p>}
      </div>}
      {hasNutrition && day?.nutrition && <div className="control-strip tnum flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-[12px]"><span className="text-fg">{day.nutrition.calories} kcal</span><span className="text-muted">P {day.nutrition.protein}</span><span className="text-muted">C {day.nutrition.carbs}</span><span className="text-muted">F {day.nutrition.fat}</span></div>}
      {hasCardio && <div className="control-strip space-y-1.5 rounded-xl p-3">{cardio.map((entry) => <div key={entry.id} className="soft-divider flex flex-wrap items-baseline gap-2 border-t pt-1.5 first:border-t-0 first:pt-0"><span className="text-[13px] text-fg">{tr(entry.mode)}</span><span className="tnum text-[12px] text-muted">{entry.minutes}′</span>{entry.zone && <span className="tnum rounded bg-accent-soft px-1.5 text-[11px] font-bold text-accent">Z{entry.zone} {tr(zoneMeta(entry.zone).zh)}</span>}{entry.avgHR && <span className="tnum ml-auto text-[11px] text-faint">{entry.avgHR} bpm</span>}{entry.note && <p className="w-full break-words text-[10px] text-faint">{entry.note}</p>}</div>)}</div>}
      <div className="grid grid-cols-3 gap-2"><EditLink href={`/train?date=${date}`} label={tx(locale, isRest || hasTrainingWork ? "改训练" : "补记训练", isRest || hasTrainingWork ? "Edit training" : "Add training", isRest || hasTrainingWork ? "トレーニング編集" : "トレーニング追記")} /><EditLink href={`/nutrition?date=${date}`} label={tx(locale, hasNutrition ? "改饮食" : "补记饮食", hasNutrition ? "Edit nutrition" : "Add nutrition", hasNutrition ? "食事編集" : "食事追記")} /><EditLink href={`/cardio?date=${date}`} label={tx(locale, hasCardio ? "改有氧" : "补记有氧", hasCardio ? "Edit cardio" : "Add cardio", hasCardio ? "有酸素編集" : "有酸素追記")} /></div>
    </div>}
  </div>;
}

function StateBadge({ state, locale }: { state: WorkoutLogState; locale: Locale }) {
  const label = state === "completed" ? tx(locale, "完成", "Done", "完了") : state === "inProgress" ? tx(locale, "进行中", "Active", "進行中") : state === "legacy" ? "Legacy" : state === "draft" ? tx(locale, "草稿", "Draft", "下書き") : "";
  if (!label) return null;
  return <span className={"shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold " + (state === "completed" ? "bg-accent-soft text-accent" : state === "inProgress" ? "bg-warn-soft text-warn" : "bg-surface-2 text-faint")}>{label}</span>;
}

function difficultyLabel(value: "easy" | "onTarget" | "hard", locale: Locale) {
  return value === "easy" ? tx(locale, "整体轻松", "Easy overall", "全体的に余裕") : value === "hard" ? tx(locale, "整体吃力", "Hard overall", "全体的にきつい") : tx(locale, "整体合适", "On target", "全体的に適正");
}

function EditLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="choice-chip press flex h-9 min-w-0 items-center justify-center border border-border bg-surface px-1 text-[11px] font-medium text-muted"><span className="truncate">{label}</span></Link>;
}
