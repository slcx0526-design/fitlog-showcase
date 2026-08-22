"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import TrainingWorkspaceNav from "@/components/TrainingWorkspaceNav";
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
  removeMusclePlanTarget,
  saveTrainingPolicy,
  setExerciseLock,
  setMusclePriority,
  type AdaptationMode,
  type EvidenceAdaptationMode,
  type ExerciseLockMode,
  type ExercisePreference,
  type MusclePriority,
  type PlanningAggressiveness,
  type PolicyParseClause,
  type ScheduleAdaptationStyle,
  type TrainingDecisionFeedbackReason,
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
const SCHEDULE_STYLE_VALUES: ScheduleAdaptationStyle[] = ["preserve", "balanced", "priority"];
const AGGRESSIVENESS_VALUES: PlanningAggressiveness[] = ["conservative", "balanced", "progressive"];
const LOCK_VALUES: Array<ExerciseLockMode | "none"> = ["none", "keep", "freeze"];
const REJECTION_REASON_VALUES: TrainingDecisionFeedbackReason[] = [
  "volumeTooHigh",
  "recoveryConcern",
  "tooManyChanges",
  "exerciseMismatch",
  "scheduleMismatch",
  "other",
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
  const [parseClauses, setParseClauses] = useState<PolicyParseClause[]>([]);
  const [ignoredTemplateIds, setIgnoredTemplateIds] = useState<Set<string>>(new Set());
  const [includeSchedule, setIncludeSchedule] = useState(true);
  const [rejectingProposal, setRejectingProposal] = useState(false);

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
  const planningStyles = AGGRESSIVENESS_VALUES.map((value) => ({
    value,
    label: value === "conservative" ? t("恢复优先", "Recovery first", "回復優先") : value === "progressive" ? t("积极进阶", "Progressive", "積極的") : t("平衡", "Balanced", "バランス"),
    detail: value === "conservative" ? t("每轮只做最小改动", "Minimum changes per pass", "各回の変更を最小化") : value === "progressive" ? t("证据允许时分散加量", "Distribute increases when supported", "根拠があれば分散して増量") : t("多目标轮流分配", "Round-robin across goals", "複数目標へ順番に配分"),
  }));
  const scheduleStyles = SCHEDULE_STYLE_VALUES.map((value) => ({
    value,
    label: value === "preserve" ? t("保持分化", "Preserve split", "分割を維持") : value === "priority" ? t("目标优先", "Priority led", "目標優先") : t("平衡重排", "Balanced", "均衡再編") ,
    detail: value === "preserve" ? t("不改训练日结构", "Keep training-day structure", "トレーニング日の構造を維持") : value === "priority" ? t("额外频率给优先目标", "Extra frequency follows priorities", "追加頻度を優先目標へ") : t("保留完整分化并均匀恢复", "Keep full split with even recovery", "分割を保ち回復を均等化"),
  }));
  const rejectionReasons = REJECTION_REASON_VALUES.map((value) => ({
    value,
    label: value === "volumeTooHigh" ? t("容量太高", "Too much volume", "量が多すぎる") : value === "recoveryConcern" ? t("恢复不足", "Recovery concern", "回復が不安") : value === "tooManyChanges" ? t("改动太多", "Too many changes", "変更が多すぎる") : value === "exerciseMismatch" ? t("动作不合适", "Exercise mismatch", "種目が合わない") : value === "scheduleMismatch" ? t("日程不合适", "Schedule mismatch", "日程が合わない") : t("其他原因", "Other reason", "その他"),
  }));

  function markSaved(next: TrainingPolicy) {
    setPolicy(next);
    setSavedRevision(policyRevision(next));
  }

  function persist(next: TrainingPolicy, success: string) {
    if (saveTrainingPolicy(next)) {
      markSaved(next);
      toast.show(success, { tone: "success" });
      return true;
    } else {
      toast.show(t("训练倾向保存失败", "Training preferences were not saved", "トレーニング設定を保存できませんでした"), { tone: "error" });
      return false;
    }
  }

  function parseCommand() {
    const result = parseTrainingPolicyText(command, data, policy);
    setPolicy(result.policy);
    setParseClauses(result.clauses);
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

  function rejectCurrentProposal(feedbackReason: TrainingDecisionFeedbackReason) {
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
      feedbackReason,
    });
    if (persist(next, t("已拒绝当前提案并记录原因", "Proposal rejected and feedback recorded", "提案を拒否し、理由を記録しました"))) {
      setRejectingProposal(false);
    }
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

      <TrainingWorkspaceNav active="policy" />

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
              <SectionTitle title={t("计划变更", "Plan changes", "プラン変更")} detail={t("按模板选择，模板内联动改动保持约束", "Select by template so linked changes keep their constraints", "テンプレート単位で選び、連動する制約を維持")} />
              <span className="adaptive-scale tnum">{proposalConfidence}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">{adaptiveText(locale, proposal.summary)}</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <Fact label={t("模板", "Templates", "テンプレート")} value={String(proposal.impact.changedTemplates)} />
              <Fact label={t("组差", "Set delta", "セット差")} value={`${proposal.impact.setDelta > 0 ? "+" : ""}${proposal.impact.setDelta}`} />
              <Fact label={t("增/换/删", "Add/swap/remove", "追加/置換/削除")} value={`${proposal.impact.addedExercises}/${proposal.impact.replacedExercises}/${proposal.impact.removedExercises}`} />
              <Fact label={t("周期训练日", "Cycle days", "周期トレ日")} value={`${scheduleProposal.trainingDaysBefore}→${scheduleProposal.trainingDaysAfter} / ${scheduleProposal.cycleDays}`} />
            </div>
          </div>

          {proposal.changes.length ? <div className="soft-divider border-t">{proposal.changes.map((change) => {
            const selected = !ignoredTemplateIds.has(change.templateId);
            const beforeSets = change.previousItems.reduce((sum, item) => sum + item.sets, 0);
            const afterSets = change.nextItems.reduce((sum, item) => sum + item.sets, 0);
            return (
              <div key={change.templateId} className="soft-divider border-t px-4 py-3 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setIgnoredTemplateIds((current) => {
                    const next = new Set(current);
                    if (next.has(change.templateId)) next.delete(change.templateId);
                    else next.add(change.templateId);
                    return next;
                  })}
                  className="press flex w-full items-start gap-3 text-left"
                >
                  <CheckMark selected={selected} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-fg">{tr(change.templateName)}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-faint">{beforeSets} → {afterSets} {t("组", "sets", "セット")} · {change.estimatedMinutesBefore} → {change.estimatedMinutesAfter} {t("分钟", "min", "分")}</span>
                  </span>
                </button>
                <div className="adaptive-item-diffs mt-2 pl-8">
                  {change.itemDiffs.map((diff) => (
                    <div key={diff.id} className="adaptive-item-diff">
                      <span>{diff.kind === "added" ? t("新增", "Add", "追加") : diff.kind === "removed" ? t("移除", "Remove", "削除") : diff.kind === "sets" ? t("组数", "Sets", "セット") : diff.kind === "replaced" ? t("替换", "Swap", "置換") : t("处方", "Prescription", "処方")}</span>
                      <strong>{diff.kind === "replaced" && diff.previousExerciseName ? `${tr(diff.previousExerciseName)} → ${tr(diff.exerciseName)}` : tr(diff.exerciseName)}</strong>
                      <small className="tnum">{diff.beforeSets != null && diff.afterSets != null ? `${diff.beforeSets} → ${diff.afterSets}` : diff.afterSets != null ? `+${diff.afterSets}` : diff.beforeSets != null ? `-${diff.beforeSets}` : ""}</small>
                    </div>
                  ))}
                </div>
                <div className="mt-2 space-y-1 pl-8">{change.reasons.map((reason) => <p key={reason} className="text-[11px] leading-relaxed text-muted">{adaptiveText(locale, reason)}</p>)}</div>
              </div>
            );
          })}</div> : <div className="soft-divider border-t px-4 py-4 text-[12px] text-faint">{t("当前模板符合已保存倾向。", "Current templates match the saved preferences.", "現在のテンプレートは保存済み設定に合っています。")}</div>}

          {proposal.impact.muscles.length > 0 && <details className="adaptive-disclosure-inline soft-divider border-t px-4 py-3"><summary>{t("查看肌群容量影响", "View muscle-volume impact", "筋群ボリュームへの影響")}</summary><div className="adaptive-muscle-impact mt-2">{proposal.impact.muscles.map((impact) => <div key={impact.muscle}><strong>{tr(MUSCLE_LABELS[impact.muscle])}</strong><span className="tnum">{t("直接", "Direct", "直接")} {impact.directBefore} → {impact.directAfter}</span><span className="tnum">{t("有效", "Effective", "有効")} {impact.effectiveBefore} → {impact.effectiveAfter}</span><small className="tnum">{t("目标", "Target", "目標")} {impact.targetLow}–{impact.targetHigh}</small></div>)}</div></details>}

          <div className="soft-divider border-t px-4 py-3">
            <button type="button" onClick={() => setIncludeSchedule((value) => !value)} disabled={!scheduleProposal.changed} className="press flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-50"><CheckMark selected={includeSchedule && scheduleProposal.changed} /><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-fg">{t("重排下一微周期", "Reschedule next microcycle", "次の微周期を再編成")}</span><span className="mt-0.5 block text-[11px] text-faint">{scheduleProposal.nextSchedule.microcycle?.map((step) => step.type === "rest" ? t("休", "Rest", "休") : tr(step.label)).join(" · ")}</span></span></button>
            {scheduleProposal.reasons.length > 0 && <div className="mt-2 space-y-1 pl-8">{scheduleProposal.reasons.map((reason) => <p key={reason} className="text-[11px] text-muted">{adaptiveText(locale, reason)}</p>)}</div>}
          </div>

          {[...proposal.warnings, ...scheduleProposal.warnings].length > 0 && <details className="adaptive-warning soft-divider border-t px-4 py-3"><summary>{t("查看限制与警告", "View constraints and warnings", "制限と警告を見る")}</summary><div className="mt-2 space-y-1">{[...new Set([...proposal.warnings, ...scheduleProposal.warnings])].map((warning) => <p key={warning}>{adaptiveText(locale, warning)}</p>)}</div></details>}
          <div className="soft-divider border-t p-4">
            <button type="button" onClick={applySelected} disabled={!selectedChanges.length && !(includeSchedule && scheduleProposal.changed)} className="press h-11 w-full rounded-md bg-accent text-[14px] font-semibold text-accent-fg disabled:opacity-30">{t("应用所选变化", "Apply selected changes", "選択した変更を適用")}</button>
            <button type="button" onClick={() => setRejectingProposal((value) => !value)} aria-expanded={rejectingProposal} disabled={isIgnored || (!proposal.changes.length && !scheduleProposal.changed)} className="press mt-2 h-10 w-full rounded-md border border-border bg-surface text-[12px] font-semibold text-muted disabled:opacity-30">{t("拒绝当前提案", "Reject proposal", "現在の提案を拒否")}</button>
            {rejectingProposal && (
              <div className="adaptive-reject-panel mt-2" role="group" aria-label={t("拒绝原因", "Rejection reason", "拒否理由")}>
                <p>{t("选择原因，系统只在同类反馈重复出现后请求你确认长期调整。", "Choose a reason. Long-term changes are suggested only after repeated feedback.", "理由を選択してください。同じ反応が繰り返された場合のみ長期調整を提案します。")}</p>
                <div>
                  {rejectionReasons.map((reason) => <button key={reason.value} type="button" onClick={() => rejectCurrentProposal(reason.value)} className="choice-chip press min-h-10 border border-border px-2 text-[11px] font-semibold">{reason.label}</button>)}
                </div>
              </div>
            )}
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
          <FieldLabel className="mt-3">{t("每 7 天目标训练次数", "Training sessions per 7 days", "7日あたりの目標回数")}</FieldLabel>
          <div className="adaptive-day-picker">
            {[1, 2, 3, 4, 5, 6, 7].map((days) => <button key={days} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { weeklyTrainingDays: { minimum: Math.max(1, days - 1), target: days, maximum: Math.min(7, days + 1) } }))} aria-pressed={policy.weeklyTrainingDays.target === days} className="press">{days}</button>)}
          </div>
          <FieldLabel className="mt-3">{t("计划修改幅度", "Planning pace", "調整ペース")}</FieldLabel>
          <div className="adaptive-segmented" data-columns="3">
            {planningStyles.map((style) => <button key={style.value} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { planningAggressiveness: style.value }))} aria-pressed={policy.planningAggressiveness === style.value} className="press"><strong>{style.label}</strong><small>{style.detail}</small></button>)}
          </div>
          <FieldLabel className="mt-3">{t("微周期日程", "Microcycle schedule", "微周期日程")}</FieldLabel>
          <div className="adaptive-segmented" data-columns="3">
            {scheduleStyles.map((style) => <button key={style.value} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { scheduleAdaptation: style.value }))} aria-pressed={policy.scheduleAdaptation === style.value} className="press"><strong>{style.label}</strong><small>{style.detail}</small></button>)}
          </div>
          <FieldLabel className="mt-3">{t("同肌群最少间隔天数", "Minimum days between the same muscle", "同一筋群の最小間隔日数")}</FieldLabel>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((days) => <button key={days} type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { minimumRecoveryDays: days }))} aria-pressed={policy.minimumRecoveryDays === days} className="choice-chip press h-10 border border-border text-[12px] font-semibold">{days}</button>)}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { allowExerciseAdditions: !current.allowExerciseAdditions }))} aria-pressed={policy.allowExerciseAdditions} className="control-strip press flex min-h-12 items-center gap-2 rounded-md px-2.5 text-left"><CheckMark selected={policy.allowExerciseAdditions} /><span className="text-[11px] font-semibold text-fg">{t("允许补齐缺失动作", "Allow missing exercises", "不足種目の追加を許可")}</span></button>
            <button type="button" onClick={() => setPolicy((current) => mergeTrainingPolicy(current, { preserveTotalWorkingSets: !current.preserveTotalWorkingSets }))} aria-pressed={policy.preserveTotalWorkingSets} className="control-strip press flex min-h-12 items-center gap-2 rounded-md px-2.5 text-left"><CheckMark selected={policy.preserveTotalWorkingSets} /><span className="text-[11px] font-semibold text-fg">{t("保持总工作组数", "Preserve total work sets", "総ワークセットを維持")}</span></button>
          </div>
          <label className="control-strip mt-2 block rounded-md px-3 py-2.5">
            <span className="flex items-center justify-between gap-3 text-[11px] font-semibold text-muted"><span>{t("非目标肌群维持底线", "Maintenance floor for other muscles", "非対象筋群の維持下限")}</span><strong className="tnum text-fg">{Math.round(policy.maintenanceFloorRatio * 100)}%</strong></span>
            <input type="range" min={40} max={100} step={5} value={Math.round(policy.maintenanceFloorRatio * 100)} onChange={(event) => setPolicy((current) => mergeTrainingPolicy(current, { maintenanceFloorRatio: Number(event.target.value) / 100 }))} className="mt-2 w-full accent-[var(--accent)]" aria-label={t("非目标肌群维持底线", "Maintenance floor for other muscles", "非対象筋群の維持下限")} />
          </label>
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
          <details className="adaptive-inline-details mt-3">
            <summary>{t("每次提案改动上限", "Per-proposal change limits", "提案ごとの変更上限")}</summary>
            <div className="grid grid-cols-2 gap-2">
              <LimitField label={t("单动作组差", "Set delta", "セット差")} value={policy.changeBudget.maxSetDeltaPerExercise} min={1} max={3} onChange={(value) => setPolicy((current) => mergeTrainingPolicy(current, { changeBudget: { ...current.changeBudget, maxSetDeltaPerExercise: value } }))} />
              <LimitField label={t("新增动作", "Additions", "追加種目")} value={policy.changeBudget.maxAddedExercisesPerTemplate} min={0} max={3} onChange={(value) => setPolicy((current) => mergeTrainingPolicy(current, { changeBudget: { ...current.changeBudget, maxAddedExercisesPerTemplate: value } }))} />
            </div>
          </details>
          <button type="button" onClick={save} disabled={!dirty} className="press mt-3 h-11 w-full rounded-md bg-fg text-[13px] font-semibold text-bg disabled:opacity-40">{dirty ? t("保存训练倾向", "Save training preferences", "トレーニング設定を保存") : t("训练倾向已保存", "Training preferences saved", "トレーニング設定は保存済み")}</button>
        </section>

        <details className="adaptive-disclosure control-card">
          <summary><span><strong>{t("快速描述倾向", "Quick preference input", "設定をすばやく入力")}</strong><small>{t("解析训练目标、时间、频率和排除动作", "Parse goals, time, frequency, and exclusions", "目標・時間・頻度・除外種目を解析")}</small></span><Chevron /></summary>
          <div className="soft-divider border-t p-4">
            <textarea aria-label={t("训练倾向描述", "Training preference description", "トレーニング設定の説明")} value={command} onChange={(event) => setCommand(event.target.value)} placeholder={t("例如：胸为主，中束增长，每 7 天 5 练，每次最多 70 分钟。", "Example: focus on chest, grow side delts, 5 sessions per 7 days, max 70 minutes.", "例：胸を優先、中部三角筋を伸ばす、7日5回、1回70分まで。") } className="number-cell min-h-24 w-full resize-y rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-fg outline-none placeholder:text-faint focus:border-accent" />
            <button type="button" onClick={parseCommand} disabled={!command.trim()} className="press mt-2 h-10 w-full rounded-md bg-fg text-[13px] font-semibold text-bg disabled:opacity-30">{t("解析倾向", "Parse preferences", "設定を解析")}</button>
            {recognized.length > 0 && <div className="mt-3 space-y-1 border-t border-border pt-3">{recognized.map((item) => <p key={item} className="text-[12px] leading-relaxed text-muted">{adaptiveText(locale, item)}</p>)}</div>}
            {parseClauses.length > 0 && <div className="adaptive-parse-results mt-3">{parseClauses.map((clause, index) => <div key={`${clause.source}:${index}`} className="adaptive-parse-clause" data-status={clause.status}><span>{clause.status === "recognized" ? t("已识别", "Recognized", "認識済み") : clause.status === "partial" ? t("部分识别", "Partial", "一部認識") : t("未识别", "Unresolved", "未認識")}</span><strong>{clause.source}</strong>{clause.unresolved && <small>{t("未识别部分", "Unresolved part", "未認識部分")}：{clause.unresolved}</small>}</div>)}</div>}
          </div>
        </details>

        <details className="adaptive-disclosure control-card">
          <summary><span><strong>{t("肌群与动作偏好", "Muscle and exercise preferences", "筋群と種目の設定")}</strong><small>{t("只在需要专项或避开动作时设置", "Set only for specialization or avoidance", "特化や回避が必要な場合のみ設定")}</small></span><Chevron /></summary>
          <div className="soft-divider border-t p-4">
            <FieldLabel>{t("肌群优先级", "Muscle priorities", "筋群の優先度")}</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-2">{MUSCLE_ORDER.map((muscle) => <MusclePriorityRow key={muscle} locale={locale} label={tr(MUSCLE_LABELS[muscle])} value={policy.musclePriorities[muscle]} onChange={(value) => setPolicy((current) => setMusclePriority(current, muscle, value === "default" ? undefined : value))} />)}</div>
            {policy.planTargets.length > 0 && <div className="mt-4"><FieldLabel>{t("已编译训练目标", "Compiled training targets", "解析済みトレーニング目標")}</FieldLabel><div className="adaptive-target-list">{policy.planTargets.map((target) => <div key={target.id} className="adaptive-target-row"><div><strong>{tr(target.label)}</strong><span>{[target.priority ? priorityLabel(locale, target.priority) : "", target.cycleTarget ? t(`周期 ${target.cycleTarget.low}–${target.cycleTarget.high} 组`, `Cycle ${target.cycleTarget.low}-${target.cycleTarget.high} sets`, `周期 ${target.cycleTarget.low}〜${target.cycleTarget.high}セット`) : "", target.maxDirectSetsPerSession != null ? t(`单次最多 ${target.maxDirectSetsPerSession} 直接组`, `Max ${target.maxDirectSetsPerSession} direct sets per session`, `1回最大${target.maxDirectSetsPerSession}直接セット`) : ""].filter(Boolean).join(" · ")}</span></div><button type="button" onClick={() => setPolicy((current) => removeMusclePlanTarget(current, target.id))} className="press grid h-9 w-9 place-items-center rounded-md text-faint hover:text-danger" aria-label={t(`清除${tr(target.label)}训练目标`, `Clear ${tr(target.label)} target`, `${tr(target.label)}の目標を解除`)} title={t("清除目标", "Clear target", "目標を解除")}><Trash2 size={16} strokeWidth={1.8} /></button></div>)}</div></div>}
            <FieldLabel className="mt-4">{t("模板动作偏好", "Template exercise preferences", "テンプレート種目の設定")}</FieldLabel>
            {templateExercises.length ? <div className="grid gap-2">{templateExercises.map((exercise) => (
              <div key={exercise.id} className="adaptive-exercise-pref-row control-strip rounded-md px-3 py-2">
                <span className="min-w-0 truncate text-[12px] font-medium text-fg">{tr(exercise.name)}</span>
                <select value={policy.exercisePreferences[exercise.id] ?? "neutral"} onChange={(event) => setPolicy((current) => mergeTrainingPolicy(current, { exercisePreferences: { ...current.exercisePreferences, [exercise.id]: event.target.value as ExercisePreference } }))} className="h-9 rounded-md border border-border bg-surface px-2 text-[12px] font-semibold text-muted outline-none focus:border-accent" aria-label={t(`${tr(exercise.name)}偏好`, `${tr(exercise.name)} preference`, `${tr(exercise.name)}の設定`)}>{PREFERENCE_VALUES.map((value) => <option key={value} value={value}>{preferenceLabel(locale, value)}</option>)}</select>
                <select value={policy.exerciseLocks[exercise.id] ?? "none"} onChange={(event) => setPolicy((current) => setExerciseLock(current, exercise.id, event.target.value === "none" ? undefined : event.target.value as ExerciseLockMode))} className="h-9 rounded-md border border-border bg-surface px-2 text-[12px] font-semibold text-muted outline-none focus:border-accent" aria-label={t(`${tr(exercise.name)}锁定方式`, `${tr(exercise.name)} lock mode`, `${tr(exercise.name)}の固定方法`)}>{LOCK_VALUES.map((value) => <option key={value} value={value}>{lockLabel(locale, value)}</option>)}</select>
              </div>
            ))}</div> : <p className="text-[12px] text-faint">{t("模板中还没有动作。", "No exercises are in templates yet.", "テンプレートに種目がありません。")}</p>}
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
            <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={downloadPolicyBackup} className="press h-10 rounded-md border border-border bg-surface text-[12px] font-semibold text-muted">{t("导出倾向", "Export preferences", "設定を書き出す")}</button><label className="press grid h-10 cursor-pointer place-items-center rounded-md border border-border bg-surface text-[12px] font-semibold text-muted">{t("导入倾向", "Import preferences", "設定を読み込む")}<input type="file" accept="application/json" aria-label={t("导入训练倾向", "Import training preferences", "トレーニング設定を読み込む")} className="sr-only" onChange={(event) => { void importPolicyFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>
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
  return <label className="control-strip rounded-md px-2 py-2 text-center"><span className="block text-[11px] text-faint">{label}</span><input type="number" aria-label={label} min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="tnum mt-1 h-8 w-full bg-transparent text-center text-[16px] font-semibold text-fg outline-none" /></label>;
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

function lockLabel(locale: Locale, value: ExerciseLockMode | "none") {
  if (value === "keep") return localeText(locale, "保留动作", "Keep", "種目を維持");
  if (value === "freeze") return localeText(locale, "完全冻结", "Freeze", "完全固定");
  return localeText(locale, "不锁定", "Unlocked", "固定なし");
}
