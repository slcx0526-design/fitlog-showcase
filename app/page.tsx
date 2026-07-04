"use client";

import Link from "next/link";
import { useMemo } from "react";
import { resolveCutEnergyPlan } from "@/lib/cut";
import { isCutModeActive } from "@/lib/cutMode";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { isPersonaMode, useUIMode } from "@/lib/uiMode";
import { pulseFeedback } from "@/lib/feedback";
import { formatCompact, formatDisplay, relativeLabel } from "@/lib/date";
import { cardioWeekSummary } from "@/lib/cardio";
import { useToday } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { currentStreak, getScheduledType, isDayNutritionLogged, isDayTrained, todayWeekdayIndex } from "@/lib/schedule";
import { typeLabel } from "@/lib/exercises";
import type { DayLog, TrainingType } from "@/lib/types";
import MorningCheckIn from "@/components/MorningCheckIn";

function isTemplateType(type: TrainingType | null): type is "push" | "pull" | "legs" {
  return type === "push" || type === "pull" || type === "legs";
}

export default function TodayPage() {
  const { loaded, data, getDay } = useStore();
  const { locale } = useI18n();
  const { mode } = useUIMode();
  const toast = useToast();
  const today = useToday(() => toast.show(isPersonaMode(mode) ? "NEW DAY" : "新的一天"));
  const day = getDay(today);
  const workout = day?.workout;
  const setCount = workout?.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) ?? 0;
  const scheduled = getScheduledType(data.schedule, todayWeekdayIndex());
  const displayType = workout?.type ?? scheduled;
  const scheduledTemplates = isTemplateType(scheduled)
    ? (data.templates ?? []).filter((tpl) => tpl.type === scheduled)
    : [];
  const recentTraining = useMemo(() => {
    return Object.entries(data.days)
      .filter(([date, item]) => {
        if (date >= today) return false;
        const wk = item.workout;
        return !!wk && (wk.type === "rest" || wk.exercises.some((exercise) => exercise.sets.length > 0));
      })
      .sort(([a], [b]) => b.localeCompare(a))[0] ?? null;
  }, [data.days, today]);
  const trained = isDayTrained(day);
  const nutritionLogged = isDayNutritionLogged(day);
  const kcal = day?.nutrition?.calories ?? 0;
  const cardioMinutes = (day?.cardio ?? []).reduce((sum, item) => sum + item.minutes, 0);
  const cardioWeekly = useMemo(() => cardioWeekSummary(data.days, data.cutPlan), [data.days, data.cutPlan]);
  const cutActive = isCutModeActive(data.cutPlan);
  const energy = useMemo(() => resolveCutEnergyPlan(data.profile, data.cutPlan, data.days, data.bodyWeights, today), [data.profile, data.cutPlan, data.days, data.bodyWeights, today]);
  const weight = data.bodyWeights.find((entry) => entry.date === today)?.weight;
  const waist = data.waistEntries.find((entry) => entry.date === today)?.waist;
  const completion = [weight != null, waist != null, trained || workout?.type === "rest", nutritionLogged].filter(Boolean).length;
  const setupItems = [
    {
      label: "身体资料",
      done: !!(data.profile?.sex && data.profile.heightCm && data.profile.birthYear),
      href: "/settings",
    },
    {
      label: "身体测量",
      done: data.bodyWeights.length > 0 && data.waistEntries.length > 0,
      href: "/progress?tab=body",
    },
    {
      label: "训练水平",
      done: !!data.profile?.trainingLevel,
      href: "/settings",
    },
    {
      label: "训练模板",
      done: (data.templates?.some((tpl) => tpl.items.length > 0) ?? false),
      href: "/templates",
    },
  ];
  const setupRemaining = setupItems.filter((item) => !item.done);

  if (!loaded) return <TodaySkeleton />;

  return (
    <div className="pb-2">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">FITLOG 2.7 · TODAY</p>
          <h1 className="mt-1 text-[25px] font-bold tracking-tight text-fg">{formatDisplay(today, locale)}</h1>
        </div>
        <Link href="/settings" aria-label="设置" className="press grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-faint shadow-sm">
          <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 2.75V5M12 19V21.25M4.75 12H2.5M21.5 12H19.25M6.9 6.9L5.3 5.3M18.7 18.7L17.1 17.1M6.9 17.1L5.3 18.7M18.7 5.3L17.1 6.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </Link>
      </header>

      <section className="metric-sheen mb-4 rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-fg">今天的执行节奏</p>
            <p className="mt-0.5 text-[11px] text-faint">先测量，再训练/饮食；活动只记录，不兑换热量。</p>
          </div>
          <span className="tnum rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-muted">{completion}/4</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="今日完成状态">
          <ProgressPill label="体重" done={weight != null} />
          <ProgressPill label="腰围" done={waist != null} />
          <ProgressPill label="训练" done={trained || workout?.type === "rest"} />
          <ProgressPill label="饮食" done={nutritionLogged} />
        </div>
      </section>

      {setupRemaining.length > 0 && (
        <SetupNudge items={setupItems} remaining={setupRemaining.length} />
      )}

      <MorningCheckIn date={today} />

      <section className={"action-card lite-card mb-3 overflow-hidden rounded-2xl border p-4 shadow-sm " + (workout && !workout.done && workout.type !== "rest" ? "border-accent bg-accent-soft" : "border-border bg-surface")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">训练 · PRIMARY ACTION</p>
            <h2 className="mt-1 text-[25px] font-bold tracking-tight text-fg">{displayType ? typeLabel(displayType) : "安排今天的训练"}</h2>
            <p className="mt-1 text-[12px] text-muted">{trainingSubline(workout?.type, workout?.done, setCount, !!scheduled)}</p>
          </div>
          <span className={"grid h-10 w-10 place-items-center rounded-xl " + (trained ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 10.5V8.5C5 7.4 5.9 6.5 7 6.5H17C18.1 6.5 19 7.4 19 8.5V10.5M3.5 10.5H20.5V16.5C20.5 17.6 19.6 18.5 18.5 18.5H5.5C4.4 18.5 3.5 17.6 3.5 16.5V10.5ZM8 6.5V4.5M16 6.5V4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>
        <Link href={workout?.type ? "/train" : scheduled ? `/train?start=${scheduled}` : "/train"} onClick={() => pulseFeedback("start")} className="press mt-4 flex h-12 items-center justify-center rounded-xl bg-fg text-[15px] font-semibold text-bg">
          {workout?.done ? "查看本次训练" : workout?.type && setCount > 0 ? "继续训练" : scheduled ? `开始${typeLabel(scheduled)}` : "选择训练"}
          <span className="ml-2" aria-hidden="true">→</span>
        </Link>
        {!workout?.type && isTemplateType(scheduled) && (
          <TemplateStartPanel type={scheduled} templates={scheduledTemplates} />
        )}
      </section>

      {recentTraining && <RecentTrainingLink date={recentTraining[0]} day={recentTraining[1]} />}

      <section className="grid grid-cols-2 gap-3">
        <Link href="/nutrition" className="metric-sheen press rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">饮食</span><MiniArrow /></div>
          <p className="tnum mt-3 text-[24px] font-bold text-fg">{kcal || "—"}<span className="ml-1 text-[11px] font-medium text-faint">kcal</span></p>
          <p className="mt-1 text-[11px] text-muted">{cutActive && energy.calorieTarget ? `目标 ${energy.calorieTarget} · ${remainingText(energy.calorieTarget - kcal)}` : nutritionLogged ? "已记录今日摄入" : "记录真实摄入"}</p>
        </Link>
        <Link href="/cardio" className="metric-sheen press rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">有氧</span><MiniArrow /></div>
          <p className="tnum mt-3 text-[24px] font-bold text-fg">{cardioWeekly.totalMinutes}<span className="ml-1 text-[11px] font-medium text-faint">/ {cardioWeekly.targetMinutes} 分</span></p>
          <p className="mt-1 text-[11px] text-muted">{cardioMinutes ? `今日 ${cardioMinutes} 分钟 · 本周进度` : "本周执行目标 · 不换热量"}</p>
        </Link>
      </section>

      <section className="mt-3 rounded-2xl border border-border bg-surface px-3.5 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-fg">计划与趋势</p>
            <p className="mt-0.5 text-[11px] text-faint">连续 {currentStreak(data.days)} 天有记录 · {cutActive ? (energy.maintenanceSource === "trend" ? "趋势已校准" : "当前使用公式起点") : "未开启减脂模式"}</p>
          </div>
          <Link href={cutActive ? "/cut" : "/progress?tab=body"} className="press rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-accent">{cutActive ? "查看减脂" : "查看进度"}</Link>
        </div>
      </section>
    </div>
  );
}

function ProgressPill({ label, done }: { label: string; done: boolean }) { return <div className={"flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-center text-[10px] font-semibold " + (done ? "bg-accent-soft text-accent" : "bg-surface-2 text-faint")}><span className={"h-1.5 w-1.5 rounded-full " + (done ? "bg-accent" : "bg-border-strong")} aria-hidden="true" />{label}</div>; }
function SetupNudge({ items, remaining }: { items: { label: string; done: boolean; href: string }[]; remaining: number }) {
  const next = items.find((item) => !item.done);
  if (!next) return null;
  return <section className="control-card mb-4 p-3.5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[13px] font-semibold text-fg">完善记录基础</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-faint">还差 {remaining} 项，补齐后体脂、心率区间和训练容量会更准。</p>
      </div>
      <Link href={next.href} className="press shrink-0 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-accent">继续</Link>
    </div>
    <div className="mt-3 grid grid-cols-4 gap-1.5">
      {items.map((item) => <Link key={item.label} href={item.href} className={"flex min-h-8 items-center justify-center rounded-lg px-1.5 text-center text-[10px] font-semibold " + (item.done ? "bg-accent-soft text-accent" : "bg-surface-2 text-faint")}>{item.label}</Link>)}
    </div>
  </section>;
}
function MiniArrow() { return <span className="text-[16px] leading-none text-faint" aria-hidden="true">›</span>; }
function remainingText(value: number) { return value >= 0 ? `剩 ${Math.round(value)}` : `超 ${Math.abs(Math.round(value))}`; }
function trainingSubline(type: TrainingType | undefined, done: boolean | undefined, sets: number, hasPlan: boolean) { if (type === "rest") return "今天安排休息；恢复也是计划的一部分。"; if (done) return `${sets} 组已完成，训练记录已进入进度页。`; if (type && sets > 0) return `已完成 ${sets} 组，随时继续。`; if (hasPlan) return "计划只是建议；点击开始后才会创建实际训练。"; return "训练记录只在你主动开始后创建。"; }
function RecentTrainingLink({ date, day }: { date: string; day: DayLog }) {
  const workout = day.workout;
  if (!workout) return null;
  const sets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  return <Link href={`/train?date=${date}`} className="control-card press mb-3 flex items-center gap-3 px-3.5 py-3">
    <div className="min-w-0 flex-1">
      <p className="text-[12px] font-semibold text-fg">最近训练</p>
      <p className="tnum mt-0.5 truncate text-[11px] text-faint">{relativeLabel(date)} · {formatCompact(date).md} · {typeLabel(workout.type)} · {workout.type === "rest" ? "休息" : `${sets} 组`}</p>
    </div>
    <span className="press rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-accent">复盘</span>
  </Link>;
}
function TemplateStartPanel({ type, templates }: { type: Exclude<TrainingType, "rest" | "custom">; templates: { id: string; name: string; items: { sets: number }[] }[] }) {
  if (!templates.length) {
    return <Link href="/templates" className="press mt-2 flex h-10 items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface text-[12px] font-semibold text-muted">为{typeLabel(type)}建立模板</Link>;
  }
  return <div className="mt-2 grid gap-1.5">
    {templates.slice(0, 2).map((tpl) => {
      const sets = tpl.items.reduce((sum, item) => sum + item.sets, 0);
      return <Link key={tpl.id} href={`/train?start=${type}&template=${tpl.id}`} onClick={() => pulseFeedback("start")} className="choice-chip press flex min-h-10 items-center justify-between gap-2 border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-fg">
        <span className="min-w-0 truncate">{tpl.name.trim() || "未命名模板"}</span>
        <span className="tnum shrink-0 text-faint">{tpl.items.length} 动作 · {sets} 组</span>
      </Link>;
    })}
    {templates.length > 2 && <Link href="/templates" className="press text-center text-[11px] font-semibold text-accent">还有 {templates.length - 2} 个模板</Link>}
  </div>;
}
function TodaySkeleton() { return <div className="space-y-3"><div className="h-16 rounded-2xl bg-surface-2" /><div className="h-24 rounded-2xl bg-surface-2" /><div className="h-44 rounded-2xl bg-surface-2" /></div>; }
