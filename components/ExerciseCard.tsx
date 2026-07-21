"use client";

import { useState } from "react";
import type { Exercise, PerformanceMode, SetRecord } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { useUIMode } from "@/lib/uiMode";
import { usePersona } from "@/lib/copy";
import { useI18n, type Locale } from "@/lib/i18n";
import { formatCompact } from "@/lib/date";
import {
  analyzeTrackTrend,
  exercisePrescription,
  exerciseTrackId,
  exerciseTrackLabel,
  findTrackHistories,
  lastProgressionSet,
  performanceModeFor,
  progressionSuggestion,
  type TrackHistoryResult,
} from "@/lib/prescription";
import { progressionPresentation } from "@/lib/progressionPresentation";
import { plannedWorkingSets, summarizeExerciseWork, workingSets } from "@/lib/trainingMetrics";
import { createNextSetDraft, formatSetCredit } from "@/lib/trainingExecution";
import NumberField from "./NumberField";
import SetCapacityOptions from "./SetCapacityOptions";
import { haptic, pulseFeedback } from "@/lib/feedback";

const fmt = (value: number) => String(value);
const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

function formatSet(set: SetRecord, mode: PerformanceMode, locale: Locale) {
  const tags = [
    set.completion === "partial" ? tx(locale, "部分", "Partial", "部分") : "",
    set.technique && set.technique !== "normal" ? techniqueLabel(set.technique, locale) : "",
  ].filter(Boolean);
  const prefix = tags.length ? `${tags.join(" · ")} ` : "";
  if (mode === "duration") return `${prefix}${fmt(set.durationSeconds ?? 0)} ${tx(locale, "秒", "sec", "秒")}`;
  if (mode === "distance") return `${prefix}${fmt(set.distanceMeters ?? 0)} m`;
  return `${prefix}${set.weight > 0 ? `${fmt(set.weight)}kg × ${set.reps}` : `${set.reps} ${tx(locale, "次", "reps", "回")}`}`;
}

function summarize(sets: SetRecord[], mode: PerformanceMode, locale: Locale) {
  return sets.map((set) => formatSet(set, mode, locale)).join(" · ");
}

function techniqueLabel(value: NonNullable<SetRecord["technique"]>, locale: Locale) {
  if (value === "dropSet") return tx(locale, "掉重", "Drop set", "ドロップ");
  if (value === "restPause") return "Rest-pause";
  if (value === "myoReps") return "Myo";
  if (value === "cluster") return tx(locale, "集群", "Cluster", "クラスター");
  if (value === "technique") return tx(locale, "技术", "Technique", "フォーム");
  if (value === "rehab") return tx(locale, "康复", "Rehab", "リハビリ");
  return "";
}

export default function ExerciseCard({ date, exercise }: { date: string; exercise: Exercise }) {
  const { tr, locale } = useI18n();
  const { persona } = usePersona();
  const { mode } = useUIMode();
  const { addSet, updateSet, removeSet, removeExercise, setExercisePlannedLoad, data } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [options, setOptions] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<{ index: number; field: "weight" | "performance" } | null>(null);
  const prescription = exercisePrescription(exercise);
  const trackId = exerciseTrackId(exercise);
  const trackLabel = exerciseTrackLabel(exercise);
  const histories = findTrackHistories(data.days, exercise.id, date, trackId, 6);
  const previous = histories.same[0] ?? null;
  const performanceMode = prescription.performanceMode ?? performanceModeFor(exercise.recordModes);
  const recordsWeight = performanceMode === "reps" && (exercise.recordModes?.includes("weight") ?? true);
  const currentWorking = workingSets(exercise.sets);
  const sessionWorkout = data.days[date]?.workout;
  const currentHistory: TrackHistoryResult | null = currentWorking.length ? {
    date,
    exercise,
    sets: currentWorking,
    kind: "same",
    sessionDifficulty: sessionWorkout?.difficulty,
  } : null;
  const reviewingCompleted = Boolean(currentHistory && sessionWorkout?.done !== false);
  const suggestion = progressionSuggestion(prescription, reviewingCompleted ? currentHistory : previous);
  const suggestionCopy = progressionPresentation(suggestion, prescription, performanceMode, locale);
  const trend = analyzeTrackTrend(reviewingCompleted && currentHistory ? [currentHistory, ...histories.same] : histories.same);
  const workSummary = summarizeExerciseWork(exercise);
  const plannedSets = plannedWorkingSets(exercise);
  const currentLoad = recordsWeight ? currentWorking[currentWorking.length - 1] ?? null : null;
  const carry = currentLoad ?? (recordsWeight && previous && !previous.implicitCompletion ? lastProgressionSet(previous.sets) : null);
  const acceptedWeight = exercise.plannedLoadKg;
  const setUnit = tx(locale, "组", "sets", "セット");
  const repUnit = tx(locale, "次", "reps", "回");

  function patch(index: number, value: Partial<SetRecord>) {
    const current = exercise.sets[index];
    if (current) updateSet(date, exercise.id, index, { ...current, ...value });
  }

  function add(blank = false) {
    const set = createNextSetDraft({
      performanceMode,
      recordsWeight,
      carry,
      plannedLoadKg: acceptedWeight,
      blank,
    });
    const index = exercise.sets.length;
    setPendingFocus({ index, field: recordsWeight && set.weight <= 0 ? "weight" : "performance" });
    addSet(date, exercise.id, set);
    if (set.weight > 0) toast.show(tx(locale, `已带入 ${set.weight}kg，请记录本组实际表现`, `${set.weight}kg carried forward — enter this set's result`, `${set.weight}kg を引き継ぎました。このセットの実績を入力してください`));
    else toast.show(persona.setAdded(mode));
    if (mode === "pulse") pulseFeedback("confirm");
    else haptic(8);
  }

  function addAfterPerformance(index: number, value: number) {
    if (value <= 0 || index !== exercise.sets.length - 1) return;
    const sets = exercise.sets.map((set, currentIndex) => {
      if (currentIndex !== index) return set;
      if (performanceMode === "duration") return { ...set, durationSeconds: value };
      if (performanceMode === "distance") return { ...set, distanceMeters: value };
      return { ...set, reps: value };
    });
    const projected = summarizeExerciseWork({ ...exercise, sets });
    if (plannedSets <= 0 || projected.completionCredits < plannedSets) add();
  }

  function acceptSuggestion() {
    if (suggestion.nextWeight == null || suggestion.nextWeight <= 0) return;
    setExercisePlannedLoad(date, exercise.id, suggestion.nextWeight);
    toast.show(tx(locale, `本次计划负重已设为 ${suggestion.nextWeight}kg`, `Planned load set to ${suggestion.nextWeight}kg`, `今回の予定重量を ${suggestion.nextWeight}kg に設定しました`));
  }

  return <section className="control-card">
    <div className="flex items-center gap-2 px-3.5 py-3">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="press min-w-0 flex-1 text-left">
        <p className="truncate text-[15px] font-semibold text-fg">{tr(exercise.name)}</p>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
          {exercise.isMain && <Chip label={tx(locale, "主项", "Main", "メイン")} accent />}
          <Chip label={tr(trackLabel)} accent />
          <Chip label={tx(locale, `计划 ${plannedSets} 组`, `Plan ${plannedSets} sets`, `予定 ${plannedSets} セット`)} />
          {workSummary.completionCredits > 0 && <span className="tnum text-faint">{formatSetCredit(workSummary.completionCredits)} {setUnit}</span>}
        </div>
      </button>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="press grid h-9 w-9 place-items-center text-faint" aria-label={open ? tx(locale, "收起动作", "Collapse exercise", "種目を折りたたむ") : tx(locale, "展开动作", "Expand exercise", "種目を展開する")}>⌄</button>
      <button type="button" onClick={() => exercise.sets.length ? setConfirmDelete(true) : removeExercise(date, exercise.id)} className="press grid h-9 w-9 place-items-center text-faint hover:text-accent" aria-label={tx(locale, "删除动作", "Delete exercise", "種目を削除")}>×</button>
    </div>

    {confirmDelete && <div className="flex items-center gap-2 border-t border-accent/30 bg-accent-soft px-3.5 py-2.5">
      <p className="flex-1 text-[12px] text-accent">{tx(locale, `删除此动作及其 ${exercise.sets.length} 组记录？`, `Delete this exercise and its ${exercise.sets.length} set records?`, `この種目と ${exercise.sets.length} セットの記録を削除しますか？`)}</p>
      <button type="button" onClick={() => setConfirmDelete(false)} className="press rounded-md border border-border bg-surface px-2 py-1 text-[11px]">{tx(locale, "取消", "Cancel", "キャンセル")}</button>
      <button type="button" onClick={() => removeExercise(date, exercise.id)} className="press rounded-md bg-accent px-2 py-1 text-[11px] text-accent-fg">{tx(locale, "删除", "Delete", "削除")}</button>
    </div>}

    <div className="border-t border-border px-3.5 py-2.5">
      <p className="text-[11px] text-faint">{reviewingCompleted && currentHistory
        ? tx(locale, `本次完成 · ${summarize(currentHistory.sets, performanceMode, locale)}`, `Completed this session · ${summarize(currentHistory.sets, performanceMode, locale)}`, `今回完了・${summarize(currentHistory.sets, performanceMode, locale)}`)
        : previous
          ? previous.implicitCompletion
            ? tx(locale, `同轨道参考 ${formatCompact(previous.date, locale).md} · 未显式结束 · ${summarize(previous.sets, performanceMode, locale)}`, `Same-track reference · ${formatCompact(previous.date, locale).md} · unclosed · ${summarize(previous.sets, performanceMode, locale)}`, `同一トラック参考 ${formatCompact(previous.date, locale).md}・未終了・${summarize(previous.sets, performanceMode, locale)}`)
            : tx(locale, `同轨道上次 ${formatCompact(previous.date, locale).md} · ${summarize(previous.sets, performanceMode, locale)}`, `Same track · ${formatCompact(previous.date, locale).md} · ${summarize(previous.sets, performanceMode, locale)}`, `同一トラック 前回 ${formatCompact(previous.date, locale).md} · ${summarize(previous.sets, performanceMode, locale)}`)
          : tx(locale, "当前轨道首次记录", "First record on this track", "このトラックで初回の記録")}</p>
      <div className="control-strip mt-2 rounded-lg px-2.5 py-2">
        <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-faint">{reviewingCompleted ? tx(locale, "下次建议", "Next-session suggestion", "次回の提案") : tx(locale, "本次建议", "Session suggestion", "今回の提案")}</span><span className={"tnum text-[11px] font-semibold " + (suggestionCopy.tone === "accent" ? "text-accent" : suggestionCopy.tone === "warn" ? "text-warn" : "text-fg")}>{suggestionCopy.value}</span></div>
        <p className="mt-1 text-[10px] leading-relaxed text-muted">{suggestionCopy.summary}</p>
        <p className="mt-1 text-[9px] leading-relaxed text-faint"><span className="font-semibold">{tx(locale, "进步条件", "Progression condition", "進行条件")}</span> · {suggestionCopy.condition}</p>
      </div>
      {trend.sessionCount >= 2 && <p className="mt-1.5 text-[10px] text-muted">{tx(locale, "轨道趋势", "Track trend", "トラック傾向")} · {formatTrendMetric(trend.metricKind, trend.latestValue, locale)} · {trackTrendText(trend.status, locale)}</p>}
      {reviewingCompleted && acceptedWeight != null && <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-2.5 py-2 text-[11px] text-accent"><span>{tx(locale, "本次采用负重", "Accepted load this session", "今回採用した重量")}</span><b className="tnum">{acceptedWeight}kg</b></div>}
      {!reviewingCompleted && recordsWeight && <div className="mt-2 flex items-center gap-2 rounded-lg bg-accent-soft px-2.5 py-2 text-[11px] text-accent">
        <span className="min-w-0 flex-1">{tx(locale, "本次计划负重", "Planned load", "今回の予定重量")}</span>
        <NumberField value={acceptedWeight ?? 0} onChange={(weight) => setExercisePlannedLoad(date, exercise.id, weight)} placeholder="—" ariaLabel={tx(locale, "本次计划负重", "Planned load", "今回の予定重量")} allowDecimal className="number-cell tnum h-8 w-[72px] rounded-lg border border-accent/30 bg-surface px-2 text-center text-[13px] font-semibold text-fg" />
        <span className="shrink-0">kg</span>
        {acceptedWeight != null && <button type="button" onClick={() => setExercisePlannedLoad(date, exercise.id)} className="press shrink-0 font-semibold">{tx(locale, "清除", "Clear", "解除")}</button>}
      </div>}
      {!reviewingCompleted && currentWorking.length === 0 && suggestion.nextWeight != null && suggestion.nextWeight > 0 && acceptedWeight !== suggestion.nextWeight && <button type="button" onClick={acceptSuggestion} className="press mt-2 flex h-9 w-full items-center justify-center rounded-lg border border-accent/30 bg-accent-soft text-[11px] font-semibold text-accent">{suggestion.status === "unconfirmedHistory"
        ? tx(locale, `采用参考 · ${suggestion.nextWeight}kg`, `Use reference · ${suggestion.nextWeight}kg`, `参考を採用 · ${suggestion.nextWeight}kg`)
        : tx(locale, `采用建议 · ${suggestion.nextWeight}kg`, `Use suggestion · ${suggestion.nextWeight}kg`, `推奨を採用 · ${suggestion.nextWeight}kg`)}</button>}
      {(histories.other.length > 0 || histories.legacy.length > 0 || histories.same.length > 1) && <details className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2">
        <summary className="cursor-pointer text-[10px] font-semibold text-muted">{tx(locale, "查看完整轨道历史", "View full track history", "トラック履歴をすべて表示")}</summary>
        <div className="mt-2 space-y-2">
          <HistoryRows title={tx(locale, "同轨道", "Same track", "同一トラック")} rows={histories.same.slice(0, 4)} locale={locale} />
          <HistoryRows title={tx(locale, "其他轨道参考", "Other track reference", "他トラックの参考")} rows={histories.other.slice(0, 3)} locale={locale} showTrack />
          <HistoryRows title={tx(locale, "Legacy 旧记录", "Legacy records", "旧記録")} rows={histories.legacy.slice(0, 3)} locale={locale} />
        </div>
      </details>}
    </div>

    {open && <div className="px-3.5 pb-3 pt-1">
      {exercise.sets.map((set, index) => <div key={set.at ?? `legacy-set-${index}`} className="soft-divider flex flex-wrap items-center gap-2 border-t py-2 first:border-t-0">
        <span className="tnum w-5 text-center text-[12px] text-faint">{index + 1}</span>
        {recordsWeight && <><NumberField value={set.weight} onChange={(weight) => patch(index, { weight })} onEnter={() => setPendingFocus({ index, field: "performance" })} ariaLabel={tx(locale, `第${index + 1}组重量`, `Set ${index + 1} weight`, `セット${index + 1}の重量`)} allowDecimal focusWhenReady={pendingFocus?.index === index && pendingFocus.field === "weight"} enterKeyHint="next" className="number-cell h-10 w-[70px] rounded-lg border border-border bg-surface-2 text-center text-[15px]" /><span className="text-[11px] text-faint">kg ×</span></>}
        {performanceMode === "reps" && <><NumberField value={set.reps} onChange={(reps) => patch(index, { reps })} onEnter={(value) => addAfterPerformance(index, value)} ariaLabel={tx(locale, `第${index + 1}组次数`, `Set ${index + 1} reps`, `セット${index + 1}の回数`)} focusWhenReady={pendingFocus?.index === index && pendingFocus.field === "performance"} enterKeyHint={plannedSets <= 0 || workSummary.completionCredits < plannedSets ? "next" : "done"} className="number-cell h-10 w-[56px] rounded-lg border border-border bg-surface-2 text-center text-[15px]" /><span className="text-[11px] text-faint">{repUnit}</span></>}
        {performanceMode === "duration" && <><NumberField value={set.durationSeconds ?? 0} onChange={(durationSeconds) => patch(index, { durationSeconds })} onEnter={(value) => addAfterPerformance(index, value)} ariaLabel={tx(locale, `第${index + 1}组时长`, `Set ${index + 1} duration`, `セット${index + 1}の時間`)} focusWhenReady={pendingFocus?.index === index && pendingFocus.field === "performance"} enterKeyHint={plannedSets <= 0 || workSummary.completionCredits < plannedSets ? "next" : "done"} className="number-cell h-10 w-[82px] rounded-lg border border-border bg-surface-2 text-center text-[15px]" /><span className="text-[11px] text-faint">{tx(locale, "秒", "sec", "秒")}</span></>}
        {performanceMode === "distance" && <><NumberField value={set.distanceMeters ?? 0} onChange={(distanceMeters) => patch(index, { distanceMeters })} onEnter={(value) => addAfterPerformance(index, value)} ariaLabel={tx(locale, `第${index + 1}组距离`, `Set ${index + 1} distance`, `セット${index + 1}の距離`)} allowDecimal focusWhenReady={pendingFocus?.index === index && pendingFocus.field === "performance"} enterKeyHint={plannedSets <= 0 || workSummary.completionCredits < plannedSets ? "next" : "done"} className="number-cell h-10 w-[82px] rounded-lg border border-border bg-surface-2 text-center text-[15px]" /><span className="text-[11px] text-faint">m</span></>}
        {set.completion === "partial" && <Chip label={tx(locale, "部分", "Partial", "部分")} />}
        {set.completion === "skipped" && <Chip label={tx(locale, "跳过", "Skipped", "スキップ")} />}
        {set.technique && set.technique !== "normal" && <Chip label={set.technique === "rehab" ? tx(locale, "康复", "Rehab", "リハビリ") : set.technique} />}
        <button type="button" onClick={() => setOptions((current) => current === index ? null : index)} aria-expanded={options === index} className="press ml-auto h-9 w-9 text-faint" aria-label={tx(locale, "组设置", "Set options", "セット設定")}>···</button>
        <button type="button" onClick={() => { setOptions(null); removeSet(date, exercise.id, index); }} className="press h-9 w-9 text-faint hover:text-accent" aria-label={tx(locale, "删除组", "Delete set", "セットを削除")}>−</button>
        {options === index && <SetCapacityOptions set={set} onChange={(value) => patch(index, value)} />}
      </div>)}
      <button type="button" onClick={() => add()} className="press mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-border bg-surface-2 text-[13px] font-semibold text-fg">+ {acceptedWeight != null && performanceMode === "reps" ? tx(locale, `下一组 · ${acceptedWeight}kg`, `Next set · ${acceptedWeight}kg`, `次セット · ${acceptedWeight}kg`) : recordsWeight && carry && carry.weight > 0 ? tx(locale, `下一组 · ${carry.weight}kg`, `Next set · ${carry.weight}kg`, `次セット · ${carry.weight}kg`) : tx(locale, "添加下一组", "Add next set", "次のセットを追加")}</button>
      {recordsWeight && (acceptedWeight != null || (carry?.weight ?? 0) > 0) && <button type="button" onClick={() => add(true)} className="press mt-1 h-8 w-full text-[11px] text-muted">{tx(locale, "添加空白组", "Add empty set", "空のセットを追加")}</button>}
    </div>}
  </section>;
}

function HistoryRows({ title, rows, locale, showTrack = false }: { title: string; rows: TrackHistoryResult[]; locale: Locale; showTrack?: boolean }) {
  if (!rows.length) return null;
  return <div><p className="text-[9px] font-semibold uppercase tracking-wide text-faint">{title}</p>{rows.map((row) => <p key={`${title}-${row.date}-${exerciseTrackId(row.exercise)}`} className="tnum mt-1 flex items-start justify-between gap-2 text-[10px] text-muted"><span>{formatCompact(row.date, locale).md}{showTrack ? ` · ${exerciseTrackLabel(row.exercise)}` : ""}{row.implicitCompletion ? ` · ${tx(locale, "未结束", "Unclosed", "未終了")}` : ""}</span><span className="shrink-0 text-right">{summarize(row.sets, exercisePrescription(row.exercise).performanceMode ?? performanceModeFor(row.exercise.recordModes), locale)}</span></p>)}</div>;
}

function Chip({ label, accent = false }: { label: string; accent?: boolean }) {
  return <span className={"rounded px-1.5 py-0.5 text-[10px] " + (accent ? "bg-accent-soft font-semibold text-accent" : "bg-surface-2 text-faint")}>{label}</span>;
}

function formatTrendMetric(kind: "e1rm" | "reps" | "duration" | "distance" | null, value: number | null, locale: Locale) {
  if (value == null) return "—";
  if (kind === "e1rm") return `e1RM ${value}kg`;
  if (kind === "duration") return `${value} ${tx(locale, "秒", "sec", "秒")}`;
  if (kind === "distance") return `${value}m`;
  return `${value} ${tx(locale, "次", "reps", "回")}`;
}

function trackTrendText(status: "insufficient" | "improving" | "stable" | "plateau" | "regressing", locale: Locale) {
  if (status === "improving") return tx(locale, "表现提升", "Improving", "向上");
  if (status === "regressing") return tx(locale, "近期回落，先检查恢复", "Recent decline; check recovery first", "最近低下。まず回復を確認");
  if (status === "plateau") return tx(locale, "近期平台，先补目标表现", "Recent plateau; build the target first", "最近停滞。まず目標を積み上げる");
  if (status === "stable") return tx(locale, "表现稳定", "Stable", "安定");
  return tx(locale, "样本不足", "Low sample", "サンプル不足");
}
