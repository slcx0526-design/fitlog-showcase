"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useToday } from "@/lib/hooks";
import type { BodyWeightEntry } from "@/lib/types";
import { weeklyComparison } from "@/lib/weight";

const WEEKS = [1, 2, 3, 4] as const;

export default function WeeklyAverageCard({
  entries,
}: {
  entries: BodyWeightEntry[];
}) {
  const { tr } = useI18n();
  const today = useToday();
  const [weeksBack, setWeeksBack] = useState<number>(1);

  const cmp = useMemo(
    () => weeklyComparison(entries, today, weeksBack),
    [entries, today, weeksBack]
  );

  const { current, previous, delta } = cmp;

  // 本周完全没记录就不显示这张卡（避免空数据干扰）
  if (current.avg == null) return null;

  return (
    <div className="control-card mt-2 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-muted">
          {tr("本周平均")}
        </span>
        <span className="tnum text-[10px] text-faint">
          {tr("基于 {n} 次", { n: current.count })}
        </span>
      </div>

      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tnum text-[24px] font-bold text-fg">
          {current.avg.toFixed(1)}
        </span>
        <span className="text-[12px] text-faint">kg</span>

        {delta != null && (
          <span
            className={
              "tnum ml-1 text-[13px] font-semibold " +
              (delta < 0 ? "text-accent" : delta > 0 ? "text-warn" : "text-faint")
            }
          >
            {delta < 0 ? "↓" : delta > 0 ? "↑" : ""}
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}
          </span>
        )}
      </div>

      {/* 对比范围切换 */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="mr-0.5 text-[11px] text-faint">{tr("对比")}</span>
        {WEEKS.map((w) => {
          const active = w === weeksBack;
          return (
            <button type="button"
              key={w}
              onClick={() => setWeeksBack(w)}
              className={
                "choice-chip press border px-2 py-1 text-[12px] font-medium " +
                (active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border bg-surface-2 text-muted")
              }
            >
              {tr("{n}周前", { n: w })}
            </button>
          );
        })}
      </div>

      {/* 对比结果说明 */}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        {previous.avg == null ? (
          tr("该周暂无记录，数据不足以对比")
        ) : (
          <>
            {tr("{n}周前平均", { n: weeksBack })}{" "}
            <span className="tnum">{previous.avg.toFixed(1)} kg</span>
            {" · "}
            {tr("基于 {n} 次", { n: previous.count })}
            {delta != null && delta !== 0 && (
              <>
                {" · "}
                {delta < 0
                  ? tr("轻了 {n} kg", { n: Math.abs(delta).toFixed(1) })
                  : tr("重了 {n} kg", { n: delta.toFixed(1) })}
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
