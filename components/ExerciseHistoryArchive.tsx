"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { formatCompact, relativeLabel } from "@/lib/date";
import { typeLabel } from "@/lib/exercises";
import { localeText, useI18n, type Locale } from "@/lib/i18n";
import {
  buildExerciseTrackArchive,
  filterExerciseTrackArchive,
  summarizeTrainingWindow,
  type ExerciseTrackArchiveRow,
  type ExerciseTrackArchiveSession,
} from "@/lib/trainingHistory";
import {
  exercisePrescription,
  performanceModeFor,
  progressionSuggestion,
  type TrackPerformanceMetric,
  type TrackTrend,
} from "@/lib/prescription";
import { progressionPresentation } from "@/lib/progressionPresentation";
import { shiftDate } from "@/lib/weight";

const tx = (locale: Locale, zh: string, en: string, ja: string) => localeText(locale, zh, en, ja);

export default function ExerciseHistoryArchive() {
  const { data } = useStore();
  const { locale, tr } = useI18n();
  const today = useToday();
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const archive = useMemo(() => buildExerciseTrackArchive(data.days, `${today}\uffff`, today), [data.days, today]);
  const filtered = useMemo(() => filterExerciseTrackArchive(archive, query), [archive, query]);
  const visibleTracks = query.trim() || showAllTracks ? filtered : filtered.slice(0, 16);
  const selected = archive.find((row) => row.key === selectedKey && visibleTracks.some((item) => item.key === row.key)) ?? visibleTracks[0] ?? null;
  const summary = useMemo(() => summarizeTrainingWindow(data.days, shiftDate(today, -27), today), [data.days, today]);

  if (!archive.length) return null;

  return <section className="control-card p-3.5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-fg">{tx(locale, "动作轨道档案", "Exercise track archive", "種目トラック履歴")}</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{tx(locale, "力量、增肌、时长等轨道分别累计，不跨轨道合并最佳表现。", "Strength, hypertrophy, duration, and other tracks stay separate.", "筋力・筋肥大・時間などのトラックを分けて集計します。")}</p>
      </div>
      <span className="tnum shrink-0 rounded-lg bg-surface-2 px-2 py-1 text-[11px] text-muted">{archive.length} {tx(locale, "条", "tracks", "件")}</span>
    </div>

    <div className="control-strip mt-3 grid grid-cols-4 gap-1 rounded-xl p-1.5">
      <Fact label={summary.implicitSessions ? tx(locale, "完成 + 未结束", "Done + unclosed", "完了 + 未終了") : tx(locale, "近28天", "28 days", "28日")} value={`${summary.completedSessions}${summary.implicitSessions ? ` + ${summary.implicitSessions}` : ""}${tx(locale, "次", "", "回")}`} />
      <Fact label={tx(locale, "有效组", "Work sets", "有効セット")} value={formatCredit(summary.completionCredits)} />
      <Fact label={tx(locale, "计划完成", "Adherence", "計画達成")} value={summary.completionPct == null ? "—" : `${summary.completionPct}%`} />
      <Fact label={tx(locale, "记录轨道", "Logged tracks", "記録トラック")} value={String(summary.trackedExercises)} />
    </div>

    <input
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      aria-label={tx(locale, "搜索动作轨道", "Search exercise tracks", "種目トラックを検索")}
      placeholder={tx(locale, "搜索动作或轨道", "Search exercise or track", "種目またはトラックを検索")}
      className="number-cell mt-3 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-[13px] text-fg outline-none placeholder:text-faint focus:border-accent"
    />

    {filtered.length ? <>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {visibleTracks.map((row) => <button
          key={row.key}
          type="button"
          onClick={() => setSelectedKey(row.key)}
          aria-pressed={selected?.key === row.key}
          className={"choice-chip press min-w-0 max-w-[190px] shrink-0 border px-3 py-2 text-left " + (selected?.key === row.key ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}
        >
          <span className="block truncate text-[12px] font-semibold">{tr(row.exerciseName)}</span>
          <span className="mt-0.5 block truncate text-[9px]">{tr(row.trackLabel)}</span>
        </button>)}
      </div>
      {!query.trim() && filtered.length > 16 && <button
        type="button"
        onClick={() => setShowAllTracks((value) => !value)}
        aria-expanded={showAllTracks}
        className="press mt-1 text-[10px] font-semibold text-accent"
      >{showAllTracks
        ? tx(locale, "收起轨道", "Show fewer tracks", "トラックを折りたたむ")
        : tx(locale, `显示其余 ${filtered.length - 16} 条`, `Show ${filtered.length - 16} more`, `残り ${filtered.length - 16} 件を表示`)}</button>}
      {selected && <SelectedTrack row={selected} locale={locale} tr={tr} />}
    </> : <div className="mt-3 rounded-xl border border-dashed border-border px-3 py-5 text-center">
      <p className="text-[12px] text-faint">{tx(locale, "没有匹配的动作轨道。", "No exercise track matches.", "一致する種目トラックがありません。")}</p>
      <button type="button" onClick={() => setQuery("")} className="press mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-semibold text-accent">{tx(locale, "清空搜索", "Clear search", "検索をクリア")}</button>
    </div>}
  </section>;
}

function SelectedTrack({ row, locale, tr }: { row: ExerciseTrackArchiveRow; locale: Locale; tr: (value: string) => string }) {
  const latest = row.sessions[0];
  const prescription = latest ? exercisePrescription(latest.exercise) : null;
  const suggestion = latest && prescription
    ? progressionPresentation(
      progressionSuggestion(prescription, latest.history),
      prescription,
      prescription.performanceMode ?? performanceModeFor(latest.exercise.recordModes),
      locale,
    )
    : null;
  return <div className="mt-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-fg">{tr(row.exerciseName)}</p>
        <p className="mt-0.5 truncate text-[10px] text-faint">{tr(row.trackLabel)}{row.legacy ? ` · ${tx(locale, "旧记录参考", "Legacy reference", "旧記録")}` : ""}</p>
      </div>
      <TrendBadge trend={row.trend} locale={locale} />
    </div>
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      <MiniStat label={tx(locale, "记录次数", "Records", "記録回数")} value={String(row.sessionCount)} />
      <MiniStat label={tx(locale, "有效组", "Work sets", "有効セット")} value={formatCredit(row.completionCredits)} />
      <MiniStat label={tx(locale, "最佳表现", "Best", "ベスト")} value={formatMetric(row.bestMetric, locale)} />
    </div>
    <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-2 text-[10px] leading-relaxed text-muted">{trendCopy(row.trend, locale)}</p>
    {suggestion && <div className="control-strip mt-2 rounded-lg px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold text-faint">{tx(locale, "下一次建议", "Next-session suggestion", "次回の提案")}</span>
        <span className={"tnum text-[11px] font-semibold " + (suggestion.tone === "accent" ? "text-accent" : suggestion.tone === "warn" ? "text-warn" : "text-fg")}>{suggestion.value}</span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted">{suggestion.summary}</p>
      <p className="mt-1 text-[9px] leading-relaxed text-faint"><span className="font-semibold">{tx(locale, "进步条件", "Progression condition", "進行条件")}</span> · {suggestion.condition}</p>
    </div>}
    <div className="control-strip mt-2 overflow-hidden rounded-xl">
      {row.sessions.slice(0, 6).map((session) => <SessionRow key={`${row.key}-${session.date}`} session={session} locale={locale} />)}
    </div>
  </div>;
}

function SessionRow({ session, locale }: { session: ExerciseTrackArchiveSession; locale: Locale }) {
  return <Link href={`/train?date=${session.date}`} className="press soft-divider flex min-w-0 items-center gap-2 border-t px-3 py-2.5 first:border-t-0">
    <span className="w-12 shrink-0 truncate text-[11px] text-muted">{session.history.implicitCompletion ? tx(locale, "未结束", "Unclosed", "未終了") : relativeLabel(session.date, locale)}</span>
    <span className="tnum shrink-0 text-[10px] text-faint">{formatCompact(session.date, locale).md}</span>
    <span className="min-w-0 flex-1 truncate text-right text-[11px] font-medium text-fg">{formatSessionPerformance(session, locale)}</span>
    <span className="tnum shrink-0 text-[10px] text-faint">{formatCredit(session.completionCredits)} {tx(locale, "组", "sets", "セット")}</span>
  </Link>;
}

function formatSessionPerformance(session: ExerciseTrackArchiveSession, locale: Locale) {
  const metric = session.metric;
  if (!metric) return typeLabel(session.type);
  const set = metric.set;
  if (metric.kind === "duration") return `${set.durationSeconds ?? 0}${tx(locale, "秒", "s", "秒")}`;
  if (metric.kind === "distance") return `${set.distanceMeters ?? 0}m`;
  if (set.weight > 0) return `${set.weight}kg × ${set.reps}`;
  return `${set.reps}${tx(locale, "次", " reps", "回")}`;
}

function formatMetric(metric: TrackPerformanceMetric | null, locale: Locale) {
  if (!metric) return "—";
  if (metric.kind === "e1rm") return `e1RM ${metric.value}kg`;
  if (metric.kind === "duration") return `${metric.value}${tx(locale, "秒", "s", "秒")}`;
  if (metric.kind === "distance") return `${metric.value}m`;
  return `${metric.value}${tx(locale, "次", " reps", "回")}`;
}

function TrendBadge({ trend, locale }: { trend: TrackTrend; locale: Locale }) {
  const label = trend.status === "improving"
    ? tx(locale, "提升", "Improving", "向上")
    : trend.status === "regressing"
      ? tx(locale, "回落", "Declining", "低下")
      : trend.status === "plateau"
        ? tx(locale, "平台", "Plateau", "停滞")
        : trend.status === "stable"
          ? tx(locale, "稳定", "Stable", "安定")
          : tx(locale, "样本少", "Low sample", "少数");
  return <span className={"shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold " + (trend.status === "improving" ? "bg-accent-soft text-accent" : trend.status === "regressing" ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted")}>{label}</span>;
}

function trendCopy(trend: TrackTrend, locale: Locale) {
  if (trend.sessionCount < 2) return tx(locale, "还需要再完成 1 次同轨道训练，系统才会判断变化。", "Complete one more session on this track before judging change.", "同じトラックをもう1回完了すると変化を判断できます。");
  if (trend.status === "improving") return tx(locale, "同轨道表现正在提升，保持当前处方和加重规则。", "Performance is improving on this track. Keep the current prescription and progression rule.", "同一トラックのパフォーマンスが向上しています。現在の処方と進行ルールを維持します。");
  if (trend.status === "regressing") return tx(locale, "近期表现回落。下一次先维持重量或目标，检查恢复后再决定是否调整。", "Recent performance declined. Hold the load or target next time and check recovery before adjusting.", "最近のパフォーマンスが低下しています。次回は負荷や目標を維持し、回復を確認してから調整します。");
  if (trend.status === "plateau") return tx(locale, "连续记录变化很小。先补目标次数，或调整动作顺序，不同时增加重量和组数。", "Recent records changed very little. Build target reps or adjust exercise order without raising load and sets together.", "最近の変化が小さいため、まず目標回数か種目順を調整し、重量とセットを同時に増やしません。");
  return tx(locale, "表现处于稳定范围，继续按当前目标推进。", "Performance is stable. Continue with the current target.", "パフォーマンスは安定範囲です。現在の目標を続けます。");
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-1 py-1 text-center"><p className="truncate text-[9px] text-faint">{label}</p><p className="tnum mt-0.5 truncate text-[12px] font-semibold text-fg">{value}</p></div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg bg-surface-2 px-2 py-1.5 text-center"><p className="truncate text-[9px] text-faint">{label}</p><p className="tnum mt-0.5 truncate text-[11px] font-semibold text-fg">{value}</p></div>;
}

function formatCredit(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
