"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { formatCompact } from "@/lib/date";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  bestSet,
  estimatedOneRepMax,
  performanceModeFor,
  summarizeExerciseTrackTrends,
  type TrackHistoryResult,
  type TrackTrend,
} from "@/lib/prescription";

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
            <div className="w-16 shrink-0 text-right">
              <p className="tnum text-[12px] font-semibold text-fg">{item.trend.latestE1rm != null ? `${item.trend.latestE1rm}kg` : "—"}</p>
              <p className={"tnum mt-0.5 text-[10px] " + trendColor(item.trend)}>{item.trend.changePct == null ? "e1RM" : `${item.trend.changePct > 0 ? "+" : ""}${item.trend.changePct}%`}</p>
            </div>
          </div>
        </summary>
        <div className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2">
          <p className="text-[10px] leading-relaxed text-muted">{item.trend.message}</p>
          <div className="mt-2 space-y-1">
            {item.histories.slice(0, 4).map((history) => <HistoryPoint key={`${item.key}-${history.date}`} history={history} locale={locale} />)}
          </div>
        </div>
      </details>)}
    </div>
  </section>;
}

function sessionE1rm(history: TrackHistoryResult) {
  const values = history.sets.map(estimatedOneRepMax).filter((value): value is number => value != null);
  return values.length ? Math.max(...values) : null;
}

function MiniTrend({ histories }: { histories: TrackHistoryResult[] }) {
  const values = histories.slice(0, 6).map(sessionE1rm).filter((value): value is number => value != null).reverse();
  if (values.length < 2) return <span className="h-7 w-20 shrink-0 rounded bg-surface-2" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 76 + 2},${24 - ((value - min) / span) * 20}`).join(" ");
  return <svg width="80" height="28" viewBox="0 0 80 28" className="shrink-0" role="img" aria-label="e1RM trend"><polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function HistoryPoint({ history, locale }: { history: TrackHistoryResult; locale: Locale }) {
  const e1rm = sessionE1rm(history);
  const best = bestSet(history.sets) ?? history.sets[0];
  const mode = history.exercise.prescription?.performanceMode ?? performanceModeFor(history.exercise.recordModes);
  const result = mode === "duration" ? `${best.durationSeconds ?? 0} ${tx(locale, "秒", "sec", "秒")}` : mode === "distance" ? `${best.distanceMeters ?? 0} m` : best.weight > 0 ? `${best.weight}kg × ${best.reps}` : `${best.reps} ${tx(locale, "次", "reps", "回")}`;
  return <p className="tnum flex items-center justify-between gap-2 text-[10px] text-muted"><span>{formatCompact(history.date, locale).md}</span><span>{result}{e1rm != null ? ` · e1RM ${e1rm}kg` : ""}</span></p>;
}

function trendColor(trend: TrackTrend) {
  if (trend.status === "improving") return "text-accent";
  if (trend.status === "regressing") return "text-warn";
  return "text-muted";
}
