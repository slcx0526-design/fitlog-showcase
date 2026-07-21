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
import { plannedWorkingSets, summarizeExerciseWork, workingSets } from "@/lib/trainingMetrics";
import { createNextSetDraft, formatSetCredit } from "@/lib/trainingExecution";
import NumberField from "./NumberField";
import SetCapacityOptions from "./SetCapacityOptions";
import { haptic, pulseFeedback } from "@/lib/feedback";

const fmt = (value: number) => String(value);
const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

function formatSet(set: SetRecord, mode: PerformanceMode, locale: Locale) {
  if (mode === "duration") return `${fmt(set.durationSeconds ?? 0)} ${tx(locale, "秒", "sec", "秒")}`;
  if (mode === "distance") return `${fmt(set.distanceMeters ?? 0)} m`;
  return set.weight > 0 ? `${fmt(set.weight)}kg × ${set.reps}` : `${set.reps} ${tx(locale, "次", "reps", "回")}`;
}

function summarize(sets: SetRecord[], mode: PerformanceMode, locale: Locale) {
  return sets.map((set) => formatSet(set, mode, locale)).join("  ");
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
  const suggestion = progressionSuggestion(prescription, previous);
  const trend = analyzeTrackTrend(histories.same);
  const performanceMode = prescription.performanceMode ?? performanceModeFor(exercise.recordModes);
  const recordsWeight = performanceMode === "reps" && (exercise.recordModes?.includes("weight") ?? true);
  const currentWorking = workingSets(exercise.sets);
  const workSummary = summarizeExerciseWork(exercise);
  const plannedSets = plannedWorkingSets(exercise);
  const currentLoad = recordsWeight ? currentWorking[currentWorking.length - 1] ?? null : null;
  const carry = currentLoad ?? (recordsWeight && previous ? lastProgressionSet(previous.sets) : null);
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

  function suggestionText() {
    const { targetRepMin, targetRepMax, loadIncrementKg } = prescription;
    const targetUnit = performanceMode === "duration" ? tx(locale, "秒", "sec", "秒") : performanceMode === "distance" ? "m" : tx(locale, "次", "reps", "回");
    const prefix = tx(locale, `目标 ${targetRepMin}–${targetRepMax} ${targetUnit} · `, `Target ${targetRepMin}–${targetRepMax} ${targetUnit} · `, `目標 ${targetRepMin}–${targetRepMax} ${targetUnit} · `);
    const message = suggestion.status === "noHistory" ? tx(locale, "当前轨道暂无记录，先记录本次表现", "No history on this track — log this session first", "このトラックには記録がありません。まず今回を記録してください")
      : suggestion.status === "finishSets" ? tx(locale, "先完成计划工作组，再调整负重", "Finish planned work sets before changing load", "予定のワーキングセットを完了してから負荷を調整します")
      : suggestion.status === "addWeight" ? tx(locale, `下次加 ${loadIncrementKg} kg`, `Add ${loadIncrementKg} kg next time`, `次回は ${loadIncrementKg} kg 増やす`)
      : suggestion.status === "modeReference" ? tx(locale, "保留同轨道历史参考，不自动套用负重", "Same-track history is shown without auto-filling load", "同一トラック履歴のみ表示し、重量は自動入力しません")
      : suggestion.status === "effortCheck" ? tx(locale, "次数已达标，但上次状态不适合直接加重", "Rep target met, but the last session was not ready for a load increase", "回数は達成しましたが、前回の状態ではすぐに増量しません")
      : suggestion.status === "stabilize" ? tx(locale, "先稳定达到目标次数下限", "Reach the bottom of the rep range first", "先に目標回数の下限を安定して達成します")
      : tx(locale, "保持重量，继续补次数", "Keep the load and build reps", "重量を維持して回数を伸ばします");
    return `${prefix}${message}`;
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
      <p className="text-[11px] text-faint">{previous ? tx(locale, `同轨道上次 ${formatCompact(previous.date, locale).md} · ${summarize(previous.sets, performanceMode, locale)}`, `Same track · ${formatCompact(previous.date, locale).md} · ${summarize(previous.sets, performanceMode, locale)}`, `同一トラック 前回 ${formatCompact(previous.date, locale).md} · ${summarize(previous.sets, performanceMode, locale)}`) : tx(locale, "当前轨道首次记录", "First record on this track", "このトラックで初回の記録")}</p>
      <p className="mt-1 text-[10px] text-muted">{suggestionText()}</p>
      {trend.sessionCount >= 2 && <p className="mt-1 text-[10px] text-muted">{tx(locale, "轨道趋势", "Track trend", "トラック傾向")} · {formatTrendMetric(trend.metricKind, trend.latestValue, locale)} · {trend.message}</p>}
      {acceptedWeight != null && <div className="mt-2 flex items-center justify-between rounded-lg bg-accent-soft px-2.5 py-2 text-[11px] text-accent"><span>{tx(locale, "本次计划负重", "Planned load", "今回の予定重量")} · <b>{acceptedWeight}kg</b></span><button type="button" onClick={() => setExercisePlannedLoad(date, exercise.id)} className="press font-semibold">{tx(locale, "清除", "Clear", "解除")}</button></div>}
      {currentWorking.length === 0 && suggestion.nextWeight != null && suggestion.nextWeight > 0 && acceptedWeight !== suggestion.nextWeight && <button type="button" onClick={acceptSuggestion} className="press mt-2 flex h-9 w-full items-center justify-center rounded-lg border border-accent/30 bg-accent-soft text-[11px] font-semibold text-accent">{tx(locale, `采用建议 · ${suggestion.nextWeight}kg`, `Use suggestion · ${suggestion.nextWeight}kg`, `推奨を採用 · ${suggestion.nextWeight}kg`)}</button>}
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
  return <div><p className="text-[9px] font-semibold uppercase tracking-wide text-faint">{title}</p>{rows.map((row) => <p key={`${title}-${row.date}-${exerciseTrackId(row.exercise)}`} className="tnum mt-1 flex items-start justify-between gap-2 text-[10px] text-muted"><span>{formatCompact(row.date, locale).md}{showTrack ? ` · ${exerciseTrackLabel(row.exercise)}` : ""}</span><span className="shrink-0 text-right">{summarize(row.sets, exercisePrescription(row.exercise).performanceMode ?? performanceModeFor(row.exercise.recordModes), locale)}</span></p>)}</div>;
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
