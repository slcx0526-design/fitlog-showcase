"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { typeLabel } from "@/lib/exercises";
import { buildTrainingDecision, type TrainingDecisionAction, type TrainingDecisionConfidence } from "@/lib/trainingDecision";
import type { ProgressionSuggestion } from "@/lib/prescription";
import { buildTemplateAdjustmentProposal, type TemplateAdjustmentProposal } from "@/lib/templateAdjustment";
import { useToast } from "@/lib/toast";
import type { TemplateItem } from "@/lib/types";
import { shouldAdvanceMicrocycle } from "@/lib/microcycle";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function TrainingDecisionBrief({ compact = false }: { compact?: boolean }) {
  const { data, setTemplateItems } = useStore();
  const { locale, tr } = useI18n();
  const toast = useToast();
  const today = useToday();
  const [previewKind, setPreviewKind] = useState<TrainingDecisionAction["kind"] | null>(null);
  const [undo, setUndo] = useState<{ templateId: string; templateName: string; items: TemplateItem[] } | null>(null);
  const decision = useMemo(() => buildTrainingDecision(data, today, compact ? "home" : "review"), [compact, data, today]);
  const cycleReady = shouldAdvanceMicrocycle(data, today);
  const actions = decision.actions.slice(0, compact ? 1 : 3);
  if (!actions.length) return null;

  return <section className={"control-card overflow-hidden " + (compact ? "mb-3" : "mb-4")}>
    <div className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">FITLOG ANALYSIS</p>
        <h2 className="mt-0.5 text-[14px] font-semibold text-fg">{decisionHeadline(actions[0], locale)}</h2>
        {!compact && <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{tx(locale, "先判断主要限制，再给下一步；不会自动改动记录。", "The main constraint is identified before a next step; records are never changed automatically.", "主な制約を先に判断し、次の一手を提案します。記録は自動変更しません。")}</p>}
      </div>
      <ConfidenceBadge confidence={decision.confidence} locale={locale} />
    </div>
    <div className="soft-divider border-t">
      {actions.map((action, index) => {
        const copy = actionCopy(action, locale, tr);
        const summarizedInReview = !compact && cycleReady && adjustableAction(action);
        const proposal = !compact && !cycleReady && adjustableAction(action) ? buildTemplateAdjustmentProposal(data, action) : null;
        const content = <>
          <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold " + (copy.tone === "warn" ? "bg-warn-soft text-warn" : copy.tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>{index + 1}</span>
          <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-fg">{copy.title}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{copy.detail}</span></span>
          <span className="shrink-0 text-[11px] font-semibold text-accent" aria-hidden="true">{proposal ? tx(locale, "预览", "Preview", "確認") : summarizedInReview ? tx(locale, "已汇总", "Bundled", "統合済み") : "›"}</span>
        </>;
        return <div key={action.kind} className="soft-divider border-t first:border-t-0">
          {proposal ? <button type="button" onClick={() => setPreviewKind((current) => current === action.kind ? null : action.kind)} aria-expanded={previewKind === action.kind} className="press flex w-full items-center gap-3 px-3.5 py-3 text-left">{content}</button> : summarizedInReview ? <div className="flex items-center gap-3 px-3.5 py-3">{content}</div> : <Link href={action.href} className="press flex items-center gap-3 px-3.5 py-3">{content}</Link>}
          {proposal && previewKind === action.kind && <ProposalPreview proposal={proposal} locale={locale} tr={tr} onCancel={() => setPreviewKind(null)} onApply={() => {
            setTemplateItems(proposal.templateId, proposal.nextItems);
            setUndo({ templateId: proposal.templateId, templateName: proposal.templateName, items: proposal.previousItems });
            setPreviewKind(null);
            toast.show(tx(locale, "模板已按建议调整", "Template adjusted", "提案どおりテンプレートを調整しました"));
          }} />}
        </div>;
      })}
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
    </div>
  </details>;
}

function EvidenceItem({ label, value }: { label: string; value: string }) {
  return <p className="flex min-w-0 items-center justify-between gap-2"><span>{label}</span><span className="tnum truncate font-semibold text-muted">{value}</span></p>;
}

function decisionHeadline(action: TrainingDecisionAction, locale: Locale) {
  if (action.kind === "continueSession" || action.kind === "reviewUnclosed") return tx(locale, "先确认训练记录", "Confirm the workout first", "まず記録を確定");
  if (action.kind === "recoveryPriority" || action.kind === "recoveryStep") return tx(locale, "当前恢复优先", "Recovery is the priority", "現在は回復優先");
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
      return { title: tx(locale, "先完成今天已经开始的训练", "Finish today's active workout first", "まず今日のトレーニングを完了"), detail: tx(locale, `已有 ${action.setCount} 个有效工作组，继续记录后再做本轮判断。`, `${action.setCount} effective sets are already logged. Finish the session before changing the plan.`, `有効セット ${action.setCount} 件を記録済み。先にセッションを完了してください。`), tone: "accent" };
    case "reviewUnclosed":
      return { title: tx(locale, `确认 ${action.date.slice(5).replace("-", ".")} 的训练`, `Confirm the workout from ${action.date}`, `${action.date} の記録を確認`), detail: tx(locale, `已有 ${action.setCount} 个有效工作组，但训练未显式结束。确认后再纳入模板执行率和处方判断。`, `${action.setCount} effective sets exist, but the session was never closed. Confirm it before using it for plan decisions.`, `有効セット ${action.setCount} 件がありますが未終了です。確定後に計画判断へ使用します。`), tone: "warn" };
    case "recoveryPriority":
      return { title: tx(locale, "多项信号同时指向恢复受限", "Multiple signals point to limited recovery", "複数の指標が回復不足を示しています"), detail: tx(locale, `最近 ${action.difficultySamples} 次难度记录中 ${action.hardSessions} 次吃力，${action.regressingExercises} 个动作持续回落${action.overTargetMuscles ? `，${action.overTargetMuscles} 个肌群已超量` : ""}。下一步先安排恢复或轻量训练，不加组数。`, `${action.hardSessions} of ${action.difficultySamples} recent sessions felt hard and ${action.regressingExercises} exercises regressed${action.overTargetMuscles ? `, with ${action.overTargetMuscles} muscles above target` : ""}. Recover or train light before adding work.`, `直近 ${action.difficultySamples} 回中 ${action.hardSessions} 回がきつく、${action.regressingExercises} 種目が低下${action.overTargetMuscles ? `、${action.overTargetMuscles} 筋群が上限超過` : ""}。まず回復か軽量日にします。`), tone: "warn" };
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
      return { title: tx(locale, `${tr(action.exerciseName)} 同轨道表现连续回落`, `${tr(action.exerciseName)} is regressing on this track`, `${tr(action.exerciseName)} の同一トラックが低下`), detail: tx(locale, `${tr(action.trackLabel)} · ${action.sessions} 次样本${action.changePct == null ? "" : ` · 最近 ${action.changePct}%`}。下次先维持重量，检查动作顺序和恢复，不急着加量。`, `${tr(action.trackLabel)} · ${action.sessions} samples${action.changePct == null ? "" : ` · latest ${action.changePct}%`}. Hold load and check exercise order and recovery before adding volume.`, `${tr(action.trackLabel)}・${action.sessions} 回${action.changePct == null ? "" : `・直近 ${action.changePct}%`}。次回は重量を維持し、順序と回復を確認します。`), tone: "warn" };
    case "trackPlateau":
      return { title: tx(locale, `${tr(action.exerciseName)} 连续表现持平`, `${tr(action.exerciseName)} has remained flat`, `${tr(action.exerciseName)} が横ばい`), detail: `${tr(action.trackLabel)} · ${action.sessions} ${tx(locale, "次样本", "samples", "回")}。${plateauNextStep(action.progressionStatus, locale)}`, tone: "muted" };
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
