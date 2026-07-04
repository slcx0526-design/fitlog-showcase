"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { currentCutSnapshot, isCutModeActive, suggestedCutVolumeScale } from "@/lib/cutMode";

export default function CutTrainingNotice() {
  const { data, loaded } = useStore();
  const active = isCutModeActive(data.cutPlan);
  const snapshot = useMemo(() => currentCutSnapshot(data.profile, data.bodyWeights, data.waistEntries), [data.profile, data.bodyWeights, data.waistEntries]);
  if (!loaded || !active) return null;
  const scale = data.cutPlan?.trainingVolumeScale ?? suggestedCutVolumeScale(snapshot?.bodyFatPercent, data.cutPlan?.weeklyLossPct);
  return (
    <div className="mb-3 rounded-lg border border-accent/35 bg-accent-soft px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">CUT MODE · TRAINING</p>
          <p className="mt-0.5 text-[12px] font-medium text-fg">模板套用时计划组数按 {Math.round(scale * 100)}% 处理</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">保留动作和负重练习；4 组通常变 3 组、3 组变 2 组。已记录的训练绝不会被改动。</p>
        </div>
      </div>
    </div>
  );
}
