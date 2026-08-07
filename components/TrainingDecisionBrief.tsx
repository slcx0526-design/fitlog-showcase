"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { typeLabel } from "@/lib/exercises";
import { buildTrainingDecision, type TrainingDecision, type TrainingDecisionAction, type TrainingDecisionConfidence } from "@/lib/trainingDecision";
import type { ProgressionSuggestion } from "@/lib/prescription";
import { buildTemplateAdjustmentProposal, type TemplateAdjustmentProposal } from "@/lib/templateAdjustment";
import { useToast } from "@/lib/toast";
import type { TemplateItem } from "@/lib/types";
import { shouldAdvanceMicrocycle } from "@/lib/microcycle";
import type { IntegratedCoachTrigger } from "@/lib/integratedCoach";
import type { TrackDiagnosis } from "@/lib/trackDiagnosis";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function TrainingDecisionBrief({ compact = false, decision: providedDecision }: { compact?: boolean; decision?: TrainingDecision }) {
  const { data, setTemplateItems } = useStore();
  const { locale, tr } = useI18n();
  const toast = useToast();
  const today = useToday();
  const [previewKind, setPreviewKind] = useState<TrainingDecisionAction["kind"] | null>(null);
  const [undo, setUndo] = useState<{ templateId: string; templateName: string; items: TemplateItem[] } | null>(null);
  const decision = useMemo(
    () => providedDecision ?? buildTrainingDecision(data, today, compact ? "home" : "review"),
    [compact, data, providedDecision, today],
  );
  const cycleReady = shouldAdvanceMicrocycle(data, today);
  const actions = decision.actions.slice(0, compact ? 1 : 3);
  if (!actions.length) return null;

  const renderAction = (action: TrainingDecisionAction, index: number) => {
    const copy = actionCopy(action, locale, tr);
    const summarizedInReview = !compact && cycleReady && adjustableAction(action);
    const proposal = !compact && !cycleReady && adjustableAction(action) ? buildTemplateAdjustmentProposal(data, action) : null;
    const content = <>
      <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold " + (copy.tone === "warn" ? "bg-warn-soft text-warn" : copy.tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-fg">{copy.title}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{copy.detail}</span>
        {index === 0 && !compact ? <span className="mt-1.5 grid gap-1 text-[9px] leading-relaxed text-faint sm:grid-cols-2">
          <span><strong className="font-semibold text-muted">{tx(locale, "执行条件", "Condition", "実行条件")}</strong> · {conditionCopy(action, locale)}</span>
          <span><strong className="font-semibold text-muted">{tx(locale, "复查时间", "Review", "再確認")}</strong> · {recheckCopy(action, locale)}</span>
        </span> : null}
      </span>
      <span className="shrink-0 text-[11px] font-semibold text-accent" aria-hidden="true">{proposal ? tx(locale, "预览", "Preview", "確認") : summarizedInReview ? tx(locale, "已汇总", "Bundled", "統合済み") : "›"}</span>
    </>;
    return <div key={`${action.kind}-${index}`} className="soft-divider border-t first:border-t-0">
      {proposal ? <button type="button" onClick={() => setPreviewKind((current) => current === action.kind ? null : action.kind)} aria-expanded={previewKind === action.kind} className="press flex w-full items-center gap-3 px-3.5 py-3 text-left">{content}</button> : summarizedInReview ? <div className="flex items-center gap-3 px-3.5 py-3">{content}</div> : <Link href={action.href} className="press flex items-center gap-3 px-3.5 py-3">{content}</Link>}
      {proposal && previewKind === action.kind ? <ProposalPreview proposal={proposal} locale={locale} tr={tr} onCancel={() => setPreviewKind(null)} onApply={() => {
        setTemplateItems(proposal.templateId, proposal.nextItems);
        setUndo({ templateId: proposal.templateId, templateName: proposal.templateName, items: proposal.previousItems });
        setPreviewKind(null);
        toast.show(tx(locale, "模板已按建议调整", "Template adjusted", "提案どおりテンプレートを調整しました"));
      }} /> : null}
    </div>;
  };

  return <section className={"control-card overflow-hidden " + (compact ? "mb-3" : "mb-4")}>
    <div className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-faint">{tx(locale, "训练分析", "Training analysis", "トレーニング分析")}</p>
        <h2 className="mt-0.5 text-[14px] font-semibold text-fg">{decisionHeadline(actions[0], locale)}</h2>
        {!compact && <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{tx(locale, "先判断主要限制，再给下一步；不会自动改动记录。", "The main constraint is identified before a next step; records are never changed automatically.", "主な制約を先に判断し、次の一手を提案します。記録は自動変更しません。")}</p>}
      </div>
      <ConfidenceBadge confidence={decision.confidence} locale={locale} />
    </div>
    <div className="soft-divider border-t">
      {renderAction(actions[0], 0)}
      {!compact && actions.length > 1 ? <details className="soft-divider border-t">
        <summary className="press flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-[10px] font-semibold text-muted">
          <span>{tx(locale, `后续检查 ${actions.length - 1} 项`, `${actions.length - 1} follow-up check${actions.length > 2 ? "s" : ""}`, `後続確認 ${actions.length - 1} 件`)}</span>
          <span aria-hidden="true">+</span>
        </summary>
        <div className="soft-divider border-t">{actions.slice(1).map((action, index) => renderAction(action, index + 1))}</div>
      </details> : null}
    </div>
    {!compact && undo && <div className="soft-divider flex items-center gap-2 border-t px-3.5 py-2.5"><p className="min-w-0 flex-1 truncate text-[11px] text-muted">{tx(locale, `已调整「${tr(undo.templateName || "未命名模板")}」`, `Adjusted “${tr(undo.templateName || "Untitled template")}”`, `「${tr(undo.templateName || "無題のテンプレート")}」を調整済み`)}</p><button type="button" onClick={() => { setTemplateItems(undo.templateId, undo.items); setUndo(null); toast.show(tx(locale, "已撤销模板调整", "Template change undone", "テンプレート変更を取り消しました")); }} className="press shrink-0 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-accent">{tx(locale, "撤销", "Undo", "元に戻す")}</button></div>}
    {!compact && <DecisionEvidence decision={decision} locale={locale} />}
  </section>;
}

function adjustableAction(action: TrainingDecisionAction): action is Extract<TrainingDecisionAction, { kind: "simplifyPlan" | "reduceVolume" | "addVolume" }> {
  return action.kind === "simplifyPlan" || action.kind === "reduceVolume" || action.kind === "addVolume";
}

function ProposalPreview({ proposal, locale, tr, onCancel, onApply }: { proposal: TemplateAdjustmentProposal; locale: Locale; tr: (value: string) => string; onCancel: () => void; onApply: () => void }) {
  return <div className="mx-3.5 mb-3 rounded-lg bg-surface-2 p-2.5">
    <p className="text-[11px] font-semibold text-fg">{tx(locale, `将调整「${tr(proposal.templateName || "未命名模板")}」`, `Adjust “${tr(proposal.templateName || "Untitled template")}”`, `「${tr(proposal.templateName || "無題のテンプレート")}」を調整`)}</p>
    <div className="mt-2 space-y-1">{proposal.changes.map((change) => <p key={change.exerciseId} className="flex items-center justify-between gap-3 rounded-md bg-surface px-2 py-1.5 text-[11px] text-muted"><span className="min-w-0 truncate">{tr(change.exerciseName)}</span><span className="tnum shrink-0 font-semibold text-fg">{change.fromSets} → {change.toSets} {tx(locale, "组", "sets", "セット")}</span></p>)}</div>
    <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={onCancel} className="press h-9 rounded-lg border border-border bg-surface text-[11px] font-semibold text-muted">{tx(locale, "取消", "Cancel", "キャンセル")}</button><button type="button" onClick={onApply} className="press h-9 rounded-lg bg-fg text-[11px] font-semibold text-bg">{tx(locale, "确认应用", "Apply change", "変更を適用")}</button></div>
  </div>;
}

function ConfidenceBadge({ confidence, locale }: { confidence: TrainingDecisionConfidence; locale: Locale }) {
  const label = confidence === "ready"
    ? tx(locale, "证据充分", "Ready", "十分")
    : confidence === "building"
      ? tx(locale, "建立中", "Building", "構築中")
      : tx(locale, "样本少", "Low sample", "少数データ");
  return <span className={"shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold " + (confidence === "ready" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>{label}</span>;
}

function DecisionEvidence({ decision, locale }: { decision: ReturnType<typeof buildTrainingDecision>; locale: Locale }) {
  const evidence = decision.evidence;
  const projection = evidence.projectionComplete
    ? tx(locale, "完整", "Complete", "完全")
    : tx(locale, `${evidence.coveredRemainingSteps}/${evidence.remainingTrainingSteps} 步`, `${evidence.coveredRemainingSteps}/${evidence.remainingTrainingSteps} steps`, `${evidence.coveredRemainingSteps}/${evidence.remainingTrainingSteps} ステップ`);
  return <details className="soft-divider border-t px-3.5 py-2.5">
    <summary className="press cursor-pointer text-[10px] font-semibold text-muted">{tx(locale, "查看判断依据", "View decision evidence", "判断根拠を見る")}</summary>
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-faint">
      <EvidenceItem label={tx(locale, "确认训练", "Confirmed", "確認済み")} value={tx(locale, `28 天 ${evidence.sessions28d} 次`, `${evidence.sessions28d} / 28 days`, `28日 ${evidence.sessions28d} 回`)} />
      <EvidenceItem label={tx(locale, "近期密度", "Recent load", "直近頻度")} value={tx(locale, `7 天 ${evidence.sessions7d} 次`, `${evidence.sessions7d} / 7 days`, `7日 ${evidence.sessions7d} 回`)} />
      <EvidenceItem label={tx(locale, "整体难度", "Session effort", "全体負荷")} value={tx(locale, `${evidence.hardSessions}/${evidence.difficultySamples} 次吃力`, `${evidence.hardSessions}/${evidence.difficultySamples} hard`, `${evidence.hardSessions}/${evidence.difficultySamples} 回きつい`)} />
      <EvidenceItem label={tx(locale, "同轨道趋势", "Track trends", "トラック推移")} value={`${evidence.improvingTracks}↑ · ${evidence.plateauTracks}→ · ${evidence.regressingTracks}↓`} />
      <EvidenceItem label={tx(locale, "当前周期", "Current cycle", "現在周期")} value={`${evidence.cycleCompleted}/${evidence.cycleTotal}`} />
      <EvidenceItem label={tx(locale, "剩余容量预测", "Volume forecast", "残り容量予測")} value={projection} />
      <EvidenceItem label={tx(locale, "综合状态", "Readiness", "総合状態")} value={readinessLabel(evidence.readinessStatus, locale)} />
      <EvidenceItem label={tx(locale, "压力来源", "Pressure sources", "負荷要因")} value={evidence.readinessTriggers.length ? triggerLabels(evidence.readinessTriggers, locale).join(" · ") : tx(locale, "无交叉压力", "No corroborated pressure", "複合負荷なし")} />
    </div>
  </details>;
}

function EvidenceItem({ label, value }: { label: string; value: string }) {
  return <p className="flex min-w-0 items-center justify-between gap-2"><span>{label}</span><span className="tnum truncate font-semibold text-muted">{value}</span></p>;
}

function decisionHeadline(action: TrainingDecisionAction, locale: Locale) {
  if (action.kind === "continueSession" || action.kind === "reviewUnclosed") return tx(locale, "先确认训练记录", "Confirm the workout first", "まず記録を確定");
  if (action.kind === "recoveryPriority" || action.kind === "recoveryStep") return tx(locale, "当前恢复优先", "Recovery is the priority", "現在は回復優先");
  if (action.kind === "conservativeSession") return tx(locale, "今天保守执行处方", "Use a conservative prescription today", "今日は処方を保守的に実行");
  if (action.kind === "simplifyPlan" || action.kind === "reduceVolume") return tx(locale, "计划需要收敛", "The plan needs trimming", "計画を絞る段階");
  if (action.kind === "addVolume") return tx(locale, "周期末仍有容量缺口", "A volume gap remains", "周期末も容量不足");
  if (action.kind === "trackRegression" || action.kind === "trackPlateau") return tx(locale, "先处理局部表现", "Address the local performance issue", "局所パフォーマンスを優先");
  if (action.kind === "buildHistory") return tx(locale, "先建立可靠基线", "Build a reliable baseline", "信頼できる基準を作る");
  if (action.kind === "maintain") return tx(locale, "维持当前处方", "Maintain the current prescription", "現在の処方を維持");
  return tx(locale, "按训练周期继续", "Continue the training cycle", "トレーニング周期を継続");
}

function actionCopy(action: TrainingDecisionAction, locale: Locale, tr: (value: string) => string): { title: string; detail: string; tone: "accent" | "warn" | "muted" } {
  switch (action.kind) {
    case "continueSession":
      return {
        title: tx(locale, "先完成今天已经开始的训练", "Finish today's active workout first", "まず今日のトレーニングを完了"),
        detail: action.setCount > 0
          ? tx(locale, `已有 ${action.setCount} 个有效工作组，继续记录后再做本轮判断。`, `${action.setCount} effective sets are already logged. Finish the session before changing the plan.`, `有効セット ${action.setCount} 件を記録済み。先にセッションを完了してください。`)
          : tx(locale, "已选择训练类型，尚未记录有效工作组；继续本次记录后再做计划判断。", "A workout type is selected but no effective sets are logged yet. Continue this session before changing the plan.", "種別は選択済みですが有効セットは未記録です。このセッションを続けてから計画を判断します。"),
        tone: "accent",
      };
    case "reviewUnclosed":
      return { title: tx(locale, `确认 ${action.date.slice(5).replace("-", ".")} 的训练`, `Confirm the workout from ${action.date}`, `${action.date} の記録を確認`), detail: tx(locale, `已有 ${action.setCount} 个有效工作组，但训练未显式结束。确认后再纳入模板执行率和处方判断。`, `${action.setCount} effective sets exist, but the session was never closed. Confirm it before using it for plan decisions.`, `有効セット ${action.setCount} 件がありますが未終了です。確定後に計画判断へ使用します。`), tone: "warn" };
    case "recoveryPriority":
      return { title: tx(locale, "多项信号同时指向恢复受限", "Multiple signals point to limited recovery", "複数の指標が回復不足を示しています"), detail: tx(locale, `${triggerLabels(action.triggers, locale).join("、") || "训练表现"}形成交叉压力；近期吃力 ${action.hardSessions}/${action.difficultySamples}，持续回落动作 ${action.regressingExercises} 个${action.overTargetMuscles ? `，超量肌群 ${action.overTargetMuscles} 个` : ""}。本次不加重量或组数。`, `${triggerLabels(action.triggers, locale).join(", ") || "Training performance"} forms corroborated pressure; ${action.hardSessions}/${action.difficultySamples} recent sessions felt hard, ${action.regressingExercises} exercises regressed${action.overTargetMuscles ? `, and ${action.overTargetMuscles} muscles are over target` : ""}. Do not add load or sets today.`, `${triggerLabels(action.triggers, locale).join("・") || "トレーニング推移"}が複合負荷を示します。きつい ${action.hardSessions}/${action.difficultySamples}、低下種目 ${action.regressingExercises}${action.overTargetMuscles ? `、上限超過 ${action.overTargetMuscles} 筋群` : ""}。今日は重量もセットも増やしません。`), tone: "warn" };
    case "conservativeSession":
      return { title: tx(locale, "单项压力信号尚未被完全验证", "A pressure signal is not fully corroborated", "単独の負荷指標は未検証です"), detail: tx(locale, `${triggerLabels(action.triggers, locale).join("、")}出现偏紧信号。保持当前动作、重量和计划组数，不额外加量；完成后记录整体难度。`, `${triggerLabels(action.triggers, locale).join(", ")} shows pressure. Keep the current exercises, load, and planned sets without extra work, then log overall effort.`, `${triggerLabels(action.triggers, locale).join("・")}に負荷傾向があります。種目・重量・予定セットを維持し、追加せず終了後に難度を記録します。`), tone: "warn" };
    case "cycleComplete":
      return { title: tx(locale, "本轮已完成，下次训练进入新周期", "Cycle complete; the next workout starts a new one", "サイクル完了。次回から新サイクル"), detail: tx(locale, `已按顺序完成 ${action.completed}/${action.total} 步；旧记录保留在本轮。`, `${action.completed}/${action.total} steps were completed in order; existing logs stay in this cycle.`, `${action.completed}/${action.total} ステップ完了。既存ログはこのサイクルに残ります。`), tone: "accent" };
    case "nextStep":
      return { title: tx(locale, `下一步：${tr(action.label || typeLabel(action.type))}`, `Next: ${tr(action.label || typeLabel(action.type))}`, `次：${tr(action.label || typeLabel(action.type))}`), detail: tx(locale, `本轮 ${action.completed}/${action.total}；按训练循环继续，不受周一或周日影响。`, `Cycle ${action.completed}/${action.total}; continue the configured order regardless of calendar week.`, `サイクル ${action.completed}/${action.total}。曜日ではなく設定順で進めます。`), tone: "muted" };
    case "recoveryStep":
      return { title: tx(locale, `下一步：${tr(action.label)}`, `Next: ${tr(action.label)}`, `次：${tr(action.label)}`), detail: tx(locale, "当前循环安排恢复，不需要为了凑训练天数额外加量。", "The current loop calls for recovery; do not add work just to increase session count.", "現在は回復ステップです。回数を増やすための追加トレーニングは不要です。"), tone: "muted" };
    case "simplifyPlan":
      return { title: tx(locale, `「${tr(action.templateName)}」反复未完成`, `“${tr(action.templateName)}” is repeatedly unfinished`, `「${tr(action.templateName)}」が繰り返し未完了`), detail: tx(locale, `同一模板最近 ${action.sessions} 次平均完成 ${action.completionPct}%，每次约差 ${action.averageMissingSets} 组。只调整这个模板，不牵连其他训练日。`, `This same template averaged ${action.completionPct}% across ${action.sessions} sessions, about ${action.averageMissingSets} sets short. Only this template will be adjusted.`, `同じテンプレート直近 ${action.sessions} 回の平均完了率は ${action.completionPct}%、約 ${action.averageMissingSets} セット不足。このテンプレートだけを調整します。`), tone: "warn" };
    case "reduceVolume":
      return action.basis === "actual"
        ? { title: tx(locale, `${tr(MUSCLE_LABELS[action.muscle])} 已超过本轮上限`, `${tr(MUSCLE_LABELS[action.muscle])} is above the cycle target`, `${tr(MUSCLE_LABELS[action.muscle])} が周期上限超過`), detail: tx(locale, `已经完成 ${action.current} 直接有效组，上限 ${action.targetHigh}。下轮从${action.source ? `「${tr(action.source)}」` : "主要直接动作"}减少 ${action.suggestedSets} 组。`, `${action.current} direct effective sets are complete vs a ${action.targetHigh} ceiling. Remove ${action.suggestedSets} sets from ${action.source ? tr(action.source) : "the main direct movement"} next cycle.`, `直接有効 ${action.current}、上限 ${action.targetHigh}。次周期は${action.source ? `「${tr(action.source)}」` : "主な直接種目"}から ${action.suggestedSets} セット減らします。`), tone: "warn" }
        : { title: tx(locale, `${tr(MUSCLE_LABELS[action.muscle])} 按剩余计划预计超量`, `${tr(MUSCLE_LABELS[action.muscle])} is projected above target`, `${tr(MUSCLE_LABELS[action.muscle])} は計画上超過見込み`), detail: tx(locale, `当前 ${action.current} 组，完成剩余模板预计 ${action.projected}，上限 ${action.targetHigh}。预览只调整下轮模板。`, `${action.current} sets now, ${action.projected} projected after the remaining templates vs a ${action.targetHigh} ceiling. The preview changes only the next cycle.`, `現在 ${action.current}、残り完了後は ${action.projected} 見込み、上限 ${action.targetHigh}。次周期のテンプレートだけを調整します。`), tone: "warn" };
    case "addVolume":
      return { title: tx(locale, `${tr(MUSCLE_LABELS[action.muscle])} 完成本轮后仍预计不足`, `${tr(MUSCLE_LABELS[action.muscle])} remains low after the cycle forecast`, `${tr(MUSCLE_LABELS[action.muscle])} は周期完了後も不足見込み`), detail: tx(locale, `当前 ${action.current} 组，计入剩余模板预计 ${action.projected}，下限 ${action.targetLow}。下轮对应模板补 ${action.suggestedSets} 组后再复查。`, `${action.current} sets now and ${action.projected} after remaining templates vs a ${action.targetLow} floor. Add ${action.suggestedSets} sets next cycle, then review.`, `現在 ${action.current}、残り込みで ${action.projected} 見込み、下限 ${action.targetLow}。次周期に ${action.suggestedSets} セット追加して再確認します。`), tone: "accent" };
    case "trackRegression":
      return { title: tx(locale, `${tr(action.exerciseName)} 同轨道表现连续回落`, `${tr(action.exerciseName)} is regressing on this track`, `${tr(action.exerciseName)} の同一トラックが低下`), detail: `${tr(action.trackLabel)} · ${action.sessions} ${tx(locale, "次样本", "samples", "回")}${action.changePct == null ? "" : ` · ${action.changePct}%`}。${trackDiagnosisCopy(action.diagnosis, locale)}`, tone: "warn" };
    case "trackPlateau":
      return { title: tx(locale, `${tr(action.exerciseName)} 连续表现持平`, `${tr(action.exerciseName)} has remained flat`, `${tr(action.exerciseName)} が横ばい`), detail: `${tr(action.trackLabel)} · ${action.sessions} ${tx(locale, "次样本", "samples", "回")}。${trackDiagnosisCopy(action.diagnosis, locale)}`, tone: "muted" };
    case "buildHistory":
      return { title: tx(locale, "先建立可比较的训练样本", "Build comparable workout history first", "まず比較できる履歴を作成"), detail: tx(locale, `近 28 天只有 ${action.sessions} 次有效训练；完成至少 2 次同轨道记录后再判断表现，避免拿少量数据硬下结论。`, `Only ${action.sessions} valid sessions exist in 28 days. Complete at least two same-track sessions before judging performance.`, `28日間の有効トレーニングは ${action.sessions} 回です。同一トラックを2回以上完了してから判断します。`), tone: "muted" };
    case "maintain":
      return { title: tx(locale, "暂时不改计划", "Keep the current plan for now", "現時点では計画を維持"), detail: tx(locale, `近 28 天 ${action.sessions} 次训练，本轮 ${action.completed}/${action.total}${action.improvingTracks ? `，${action.improvingTracks} 条轨道正在提升` : ""}；没有足够证据要求增量或减量。`, `${action.sessions} sessions in 28 days and cycle ${action.completed}/${action.total}${action.improvingTracks ? `, with ${action.improvingTracks} improving tracks` : ""}; there is no strong evidence to change volume.`, `28日間 ${action.sessions} 回、周期 ${action.completed}/${action.total}${action.improvingTracks ? `、${action.improvingTracks} トラック向上` : ""}。容量変更の根拠はありません。`), tone: "accent" };
  }
}

function plateauNextStep(status: ProgressionSuggestion["status"] | undefined, locale: Locale) {
  if (status === "addWeight") return tx(locale, "处方条件已满足，下一次按单动作建议加重，不增加组数。", "The prescription is complete; follow the exercise load suggestion without adding sets.", "処方条件を満たしたため、セットを増やさず種目の増量提案に従います。");
  if (status === "addReps" || status === "finishSets") return tx(locale, "先保持重量并补齐目标次数或计划组数。", "Keep the load and finish the target reps or planned sets first.", "重量を維持し、目標回数か予定セットを先に満たします。");
  if (status === "stabilize" || status === "effortCheck") return tx(locale, "先稳定目标下限与整体难度，不同时加重量和组数。", "Stabilize the target floor and session effort; do not add load and sets together.", "目標下限と全体負荷を安定させ、重量とセットを同時に増やしません。");
  return tx(locale, "保持当前变量再观察一次，只改一个因素。", "Hold the current variables for one more session and change only one factor.", "現在の条件でもう1回確認し、変更は1要素だけにします。");
}

function trackDiagnosisCopy(diagnosis: TrackDiagnosis, locale: Locale) {
  if (diagnosis.constraint === "sessionEffort") return tx(locale, `近 ${diagnosis.difficultySamples} 次难度样本中 ${diagnosis.hardSessions} 次吃力；下次不加重，先完成处方并记录整体难度。`, `${diagnosis.hardSessions} of ${diagnosis.difficultySamples} effort samples felt hard. Hold load, complete the prescription, and log session effort next time.`, `難度サンプル ${diagnosis.difficultySamples} 回中 ${diagnosis.hardSessions} 回がきつめ。次回は増量せず処方を完了し、全体難度を記録します。`);
  if (diagnosis.constraint === "exerciseOrder") return tx(locale, `本次排第 ${diagnosis.latestPosition ?? "—"}，之前通常第 ${diagnosis.priorTypicalPosition ?? "—"}；下次恢复原顺序，重量和组数不变。`, `It was performed ${diagnosis.latestPosition ?? "—"} this time versus a typical ${diagnosis.priorTypicalPosition ?? "—"}. Restore the prior order and keep load and sets unchanged.`, `今回は ${diagnosis.latestPosition ?? "—"} 番目、通常は ${diagnosis.priorTypicalPosition ?? "—"} 番目。以前の順序に戻し、重量とセットを維持します。`);
  if (diagnosis.constraint === "muscleVolume") return tx(locale, `主目标肌群本周期 ${diagnosis.volume?.current ?? "—"} 个直接有效组，已高于 ${diagnosis.volume?.targetHigh ?? "—"} 的上限；先处理容量，不把回落当成加量理由。`, `The primary muscle has ${diagnosis.volume?.current ?? "—"} direct effective sets this cycle, above the ${diagnosis.volume?.targetHigh ?? "—"} ceiling. Address volume before treating regression as a reason to add work.`, `主働筋は現周期 ${diagnosis.volume?.current ?? "—"} 直接有効セットで、上限 ${diagnosis.volume?.targetHigh ?? "—"} 超過。低下を増量理由にせず容量を先に調整します。`);
  if (diagnosis.constraint === "prescription" || diagnosis.constraint === "onTrack") return plateauNextStep(diagnosis.progressionStatus, locale);
  return tx(locale, "恢复、容量和动作顺序都没有形成明确解释；保持变量不变，收集两次可比记录。", "Recovery, volume, and exercise order do not yet explain the change. Hold variables and collect two comparable records.", "回復・容量・種目順のいずれも明確な説明になっていません。条件を維持し、比較可能な記録を2回集めます。");
}

function conditionCopy(action: TrainingDecisionAction, locale: Locale) {
  if (action.kind === "continueSession" || action.kind === "reviewUnclosed") return tx(locale, "先确认现有记录，不调整计划", "Confirm the existing record before changing the plan", "既存記録を確定してから計画を変更");
  if (action.kind === "recoveryPriority") return tx(locale, "不增加重量、组数或高强度有氧", "No added load, sets, or high-intensity cardio", "重量・セット・高強度有酸素を追加しない");
  if (action.kind === "conservativeSession") return tx(locale, "保持当前处方，不追加训练量", "Keep the prescription without extra work", "現在の処方を維持し追加しない");
  if (action.kind === "simplifyPlan") return tx(locale, "只改这一份模板并先看预览", "Change only this template after reviewing the preview", "このテンプレートだけをプレビュー後に変更");
  if (action.kind === "reduceVolume" || action.kind === "addVolume") return tx(locale, "只调整下轮模板，本轮记录不变", "Adjust only the next cycle; keep this cycle intact", "次周期のみ調整し現周期は保持");
  if (action.kind === "trackRegression" || action.kind === "trackPlateau") return tx(locale, "只改一个变量，使用同一轨道比较", "Change one variable and compare within the same track", "1要素だけ変更し同一トラックで比較");
  if (action.kind === "buildHistory") return tx(locale, "使用同一动作和同一训练轨道", "Use the same exercise and progression track", "同じ種目・進行トラックを使用");
  return tx(locale, "按当前周期顺序执行", "Follow the current cycle order", "現在の周期順で実行");
}

function recheckCopy(action: TrainingDecisionAction, locale: Locale) {
  if (action.kind === "continueSession" || action.kind === "reviewUnclosed") return tx(locale, "记录确认后立即重算", "Recalculate immediately after confirmation", "記録確定後すぐ再計算");
  if (action.kind === "recoveryPriority" || action.kind === "conservativeSession") return tx(locale, "下一次状态记录或训练完成后", "After the next check-in or completed session", "次の状態記録または完了セッション後");
  if (action.kind === "simplifyPlan") return tx(locale, "同模板再完成 2 次后", "After 2 more sessions with this template", "同テンプレートをさらに2回完了後");
  if (action.kind === "reduceVolume" || action.kind === "addVolume" || action.kind === "cycleComplete") return tx(locale, "下一个完整微周期结束时", "At the end of the next complete microcycle", "次の完全なマイクロサイクル終了時");
  if (action.kind === "trackRegression" || action.kind === "trackPlateau") return tx(locale, `完成 ${action.diagnosis.recheckSessions} 次同轨道训练后`, `After ${action.diagnosis.recheckSessions} completed same-track session${action.diagnosis.recheckSessions === 1 ? "" : "s"}`, `同一トラックを ${action.diagnosis.recheckSessions} 回完了後`);
  if (action.kind === "buildHistory") return tx(locale, "至少 2 次同轨道训练后", "After at least 2 same-track sessions", "同一トラックを2回以上完了後");
  return tx(locale, "当前微周期结束时", "At the end of the current microcycle", "現在のマイクロサイクル終了時");
}

function readinessLabel(status: ReturnType<typeof buildTrainingDecision>["evidence"]["readinessStatus"], locale: Locale) {
  if (status === "recover") return tx(locale, "恢复优先", "Recovery", "回復優先");
  if (status === "caution") return tx(locale, "保守执行", "Conservative", "保守実行");
  if (status === "ready") return tx(locale, "按计划", "Ready", "計画どおり");
  return tx(locale, "收集中", "Collecting", "収集中");
}

function triggerLabels(triggers: IntegratedCoachTrigger[], locale: Locale) {
  const labels: Record<IntegratedCoachTrigger, string> = {
    subjectiveLow: tx(locale, "今日状态", "today's check-in", "今日の状態"),
    sustainedLow: tx(locale, "近 7 天状态", "7-day recovery", "7日間の状態"),
    trainingPressure: tx(locale, "训练表现与容量", "training performance and volume", "パフォーマンスと容量"),
    healthCaution: tx(locale, "健康单项基线", "one health baseline", "健康単項基準"),
    healthLow: tx(locale, "健康多项基线", "multiple health baselines", "健康複数基準"),
    fuelGap: tx(locale, "已记录能量摄入", "logged energy intake", "記録済み摂取量"),
    cardioPressure: tx(locale, "近期高强度有氧", "recent high-intensity cardio", "直近の高強度有酸素"),
    cutTooFast: tx(locale, "减脂速度", "cut pace", "減量ペース"),
  };
  return triggers.map((trigger) => labels[trigger]);
}
