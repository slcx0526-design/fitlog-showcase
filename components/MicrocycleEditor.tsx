"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { currentMicrocycleProgress, ensureMesocycle, microcyclePatternFor, microcycleStepHref } from "@/lib/microcycle";
import type { MicrocycleStep, TrainingType } from "@/lib/types";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { useToday } from "@/lib/hooks";

const TYPE_OPTIONS: Array<{ value: Exclude<TrainingType, "custom">; label: string }> = [
  { value: "push", label: "推" },
  { value: "pull", label: "拉" },
  { value: "legs", label: "腿" },
  { value: "rest", label: "休息" },
];

const DEFAULT_LABELS: Record<Exclude<TrainingType, "custom">, string> = {
  push: "推",
  pull: "拉",
  legs: "腿",
  rest: "休息",
};

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

  function save(next: MicrocycleStep[]) {
    if (!next.length) return;
    setSchedule({ ...data.schedule, microcycle: next.slice(0, 14) });
  }

  function update(index: number, patch: Partial<MicrocycleStep>) {
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
    save(next);
  }

  function add() {
    if (steps.length >= 14) return;
    const lastType = steps.at(-1)?.type;
    const nextType: Exclude<TrainingType, "custom"> = lastType === "push" ? "pull" : lastType === "pull" ? "legs" : lastType === "legs" ? "rest" : "push";
    save([...steps, { id: stepId(), type: nextType, label: DEFAULT_LABELS[nextType] }]);
  }

  function useWeeklySchedule() {
    setSchedule({ split: [...data.schedule.split] });
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
            <button type="button" onClick={() => setMesocycleTargetCycles(mesocycle.targetBuildCycles - 1)} disabled={mesocycle.targetBuildCycles <= Math.max(2, mesocycle.currentBuildCycle)} aria-label={tx(locale, "减少建设周期", "Decrease build cycles", "構築周期を減らす")} className="press grid h-8 w-8 place-items-center text-[16px] text-muted disabled:opacity-20">−</button>
            <span className="tnum w-7 text-center text-[12px] font-semibold text-fg">{mesocycle.targetBuildCycles}</span>
            <button type="button" onClick={() => setMesocycleTargetCycles(mesocycle.targetBuildCycles + 1)} disabled={mesocycle.targetBuildCycles >= 8} aria-label={tx(locale, "增加建设周期", "Increase build cycles", "構築周期を増やす")} className="press grid h-8 w-8 place-items-center text-[16px] text-muted disabled:opacity-20">+</button>
          </div>
        </div>
        <div className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-[11px] text-muted">
          {tx(locale, "下一步：", "Next: ", "次へ：")}<span className="font-semibold text-fg">{progress.next ? tr(progress.next.label) : tx(locale, "本轮已完成", "Cycle complete", "サイクル完了")}</span>
          {progress.next?.templateId && <span className="ml-1 text-faint">· {tr(progress.next.templateSnapshot?.name ?? data.templates?.find((template) => template.id === progress.next?.templateId)?.name ?? "")}</span>}
        </div>

        {progress.next && (!todayWorkout ? <Link href={microcycleStepHref(progress.next)} className="press mb-3 flex h-10 items-center justify-center rounded-lg bg-fg text-[12px] font-semibold text-bg">
          {tx(locale, `开始「${tr(progress.next.label)}」`, `Start “${tr(progress.next.label)}”`, `「${tr(progress.next.label)}」を開始`)}
        </Link> : todayWorkout.done || todayWorkout.type === "rest" ? <div className="mb-3 flex min-h-10 items-center justify-center rounded-lg bg-surface-2 px-3 text-center text-[11px] font-semibold text-muted">
          {tx(locale, `今日训练已完成 · 下一训练日继续「${tr(progress.next.label)}」`, `Today's workout is complete · continue with “${tr(progress.next.label)}” on the next training day`, `今日のトレーニングは完了 · 次回は「${tr(progress.next.label)}」から続行`)}
        </div> : <Link href="/train" className="press mb-3 flex h-10 items-center justify-center rounded-lg bg-fg text-[12px] font-semibold text-bg">
          {tx(locale, "继续今日训练", "Continue today's workout", "今日のトレーニングを続ける")}
        </Link>)}

        <div className="space-y-1.5">
          {steps.map((step, index) => (
            <div key={step.id} className="min-w-0 rounded-lg bg-surface-2 p-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="tnum w-5 shrink-0 text-center text-[11px] text-faint">{index + 1}</span>
                <select
                  value={step.type}
                  onChange={(event) => {
                    const type = event.target.value as Exclude<TrainingType, "custom">;
                    update(index, { type, templateId: undefined, label: step.label === DEFAULT_LABELS[step.type as Exclude<TrainingType, "custom">] ? DEFAULT_LABELS[type] : step.label });
                  }}
                  aria-label={tx(locale, `第 ${index + 1} 步训练类型`, `Step ${index + 1} workout type`, `ステップ ${index + 1} の種別`)}
                  className="h-8 w-[66px] shrink-0 rounded-md border border-border bg-surface px-1.5 text-[12px] text-fg outline-none focus:border-accent"
                >
                  {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{tr(option.label)}</option>)}
                </select>
                <input
                  value={step.label === DEFAULT_LABELS[step.type as Exclude<TrainingType, "custom">] ? tr(step.label) : step.label}
                  onChange={(event) => update(index, { label: event.target.value.slice(0, 24) })}
                  onBlur={() => !step.label.trim() && update(index, { label: DEFAULT_LABELS[step.type as Exclude<TrainingType, "custom">] })}
                  aria-label={tx(locale, `第 ${index + 1} 步名称`, `Step ${index + 1} name`, `ステップ ${index + 1} の名前`)}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-[12px] text-fg outline-none focus:border-accent"
                />
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={tx(locale, `上移第 ${index + 1} 步`, `Move step ${index + 1} up`, `ステップ ${index + 1} を上へ`)} className="press h-8 w-8 shrink-0 rounded-md text-[12px] text-muted disabled:opacity-20">↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label={tx(locale, `下移第 ${index + 1} 步`, `Move step ${index + 1} down`, `ステップ ${index + 1} を下へ`)} className="press h-8 w-8 shrink-0 rounded-md text-[12px] text-muted disabled:opacity-20">↓</button>
                <button type="button" onClick={() => save(steps.filter((_, stepIndex) => stepIndex !== index))} disabled={steps.length === 1} aria-label={tx(locale, `删除第 ${index + 1} 步`, `Delete step ${index + 1}`, `ステップ ${index + 1} を削除`)} className="press h-8 w-8 shrink-0 rounded-md text-[15px] text-faint disabled:opacity-20">×</button>
              </div>
              {step.type !== "rest" && <div className="ml-[26px] mt-1.5">
                <select
                  value={step.templateId ?? ""}
                  onChange={(event) => update(index, { templateId: event.target.value || undefined })}
                  aria-label={tx(locale, `第 ${index + 1} 步训练模板`, `Step ${index + 1} template`, `ステップ ${index + 1} のテンプレート`)}
                  className="h-8 w-full min-w-0 rounded-md border border-border bg-surface px-2 text-[11px] text-muted outline-none focus:border-accent"
                >
                  <option value="">{tx(locale, "不绑定模板，仅按类型完成", "No template binding; match workout type", "テンプレート未指定・種別のみで判定")}</option>
                  {templatesFor(step.type).map((template) => <option key={template.id} value={template.id}>{tr(template.name || tx(locale, "未命名模板", "Untitled template", "無題のテンプレート"))}</option>)}
                </select>
              </div>}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={add} disabled={steps.length >= 14} className="press h-9 rounded-lg bg-fg px-3 text-[12px] font-semibold text-bg disabled:opacity-30">{tx(locale, "添加一步", "Add step", "ステップ追加")}</button>
          <button type="button" onClick={useWeeklySchedule} className="press ml-auto h-9 rounded-lg bg-surface-2 px-3 text-[12px] font-semibold text-muted">{tx(locale, "按每周排程重置", "Reset from weekly schedule", "週間予定からリセット")}</button>
        </div>
      </div>
    </section>
  );
}
