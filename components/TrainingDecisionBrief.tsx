"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { typeLabel } from "@/lib/exercises";
import { buildTrainingDecision, type TrainingDecisionAction, type TrainingDecisionConfidence } from "@/lib/trainingDecision";
import { buildTemplateAdjustmentProposal, type TemplateAdjustmentProposal } from "@/lib/templateAdjustment";
import { useToast } from "@/lib/toast";
import type { TemplateItem } from "@/lib/types";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function TrainingDecisionBrief({ compact = false }: { compact?: boolean }) {
  const { data, setTemplateItems } = useStore();
  const { locale, tr } = useI18n();
  const toast = useToast();
  const today = useToday();
  const [previewKind, setPreviewKind] = useState<TrainingDecisionAction["kind"] | null>(null);
  const [undo, setUndo] = useState<{ templateId: string; templateName: string; items: TemplateItem[] } | null>(null);
  const decision = useMemo(() => buildTrainingDecision(data, today, compact ? "home" : "review"), [compact, data, today]);
  const actions = decision.actions.slice(0, compact ? 1 : 3);
  if (!actions.length) return null;

  return <section className={"control-card overflow-hidden " + (compact ? "mb-3" : "mb-4")}>
    <div className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">FITLOG REVIEW</p>
        <h2 className="mt-0.5 text-[14px] font-semibold text-fg">{tx(locale, compact ? "本轮判断" : "训练行动建议", compact ? "Cycle decision" : "Training actions", compact ? "サイクル判断" : "トレーニング提案")}</h2>
      </div>
      <ConfidenceBadge confidence={decision.confidence} locale={locale} />
    </div>
    <div className="soft-divider border-t">
      {actions.map((action, index) => {
        const copy = actionCopy(action, locale, tr);
        const proposal = !compact && adjustableAction(action) ? buildTemplateAdjustmentProposal(data, action) : null;
        const content = <>
          <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold " + (copy.tone === "warn" ? "bg-warn-soft text-warn" : copy.tone === "accent" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>{index + 1}</span>
          <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-fg">{copy.title}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-muted">{copy.detail}</span></span>
          <span className="shrink-0 text-[11px] font-semibold text-accent" aria-hidden="true">{proposal ? tx(locale, "预览", "Preview", "確認") : "›"}</span>
        </>;
        return <div key={action.kind} className="soft-divider border-t first:border-t-0">
          {proposal ? <button type="button" onClick={() => setPreviewKind((current) => current === action.kind ? null : action.kind)} aria-expanded={previewKind === action.kind} className="press flex w-full items-center gap-3 px-3.5 py-3 text-left">{content}</button> : <Link href={action.href} className="press flex items-center gap-3 px-3.5 py-3">{content}</Link>}
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
    {!compact && <p className="soft-divider border-t px-3.5 py-2 text-[10px] text-faint">{tx(locale, `证据：近 28 天 ${decision.evidence.sessions28d} 次训练 · ${decision.evidence.trendTracks} 条可比较轨道 · 本轮 ${decision.evidence.cycleCompleted}/${decision.evidence.cycleTotal}`, `Evidence: ${decision.evidence.sessions28d} sessions in 28 days · ${decision.evidence.trendTracks} comparable tracks · cycle ${decision.evidence.cycleCompleted}/${decision.evidence.cycleTotal}`, `根拠：28日間 ${decision.evidence.sessions28d} 回 · 比較可能 ${decision.evidence.trendTracks} トラック · サイクル ${decision.evidence.cycleCompleted}/${decision.evidence.cycleTotal}`)}</p>}
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

function actionCopy(action: TrainingDecisionAction, locale: Locale, tr: (value: string) => string): { title: string; detail: string; tone: "accent" | "warn" | "muted" } {
  switch (action.kind) {
    case "continueSession":
      return { title: tx(locale, "先完成今天已经开始的训练", "Finish today's active workout first", "まず今日のトレーニングを完了"), detail: tx(locale, `已有 ${action.setCount} 个有效工作组，继续记录后再做本轮判断。`, `${action.setCount} effective sets are already logged. Finish the session before changing the plan.`, `有効セット ${action.setCount} 件を記録済み。先にセッションを完了してください。`), tone: "accent" };
    case "cycleComplete":
      return { title: tx(locale, "本轮已完成，下次训练进入新周期", "Cycle complete; the next workout starts a new one", "サイクル完了。次回から新サイクル"), detail: tx(locale, `已按顺序完成 ${action.completed}/${action.total} 步；旧记录保留在本轮。`, `${action.completed}/${action.total} steps were completed in order; existing logs stay in this cycle.`, `${action.completed}/${action.total} ステップ完了。既存ログはこのサイクルに残ります。`), tone: "accent" };
    case "nextStep":
      return { title: tx(locale, `下一步：${tr(action.label || typeLabel(action.type))}`, `Next: ${tr(action.label || typeLabel(action.type))}`, `次：${tr(action.label || typeLabel(action.type))}`), detail: tx(locale, `本轮 ${action.completed}/${action.total}；按训练循环继续，不受周一或周日影响。`, `Cycle ${action.completed}/${action.total}; continue the configured order regardless of calendar week.`, `サイクル ${action.completed}/${action.total}。曜日ではなく設定順で進めます。`), tone: "muted" };
    case "recoveryStep":
      return { title: tx(locale, `下一步：${tr(action.label)}`, `Next: ${tr(action.label)}`, `次：${tr(action.label)}`), detail: tx(locale, "当前循环安排恢复，不需要为了凑训练天数额外加量。", "The current loop calls for recovery; do not add work just to increase session count.", "現在は回復ステップです。回数を増やすための追加トレーニングは不要です。"), tone: "muted" };
    case "simplifyPlan":
      return { title: tx(locale, "模板长度超过近期可执行量", "Recent execution suggests the template is too long", "最近の実行量に対してテンプレートが長すぎます"), detail: tx(locale, `最近 ${action.sessions} 次平均完成 ${action.completionPct}%，每次约差 ${action.averageMissingSets} 组。先删一个低优先动作或减少 ${action.averageMissingSets} 组。`, `The last ${action.sessions} sessions averaged ${action.completionPct}% completion, about ${action.averageMissingSets} sets short. Remove one low-priority movement or ${action.averageMissingSets} sets.`, `直近 ${action.sessions} 回の完了率は平均 ${action.completionPct}%（約 ${action.averageMissingSets} セット不足）。優先度の低い種目かセットを減らします。`), tone: "warn" };
    case "reduceVolume":
      return { title: tx(locale, `${tr(MUSCLE_LABELS[action.muscle])} 已超过本轮上限`, `${tr(MUSCLE_LABELS[action.muscle])} is above the cycle target`, `${tr(MUSCLE_LABELS[action.muscle])} がサイクル上限超過`), detail: tx(locale, `直接有效 ${action.current}，上限 ${action.targetHigh}。下次先从${action.source ? `「${tr(action.source)}」` : "主要直接动作"}减少 ${action.suggestedSets} 组。`, `${action.current} direct effective sets vs ${action.targetHigh}. Remove ${action.suggestedSets} sets from ${action.source ? tr(action.source) : "the main direct movement"} next time.`, `直接有効 ${action.current}、上限 ${action.targetHigh}。次回は${action.source ? `「${tr(action.source)}」` : "主な直接種目"}から ${action.suggestedSets} セット減らします。`), tone: "warn" };
    case "addVolume":
      return { title: tx(locale, `${tr(MUSCLE_LABELS[action.muscle])} 接近周期末仍不足`, `${tr(MUSCLE_LABELS[action.muscle])} remains low near cycle end`, `${tr(MUSCLE_LABELS[action.muscle])} が終盤でも不足`), detail: tx(locale, `直接有效 ${action.current}，下限 ${action.targetLow}。下个对应训练日补 ${action.suggestedSets} 组后再复查。`, `${action.current} direct effective sets vs ${action.targetLow}. Add ${action.suggestedSets} sets on the next matching day, then review again.`, `直接有効 ${action.current}、下限 ${action.targetLow}。次の該当日に ${action.suggestedSets} セット追加して再確認します。`), tone: "accent" };
    case "trackRegression":
      return { title: tx(locale, `${tr(action.exerciseName)} 同轨道表现连续回落`, `${tr(action.exerciseName)} is regressing on this track`, `${tr(action.exerciseName)} の同一トラックが低下`), detail: tx(locale, `${tr(action.trackLabel)} · ${action.sessions} 次样本${action.changePct == null ? "" : ` · 最近 ${action.changePct}%`}。下次先维持重量，检查动作顺序和恢复，不急着加量。`, `${tr(action.trackLabel)} · ${action.sessions} samples${action.changePct == null ? "" : ` · latest ${action.changePct}%`}. Hold load and check exercise order and recovery before adding volume.`, `${tr(action.trackLabel)}・${action.sessions} 回${action.changePct == null ? "" : `・直近 ${action.changePct}%`}。次回は重量を維持し、順序と回復を確認します。`), tone: "warn" };
    case "trackPlateau":
      return { title: tx(locale, `${tr(action.exerciseName)} 已连续进入平台`, `${tr(action.exerciseName)} has reached a plateau`, `${tr(action.exerciseName)} が停滞`), detail: tx(locale, `${tr(action.trackLabel)} · ${action.sessions} 次样本。先补目标次数或调整动作顺序，不用同时加重量和组数。`, `${tr(action.trackLabel)} · ${action.sessions} samples. Add target reps or change exercise order; do not add load and sets together.`, `${tr(action.trackLabel)}・${action.sessions} 回。まず回数か順序を調整し、重量とセットを同時に増やしません。`), tone: "muted" };
    case "buildHistory":
      return { title: tx(locale, "先建立可比较的训练样本", "Build comparable workout history first", "まず比較できる履歴を作成"), detail: tx(locale, `近 28 天只有 ${action.sessions} 次有效训练；完成至少 2 次同轨道记录后再判断表现，避免拿少量数据硬下结论。`, `Only ${action.sessions} valid sessions exist in 28 days. Complete at least two same-track sessions before judging performance.`, `28日間の有効トレーニングは ${action.sessions} 回です。同一トラックを2回以上完了してから判断します。`), tone: "muted" };
    case "maintain":
      return { title: tx(locale, "暂时不改计划", "Keep the current plan for now", "現時点では計画を維持"), detail: tx(locale, `近 28 天 ${action.sessions} 次训练，本轮 ${action.completed}/${action.total}；目前没有足够证据要求增量或减量。`, `${action.sessions} sessions in 28 days and cycle ${action.completed}/${action.total}; there is no strong evidence to add or remove work.`, `28日間 ${action.sessions} 回、サイクル ${action.completed}/${action.total}。増減を求める十分な根拠はありません。`), tone: "accent" };
  }
}
