"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { buildCutCoachReview } from "@/lib/cutCoach";
import { resolveCutEnergyPlan } from "@/lib/cut";
import { isCutModeActive } from "@/lib/cutMode";
import ActivityBaselineGuide from "./ActivityBaselineGuide";
import CutPlanDetails from "./CutPlanDetails";

type Tab = "control" | "plan";

function kcal(value: number | null) {
  return value == null ? "—" : `${Math.round(value).toLocaleString()} kcal`;
}

function stateTone(state: ReturnType<typeof buildCutCoachReview>["state"]) {
  if (state === "hold") return "bg-accent-soft text-accent";
  if (state === "setup" || state === "collect") return "bg-surface-2 text-muted";
  return "bg-warn-soft text-warn";
}

function stateLabel(state: ReturnType<typeof buildCutCoachReview>["state"]) {
  return { setup: "建立起点", collect: "收集数据", hold: "保持执行", slowDown: "降低速度", speedUp: "小步校准", guardrail: "保护恢复" }[state];
}

export default function CutSystem() {
  const { data, loaded, setCutPlan } = useStore();
  const today = useToday();
  const [tab, setTab] = useState<Tab>("control");
  const active = isCutModeActive(data.cutPlan);
  const review = useMemo(() => buildCutCoachReview(data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, data.waistEntries, today]);
  const energy = useMemo(() => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, today]);
  const todayWeight = data.bodyWeights.some((entry) => entry.date === today);
  const nutrition = data.days[today]?.nutrition;
  const todayCalories = nutrition?.calories ?? 0;
  const proteinTracked = (nutrition?.protein ?? 0) > 0;
  const proteinOnTarget = energy.macros ? (nutrition?.protein ?? 0) >= energy.macros.protein : false;
  const week = review.weeklyBudget;

  if (!loaded) return <div className="space-y-3"><div className="h-24 rounded-2xl bg-surface-2" /><div className="h-56 rounded-2xl bg-surface-2" /></div>;

  return (
    <div>
      <header className="control-card mb-4 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">CUT SYSTEM</p>
            <h1 className="mt-1 text-[24px] font-bold tracking-tight text-fg">减脂控制台</h1>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">饮食决定基础赤字；记录有氧会计入本周减脂速度预测。</p>
          </div>
          <button type="button" onClick={() => setCutPlan({ enabled: !active })} className={"press relative mt-1 h-8 w-14 rounded-full transition-colors " + (active ? "bg-accent" : "border border-border bg-surface-2")} aria-label={active ? "关闭减脂模式" : "开启减脂模式"}><span className={"absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform " + (active ? "translate-x-6" : "translate-x-1")} /></button>
        </div>
        <div className="control-strip mt-3 grid grid-cols-2 gap-1 rounded-2xl p-1">
          <button type="button" onClick={() => setTab("control")} aria-pressed={tab === "control"} className={"choice-chip press h-9 text-[12px] font-semibold " + (tab === "control" ? "bg-fg text-bg" : "text-muted")}>执行控制</button>
          <button type="button" onClick={() => setTab("plan")} aria-pressed={tab === "plan"} className={"choice-chip press h-9 text-[12px] font-semibold " + (tab === "plan" ? "bg-fg text-bg" : "text-muted")}>计划设置</button>
        </div>
      </header>

      {tab === "plan" ? <div className="space-y-4"><ActivityBaselineGuide plan={data.cutPlan} energy={energy} onChange={setCutPlan} /><CutPlanDetails /></div> : (
        <div className="space-y-4">
          {!active ? <section className="control-card p-4"><p className="text-[15px] font-semibold text-fg">减脂模式尚未开启</p><p className="mt-1 text-[12px] leading-relaxed text-muted">先开启模式并补齐起点数据；系统不会用空数据给出赤字或“平台期”结论。</p><button type="button" onClick={() => setCutPlan({ enabled: true })} className="press mt-3 h-11 w-full rounded-xl bg-accent text-[13px] font-semibold text-accent-fg">开启减脂系统</button></section> : <>
            <section className="control-card overflow-hidden p-3.5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">WEEKLY DECISION</p><h2 className="mt-1 text-[17px] font-bold text-fg">{review.title}</h2></div><span className={"shrink-0 rounded-full px-2 py-1 text-[10px] font-bold " + stateTone(review.state)}>{stateLabel(review.state)}</span></div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{review.detail}</p>
              <div className="mt-3 grid grid-cols-3 gap-2"><Fact label="今日预算" value={kcal(review.calorieTarget)} accent /><Fact label="实际趋势" value={review.actualWeeklyLossPct == null ? "采集中" : `${review.actualWeeklyLossPct}% / 周`} /><Fact label="计划速度" value={`${review.plannedWeeklyLossPct}% / 周`} /></div>
              {review.suggestedWeeklyLossPct != null && <button type="button" onClick={() => setCutPlan({ weeklyLossPct: review.suggestedWeeklyLossPct })} className="press mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-fg text-[13px] font-semibold text-bg">{review.actionLabel}</button>}
              {review.suggestedWeeklyLossPct == null && review.state === "collect" && <div className="mt-3 grid grid-cols-3 gap-2"><Link href="/data" className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface-2 text-[12px] font-semibold text-accent">晨重</Link><Link href="/nutrition" className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface-2 text-[12px] font-semibold text-accent">饮食</Link><Link href="/cardio" className="choice-chip press flex h-10 items-center justify-center border border-border bg-surface-2 text-[12px] font-semibold text-accent">有氧</Link></div>}
            </section>

            <section className="control-card p-3.5">
              <div className="flex items-baseline justify-between gap-3"><div><p className="text-[14px] font-semibold text-fg">本周减脂账本</p><p className="mt-0.5 text-[11px] text-faint">饮食偏差和已记录有氧共同决定本周的预测速度。</p></div><span className="tnum text-[11px] text-muted">{week.startDate.slice(5).replace("-", ".")}–{week.endDate.slice(5).replace("-", ".")}</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2"><Fact label="饮食已记" value={week.loggedDays ? `${week.loggedDays} 天 · ${kcal(week.loggedCalories)}` : "待记录"} /><Fact label="饮食相对目标" value={week.balanceToDate == null ? "—" : `${week.balanceToDate >= 0 ? "+" : ""}${week.balanceToDate} kcal`} accent={week.balanceToDate != null && week.balanceToDate >= 0} warn={week.balanceToDate != null && week.balanceToDate < 0} /><Fact label="有氧折算" value={`${week.cardioLoggedNetKcal} kcal`} accent={week.cardioLoggedNetKcal > 0} /><Fact label="有氧相对基线" value={`${week.cardioAdjustmentKcal >= 0 ? "+" : ""}${week.cardioAdjustmentKcal} kcal`} accent={week.cardioAdjustmentKcal > 0} warn={week.cardioAdjustmentKcal < 0} /><Fact label="预计周赤字" value={week.projectedWeeklyDeficit == null ? "—" : `${week.projectedWeeklyDeficit} kcal`} /><Fact label="预计周速度" value={week.projectedWeeklyLossPct == null ? "—" : `${week.projectedWeeklyLossPct}% / 周`} accent /></div>
              <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">已记录有氧不会提高今天可吃热量；它会直接增加或减少本周预计赤字，从而使减脂速度加快或放慢。</p>
            </section>

            <section className="control-card p-3.5"><p className="text-[14px] font-semibold text-fg">今天的最小闭环</p><p className="mt-0.5 text-[11px] text-faint">模型需要摄入、晨重和有氧记录来确认而不是猜测执行速度。</p><div className="mt-3 space-y-2"><ChecklistRow done={todayWeight} title="晨起体重" detail={todayWeight ? "已记录，进入趋势模型" : "起床后、如厕后、进食前记录一次"} href="/data" cta="记录" /><ChecklistRow done={todayCalories > 0} title="真实总热量" detail={todayCalories > 0 ? `已记录 ${todayCalories} kcal` : "快速模式只记总热量也可以"} href="/nutrition" cta="记录" /><ChecklistRow done={proteinOnTarget} title="蛋白保护" detail={proteinTracked ? (proteinOnTarget ? "已达到今天蛋白目标" : "已记录宏量，蛋白仍未达目标") : "未记宏量时不假装达标"} href="/nutrition" cta="查看" /><ChecklistRow done={(data.days[today]?.cardio ?? []).length > 0} title="有氧影响" detail={(data.days[today]?.cardio ?? []).length > 0 ? "已计入本周减脂速度" : "记录时长和区间后计入本周账本"} href="/cardio" cta="记录" /></div></section>

            <section className="control-card p-3.5"><p className="text-[14px] font-semibold text-fg">模型边界与保护规则</p><div className="mt-3 space-y-2 text-[11px] leading-relaxed text-muted"><p><span className="font-semibold text-fg">速度区间：</span>{review.guardrail.low}–{review.guardrail.high}% 体重 / 周；{review.guardrail.note}</p><p><span className="font-semibold text-fg">校准原则：</span>{review.dataDetail}</p><p><span className="font-semibold text-fg">调整纪律：</span>有氧影响预测速度；连续趋势确认后再调整饮食目标或有氧总量，不按单日体重乱改。</p></div></section>
          </>}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) { return <div className="control-strip rounded-xl px-2.5 py-2 text-center"><p className="text-[10px] text-faint">{label}</p><p className={"tnum mt-1 text-[12px] font-semibold " + (warn ? "text-warn" : accent ? "text-accent" : "text-fg")}>{value}</p></div>; }
function ChecklistRow({ done, title, detail, href, cta }: { done: boolean; title: string; detail: string; href: string; cta: string }) { return <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2.5"><span className={"grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold " + (done ? "bg-accent text-accent-fg" : "border border-border-strong text-faint")}>{done ? "✓" : ""}</span><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold text-fg">{title}</p><p className="mt-0.5 truncate text-[10px] text-faint">{detail}</p></div><Link href={href} className="press shrink-0 rounded-lg bg-surface px-2 py-1.5 text-[11px] font-semibold text-accent">{done ? "查看" : cta}</Link></div>; }
