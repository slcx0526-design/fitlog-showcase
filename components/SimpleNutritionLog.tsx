"use client";

import { useMemo, useState } from "react";
import type { NutritionLog } from "@/lib/types";
import { useStore } from "@/lib/store";
import { resolveCutEnergyPlan } from "@/lib/cut";
import { isCutModeActive } from "@/lib/cutMode";
import NumberField from "./NumberField";

const EMPTY: NutritionLog = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export default function SimpleNutritionLog({ date }: { date: string }) {
  const { getDay, setNutrition, lastNutrition, data } = useStore();
  const [macrosOpen, setMacrosOpen] = useState(false);
  const log = getDay(date)?.nutrition ?? EMPTY;
  const previous = lastNutrition(date);
  const cutActive = isCutModeActive(data.cutPlan);
  const energy = useMemo(() => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, date), [data.profile, data.cutPlan, data.days, data.bodyWeights, date]);
  const remaining = energy.calorieTarget != null && log.calories > 0 ? Math.round(energy.calorieTarget - log.calories) : null;

  function setCalories(calories: number) {
    setNutrition(date, calories > 0 ? { ...log, calories } : undefined);
  }

  function patch(next: Partial<NutritionLog>) {
    setNutrition(date, { ...log, ...next });
  }

  return (
    <section className="space-y-4">
      {cutActive && energy.calorieTarget != null && (
        <section className="control-card p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">TODAY</p><p className="tnum mt-1 text-[24px] font-bold text-fg">{energy.calorieTarget}<span className="ml-1 text-[12px] font-medium text-faint">kcal</span></p></div>
            <p className={"tnum text-right text-[14px] font-semibold " + (remaining != null && remaining < 0 ? "text-warn" : "text-accent")}>{remaining == null ? "未记录" : remaining >= 0 ? `余 ${remaining}` : `超 ${Math.abs(remaining)}`}<span className="mt-0.5 block text-[10px] font-normal text-faint">今日目标</span></p>
          </div>
        </section>
      )}

      <section className="control-card p-3.5">
        <div className="flex items-baseline justify-between gap-3"><div><p className="text-[14px] font-semibold text-fg">总热量</p><p className="mt-0.5 text-[11px] text-faint">输入后立即保存。</p></div>{log.calories > 0 && <span className="text-[11px] font-semibold text-accent">已保存</span>}</div>
        {log.calories === 0 && previous && <button type="button" onClick={() => setNutrition(date, previous)} className="choice-chip press mt-3 flex h-10 w-full items-center justify-center border border-border bg-surface-2 text-[12px] font-semibold text-accent">复制上次 · {previous.calories} kcal</button>}
        <label className="mt-3 block"><span className="sr-only">总热量</span><NumberField value={log.calories} onChange={setCalories} placeholder={previous ? String(previous.calories) : "0"} ariaLabel="总热量" allowDecimal={false} className="number-cell tnum h-16 w-full rounded-2xl border border-border-strong bg-surface-2 px-4 text-[31px] font-bold text-fg outline-none focus:border-accent" /></label>
      </section>

      <section className="control-card overflow-hidden">
        <button type="button" onClick={() => setMacrosOpen((value) => !value)} className="press flex w-full items-center justify-between px-3.5 py-3.5 text-left"><div><p className="text-[14px] font-semibold text-fg">宏量营养</p><p className="mt-0.5 text-[11px] text-faint">选填：蛋白、碳水、脂肪。</p></div><span className="text-[18px] text-faint">{macrosOpen ? "−" : "+"}</span></button>
        {macrosOpen && <div className="soft-divider animate-slidedown grid grid-cols-3 gap-2 border-t px-3.5 pb-3.5 pt-3"><Field label="蛋白" value={log.protein} target={energy.macros?.protein} onChange={(protein) => patch({ protein })} /><Field label="碳水" value={log.carbs} target={energy.macros?.carbs} onChange={(carbs) => patch({ carbs })} /><Field label="脂肪" value={log.fat} target={energy.macros?.fat} onChange={(fat) => patch({ fat })} /></div>}
      </section>
    </section>
  );
}

function Field({ label, value, target, onChange }: { label: string; value: number; target?: number; onChange: (value: number) => void }) {
  return <label className="text-center"><span className="text-[10px] font-medium text-faint">{label}</span><NumberField value={value} onChange={onChange} ariaLabel={label} placeholder="0" allowDecimal className="number-cell tnum mt-1 h-11 w-full rounded-xl border border-border bg-surface-2 text-center text-[15px] font-semibold text-fg outline-none focus:border-accent" /><span className="tnum mt-0.5 block text-[9px] text-faint">{target ? `${value} / ${target} g` : "g"}</span></label>;
}
