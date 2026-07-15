"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { cardioWeekSummary } from "@/lib/cardio";
import { buildCutCoachReview } from "@/lib/cutCoach";
import { isCutModeActive } from "@/lib/cutMode";
import type { Zone } from "@/lib/types";
import NumberField from "./NumberField";

const QUICK: Array<{ label: string; mode: string; minutes: number; zone: Zone }> = [
  { label: "走路 30 分", mode: "走路", minutes: 30, zone: 2 },
  { label: "单车 40 分", mode: "单车", minutes: 40, zone: 2 },
  { label: "跑步 30 分", mode: "跑步", minutes: 30, zone: 2 },
  { label: "Z2 60 分", mode: "有氧", minutes: 60, zone: 2 },
];

export default function SimpleCardioLog({ date }: { date: string }) {
  const { data, getDay, addCardio, removeCardio } = useStore();
  const toast = useToast();
  const [customOpen, setCustomOpen] = useState(false);
  const [mode, setMode] = useState("有氧");
  const [minutes, setMinutes] = useState(30);
  const [zone, setZone] = useState<Zone>(2);
  const entries = getDay(date)?.cardio ?? [];
  const week = useMemo(() => cardioWeekSummary(data.days, data.cutPlan, date), [data.days, data.cutPlan, date]);
  const review = useMemo(() => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, date), [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, date]);
  const cutActive = isCutModeActive(data.cutPlan);

  function save(next: { mode: string; minutes: number; zone: Zone }) {
    if (!next.minutes || next.minutes <= 0) return;
    addCardio(date, next);
    toast.show(`已记录 ${next.mode} ${next.minutes} 分`);
  }

  return (
    <section className="space-y-4">
      <section className="control-card p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">THIS WEEK</p>
            <p className="tnum mt-1 text-[24px] font-bold text-fg">{week.totalMinutes}<span className="ml-1 text-[12px] font-medium text-faint">分钟</span></p>
          </div>
          {cutActive && <p className="tnum text-right text-[13px] font-semibold text-accent">预计 {review.weeklyBudget.projectedWeeklyLossPct == null ? "—" : `${review.weeklyBudget.projectedWeeklyLossPct}% / 周`}<span className="mt-0.5 block text-[10px] font-normal text-faint">有氧已计入</span></p>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">记录一次即可更新这一周的减脂速度；不需要自己算消耗。</p>
      </section>

      <section className="control-card p-3.5">
        <p className="text-[14px] font-semibold text-fg">快速记录</p>
        <p className="mt-0.5 text-[11px] text-faint">默认按 Z2；适合大多数稳定有氧。</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {QUICK.map((item) => <button key={item.label} type="button" onClick={() => save(item)} className="choice-chip press h-12 border border-border bg-surface-2 px-3 text-left"><p className="text-[12px] font-semibold text-fg">{item.label}</p><p className="mt-0.5 text-[10px] text-faint">点一下直接记录</p></button>)}
        </div>
        <button type="button" onClick={() => setCustomOpen((value) => !value)} className="press mt-3 flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 text-left"><span className="text-[12px] font-semibold text-fg">其他记录</span><span className="text-[16px] text-faint">{customOpen ? "−" : "+"}</span></button>
        {customOpen && (
          <div className="animate-slidedown mt-2 space-y-3 rounded-xl border border-border bg-surface-2 p-3">
            <label className="block text-[10px] font-medium text-faint">方式<select value={mode} onChange={(event) => setMode(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] font-semibold text-fg outline-none focus:border-accent"><option>走路</option><option>跑步</option><option>单车</option><option>椭圆机</option><option>划船</option><option>爬楼梯</option><option>有氧</option></select></label>
            <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-medium text-faint">时长<NumberField value={minutes} onChange={setMinutes} ariaLabel="有氧时长" placeholder="30" allowDecimal={false} className="number-cell tnum mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-[14px] font-semibold text-fg outline-none focus:border-accent" /></label><label className="text-[10px] font-medium text-faint">强度<select value={zone} onChange={(event) => setZone(Number(event.target.value) as Zone)} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] font-semibold text-fg outline-none focus:border-accent"><option value={1}>Z1 恢复</option><option value={2}>Z2 稳定</option><option value={3}>Z3 节奏</option><option value={4}>Z4 间歇</option><option value={5}>Z5 冲刺</option></select></label></div>
            <button type="button" onClick={() => save({ mode, minutes, zone })} className="press h-10 w-full rounded-lg bg-fg text-[12px] font-semibold text-bg">记录这次有氧</button>
          </div>
        )}
      </section>

      {entries.length > 0 && <section className="control-card overflow-hidden"><div className="px-3.5 py-3"><p className="text-[14px] font-semibold text-fg">当天已记录</p></div>{entries.map((entry) => <div key={entry.id} className="soft-divider flex items-center gap-3 border-t px-3.5 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-[11px] font-bold text-accent">{entry.zone ? `Z${entry.zone}` : "—"}</span><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-fg">{entry.mode} · {entry.minutes} 分</p><p className="mt-0.5 text-[10px] text-faint">已计入这一周的减脂速度</p></div><button type="button" onClick={() => removeCardio(date, entry.id)} aria-label={`删除${entry.mode}记录`} className="press h-9 w-9 rounded-lg text-[18px] text-faint">×</button></div>)}</section>}
    </section>
  );
}
