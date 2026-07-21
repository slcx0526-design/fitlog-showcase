"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { formatCompact } from "@/lib/date";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  exercisePrescription,
  progressionSuggestion,
  summarizeExerciseTrackTrends,
  trackPerformanceMetric,
  type TrackHistoryResult,
  type TrackPerformanceMetric,
  type TrackTrend,
} from "@/lib/prescription";
import { progressionPresentation } from "@/lib/progressionPresentation";

const tx = (locale: Locale, zh: string, en: string, ja: string) => locale === "en" ? en : locale === "ja" ? ja : zh;

export default function ExerciseTrendReview() {
  const { data } = useStore();
  const { locale, tr } = useI18n();
  const trends = useMemo(() => summarizeExerciseTrackTrends(data.days, "9999-12-31", 6), [data.days]);
  if (!trends.length) return null;

  return <section>
    <div className="mb-2">
      <h2 className="text-[14px] font-semibold text-fg">{tx(locale, "动作轨道趋势", "Exercise track trends", "種目トラックの推移")}</h2>
      <p className="mt-0.5 text-[11px] text-faint">{tx(locale, "只比较同一动作、同一训练轨道的已完成记录", "Completed sessions are compared only within the same exercise and track", "同じ種目・同じトラックの完了記録だけを比較します")}</p>
    </div>
    <div className="control-card overflow-hidden">
      {trends.map((item) => <details key={item.key} className="soft-divider border-t px-3.5 py-3 first:border-t-0">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-fg">{tr(item.exerciseName)}</p>
              <p className="mt-0.5 truncate text-[10px] text-faint">{tr(item.trackLabel)} · {item.trend.sessionCount} {tx(locale, "次", "sessions", "回")}</p>
            </div>
            <MiniTrend histories={item.histories} />
            <div className="w-[72px] shrink-0 text-right">
              <p className="tnum truncate text-[12px] font-semibold text-fg">{formatMetricValue(item.trend.metricKind, item.trend.latestValue, locale)}</p>
              <p className={"tnum mt-0.5 text-[10px] " + trendColor(item.trend)}>{item.trend.changePct == null ? metricName(item.trend.metricKind, locale) : `${item.trend.changePct > 0 ? "+" : ""}${item.trend.changePct}%`}</p>
            </div>
          </div>
        </summary>
        <div className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2">
          <p className="text-[10px] leading-relaxed text-muted">{trendMessage(item.trend, locale)}</p>
          <TrackNextStep history={item.histories[0]} locale={locale} />
          <div className="mt-2 space-y-1">
            {item.histories.slice(0, 4).map((history) => <HistoryPoint key={`${item.key}-${history.date}`} history={history} locale={locale} />)}
          </div>
        </div>
      </details>)}
    </div>
  </section>;
}

function TrackNextStep({ history, locale }: { history: TrackHistoryResult; locale: Locale }) {
  const prescription = exercisePrescription(history.exercise);
  const suggestion = progressionSuggestion(prescription, history);
  const presentation = progressionPresentation(suggestion, prescription, prescription.performanceMode ?? "reps", locale);
  return <div className="mt-2 border-t border-border/70 pt-2">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-[9px] font-semibold uppercase text-faint">{tx(locale, "处方下一步", "Prescription next step", "処方の次の一手")}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted">{presentation.summary}</p></div>
      <span className="tnum shrink-0 text-[11px] font-semibold text-fg">{presentation.value}</span>
    </div>
    <p className="mt-1 text-[9px] leading-relaxed text-faint">{tx(locale, "触发条件：", "Condition: ", "条件：")}{presentation.condition}</p>
  </div>;
}

function sessionMetric(history: TrackHistoryResult) {
  return trackPerformanceMetric(history);
}

function MiniTrend({ histories }: { histories: TrackHistoryResult[] }) {
  const metrics = histories.slice(0, 6).map(sessionMetric).filter((value): value is TrackPerformanceMetric => value != null);
  const kind = metrics[0]?.kind;
  const values = metrics.filter((metric) => metric.kind === kind).map((metric) => metric.value).reverse();
  if (values.length < 2) return <span className="h-7 w-20 shrink-0 rounded bg-surface-2" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 76 + 2},${24 - ((value - min) / span) * 20}`).join(" ");
  return <svg width="80" height="28" viewBox="0 0 80 28" className="shrink-0" role="img" aria-label="e1RM trend"><polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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

function trendMessage(trend: TrackTrend, locale: Locale) {
  if (trend.status === "improving") return tx(locale, "同轨道表现正在提升，继续当前进度规则。", "Performance is improving on this track. Keep the current progression rule.", "同一トラックのパフォーマンスが向上しています。現在の進行ルールを続けます。");
  if (trend.status === "regressing") return tx(locale, "同轨道近期表现回落，下一次先维持训练变量并检查恢复。", "Recent performance has declined on this track. Hold the variables and check recovery next time.", "同一トラックの最近のパフォーマンスが低下しています。次回は条件を維持し、回復を確認します。");
  if (trend.status === "plateau") return tx(locale, "连续 3 次变化很小，先补目标表现或调整动作顺序。", "Three sessions changed very little. Build the target performance or adjust exercise order first.", "3回連続で変化が小さいため、まず目標パフォーマンスか種目順を調整します。");
  return tx(locale, "表现基本稳定，按当前目标继续推进。", "Performance is stable. Continue with the current target.", "パフォーマンスは安定しています。現在の目標を続けます。");
}

function trendColor(trend: TrackTrend) {
  if (trend.status === "improving") return "text-accent";
  if (trend.status === "regressing") return "text-warn";
  return "text-muted";
}
