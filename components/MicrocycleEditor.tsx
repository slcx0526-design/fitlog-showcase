"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  currentMicrocycleProgress,
  defaultMicrocycleStepLabel,
  ensureMesocycle,
  isDefaultMicrocycleStepLabel,
  microcyclePatternFor,
  microcycleStepHref,
} from "@/lib/microcycle";
import type { MicrocycleStep, TrainingType } from "@/lib/types";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { useToday } from "@/lib/hooks";
import { isWorkoutSessionClosed } from "@/lib/trainingMetrics";
import InlineConfirm from "@/components/ui/InlineConfirm";

const TYPE_OPTIONS: Array<{ value: Exclude<TrainingType, "custom">; label: string }> = [
  { value: "push", label: "推" },
  { value: "pull", label: "拉" },
  { value: "legs", label: "腿" },
  { value: "rest", label: "休息" },
];

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

function stepId() {
  return `cycle_step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function MicrocycleEditor() {
  const { data, setSchedule, setMesocycleTargetCycles } = useStore();
  const { locale, tr } = useI18n();
  const today = useToday();
  const steps = microcyclePatternFor(data.schedule);
  const progress = currentMicrocycleProgress(data);
  const mesocycle = ensureMesocycle(data, today);
  const phase = data.microcycle?.phase ?? "build";
  const todayWorkout = data.days[today]?.workout;
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [confirmWeeklyReset, setConfirmWeeklyReset] = useState(false);

  function save(next: MicrocycleStep[]) {
    if (!next.length) return;
    setSchedule({ ...data.schedule, microcycle: next.slice(0, 14) });
  }

  function update(index: number, patch: Partial<MicrocycleStep>) {
    setPendingDeleteIndex(null);
    save(steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  function templatesFor(type: TrainingType) {
    return (data.templates ?? []).filter((template) => template.type === type);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setPendingDeleteIndex(null);
    save(next);
  }

  function add() {
    if (steps.length >= 14) return;
    const lastType = steps.at(-1)?.type;
    const nextType: Exclude<TrainingType, "custom"> = lastType === "push" ? "pull" : lastType === "pull" ? "legs" : lastType === "legs" ? "rest" : "push";
    setPendingDeleteIndex(null);
    save([...steps, { id: stepId(), type: nextType, label: defaultMicrocycleStepLabel(nextType) }]);
  }

  function useWeeklySchedule() {
    setSchedule({ split: [...data.schedule.split] });
    setConfirmWeeklyReset(false);
    setPendingDeleteIndex(null);
  }

  function remove(index: number) {
    save(steps.filter((_, stepIndex) => stepIndex !== index));
    setPendingDeleteIndex(null);
  }

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{tx(locale, "训练微周期", "Training microcycle", "トレーニング・マイクロサイクル")}</h2>
          <p className="mt-0.5 text-[11px] text-faint">{tx(locale, "当前轮有记录后即冻结；下方修改用于下一周期", "The active cycle freezes after its first log; edits apply to the next cycle.", "現サイクルは最初の記録後に固定され、編集は次回から反映されます。")}</p>
        </div>
        <span className="tnum shrink-0 text-[11px] text-muted">{progress.completed}/{progress.pattern.length}</span>
      </div>

      <div className="control-card p-3">
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
          <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-fg">{phase === "deload" ? tx(locale, "当前 · 恢复周期", "Current · Recovery cycle", "現在・回復サイクル") : tx(locale, `中周期 ${mesocycle.index} · 建设 ${mesocycle.currentBuildCycle}/${mesocycle.targetBuildCycles}`, `Mesocycle ${mesocycle.index} · Build ${mesocycle.currentBuildCycle}/${mesocycle.targetBuildCycles}`, `メゾサイクル ${mesocycle.index}・構築 ${mesocycle.currentBuildCycle}/${mesocycle.targetBuildCycles}`)}</p><p className="mt-0.5 text-[9px] text-faint">{tx(locale, "建设周期目标", "Build-cycle target", "構築周期の目標")}</p></div>
          <div className="flex shrink-0 items-center rounded-lg border border-border bg-surface p-0.5">
            <button type="button" onClick={() => setMesocycleTargetCycles(mesocycle.targetBuildCycles - 1)} disabled={mesocycle.targetBuildCycles <= Math.max(2, mesocycle.currentBuildCycle)} aria-label={tx(locale, "减少建设周期", "Decrease build cycles", "構築周期を減らす")} className="press grid h-10 w-10 place-items-center text-[17px] text-muted disabled:opacity-20">−</button>
            <span className="tnum w-8 text-center text-[13px] font-semibold text-fg">{mesocycle.targetBuildCycles}</span>
            <button type="button" onClick={() => setMesocycleTargetCycles(mesocycle.targetBuildCycles + 1)} disabled={mesocycle.targetBuildCycles >= 8} aria-label={tx(locale, "增加建设周期", "Increase build cycles", "構築周期を増やす")} className="press grid h-10 w-10 place-items-center text-[17px] text-muted disabled:opacity-20">+</button>
          </div>
        </div>
        <div className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-muted">
          {tx(locale, "下一步：", "Next: ", "次へ：")}<span className="font-semibold text-fg">{progress.next ? tr(progress.next.label) : tx(locale, "本轮已完成", "Cycle complete", "サイクル完了")}</span>
          {progress.next?.templateId && <span className="ml-1 text-faint">· {tr(progress.next.templateSnapshot?.name ?? data.templates?.find((template) => template.id === progress.next?.templateId)?.name ?? "")}</span>}
        </div>

        {progress.next && (!todayWorkout ? <Link href={microcycleStepHref(progress.next)} className="press mb-3 flex h-11 items-center justify-center rounded-lg bg-fg text-[12px] font-semibold text-bg">
          {tx(locale, `开始「${tr(progress.next.label)}」`, `Start “${tr(progress.next.label)}”`, `「${tr(progress.next.label)}」を開始`)}
        </Link> : isWorkoutSessionClosed(todayWorkout) ? <div className="mb-3 flex min-h-11 items-center justify-center rounded-lg bg-surface-2 px-3 text-center text-[11px] font-semibold text-muted">
          {tx(locale, `今日训练已完成 · 下一训练日继续「${tr(progress.next.label)}」`, `Today's workout is complete · continue with “${tr(progress.next.label)}” on the next training day`, `今日のトレーニングは完了 · 次回は「${tr(progress.next.label)}」から続行`)}
        </div> : <Link href="/train" className="press mb-3 flex h-11 items-center justify-center rounded-lg bg-fg text-[12px] font-semibold text-bg">
          {tx(locale, "继续今日训练", "Continue today's workout", "今日のトレーニングを続ける")}
        </Link>)}

        <details className="microcycle-editor-disclosure overflow-hidden rounded-lg border border-border" data-microcycle-editor>
          <summary className="press flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[12px] font-semibold text-fg">
            <span>{tx(locale, "编辑下一周期", "Edit next cycle", "次の周期を編集")}</span>
            <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-faint"><span className="tnum">{steps.length} {tx(locale, "步", "steps", "ステップ")}</span><svg className="microcycle-editor-chevron" aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </summary>
          <div className="soft-divider border-t p-2.5">
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={step.id} className="min-w-0 rounded-lg bg-surface-2 p-2.5">
                  <div className="grid min-w-0 grid-cols-[24px_82px_minmax(0,1fr)] items-center gap-2">
                    <span className="tnum text-center text-[11px] text-faint">{index + 1}</span>
                    <select
                      value={step.type}
                      onChange={(event) => {
                        const type = event.target.value as Exclude<TrainingType, "custom">;
                        const previousType = step.type as Exclude<TrainingType, "custom">;
                        update(index, {
                          type,
                          templateId: undefined,
                          label: isDefaultMicrocycleStepLabel(step.label, previousType)
                            ? defaultMicrocycleStepLabel(type)
                            : step.label,
                        });
                      }}
                      aria-label={tx(locale, `第 ${index + 1} 步训练类型`, `Step ${index + 1} workout type`, `ステップ ${index + 1} の種別`)}
                      className="h-10 w-full rounded-md border border-border bg-surface px-2 text-[16px] text-fg outline-none focus:border-accent sm:text-[13px]"
                    >
                      {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{tr(option.label)}</option>)}
                    </select>
                    <input
                      value={isDefaultMicrocycleStepLabel(step.label, step.type as Exclude<TrainingType, "custom">)
                        ? tr(defaultMicrocycleStepLabel(step.type as Exclude<TrainingType, "custom">))
                        : step.label}
                      onChange={(event) => update(index, { label: event.target.value.slice(0, 24) })}
                      onBlur={() => !step.label.trim() && update(index, { label: defaultMicrocycleStepLabel(step.type as Exclude<TrainingType, "custom">) })}
                      aria-label={tx(locale, `第 ${index + 1} 步名称`, `Step ${index + 1} name`, `ステップ ${index + 1} の名前`)}
                      className="h-10 min-w-0 rounded-md border border-border bg-surface px-2.5 text-[16px] text-fg outline-none focus:border-accent sm:text-[13px]"
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_40px_40px_40px] items-center gap-1.5 pl-8">
                    {step.type !== "rest" ? <select
                      value={step.templateId ?? ""}
                      onChange={(event) => update(index, { templateId: event.target.value || undefined })}
                      aria-label={tx(locale, `第 ${index + 1} 步训练模板`, `Step ${index + 1} template`, `ステップ ${index + 1} のテンプレート`)}
                      className="h-10 w-full min-w-0 rounded-md border border-border bg-surface px-2 text-[16px] text-muted outline-none focus:border-accent sm:text-[12px]"
                    >
                      <option value="">{tx(locale, "不绑定模板，仅按类型完成", "No template binding; match workout type", "テンプレート未指定・種別のみで判定")}</option>
                      {templatesFor(step.type).map((template) => <option key={template.id} value={template.id}>{tr(template.name || tx(locale, "未命名模板", "Untitled template", "無題のテンプレート"))}</option>)}
                    </select> : <span className="truncate px-2 text-[11px] text-faint">{tx(locale, "恢复日无需模板", "No template for rest", "休息日はテンプレート不要")}</span>}
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={tx(locale, `上移第 ${index + 1} 步`, `Move step ${index + 1} up`, `ステップ ${index + 1} を上へ`)} className="press grid h-10 w-10 place-items-center rounded-md bg-surface text-[14px] text-muted disabled:opacity-20">↑</button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label={tx(locale, `下移第 ${index + 1} 步`, `Move step ${index + 1} down`, `ステップ ${index + 1} を下へ`)} className="press grid h-10 w-10 place-items-center rounded-md bg-surface text-[14px] text-muted disabled:opacity-20">↓</button>
                    <button type="button" onClick={() => setPendingDeleteIndex((current) => current === index ? null : index)} disabled={steps.length === 1} aria-label={tx(locale, `删除第 ${index + 1} 步`, `Delete step ${index + 1}`, `ステップ ${index + 1} を削除`)} aria-expanded={pendingDeleteIndex === index} className="press grid h-10 w-10 place-items-center rounded-md bg-surface text-[18px] text-faint disabled:opacity-20">×</button>
                  </div>
                  {pendingDeleteIndex === index && <InlineConfirm
                    className="mt-2 overflow-hidden rounded-md"
                    tone="danger"
                    message={<p className="text-[11px] font-semibold">{tx(locale, `删除「${tr(step.label)}」？`, `Delete “${tr(step.label)}”?`, `「${tr(step.label)}」を削除しますか？`)}</p>}
                    cancelLabel={tx(locale, "取消", "Cancel", "キャンセル")}
                    confirmLabel={tx(locale, "删除", "Delete", "削除")}
                    onCancel={() => setPendingDeleteIndex(null)}
                    onConfirm={() => remove(index)}
                  />}
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
              <button type="button" onClick={add} disabled={steps.length >= 14} className="press h-10 rounded-lg bg-fg px-3 text-[12px] font-semibold text-bg disabled:opacity-30">{tx(locale, "添加一步", "Add step", "ステップ追加")}</button>
              <button type="button" onClick={() => setConfirmWeeklyReset(true)} className="press h-10 min-w-0 rounded-lg bg-surface-2 px-3 text-[12px] font-semibold text-muted">{tx(locale, "按每周排程重置", "Reset from weekly schedule", "週間予定からリセット")}</button>
            </div>
            {confirmWeeklyReset && <InlineConfirm
              className="mt-2 overflow-hidden rounded-md"
              message={<div><p className="text-[11px] font-semibold">{tx(locale, "用每周排程替换下一周期？", "Replace the next cycle with the weekly schedule?", "次の周期を週間予定で置き換えますか？")}</p><p className="mt-0.5 text-[10px] text-muted">{tx(locale, "当前训练记录不会改变。", "Current workout records stay unchanged.", "現在のトレーニング記録は変更されません。")}</p></div>}
              cancelLabel={tx(locale, "取消", "Cancel", "キャンセル")}
              confirmLabel={tx(locale, "确认重置", "Reset", "リセット")}
              onCancel={() => setConfirmWeeklyReset(false)}
              onConfirm={useWeeklySchedule}
            />}
          </div>
        </details>
      </div>
    </section>
  );
}
