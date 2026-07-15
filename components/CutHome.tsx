"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { BASELINE_ACTIVITY, DEFAULT_BASELINE_ACTIVITY, resolveCutEnergyPlan } from "@/lib/cut";
import { buildCutCoachReview, type CutCoachState } from "@/lib/cutCoach";
import { isCutModeActive } from "@/lib/cutMode";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import type { BaselineActivity } from "@/lib/types";

const SPEEDS = [0.25, 0.5, 0.75] as const;

function reviewTitle(locale: Locale, state: CutCoachState) {
  const copy: Record<CutCoachState, [string, string, string]> = {
    setup: ["先建立减脂起点", "Set up your cut baseline", "減量の基準を設定"],
    collect: ["本周速度会随有氧记录变化", "This week's pace will change with cardio logs", "今週のペースは有酸素の記録で変わります"],
    hold: ["当前策略保持不动", "Keep the current strategy", "現在の方針を維持"],
    slowDown: ["下降快于计划，先保护恢复", "Loss is faster than planned - protect recovery", "減量が計画より速い - 回復を優先"],
    speedUp: ["执行充分但趋势偏慢", "Execution is solid but the trend is slow", "実行は十分だが推移が遅い"],
    guardrail: ["当前目标速度偏激进", "Current target pace is too aggressive", "現在の目標ペースは攻めすぎです"],
  };
  return localeText(locale, ...copy[state]);
}

export default function CutHome() {
  const { data, loaded, setCutPlan } = useStore();
  const { tr, locale } = useI18n();
  const today = useToday();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const active = isCutModeActive(data.cutPlan);
  const energy = useMemo(() => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, today]);
  const review = useMemo(() => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today]);

  if (!loaded) return <div className="space-y-3"><div className="h-24 rounded-2xl bg-surface-2" /><div className="h-44 rounded-2xl bg-surface-2" /></div>;

  const eaten = data.days[today]?.nutrition?.calories ?? 0;
  const remaining = energy.calorieTarget != null && eaten > 0 ? Math.round(energy.calorieTarget - eaten) : null;
  const speed = data.cutPlan?.weeklyLossPct ?? 0.5;
  const activity = data.cutPlan?.baselineActivity ?? DEFAULT_BASELINE_ACTIVITY;
  const week = review.weeklyBudget;
  const weeklyPace = `${week.projectedWeeklyLossPct ?? "—"}% / ${tr("周")}`;

  return <div className="space-y-4">
    <header className="control-card p-3.5"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">CUT</p><h1 className="mt-1 text-[23px] font-bold tracking-tight text-fg">{tr("减脂")}</h1><p className="mt-1 text-[12px] text-muted">{tr("今天做什么，系统只给一条主线。")}</p></div><button type="button" onClick={() => setCutPlan({ enabled: !active })} aria-label={tr(active ? "关闭减脂模式" : "开启减脂模式")} className={"press relative mt-1 h-8 w-14 rounded-full transition-colors " + (active ? "bg-accent" : "border border-border bg-surface-2")}><span className={"absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform " + (active ? "translate-x-6" : "translate-x-1")} /></button></div></header>

    {!active ? <section className="control-card p-4"><p className="text-[16px] font-semibold text-fg">{tr("减脂模式未开启")}</p><p className="mt-1 text-[12px] leading-relaxed text-muted">{tr("开启后，饮食、有氧和体重趋势会汇总成每周速度。")}</p><button type="button" onClick={() => setCutPlan({ enabled: true })} className="press mt-4 h-11 w-full rounded-xl bg-accent text-[13px] font-semibold text-accent-fg">{tr("开启减脂")}</button></section>
    : energy.calorieTarget == null ? <section className="control-card p-4"><p className="text-[16px] font-semibold text-fg">{tr("先建立起点")}</p><p className="mt-1 text-[12px] leading-relaxed text-muted">{tr("补齐最近体重、身高、生理性别和出生年份后，系统才能给出日目标和周速度。")}</p><Link href="/data" className="press mt-4 flex h-11 items-center justify-center rounded-xl bg-accent text-[13px] font-semibold text-accent-fg">{tr("补齐资料")}</Link></section>
    : <>
      <section className="control-card p-3.5"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">TODAY</p><h2 className="mt-1 text-[18px] font-bold text-fg">{reviewTitle(locale, review.state)}</h2></div><span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-semibold text-accent">{tr("目标 {n}% / 周", { n: speed })}</span></div><div className="mt-4 grid grid-cols-2 gap-2"><Metric label={tr("今日目标")} value={`${energy.calorieTarget} kcal`} accent /><Metric label={tr(eaten > 0 ? "当前余量" : "饮食状态")} value={remaining == null ? tr("未记录") : remaining >= 0 ? `${remaining} kcal` : `${tr("超")} ${Math.abs(remaining)} kcal`} warn={remaining != null && remaining < 0} /></div><Link href="/nutrition" className="press mt-3 flex h-12 items-center justify-center rounded-xl bg-fg text-[14px] font-semibold text-bg">{tr(eaten > 0 ? "更新饮食" : "记录饮食")}</Link><div className="mt-2 grid grid-cols-2 gap-2"><Link href="/cardio" className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface-2 text-[12px] font-semibold text-fg">{tr("记录有氧")}</Link><Link href="/data" className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface-2 text-[12px] font-semibold text-fg">{tr("记录晨重")}</Link></div></section>
      <section className="control-card p-3.5"><div className="flex items-baseline justify-between gap-3"><div><p className="text-[14px] font-semibold text-fg">{tr("这周")}</p><p className="mt-0.5 text-[11px] text-faint">{tr("实际饮食和有氧已经进入周度估算。")}</p></div><p className="tnum text-[17px] font-bold text-accent">{weeklyPace}</p></div><div className="mt-3 grid grid-cols-3 gap-2"><Metric label={tr("饮食偏差")} value={week.balanceToDate == null ? "—" : `${week.balanceToDate >= 0 ? "+" : ""}${week.balanceToDate}`} accent={week.balanceToDate != null && week.balanceToDate >= 0} warn={week.balanceToDate != null && week.balanceToDate < 0} /><Metric label={tr("有氧影响")} value={`${week.cardioAdjustmentKcal >= 0 ? "+" : ""}${week.cardioAdjustmentKcal}`} accent={week.cardioAdjustmentKcal > 0} warn={week.cardioAdjustmentKcal < 0} /><Metric label={tr("预计赤字")} value={week.projectedWeeklyDeficit == null ? "—" : `${week.projectedWeeklyDeficit}`} /></div><p className="mt-3 text-[10px] leading-relaxed text-faint">{tr("记录更多有氧会加快预计速度；记录不足会放慢。趋势成熟后再由真实体重确认。")}</p></section>
      <section className="control-card overflow-hidden"><button type="button" onClick={() => setSettingsOpen((value) => !value)} className="press flex w-full items-center justify-between px-3.5 py-3.5 text-left"><div><p className="text-[14px] font-semibold text-fg">{tr("计划设置")}</p><p className="mt-0.5 text-[11px] text-faint">{tr("速度和日常走动。")}</p></div><span className="text-[18px] text-faint">{settingsOpen ? "−" : "+"}</span></button>{settingsOpen && <div className="soft-divider animate-slidedown border-t px-3.5 pb-3.5 pt-3"><p className="text-[11px] font-medium text-faint">{tr("每周速度")}</p><div className="mt-2 grid grid-cols-3 gap-2">{SPEEDS.map((value) => <button key={value} type="button" onClick={() => setCutPlan({ weeklyLossPct: value })} className={"choice-chip press h-10 border text-[12px] font-semibold " + (Math.abs(speed - value) < 0.01 ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}>{value}% / {tr("周")}</button>)}</div><label className="mt-4 block text-[11px] font-medium text-faint">{tr("日常走动")}<select value={activity} onChange={(event) => setCutPlan({ baselineActivity: event.target.value as BaselineActivity })} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px] font-semibold text-fg outline-none focus:border-accent">{(Object.keys(BASELINE_ACTIVITY) as BaselineActivity[]).map((level) => <option key={level} value={level}>{tr(BASELINE_ACTIVITY[level].label)}</option>)}</select></label><p className="mt-3 text-[10px] leading-relaxed text-faint">{tr("有氧不预设在这里。去有氧页记录后，会直接影响本周速度。")}</p></div>}</section>
    </>}
  </div>;
}

function Metric({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) { return <div className="control-strip rounded-xl px-2.5 py-2"><p className="text-[10px] text-faint">{label}</p><p className={"tnum mt-0.5 text-[13px] font-semibold " + (warn ? "text-warn" : accent ? "text-accent" : "text-fg")}>{value}</p></div>; }
