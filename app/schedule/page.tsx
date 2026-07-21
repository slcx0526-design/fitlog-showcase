"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useUIMode } from "@/lib/uiMode";
import {
  WEEKDAY_LABELS,
  currentStreak,
  dateKeyWeekdayIndex,
  getScheduledType,
  trainingDayCountInLast,
} from "@/lib/schedule";
import { usePersona } from "@/lib/copy";
import { localeText, useI18n } from "@/lib/i18n";
import MicrocycleEditor from "@/components/MicrocycleEditor";
import { formatCompact, weekKeysFor } from "@/lib/date";
import { useToday } from "@/lib/hooks";
import {
  CORE_MUSCLES,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  type MuscleGroup,
} from "@/lib/muscles";
import { computeVolumeSummary } from "@/lib/volume";
import { workingSets } from "@/lib/trainingMetrics";
import { buildTrainingAnalysis } from "@/lib/trainingAnalysis";
import type { Schedule, TrainingType } from "@/lib/types";

const TYPE_OPTIONS: Array<{ value: TrainingType | ""; label: string }> = [
  { value: "push", label: "推" },
  { value: "pull", label: "拉" },
  { value: "legs", label: "腿" },
  { value: "rest", label: "休" },
  { value: "", label: "—" },
];

export default function SchedulePage() {
  const { tr, locale } = useI18n();
  const { persona, typeName } = usePersona();
  const { loaded, data, setSchedule } = useStore();
  const { mode } = useUIMode();
  const today = useToday();

  const todayIdx = dateKeyWeekdayIndex(today);
  const week = useMemo(() => weekKeysFor(today), [today]);

  const stats = useMemo(() => {
    const streak = currentStreak(data.days, today);
    const last28 = trainingDayCountInLast(data.days, 28, today);
    return { streak, last28 };
  }, [data.days, today]);
  const analysis = useMemo(() => buildTrainingAnalysis(data, today), [data, today]);

  if (!loaded) {
    return (
      <div className="pt-2">
        <div className="h-7 w-32 rounded bg-surface-2" />
        <div className="mt-4 h-32 rounded-lg bg-surface-2" />
      </div>
    );
  }

  const schedule: Schedule = data.schedule;
  const todayPlanned = getScheduledType(schedule, todayIdx);

  function setDay(idx: number, value: TrainingType | "") {
    const next: Schedule = { ...schedule, split: [...schedule.split] };
    next.split[idx] = value;
    setSchedule(next);
  }

  return (
    <div>
      <header className="control-card mb-4 p-3.5">
        <p className="text-[12px] font-medium uppercase tracking-wide text-faint">
          {tr("训练规划")}
        </p>
        <h1 className="mt-0.5 text-[22px] font-bold tracking-tight text-fg">
          {tr("计划")}
        </h1>
      </header>

      {/* —— 今日计划 + 入口 —— */}
      <section className="mb-5">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
          {tr("今日")}
        </h2>
        <Link
          href="/train"
          className="action-card control-card block px-4 py-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                {tr(WEEKDAY_LABELS[todayIdx])}
              </p>
              <p
                className={
                  "mt-0.5 text-[22px] font-bold tracking-tight " +
                  (todayPlanned ? "text-fg" : "text-muted")
                }
              >
                {todayPlanned
                  ? typeName[todayPlanned](mode)
                  : mode === "lite"
                  ? "NOT PLANNED"
                  : tr("未规划")}
              </p>
            </div>
            <span className="text-[13px] font-medium text-muted">
              {persona.startSession(mode)} →
            </span>
          </div>
        </Link>
      </section>

      {/* —— 每周排程编辑 —— */}
      <section className="mb-5">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
          {tr("每周排程")}
        </h2>
        <div className="control-card px-3 py-1">
          {WEEKDAY_LABELS.map((label, idx) => {
            const canOpen = week[idx] <= today;
            const daySummary = <>
              <span className="shrink-0 text-[13px] font-semibold">
                {tr(label)}
                {idx === todayIdx && <span className="ml-1 text-[10px] uppercase">{tr("· 今")}</span>}
              </span>
              <span className="tnum text-[11px] text-faint">{formatCompact(week[idx], locale).md}</span>
              {canOpen ? <DayStatus date={week[idx]} /> : <span className="ml-auto text-[10px] font-medium text-faint">{localeText(locale, "待开始", "Upcoming", "予定")}</span>}
            </>;
            return <div key={idx} className="soft-divider border-t py-2 first:border-t-0">
              <div className="mb-1.5 flex items-center gap-2">
                {canOpen ? <Link href={`/train?date=${week[idx]}`} className={"press flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 " + (idx === todayIdx ? "text-accent" : "text-fg")}>{daySummary}</Link> : <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-muted">{daySummary}</div>}
                {canOpen && <Link href={`/train?date=${week[idx]}`} className="press rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-accent">
                  {tr("训练")}
                </Link>}
              </div>
              <div className="control-strip grid grid-cols-5 gap-1 rounded-xl p-1">
                {TYPE_OPTIONS.map((opt) => {
                  const active = schedule.split[idx] === opt.value;
                  return (
                    <button type="button"
                      key={opt.value || "empty"}
                      onClick={() => setDay(idx, opt.value)}
                      className={
                        "choice-chip press h-9 text-[13px] font-semibold " +
                        (active
                          ? "bg-fg text-bg"
                          : "text-muted")
                      }
                    >
                      {tr(opt.label)}
                    </button>
                  );
                })}
              </div>
            </div>;
          })}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-faint">
          {tr("推 / 拉 / 腿 / 休 / 无规划。改动即保存,只是建议,不约束实际训练。")}
        </p>
      </section>

      <MicrocycleEditor />

      {/* —— 训练模板入口 —— */}
      <section className="mb-5">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
          {tr("训练模板")}
        </h2>
        <Link
          href="/templates"
          className="control-card press flex items-center gap-3 px-3.5 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-fg">{tr("推1 / 推2 / 拉1 / 拉2 / 腿")}</p>
            <p className="mt-0.5 text-[11px] text-faint">
              {tr("按部位选动作 · 存目标组数与范围 · 训练页一键套用")}
            </p>
          </div>
          <TplSummary />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-faint">
            <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </section>

      {/* —— 本周容量稽核 —— */}
      <WeeklyVolumeSection week={week} />

      {/* —— 状态：连续 + 近 28 天 + 减载提醒 —— */}
      <section>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
          {tr("训练状态")}
        </h2>
        <div className="control-card grid grid-cols-2 gap-2 p-3">
          <Stat
            label={persona.streak(mode)}
            value={stats.streak}
            unit={persona.days(mode)}
          />
          <Stat
            label={mode === "lite" ? "LAST 28 D" : tr("近 28 天")}
            value={stats.last28}
            unit={mode === "lite" ? "TRAINING" : tr("次训练")}
          />
        </div>
        {analysis.recovery.active ? (
          <p className="mt-2 flex items-center gap-2 rounded-md border border-warn-soft bg-warn-soft px-3 py-2 text-[12px] text-warn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 8V13M12 16.5V16.6M4.9 19H19.1L12 5L4.9 19Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              {localeText(locale, `恢复优先：${analysis.recovery.regressingExercises} 个动作持续回落，最近 ${analysis.load.difficultySamples} 次难度记录中 ${analysis.load.hardSessions} 次吃力。`, `Recovery first: ${analysis.recovery.regressingExercises} exercises are regressing and ${analysis.load.hardSessions} of ${analysis.load.difficultySamples} recent sessions felt hard.`, `回復優先：${analysis.recovery.regressingExercises} 種目が低下し、直近 ${analysis.load.difficultySamples} 回中 ${analysis.load.hardSessions} 回がきつい状態です。`)}
            </span>
          </p>
        ) : (
          <p className="mt-2 px-1 text-[11px] text-faint">
            {analysis.load.difficultySamples
              ? localeText(locale, `最近 ${analysis.load.difficultySamples} 次难度记录中 ${analysis.load.hardSessions} 次吃力；未同时出现多动作回落或多肌群超量，不自动要求减载。`, `${analysis.load.hardSessions} of ${analysis.load.difficultySamples} recent sessions felt hard; without multi-exercise regression or broad excess volume, no deload is prescribed.`, `直近 ${analysis.load.difficultySamples} 回中 ${analysis.load.hardSessions} 回がきついものの、複数種目の低下や広範な超過がないため減量週は提案しません。`)
              : localeText(locale, "训练次数只作事实展示；完成训练时记录整体感受后，系统才会结合表现与容量判断恢复。", "Session count is factual only. Log overall effort after workouts so recovery can be judged with performance and volume.", "回数は事実表示のみです。終了時の全体負荷を記録すると、パフォーマンスと容量を合わせて回復を判断します。")}
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tnum text-[24px] font-bold text-fg">{value}</span>
        <span className="text-[11px] text-faint">{unit}</span>
      </p>
    </div>
  );
}

function TplSummary() {
  const { tr, locale } = useI18n();
  const { data } = useStore();
  const n = data.templates?.length ?? 0;
  return (
    <span className="tnum shrink-0 text-[12px] text-muted">
      {n ? localeText(locale, `${n} 个模板`, `${n} ${n === 1 ? "template" : "templates"}`, `${n}テンプレート`) : tr("未设置")}
    </span>
  );
}

function DayStatus({ date }: { date: string }) {
  const { tr } = useI18n();
  const { data } = useStore();
  const day = data.days[date];
  const workout = day?.workout;
  const sets = workout?.exercises.reduce((sum, exercise) => sum + workingSets(exercise.sets).length, 0) ?? 0;
  if (workout?.type === "rest") return <span className="ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">{tr("休息")}</span>;
  if (workout?.done && sets > 0) return <span className="ml-auto rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{tr("已完成")}</span>;
  if (sets > 0) return <span className="tnum ml-auto rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{tr("{n} 组", { n: sets })}</span>;
  if (day?.nutrition || (day?.cardio?.length ?? 0) > 0) return <span className="ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">{tr("有日志")}</span>;
  return <span className="ml-auto text-[10px] text-faint">{tr("未记录")}</span>;
}

// ============================================================
// 本周容量稽核（C）：按主肌群累计本周已记录组数，对照训练水平的上下限
// 核心肌群常驻显示（漏练也可见）；其余肌群仅在本周有量时出现
// ============================================================
function WeeklyVolumeSection({ week }: { week: string[] }) {
  const { tr, locale } = useI18n();
  const { data } = useStore();
  const level = data.profile?.trainingLevel;

  const volume = useMemo(
    () => computeVolumeSummary(week.map((key) => data.days[key]), level, data.muscleTargets),
    [data.days, data.muscleTargets, level, week]
  );

  // 要展示的肌群：核心肌群 ∪ 本周有量的其它肌群，按统一顺序排
  const shown = useMemo(() => {
    const set = new Set<MuscleGroup>(CORE_MUSCLES);
    volume.rows.forEach((row) => {
      if (row.rawDirectSets > 0 || row.indirectEffectiveSets > 0) set.add(row.muscle);
    });
    return MUSCLE_ORDER.filter((m) => set.has(m));
  }, [volume.rows]);

  const totalSets = volume.totalWorkingSets;
  const rangeLabel = `${formatCompact(week[0], locale).md} – ${formatCompact(week[6], locale).md}`;

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
          {tr("本周容量")}
        </h2>
        <span className="tnum text-[11px] text-faint">{rangeLabel}</span>
      </div>

      <div className="control-card p-3">
        {!level && (
          <Link
            href="/settings"
            className="press mb-2.5 flex items-center justify-between control-strip rounded-xl px-3 py-2 text-[12px] text-muted"
          >
            <span>{tr("设置训练水平后显示达标对照")}</span>
            <span className="font-medium text-accent">{tr("先设训练水平 →")}</span>
          </Link>
        )}

        {totalSets === 0 ? (
          <p className="py-3 text-center text-[12px] text-faint">
            {tr("本周还没有训练记录")}
          </p>
        ) : (
          <div className="space-y-2">
            {shown.map((m) => {
              const row = volume.rows.find((item) => item.muscle === m)!;
              const sets = row.directEffectiveSets;
              const target = row.target;
              const status = row.status;
              // 进度条：以上限为满，按状态着色
              const pct = Math.max(
                4,
                Math.min(100, Math.round((sets / target.high) * 100))
              );
              const barColor =
                status === "under"
                  ? "var(--warn)"
                  : status === "over"
                  ? "var(--faint)"
                  : "var(--accent)";
              const statusLabel =
                status === "under"
                  ? tr("欠")
                  : status === "over"
                  ? tr("偏多")
                  : tr("达标");
              const statusColor =
                status === "under"
                  ? "text-warn"
                  : status === "over"
                  ? "text-faint"
                  : "text-accent";
              return (
                <div key={m} className="flex items-center gap-2.5">
                  <span className="w-12 shrink-0 text-[13px] text-fg">
                    {tr(MUSCLE_LABELS[m])}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span className="tnum w-14 shrink-0 text-right text-[12px] text-muted">
                    {sets}
                    <span className="text-faint"> / {target.low}–{target.high}</span>
                  </span>
                  {level && (
                    <span
                      className={
                        "w-8 shrink-0 text-right text-[11px] font-semibold " +
                        statusColor
                      }
                    >
                      {statusLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
          {localeText(locale, "与训练复盘口径一致：只比较直接有效组；连带刺激用于恢复参考。", "Matches Training Review: targets use direct effective sets; secondary stimulus is recovery context.", "トレーニング振り返りと同じ基準です。目標は直接有効セット、補助刺激は回復判断に使います。")}
        </p>
      </div>
    </section>
  );
}
