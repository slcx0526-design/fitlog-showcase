"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { relativeLabel } from "@/lib/date";
import { computeVolumeSummary, targetForMuscle, volumeAdviceForRow, volumeScopeDays, volumeScopeLabel, volumeTargetScale, type VolumeScope } from "@/lib/volume";
import { MUSCLE_LABELS, type MuscleGroup } from "@/lib/muscles";
import { typeLabel } from "@/lib/exercises";
import { DEFAULT_CUT_VOLUME_SCALE, isCutModeActive } from "@/lib/cutMode";
import { currentMicrocycleProgress } from "@/lib/microcycle";
import { workingSets } from "@/lib/trainingMetrics";
import NumberField from "./NumberField";
import ExerciseTrendReview from "./ExerciseTrendReview";
import TrainingDecisionBrief from "./TrainingDecisionBrief";

const SCOPE_OPTIONS: Array<{ id: VolumeScope; label: string }> = [
  { id: "microcycle", label: "本周期" },
  { id: "7d", label: "近7天" },
  { id: "28d", label: "近28天" },
];

function formatMechanical(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}t` : `${value}kg`;
}

export default function TrainingVolumeReview() {
  const { data, setMuscleTarget, startNewMicrocycle } = useStore();
  const today = useToday();
  const [scope, setScope] = useState<VolumeScope>("microcycle");
  const [expandedMuscle, setExpandedMuscle] = useState<MuscleGroup | null>(null);
  const [confirmNewCycle, setConfirmNewCycle] = useState(false);
  const [showAllMuscles, setShowAllMuscles] = useState(false);
  const cutActive = isCutModeActive(data.cutPlan);
  const cutScale = data.cutPlan?.trainingVolumeScale ?? DEFAULT_CUT_VOLUME_SCALE;
  const cycleProgress = currentMicrocycleProgress(data, today);
  const volumeDays = volumeScopeDays(data, scope, today);
  const volume = computeVolumeSummary(
    volumeDays,
    data.profile?.trainingLevel,
    data.muscleTargets,
    volumeTargetScale(scope, data) * (cutActive ? cutScale : 1),
  );
  const scopeLabel = volumeScopeLabel(volumeDays);
  const activeRows = volume.rows.filter((row) => row.rawDirectSets > 0 || row.indirectEffectiveSets > 0 || row.rehabSets > 0);
  const visibleRows = showAllMuscles ? volume.rows : activeRows;
  const recent = Object.entries(data.days)
    .filter(([, day]) => {
      const workout = day.workout;
      return !!workout && (workout.type === "rest" || workout.exercises.some((exercise) => workingSets(exercise.sets).length > 0));
    })
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8);

  return <div className="space-y-4">
    <TrainingDecisionBrief />

    <section className="grid grid-cols-2 gap-2.5">
      <StatCard label="直接有效" value={String(volume.totalDirectEffectiveSets)} hint="目标完成度" />
      <StatCard label="抗阻恢复负荷" value={String(volume.resistanceRecoveryLoad)} hint={`${volume.totalWorkingSets} 个工作组`} />
      <StatCard label="机械总量" value={formatMechanical(volume.totalMechanicalVolume)} hint="重量 × 次数" />
      <StatCard label="有氧恢复压力" value={volume.cardioMinutes ? `${volume.cardioMinutes} 分` : "—"} hint={volume.cardioMinutes ? `${volume.cardioStress} 负荷点` : "不计入肌群组数"} />
    </section>

    <section className="control-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-fg">肌群容量处方</p>
          <p className="mt-0.5 text-[11px] text-faint">目标只看直接有效组；连带刺激只用于局部恢复判断，不替代直接训练。</p>
          <p className="tnum mt-1 text-[11px] text-muted">{scopeLabel} · {volume.trainingDays} 个实际训练日{scope === "28d" ? " · 目标按 4 周累计" : ""}</p>
          <p className="mt-1 text-[11px] text-muted">本轮 {cycleProgress.completed}/{cycleProgress.pattern.length} · 下一步 <span className="font-semibold text-fg">{cycleProgress.next?.label ?? "新一轮"}</span></p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Link href="/schedule" className="press rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted">编辑轮次</Link>
          <button type="button" onClick={() => setConfirmNewCycle(true)} className="press rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-accent">新周期</button>
        </div>
      </div>

      {confirmNewCycle && <div className="mt-3 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5">
        <p className="text-[12px] font-semibold text-warn">现在开始新微周期？</p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted">本轮已有训练会保留在原周期；之后新建的训练使用当前编辑好的循环顺序。</p>
        <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmNewCycle(false)} className="press h-9 rounded-lg border border-border bg-surface text-[12px] font-semibold text-fg">取消</button><button type="button" onClick={() => { startNewMicrocycle(today); setConfirmNewCycle(false); }} className="press h-9 rounded-lg bg-warn text-[12px] font-semibold text-white">确认开始</button></div>
      </div>}

      {cutActive && <div className="mt-3 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5">
        <p className="text-[12px] font-semibold text-accent">减脂容量目标 · {Math.round(cutScale * 100)}%</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">只缩放直接有效组目标；连带刺激、有氧压力和机械总量仍按实际训练记录展示。</p>
      </div>}

      <div className="control-strip mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1">
        {SCOPE_OPTIONS.map((item) => <button key={item.id} type="button" onClick={() => setScope(item.id)} className={"choice-chip press h-9 text-[12px] font-semibold " + (scope === item.id ? "bg-fg text-bg" : "text-muted")}>{item.label}</button>)}
      </div>

      <details className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5">
        <summary className="cursor-pointer text-[11px] font-semibold text-fg">容量口径</summary>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">完整组按 1.0，部分完成按 0.5，跳过组不计入；掉重、Rest-pause、Myo-reps 最多按 1.5。技术组最多按 0.25，康复组只记录暴露，不进入增肌目标。</p>
      </details>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-faint">{showAllMuscles ? `全部 ${volume.rows.length} 个肌群` : activeRows.length ? `${activeRows.length} 个有记录肌群` : "当前范围暂无肌群记录"}</p>
        <button type="button" onClick={() => { setShowAllMuscles((current) => !current); setExpandedMuscle(null); }} aria-pressed={showAllMuscles} className="press rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-accent">{showAllMuscles ? "仅看有记录" : "显示全部"}</button>
      </div>

      <div className="mt-2 space-y-2">
        {visibleRows.length ? visibleRows.map((row) => {
          const max = Math.max(row.target.high, row.directEffectiveSets, 1);
          const progress = Math.min(100, Math.round((row.directEffectiveSets / max) * 100));
          const hasVolume = row.rawDirectSets > 0 || row.indirectEffectiveSets > 0 || row.rehabSets > 0;
          const statusLabel = !hasVolume ? "未记录" : row.status === "under" ? "不足" : row.status === "over" ? "偏高" : "合适";
          const advice = volumeAdviceForRow(row, scope);
          const baseTarget = targetForMuscle(row.muscle, data.profile?.trainingLevel, data.muscleTargets);
          const normalLow = Math.round((row.target.low / cutScale) * 10) / 10;
          const normalHigh = Math.round((row.target.high / cutScale) * 10) / 10;
          return <div key={row.muscle} className="rounded-xl bg-surface-2 p-2.5">
            <button type="button" onClick={() => setExpandedMuscle((current) => current === row.muscle ? null : row.muscle)} className="press flex w-full items-center justify-between gap-2 text-left">
              <span className="font-medium text-fg">{MUSCLE_LABELS[row.muscle]}</span>
              <span className={"tnum rounded-md px-1.5 py-0.5 text-[10px] font-semibold " + (row.status === "in" ? "bg-accent-soft text-accent" : row.status === "over" ? "bg-warn/10 text-warn" : "bg-surface text-faint")}>{statusLabel}</span>
            </button>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-faint">
              <span className="tnum">直接有效 {row.directEffectiveSets} · 连带 {row.indirectEffectiveSets}</span>
              <span className="tnum">目标 {row.target.low}–{row.target.high}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface"><div className={"h-full rounded-full " + (row.status === "in" ? "bg-accent" : "bg-border-strong")} style={{ width: `${progress}%` }} /></div>
            {expandedMuscle === row.muscle && <div className="mt-2 space-y-2">
              <p className="rounded-lg bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-muted">{advice.detail}</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-faint"><Metric label="实际直接工作组" value={String(row.rawDirectSets)} /><Metric label="局部总刺激" value={String(row.stimulusSets)} /><Metric label="连带有效组" value={String(row.indirectEffectiveSets)} /><Metric label="康复暴露" value={row.rehabSets ? `${row.rehabSets} 组` : "—"} /></div>
              {cutActive ? <p className="rounded-lg bg-surface px-2.5 py-2 text-[10px] leading-relaxed text-faint">同一范围的平时目标约为 {normalLow}–{normalHigh}；减脂期不直接改基础目标，关闭减脂后会自动恢复。</p> : <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5"><NumberField value={baseTarget.low} onChange={(value) => setMuscleTarget(row.muscle, value, baseTarget.high)} ariaLabel={`${MUSCLE_LABELS[row.muscle]}每周目标下限`} className="number-cell h-9 rounded-lg border border-border bg-surface px-2 text-center text-[13px] text-fg" /><NumberField value={baseTarget.high} onChange={(value) => setMuscleTarget(row.muscle, baseTarget.low, value)} ariaLabel={`${MUSCLE_LABELS[row.muscle]}每周目标上限`} className="number-cell h-9 rounded-lg border border-border bg-surface px-2 text-center text-[13px] text-fg" /><span className="self-center text-[11px] text-faint">每周目标</span></div>}
              <div className="space-y-1">{row.sources.map((source) => <p key={`${row.muscle}-${source.exerciseId}-${source.name}-${source.directEffectiveSets}-${source.indirectEffectiveSets}`} className="tnum flex justify-between gap-2 text-[11px] text-muted"><span className="truncate">{source.name}{source.directEffectiveSets ? " · 直接" : " · 连带"}</span><span className="shrink-0">直 {source.directEffectiveSets} · 连 {source.indirectEffectiveSets}</span></p>)}</div>
            </div>}
          </div>;
        }) : <div className="rounded-xl border border-dashed border-border px-3 py-5 text-center"><p className="text-[12px] text-faint">完成有效工作组后，这里会显示实际涉及的肌群。</p><button type="button" onClick={() => setShowAllMuscles(true)} className="press mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-semibold text-accent">查看并编辑全部目标</button></div>}
      </div>
    </section>

    <ExerciseTrendReview />

    <section>
      <div className="mb-2"><h2 className="text-[14px] font-semibold text-fg">近期训练</h2><p className="mt-0.5 text-[11px] text-faint">计划工作组与实际完成分开记录；重量和吨位只用于表现趋势。</p></div>
      {recent.length ? <div className="control-card overflow-hidden">{recent.map(([date, day]) => { const workout = day.workout!; const sets = workout.exercises.reduce((sum, exercise) => sum + workingSets(exercise.sets).length, 0); return <Link key={date} href={`/train?date=${date}`} className="press soft-divider flex items-center gap-3 border-t px-3.5 py-3 first:border-t-0"><span className="w-12 text-[12px] font-medium text-muted">{relativeLabel(date)}</span><span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">{typeLabel(workout.type)}</span><span className="tnum ml-auto text-[12px] text-muted">{workout.type === "rest" ? "休息" : `${sets} 组`}</span><span className="text-faint">›</span></Link>; })}</div> : <div className="control-card border-dashed px-4 py-7 text-center"><p className="text-[12px] text-faint">尚无训练记录。</p><Link href="/train" className="press mt-3 inline-flex rounded-lg bg-fg px-3 py-2 text-[12px] font-semibold text-bg">开始训练</Link></div>}
    </section>
  </div>;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="metric-sheen rounded-2xl border border-border bg-surface p-3 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</p><p className="tnum mt-2 text-[20px] font-bold text-fg">{value}</p><p className="mt-0.5 text-[10px] text-muted">{hint}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface px-2 py-1.5"><span>{label}</span><span className="tnum ml-1 font-semibold text-fg">{value}</span></div>;
}
