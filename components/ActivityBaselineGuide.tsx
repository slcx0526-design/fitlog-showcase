"use client";

import { BASELINE_ACTIVITY, DEFAULT_BASELINE_ACTIVITY, type CutEnergyPlan } from "@/lib/cut";
import type { BaselineActivity, CutPlan, Zone } from "@/lib/types";

const DURATION_PRESETS = [0, 20, 30, 45, 60] as const;
const FREQUENCY_PRESETS = [0, 2, 3, 4, 5, 6, 7] as const;

const ZONE_META: Record<Zone, { label: string; note: string }> = {
  1: { label: "Z1 恢复", note: "很轻松" },
  2: { label: "Z2 稳定", note: "能完整说话" },
  3: { label: "Z3 进阶", note: "呼吸明显加快" },
  4: { label: "Z4", note: "高强度" },
  5: { label: "Z5", note: "冲刺" },
};

export default function ActivityBaselineGuide({
  plan,
  energy,
  onChange,
}: {
  plan: CutPlan | undefined;
  energy: CutEnergyPlan;
  onChange: (patch: Partial<CutPlan>) => void;
}) {
  const currentActivity = plan?.baselineActivity ?? DEFAULT_BASELINE_ACTIVITY;
  const minutesPerSession = Math.max(0, Math.round(plan?.routineCardioMinutesPerSession ?? 0));
  const sessionsPerWeek = Math.max(0, Math.round(plan?.routineCardioSessionsPerWeek ?? 0));
  const zone: Zone = plan?.routineCardioZone ?? 2;
  const weeklyMinutes = minutesPerSession * sessionsPerWeek;
  const routineEnabled = minutesPerSession > 0 && sessionsPerWeek > 0;

  return (
    <section className="control-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">ACTIVITY BASELINE</p>
          <h2 className="mt-1 text-[16px] font-bold text-fg">活动基线：日常走动 + 长期有氧</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">按近 4 周大多数日子的真实情况填写。日常走路与专门有氧分开，系统不会混着猜。</p>
        </div>
        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-[10px] font-bold text-accent">走 2 km = 轻活动</span>
      </div>

      <p className="mt-3 text-[11px] font-semibold text-fg">① 日常走动</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {Object.entries(BASELINE_ACTIVITY).map(([id, meta]) => {
          const level = id as BaselineActivity;
          const selected = currentActivity === level;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange({ baselineActivity: level })}
              className={"choice-chip press rounded-xl border px-2.5 py-2 text-left transition-colors " + (selected ? "border-accent bg-accent-soft" : "border-border bg-surface-2")}
            >
              <p className={"text-[11px] font-semibold " + (selected ? "text-accent" : "text-fg")}>{meta.label}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-faint">{meta.note}</p>
              <p className={"mt-1 text-[9px] font-semibold " + (selected ? "text-accent" : "text-faint")}>{selected ? "当前选择" : "点此选择"}</p>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-faint">通勤、工作走动、买菜、散步算这里；跑步、骑车、爬坡、计划内快走算下面的专门有氧。</p>

      <div className="mt-4 border-t border-border/60 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-fg">② 已稳定执行的专门有氧</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-faint">填「每次多久 × 每周几次」，不是填想做的计划。</p>
          </div>
          <p className="tnum shrink-0 text-[12px] font-bold text-accent">+{energy.routineCardioDailyKcal} kcal / 天</p>
        </div>

        <p className="mt-3 text-[10px] font-medium text-faint">每次时长</p>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {DURATION_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => onChange({
                routineCardioMinutesPerSession: minutes || undefined,
                routineCardioSessionsPerWeek: minutes ? (sessionsPerWeek || 3) : undefined,
                routineCardioZone: minutes ? zone : undefined,
              })}
              className={"choice-chip press h-10 border text-[11px] font-semibold " + (minutesPerSession === minutes ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}
            >
              {minutes === 0 ? "无" : `${minutes} 分`}
            </button>
          ))}
        </div>

        {minutesPerSession > 0 && (
          <>
            <p className="mt-3 text-[10px] font-medium text-faint">每周次数</p>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {FREQUENCY_PRESETS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => onChange({
                    routineCardioSessionsPerWeek: count || undefined,
                    routineCardioMinutesPerSession: count ? minutesPerSession : undefined,
                    routineCardioZone: count ? zone : undefined,
                  })}
                  className={"choice-chip press h-9 border text-[11px] font-semibold " + (sessionsPerWeek === count ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted")}
                >
                  {count === 0 ? "0" : `${count} 次`}
                </button>
              ))}
            </div>

            {sessionsPerWeek > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {([1, 2, 3] as Zone[]).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => onChange({ routineCardioZone: candidate })}
                    className={"choice-chip press rounded-xl border px-2 py-2 text-left " + (zone === candidate ? "border-accent bg-accent-soft" : "border-border bg-surface-2")}
                  >
                    <p className={"text-[11px] font-semibold " + (zone === candidate ? "text-accent" : "text-fg")}>{ZONE_META[candidate].label}</p>
                    <p className="mt-0.5 text-[9px] text-faint">{ZONE_META[candidate].note}</p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="control-strip rounded-xl px-2.5 py-2">
            <p className="text-[10px] text-faint">固定有氧总量</p>
            <p className="tnum mt-0.5 text-[13px] font-semibold text-fg">{routineEnabled ? `${minutesPerSession} 分 × ${sessionsPerWeek} 次` : "未纳入公式"}</p>
            <p className="tnum mt-0.5 text-[10px] text-faint">{routineEnabled ? `${weeklyMinutes} 分 / 周` : ""}</p>
          </div>
          <div className="control-strip rounded-xl px-2.5 py-2">
            <p className="text-[10px] text-faint">公式阶段修正</p>
            <p className="tnum mt-0.5 text-[13px] font-semibold text-fg">+ {energy.routineCardioDailyKcal} kcal / 天</p>
            <p className="mt-0.5 text-[10px] text-faint">按体重与区间折算</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          {energy.maintenanceSource === "trend"
            ? "现在预算已经由真实摄入和体重趋势校准，这一栏只做习惯档案，不会重复加热量。"
            : "例：60 分 Z2 × 3 次/周，才是 180 分/周；系统按周均摊成每日修正。记录满 21 天后，真实趋势会覆盖公式。"}
        </p>
      </div>
    </section>
  );
}
