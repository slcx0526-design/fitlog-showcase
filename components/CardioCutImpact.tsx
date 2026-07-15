"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { buildCutCoachReview } from "@/lib/cutCoach";
import { isCutModeActive } from "@/lib/cutMode";

export default function CardioCutImpact() {
  const { data } = useStore();
  const today = useToday();
  const active = isCutModeActive(data.cutPlan);
  const review = useMemo(() => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today]);
  if (!active) return null;
  const budget = review.weeklyBudget;
  const pace = budget.projectedWeeklyLossPct == null ? "—" : `${budget.projectedWeeklyLossPct}% / 周`;
  return (
    <Link href="/cut" className="press mb-4 block rounded-xl border border-accent/30 bg-accent-soft px-3 py-3">
      <div className="flex items-baseline justify-between gap-3"><div><p className="text-[11px] font-semibold text-accent">有氧已计入减脂速度</p><p className="mt-0.5 text-[12px] text-muted">按记录时长与区间估算，影响的是本周预计赤字，不是今日可多吃热量。</p></div><p className="tnum shrink-0 text-[15px] font-bold text-fg">{pace}</p></div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center"><Mini label="本周有氧" value={`${budget.cardioLoggedNetKcal} kcal`} /><Mini label="相对基线" value={`${budget.cardioAdjustmentKcal >= 0 ? "+" : ""}${budget.cardioAdjustmentKcal}`} /><Mini label="预计周赤字" value={budget.projectedWeeklyDeficit == null ? "—" : `${budget.projectedWeeklyDeficit}`} /></div>
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-surface/70 px-1.5 py-1.5"><p className="text-[9px] text-faint">{label}</p><p className="tnum mt-0.5 text-[11px] font-semibold text-fg">{value}</p></div>; }
