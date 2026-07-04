"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useUIMode } from "@/lib/uiMode";
import {
  WEEKDAY_LABELS,
  currentStreak,
  getScheduledType,
  todayWeekdayIndex,
  trainingDayCountInLast,
} from "@/lib/schedule";
import { usePersona } from "@/lib/copy";
import { useI18n } from "@/lib/i18n";
import { currentWeekKeys, formatCompact } from "@/lib/date";
import {
  CORE_MUSCLES,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  weeklyTargetFor,
  type MuscleGroup,
} from "@/lib/muscles";
import { volumeStatus, weeklyVolume } from "@/lib/volume";
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

  const todayIdx = todayWeekdayIndex();

  const stats = useMemo(() => {
    const streak = currentStreak(data.days);
    const last28 = trainingDayCountInLast(data.days, 28);
    return { streak, last28 };
  }, [data.days]);

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
  const week = currentWeekKeys();

  function setDay(idx: number, value: TrainingType | "") {
    const next: Schedule = { split: [...schedule.split] };
    next.split[idx] = value;
    setSchedule(next);
  }

  // 减载提示：近 28 天 ≥18 天训练（≈每周 4.5 次）视作高负荷
  const heavyLoad = stats.last28 >= 18;

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
          {WEEKDAY_LABELS.map((label, idx) => (
            <div
              key={idx}
              className={
                "soft-divider border-t py-2 first:border-t-0 " +
                (idx === todayIdx ? "" : "")
              }
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Link
                  href={`/train?date=${week[idx]}`}
                  className={
                    "press flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 " +
                    (idx === todayIdx ? "text-accent" : "text-fg")
                  }
                >
                  <span className="shrink-0 text-[13px] font-semibold">
                    {tr(label)}
                    {idx === todayIdx && (
                      <span className="ml-1 text-[10px] uppercase">
                        {tr("· 今")}
                      </span>
                    )}
                  </span>
                  <span className="tnum text-[11px] text-faint">
                    {formatCompact(week[idx], locale).md}
                  </span>
                  <DayStatus date={week[idx]} />
                </Link>
                <Link href={`/train?date=${week[idx]}`} className="press rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-accent">
                  {tr("训练")}
                </Link>
              </div>
              <div className="control-strip grid grid-cols-5 gap-1 rounded-xl p-1">
                {TYPE_OPTIONS.map((opt) => {
                  const active = schedule.split[idx] === opt.value;
                  return (
                    <button
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
            </div>
          ))}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-faint">
          {tr("推 / 拉 / 腿 / 休 / 无规划。改动即保存,只是建议,不约束实际训练。")}
        </p>
      </section>

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
              {tr("按部位选动作 · 存目标组数×次数 · 训练页一键套用")}
            </p>
          </div>
          <TplSummary />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-faint">
            <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </section>

      {/* —— 本周容量稽核 —— */}
      <WeeklyVolumeSection />

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
        {heavyLoad ? (
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
              {tr("近 4 周训练 {n} 天,可考虑安排减载(信息提示,不强制)", { n: stats.last28 })}
            </span>
          </p>
        ) : (
          <p className="mt-2 px-1 text-[11px] text-faint">
            {tr("近 4 周训练 {n} 天 —— 仅作参考,不做训练建议", { n: stats.last28 })}
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
  const { tr } = useI18n();
  const { data } = useStore();
  const n = data.templates?.length ?? 0;
  return (
    <span className="tnum shrink-0 text-[12px] text-muted">
      {n ? tr("{n} 个模板", { n }) : tr("未设置")}
    </span>
  );
}

function DayStatus({ date }: { date: string }) {
  const { data } = useStore();
  const day = data.days[date];
  const workout = day?.workout;
  const sets = workout?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) ?? 0;
  if (workout?.type === "rest") return <span className="ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">休息</span>;
  if (workout?.done) return <span className="ml-auto rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">已完成</span>;
  if (sets > 0) return <span className="tnum ml-auto rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{sets} 组</span>;
  if (day?.nutrition || (day?.cardio?.length ?? 0) > 0) return <span className="ml-auto rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">有日志</span>;
  return <span className="ml-auto text-[10px] text-faint">未记录</span>;
}

// ============================================================
// 本周容量稽核（C）：按主肌群累计本周已记录组数，对照训练水平的上下限
// 核心肌群常驻显示（漏练也可见）；其余肌群仅在本周有量时出现
// ============================================================
function WeeklyVolumeSection() {
  const { tr, locale } = useI18n();
  const { data, getDay } = useStore();
  const level = data.profile?.trainingLevel;

  const week = useMemo(() => currentWeekKeys(), []);
  const vol = useMemo(
    () => weeklyVolume(week.map((k) => getDay(k))),
    // getDay 依赖 data.days；data 变更即重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.days, week]
  );

  // 要展示的肌群：核心肌群 ∪ 本周有量的其它肌群，按统一顺序排
  const shown = useMemo(() => {
    const set = new Set<MuscleGroup>(CORE_MUSCLES);
    (Object.keys(vol) as MuscleGroup[]).forEach((m) => {
      if ((vol[m] ?? 0) > 0) set.add(m);
    });
    return MUSCLE_ORDER.filter((m) => set.has(m));
  }, [vol]);

  const totalSets = Object.values(vol).reduce((s, n) => s + (n ?? 0), 0);
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
              const sets = vol[m] ?? 0;
              const target = weeklyTargetFor(m, level);
              const status = volumeStatus(sets, target.low, target.high);
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
          {tr("按主肌群计，1 组 = 1 个动作的 1 组。仅统计已打标动作，旧记录可能少算。")}
        </p>
      </div>
    </section>
  );
}
