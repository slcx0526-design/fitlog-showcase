"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TemplateItem, TrainingType } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { useI18n, type Locale } from "@/lib/i18n";
import { DEFAULT_EXERCISES, typeHasExercises } from "@/lib/exercises";
import { isCutModeActive, primeCutTemplateAllocation } from "@/lib/cutMode";
import { hasSetPerformance, performanceValue, workingSets } from "@/lib/prescription";
import { haptic } from "@/lib/feedback";
import ExerciseCard from "./ExerciseCard";
import AddExercisePanel from "./AddExercisePanel";
import CutTrainingNotice from "./CutTrainingNotice";

const TYPES: TrainingType[] = ["push", "pull", "legs", "rest", "custom"];
const templateType = (type: TrainingType | undefined): type is "push" | "pull" | "legs" => type === "push" || type === "pull" || type === "legs";
const hasEntry = (sets: Parameters<typeof workingSets>[0]) => sets.some(hasSetPerformance);
const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;
function typeName(locale: Locale, type: TrainingType) {
  const names: Record<TrainingType, [string, string, string]> = { push: ["推", "Push", "プッシュ"], pull: ["拉", "Pull", "プル"], legs: ["腿", "Legs", "脚"], rest: ["休息", "Rest", "休息"], custom: ["自定义", "Custom", "カスタム"] };
  const [zh, en, ja] = names[type];
  return tx(locale, zh, en, ja);
}

export default function TrainingModuleStable({ date, suggestedType }: { date: string; suggestedType?: TrainingType | null }) {
  const { getDay, data, setWorkoutType, setWorkoutDone, setWorkoutDifficulty, createTemplate, setTemplateItems, applyTemplate, removeExercise } = useStore();
  const { locale, tr } = useI18n();
  const toast = useToast();
  const workout = getDay(date)?.workout;
  const type = workout?.type;
  const exercises = useMemo(() => workout?.exercises ?? [], [workout?.exercises]);
  const done = workout?.done === true;
  const difficulty = workout?.difficulty ?? "onTarget";
  const [nextType, setNextType] = useState<TrainingType | null>(null);
  const effectiveSets = exercises.reduce((sum, exercise) => sum + workingSets(exercise.sets).length, 0);
  const recordEntries = exercises.some((exercise) => hasEntry(exercise.sets));
  const draftIds = exercises.filter((exercise) => !hasEntry(exercise.sets)).map((exercise) => exercise.id);
  const addedIds = useMemo(() => new Set(exercises.map((exercise) => exercise.id)), [exercises]);
  const lockedIds = useMemo(() => new Set(exercises.filter((exercise) => hasEntry(exercise.sets)).map((exercise) => exercise.id)), [exercises]);
  const plannedSets = exercises.reduce((sum, exercise) => sum + (exercise.planned?.sets ?? 0), 0);
  const setUnit = tx(locale, "组", "sets", "セット");

  function selectType(next: TrainingType) { if (next === type) return; if (recordEntries) { setNextType(next); return; } draftIds.forEach((id) => removeExercise(date, id)); setWorkoutType(date, next); haptic(8); }
  function confirmSwitch() { if (!nextType) return; setWorkoutType(date, nextType); setNextType(null); toast.show(tx(locale, "训练类型已更改；已有记录已保留", "Workout type changed; existing records were kept", "トレーニング種別を変更しました。既存の記録は保持されます")); }
  function saveTemplate() {
    if (!templateType(type)) return;
    const items: TemplateItem[] = exercises.flatMap((exercise) => { const sets = workingSets(exercise.sets); if (!sets.length) return []; const mode = exercise.prescription?.performanceMode ?? "reps"; const values = sets.map((set) => performanceValue(set, mode)).filter((value) => value > 0); const repsLow = values.length ? Math.min(...values) : exercise.planned?.repsLow ?? 8; const repsHigh = values.length ? Math.max(...values) : exercise.planned?.repsHigh ?? 12; return [{ exerciseId: exercise.id, name: exercise.name, sets: sets.length, repsLow, repsHigh: Math.max(repsLow, repsHigh), recordModes: exercise.recordModes, ...(exercise.prescription ? { prescription: exercise.prescription } : {}), ...(exercise.progressionTrackId ? { progressionTrackId: exercise.progressionTrackId } : {}), ...(exercise.progressionTrackLabel ? { progressionTrackLabel: exercise.progressionTrackLabel } : {}), ...(exercise.trainingIntent ? { trainingIntent: exercise.trainingIntent } : {}), ...(exercise.targetRirMin != null ? { targetRirMin: exercise.targetRirMin } : {}), ...(exercise.targetRirMax != null ? { targetRirMax: exercise.targetRirMax } : {}), ...(exercise.loadIncrementKg != null ? { loadIncrementKg: exercise.loadIncrementKg } : {}), ...(exercise.progressionRule ? { progressionRule: exercise.progressionRule } : {}) }]; });
    if (!items.length) return;
    const id = createTemplate(type, `${typeName(locale, type)} ${date}`);
    if (!id) { toast.show(tx(locale, "该类型模板已达上限", "Template limit reached for this type", "この種別のテンプレート数が上限です")); return; }
    setTemplateItems(id, items);
    toast.show(tx(locale, "已用有效工作组保存为模板", "Saved effective work sets as a template", "有効ワーキングセットをテンプレートとして保存しました"));
  }
  function applySelectedTemplate(templateId: string, templateName: string) {
    const template = (data.templates ?? []).find((item) => item.id === templateId);
    if (template && isCutModeActive(data.cutPlan)) {
      const pool = [...DEFAULT_EXERCISES, ...data.customExercises];
      const pendingItems = template.items
        .filter((item) => !lockedIds.has(item.exerciseId))
        .map((item) => ({
          id: item.exerciseId,
          sets: item.sets,
          isMain: pool.find((preset) => preset.id === item.exerciseId)?.isMain,
        }));
      primeCutTemplateAllocation(pendingItems, data.cutPlan?.trainingVolumeScale);
    }
    // Functional store updates are queued in order: unfinished 0×0 drafts leave first,
    // then the template can fully replace the unrecorded session shell.
    draftIds.forEach((id) => removeExercise(date, id));
    const added = applyTemplate(templateId, date);
    toast.show(added ? tx(locale, `已套用 ${templateName || "模板"}`, `Applied ${templateName || "template"}`, `${templateName || "テンプレート"}を適用しました`) : tx(locale, "模板动作已经都在本次训练中", "All template exercises are already in this workout", "テンプレートの種目はすべて今回のトレーニングにあります"));
  }

  const templates = (data.templates ?? []).filter((template) => template.type === type);
  return <section>
    <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{tx(locale, "训练", "Training", "トレーニング")}</h2>
    <CutTrainingNotice />
    {type === undefined && <div className="control-card mb-3 p-3.5"><p className="text-[14px] font-semibold text-fg">{tx(locale, "开始一场训练", "Start a workout", "トレーニングを始める")}</p><p className="mt-0.5 text-[11px] leading-relaxed text-faint">{suggestedType ? tx(locale, `今天计划：${typeName(locale, suggestedType)}。选择后才写入记录。`, `Scheduled today: ${typeName(locale, suggestedType)}. It is saved only after you choose it.`, `今日の予定：${typeName(locale, suggestedType)}。選択後に記録されます。`) : tx(locale, "先选择训练类型，再添加动作或套用模板。", "Choose a workout type, then add exercises or apply a template.", "トレーニング種別を選んでから、種目を追加またはテンプレートを適用します。")}</p>{suggestedType && <button type="button" onClick={() => selectType(suggestedType)} className="press mt-3 h-11 w-full rounded-xl bg-fg text-[14px] font-semibold text-bg">{tx(locale, `开始${typeName(locale, suggestedType)}训练`, `Start ${typeName(locale, suggestedType)}`, `${typeName(locale, suggestedType)}を開始`)}</button>}</div>}
    <div className="control-strip grid grid-cols-5 gap-1 rounded-2xl p-1">{TYPES.map((item) => <button key={item} type="button" onClick={() => selectType(item)} aria-pressed={type === item} className={"choice-chip press border text-[14px] font-semibold " + (type === item ? "border-accent bg-accent text-accent-fg" : "border-transparent text-muted active:bg-surface")}>{typeName(locale, item)}</button>)}</div>
    {nextType && <div className="mt-2 rounded-xl border border-warn/30 bg-warn-soft p-3"><p className="text-[13px] font-semibold text-warn">{tx(locale, `切换到${typeName(locale, nextType)}？`, `Switch to ${typeName(locale, nextType)}?`, `${typeName(locale, nextType)}に切り替えますか？`)}</p><p className="mt-1 text-[11px] text-muted">{tx(locale, "已有输入和已完成组不会删除，但同一场训练最好保持一个类型。", "Existing inputs and completed sets stay, but one workout should normally keep one type.", "入力済み内容と完了セットは残りますが、1回のトレーニングは通常1つの種別に保ちます。")}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setNextType(null)} className="press h-10 rounded-lg border border-border bg-surface text-[13px] font-semibold text-fg">{tx(locale, "取消", "Cancel", "キャンセル")}</button><button type="button" onClick={confirmSwitch} className="press h-10 rounded-lg bg-warn text-[13px] font-semibold text-white">{tx(locale, "确认切换", "Confirm switch", "切り替える")}</button></div></div>}
    {type === "rest" && <div className="control-card mt-3 p-3.5"><p className="text-[14px] font-semibold text-fg">{tx(locale, "今天记录为休息日", "Today is logged as rest", "今日は休息日として記録されます")}</p><p className="mt-1 text-[11px] text-muted">{tx(locale, "无需用训练组数补偿。保持饮食计划，按恢复状态做轻松活动即可。", "Do not compensate with extra sets. Keep nutrition on plan and do light activity based on recovery.", "トレーニングセットで補う必要はありません。食事計画を保ち、回復状態に合わせて軽い活動を行ってください。")}</p></div>}
    {type && type !== "rest" && <div className="mt-3 space-y-2.5">{templates.length > 0 && <div className="flex flex-wrap gap-2">{templates.map((template) => <button key={template.id} type="button" onClick={() => applySelectedTemplate(template.id, template.name)} className="choice-chip press min-w-0 flex-1 rounded-lg border border-accent/30 bg-accent-soft px-2 py-2 text-[12px] font-semibold text-accent"><span className="truncate">{tr(template.name || tx(locale, "未命名模板", "Untitled template", "無題のテンプレート"))}</span></button>)}<Link href="/templates" className="press grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-muted" aria-label={tx(locale, "编辑模板", "Edit templates", "テンプレートを編集")}>✎</Link></div>}{exercises.map((exercise) => <ExerciseCard key={exercise.id} date={date} exercise={exercise} />)}{typeHasExercises(type) && <AddExercisePanel date={date} type={type} addedIds={addedIds} lockedIds={lockedIds} />}{exercises.length > 0 && <div className="control-card px-3.5 py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[13px] font-semibold text-fg">{tx(locale, "本次记录", "Session log", "今回の記録")}</p><p className="mt-0.5 text-[11px] text-faint">{tx(locale, "只统计有效工作组；跳过和空白组不影响完成状态。", "Only effective work sets count; skipped and blank sets do not affect completion.", "有効ワーキングセットのみ集計し、スキップと空欄セットは完了状態に影響しません。")}</p></div><span className="tnum rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted">{effectiveSets}{plannedSets ? ` / ${plannedSets}` : ""} {setUnit}</span></div></div>}{effectiveSets > 0 && <div className="control-card p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-semibold text-fg">{tx(locale, "本次整体感受", "Overall session effort", "今回の全体的な感覚")}</p><p className="mt-0.5 text-[10px] text-faint">{tx(locale, "只影响下次建议，不改动已填数据", "Used only for the next suggestion; your entries stay unchanged", "次回提案にのみ使用し、入力データは変更しません")}</p></div></div><div className="control-strip mt-2 grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label={tx(locale, "本次整体感受", "Overall session effort", "今回の全体的な感覚")}>{(["easy", "onTarget", "hard"] as const).map((value) => <button key={value} type="button" onClick={() => setWorkoutDifficulty(date, value)} aria-pressed={difficulty === value} className={"choice-chip press h-9 text-[12px] font-semibold " + (difficulty === value ? "bg-fg text-bg" : "text-muted")}>{value === "easy" ? tx(locale, "轻松", "Easy", "余裕") : value === "hard" ? tx(locale, "吃力", "Hard", "きつい") : tx(locale, "合适", "On target", "適正")}</button>)}</div></div>}{templateType(type) && effectiveSets > 0 && <button type="button" onClick={saveTemplate} className="press flex h-10 w-full items-center justify-center rounded-xl border border-border bg-surface text-[13px] font-semibold text-accent">{tx(locale, "用本次有效工作组存为模板", "Save effective work sets as template", "有効ワーキングセットをテンプレートに保存")}</button>}{effectiveSets > 0 && (done ? <button type="button" onClick={() => setWorkoutDone(date, false)} className="press flex h-11 w-full items-center justify-center rounded-xl border border-border bg-surface text-[14px] font-semibold text-muted">{tx(locale, `继续训练 · 已完成 ${effectiveSets} 组`, `Resume workout · ${effectiveSets} sets`, `トレーニングを続ける · ${effectiveSets}セット完了`)}</button> : <button type="button" onClick={() => { if (!workout?.difficulty) setWorkoutDifficulty(date, "onTarget"); setWorkoutDone(date, true); haptic([10, 30, 16]); toast.show(tx(locale, "训练已完成", "Workout completed", "トレーニング完了")); }} className="press flex h-12 w-full items-center justify-center rounded-xl bg-fg text-[15px] font-semibold text-bg">{tx(locale, `结束训练 · ${effectiveSets} 个有效工作组`, `Finish workout · ${effectiveSets} effective sets`, `トレーニングを終了 · 有効${effectiveSets}セット`)}</button>)}</div>}
  </section>;
}
