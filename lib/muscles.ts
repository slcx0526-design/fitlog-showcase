// ============================================================
// 训练结构基础（A 层地基）
//   - 细分肌群分类：动作打标、直接容量与次级贡献共用
//   - 器械类型：自由 / 器械 / 绳索 / 自重
//   - 训练水平 → 每周每肌群组数目标（主流增肌科学，随水平缩放）
// 计数口径由动作库的 volumeContributions 定义，区分直接与次级贡献。
// ============================================================

export type MuscleGroup =
  | "chest"
  | "upperChest"
  | "back"
  | "lats"
  | "upperBack"
  | "lowerBack"
  | "traps"
  | "serratus"
  | "frontDelt"
  | "sideDelt"
  | "rearDelt"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "adductors"
  | "abductors"
  | "calves"
  | "neck"
  | "abs";

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "胸",
  upperChest: "上胸",
  back: "背",
  lats: "背阔肌",
  upperBack: "上背",
  lowerBack: "下背/竖脊肌",
  traps: "斜方肌",
  serratus: "前锯肌",
  frontDelt: "前束",
  sideDelt: "中束",
  rearDelt: "后束",
  biceps: "二头",
  triceps: "三头",
  forearms: "前臂",
  quads: "股四头",
  hamstrings: "腘绳",
  glutes: "臀",
  adductors: "内收肌",
  abductors: "外展肌",
  calves: "小腿",
  neck: "颈部",
  abs: "腹肌",
};

/** 展示顺序（推→拉→腿→核心，便于阅读） */
export const MUSCLE_ORDER: MuscleGroup[] = [
  "chest",
  "upperChest",
  "frontDelt",
  "sideDelt",
  "triceps",
  "serratus",
  "lats",
  "upperBack",
  "back",
  "lowerBack",
  "rearDelt",
  "traps",
  "biceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "adductors",
  "abductors",
  "calves",
  "neck",
  "abs",
];

export type Equipment = "free" | "machine" | "cable" | "bodyweight";

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  free: "自由重量",
  machine: "器械",
  cable: "绳索",
  bodyweight: "自重",
};

export type TrainingLevel = "beginner" | "intermediate" | "advanced";

export const LEVELS: {
  value: TrainingLevel;
  label: string;
  years: string;
  blurb: string;
}[] = [
  { value: "beginner", label: "新手", years: "< 1 年", blurb: "较低容量即可进步，过量反而恢复不来" },
  { value: "intermediate", label: "中级", years: "1 – 3 年", blurb: "需要更高容量维持进步" },
  { value: "advanced", label: "高级", years: "3 年以上", blurb: "接近容量上限，注重质量与恢复" },
];

export function levelLabel(l: TrainingLevel): string {
  return LEVELS.find((x) => x.value === l)?.label ?? l;
}

/**
 * 每周每肌群直接有效组目标区间，按训练水平缩放。
 * 参考主流增肌文献：MEV≈10、MAV≈16–20；新手更低即可进步。
 * 统一区间应用到各肌群，作为通用目标；小肌群另从复合动作获得间接容量。
 */
export const WEEKLY_SET_TARGET: Record<TrainingLevel, { low: number; high: number }> = {
  beginner: { low: 8, high: 12 },
  intermediate: { low: 12, high: 16 },
  advanced: { low: 16, high: 20 },
};

export function weeklyTarget(level: TrainingLevel | undefined) {
  return WEEKLY_SET_TARGET[level ?? "intermediate"];
}

/**
 * 肌群容量分级：现有 12 个肌群沿用通用目标（default，行为不变）；
 * 新增的中小肌群目标更低，避免"颈部也要 16-20 组"这种不合理。
 */
type VolumeTier = "default" | "medium" | "small";
const MUSCLE_TIER: Record<MuscleGroup, VolumeTier> = {
  // 现有 12 个：通用目标（不变）
  chest: "default",
  upperChest: "default",
  back: "default",
  lats: "default",
  upperBack: "default",
  lowerBack: "medium",
  frontDelt: "default",
  sideDelt: "default",
  rearDelt: "default",
  biceps: "default",
  triceps: "default",
  quads: "default",
  hamstrings: "default",
  glutes: "default",
  calves: "default",
  abs: "default",
  // 新增：中等肌群
  traps: "medium",
  forearms: "medium",
  adductors: "medium",
  abductors: "medium",
  // 新增：小肌群
  serratus: "small",
  neck: "small",
};

const TIER_TARGET: Record<VolumeTier, Record<TrainingLevel, { low: number; high: number }>> = {
  default: WEEKLY_SET_TARGET,
  medium: {
    beginner: { low: 6, high: 10 },
    intermediate: { low: 8, high: 12 },
    advanced: { low: 10, high: 15 },
  },
  small: {
    beginner: { low: 3, high: 6 },
    intermediate: { low: 5, high: 8 },
    advanced: { low: 6, high: 10 },
  },
};

/** 某肌群在某训练水平下的每周组数目标（按肌群分级，匹配不乱） */
export function weeklyTargetFor(
  muscle: MuscleGroup,
  level: TrainingLevel | undefined
) {
  const tier = MUSCLE_TIER[muscle] ?? "default";
  return TIER_TARGET[tier][level ?? "intermediate"];
}

/**
 * 核心肌群：每周容量稽核里常驻显示（即使本周 0 组，也要让"漏练"可见）。
 * 其余肌群（前束/小腿/腹肌等）仅在本周有训练量时才出现。
 */
export const CORE_MUSCLES: MuscleGroup[] = [
  "chest",
  "upperChest",
  "lats",
  "upperBack",
  "sideDelt",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
];
