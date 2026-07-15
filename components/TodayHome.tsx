"use client";

import Link from "next/link";
import { useMemo } from "react";
import { resolveCutEnergyPlan } from "@/lib/cut";
import { isCutModeActive } from "@/lib/cutMode";
import { useStore } from "@/lib/store";
import { formatDisplay } from "@/lib/date";
import { cardioWeekSummary } from "@/lib/cardio";
import { useToday } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useUIMode } from "@/lib/uiMode";
import { dateKeyWeekdayIndex, getScheduledType } from "@/lib/schedule";
import { typeLabel } from "@/lib/exercises";
import { workingSets } from "@/lib/prescription";
import type { TrainingType } from "@/lib/types";
import MorningCheckIn from "./MorningCheckIn";
import PulseDailyBrief from "./PulseDailyBrief";
import MidnightAmbientStatus from "./MidnightAmbientStatus";
import SurvivalFieldBoard from "./SurvivalFieldBoard";
import TrainingDecisionBrief from "./TrainingDecisionBrief";

type Translate = (zh: string, params?: Record<string, string | number>) => string;

export default function TodayHome() {
  const { loaded, data, getDay } = useStore();
  const { locale, tr } = useI18n();
  const { mode } = useUIMode();
  const today = useToday();
  const day = getDay(today);
  const workout = day?.workout;
  const setCount = workout?.exercises.reduce((sum, exercise) => sum + workingSets(exercise.sets).length, 0) ?? 0;
  const scheduled = getScheduledType(data.schedule, dateKeyWeekdayIndex(today));
  const activeType = workout?.type ?? scheduled;
  const nutrition = day?.nutrition;
  const calories = nutrition?.calories ?? 0;
  const cardioToday = (day?.cardio ?? []).reduce((sum, item) => sum + item.minutes, 0);
  const cardioWeek = useMemo(() => cardioWeekSummary(data.days, data.cutPlan, today), [data.days, data.cutPlan, today]);
  const cutActive = isCutModeActive(data.cutPlan);
  const energy = useMemo(() => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, today]);
  const profileMissing = !(data.profile?.sex && data.profile.heightCm && data.profile.birthYear);
  const workoutHref = workout?.type ? "/train" : activeType ? `/train?start=${activeType}` : "/train";
  const primaryLabel = workout?.done
    ? tr("查看训练")
    : workout?.type && setCount > 0
      ? tr("继续训练")
      : activeType === "rest"
        ? tr("记录休息日")
        : activeType
          ? tr("开始{type}", { type: tr(typeLabel(activeType)) })
          : tr("开始训练");
  const calorieDetail = cutActive && energy.calorieTarget
    ? tr(energy.calorieTarget - calories >= 0 ? "目标 {n} · 剩 {m}" : "目标 {n} · 超 {m}", { n: energy.calorieTarget, m: Math.abs(Math.round(energy.calorieTarget - calories)) })
    : calories ? tr("已记录总热量") : tr("记录总热量");

  if (!loaded) return <div className="space-y-3"><div className="h-16 rounded-2xl bg-surface-2" /><div className="h-24 rounded-2xl bg-surface-2" /><div className="h-44 rounded-2xl bg-surface-2" /></div>;

  return <div className="pb-2">
    <header className="mb-4 flex items-start justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">FITLOG · TODAY</p><h1 className="mt-1 text-[25px] font-bold tracking-tight text-fg">{formatDisplay(today, locale)}</h1></div>
      <Link href="/settings" aria-label={tr("设置")} className="press grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-faint shadow-sm"><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" /><path d="M12 2.75V5M12 19V21.25M4.75 12H2.5M21.5 12H19.25M6.9 6.9L5.3 5.3M18.7 18.7L17.1 17.1M6.9 17.1L5.3 18.7M18.7 5.3L17.1 6.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></Link>
    </header>

    {profileMissing && <section className="control-card mb-4 flex items-center gap-3 px-3.5 py-3"><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-fg">{tr("补齐基本资料")}</p><p className="mt-0.5 text-[11px] text-faint">{tr("身高、生理性别与出生年份用于热量和心率估算。")}</p></div><Link href="/settings" className="press rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-accent">{tr("去填写")}</Link></section>}

    {mode === "pulse" ? <PulseDailyBrief /> : mode === "survival" ? <SurvivalFieldBoard /> : <><MidnightAmbientStatus /><MorningCheckIn date={today} /></>}

    <section className={"action-card lite-card mb-3 overflow-hidden rounded-2xl border p-4 shadow-sm " + (workout && !workout.done && workout.type !== "rest" ? "border-accent bg-accent-soft" : "border-border bg-surface")}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">PRIMARY</p><h2 className="mt-1 text-[25px] font-bold tracking-tight text-fg">{activeType ? tr(typeLabel(activeType)) : tr("训练")}</h2><p className="mt-1 text-[12px] text-muted">{trainingSubline(tr, workout?.type, workout?.done, setCount, !!activeType)}</p></div><span className={"grid h-10 w-10 place-items-center rounded-xl " + (workout?.done ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6.5 8.5V15.5M17.5 8.5V15.5M3.7 10V14M20.3 10V14M6.5 10.5H17.5V13.5H6.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg></span></div>
      <Link href={workoutHref} className="press mt-4 flex h-12 items-center justify-center rounded-xl bg-fg text-[15px] font-semibold text-bg">{primaryLabel}<span className="ml-2" aria-hidden="true">→</span></Link>
    </section>

    <TrainingDecisionBrief compact />

    <section className="grid grid-cols-2 gap-3">
      <Link href="/nutrition" className="metric-sheen press rounded-2xl border border-border bg-surface p-3.5 shadow-sm"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{tr("饮食")}</span><MiniArrow /></div><p className="tnum mt-3 text-[24px] font-bold text-fg">{calories || "—"}<span className="ml-1 text-[11px] font-medium text-faint">kcal</span></p><p className="mt-1 text-[11px] text-muted">{calorieDetail}</p></Link>
      <Link href="/cardio" className="metric-sheen press rounded-2xl border border-border bg-surface p-3.5 shadow-sm"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{tr("有氧")}</span><MiniArrow /></div><p className="tnum mt-3 text-[24px] font-bold text-fg">{cardioToday || "—"}<span className="ml-1 text-[11px] font-medium text-faint">{tr("分")}</span></p><p className="mt-1 text-[11px] text-muted">{cardioToday ? tr("本周累计 {n} 分", { n: cardioWeek.totalMinutes }) : cutActive ? tr("记录后影响本周速度") : tr("快速记录一次有氧")}</p></Link>
    </section>

    <section className="mt-3 rounded-2xl border border-border bg-surface px-3.5 py-3 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-semibold text-fg">{tr("减脂与趋势")}</p><p className="mt-0.5 text-[11px] text-faint">{cutActive ? (energy.maintenanceSource === "trend" ? tr("趋势已校准 · 有氧影响周速度") : tr("先用公式起点，记录够后自动校准")) : tr("开启后汇总饮食、有氧和体重趋势")}</p></div><Link href="/cut" className="press rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-accent">{cutActive ? tr("查看") : tr("开启")}</Link></div></section>
  </div>;
}

function MiniArrow() { return <span className="text-[16px] leading-none text-faint" aria-hidden="true">›</span>; }
function trainingSubline(tr: Translate, type: TrainingType | undefined, done: boolean | undefined, sets: number, hasPlan: boolean) {
  if (type === "rest") return tr("今天安排休息；恢复也是计划的一部分。");
  if (done) return tr("已完成 {n} 组。", { n: sets });
  if (type && sets > 0) return tr("已完成 {n} 组，随时继续。", { n: sets });
  if (hasPlan) return tr("按计划开始，也可在训练页调整。");
  return tr("选择类型后开始记录。");
}
