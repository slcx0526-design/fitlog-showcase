"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { resolveCutEnergyPlan } from "@/lib/cut";
import { buildCutCoachReview } from "@/lib/cutCoach";

const LOSS_PRESETS = [0.25, 0.5, 0.75] as const;

export default function CutPlanDetails() {
  const today = useToday();
  const { data, setCutPlan } = useStore();
  const energy = useMemo(() => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, today]);
  const review = useMemo(() => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today]);
  const weeklyLossPct = data.cutPlan?.weeklyLossPct ?? 0.5;
  const intake = data.days[today]?.nutrition?.calories ?? 0;
  const remaining = energy.calorieTarget != null && intake > 0 ? Math.round(energy.calorieTarget - intake) : null;
  const cardio = review.weeklyBudget;

  return (
    <div className="space-y-4">
      <section className="control-card p-3.5">
        <p className="text-[13px] font-semibold text-fg">饮食预算</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-faint">有氧改变本周预测速度，不自动换成今天可多吃的热量。</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label={energy.maintenanceSource === "trend" ? "趋势维持" : "公式维持"} value={energy.maintenance == null ? "—" : `${energy.maintenance} kcal`} accent={energy.maintenanceSource === "trend"} />
          <Metric label="每日目标" value={energy.calorieTarget == null ? "—" : `${energy.calorieTarget} kcal`} accent />
          <Metric label="蛋白目标" value={energy.macros ? `${energy.macros.protein} g` : "—"} />
          <Metric label={intake > 0 ? "今日相对目标" : "今日已记录"} value={remaining == null ? "—" : remaining >= 0 ? `剩 ${remaining}` : `超 ${Math.abs(remaining)}`} warn={remaining != null && remaining < 0} />
        </div>
        {energy.macros && <p className="tnum mt-2 text-[10px] text-faint">碳水 {energy.macros.carbs} g · 脂肪 {energy.macros.fat} g</p>}
        <Link href="/nutrition" className="press mt-3 flex h-10 items-center justify-center rounded-xl bg-accent text-[12px] font-semibold text-accent-fg">记录饮食</Link>
      </section>

      <section className="control-card p-3.5">
        <p className="text-[13px] font-semibold text-fg">减脂速度</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-faint">饮食目标是基础速度；已记录有氧会把本周预计速度推快或拉慢。</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {LOSS_PRESETS.map((value) => <button key={value} type="button" onClick={() => setCutPlan({ weeklyLossPct: value })} className={"choice-chip press h-10 border text-[12px] font-semibold " + (Math.abs(weeklyLossPct - value) < 0.01 ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}>{value}% / 周</button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="已记有氧折算" value={`${cardio.cardioLoggedNetKcal} kcal`} accent={cardio.cardioLoggedNetKcal > 0} />
          <Metric label="相对有氧基线" value={`${cardio.cardioAdjustmentKcal >= 0 ? "+" : ""}${cardio.cardioAdjustmentKcal} kcal`} accent={cardio.cardioAdjustmentKcal > 0} warn={cardio.cardioAdjustmentKcal < 0} />
          <Metric label="本周预计赤字" value={cardio.projectedWeeklyDeficit == null ? "—" : `${cardio.projectedWeeklyDeficit} kcal`} />
          <Metric label="本周预计速度" value={cardio.projectedWeeklyLossPct == null ? "—" : `${cardio.projectedWeeklyLossPct}% / 周`} accent />
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-faint">多做有氧会增加预计赤字、加快本周速度；少做或漏做固定有氧会相反。趋势数据成熟后，以体重与摄入确认真实速度。</p>
        <Link href="/cardio" className="choice-chip press mt-3 flex h-10 items-center justify-center border border-border bg-surface text-[12px] font-semibold text-fg">记录有氧活动</Link>
      </section>

      <section className="control-card p-3.5">
        <p className="text-[13px] font-semibold text-fg">训练容量</p>
        <p className="mt-0.5 text-[11px] text-faint">减脂期优先保留动作与强度，再根据恢复削减组数。</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[0.8, 0.7].map((value) => <button key={value} type="button" onClick={() => setCutPlan({ trainingVolumeScale: value })} className={"choice-chip press h-10 border text-[12px] font-semibold " + (Math.abs((data.cutPlan?.trainingVolumeScale ?? 0.8) - value) < 0.01 ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}>{value === 0.8 ? "常规 80%" : "恢复优先 70%"}</button>)}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return <div className="control-strip rounded-xl px-2.5 py-2"><p className="text-[10px] text-faint">{label}</p><p className={"tnum mt-0.5 text-[13px] font-semibold " + (warn ? "text-warn" : accent ? "text-accent" : "text-fg")}>{value}</p></div>;
}
