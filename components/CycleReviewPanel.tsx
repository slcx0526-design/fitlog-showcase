"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { buildCycleReview } from "@/lib/cyclePlanning";
import { currentMicrocycleProgress } from "@/lib/microcycle";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import type { TrainingCyclePhase } from "@/lib/types";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function CycleReviewPanel() {
  const { data, applyCycleReview } = useStore();
  const today = useToday();
  const toast = useToast();
  const { locale, tr } = useI18n();
  const review = useMemo(() => buildCycleReview(data, today), [data, today]);
  const progress = useMemo(() => currentMicrocycleProgress(data, today), [data, today]);
  const [phase, setPhase] = useState<TrainingCyclePhase>(review.recommendedPhase);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setPhase(review.recommendedPhase);
    setConfirm(false);
  }, [review.id, review.recommendedPhase, review.status]);

  const mesocycle = data.mesocycle;
  const sourceDeload = review.sourcePhase === "deload";
  const blockingDate = review.blockingWorkoutDate;

  function apply() {
    const applied = applyCycleReview(review, today, phase);
    if (!applied) {
      toast.show(tx(locale, "复盘已过期，请按当前数据重新查看", "The review is stale. Reopen it from the current data.", "レビューが古くなっています。最新データで再確認してください"));
      setConfirm(false);
      return;
    }
    toast.show(phase === "deload"
      ? tx(locale, "调整已应用，恢复周期已开始", "Changes applied and the recovery cycle has started", "変更を適用し、回復サイクルを開始しました")
      : tx(locale, "调整已应用，下一周期已开始", "Changes applied and the next cycle has started", "変更を適用し、次のサイクルを開始しました"));
  }

  return <section className="control-card overflow-hidden">
    <div className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">CYCLE PLAN</p>
        <h2 className="mt-0.5 text-[14px] font-semibold text-fg">{tx(locale, "训练周期处方", "Training cycle prescription", "トレーニング周期処方")}</h2>
        <p className="mt-0.5 text-[10px] text-faint">{sourceDeload
          ? tx(locale, "当前为恢复周期，完成后回到新的建设阶段。", "This is a recovery cycle; completion returns to a new build phase.", "現在は回復サイクルです。完了後は新しい構築段階へ戻ります。")
          : tx(locale, `中周期第 ${mesocycle?.currentBuildCycle ?? 1}/${mesocycle?.targetBuildCycles ?? 4} 个建设周期`, `Build cycle ${mesocycle?.currentBuildCycle ?? 1}/${mesocycle?.targetBuildCycles ?? 4} in this mesocycle`, `このメゾサイクルの構築 ${mesocycle?.currentBuildCycle ?? 1}/${mesocycle?.targetBuildCycles ?? 4}`)}</p>
      </div>
      <span className={"tnum shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold " + (review.status === "ready" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>{progress.completed}/{progress.pattern.length}</span>
    </div>

    {review.status !== "ready" ? <div className="soft-divider flex items-center gap-3 border-t px-3.5 py-3">
      <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold text-fg">{blockingDate ? tx(locale, `先确认 ${blockingDate.slice(5).replace("-", ".")} 的训练`, `Confirm the workout from ${blockingDate}`, `${blockingDate} の記録を確認`) : review.status === "applied" ? tx(locale, "本轮调整已经应用", "This cycle review was already applied", "この周期レビューは適用済みです") : data.microcycle?.sourceReviewId ? tx(locale, "上轮复盘已应用，本轮重新收集证据", "The previous review was applied; this cycle is collecting fresh evidence", "前周期レビューを適用済み。今周期の新しい根拠を収集中です") : tx(locale, "按顺序完成本轮后生成复盘", "Complete the cycle in order to generate its review", "順番どおり周期を完了するとレビューを生成します")}</p><p className="mt-0.5 text-[10px] text-muted">{blockingDate ? tx(locale, "未结束记录只作参考，确认后才能进入周期判断。", "Unclosed work stays reference-only until you confirm it.", "未終了記録は確認するまで参考扱いです。") : progress.next ? tx(locale, `下一步：${tr(progress.next.label)}`, `Next: ${tr(progress.next.label)}`, `次：${tr(progress.next.label)}`) : tx(locale, "等待确认训练记录", "Waiting for confirmed workout records", "トレーニング記録の確定待ち")}</p></div>
      <Link href={blockingDate ? `/train?date=${blockingDate}` : "/schedule"} className="press shrink-0 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-accent">{blockingDate ? tx(locale, "确认记录", "Confirm log", "記録を確認") : tx(locale, "查看计划", "View plan", "計画を見る")}</Link>
    </div> : <>
      <div className="soft-divider border-t px-3.5 py-3">
        <div className="grid grid-cols-2 gap-2">
          <Evidence label={tx(locale, "周期完成", "Cycle completion", "周期完了")} value={`${review.evidence.completedSteps}/${review.evidence.totalSteps}`} />
          <Evidence label={tx(locale, "建议结果", "Suggestion outcomes", "提案結果")} value={review.evidence.suggestionOutcomes ? `${review.evidence.achievedSuggestions}/${review.evidence.suggestionOutcomes}` : "—"} />
          <Evidence label={tx(locale, "整体吃力", "Hard sessions", "きつい回")} value={`${review.evidence.hardSessions}/${review.evidence.difficultySamples}`} />
          <Evidence label={tx(locale, "持续回落", "Regressing", "継続低下")} value={String(review.evidence.regressingExercises)} />
        </div>

        <div className="mt-3 rounded-lg bg-surface-2 p-2.5">
          <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-fg">{tx(locale, "下一轮模板调整", "Next-cycle template changes", "次周期のテンプレート変更")}</p><span className="tnum text-[10px] text-faint">{review.changes.length}</span></div>
          {review.changes.length ? <div className="mt-2 space-y-1.5">{review.changes.map((change) => <p key={`${change.templateId}-${change.exerciseId}`} className="flex items-center justify-between gap-3 rounded-md bg-surface px-2 py-1.5 text-[11px] text-muted"><span className="min-w-0 truncate">{tr(change.templateName || tx(locale, "未命名模板", "Untitled template", "無題テンプレート"))} · {tr(change.exerciseName)}</span><span className="tnum shrink-0 font-semibold text-fg">{change.fromSets} → {change.toSets}</span></p>)}</div> : <p className="mt-1.5 text-[10px] leading-relaxed text-muted">{review.evidence.queuedTemplateChanges
            ? tx(locale, `已有 ${review.evidence.queuedTemplateChanges} 项下轮模板修改，不再自动叠加。`, `${review.evidence.queuedTemplateChanges} next-cycle template changes are already queued, so no automatic change is stacked.`, `次周期向け変更 ${review.evidence.queuedTemplateChanges} 件があるため、自動変更を重ねません。`)
            : tx(locale, "没有足够证据修改组数，下一轮保持当前模板。", "There is not enough evidence to change set counts; the next cycle keeps the current templates.", "セット数を変える根拠が不足しているため、次周期も現在のテンプレートを維持します。")}</p>}
        </div>

        <div className="control-strip mt-3 grid grid-cols-2 gap-1 rounded-xl p-1" role="group" aria-label={tx(locale, "下一周期类型", "Next cycle type", "次周期タイプ")}>
          <button type="button" onClick={() => setPhase("build")} aria-pressed={phase === "build"} className={"choice-chip press h-9 text-[12px] font-semibold " + (phase === "build" ? "bg-fg text-bg" : "text-muted")}>{tx(locale, "正常推进", "Build cycle", "構築周期")}</button>
          <button type="button" onClick={() => setPhase("deload")} disabled={sourceDeload} aria-pressed={phase === "deload"} className={"choice-chip press h-9 text-[12px] font-semibold disabled:opacity-30 " + (phase === "deload" ? "bg-warn text-white" : "text-muted")}>{tx(locale, "恢复周期", "Recovery cycle", "回復周期")}</button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">{phase === "deload"
          ? tx(locale, "恢复周期使用约 60% 工作组快照和独立轨道，不修改原模板，也不触发加重。", "The recovery cycle uses roughly 60% set snapshots and isolated tracks. It does not alter base templates or trigger load progression.", "回復周期は約60%のセットスナップショットと独立トラックを使い、元テンプレートや増量判定を変更しません。")
          : review.recommendationReason === "recoveryEvidence"
            ? tx(locale, "多项恢复信号支持先恢复；你仍可明确选择正常推进。", "Multiple recovery signals support a recovery cycle, but you can explicitly continue building.", "複数の回復指標から回復周期を推奨しますが、明示的に構築継続も選べます。")
            : tx(locale, "当前证据不要求减量，继续建设并在下一轮重新评估。", "Current evidence does not require a deload; continue building and reassess next cycle.", "現在の根拠では減量不要です。構築を続け、次周期で再評価します。")}</p>
      </div>

      <div className="soft-divider border-t px-3.5 py-3">
        {confirm ? <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirm(false)} className="press h-10 rounded-lg border border-border bg-surface text-[12px] font-semibold text-muted">{tx(locale, "取消", "Cancel", "キャンセル")}</button><button type="button" onClick={apply} className="press h-10 rounded-lg bg-fg text-[12px] font-semibold text-bg">{tx(locale, "确认并开始", "Confirm and start", "確認して開始")}</button></div> : <button type="button" onClick={() => setConfirm(true)} className="press h-11 w-full rounded-xl bg-fg text-[13px] font-semibold text-bg">{tx(locale, "应用本轮复盘并开始下一周期", "Apply this review and start the next cycle", "レビューを適用して次周期を開始")}</button>}
      </div>
    </>}
  </section>;
}

function Evidence({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface-2 px-2.5 py-2"><p className="text-[9px] font-semibold uppercase tracking-wide text-faint">{label}</p><p className="tnum mt-1 text-[14px] font-semibold text-fg">{value}</p></div>;
}
