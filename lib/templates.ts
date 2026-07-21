import type { Template, TrainingType } from "./types";

// ============================================================
// 训练模板（B 层）：自由命名 + 归属类型（推/拉/腿）的模板列表。
// 每个类型下最多 5 个模板。套用时按当天训练类型筛选。
// ============================================================

/** 可建模板的训练类型（不含 rest/custom） */
export const TEMPLATE_TYPES: TrainingType[] = ["push", "pull", "legs"];

/** 每个类型下模板数量上限 */
export const MAX_TEMPLATES_PER_TYPE = 5;

/** 类型标签（中文 key，渲染处经 tr 本地化） */
export const TYPE_LABEL: Record<"push" | "pull" | "legs", string> = {
  push: "推",
  pull: "拉",
  legs: "腿",
};

// ---- 次数区间档位 ----
/** 起始次数可选 5–12 */
export const REPS_LOW_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12];
/** 力竭次数可选 6–20 */
export const REPS_HIGH_OPTIONS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20];

/** 次数区间显示：相等显示单值，否则 low–high */
export function formatReps(low: number, high: number): string {
  return low === high ? `${low}` : `${low}–${high}`;
}

/** Reorder only among templates of the same type, even when storage order is interleaved. */
export function moveTemplateWithinType(list: Template[], id: string, direction: -1 | 1): Template[] {
  const sourceIndex = list.findIndex((template) => template.id === id);
  if (sourceIndex < 0) return list;
  const typeIndexes = list.flatMap((template, index) => template.type === list[sourceIndex].type ? [index] : []);
  const typePosition = typeIndexes.indexOf(sourceIndex);
  const targetIndex = typeIndexes[typePosition + direction];
  if (targetIndex == null) return list;
  const next = [...list];
  [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
  return next;
}
