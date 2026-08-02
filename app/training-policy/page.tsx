"use client";

import { useEffect, useMemo, useState } from "react";
import AdaptivePageNav from "@/components/AdaptivePageNav";
import {
  acceptAdaptiveLearningSignal,
  deriveAdaptiveLearningSignals,
  dismissAdaptiveLearningSignal,
  type AdaptiveLearningSignal,
} from "@/lib/adaptiveLearning";
import { buildAdaptiveEvidenceProfile } from "@/lib/adaptiveEvidence";
import { adaptiveText } from "@/lib/adaptiveText";
import { DEFAULT_EXERCISES } from "@/lib/exercises";
import { useToday } from "@/lib/hooks";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  type Equipment,
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
  policyRevision,
  saveTrainingPolicy,
  type AdaptationMode,
  type EvidenceAdaptationMode,
  type ExercisePreference,
  type MusclePriority,
  type TrainingGoal,
  type TrainingPolicy,
} from "@/lib/trainingPolicy";
import { useToast } from "@/lib/toast";

const GOAL_VALUES: TrainingGoal[] = ["hypertrophy", "strength", "fatLossRetention", "generalFitness"];
const PRIORITY_VALUES: Array<MusclePriority | "default"> = ["default", "specialize", "grow", "maintain", "deprioritize"];
const PREFERENCE_VALUES: ExercisePreference[] = ["neutral", "prefer", "avoid", "exclude"];
const MODE_VALUES: AdaptationMode[] = ["suggestOnly", "approvalRequired", "safeAuto"];
const EVIDENCE_MODE_VALUES: EvidenceAdaptationMode[] = ["off", "preview", "automatic"];
const EQUIPMENT_VALUES: Equipment[] = ["free", "machine", "cable", "bodyweight"];
const AUTO_PERMISSION_KEYS: Array<keyof TrainingPolicy["autoApply"]> = [
  "setChanges",
  "repChanges",
  "exerciseReplacement",
  "scheduleChanges",
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
  const { loaded, data, commitAdaptivePlan } = useStore();
  const { locale, tr } = useI18n();
  const today = useToday();
  const toast = useToast();
  const t = (zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);
  const [policy, setPolicy] = useState<TrainingPolicy>(() => defaultTrainingPolicy());
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [savedRevision, setSavedRevision] = useState("");
  const [command, setCommand] = useState("");
  const [recognized, setRecognized] = useState<string[]>([]);
  const [ignoredTemplateIds, setIgnoredTemplateIds] = useState<Set<string>>(new Set());
  const [includeSchedule, setIncludeSchedule] = useState(true);

  useEffect(() => {
    const stored = loadTrainingPolicy();
    setPolicy(stored);
    setSavedRevision(policyRevision(stored));
    setPolicyLoaded(true);
  }, []);

  const evidence = useMemo(
    () => buildAdaptiveEvidenceProfile(data, policy, today),
    [data, policy, today],
  );
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
  const dirty = policyLoaded && policyRevision(policy) !== savedRevision;

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

  const goals = GOAL_VALUES.map((value) => ({
    value,
    label: value === "hypertrophy" ? t("增肌塑形", "Hypertrophy", "筋肥大") : value === "strength" ? t("力量", "Strength", "筋力") : value === "fatLossRetention" ? t("减脂保肌", "Cut retention", "減量・筋量維持") : t("综合体能", "General fitness", "総合体力"),
    detail: value === "hypertrophy" ? t("容量与动作质量优先", "Prioritize volume and movement quality", "ボリュームと動作品質を優先") : value === "strength" ? t("主项表现与进阶优先", "Prioritize main-lift performance", "メイン種目の進行を優先") : value === "fatLossRetention" ? t("保留强度，控制总疲劳", "Retain intensity and cap fatigue", "強度を維持し疲労を抑制") : t("平衡力量、容量与执行", "Balance strength, volume, and execution", "筋力・量・実行性を両立"),
  }));
  const evidenceModes = EVIDENCE_MODE_VALUES.map((value) => ({
    value,
    label: value === "off" ? t("关闭", "Off", "オフ") : value === "preview" ? t("仅预览", "Preview", "プレビュー") : t("动态执行", "Apply", "適用"),
    detail: value === "off" ? t("保持原处方", "Keep the original prescription", "元の処方を維持") : value === "preview" ? t("只显示建议", "Show suggestions only", "提案のみ表示") : t("仅降低当次容量", "Only reduce current-session volume", "当日の量のみ減らす"),
  }));
  const adaptationModes = MODE_VALUES.map((value) => ({
    value,
    label: value === "suggestOnly" ? t("仅建议", "Suggest only", "提案のみ") : value === "approvalRequired" ? t("确认后应用", "Approval required", "確認後に適用") : t("安全自动", "Safe auto", "安全な自動適用"),
    detail: value === "suggestOnly" ? t("不修改计划", "Never changes the plan", "プランを変更しない") : value === "approvalRequired" ? t("结构变化需要确认", "Plan changes require confirmation", "構造変更は確認が必要") : t("只执行授权的小范围变化", "Only authorized, bounded changes", "許可済みの小幅変更のみ"),
  }));

  function markSaved(next: TrainingPolicy) {
    setPolicy(next);
    setSavedRevision(policyRevision(next));
  }

  function persist(next: TrainingPolicy, success: string) {
    if (saveTrainingPolicy(next)) {
      markSaved(next);
      toast.show(success, { tone: "success" });
    } else {
      toast.show(t("训练倾向保存失败", "Training preferences were not saved", "トレーニング設定を保存できませんでした"), { tone: "error" });
    }
  }

  function parseCommand() {
    const result = parseTrainingPolicyText(command, data, policy);
    setPolicy(result.policy);
    setRecognized(result.recognized.length
      ? result.recognized
      : [t("没有识别到可应用的倾向，请使用下方选项设置。", "No applicable preference was recognized. Use the controls below.", "適用できる設定を認識できませんでした。下の項目から設定してください。")]);
  }

  function save() {
    persist(mergeTrainingPolicy(policy, {}), t("训练倾向已保存", "Training preferences saved", "トレーニング設定を保存しました"));
  }

  function applySelected() {
    const applySchedule = includeSchedule && scheduleProposal.changed;
    if (!selectedChanges.length && !applySchedule) {
      toast.show(t("当前没有选择需要应用的变化", "No changes are selected", "適用する変更が選択されていません"), { tone: "info" });
      return;
    }
    const staleTemplates = selectedChanges.some((change) => {
      const current = data.templates?.find((template) => template.id === change.templateId);
      return !current || JSON.stringify(current.items) !== JSON.stringify(change.previousItems);
    });
    if (staleTemplates || (applySchedule && !isScheduleProposalCurrent(data, policy, today, scheduleProposal))) {
      toast.show(t("计划已变化，请重新查看当前提案", "The plan changed. Review the refreshed proposal.", "プランが変更されました。更新された提案を確認してください。"), { tone: "warning" });
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
    const committed = commitAdaptivePlan(
      selectedChanges.map((change) => ({ templateId: change.templateId, nextItems: change.nextItems })),
      applySchedule ? scheduleProposal.nextSchedule : undefined,
      next,
    );
    if (committed) {
      markSaved(next);
      toast.show(t(`已应用 ${selectedChanges.length} 个模板${applySchedule ? "和新日程" : ""}`, `Applied ${selectedChanges.length} template${selectedChanges.length === 1 ? "" : "s"}${applySchedule ? " and the new schedule" : ""}`, `${selectedChanges.length}件のテンプレート${applySchedule ? "と新しい日程" : ""}を適用しました`), { tone: "success" });
      setIgnoredTemplateIds(new Set());
    } else {
      toast.show(t("计划适配未保存，现有计划保持不变", "The adaptation was not saved; the current plan is unchanged", "変更を保存できなかったため、現在のプランを維持します"), { tone: "error" });
    }
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
    persist(next, t("已拒绝当前提案", "Proposal rejected", "現在の提案を拒否しました"));
  }

  function undoLastAdaptation() {
    const snapshot = policy.rollbackSnapshot;
    if (!snapshot) return;
    let next = mergeTrainingPolicy(policy, { rollbackSnapshot: undefined });
    next = appendTrainingDecision(next, {
      proposalId: snapshot.proposalId,
      outcome: "undone",
      summary: snapshot.reason,
      templateIds: snapshot.templates.map((template) => template.templateId),
      scheduleApplied: Boolean(snapshot.schedule),
    });
    const existingPatches = snapshot.templates
      .filter((previous) => data.templates?.some((template) => template.id === previous.templateId))
      .map((previous) => ({ templateId: previous.templateId, nextItems: previous.items }));
    if (commitAdaptivePlan(existingPatches, snapshot.schedule, next)) {
      markSaved(next);
      toast.show(t("已恢复调整前的未来计划", "Restored the prior future plan", "変更前の今後のプランを復元しました"), { tone: "success" });
    } else {
      toast.show(t("撤销未保存，现有计划保持不变", "Undo was not saved; the current plan is unchanged", "取り消しを保存できなかったため、現在のプランを維持します"), { tone: "error" });
    }
  }

  function acceptLearning(signal: AdaptiveLearningSignal) {
    persist(acceptAdaptiveLearningSignal(policy, signal), t("已确认训练倾向", "Preference confirmed", "設定を確認しました"));
  }

  function dismissLearning(signal: AdaptiveLearningSignal) {
    persist(dismissAdaptiveLearningSignal(policy, signal), t("已忽略该推断", "Suggestion dismissed", "推測を非表示にしました"));
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
      persist(imported, t("训练倾向与学习记录已导入", "Preferences and learning history imported", "設定と学習履歴を読み込みました"));
    } catch (error) {
      toast.show(error instanceof Error ? error.message : t("训练倾向备份无法读取", "The preference backup could not be read", "設定バックアップを読み込めませんでした"), { tone: "error" });
    }
  }

  if (!loaded || !policyLoaded) {
    return <div className="adaptive-workspace space-y-3"><div className="h-20 rounded-lg bg-surface-2" /><div className="h-56 rounded-lg bg-surface-2" /></div>;
  }

  const evidenceState = evidence.state === "collect" ? t("采集中", "Collecting", "収集中") : evidence.state === "normal" ? t("正常", "Normal", "通常") : evidence.state === "conservative" ? t("保守", "Conservative", "保守的") : t("恢复", "Recovery", "回復");
  const evidenceConfidence = evidence.confidence === "low" ? t("较低", "Low", "低い") : evidence.confidence === "building" ? t("建立中", "Building", "構築中") : t("充分", "Ready", "十分");
  const proposalConfidence = isIgnored ? t("已拒绝", "Rejected", "拒否済み") : proposal.confidence === "explicit" ? t("明确", "Explicit", "明確") : proposal.confidence === "high" ? t("高", "High", "高") : proposal.confidence === "medium" ? t("中", "Medium", "中") : t("低", "Low", "低");

  return (
    <div className="adaptive-workspace pb-8">
      <header className="page-heading">
        <div>
          <p className="page-heading__eyebrow">{t("训练控制", "Training control", "トレーニング管理")}</p>
          <h1>{t("动态训练计划", "Adaptive training plan", "適応トレーニングプラン")}</h1>
          <p className="page-heading__meta">{t("只调整未来计划，历史记录保持不变", "Only future plans change; history stays immutable", "今後のプランのみ変更し、履歴は維持")}</p>
        </div>
        <button type="button" onClick={save} disabled={!dirty} className="page-utility-link press shrink-0 disabled:opacity-50">{dirty ? t("保存", "Save", "保存") : t("已保存", "Saved", "保存済み")}</button>
      </header>

      <AdaptivePageNav active="policy" />

      <div className="adaptive-layout mt-4">
        <section className="control-card p-4">
          <SectionTitle title={t("当前训练状态", "Current training state", "現在のトレーニング状態")} detail={t("短期证据只作用于下一次处方", "Short-term evidence affects only the next prescription", "短期データは次回処方だけに反映")} />
          <div className="grid grid-cols-2 gap-2">
            <Fact label={t("状态", "State", "状態")} value={evidenceState} />
            <Fact label={t("置信度", "Confidence", "信頼度")} value={evidenceConfidence} />
            <Fact label={t("当次容量", "Session volume", "当日ボリューム")} value={`${Math.round(evidence.volumeScale * 100)}%`} />
            <Fact label={t("建议天数", "Suggested days", "推奨日数")} value={String(evidence.recommendedTrainingDays)} />
          </div>
          <p className="mt-3 text-[12px] font-semibold text-fg">{t("有效上限", "Active caps", "有効上限")}：{evidence.maxSessionMinutes} {t("分钟", "min", "分")} / {evidence.maxWorkingSets} {t("组", "sets", "セット")}</p>
          <div className="mt-2 space-y-1">{evidence.reasons.slice(0, 3).map((reason) => <p key={reason} className="text-[11px] leading-relaxed text-muted">{adaptiveText(locale, reason)}</p>)}</div>
          <details className="adaptive-inline-details mt-3"><summary>{t("证据详情", "Evidence details", "データ詳細")}</summary><div className="mt-2 space-y-1">{evidence.evidence.map((item) => <p key={item}>{adaptiveText(locale, item)}</p>)}</div></details>
          <div className="mt-3 border-t border-border pt-3">
            <FieldLabel>{t("短期证据模式", "Short-term evidence mode", "短期データモード")}</FieldLabel>
            <div className="adaptive-segmented" data-columns="3">
              {evidenceModes.map((mode) => <button key={mode.value} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { evidenceMode: mode.value }))} aria-pressed={policy.evidenceMode === mode.value} className="press"><strong>{mode.label}</strong><small>{mode.detail}</small></button>)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["building", "ready"] as const).map((confidence) => <button key={confidence} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { evidenceMinimumConfidence: confidence }))} aria-pressed={policy.evidenceMinimumConfidence === confidence} className="choice-chip press h-10 border border-border text-[12px] font-semibold">{confidence === "building" ? t("中等证据即可", "Building evidence", "構築中から適用") : t("仅充分证据", "Ready evidence only", "十分なデータのみ")}</button>)}
            </div>
          </div>
        </section>

        <section className="control-card overflow-hidden">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle title={t("计划变更", "Plan changes", "プラン変更")} detail={t("逐项选择后一次应用", "Select changes and apply them together", "変更を選択して一括適用")} />
              <span className="adaptive-scale tnum">{proposalConfidence}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">{adaptiveText(locale, proposal.summary)}</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <Fact label={t("模板", "Templates", "テンプレート")} value={String(proposal.impact.changedTemplates)} />
              <Fact label={t("组差", "Set delta", "セット差")} value={`${proposal.impact.setDelta > 0 ? "+" : ""}${proposal.impact.setDelta}`} />
              <Fact label={t("替换", "Replaced", "置換")} value={String(proposal.impact.replacedExercises)} />
              <Fact label={t("训练日", "Days", "日数")} value={`${scheduleProposal.trainingDaysBefore}→${scheduleProposal.trainingDaysAfter}`} />
            </div>
          </div>

          {proposal.changes.length ? <div className="soft-divider border-t">{proposal.changes.map((change) => {
            const selected = !ignoredTemplateIds.has(change.templateId);
            const beforeSets = change.previousItems.reduce((sum, item) => sum + item.sets, 0);
            const afterSets = change.nextItems.reduce((sum, item) => sum + item.sets, 0);
            return <div key={change.templateId} className="soft-divider border-t px-4 py-3 first:border-t-0"><button type="button" onClick={() => setIgnoredTemplateIds((current) => { const next = new Set(current); if (next.has(change.templateId)) next.delete(change.templateId); else next.add(change.templateId); return next; })} className="press flex w-full items-start gap-3 text-left"><CheckMark selected={selected} /><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-fg">{tr(change.templateName)}</span><span className="tnum mt-0.5 block text-[11px] text-faint">{beforeSets} → {afterSets} {t("组", "sets", "セット")} · {change.estimatedMinutesBefore} → {change.estimatedMinutesAfter} {t("分钟", "min", "分")}</span></span></button><div className="mt-2 space-y-1 pl-8">{change.reasons.map((reason) => <p key={reason} className="text-[11px] leading-relaxed text-muted">{adaptiveText(locale, reason)}</p>)}</div></div>;
          })}</div> : <div className="soft-divider border-t px-4 py-4 text-[12px] text-faint">{t("当前模板符合已保存倾向。", "Current templates match the saved preferences.", "現在のテンプレートは保存済み設定に合っています。")}</div>}

          <div className="soft-divider border-t px-4 py-3">
            <button type="button" onClick={() => setIncludeSchedule((value) => !value)} disabled={!scheduleProposal.changed} className="press flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-50"><CheckMark selected={includeSchedule && scheduleProposal.changed} /><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-fg">{t("重排下一微周期", "Reschedule next microcycle", "次の微周期を再編成")}</span><span className="mt-0.5 block text-[11px] text-faint">{scheduleProposal.nextSchedule.microcycle?.map((step) => step.type === "rest" ? t("休", "Rest", "休") : tr(step.label)).join(" · ")}</span></span></button>
            {scheduleProposal.reasons.length > 0 && <div className="mt-2 space-y-1 pl-8">{scheduleProposal.reasons.map((reason) => <p key={reason} className="text-[11px] text-muted">{adaptiveText(locale, reason)}</p>)}</div>}
          </div>

          {[...proposal.warnings, ...scheduleProposal.warnings].length > 0 && <details className="adaptive-warning soft-divider border-t px-4 py-3"><summary>{t("查看限制与警告", "View constraints and warnings", "制限と警告を見る")}</summary><div className="mt-2 space-y-1">{[...new Set([...proposal.warnings, ...scheduleProposal.warnings])].map((warning) => <p key={warning}>{adaptiveText(locale, warning)}</p>)}</div></details>}
          <div className="soft-divider border-t p-4">
            <button type="button" onClick={applySelected} disabled={!selectedChanges.length && !(includeSchedule && scheduleProposal.changed)} className="press h-11 w-full rounded-md bg-accent text-[14px] font-semibold text-accent-fg disabled:opacity-30">{t("应用所选变化", "Apply selected changes", "選択した変更を適用")}</button>
            <button type="button" onClick={rejectCurrentProposal} disabled={isIgnored || (!proposal.changes.length && !scheduleProposal.changed)} className="press mt-2 h-10 w-full rounded-md border border-border bg-surface text-[12px] font-semibold text-muted disabled:opacity-30">{t("拒绝当前提案", "Reject proposal", "現在の提案を拒否")}</button>
          </div>
        </section>

        <section className="control-card p-4">
          <SectionTitle title={t("目标与现实限制", "Goal and constraints", "目標と現実的な制限")} detail={t("先满足时间、器械与恢复边界", "Time, equipment, and recovery limits come first", "時間・器具・回復の制限を優先")} />
          <div className="grid grid-cols-2 gap-2">
            {goals.map((goal) => <button key={goal.value} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { goal: goal.value }))} aria-pressed={policy.goal === goal.value} className="choice-chip press border border-border px-3 py-2.5 text-left"><strong className="block text-[13px] text-fg">{goal.label}</strong><small className="mt-0.5 block text-[11px] leading-relaxed text-faint">{goal.detail}</small></button>)}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <LimitField label={t("分钟", "Minutes", "分")} value={policy.maxSessionMinutes} min={20} max={240} onChange={(value) => setPolicy((current) => updateNumber(current, "maxSessionMinutes", value))} />
            <LimitField label={t("动作", "Exercises", "種目")} value={policy.maxExercisesPerSession} min={3} max={15} onChange={(value) => setPolicy((current) => updateNumber(current, "maxExercisesPerSession", value))} />
            <LimitField label={t("工作组", "Work sets", "ワークセット")} value={policy.maxWorkingSetsPerSession} min={6} max={50} onChange={(value) => setPolicy((current) => updateNumber(current, "maxWorkingSetsPerSession", value))} />
          </div>
          <FieldLabel className="mt-3">{t("每周目标训练天数", "Target training days", "週間目標日数")}</FieldLabel>
          <div className="adaptive-day-picker">
            {[1, 2, 3, 4, 5, 6, 7].map((days) => <button key={days} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { weeklyTrainingDays: { minimum: Math.max(1, days - 1), target: days, maximum: Math.min(7, days + 1) } }))} aria-pressed={policy.weeklyTrainingDays.target === days} className="press">{days}</button>)}
          </div>
          <FieldLabel className="mt-3">{t("不可用器械", "Unavailable equipment", "使用不可の器具")}</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT_VALUES.map((equipment) => {
              const active = policy.unavailableEquipment.includes(equipment);
              const label = tr(EQUIPMENT_LABELS[equipment]);
              return <button key={equipment} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { unavailableEquipment: active ? current.unavailableEquipment.filter((item) => item !== equipment) : [...current.unavailableEquipment, equipment] }))} aria-label={active ? t(`取消${label}不可用限制`, `Mark ${label} as available`, `${label}を使用可能に戻す`) : t(`设为${label}不可用`, `Mark ${label} as unavailable`, `${label}を使用不可にする`)} aria-pressed={active} className="choice-chip press flex min-h-11 items-center gap-2 border border-border px-2.5 text-left text-[12px] font-semibold"><CheckMark selected={active} /><span className="min-w-0 flex-1">{label}</span></button>;
            })}
          </div>
        </section>

        <section className="control-card p-4">
          <SectionTitle title={t("调整权限", "Adaptation permissions", "調整権限")} detail={t("所有结构变化均保留一次撤销", "Every structural change keeps one undo snapshot", "構造変更ごとに1つの取り消しを保持")} />
          <div className="adaptive-segmented" data-columns="3">
            {adaptationModes.map((mode) => <button key={mode.value} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { adaptationMode: mode.value }))} aria-pressed={policy.adaptationMode === mode.value} className="press"><strong>{mode.label}</strong><small>{mode.detail}</small></button>)}
          </div>
          {policy.adaptationMode === "safeAuto" && <div className="mt-3 space-y-2">{AUTO_PERMISSION_KEYS.map((key) => {
            const active = policy.autoApply[key];
            const label = key === "setChanges" ? t("小范围组数", "Small set changes", "小幅なセット変更") : key === "repChanges" ? t("次数范围", "Rep ranges", "回数範囲") : key === "exerciseReplacement" ? t("硬约束换动作", "Constraint replacements", "制約による種目置換") : t("日程减量", "Schedule reductions", "日程の削減");
            const detail = key === "setChanges" ? t("单动作最多 ±1 组", "At most ±1 set per exercise", "1種目あたり最大±1セット") : key === "repChanges" ? t("上下限最多变化 2 次", "Rep bounds change by at most 2", "上下限の変更は最大2回") : key === "exerciseReplacement" ? t("只处理明确排除与不可用器械", "Only explicit exclusions and unavailable equipment", "明示的な除外と使用不可器具のみ") : t("只减少，不自动增加训练日", "Reductions only; never adds days", "削減のみで日数は自動追加しない");
            return <button key={key} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { autoApply: { ...current.autoApply, [key]: !active } }))} aria-pressed={active} className="control-strip press flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left"><CheckMark selected={active} /><span className="min-w-0 flex-1"><strong className="block text-[12px] text-fg">{label}</strong><small className="block text-[11px] text-faint">{detail}</small></span></button>;
          })}</div>}
          <button type="button" onClick={save} disabled={!dirty} className="press mt-3 h-11 w-full rounded-md bg-fg text-[13px] font-semibold text-bg disabled:opacity-40">{dirty ? t("保存训练倾向", "Save training preferences", "トレーニング設定を保存") : t("训练倾向已保存", "Training preferences saved", "トレーニング設定は保存済み")}</button>
        </section>

        <details className="adaptive-disclosure control-card">
          <summary><span><strong>{t("快速描述倾向", "Quick preference input", "設定をすばやく入力")}</strong><small>{t("解析训练目标、时间、频率和排除动作", "Parse goals, time, frequency, and exclusions", "目標・時間・頻度・除外種目を解析")}</small></span><Chevron /></summary>
          <div className="soft-divider border-t p-4">
            <textarea value={command} onChange={(event) => setCommand(event.target.value)} placeholder={t("例如：肩中束优先，每周 5 练，每次最多 70 分钟。", "Example: prioritize side delts, train 5 days, max 70 minutes.", "例：中部三角筋を優先、週5日、1回70分まで。") } className="number-cell min-h-24 w-full resize-y rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-fg outline-none placeholder:text-faint focus:border-accent" />
            <button type="button" onClick={parseCommand} disabled={!command.trim()} className="press mt-2 h-10 w-full rounded-md bg-fg text-[13px] font-semibold text-bg disabled:opacity-30">{t("解析倾向", "Parse preferences", "設定を解析")}</button>
            {recognized.length > 0 && <div className="mt-3 space-y-1 border-t border-border pt-3">{recognized.map((item) => <p key={item} className="text-[12px] leading-relaxed text-muted">{adaptiveText(locale, item)}</p>)}</div>}
          </div>
        </details>

        <details className="adaptive-disclosure control-card">
          <summary><span><strong>{t("肌群与动作偏好", "Muscle and exercise preferences", "筋群と種目の設定")}</strong><small>{t("只在需要专项或避开动作时设置", "Set only for specialization or avoidance", "特化や回避が必要な場合のみ設定")}</small></span><Chevron /></summary>
          <div className="soft-divider border-t p-4">
            <FieldLabel>{t("肌群优先级", "Muscle priorities", "筋群の優先度")}</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-2">{MUSCLE_ORDER.map((muscle) => <MusclePriorityRow key={muscle} locale={locale} label={tr(MUSCLE_LABELS[muscle])} value={policy.musclePriorities[muscle]} onChange={(value) => setPolicy((current) => { const priorities = { ...current.musclePriorities }; if (value === "default") delete priorities[muscle]; else priorities[muscle] = value; return mergeTrainingPolicy(current, { musclePriorities: priorities }); })} />)}</div>
            <FieldLabel className="mt-4">{t("模板动作偏好", "Template exercise preferences", "テンプレート種目の設定")}</FieldLabel>
            {templateExercises.length ? <div className="grid gap-2 sm:grid-cols-2">{templateExercises.map((exercise) => <div key={exercise.id} className="control-strip flex items-center gap-2 rounded-md px-3 py-2"><span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">{tr(exercise.name)}</span><select value={policy.exercisePreferences[exercise.id] ?? "neutral"} onChange={(event) => setPolicy((current) => mergeTrainingPolicy(current, { exercisePreferences: { ...current.exercisePreferences, [exercise.id]: event.target.value as ExercisePreference } }))} className="h-9 rounded-md border border-border bg-surface px-2 text-[12px] font-semibold text-muted outline-none focus:border-accent" aria-label={t(`${exercise.name}偏好`, `${exercise.name} preference`, `${exercise.name}の設定`)}>{PREFERENCE_VALUES.map((value) => <option key={value} value={value}>{preferenceLabel(locale, value)}</option>)}</select></div>)}</div> : <p className="text-[12px] text-faint">{t("模板中还没有动作。", "No exercises are in templates yet.", "テンプレートに種目がありません。")}</p>}
          </div>
        </details>

        <section className="control-card p-4">
          <SectionTitle title={t("执行行为学习", "Behavior learning", "実行行動からの学習")} detail={t("只有确认后才写入长期倾向", "Long-term preferences change only after confirmation", "確認後のみ長期設定に反映")} />
          {learningSignals.length ? <div className="space-y-2">{learningSignals.slice(0, 5).map((signal) => <div key={signal.id} className="control-strip rounded-md px-3 py-3"><div className="flex items-start gap-2"><span className="adaptive-scale">{signal.confidence === "high" ? t("高", "High", "高") : t("中", "Medium", "中")}</span><p className="min-w-0 flex-1 text-[12px] font-semibold text-fg">{adaptiveText(locale, signal.summary)}</p></div><div className="mt-2 space-y-1">{signal.evidence.map((item) => <p key={item} className="text-[11px] text-faint">{adaptiveText(locale, item)}</p>)}</div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => acceptLearning(signal)} className="press h-9 rounded-md bg-fg text-[11px] font-semibold text-bg">{t("确认", "Confirm", "確認")}</button><button type="button" onClick={() => dismissLearning(signal)} className="press h-9 rounded-md border border-border bg-surface text-[11px] font-semibold text-muted">{t("忽略", "Dismiss", "無視")}</button></div></div>)}</div> : <p className="text-[12px] leading-relaxed text-faint">{t("暂无达到门槛的新规律。", "No new pattern has reached the evidence threshold.", "基準に達した新しい傾向はありません。")}</p>}
        </section>

        <details className="adaptive-disclosure control-card">
          <summary><span><strong>{t("撤销与备份", "Undo and backup", "取り消しとバックアップ")}</strong><small>{t("恢复最近计划，或迁移训练倾向", "Restore the latest plan or move preferences", "直近プランの復元と設定の移行")}</small></span><Chevron /></summary>
          <div className="soft-divider border-t p-4">
            <button type="button" onClick={undoLastAdaptation} disabled={!policy.rollbackSnapshot} className="press h-10 w-full rounded-md border border-border bg-surface-2 text-[12px] font-semibold text-fg disabled:opacity-30">{t("撤销最近一次计划适配", "Undo latest plan adaptation", "直近のプラン調整を取り消す")}</button>
            {policy.rollbackSnapshot && <p className="mt-1.5 text-[11px] text-faint">{t("快照", "Snapshot", "スナップショット")}：{new Date(policy.rollbackSnapshot.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : locale)}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={downloadPolicyBackup} className="press h-10 rounded-md border border-border bg-surface text-[12px] font-semibold text-muted">{t("导出倾向", "Export preferences", "設定を書き出す")}</button><label className="press grid h-10 cursor-pointer place-items-center rounded-md border border-border bg-surface text-[12px] font-semibold text-muted">{t("导入倾向", "Import preferences", "設定を読み込む")}<input type="file" accept="application/json" className="sr-only" onChange={(event) => { void importPolicyFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>
            <p className="mt-2 text-[11px] text-faint">{t(`已记录 ${policy.decisionEvents.length} 次决策，确认 ${policy.confirmedLearningSignalIds.length} 条倾向。`, `${policy.decisionEvents.length} decisions recorded; ${policy.confirmedLearningSignalIds.length} preferences confirmed.`, `決定 ${policy.decisionEvents.length} 件、確認済み設定 ${policy.confirmedLearningSignalIds.length} 件。`)}</p>
          </div>
        </details>
      </div>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-3"><h2 className="text-[16px] font-semibold text-fg">{title}</h2><p className="mt-0.5 text-[11px] leading-relaxed text-faint">{detail}</p></div>;
}

function FieldLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mb-1.5 text-[11px] font-semibold text-muted ${className}`}>{children}</p>;
}

function LimitField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="control-strip rounded-md px-2 py-2 text-center"><span className="block text-[11px] text-faint">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="tnum mt-1 h-8 w-full bg-transparent text-center text-[16px] font-semibold text-fg outline-none" /></label>;
}

function MusclePriorityRow({ locale, label, value, onChange }: { locale: Locale; label: string; value?: MusclePriority; onChange: (value: MusclePriority | "default") => void }) {
  return <div className="control-strip flex items-center gap-2 rounded-md px-3 py-2"><span className="min-w-0 flex-1 text-[12px] font-medium text-fg">{label}</span><select value={value ?? "default"} onChange={(event) => onChange(event.target.value as MusclePriority | "default")} className="h-9 rounded-md border border-border bg-surface px-2 text-[12px] font-semibold text-muted outline-none focus:border-accent" aria-label={`${label} ${localeText(locale, "优先级", "priority", "優先度")}`}>{PRIORITY_VALUES.map((item) => <option key={item} value={item}>{priorityLabel(locale, item)}</option>)}</select></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="adaptive-fact"><p>{label}</p><strong>{value}</strong></div>;
}

function CheckMark({ selected }: { selected: boolean }) {
  return <span className="adaptive-check" data-selected={selected} aria-hidden="true">{selected ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12.5L9.2 16.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</span>;
}

function Chevron() {
  return <svg className="adaptive-chevron" aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function priorityLabel(locale: Locale, value: MusclePriority | "default") {
  if (value === "default") return localeText(locale, "默认", "Default", "標準");
  if (value === "specialize") return localeText(locale, "专项", "Specialize", "特化");
  if (value === "grow") return localeText(locale, "增长", "Grow", "増量");
  if (value === "maintain") return localeText(locale, "维持", "Maintain", "維持");
  return localeText(locale, "降低", "Deprioritize", "優先度を下げる");
}

function preferenceLabel(locale: Locale, value: ExercisePreference) {
  if (value === "prefer") return localeText(locale, "偏好", "Prefer", "優先");
  if (value === "avoid") return localeText(locale, "避免", "Avoid", "回避");
  if (value === "exclude") return localeText(locale, "排除", "Exclude", "除外");
  return localeText(locale, "默认", "Default", "標準");
}
