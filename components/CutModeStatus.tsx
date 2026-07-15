"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { resolveCutEnergyPlan } from "@/lib/cut";
import { buildCutCoachReview } from "@/lib/cutCoach";
import { isCutModeActive } from "@/lib/cutMode";

function remaining(target: number | null, eaten: number) {
  if (target == null) return null;
  return Math.round(target - eaten);
}

function coachLabel(state: ReturnType<typeof buildCutCoachReview>["state"]) {
  return {
    setup: "补齐起点",
    collect: "先收集数据",
    hold: "策略保持",
    slowDown: "建议放慢",
    speedUp: "建议校准",
    guardrail: "保护恢复",
  }[state];
}

export function CutModeStatus({ date }: { date: string }) {
  const { data, getDay, loaded } = useStore();
  const active = isCutModeActive(data.cutPlan);
  const energy = useMemo(
    () => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, date),
    [data.profile, data.cutPlan, data.days, data.bodyWeights, date]
  );
  const review = useMemo(
    () => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, date),
    [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, date]
  );
  if (!loaded || !active) return null;

  const eaten = getDay(date)?.nutrition?.calories ?? 0;
  const left = remaining(energy.calorieTarget, eaten);
  return (
    <Link href="/cut" className="press mb-4 block rounded-lg border border-accent/40 bg-accent-soft px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">CUT SYSTEM · ON</p>
          <p className="mt-1 text-[13px] font-semibold text-fg">{review.title}</p>
        </div>
        <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-bold text-accent">{coachLabel(review.state)}</span>
      </div>
      {energy.calorieTarget != null ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] text-muted">
          <span className="tnum font-semibold text-fg">{energy.calorieTarget} kcal</span>
          <span>今日预算</span>
          <span className="text-faint">·</span>
          <span className="tnum">本周已记 {review.weeklyBudget.loggedDays} 天</span>
          {left != null && eaten > 0 && <span className={left >= 0 ? "tnum text-accent" : "tnum text-warn"}>{left >= 0 ? `今日余 ${left}` : `今日超 ${Math.abs(left)}`}</span>}
        </div>
      ) : <p className="mt-2 text-[11px] text-muted">补齐体重、身高、生理性别与出生年份后生成预算</p>}
      <p className="mt-1 text-[10px] text-faint">{review.dataQuality === "ready" ? "趋势预算已启用" : "当前仍在建立趋势模型"} · 查看控制台 →</p>
    </Link>
  );
}

export function CutNutritionGuide({ date }: { date: string }) {
  const { data, getDay, loaded } = useStore();
  const active = isCutModeActive(data.cutPlan);
  const energy = useMemo(
    () => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, date),
    [data.profile, data.cutPlan, data.days, data.bodyWeights, date]
  );
  const review = useMemo(
    () => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, date),
    [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, date]
  );
  if (!loaded || !active) return null;

  const existing = getDay(date)?.nutrition;
  const eaten = existing?.calories ?? 0;
  const left = remaining(energy.calorieTarget, eaten);
  if (!energy.macros) {
    return <Link href="/cut" className="mb-3 block rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[12px] text-accent">减脂模式已开启：去控制台补齐体重与个人资料 →</Link>;
  }

  return (
    <Link href="/cut" className="press mb-3 block rounded-md border border-accent/30 bg-accent-soft px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-accent">减脂执行预算</p>
          <p className="tnum mt-0.5 text-[18px] font-bold text-fg">{energy.macros.calories} <span className="text-[11px] font-medium text-faint">kcal</span></p>
        </div>
        {eaten > 0 ? <div className="text-right"><p className="tnum text-[13px] font-semibold text-fg">已记 {eaten}</p>{left != null && <p className={left >= 0 ? "tnum text-[11px] text-accent" : "tnum text-[11px] text-warn"}>{left >= 0 ? `今日余 ${left}` : `今日超 ${Math.abs(left)} kcal`}</p>}</div> : <span className="text-[11px] font-medium text-accent">记录摄入 →</span>}
      </div>
      <p className="tnum mt-1 text-[11px] text-muted">P {energy.macros.protein}g · C {energy.macros.carbs}g · F {energy.macros.fat}g</p>
      <p className="mt-1 text-[10px] text-faint">本周已记 {review.weeklyBudget.loggedDays} / {review.weeklyBudget.elapsedDays} 天；有氧不兑换当天可吃热量。</p>
    </Link>
  );
}
