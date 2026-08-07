"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { relativeLabel } from "@/lib/date";
import {
  computeVolumeSummary,
  targetForMuscle,
  volumeAdviceForRow,
  volumeScopeDays,
  volumeScopeLabel,
  volumeTargetScale,
  type MuscleVolumeRow,
  type VolumeAdvice,
  type VolumeScope,
} from "@/lib/volume";
import { MUSCLE_LABELS, type MuscleGroup } from "@/lib/muscles";
import { typeLabel } from "@/lib/exercises";
import { DEFAULT_CUT_VOLUME_SCALE, isCutModeActive } from "@/lib/cutMode";
import { currentMicrocycleProgress } from "@/lib/microcycle";
import { isHistoryEligibleWorkout } from "@/lib/trainingMetrics";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import NumberField from "./NumberField";
import ExerciseTrendReview from "./ExerciseTrendReview";
import ExerciseHistoryArchive from "./ExerciseHistoryArchive";
import TrainingDecisionBrief from "./TrainingDecisionBrief";
import CycleReviewPanel from "./CycleReviewPanel";
import PersonalCalibrationPanel from "./PersonalCalibrationPanel";
import { buildIntegratedCoachAnalysis } from "@/lib/integratedCoach";
import { buildTrainingDecision } from "@/lib/trainingDecision";

const SCOPE_OPTIONS: VolumeScope[] = ["microcycle", "7d", "28d"];
const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
type Tr = (source: string) => string;

function formatMechanical(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}t` : `${value}kg`;
}

function scopeOptionLabel(scope: VolumeScope, locale: Locale) {
  if (scope === "microcycle") return tx(locale, "本周期", "This cycle", "現周期");
  if (scope === "7d") return tx(locale, "近7天", "Last 7 days", "直近7日");
  return tx(locale, "近28天", "Last 28 days", "直近28日");
}

export default function TrainingVolumeReview() {
  const { data, setMuscleTarget, resetMuscleTarget, startNewMicrocycle } = useStore();
  const { locale, tr } = useI18n();
  const today = useToday();
  const [scope, setScope] = useState<VolumeScope>("microcycle");
  const [expandedMuscle, setExpandedMuscle] = useState<MuscleGroup | null>(null);
  const [confirmNewCycle, setConfirmNewCycle] = useState(false);
  const [showAllMuscles, setShowAllMuscles] = useState(false);
  const integrated = useMemo(() => buildIntegratedCoachAnalysis(data, today), [data, today]);
  const decision = useMemo(() => buildTrainingDecision(data, today, "review", integrated), [data, integrated, today]);
  const cutActive = isCutModeActive(data.cutPlan);
  const cutScale = data.cutPlan?.trainingVolumeScale ?? DEFAULT_CUT_VOLUME_SCALE;
  const cycleScale = data.microcycle?.phase === "deload" ? 0.6 : 1;
  const cycleProgress = currentMicrocycleProgress(data, today);
  const cycleComplete = cycleProgress.pattern.length > 0 && cycleProgress.completed >= cycleProgress.pattern.length;
  const volumeDays = volumeScopeDays(data, scope, today);
  const volume = computeVolumeSummary(
    volumeDays,
    data.profile?.trainingLevel,
    data.muscleTargets,
    volumeTargetScale(scope, data) * (cutActive ? cutScale : 1) * (scope === "microcycle" ? cycleScale : 1),
  );
  const scopeLabel = volumeScopeLabel(volumeDays, locale);
  const activeRows = volume.rows.filter((row) => row.rawDirectSets > 0 || row.indirectEffectiveSets > 0 || row.rehabSets > 0);
  const visibleRows = showAllMuscles ? volume.rows : activeRows;
  const recent = Object.entries(data.days)
    .filter(([date, day]) => {
      const workout = day.workout;
      return Boolean(date <= today && workout && (
        isHistoryEligibleWorkout(workout, date, today) ||
        (workout.type === "rest" && workout.done !== false)
      ));
    })
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8);

  return <div className="space-y-4">
    <TrainingDecisionBrief decision={decision} />

    <CycleReviewPanel />

    <section className="grid grid-cols-2 gap-2.5">
      <StatCard label={tx(locale, "直接有效", "Direct effective", "直接有効")} value={String(volume.totalDirectEffectiveSets)} hint={tx(locale, "目标完成度", "Target completion", "目標達成度")} />
      <StatCard label={tx(locale, "抗阻恢复负荷", "Resistance recovery load", "筋トレ回復負荷")} value={String(volume.resistanceRecoveryLoad)} hint={tx(locale, `${volume.totalWorkingSets} 个工作组`, `${volume.totalWorkingSets} working sets`, `${volume.totalWorkingSets} ワーキングセット`)} />
      <StatCard label={tx(locale, "机械总量", "Mechanical volume", "総負荷量")} value={formatMechanical(volume.totalMechanicalVolume)} hint={tx(locale, "重量 × 次数", "Load × reps", "重量 × 回数")} />
      <StatCard label={tx(locale, "有氧恢复压力", "Cardio recovery load", "有酸素回復負荷")} value={volume.cardioMinutes ? tx(locale, `${volume.cardioMinutes} 分`, `${volume.cardioMinutes} min`, `${volume.cardioMinutes} 分`) : "—"} hint={volume.cardioMinutes ? tx(locale, `${volume.cardioStress} 负荷点`, `${volume.cardioStress} load points`, `${volume.cardioStress} 負荷ポイント`) : tx(locale, "不计入肌群组数", "Excluded from muscle sets", "筋群セットには含めない")} />
    </section>

    <section className="control-card p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[min(100%,19rem)] flex-1">
          <p className="text-[14px] font-semibold text-fg">{tx(locale, "肌群容量处方", "Muscle volume prescription", "筋群ボリューム処方")}</p>
          <p className="mt-0.5 text-[11px] text-faint">{tx(locale, "目标只看直接有效组；连带刺激只用于局部恢复判断，不替代直接训练。", "Targets use direct effective sets only. Indirect stimulus informs local recovery and never replaces direct work.", "目標は直接有効セットのみ。間接刺激は局所回復の判断に使い、直接トレーニングの代わりにはしません。")}</p>
          <p className="tnum mt-1 text-[11px] text-muted">{scopeLabel} · {tx(locale, `${volume.trainingDays} 个实际训练日`, `${volume.trainingDays} actual training days`, `実トレーニング ${volume.trainingDays} 日`)}{scope === "28d" ? tx(locale, " · 目标按 4 周累计", " · targets scaled to 4 weeks", " · 目標は4週換算") : data.microcycle?.phase === "deload" && scope === "microcycle" ? tx(locale, " · 恢复目标按 60%", " · recovery target at 60%", " · 回復目標は60%") : ""}</p>
          <p className="mt-1 text-[11px] text-muted">{tx(locale, `本轮 ${cycleProgress.completed}/${cycleProgress.pattern.length} · 下一步`, `Cycle ${cycleProgress.completed}/${cycleProgress.pattern.length} · Next`, `周期 ${cycleProgress.completed}/${cycleProgress.pattern.length} · 次`)} <span className="font-semibold text-fg">{cycleProgress.next ? tr(cycleProgress.next.label) : tx(locale, "新一轮", "New cycle", "新周期")}</span></p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <Link href="/schedule" className="press flex min-h-10 items-center rounded-lg bg-surface-2 px-3 text-[11px] font-semibold text-muted">{tx(locale, "编辑轮次", "Edit cycle", "周期を編集")}</Link>
          <button type="button" onClick={() => setConfirmNewCycle(true)} className="press min-h-10 rounded-lg bg-surface-2 px-3 text-[11px] font-semibold text-accent">{cycleComplete ? tx(locale, "跳过复盘", "Skip review", "レビューをスキップ") : tx(locale, "手动重置", "Manual reset", "手動リセット")}</button>
        </div>
      </div>

      {confirmNewCycle && <div className="mt-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5">
        <p className="text-[12px] font-semibold text-warn">{cycleComplete ? tx(locale, "跳过复盘并开始普通周期？", "Skip review and start a normal cycle?", "レビューを飛ばして通常周期を開始しますか？") : tx(locale, "手动重置当前微周期？", "Reset the current microcycle manually?", "現在のマイクロサイクルを手動でリセットしますか？")}</p>
        <p className="mt-1 text-[10px] leading-relaxed text-muted">{cycleComplete ? tx(locale, "不会应用上方模板调整或恢复周期建议；本轮记录仍完整保留。", "Template changes and recovery-cycle suggestions above will not be applied. This cycle's records remain intact.", "上のテンプレート調整や回復周期の提案は適用されません。現周期の記録は保持されます。") : tx(locale, "本轮已有训练会保留在原周期；未完成周期不会计入已完成建设周期。", "Existing workouts stay in the current cycle. An incomplete cycle will not count as a completed build cycle.", "既存のトレーニングは現在の周期に残り、未完了周期は構築周期の完了数に入りません。")}</p>
        <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmNewCycle(false)} className="press h-10 rounded-lg border border-border bg-surface text-[12px] font-semibold text-fg">{tx(locale, "取消", "Cancel", "キャンセル")}</button><button type="button" onClick={() => { startNewMicrocycle(today); setConfirmNewCycle(false); }} className="press h-10 rounded-lg bg-warn text-[12px] font-semibold text-white">{tx(locale, "确认开始", "Confirm start", "開始を確定")}</button></div>
      </div>}

      {cutActive && <div className="mt-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5">
        <p className="text-[12px] font-semibold text-accent">{tx(locale, `减脂容量目标 · ${Math.round(cutScale * 100)}%`, `Cut volume target · ${Math.round(cutScale * 100)}%`, `減量ボリューム目標 · ${Math.round(cutScale * 100)}%`)}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{tx(locale, "只缩放直接有效组目标；连带刺激、有氧压力和机械总量仍按实际训练记录展示。", "Only direct-effective targets are scaled. Indirect stimulus, cardio load, and mechanical volume remain factual.", "直接有効セット目標だけを調整し、間接刺激・有酸素負荷・総負荷量は実績どおり表示します。")}</p>
      </div>}

      <div className="control-strip mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1">
        {SCOPE_OPTIONS.map((item) => <button key={item} type="button" onClick={() => setScope(item)} className={"choice-chip press h-10 text-[12px] font-semibold " + (scope === item ? "bg-fg text-bg" : "text-muted")} aria-pressed={scope === item}>{scopeOptionLabel(item, locale)}</button>)}
      </div>

      <details className="mt-3 rounded-lg bg-surface-2 px-3 py-1.5">
        <summary className="cursor-pointer list-none text-[11px] font-semibold text-fg">{tx(locale, "容量口径", "Volume methodology", "ボリューム基準")}</summary>
        <p className="soft-divider border-t pb-1 pt-2 text-[10px] leading-relaxed text-muted">{tx(locale, "完整组按 1.0，部分完成按 0.5，跳过组不计入；掉重、Rest-pause、Myo-reps 最多按 1.5。技术组最多按 0.25，康复组只记录暴露，不进入增肌目标。", "Complete sets count as 1.0, partial sets as 0.5, and skipped sets as 0. Drop sets, rest-pause, and myo-reps cap at 1.5. Technique sets cap at 0.25; rehab sets record exposure only.", "完了セットは1.0、部分完了は0.5、スキップは0。ドロップ・レストポーズ・Myo-repsは最大1.5。技術セットは最大0.25、リハビリは曝露のみ記録します。")}</p>
      </details>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-faint">{showAllMuscles ? tx(locale, `全部 ${volume.rows.length} 个肌群`, `All ${volume.rows.length} muscles`, `全 ${volume.rows.length} 筋群`) : activeRows.length ? tx(locale, `${activeRows.length} 个有记录肌群`, `${activeRows.length} muscles logged`, `記録あり ${activeRows.length} 筋群`) : tx(locale, "当前范围暂无肌群记录", "No muscle records in this range", "この範囲に筋群記録はありません")}</p>
        <button type="button" onClick={() => { setShowAllMuscles((current) => !current); setExpandedMuscle(null); }} aria-pressed={showAllMuscles} className="press min-h-10 shrink-0 rounded-lg bg-surface-2 px-3 text-[11px] font-semibold text-accent">{showAllMuscles ? tx(locale, "仅看有记录", "Logged only", "記録ありのみ") : tx(locale, "显示全部", "Show all", "すべて表示")}</button>
      </div>

      <div className="mt-2 space-y-2">
        {visibleRows.length ? visibleRows.map((row) => {
          const max = Math.max(row.target.high, row.directEffectiveSets, 1);
          const progress = Math.min(100, Math.round((row.directEffectiveSets / max) * 100));
          const hasVolume = row.rawDirectSets > 0 || row.indirectEffectiveSets > 0 || row.rehabSets > 0;
          const statusLabel = !hasVolume ? tx(locale, "未记录", "Not logged", "未記録") : row.status === "under" ? tx(locale, "不足", "Low", "不足") : row.status === "over" ? tx(locale, "偏高", "High", "高め") : tx(locale, "合适", "On target", "適正");
          const advice = volumeAdviceForRow(row, scope);
          const baseTarget = targetForMuscle(row.muscle, data.profile?.trainingLevel, data.muscleTargets);
          const normalLow = Math.round((row.target.low / cutScale) * 10) / 10;
          const normalHigh = Math.round((row.target.high / cutScale) * 10) / 10;
          const muscleName = tr(MUSCLE_LABELS[row.muscle]);
          return <div key={row.muscle} className="rounded-lg bg-surface-2 p-2.5">
            <button type="button" onClick={() => setExpandedMuscle((current) => current === row.muscle ? null : row.muscle)} className="press flex min-h-10 w-full items-center justify-between gap-2 text-left" aria-expanded={expandedMuscle === row.muscle}>
              <span className="font-medium text-fg">{muscleName}</span>
              <span className={"tnum rounded-md px-1.5 py-0.5 text-[10px] font-semibold " + (row.status === "in" ? "bg-accent-soft text-accent" : row.status === "over" ? "bg-warn/10 text-warn" : "bg-surface text-faint")}>{statusLabel}</span>
            </button>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-faint">
              <span className="tnum">{tx(locale, `直接有效 ${row.directEffectiveSets} · 连带 ${row.indirectEffectiveSets}`, `Direct effective ${row.directEffectiveSets} · indirect ${row.indirectEffectiveSets}`, `直接有効 ${row.directEffectiveSets} · 間接 ${row.indirectEffectiveSets}`)}</span>
              <span className="tnum">{tx(locale, `目标 ${row.target.low}–${row.target.high}`, `Target ${row.target.low}–${row.target.high}`, `目標 ${row.target.low}–${row.target.high}`)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface"><div className={"h-full rounded-full " + (row.status === "in" ? "bg-accent" : "bg-border-strong")} style={{ width: `${progress}%` }} /></div>
            {expandedMuscle === row.muscle && <div className="mt-2 space-y-2">
              <p className="rounded-lg bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-muted">{localizedAdvice(row, advice, scope, locale, tr)}</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] text-faint"><Metric label={tx(locale, "实际直接工作组", "Direct work sets", "直接ワーキングセット")} value={String(row.rawDirectSets)} /><Metric label={tx(locale, "局部总刺激", "Total local stimulus", "局所総刺激")} value={String(row.stimulusSets)} /><Metric label={tx(locale, "连带有效组", "Indirect effective", "間接有効")} value={String(row.indirectEffectiveSets)} /><Metric label={tx(locale, "康复暴露", "Rehab exposure", "リハビリ曝露")} value={row.rehabSets ? tx(locale, `${row.rehabSets} 组`, `${row.rehabSets} sets`, `${row.rehabSets} セット`) : "—"} /></div>
              <div className="space-y-1.5">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5"><NumberField value={baseTarget.low} onChange={(value) => setMuscleTarget(row.muscle, value, baseTarget.high)} ariaLabel={tx(locale, `${muscleName}每周目标下限`, `${muscleName} weekly target minimum`, `${muscleName} 週間目標下限`)} className="number-cell h-10 min-w-0 rounded-lg border border-border bg-surface px-2 text-center text-[16px] text-fg" /><NumberField value={baseTarget.high} onChange={(value) => setMuscleTarget(row.muscle, baseTarget.low, value)} ariaLabel={tx(locale, `${muscleName}每周目标上限`, `${muscleName} weekly target maximum`, `${muscleName} 週間目標上限`)} className="number-cell h-10 min-w-0 rounded-lg border border-border bg-surface px-2 text-center text-[16px] text-fg" /><span className="self-center text-[11px] text-faint">{tx(locale, "每周目标", "Weekly target", "週間目標")}</span></div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] leading-relaxed text-faint">{cutActive ? tx(locale, `当前范围按减脂比例显示为 ${row.target.low}–${row.target.high}；平时同范围约 ${normalLow}–${normalHigh}。`, `This cut range is ${row.target.low}–${row.target.high}; the same normal range is about ${normalLow}–${normalHigh}.`, `減量中は ${row.target.low}–${row.target.high}、通常時の同範囲は約 ${normalLow}–${normalHigh} です。`) : tx(locale, "基础目标会按本周期、7 天或 28 天范围自动换算。", "The base target scales automatically for this cycle, 7 days, or 28 days.", "基準目標は現周期・7日・28日の範囲に自動換算されます。")}</p>
                  {data.muscleTargets?.[row.muscle] && <button type="button" onClick={() => resetMuscleTarget(row.muscle)} className="press min-h-10 shrink-0 rounded-lg bg-surface px-2 text-[10px] font-semibold text-accent">{tx(locale, "恢复默认", "Reset default", "既定値に戻す")}</button>}
                </div>
              </div>
              <div className="space-y-1">{row.sources.map((source) => <p key={`${row.muscle}-${source.exerciseId}-${source.name}-${source.directEffectiveSets}-${source.indirectEffectiveSets}`} className="tnum flex justify-between gap-2 text-[11px] text-muted"><span className="truncate">{tr(source.name)}{source.directEffectiveSets ? tx(locale, " · 直接", " · direct", " · 直接") : tx(locale, " · 连带", " · indirect", " · 間接")}</span><span className="shrink-0">{tx(locale, `直 ${source.directEffectiveSets} · 连 ${source.indirectEffectiveSets}`, `D ${source.directEffectiveSets} · I ${source.indirectEffectiveSets}`, `直 ${source.directEffectiveSets} · 間 ${source.indirectEffectiveSets}`)}</span></p>)}</div>
            </div>}
          </div>;
        }) : <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center"><p className="text-[12px] text-faint">{tx(locale, "完成有效工作组后，这里会显示实际涉及的肌群。", "Complete effective work sets to see the muscles actually involved.", "有効ワーキングセットを完了すると、実際に関与した筋群が表示されます。")}</p><button type="button" onClick={() => setShowAllMuscles(true)} className="press mt-2 min-h-10 rounded-lg bg-surface-2 px-3 text-[11px] font-semibold text-accent">{tx(locale, "查看并编辑全部目标", "View and edit all targets", "全目標を表示・編集")}</button></div>}
      </div>
    </section>

    <PersonalCalibrationPanel />

    <ExerciseHistoryArchive />

    <ExerciseTrendReview analysis={integrated.training} readinessStatus={integrated.status} />

    <section>
      <div className="mb-2"><h2 className="text-[14px] font-semibold text-fg">{tx(locale, "近期训练", "Recent workouts", "最近のトレーニング")}</h2><p className="mt-0.5 text-[11px] text-faint">{tx(locale, "计划工作组与实际完成分开记录；重量和吨位只用于表现趋势。", "Planned work sets and actual completion stay separate; load and tonnage are used only for performance trends.", "予定ワーキングセットと実績は別に記録し、重量と総負荷量はパフォーマンス推移にのみ使います。")}</p></div>
      {recent.length ? <div className="control-card overflow-hidden">{recent.map(([date, day]) => { const workout = day.workout!; const summary = summarizeSessionExecution(workout); const result = summary.plannedSets ? tx(locale, `${formatSetCredit(summary.planCredits)}/${summary.plannedSets} 组`, `${formatSetCredit(summary.planCredits)}/${summary.plannedSets} sets`, `${formatSetCredit(summary.planCredits)}/${summary.plannedSets} セット`) : tx(locale, `${formatSetCredit(summary.completionCredits)} 组`, `${formatSetCredit(summary.completionCredits)} sets`, `${formatSetCredit(summary.completionCredits)} セット`); const unclosed = workout.done === false && date < today; return <Link key={date} href={`/train?date=${date}`} className="press soft-divider flex min-h-12 items-center gap-3 border-t px-3.5 py-3 first:border-t-0"><span className="w-14 text-[12px] font-medium text-muted">{relativeLabel(date, locale)}</span><span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">{tr(typeLabel(workout.type))}</span><span className="tnum ml-auto min-w-0 truncate text-right text-[12px] text-muted">{workout.type === "rest" ? tx(locale, "休息", "Rest", "休息") : unclosed ? tx(locale, `未结束 · ${result}`, `Unfinished · ${result}`, `未終了 · ${result}`) : result}</span><span className="text-faint">›</span></Link>; })}</div> : <div className="control-card border-dashed px-4 py-7 text-center"><p className="text-[12px] text-faint">{tx(locale, "尚无已完成训练记录。", "No completed workouts yet.", "完了したトレーニングはまだありません。")}</p><Link href="/train" className="press mt-3 inline-flex min-h-10 items-center rounded-lg bg-fg px-3 text-[12px] font-semibold text-bg">{tx(locale, "开始训练", "Start training", "トレーニング開始")}</Link></div>}
    </section>
  </div>;
}

function localizedAdvice(row: MuscleVolumeRow, advice: VolumeAdvice, scope: VolumeScope, locale: Locale, tr: Tr) {
  if (locale === "zh") return advice.detail;
  const scale = scope === "28d" ? 4 : 1;
  const current = Math.round((row.directEffectiveSets / scale) * 100) / 100;
  const low = Math.round((row.target.low / scale) * 100) / 100;
  const high = Math.round((row.target.high / scale) * 100) / 100;
  const basis = scale > 1
    ? tx(locale, `近 ${scale} 周周均 ${current}，周目标 ${low}–${high}`, `${scale}-week average ${current}; weekly target ${low}–${high}`, `${scale}週平均 ${current}、週間目標 ${low}–${high}`)
    : tx(locale, `当前 ${row.directEffectiveSets}，目标 ${row.target.low}–${row.target.high}`, `Current ${row.directEffectiveSets}; target ${row.target.low}–${row.target.high}`, `現在 ${row.directEffectiveSets}、目標 ${row.target.low}–${row.target.high}`);
  const source = advice.primarySource ? tr(advice.primarySource.name) : tx(locale, "直接动作", "direct movement", "直接種目");
  if (!row.directEffectiveSets && !row.indirectEffectiveSets) {
    return tx(locale, `${basis}。没有有效工作组时，系统不会仅凭空白记录要求加量。`, `${basis}. With no effective work sets, the app will not prescribe more volume from an empty record.`, `${basis}。有効ワーキングセットがないため、空白記録だけで増量を提案しません。`);
  }
  if (advice.kind === "add") {
    return tx(locale, `${basis}。下一个对应训练日先增加 ${advice.suggestedDirectSets} 个直接工作组，再观察恢复与表现。`, `${basis}. Add ${advice.suggestedDirectSets} direct work sets on the next relevant session, then reassess recovery and performance.`, `${basis}。次の該当日に直接セットを ${advice.suggestedDirectSets} 追加し、回復とパフォーマンスを再確認します。`);
  }
  if (advice.kind === "reduce") {
    return tx(locale, `${basis}。优先从「${source}」减少 ${advice.suggestedDirectSets} 个工作组；连带刺激不会替代直接目标。`, `${basis}. Remove ${advice.suggestedDirectSets} work sets from “${source}” first; indirect stimulus does not replace the direct target.`, `${basis}。「${source}」から ${advice.suggestedDirectSets} セット減らし、間接刺激は直接目標の代わりにしません。`);
  }
  return tx(locale, `${basis}。维持当前量，优先动作质量、次数进步和恢复。`, `${basis}. Hold the current volume and prioritize movement quality, rep progress, and recovery.`, `${basis}。現在量を維持し、動作品質・回数進歩・回復を優先します。`);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="metric-sheen rounded-2xl border border-border bg-surface p-3 shadow-sm"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</p><p className="tnum mt-2 text-[20px] font-bold text-fg">{value}</p><p className="mt-0.5 text-[10px] text-muted">{hint}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface px-2 py-1.5"><span>{label}</span><span className="tnum ml-1 font-semibold text-fg">{value}</span></div>;
}
