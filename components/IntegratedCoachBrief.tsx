"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useToday } from "@/lib/hooks";
import { buildIntegratedCoachAnalysis, type IntegratedCoachAnalysis } from "@/lib/integratedCoach";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import { useStore } from "@/lib/store";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function IntegratedCoachBrief({ compact = false, showAction = true }: { compact?: boolean; showAction?: boolean }) {
  const { data } = useStore();
  const today = useToday();
  const { locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const analysis = useMemo(() => buildIntegratedCoachAnalysis(data, today), [data, today]);
  const copy = decisionCopy(locale, analysis);
  const tone = analysis.status === "recover" ? "border-warn/40 bg-warn-soft" : analysis.status === "caution" ? "border-border-strong bg-surface" : "border-border bg-surface";
  const badge = analysis.status === "recover" ? "bg-warn text-white" : analysis.status === "ready" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted";
  const href = analysis.primaryAction === "logRecovery" ? "#recovery-check-in" : analysis.primaryAction === "takeRecovery" ? "/train?start=rest" : "/train";

  return <section className={"mb-3 rounded-2xl border p-3.5 shadow-sm " + tone}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">DAILY COACH</p><h2 className="mt-1 text-[15px] font-semibold text-fg">{copy.title}</h2></div><span className={"shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold " + badge}>{confidenceLabel(locale, analysis)}</span></div>
    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{copy.detail}</p>
    {!compact && <div className="mt-3 grid grid-cols-3 gap-2"><Metric label={tx(locale, "今日状态", "Today", "今日")} value={analysis.recovery.today ? String(analysis.recovery.today.score) : "—"} /><Metric label={tx(locale, "近 7 天", "7-day avg", "7日平均")} value={analysis.recovery.average7d == null ? "—" : String(analysis.recovery.average7d)} /><Metric label={tx(locale, "训练日", "Training days", "トレ日")} value={String(analysis.training.load.sessions7d)} /></div>}
    <button type="button" onClick={() => setExpanded((value) => !value)} className="press mt-2 flex w-full items-center justify-between py-1 text-left text-[10px] font-semibold text-faint" aria-expanded={expanded}><span>{tx(locale, "判断依据", "Evidence", "判断根拠")}</span><span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    {expanded && <div className="animate-slidedown space-y-1.5 border-t border-border/70 pt-2"><EvidenceRows locale={locale} analysis={analysis} /></div>}
    {showAction && <Link href={href} className="press mt-3 flex h-10 items-center justify-center rounded-xl bg-fg px-3 text-[12px] font-semibold text-bg">{copy.action}</Link>}
  </section>;
}

function decisionCopy(locale: Locale, analysis: IntegratedCoachAnalysis) {
  if (analysis.status === "recover") return {
    title: tx(locale, "今天恢复优先", "Prioritize recovery today", "今日は回復を優先"),
    detail: tx(locale, `至少两类证据同时偏紧：${triggerLabels(locale, analysis).join("、")}。本次不追加强度或组数。`, `At least two evidence groups are under pressure: ${triggerLabels(locale, analysis).join(", ")}. Do not add load or sets today.`, `複数の根拠が同時に厳しい状態です：${triggerLabels(locale, analysis).join("・")}。今日は重量やセットを増やしません。`),
    action: tx(locale, "记录恢复日", "Log a recovery day", "回復日を記録"),
  };
  if (analysis.status === "caution") return {
    title: tx(locale, "今天保守推进", "Train conservatively today", "今日は保守的に進める"),
    detail: tx(locale, `${triggerLabels(locale, analysis).join("、")}出现单项或未完全交叉验证的压力信号。保持动作和计划，不额外加量。`, `${triggerLabels(locale, analysis).join(", ")} shows pressure that is not fully corroborated. Keep the plan and avoid extra work.`, `${triggerLabels(locale, analysis).join("・")}に単独または未確認の負荷があります。計画を保ち、追加はしません。`),
    action: tx(locale, "查看训练", "Open training", "トレーニングを見る"),
  };
  if (analysis.status === "ready") return {
    title: tx(locale, "今天按计划推进", "Proceed as planned today", "今日は計画どおり進める"),
    detail: tx(locale, "现有记录没有形成需要降量的交叉证据。按当前处方执行，训练后记录整体难度。", "Current records do not form corroborated evidence for reducing work. Follow the prescription and log session difficulty afterward.", "現在の記録では減量を支持する複数の根拠はありません。処方どおり進め、終了後に全体の難度を記録します。"),
    action: tx(locale, "开始训练", "Start training", "トレーニング開始"),
  };
  return {
    title: tx(locale, "先补一条状态记录", "Add a recovery check-in", "まず状態を記録"),
    detail: tx(locale, "训练样本和今日状态都不足，系统不会猜测你该加量还是休息。", "Training samples and today's recovery signals are still sparse, so the app will not guess whether to add work or rest.", "トレーニング履歴と今日の状態が不足しているため、増量か休息かを推測しません。"),
    action: tx(locale, "记录状态", "Log recovery", "状態を記録"),
  };
}

function triggerLabels(locale: Locale, analysis: IntegratedCoachAnalysis) {
  const labels = {
    subjectiveLow: tx(locale, "今日状态", "today's check-in", "今日の状態"),
    sustainedLow: tx(locale, "近 7 天状态", "7-day recovery", "7日間の状態"),
    trainingPressure: tx(locale, "训练表现与容量", "training performance and volume", "パフォーマンスとボリューム"),
    fuelGap: tx(locale, "已记录饮食", "logged nutrition", "記録済みの食事"),
    cardioPressure: tx(locale, "近期高强度有氧", "recent high-intensity cardio", "直近の高強度有酸素"),
    cutTooFast: tx(locale, "减脂速度", "cut pace", "減量ペース"),
  };
  return analysis.triggers.map((trigger) => labels[trigger]);
}

function confidenceLabel(locale: Locale, analysis: IntegratedCoachAnalysis) {
  return analysis.confidence === "ready" ? tx(locale, "证据充分", "High confidence", "根拠十分") : analysis.confidence === "building" ? tx(locale, "建立中", "Building", "構築中") : tx(locale, "样本少", "Sparse data", "標本少");
}

function EvidenceRows({ locale, analysis }: { locale: Locale; analysis: IntegratedCoachAnalysis }) {
  const recovery = analysis.recovery.today
    ? tx(locale, `今日 ${analysis.recovery.today.score}，近 7 天 ${analysis.recovery.average7d ?? "—"}；记录 ${analysis.recovery.scoredDays7d} 天。`, `Today ${analysis.recovery.today.score}, 7-day average ${analysis.recovery.average7d ?? "—"}; ${analysis.recovery.scoredDays7d} logged days.`, `今日 ${analysis.recovery.today.score}、7日平均 ${analysis.recovery.average7d ?? "—"}、記録 ${analysis.recovery.scoredDays7d} 日。`)
    : tx(locale, `今日未记录；近 7 天有 ${analysis.recovery.scoredDays7d} 天可评分。`, `No check-in today; ${analysis.recovery.scoredDays7d} scorable days in the last 7.`, `今日は未記録。直近7日で評価可能なのは ${analysis.recovery.scoredDays7d} 日です。`);
  const training = tx(locale, `近 7 天 ${analysis.training.load.sessions7d} 次训练；吃力 ${analysis.training.load.hardSessions}/${analysis.training.load.difficultySamples}，持续回落动作 ${analysis.training.recovery.regressingExercises} 个。`, `${analysis.training.load.sessions7d} sessions in 7 days; ${analysis.training.load.hardSessions}/${analysis.training.load.difficultySamples} felt hard and ${analysis.training.recovery.regressingExercises} exercises regressed.`, `直近7日 ${analysis.training.load.sessions7d} 回。きつい ${analysis.training.load.hardSessions}/${analysis.training.load.difficultySamples}、低下種目 ${analysis.training.recovery.regressingExercises}。`);
  const nutrition = analysis.nutrition.calorieTarget == null
    ? tx(locale, "减脂模式未提供热量目标，饮食不会被用来判断恢复不足。", "Without an active cut calorie target, nutrition is not used to infer poor recovery.", "減量のカロリー目標がないため、食事から回復不足を推測しません。")
    : tx(locale, `近 7 天记录饮食 ${analysis.nutrition.loggedDays7d} 天；明确低于目标 20% 的记录 ${analysis.nutrition.lowEnergyDays7d} 天。`, `${analysis.nutrition.loggedDays7d} nutrition days logged; ${analysis.nutrition.lowEnergyDays7d} were explicitly more than 20% below target.`, `直近7日で食事 ${analysis.nutrition.loggedDays7d} 日、目標を20%以上下回った記録 ${analysis.nutrition.lowEnergyDays7d} 日。`);
  const cardio = tx(locale, `近 7 天有氧 ${analysis.cardio.minutes7d} 分；近 3 天 Z4–Z5 ${analysis.cardio.highIntensityMinutes3d} 分。`, `${analysis.cardio.minutes7d} cardio minutes in 7 days; ${analysis.cardio.highIntensityMinutes3d} minutes in Z4-Z5 over 3 days.`, `直近7日 有酸素 ${analysis.cardio.minutes7d} 分、直近3日 Z4-Z5 ${analysis.cardio.highIntensityMinutes3d} 分。`);
  return <>{[
    [tx(locale, "状态", "Recovery", "状態"), recovery],
    [tx(locale, "训练", "Training", "トレーニング"), training],
    [tx(locale, "饮食", "Nutrition", "食事"), nutrition],
    [tx(locale, "有氧", "Cardio", "有酸素"), cardio],
  ].map(([label, detail]) => <div key={label} className="flex gap-2 text-[10px] leading-relaxed"><span className="w-9 shrink-0 font-semibold text-fg">{label}</span><span className="text-muted">{detail}</span></div>)}</>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="control-strip rounded-xl px-2 py-2 text-center"><p className="text-[9px] text-faint">{label}</p><p className="tnum mt-0.5 text-[14px] font-semibold text-fg">{value}</p></div>;
}
