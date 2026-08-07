"use client";

import { formatCompact } from "@/lib/date";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  exercisePrescription,
  progressionSuggestion,
  trackPerformanceMetric,
  type TrackHistoryResult,
  type TrackPerformanceMetric,
  type TrackTrend,
} from "@/lib/prescription";
import { progressionPresentation } from "@/lib/progressionPresentation";
import type { TrainingAnalysis } from "@/lib/trainingAnalysis";
import type { IntegratedCoachStatus } from "@/lib/integratedCoach";
import { diagnoseTrackTrend, type TrackDiagnosis } from "@/lib/trackDiagnosis";

const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

export default function ExerciseTrendReview({ analysis, readinessStatus }: { analysis: TrainingAnalysis; readinessStatus: IntegratedCoachStatus }) {
  const { locale, tr } = useI18n();
  const trends = analysis.trends.slice(0, 6);
  if (!trends.length) return null;

  return <section>
    <div className="mb-2">
      <h2 className="text-[14px] font-semibold text-fg">{tx(locale, "动作轨道趋势", "Exercise track trends", "種目トラックの推移")}</h2>
      <p className="mt-0.5 text-[11px] text-faint">{tx(locale, "只比较同一动作、同一训练轨道的已完成记录", "Completed sessions are compared only within the same exercise and track", "同じ種目・同じトラックの完了記録だけを比較します")}</p>
    </div>
    <div className="control-card overflow-hidden">
      {trends.map((item) => {
        const primaryMuscle = item.histories[0]?.exercise.primaryMuscle;
        const volume = primaryMuscle ? analysis.cycle.rows.find((row) => row.muscle === primaryMuscle) : undefined;
        const diagnosis = diagnoseTrackTrend(item, {
          recoveryPressure: analysis.recovery.active,
          ...(readinessStatus === "caution" || readinessStatus === "recover" ? { readinessStatus } : {}),
          ...(volume ? { volume: { current: volume.current, targetHigh: volume.target.high, overTarget: volume.status === "over" } } : {}),
        });
        return <details key={item.key} className="soft-divider border-t px-3.5 py-3 first:border-t-0">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-fg">{tr(item.exerciseName)}</p>
              <p className="mt-0.5 truncate text-[10px] text-faint">{tr(item.trackLabel)} · {item.trend.sessionCount} {tx(locale, "次", "sessions", "回")}</p>
            </div>
            <MiniTrend histories={item.histories} locale={locale} />
            <div className="w-[72px] shrink-0 text-right">
              <p className="tnum truncate text-[12px] font-semibold text-fg">{formatMetricValue(item.trend.metricKind, item.trend.latestValue, locale)}</p>
              <p className={"tnum mt-0.5 text-[10px] " + trendColor(item.trend)}>{item.trend.changePct == null ? metricName(item.trend.metricKind, locale) : `${item.trend.changePct > 0 ? "+" : ""}${item.trend.changePct}%`}</p>
            </div>
          </div>
        </summary>
        <div className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2">
          <TrackNextStep history={item.histories[0]} diagnosis={diagnosis} locale={locale} />
          <div className="mt-2 space-y-1">
            {item.histories.slice(0, 4).map((history) => <HistoryPoint key={`${item.key}-${history.date}`} history={history} locale={locale} />)}
          </div>
        </div>
      </details>;
      })}
    </div>
  </section>;
}

function TrackNextStep({ history, diagnosis, locale }: { history: TrackHistoryResult; diagnosis: TrackDiagnosis; locale: Locale }) {
  const prescription = exercisePrescription(history.exercise);
  const suggestion = progressionSuggestion(prescription, history);
  const presentation = progressionPresentation(suggestion, prescription, prescription.performanceMode ?? "reps", locale);
  return <div>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-faint">{tx(locale, "主要判断", "Primary diagnosis", "主な判断")}</p><p className="mt-0.5 text-[11px] font-semibold text-fg">{diagnosisTitle(diagnosis, locale)}</p></div>
      <span className={"shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold " + (diagnosis.confidence === "ready" ? "bg-accent-soft text-accent" : "bg-surface text-muted")}>{diagnosis.confidence === "ready" ? tx(locale, "依据明确", "Supported", "根拠あり") : tx(locale, "继续观察", "Building", "観察中")}</span>
    </div>
    <p className="mt-1 text-[10px] leading-relaxed text-muted">{diagnosisReason(diagnosis, locale)}</p>
    <div className="mt-2 border-t border-border/70 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-faint">{tx(locale, "只改这一项", "Change one variable", "変更は1項目")}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted">{interventionCopy(diagnosis, presentation.summary, locale)}</p></div>
      <span className="tnum shrink-0 text-[11px] font-semibold text-fg">{interventionValue(diagnosis, presentation.value, locale)}</span>
      </div>
      <p className="mt-1 text-[9px] leading-relaxed text-faint">{tx(locale, "执行条件：", "Condition: ", "条件：")}{presentation.condition}</p>
      <p className="mt-1 text-[9px] font-semibold text-accent">{tx(locale, `复查：完成 ${diagnosis.recheckSessions} 次同轨道训练后`, `Review after ${diagnosis.recheckSessions} completed same-track session${diagnosis.recheckSessions === 1 ? "" : "s"}`, `再確認：同一トラックを ${diagnosis.recheckSessions} 回完了後`)}</p>
    </div>
  </div>;
}

function sessionMetric(history: TrackHistoryResult) {
  return trackPerformanceMetric(history);
}

function MiniTrend({ histories, locale }: { histories: TrackHistoryResult[]; locale: Locale }) {
  const metrics = histories.slice(0, 6).map(sessionMetric).filter((value): value is TrackPerformanceMetric => value != null);
  const kind = metrics[0]?.kind;
  const values = metrics.filter((metric) => metric.kind === kind).map((metric) => metric.value).reverse();
  if (values.length < 2) return <span className="h-7 w-20 shrink-0 rounded bg-surface-2" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 76 + 2},${24 - ((value - min) / span) * 20}`).join(" ");
  return <svg width="80" height="28" viewBox="0 0 80 28" className="shrink-0" role="img" aria-label={tx(locale, "表现趋势", "Performance trend", "パフォーマンス推移")}><polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function HistoryPoint({ history, locale }: { history: TrackHistoryResult; locale: Locale }) {
  const metric = sessionMetric(history);
  const set = metric?.set ?? history.sets[0];
  const result = metric?.kind === "duration"
    ? `${set.durationSeconds ?? 0} ${tx(locale, "秒", "sec", "秒")}`
    : metric?.kind === "distance"
      ? `${set.distanceMeters ?? 0} m`
      : set.weight > 0
        ? `${set.weight}kg × ${set.reps}`
        : `${set.reps} ${tx(locale, "次", "reps", "回")}`;
  const effort = history.sessionDifficulty === "hard"
    ? tx(locale, "吃力", "Hard", "きつい")
    : history.sessionDifficulty === "easy"
      ? tx(locale, "轻松", "Easy", "余裕")
      : history.sessionDifficulty === "onTarget"
        ? tx(locale, "合适", "On target", "適正")
        : null;
  return <p className="tnum flex items-center justify-between gap-2 text-[10px] text-muted"><span>{formatCompact(history.date, locale).md}{effort ? ` · ${effort}` : ""}</span><span className="min-w-0 truncate text-right">{result}{metric?.kind === "e1rm" ? ` · e1RM ${metric.value}kg` : ""}</span></p>;
}

function metricName(kind: TrackTrend["metricKind"], locale: Locale) {
  if (kind === "e1rm") return "e1RM";
  if (kind === "duration") return tx(locale, "时长", "Duration", "時間");
  if (kind === "distance") return tx(locale, "距离", "Distance", "距離");
  if (kind === "reps") return tx(locale, "次数", "Reps", "回数");
  return "—";
}

function formatMetricValue(kind: TrackTrend["metricKind"], value: number | null, locale: Locale) {
  if (value == null) return "—";
  if (kind === "e1rm") return `${value}kg`;
  if (kind === "duration") return `${value}${tx(locale, "秒", "s", "秒")}`;
  if (kind === "distance") return `${value}m`;
  return `${value}${tx(locale, "次", "", "回")}`;
}

function diagnosisTitle(diagnosis: TrackDiagnosis, locale: Locale) {
  if (diagnosis.constraint === "onTrack") return tx(locale, "处方仍在正常推进", "The prescription is still progressing", "処方は順調に進行中");
  if (diagnosis.constraint === "prescription") return tx(locale, "先完成当前处方目标", "Complete the current prescription first", "まず現在の処方目標を完了");
  if (diagnosis.constraint === "readiness") return tx(locale, "综合状态暂缓局部进步", "Overall readiness pauses local progression", "総合状態により局所進行を一時停止");
  if (diagnosis.constraint === "sessionEffort") return tx(locale, "近期整体难度可能限制表现", "Recent session effort may be limiting performance", "最近の全体負荷が制限要因の可能性");
  if (diagnosis.constraint === "exerciseOrder") return tx(locale, "动作顺序变化可能影响比较", "Exercise order may be affecting the comparison", "種目順の変化が比較に影響した可能性");
  if (diagnosis.constraint === "muscleVolume") return tx(locale, "本周期直接容量已经偏高", "Direct cycle volume is already high", "現周期の直接ボリュームが高め");
  return tx(locale, "暂未找到单一限制因素", "No single constraint is supported yet", "単一の制限要因は未確定");
}

function diagnosisReason(diagnosis: TrackDiagnosis, locale: Locale) {
  if (diagnosis.constraint === "readiness") return diagnosis.readinessStatus === "recover"
    ? tx(locale, "综合信号当前以恢复为先；即使本轨道达到进步条件，这次也不加重量或组数。", "The combined signals currently prioritize recovery. Even if this track meets progression criteria, do not add load or sets this time.", "総合指標は現在、回復を優先しています。このトラックが進行条件を満たしていても、今回は重量もセットも増やしません。")
    : tx(locale, "综合判断存在尚未完全验证的压力信号；先保持本轨道处方，避免局部建议与主建议冲突。", "The overall decision contains a pressure signal that is not fully corroborated. Hold this track's prescription so its local advice does not conflict with the primary recommendation.", "総合判断には未検証の負荷指標があります。局所提案が主提案と矛盾しないよう、このトラックの処方を維持します。");
  if (diagnosis.constraint === "sessionEffort") return tx(locale, `近 ${diagnosis.difficultySamples} 次有难度记录的同轨道训练中，${diagnosis.hardSessions} 次标记为吃力；先验证恢复，再判断是否真退步。`, `${diagnosis.hardSessions} of ${diagnosis.difficultySamples} recent same-track sessions with effort data felt hard. Validate recovery before treating this as true regression.`, `難度記録のある直近 ${diagnosis.difficultySamples} 回中 ${diagnosis.hardSessions} 回がきつめ。真の低下と判断する前に回復を確認します。`);
  if (diagnosis.constraint === "exerciseOrder") return tx(locale, `本次排在第 ${diagnosis.latestPosition ?? "—"} 个，前两次通常在第 ${diagnosis.priorTypicalPosition ?? "—"} 个；先恢复可比顺序。`, `This session placed it ${diagnosis.latestPosition ?? "—"}, versus a prior typical position of ${diagnosis.priorTypicalPosition ?? "—"}. Restore a comparable order first.`, `今回は ${diagnosis.latestPosition ?? "—"} 番目、以前は通常 ${diagnosis.priorTypicalPosition ?? "—"} 番目。まず比較可能な順序に戻します。`);
  if (diagnosis.constraint === "muscleVolume") return tx(locale, `主目标肌群本周期已有 ${diagnosis.volume?.current ?? "—"} 个直接有效组，高于 ${diagnosis.volume?.targetHigh ?? "—"} 的目标上限；不把回落解释成需要加量。`, `The primary muscle has ${diagnosis.volume?.current ?? "—"} direct effective sets this cycle, above the ${diagnosis.volume?.targetHigh ?? "—"} ceiling. A decline is not treated as a reason to add work.`, `主働筋は現周期 ${diagnosis.volume?.current ?? "—"} 直接有効セットで、上限 ${diagnosis.volume?.targetHigh ?? "—"} を超過。低下を増量理由にはしません。`);
  if (diagnosis.constraint === "prescription") return tx(locale, "最近一次记录尚未满足当前轨道的组数、次数或难度条件；先补齐处方，再比较趋势。", "The latest session did not yet meet this track's set, performance, or effort condition. Complete the prescription before judging the trend.", "直近はセット数・回数・難度条件をまだ満たしていません。処方を完了してから推移を判断します。");
  if (diagnosis.constraint === "onTrack") return tx(locale, "同轨道记录支持继续当前双进步规则，不需要同时增加重量和组数。", "Same-track records support the current progression rule; do not add load and sets together.", "同一トラックの記録は現在の進行ルールを支持しています。重量とセットを同時に増やしません。");
  return tx(locale, "现有记录不足以把变化归因于恢复、容量或动作顺序；保持其他变量不变再收集可比样本。", "The records do not support attributing the change to recovery, volume, or exercise order. Keep other variables stable and collect comparable samples.", "回復・容量・種目順のどれかに帰属できる根拠が不足しています。他の条件を維持して比較可能な記録を集めます。");
}

function interventionCopy(diagnosis: TrackDiagnosis, prescriptionSummary: string, locale: Locale) {
  if (diagnosis.intervention === "restoreOrder") return tx(locale, "下次把动作放回之前的顺序，重量和组数保持不变。", "Restore the previous exercise order next time; keep load and sets unchanged.", "次回は以前の種目順に戻し、重量とセットは変更しません。");
  if (diagnosis.intervention === "holdLoad") return tx(locale, "下次不加重量、不加组数，按处方完成并记录整体难度。", "Do not add load or sets next time. Complete the prescription and log overall effort.", "次回は重量もセットも増やさず、処方を完了して全体難度を記録します。");
  if (diagnosis.intervention === "reduceVolume") return tx(locale, "先在周期复盘中处理容量上限，本动作保持重量，不额外补组。", "Address the volume ceiling in cycle review first. Hold this exercise's load and do not add sets.", "まず周期レビューで容量上限を調整し、この種目は重量を維持してセットを追加しません。");
  if (diagnosis.intervention === "observe") return tx(locale, "保持重量、组数和顺序不变，再收集可比较记录。", "Keep load, sets, and order unchanged while collecting comparable records.", "重量・セット・順序を維持し、比較可能な記録を集めます。");
  return prescriptionSummary;
}

function interventionValue(diagnosis: TrackDiagnosis, prescriptionValue: string, locale: Locale) {
  if (diagnosis.intervention === "holdLoad") return tx(locale, "不加重", "Hold load", "重量維持");
  if (diagnosis.intervention === "restoreOrder") return tx(locale, "恢复顺序", "Restore order", "順序を戻す");
  if (diagnosis.intervention === "reduceVolume") return tx(locale, "先减量", "Reduce first", "先に減量");
  if (diagnosis.intervention === "observe") return tx(locale, "保持", "Hold", "維持");
  return prescriptionValue;
}

function trendColor(trend: TrackTrend) {
  if (trend.status === "improving") return "text-accent";
  if (trend.status === "regressing") return "text-warn";
  return "text-muted";
}
