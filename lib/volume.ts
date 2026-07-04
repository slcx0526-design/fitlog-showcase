import type { DayLog } from "./types";
import type { MuscleGroup } from "./muscles";

// ============================================================
// 每周容量稽核（C 层）—— 纯函数，便于独立验算。
// 计数口径（锁定）：只算主肌群，1 个动作的"已记录组数"整数计入其主肌群。
// 没打标的旧动作 / 自定义动作（无 primaryMuscle）不计入任何肌群。
// ============================================================

export type VolumeMap = Partial<Record<MuscleGroup, number>>;

/** 把若干天的训练按主肌群累计组数 */
export function weeklyVolume(days: (DayLog | undefined)[]): VolumeMap {
  const v: VolumeMap = {};
  for (const day of days) {
    const ex = day?.workout?.exercises;
    if (!ex) continue;
    for (const e of ex) {
      if (!e.primaryMuscle) continue;
      const n = e.sets.length;
      if (!n) continue;
      v[e.primaryMuscle] = (v[e.primaryMuscle] ?? 0) + n;
    }
  }
  return v;
}

export type VolumeStatus = "under" | "in" | "over";

export function volumeStatus(sets: number, low: number, high: number): VolumeStatus {
  if (sets < low) return "under";
  if (sets > high) return "over";
  return "in";
}
