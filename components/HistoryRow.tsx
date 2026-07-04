"use client";

import { useState } from "react";
import Link from "next/link";
import type { DayLog, SetRecord } from "@/lib/types";
import { formatCompact, relativeLabel } from "@/lib/date";
import { typeLabel } from "@/lib/exercises";
import { zoneMeta } from "@/lib/hr";
import { useI18n } from "@/lib/i18n";

function summarize(sets: SetRecord[]) {
  if (!sets.length) return "—";
  return sets.map((s) => `${s.weight}×${s.reps}`).join("  ");
}

export default function HistoryRow({
  date,
  day,
}: {
  date: string;
  day: DayLog | undefined;
}) {
  const { tr, locale } = useI18n();
  const [open, setOpen] = useState(false);

  const workout = day?.workout;
  const trained =
    !!workout &&
    (workout.type === "rest" ||
      (workout.exercises?.some((e) => e.sets.length > 0) ?? false));
  const isRest = workout?.type === "rest";
  const setCount = workout
    ? workout.exercises.reduce((s, e) => s + e.sets.length, 0)
    : 0;
  const exCount = workout
    ? workout.exercises.filter((e) => e.sets.length > 0).length
    : 0;
  const kcal = day?.nutrition?.calories ?? 0;
  const hasNutrition = kcal > 0;
  const cardio = day?.cardio ?? [];
  const cardioMin = cardio.reduce((s, c) => s + c.minutes, 0);
  const hasCardio = cardioMin > 0;
  const empty = !trained && !hasNutrition && !hasCardio;

  const { wd, md } = formatCompact(date, locale);

  return (
    <div className="soft-divider border-b">
      <button
        onClick={() => setOpen((v) => !v)}
        className="press flex w-full items-center gap-3 py-3 text-left"
      >
        {/* 日期 */}
        <div className="w-14 shrink-0">
          <p className="text-[13px] font-semibold text-fg">{relativeLabel(date, locale)}</p>
          <p className="tnum text-[11px] text-faint">{md}</p>
        </div>

        {/* 状态 */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {empty ? (
            <span className="text-[13px] text-faint">{tr("未记录")}</span>
          ) : (
            <>
              {isRest ? (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                  {tr("休息")}
                </span>
              ) : trained ? (
                <>
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                    {tr(workout ? typeLabel(workout.type) : "练")}
                  </span>
                  <span className="tnum text-[11px] text-faint">
                    {tr("{n} 动作 · {m} 组", { n: exCount, m: setCount })}
                  </span>
                </>
              ) : (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-faint">
                  {tr("无训练")}
                </span>
              )}
              {(hasNutrition || hasCardio) && (
                <span className="tnum ml-auto flex items-center gap-2 text-[12px] text-muted">
                  {hasCardio && <span>{tr("有氧 {n}′", { n: cardioMin })}</span>}
                  {hasNutrition && <span>{kcal} kcal</span>}
                </span>
              )}
            </>
          )}
        </div>

        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0 text-faint"
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .15s",
          }}
        >
          <path
            d="M6 9L12 15L18 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="animate-slidedown space-y-3 pb-3.5">
          {workout && !isRest && workout.exercises.length > 0 && (
            <div className="control-strip rounded-xl p-3">
              {workout.exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="soft-divider flex items-baseline gap-2 border-t py-1.5 first:border-t-0 first:pt-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                    {tr(ex.name)}
                    {ex.isMain && (
                      <span className="ml-1 text-[10px] text-accent">{tr("主")}</span>
                    )}
                  </span>
                  <span className="tnum text-right text-[12px] text-muted">
                    {summarize(ex.sets)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {hasNutrition && day?.nutrition && (
            <div className="control-strip tnum flex items-center gap-3 rounded-xl px-3 py-2 text-[12px]">
              <span className="text-fg">{day.nutrition.calories} kcal</span>
              <span className="text-faint">|</span>
              <span className="text-muted">P {day.nutrition.protein}</span>
              <span className="text-muted">C {day.nutrition.carbs}</span>
              <span className="text-muted">F {day.nutrition.fat}</span>
            </div>
          )}

          {hasCardio && (
            <div className="control-strip space-y-1.5 rounded-xl p-3">
              {cardio.map((c) => (
                <div
                  key={c.id}
                  className="soft-divider flex items-baseline gap-2 border-t pt-1.5 first:border-t-0 first:pt-0"
                >
                  <span className="text-[13px] text-fg">{tr(c.mode)}</span>
                  <span className="tnum text-[12px] text-muted">{c.minutes}′</span>
                  {c.zone && (
                    <span
                      className="tnum rounded px-1.5 text-[11px] font-bold"
                      style={{
                        backgroundColor: "var(--accent-soft)",
                        color: "var(--accent)",
                      }}
                    >
                      Z{c.zone} {tr(zoneMeta(c.zone).zh)}
                    </span>
                  )}
                  {c.avgHR && (
                    <span className="tnum ml-auto text-[11px] text-faint">
                      {c.avgHR} bpm
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 补记 / 修改入口 —— 复用今天的训练 / 饮食 / 有氧页 */}
          <div className="grid grid-cols-3 gap-2">
            <Link
              href={`/train?date=${date}`}
              className="choice-chip press flex h-9 items-center justify-center border border-border bg-surface text-[12px] font-medium text-muted active:bg-surface-2"
            >
              {tr(isRest || trained ? "改训练" : "补记训练")}
            </Link>
            <Link
              href={`/nutrition?date=${date}`}
              className="choice-chip press flex h-9 items-center justify-center border border-border bg-surface text-[12px] font-medium text-muted active:bg-surface-2"
            >
              {tr(hasNutrition ? "改饮食" : "补记饮食")}
            </Link>
            <Link
              href={`/cardio?date=${date}`}
              className="choice-chip press flex h-9 items-center justify-center border border-border bg-surface text-[12px] font-medium text-muted active:bg-surface-2"
            >
              {tr(hasCardio ? "改有氧" : "补记有氧")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
