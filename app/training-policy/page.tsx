"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  acceptAdaptiveLearningSignal,
  deriveAdaptiveLearningSignals,
  dismissAdaptiveLearningSignal,
  type AdaptiveLearningSignal,
} from "@/lib/adaptiveLearning";
import { DEFAULT_EXERCISES } from "@/lib/exercises";
import { useToday } from "@/lib/hooks";
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  type Equipment,
  type MuscleGroup,
} from "@/lib/muscles";
import { buildPlanAdaptation } from "@/lib/planAdaptation";
import { buildScheduleAdaptation, isScheduleProposalCurrent } from "@/lib/scheduleAdaptation";
import { useStore } from "@/lib/store";
import {
  appendTrainingDecision,
  createRollbackSnapshot,
  defaultTrainingPolicy,
  exportTrainingPolicyBackup,
  importTrainingPolicyBackup,
  loadTrainingPolicy,
  mergeTrainingPolicy,
  parseTrainingPolicyText,
  saveTrainingPolicy,
  type AdaptationMode,
  type ExercisePreference,
  type MusclePriority,
  type TrainingGoal,
  type TrainingPolicy,
} from "@/lib/trainingPolicy";
import { useToast } from "@/lib/toast";

const GOALS: Array<{ value: TrainingGoal; label: string; detail: string }> = [
  { value: "hypertrophy", label: "增肌塑形", detail: "容量与动作质量优先" },
  { value: "strength", label: "力量", detail: "主项表现与进阶优先" },
  { value: "fatLossRetention", label: "减脂保肌", detail: "保留强度，控制总疲劳" },
  { value: "generalFitness", label: "综合体能", detail: "力量、容量与可执行性平衡" },
];

const PRIORITIES: Array<{ value: MusclePriority | "default"; label: string }> = [
  { value: "default", label: "默认" },
  { value: "specialize", label: "专项" },
  { value: "grow", label: "增长" },
  { value: "maintain", label: "维持" },
  { value: "deprioritize", label: "降低" },
];

const EXERCISE_PREFERENCES: Array<{ value: ExercisePreference; label: string }> = [
  { value: "neutral", label: "默认" },
  { value: "prefer", label: "偏好" },
  { value: "avoid", label: "避免" },
  { value: "exclude", label: "排除" },
];

const MODES: Array<{ value: AdaptationMode; label: string; detail: string }> = [
  { value: "suggestOnly", label: "仅建议", detail: "只分析，不应用计划变化" },
  { value: "approvalRequired", label: "确认后应用", detail: "结构变化必须确认" },
  { value: "safeAuto", label: "安全自动", detail: "仅自动执行已授权的小范围变化" },
];

const AUTO_PERMISSIONS: Array<{
  key: keyof TrainingPolicy["autoApply"];
  label: string;
  detail: string;
}> = [
  { key: "setChanges", label: "小范围组数", detail: "单个动作每次最多 ±1 组" },
  { key: "repChanges", label: "次数范围", detail: "上下限每次最多变化 2 次" },
  { key: "exerciseReplacement", label: "硬约束换动作", detail: "仅排除、器械不可用或动作模式受限" },
  { key: "scheduleChanges", label: "日程重排", detail: "训练天数变化不超过 2 天" },
];

function updateNumber(
  policy: TrainingPolicy,
  field: "maxSessionMinutes" | "maxExercisesPerSession" | "maxWorkingSetsPerSession",
  value: number,
) {
  return mergeTrainingPolicy(policy, { [field]: value });
}

function revisionKey(templateRevision: string, scheduleRevision: string) {
  return `manual:${templateRevision}:${scheduleRevision}`;
}

export default function TrainingPolicyPage() {
  const { loaded, data, setTemplateItems, setSchedule } = useStore();
  const today = useToday();
  const toast = useToast();
  const [policy, setPolicy] = useState<TrainingPolicy>(() => defaultTrainingPolicy());
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [command, setCommand] = useState("");
  const [recognized, setRecognized] = useState<string[]>([]);
  const [ignoredTemplateIds, setIgnoredTemplateIds] = useState<Set<string>>(new Set());
  const [includeSchedule, setIncludeSchedule] = useState(true);

  useEffect(() => {
    setPolicy(loadTrainingPolicy());
    setPolicyLoaded(true);
  }, []);

  const proposal = useMemo(
    () => buildPlanAdaptation(data, policy, today, "userRequested"),
    [data, policy, today],
  );
  const scheduleProposal = useMemo(
    () => buildScheduleAdaptation(data, policy, today),
    [data, policy, today],
  );
  const learningSignals = useMemo(
    () => deriveAdaptiveLearningSignals(data, policy),
    [data, policy],
  );
  const selectedChanges = useMemo(
    () => proposal.changes.filter((change) => !ignoredTemplateIds.has(change.templateId)),
    [ignoredTemplateIds, proposal.changes],
  );
  const proposalRevision = revisionKey(proposal.sourceRevision, scheduleProposal.sourceRevision);
  const isIgnored = policy.ignoredPlanRevisions.includes(proposalRevision);

  const templateExercises = useMemo(() => {
    const ids = new Set((data.templates ?? []).flatMap((template) => template.items.map((item) => item.exerciseId)));
    const presets = new Map([...DEFAULT_EXERCISES, ...data.customExercises].map((preset) => [preset.id, preset]));
    return [...ids]
      .map((id) => presets.get(id) ?? {
        id,
        name: data.templates?.flatMap((template) => template.items)
          .find((item) => item.exerciseId === id)?.name ?? id,
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [data.customExercises, data.templates]);

  function persist(next: TrainingPolicy, success: string) {
    setPolicy(next);
    toast.show(saveTrainingPolicy(next) ? success : "训练倾向保存失败");
  }

  function parseCommand() {
    const result = parseTrainingPolicyText(command, data, policy);
    setPolicy(result.policy);
    setRecognized(result.recognized.length
      ? result.recognized
      : ["没有识别到可安全结构化的倾向，请使用下方选项设置。"]);
  }

  function save() {
    persist(mergeTrainingPolicy(policy, {}), "训练倾向已保存");
  }

  function applySelected() {
    const applySchedule = includeSchedule && scheduleProposal.changed;
    if (!selectedChanges.length && !applySchedule) {
      toast.show("当前没有选择需要应用的变化");
      return;
    }
    const staleTemplates = selectedChanges.some((change) => {
      const current = data.templates?.find((template) => template.id === change.templateId);
      return !current || JSON.stringify(current.items) !== JSON.stringify(change.previousItems);
    });
    if (staleTemplates || (applySchedule && !isScheduleProposalCurrent(data, policy, today, scheduleProposal))) {
      toast.show("计划已变化，请重新查看当前提案");
      return;
    }

    const templateIds = selectedChanges.map((change) => change.templateId);
    const rollbackSnapshot = createRollbackSnapshot(
      data,
      proposalRevision,
      templateIds,
      applySchedule,
      "撤销最近一次手动确认的计划适配",
    );
    for (const change of selectedChanges) setTemplateItems(change.templateId, change.nextItems);
    if (applySchedule) setSchedule(scheduleProposal.nextSchedule);

    const allTemplateChangesSelected = selectedChanges.length === proposal.changes.length;
    const fullAcceptance = allTemplateChangesSelected && (!scheduleProposal.changed || applySchedule);
    let next = mergeTrainingPolicy(policy, {
      rollbackSnapshot,
      ignoredPlanRevisions: policy.ignoredPlanRevisions.filter((revision) => revision !== proposalRevision),
    });
    next = appendTrainingDecision(next, {
      proposalId: proposalRevision,
      outcome: fullAcceptance ? "accepted" : "partiallyAccepted",
      summary: `应用 ${selectedChanges.length} 个模板${applySchedule ? "并重排每周日程" : ""}`,
      templateIds,
      scheduleApplied: applySchedule,
    });
    persist(next, `已应用 ${selectedChanges.length} 个模板${applySchedule ? "和新日程" : ""}`);
    setIgnoredTemplateIds(new Set());
  }

  function rejectCurrentProposal() {
    let next = mergeTrainingPolicy(policy, {
      ignoredPlanRevisions: [
        ...policy.ignoredPlanRevisions,
        proposalRevision,
        proposal.sourceRevision,
        scheduleProposal.sourceRevision,
      ],
    });
    next = appendTrainingDecision(next, {
      proposalId: proposalRevision,
      outcome: "rejected",
      summary: "拒绝当前训练计划适配提案",
    });
    persist(next, "已拒绝当前提案；相同版本不会自动重复应用");
  }

  function undoLastAdaptation() {
    const snapshot = policy.rollbackSnapshot;
    if (!snapshot) return;
    for (const previous of snapshot.templates) {
      if (data.templates?.some((template) => template.id === previous.templateId)) {
        setTemplateItems(previous.templateId, previous.items);
      }
    }
    if (snapshot.schedule) setSchedule(snapshot.schedule);
    let next = mergeTrainingPolicy(policy, { rollbackSnapshot: undefined });
    next = appendTrainingDecision(next, {
      proposalId: snapshot.proposalId,
      outcome: "undone",
      summary: snapshot.reason,
      templateIds: snapshot.templates.map((template) => template.templateId),
      scheduleApplied: Boolean(snapshot.schedule),
    });
    persist(next, "已恢复调整前的未来计划");
  }

  function acceptLearning(signal: AdaptiveLearningSignal) {
    persist(acceptAdaptiveLearningSignal(policy, signal), "已将行为规律确认成训练倾向");
  }

  function dismissLearning(signal: AdaptiveLearningSignal) {
    persist(dismissAdaptiveLearningSignal(policy, signal), "已忽略该推断，不会再次提示");
  }

  function downloadPolicyBackup() {
    const blob = new Blob([JSON.stringify(exportTrainingPolicyBackup(policy), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fitlog-adaptive-training-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importPolicyFile(file: File | undefined) {
    if (!file) return;
    try {
      const imported = importTrainingPolicyBackup(JSON.parse(await file.text()));
      persist(imported, "训练倾向与学习记录已导入");
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "训练倾向备份无法读取");
    }
  }

  if (!loaded || !policyLoaded) {
    return <div className="space-y-3"><div className="h-20 rounded-2xl bg-surface-2" /><div className="h-56 rounded-2xl bg-surface-2" /></div>;
  }

  return (
    <div className="space-y-4 pb-8">
      <header className="control-card p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">ADAPTIVE PLAN V2</p>
            <h1 className="mt-1 text-[24px] font-bold tracking-tight text-fg">训练倾向与计划适配</h1>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">同时维护动作、容量和每周微周期。历史记录与当前周期冻结快照不会被改写。</p>
          </div>
          <Link href="/schedule" className="choice-chip press shrink-0 border border-border bg-surface-2 px-2.5 py-2 text-[12px] font-semibold text-accent">返回计划</Link>
        </div>
      </header>

      <section className="control-card p-3.5">
        <SectionTitle title="直接描述你的倾向" detail="本地解析高频表达；解析后仍可手动修改。" />
        <textarea
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="例如：肩中束优先，腿维持，每周 5 练，每次最多 70 分钟，不做杠铃深蹲。"
          className="number-cell min-h-24 w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-fg outline-none placeholder:text-faint focus:border-accent"
        />
        <button type="button" onClick={parseCommand} disabled={!command.trim()} className="press mt-2 h-11 w-full rounded-xl bg-fg text-[13px] font-semibold text-bg disabled:opacity-30">解析为结构化倾向</button>
        {recognized.length > 0 && (
          <div className="control-strip mt-2 rounded-xl px-3 py-2.5">
            <p className="text-[11px] font-semibold text-fg">当前理解</p>
            <div className="mt-1.5 space-y-1">{recognized.map((item) => <p key={item} className="text-[11px] leading-relaxed text-muted">✓ {item}</p>)}</div>
          </div>
        )}
      </section>

      <section className="control-card p-3.5">
        <SectionTitle title="训练目标" detail="目标影响容量和频率排序，但不会覆盖硬限制。" />
        <div className="grid grid-cols-2 gap-2">
          {GOALS.map((goal) => (
            <button key={goal.value} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { goal: goal.value }))} aria-pressed={policy.goal === goal.value} className={`choice-chip press border px-3 py-2.5 text-left ${policy.goal === goal.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}>
              <span className={`block text-[13px] font-semibold ${policy.goal === goal.value ? "text-accent" : "text-fg"}`}>{goal.label}</span>
              <span className="mt-0.5 block text-[10px] leading-relaxed text-faint">{goal.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="control-card p-3.5">
        <SectionTitle title="现实限制" detail="日程与模板必须先满足这些硬上限。" />
        <div className="grid grid-cols-3 gap-2">
          <LimitField label="分钟" value={policy.maxSessionMinutes} min={20} max={240} onChange={(value) => setPolicy((current) => updateNumber(current, "maxSessionMinutes", value))} />
          <LimitField label="动作" value={policy.maxExercisesPerSession} min={3} max={15} onChange={(value) => setPolicy((current) => updateNumber(current, "maxExercisesPerSession", value))} />
          <LimitField label="工作组" value={policy.maxWorkingSetsPerSession} min={6} max={50} onChange={(value) => setPolicy((current) => updateNumber(current, "maxWorkingSetsPerSession", value))} />
        </div>
        <p className="mb-1.5 mt-3 text-[11px] font-medium text-faint">每周目标训练天数</p>
        <div className="control-strip grid grid-cols-7 gap-1 rounded-xl p-1">
          {[1, 2, 3, 4, 5, 6, 7].map((days) => (
            <button key={days} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { weeklyTrainingDays: { minimum: Math.max(1, days - 1), target: days, maximum: Math.min(7, days + 1) } }))} aria-pressed={policy.weeklyTrainingDays.target === days} className={`choice-chip press h-9 text-[12px] font-semibold ${policy.weeklyTrainingDays.target === days ? "bg-fg text-bg" : "text-muted"}`}>{days}</button>
          ))}
        </div>
        <p className="mb-1.5 mt-3 text-[11px] font-medium text-faint">当前不可用器械</p>
        <div className="grid grid-cols-2 gap-2">
          {(["free", "machine", "cable", "bodyweight"] as Equipment[]).map((equipment) => {
            const active = policy.unavailableEquipment.includes(equipment);
            return <button key={equipment} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { unavailableEquipment: active ? current.unavailableEquipment.filter((item) => item !== equipment) : [...current.unavailableEquipment, equipment] }))} aria-pressed={active} className={`choice-chip press border px-3 py-2 text-[12px] font-semibold ${active ? "border-warn/60 bg-warn/10 text-warn" : "border-border bg-surface-2 text-muted"}`}>{active ? "不可用 · " : "可用 · "}{EQUIPMENT_LABELS[equipment]}</button>;
          })}
        </div>
      </section>

      <section className="control-card p-3.5">
        <details>
          <summary className="cursor-pointer list-none"><SectionTitle title="肌群优先级" detail="优先级同时影响组数和每周训练频率。" /></summary>
          <div className="mt-3 space-y-2">
            {MUSCLE_ORDER.map((muscle) => <MusclePriorityRow key={muscle} muscle={muscle} value={policy.musclePriorities[muscle]} onChange={(value) => setPolicy((current) => {
              const priorities = { ...current.musclePriorities };
              if (value === "default") delete priorities[muscle];
              else priorities[muscle] = value;
              return mergeTrainingPolicy(current, { musclePriorities: priorities });
            })} />)}
          </div>
        </details>
      </section>

      <section className="control-card p-3.5">
        <details>
          <summary className="cursor-pointer list-none"><SectionTitle title="动作偏好" detail="排除是硬约束；避免只降低候选优先级。" /></summary>
          <div className="mt-3 space-y-2">
            {templateExercises.map((exercise) => (
              <div key={exercise.id} className="control-strip flex items-center gap-2 rounded-xl px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">{exercise.name}</span>
                <select value={policy.exercisePreferences[exercise.id] ?? "neutral"} onChange={(event) => setPolicy((current) => mergeTrainingPolicy(current, { exercisePreferences: { ...current.exercisePreferences, [exercise.id]: event.target.value as ExercisePreference } }))} className="h-9 rounded-lg border border-border bg-surface px-2 text-[12px] font-semibold text-muted outline-none focus:border-accent" aria-label={`${exercise.name}偏好`}>
                  {EXERCISE_PREFERENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="control-card p-3.5">
        <SectionTitle title="从执行行为学习" detail="仅提出候选倾向；未经确认不会永久改变计划。" />
        {learningSignals.length ? (
          <div className="space-y-2">
            {learningSignals.slice(0, 5).map((signal) => (
              <div key={signal.id} className="control-strip rounded-xl px-3 py-2.5">
                <div className="flex items-start gap-2"><span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold text-accent">{signal.confidence}</span><p className="min-w-0 flex-1 text-[12px] font-semibold text-fg">{signal.summary}</p></div>
                <div className="mt-1.5 space-y-0.5">{signal.evidence.map((item) => <p key={item} className="text-[10px] text-faint">· {item}</p>)}</div>
                <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => acceptLearning(signal)} className="press h-9 rounded-lg bg-fg text-[11px] font-semibold text-bg">确认倾向</button><button type="button" onClick={() => dismissLearning(signal)} className="press h-9 rounded-lg border border-border bg-surface text-[11px] font-semibold text-muted">忽略</button></div>
              </div>
            ))}
          </div>
        ) : <p className="text-[11px] leading-relaxed text-faint">暂无达到推断门槛的新规律。至少需要 3 次相关训练暴露。</p>}
      </section>

      <section className="control-card p-3.5">
        <SectionTitle title="调整权限" detail="安全自动只执行明确授权且可回滚的变化。" />
        <div className="space-y-2">
          {MODES.map((mode) => (
            <button key={mode.value} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { adaptationMode: mode.value }))} aria-pressed={policy.adaptationMode === mode.value} className={`choice-chip press flex w-full items-center gap-3 border px-3 py-2.5 text-left ${policy.adaptationMode === mode.value ? "border-accent bg-accent-soft" : "border-border bg-surface-2"}`}><span className={`text-[12px] font-semibold ${policy.adaptationMode === mode.value ? "text-accent" : "text-fg"}`}>{mode.label}</span><span className="ml-auto text-[10px] text-faint">{mode.detail}</span></button>
          ))}
        </div>
        {policy.adaptationMode === "safeAuto" && (
          <div className="mt-3 space-y-2">
            {AUTO_PERMISSIONS.map((permission) => {
              const active = policy.autoApply[permission.key];
              return <button key={permission.key} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { autoApply: { ...current.autoApply, [permission.key]: !active } }))} aria-pressed={active} className="control-strip press flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] ${active ? "border-accent bg-accent text-accent-fg" : "border-border text-transparent"}`}>✓</span><span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold text-fg">{permission.label}</span><span className="block text-[10px] text-faint">{permission.detail}</span></span></button>;
            })}
          </div>
        )}
        <button type="button" onClick={save} className="press mt-3 h-11 w-full rounded-xl bg-fg text-[13px] font-semibold text-bg">保存训练倾向</button>
      </section>

      <section className="control-card overflow-hidden">
        <div className="px-3.5 py-3">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">PLAN PROPOSAL</p><h2 className="mt-0.5 text-[15px] font-semibold text-fg">完整计划变更预览</h2></div><span className="tnum rounded-lg bg-surface-2 px-2 py-1 text-[10px] font-semibold text-muted">{isIgnored ? "已拒绝" : proposal.confidence}</span></div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{proposal.summary}</p>
          <div className="mt-3 grid grid-cols-4 gap-2"><Fact label="模板" value={String(proposal.impact.changedTemplates)} /><Fact label="组差" value={`${proposal.impact.setDelta > 0 ? "+" : ""}${proposal.impact.setDelta}`} /><Fact label="替换" value={String(proposal.impact.replacedExercises)} /><Fact label="周训练" value={`${scheduleProposal.trainingDaysBefore}→${scheduleProposal.trainingDaysAfter}`} /></div>
        </div>

        {proposal.changes.length ? <div className="soft-divider border-t">{proposal.changes.map((change) => {
          const selected = !ignoredTemplateIds.has(change.templateId);
          const beforeSets = change.previousItems.reduce((sum, item) => sum + item.sets, 0);
          const afterSets = change.nextItems.reduce((sum, item) => sum + item.sets, 0);
          return <div key={change.templateId} className="soft-divider border-t px-3.5 py-3 first:border-t-0"><button type="button" onClick={() => setIgnoredTemplateIds((current) => { const next = new Set(current); if (next.has(change.templateId)) next.delete(change.templateId); else next.add(change.templateId); return next; })} className="press flex w-full items-start gap-3 text-left"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] ${selected ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface-2 text-transparent"}`}>✓</span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-fg">{change.templateName}</span><span className="tnum mt-0.5 block text-[10px] text-faint">{beforeSets} → {afterSets} 组 · {change.estimatedMinutesBefore} → {change.estimatedMinutesAfter} 分钟</span></span></button><div className="mt-2 space-y-1 pl-8">{change.reasons.map((reason) => <p key={reason} className="text-[10px] leading-relaxed text-muted">· {reason}</p>)}</div></div>;
        })}</div> : <div className="soft-divider border-t px-3.5 py-4 text-[12px] text-faint">模板已符合当前倾向。</div>}

        <div className="soft-divider border-t px-3.5 py-3">
          <button type="button" onClick={() => setIncludeSchedule((value) => !value)} disabled={!scheduleProposal.changed} className="press flex w-full items-start gap-3 text-left disabled:opacity-50"><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] ${includeSchedule && scheduleProposal.changed ? "border-accent bg-accent text-accent-fg" : "border-border text-transparent"}`}>✓</span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-fg">重排每周微周期</span><span className="mt-0.5 block text-[10px] text-faint">{scheduleProposal.nextSchedule.microcycle?.map((step) => step.type === "rest" ? "休" : step.label).join(" · ")}</span></span></button>
          <div className="mt-2 space-y-1 pl-8">{scheduleProposal.reasons.map((reason) => <p key={reason} className="text-[10px] text-muted">· {reason}</p>)}</div>
        </div>

        {[...proposal.warnings, ...scheduleProposal.warnings].length > 0 && <div className="soft-divider border-t bg-warn/5 px-3.5 py-3">{[...new Set([...proposal.warnings, ...scheduleProposal.warnings])].map((warning) => <p key={warning} className="text-[10px] leading-relaxed text-warn">· {warning}</p>)}</div>}
        <div className="soft-divider border-t p-3.5"><button type="button" onClick={applySelected} disabled={!selectedChanges.length && !(includeSchedule && scheduleProposal.changed)} className="press h-12 w-full rounded-xl bg-accent text-[14px] font-semibold text-accent-fg disabled:opacity-30">应用所选变化</button><button type="button" onClick={rejectCurrentProposal} disabled={isIgnored || (!proposal.changes.length && !scheduleProposal.changed)} className="press mt-2 h-10 w-full rounded-xl border border-border bg-surface text-[12px] font-semibold text-muted disabled:opacity-30">拒绝当前提案</button><p className="mt-2 text-[10px] leading-relaxed text-faint">日程编辑只影响下一微周期；已完成训练与当前周期快照保持不变。</p></div>
      </section>

      <section className="control-card p-3.5">
        <SectionTitle title="回滚与备份" detail="每次应用前保留一个可撤销快照；倾向与学习记录可单独导出。" />
        <button type="button" onClick={undoLastAdaptation} disabled={!policy.rollbackSnapshot} className="press h-11 w-full rounded-xl border border-border bg-surface-2 text-[12px] font-semibold text-fg disabled:opacity-30">撤销最近一次计划适配</button>
        {policy.rollbackSnapshot && <p className="mt-1.5 text-[10px] text-faint">快照：{new Date(policy.rollbackSnapshot.createdAt).toLocaleString("zh-CN")}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={downloadPolicyBackup} className="press h-10 rounded-xl border border-border bg-surface text-[11px] font-semibold text-muted">导出倾向</button><label className="press grid h-10 cursor-pointer place-items-center rounded-xl border border-border bg-surface text-[11px] font-semibold text-muted">导入倾向<input type="file" accept="application/json" className="sr-only" onChange={(event) => { void importPolicyFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>
        <p className="mt-2 text-[10px] text-faint">已记录 {policy.decisionEvents.length} 次计划决策，确认 {policy.confirmedLearningSignalIds.length} 条行为倾向。</p>
      </section>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-3"><h2 className="text-[14px] font-semibold text-fg">{title}</h2><p className="mt-0.5 text-[10px] leading-relaxed text-faint">{detail}</p></div>;
}

function LimitField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="control-strip rounded-xl px-2 py-2 text-center"><span className="block text-[10px] text-faint">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="tnum mt-1 h-8 w-full bg-transparent text-center text-[16px] font-semibold text-fg outline-none" /></label>;
}

function MusclePriorityRow({ muscle, value, onChange }: { muscle: MuscleGroup; value?: MusclePriority; onChange: (value: MusclePriority | "default") => void }) {
  return <div className="control-strip flex items-center gap-2 rounded-xl px-3 py-2"><span className="min-w-0 flex-1 text-[12px] font-medium text-fg">{MUSCLE_LABELS[muscle]}</span><select value={value ?? "default"} onChange={(event) => onChange(event.target.value as MusclePriority | "default")} className="h-9 rounded-lg border border-border bg-surface px-2 text-[12px] font-semibold text-muted outline-none focus:border-accent" aria-label={`${MUSCLE_LABELS[muscle]}优先级`}>{PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="control-strip rounded-xl px-1.5 py-2 text-center"><p className="text-[9px] text-faint">{label}</p><p className="tnum mt-1 text-[14px] font-bold text-fg">{value}</p></div>;
}
