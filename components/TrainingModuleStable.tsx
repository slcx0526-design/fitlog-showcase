"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { TrainingType } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { useI18n, type Locale } from "@/lib/i18n";
import { typeHasExercises } from "@/lib/exercises";
import { hasSetPerformance, isWorkoutEditingLocked, summarizeWorkoutWork, workingSets } from "@/lib/trainingMetrics";
import { formatSetCredit, summarizeSessionExecution } from "@/lib/trainingExecution";
import { MAX_TEMPLATES_PER_TYPE, templateItemsFromCompletedWork } from "@/lib/templates";
import { useRestTimerControls } from "@/lib/restTimer";
import { haptic } from "@/lib/feedback";
import ExerciseCard from "./ExerciseCard";
import AddExercisePanel from "./AddExercisePanel";
import CutTrainingNotice from "./CutTrainingNotice";

const TYPES: TrainingType[] = ["push", "pull", "legs", "rest", "custom"];
const templateType = (type: TrainingType | undefined): type is "push" | "pull" | "legs" => type === "push" || type === "pull" || type === "legs";
const hasEntry = (sets: Parameters<typeof workingSets>[0]) => sets.some(hasSetPerformance);
const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;
function microcycleIndex(id: string | undefined) {
  const match = id?.match(/^mc_(\d+)_/);
  return match ? Number(match[1]) : undefined;
}
function typeName(locale: Locale, type: TrainingType) {
  const names: Record<TrainingType, [string, string, string]> = { push: ["推", "Push", "プッシュ"], pull: ["拉", "Pull", "プル"], legs: ["腿", "Legs", "脚"], rest: ["休息", "Rest", "休息"], custom: ["自定义", "Custom", "カスタム"] };
  const [zh, en, ja] = names[type];
  return tx(locale, zh, en, ja);
}

export default function TrainingModuleStable({ date, suggestedType }: { date: string; suggestedType?: TrainingType | null }) {
  const { getDay, data, setWorkoutType, setWorkoutDone, setWorkoutDifficulty, createTemplate, applyTemplate } = useStore();
  const { locale, tr } = useI18n();
  const toast = useToast();
  const rest = useRestTimerControls();
  const workout = getDay(date)?.workout;
  const type = workout?.type;
  const exercises = useMemo(() => workout?.exercises ?? [], [workout?.exercises]);
  const editingLocked = isWorkoutEditingLocked(workout);
  const difficulty = workout?.difficulty ?? "onTarget";
  const [nextType, setNextType] = useState<TrainingType | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const activeDateRef = useRef(date);
  const finishConfirmationRef = useRef<HTMLDivElement>(null);
  const execution = useMemo(() => summarizeSessionExecution(workout), [workout]);
  const workSummary = useMemo(() => summarizeWorkoutWork(workout), [workout]);
  const reusableTemplateItems = useMemo(() => templateItemsFromCompletedWork(exercises), [exercises]);
  const effectiveSets = execution.workingSets;
  const completedSets = execution.completionCredits;
  const recordEntries = exercises.some((exercise) => hasEntry(exercise.sets));
  const addedIds = useMemo(() => new Set(exercises.map((exercise) => exercise.id)), [exercises]);
  const lockedIds = useMemo(() => new Set(exercises.filter((exercise) => hasEntry(exercise.sets)).map((exercise) => exercise.id)), [exercises]);
  const plannedSets = execution.plannedSets;
  const setUnit = tx(locale, "组", "sets", "セット");
  const activeCycle = workout?.microcycleId === data.microcycle?.currentId ? data.microcycle : undefined;
  const cyclePhase = workout?.cyclePhase ?? activeCycle?.phase ?? "build";
  const cycleNumber = workout?.mesocycleCycleNumber ?? activeCycle?.mesocycleCycleNumber;
  const cycleIndex = activeCycle?.index ?? microcycleIndex(workout?.microcycleId);
  const suggestedActiveExerciseId = execution.next?.exercise.id
    ?? exercises.find((exercise) => !hasEntry(exercise.sets))?.id
    ?? exercises[0]?.id;
  const exerciseIdentity = exercises.map((exercise) => exercise.id).join("\u0000");
  const resolvedActiveExerciseId = activeExerciseId && exercises.some((exercise) => exercise.id === activeExerciseId)
    ? activeExerciseId
    : suggestedActiveExerciseId ?? null;

  useEffect(() => {
    const exerciseIds = new Set(exerciseIdentity ? exerciseIdentity.split("\u0000") : []);
    setActiveExerciseId((current) => {
      if (activeDateRef.current !== date) {
        activeDateRef.current = date;
        return suggestedActiveExerciseId ?? null;
      }
      if (current && exerciseIds.has(current)) return current;
      return suggestedActiveExerciseId ?? null;
    });
  }, [date, exerciseIdentity, suggestedActiveExerciseId]);

  useEffect(() => {
    if (!confirmFinish) return;
    const frame = window.requestAnimationFrame(() => {
      finishConfirmationRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [confirmFinish]);

  function selectType(next: TrainingType) {
    if (next === type) { setTypePickerOpen(false); return; }
    if (next === "rest" && recordEntries) {
      toast.show(tx(locale, "已有训练组，不能改为休息日；删除记录后再切换", "A workout with logged sets cannot become a rest day. Remove the sets first.", "セット記録があるトレーニングは休息日に変更できません。先に記録を削除してください"), { tone: "warning" });
      haptic([12, 28, 12]);
      return;
    }
    if (recordEntries) { setNextType(next); setTypePickerOpen(false); return; }
    if (!setWorkoutType(date, next)) {
      toast.show(tx(locale, "训练类型未能保存，请检查训练状态和浏览器存储", "Workout type could not be saved. Check the session state and browser storage.", "トレーニング種別を保存できませんでした。記録状態とブラウザ容量を確認してください"), { tone: "error" });
      return;
    }
    if (next === "rest") rest.stop(true);
    setTypePickerOpen(false);
    haptic(8);
  }
  function confirmSwitch() {
    if (!nextType) return;
    if (!setWorkoutType(date, nextType)) {
      toast.show(tx(locale, "训练类型未能保存，请检查训练状态和浏览器存储", "Workout type could not be saved. Check the session state and browser storage.", "トレーニング種別を保存できませんでした。記録状態とブラウザ容量を確認してください"), { tone: "error" });
      return;
    }
    if (nextType === "rest") rest.stop();
    setNextType(null);
    setTypePickerOpen(false);
    setConfirmFinish(false);
    toast.show(tx(locale, "训练类型已更改；已有记录已保留", "Workout type changed; existing records were kept", "トレーニング種別を変更しました。既存の記録は保持されます"));
  }
  function finishWorkout() {
    const finishDifficulty = workout?.difficulty ?? (effectiveSets > 0 ? "onTarget" : undefined);
    if (!setWorkoutDone(date, true, finishDifficulty)) {
      toast.show(tx(locale, "训练完成状态未能保存，请检查浏览器存储", "Workout completion could not be saved. Check browser storage.", "トレーニング完了状態を保存できませんでした。ブラウザのストレージを確認してください"), { tone: "error" });
      return;
    }
    rest.stop(true);
    setNextType(null);
    setTypePickerOpen(false);
    setConfirmFinish(false);
    haptic([10, 30, 16]);
    toast.show(tx(locale, "训练已完成", "Workout completed", "トレーニング完了"));
  }
  function saveTemplate() {
    if (!templateType(type) || cyclePhase === "deload") return;
    if (!reusableTemplateItems.length) return;
    if ((data.templates ?? []).filter((template) => template.type === type).length >= MAX_TEMPLATES_PER_TYPE) {
      toast.show(tx(locale, "该类型模板已达上限", "Template limit reached for this type", "この種別のテンプレート数が上限です"), { tone: "warning" });
      return;
    }
    const id = createTemplate(type, `${typeName(locale, type)} ${date}`, reusableTemplateItems);
    if (!id) {
      toast.show(tx(locale, "模板未能保存，请检查浏览器存储", "The template could not be saved. Check browser storage.", "テンプレートを保存できませんでした。ブラウザ容量を確認してください"), { tone: "error" });
      return;
    }
    toast.show(tx(locale, "已用完整工作组保存为模板", "Saved complete work sets as a template", "完了ワーキングセットをテンプレートとして保存しました"));
  }
  function applySelectedTemplate(templateId: string, templateName: string) {
    const added = applyTemplate(templateId, date);
    if (added === null) {
      toast.show(tx(locale, "模板未能套用，请检查训练状态和浏览器存储", "The template could not be applied. Check the session state and browser storage.", "テンプレートを適用できませんでした。記録状態とブラウザ容量を確認してください"), { tone: "error" });
      return;
    }
    const localizedTemplateName = tr(templateName || tx(locale, "模板", "template", "テンプレート"));
    toast.show(
      added
        ? tx(locale, `已套用 ${localizedTemplateName}`, `Applied ${localizedTemplateName}`, `${localizedTemplateName}を適用しました`)
        : tx(locale, "模板动作已经都在本次训练中", "All template exercises are already in this workout", "テンプレートの種目はすべて今回のトレーニングにあります"),
      added ? undefined : { tone: "info" },
    );
  }

  const templates = (data.templates ?? []).filter((template) => template.type === type);
  const applicableTemplates = templates.filter((template) => template.items.length > 0);
  return <section>
    <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{tx(locale, "训练", "Training", "トレーニング")}</h2>
    <CutTrainingNotice />
    {type && type !== "rest" && <div className={"mb-3 rounded-xl border px-3 py-2.5 " + (cyclePhase === "deload" ? "border-warn/30 bg-warn-soft" : "border-border bg-surface") }>
      <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-fg">{cyclePhase === "deload" ? tx(locale, "恢复周期", "Recovery cycle", "回復サイクル") : cycleNumber ? tx(locale, `中周期 · 建设 ${cycleNumber}`, `Mesocycle · Build ${cycleNumber}`, `メゾサイクル・構築 ${cycleNumber}`) : tx(locale, "训练周期记录", "Training-cycle record", "トレーニング周期記録")}</p><span className="tnum text-[10px] text-faint">{cycleIndex ? `MC ${cycleIndex}` : ""}</span></div>
      {cyclePhase === "deload" && <p className="mt-1 text-[10px] leading-relaxed text-muted">{tx(locale, "工作组按恢复快照缩减，本轮不触发加重，也不覆盖正常训练轨道。", "Working sets use a reduced recovery snapshot; this cycle does not trigger load progression or overwrite normal tracks.", "セット数を回復用に縮小し、増量判定や通常トラックへの上書きは行いません。")}</p>}
    </div>}
    {type === undefined && <div className="control-card mb-3 p-3.5"><p className="text-[14px] font-semibold text-fg">{tx(locale, "开始一场训练", "Start a workout", "トレーニングを始める")}</p><p className="mt-0.5 text-[11px] leading-relaxed text-faint">{suggestedType ? tx(locale, `今天计划：${typeName(locale, suggestedType)}。选择后才写入记录。`, `Scheduled today: ${typeName(locale, suggestedType)}. It is saved only after you choose it.`, `今日の予定：${typeName(locale, suggestedType)}。選択後に記録されます。`) : tx(locale, "先选择训练类型，再添加动作或套用模板。", "Choose a workout type, then add exercises or apply a template.", "トレーニング種別を選んでから、種目を追加またはテンプレートを適用します。")}</p>{suggestedType && <button type="button" onClick={() => selectType(suggestedType)} className="press mt-3 h-11 w-full rounded-xl bg-fg text-[14px] font-semibold text-bg">{tx(locale, `开始${typeName(locale, suggestedType)}训练`, `Start ${typeName(locale, suggestedType)}`, `${typeName(locale, suggestedType)}を開始`)}</button>}</div>}
    {type === undefined ? <div className="control-strip grid grid-cols-5 gap-1 rounded-2xl p-1" role="group" aria-label={tx(locale, "选择训练类型", "Choose workout type", "トレーニング種別を選択")} data-workout-type-picker>{TYPES.map((item) => <button key={item} type="button" onClick={() => selectType(item)} aria-pressed={false} className="choice-chip press border border-transparent text-[14px] font-semibold text-muted active:bg-surface">{typeName(locale, item)}</button>)}</div> : <>
      <div className="control-strip flex min-h-11 items-center gap-3 rounded-xl px-3 py-1.5" data-workout-type-control>
        <div className="min-w-0 flex-1"><p className="text-[9px] font-semibold text-faint">{tx(locale, "训练类型", "Workout type", "トレーニング種別")}</p><p className="truncate text-[13px] font-semibold text-fg">{typeName(locale, type)}</p></div>
        {!editingLocked && <button type="button" onClick={() => setTypePickerOpen((value) => !value)} className="choice-chip press min-h-9 shrink-0 border border-border bg-surface px-3 text-[12px] font-semibold text-accent" aria-expanded={typePickerOpen} aria-controls="workout-type-picker">{typePickerOpen ? tx(locale, "收起", "Close", "閉じる") : tx(locale, "更改", "Change", "変更")}</button>}
      </div>
      {!editingLocked && typePickerOpen && <div id="workout-type-picker" className="control-strip mt-2 grid grid-cols-5 gap-1 rounded-xl p-1" role="group" aria-label={tx(locale, "更改训练类型", "Change workout type", "トレーニング種別を変更")} data-workout-type-picker>{TYPES.map((item) => <button key={item} type="button" onClick={() => selectType(item)} aria-pressed={type === item} className={"choice-chip press border text-[14px] font-semibold " + (type === item ? "border-accent bg-accent text-accent-fg" : "border-transparent text-muted active:bg-surface")}>{typeName(locale, item)}</button>)}</div>}
    </>}
    {!editingLocked && nextType && <div className="mt-2 rounded-xl border border-warn/30 bg-warn-soft p-3"><p className="text-[13px] font-semibold text-warn">{tx(locale, `切换到${typeName(locale, nextType)}？`, `Switch to ${typeName(locale, nextType)}?`, `${typeName(locale, nextType)}に切り替えますか？`)}</p><p className="mt-1 text-[11px] text-muted">{tx(locale, "已有输入和已完成组不会删除，但同一场训练最好保持一个类型。", "Existing inputs and completed sets stay, but one workout should normally keep one type.", "入力済み内容と完了セットは残りますが、1回のトレーニングは通常1つの種別に保ちます。")}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setNextType(null)} className="press h-10 rounded-lg border border-border bg-surface text-[13px] font-semibold text-fg">{tx(locale, "取消", "Cancel", "キャンセル")}</button><button type="button" onClick={confirmSwitch} className="press h-10 rounded-lg bg-warn text-[13px] font-semibold text-white">{tx(locale, "确认切换", "Confirm switch", "切り替える")}</button></div></div>}
    {type === "rest" && <div className="control-card mt-3 p-3.5"><p className="text-[14px] font-semibold text-fg">{tx(locale, "今天记录为休息日", "Today is logged as rest", "今日は休息日として記録されます")}</p><p className="mt-1 text-[11px] text-muted">{tx(locale, "无需用训练组数补偿。保持饮食计划，按恢复状态做轻松活动即可。", "Do not compensate with extra sets. Keep nutrition on plan and do light activity based on recovery.", "トレーニングセットで補う必要はありません。食事計画を保ち、回復状態に合わせて軽い活動を行ってください。")}</p></div>}
    {type && type !== "rest" && <div className="mt-3 space-y-2.5">
      {!editingLocked && templates.length > 0 && <div className="flex flex-wrap gap-2">
        {applicableTemplates.map((template) => <button key={template.id} type="button" onClick={() => applySelectedTemplate(template.id, template.name)} className="choice-chip press min-w-0 flex-1 rounded-lg border border-accent/30 bg-accent-soft px-2 py-2 text-[12px] font-semibold text-accent"><span className="truncate">{tr(template.name || tx(locale, "未命名模板", "Untitled template", "無題のテンプレート"))}</span></button>)}
        {applicableTemplates.length > 0
          ? <Link href="/templates" className="press grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface text-muted" aria-label={tx(locale, "编辑模板", "Edit templates", "テンプレートを編集")}>✎</Link>
          : <Link href="/templates" className="choice-chip press flex min-h-10 flex-1 items-center justify-center rounded-lg border border-border bg-surface px-3 text-[12px] font-semibold text-muted" aria-label={tx(locale, "编辑模板", "Edit templates", "テンプレートを編集")}>{tx(locale, "模板为空，先添加动作", "Template is empty; add exercises first", "テンプレートは空です。先に種目を追加")}</Link>}
      </div>}
      {exercises.map((exercise, index) => <ExerciseCard
        key={exercise.id}
        date={date}
        exercise={exercise}
        readOnly={editingLocked}
        active={exercise.id === resolvedActiveExerciseId}
        navigationTarget={navigationTarget === exercise.id}
        onActivate={(exerciseId) => {
          setActiveExerciseId(exerciseId);
          setNavigationTarget((current) => current === exerciseId ? current : null);
        }}
        onNavigate={(exerciseId) => {
          setActiveExerciseId(exerciseId);
          setNavigationTarget(exerciseId);
        }}
        nextExercise={exercise.supersetGroup
          ? exercises.slice(index + 1).find((candidate) => candidate.supersetGroup === exercise.supersetGroup) ?? exercises[index + 1]
          : exercises[index + 1]}
      />)}
      {!editingLocked && typeHasExercises(type) && <AddExercisePanel date={date} type={type} addedIds={addedIds} lockedIds={lockedIds} />}
      {exercises.length > 0 && <div className="control-card px-3.5 py-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[13px] font-semibold text-fg">{tx(locale, "本次记录", "Session log", "今回の記録")}</p><p className="mt-0.5 text-[11px] text-faint">{tx(locale, "完整组按 1，部分完成按 0.5；跳过和空白组不计入。", "Complete sets count as 1 and partial sets as 0.5; skipped and blank sets do not count.", "完了セットは1、部分完了は0.5。スキップと空欄は集計しません。")}</p></div><span className="tnum shrink-0 rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted">{formatSetCredit(completedSets)}{plannedSets ? ` / ${plannedSets}` : ""} {setUnit}</span></div></div>}
      <div id="session-finish" className="scroll-mt-28 space-y-2">
      {effectiveSets > 0 && <div className="control-card p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-semibold text-fg">{tx(locale, "本次整体感受", "Overall session effort", "今回の全体的な感覚")}</p><p className="mt-0.5 text-[10px] text-faint">{tx(locale, "只影响下次建议，不改动已填数据", "Used only for the next suggestion; your entries stay unchanged", "次回提案にのみ使用し、入力データは変更しません")}</p></div>{editingLocked && !workout?.difficulty && <span className="shrink-0 text-[11px] font-semibold text-faint">{tx(locale, "未记录", "Not logged", "未記録")}</span>}</div>{(!editingLocked || workout?.difficulty) && <div className="control-strip mt-2 grid grid-cols-3 gap-1 rounded-xl p-1" role="group" aria-label={tx(locale, "本次整体感受", "Overall session effort", "今回の全体的な感覚")}>{(["easy", "onTarget", "hard"] as const).map((value) => <button key={value} type="button" disabled={editingLocked} onClick={() => setWorkoutDifficulty(date, value)} aria-pressed={difficulty === value} className={"choice-chip press h-9 text-[12px] font-semibold disabled:cursor-default " + (difficulty === value ? "bg-fg text-bg" : "text-muted")}>{value === "easy" ? tx(locale, "轻松", "Easy", "余裕") : value === "hard" ? tx(locale, "吃力", "Hard", "きつい") : tx(locale, "合适", "On target", "適正")}</button>)}</div>}</div>}
      {templateType(type) && cyclePhase !== "deload" && reusableTemplateItems.length > 0 && <button type="button" onClick={saveTemplate} className="press flex h-10 w-full items-center justify-center rounded-xl border border-border bg-surface text-[13px] font-semibold text-accent">{tx(locale, "用本次完整工作组存为模板", "Save completed work sets as template", "完了ワーキングセットをテンプレートに保存")}</button>}
      {editingLocked
        ? <button type="button" onClick={() => { if (setWorkoutDone(date, false)) setConfirmFinish(false); else toast.show(tx(locale, "继续训练状态未能保存，请检查浏览器存储", "Workout resume state could not be saved. Check browser storage.", "トレーニング再開状態を保存できませんでした。ブラウザのストレージを確認してください"), { tone: "error" }); }} className="press flex h-11 w-full items-center justify-center rounded-xl border border-border bg-surface text-[14px] font-semibold text-muted">{completedSets > 0 ? tx(locale, `继续训练 · 已完成 ${formatSetCredit(completedSets)} 组`, `Resume workout · ${formatSetCredit(completedSets)} sets`, `トレーニングを続ける · ${formatSetCredit(completedSets)}セット完了`) : tx(locale, "继续训练记录", "Resume workout log", "トレーニング記録を再開")}</button>
        : recordEntries && (confirmFinish
          ? <div ref={finishConfirmationRef} className="mb-20 scroll-mb-24 rounded-xl border border-warn/40 bg-warn-soft p-3"><p className="text-[13px] font-semibold text-warn">{tx(locale, `计划还差 ${formatSetCredit(execution.remainingSets)} 组，仍然结束？`, `${formatSetCredit(execution.remainingSets)} planned sets remain. Finish anyway?`, `予定まであと ${formatSetCredit(execution.remainingSets)} セットです。終了しますか？`)}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmFinish(false)} className="press h-10 rounded-lg border border-border bg-surface text-[13px] font-semibold text-fg">{tx(locale, "继续记录", "Keep logging", "記録を続ける")}</button><button type="button" onClick={finishWorkout} className="press h-10 rounded-lg bg-warn text-[13px] font-semibold text-white">{tx(locale, "仍然结束", "Finish anyway", "終了する")}</button></div></div>
          : <button type="button" onClick={() => execution.needsFinishConfirmation ? setConfirmFinish(true) : finishWorkout()} className="press flex h-12 w-full items-center justify-center rounded-xl bg-fg text-[15px] font-semibold text-bg">{completedSets > 0 ? tx(locale, `结束训练 · 完成 ${formatSetCredit(completedSets)} 组`, `Finish workout · ${formatSetCredit(completedSets)} sets complete`, `トレーニングを終了 · ${formatSetCredit(completedSets)}セット完了`) : workSummary.rehabSets > 0 ? tx(locale, `结束训练记录 · 康复 ${workSummary.rehabSets} 组`, `Finish workout log · ${workSummary.rehabSets} rehab sets`, `トレーニング記録を終了 · リハビリ${workSummary.rehabSets}セット`) : tx(locale, "结束训练记录", "Finish workout log", "トレーニング記録を終了")}</button>)}
      </div>
    </div>}
  </section>;
}
