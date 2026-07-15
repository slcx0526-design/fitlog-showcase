"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { NutritionLog } from "@/lib/types";
import { useStore } from "@/lib/store";
import NumberField from "./NumberField";
import { CutNutritionGuide } from "./CutModeStatus";
import { resolveCutEnergyPlan } from "@/lib/cut";
import { isCutModeActive } from "@/lib/cutMode";
import { haptic, pulseFeedback } from "@/lib/feedback";
import { useToast } from "@/lib/toast";
import { useUIMode } from "@/lib/uiMode";

const EMPTY: NutritionLog = { calories: 0, protein: 0, carbs: 0, fat: 0 };
const MODE_KEY = "fitlog:nutritionMode";

export default function NutritionModule({ date, returnHref }: { date: string; returnHref?: string }) {
  const router = useRouter();
  const toast = useToast();
  const { mode: uiMode } = useUIMode();
  const { getDay, setNutrition, lastNutrition, data } = useStore();
  const log = getDay(date)?.nutrition ?? EMPTY;
  const empty = !(log.calories || log.protein || log.carbs || log.fat);
  const [mode, setMode] = useState<"fast" | "detail">("fast");
  useEffect(() => { try { const saved=localStorage.getItem(MODE_KEY); if (saved === "fast" || saved === "detail") setMode(saved); } catch {} }, []);
  function setView(next: "fast" | "detail") { setMode(next); try { localStorage.setItem(MODE_KEY,next); } catch {} if (uiMode !== "pulse") haptic(8); pulseFeedback("tap"); }
  const prev = lastNutrition(date);
  const cutActive = isCutModeActive(data.cutPlan);
  const energy = useMemo(() => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, date), [data.profile,data.cutPlan,data.days,data.bodyWeights,date]);
  const macroKcal = log.protein * 4 + log.carbs * 4 + log.fat * 9;
  const macrosComplete = log.protein > 0 || log.carbs > 0 || log.fat > 0;
  const mismatch = log.calories > 0 && macrosComplete && Math.abs(log.calories - macroKcal) > 50 && Math.abs(log.calories - macroKcal) / log.calories > 0.1;
  const remaining = energy.calorieTarget != null ? energy.calorieTarget - log.calories : null;
  function setFastCalories(calories: number) { setNutrition(date, calories > 0 ? { calories, protein: 0, carbs: 0, fat: 0 } : undefined); }
  function patch(next: Partial<NutritionLog>) { setNutrition(date, { ...log, ...next }); }
  function copyPrevious() { if (!prev) return; setNutrition(date, prev); if (uiMode !== "pulse") haptic(10); pulseFeedback("confirm"); toast.show("已复制上次饮食记录"); }
  function finish() { if (uiMode !== "pulse") haptic([8, 20, 8]); pulseFeedback("finish"); toast.show("饮食记录已保存"); if (returnHref) router.push(returnHref); }
  return <section className="mt-1">
    <CutNutritionGuide date={date} />
    <div className="control-card p-3.5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[14px] font-semibold text-fg">今日摄入</p><p className="mt-0.5 text-[11px] text-faint">快速模式只记录真实总热量；宏量未记不会被假设为达标。</p></div><div className="control-strip grid grid-cols-2 gap-1 rounded-xl p-0.5">{(["fast","detail"] as const).map((item)=><button type="button" key={item} onClick={()=>setView(item)} aria-pressed={mode===item} className={"choice-chip press min-h-8 px-2.5 py-1.5 text-[12px] font-semibold " + (mode===item ? "bg-surface text-fg shadow-sm" : "text-faint")}>{item === "fast" ? "快速" : "详细"}</button>)}</div></div>
      {cutActive && energy.calorieTarget != null && <div className="control-strip mt-3 flex items-center justify-between rounded-xl px-3 py-2.5"><div><p className="text-[11px] font-semibold text-accent">减脂预算</p><p className="tnum mt-0.5 text-[17px] font-bold text-fg">{energy.calorieTarget} <span className="text-[11px] font-medium text-muted">kcal / 日</span></p></div><p className={"tnum text-[12px] font-semibold " + ((remaining ?? 0) >= 0 ? "text-accent" : "text-warn")}>{remaining == null ? "—" : remaining >= 0 ? `剩 ${Math.round(remaining)}` : `超 ${Math.abs(Math.round(remaining))}`}</p></div>}
      {empty && prev && <button type="button" onClick={copyPrevious} className="choice-chip press mt-3 flex h-10 w-full items-center justify-center border border-border bg-surface-2 text-[12px] font-semibold text-accent">复制上次真实记录 · {prev.calories} kcal</button>}
      {mode === "fast" ? <div className="mt-4"><label><span className="mb-1.5 block text-[11px] font-semibold text-faint">总热量 · kcal</span><NumberField value={log.calories} onChange={setFastCalories} placeholder={prev ? String(prev.calories) : "0"} ariaLabel="总热量" allowDecimal={false} className="number-cell tnum h-16 w-full rounded-2xl border border-border-strong bg-surface-2 px-4 text-[31px] font-bold text-fg outline-none focus:border-accent" /></label><div className="control-strip mt-2 rounded-xl px-3 py-2.5"><p className="text-[11px] font-medium text-muted">{log.calories > 0 ? "已记录总热量；宏量状态：未完整记录。" : "只知道总热量时，用快速模式即可。"}</p><button type="button" onClick={()=>setView("detail")} className="press mt-1 text-[12px] font-semibold text-accent">记录真实 P / C / F →</button></div></div> : <div className="mt-4"><div className="grid grid-cols-4 gap-2"><Field label="热量" unit="kcal" value={log.calories} onChange={(value)=>patch({calories:value})} accent /><Field label="蛋白" unit="g" value={log.protein} onChange={(value)=>patch({protein:value})} /><Field label="碳水" unit="g" value={log.carbs} onChange={(value)=>patch({carbs:value})} /><Field label="脂肪" unit="g" value={log.fat} onChange={(value)=>patch({fat:value})} /></div>{mismatch && <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn">宏量换算约 {Math.round(macroKcal)} kcal，与总热量差异较大。请检查录入；这只是提醒，不会自动改数据。</p>}{cutActive && energy.macros && <div className="mt-3 grid grid-cols-3 gap-2 text-center"><Goal label="蛋白" value={log.protein} target={energy.macros.protein} /><Goal label="脂肪" value={log.fat} target={energy.macros.fat} /><Goal label="碳水" value={log.carbs} target={energy.macros.carbs} /></div>}</div>}
    </div>
    {log.calories > 0 && returnHref && <button type="button" onClick={finish} className="press mt-3 h-12 w-full rounded-2xl bg-fg text-[15px] font-semibold text-bg">完成记录</button>}
  </section>;
}
function Field({label,unit,value,onChange,accent}:{label:string;unit:string;value:number;onChange:(value:number)=>void;accent?:boolean}) { return <label className="flex flex-col items-center"><span className="mb-1 text-[10px] font-medium text-faint">{label}</span><NumberField value={value} onChange={onChange} ariaLabel={label} placeholder="0" allowDecimal className={"number-cell tnum h-12 w-full rounded-xl border bg-surface-2 text-center text-[16px] font-semibold text-fg outline-none focus:border-accent " + (accent?"border-border-strong":"border-border")} /><span className="mt-0.5 text-[9px] text-faint">{unit}</span></label>; }
function Goal({label,value,target}:{label:string;value:number;target:number}) { const done=value >= target; return <div className={"control-strip rounded-xl px-2 py-2 " + (done ? "bg-accent-soft" : "")}><p className="text-[10px] text-faint">{label}</p><p className={"tnum mt-0.5 text-[13px] font-semibold " + (done?"text-accent":"text-fg")}>{value} / {target}</p></div>; }
