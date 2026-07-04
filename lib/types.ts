// ============================================================
// 数据模型（严格对应需求文档）
// ============================================================

import type { Equipment, MuscleGroup, TrainingLevel } from "./muscles";

export type TrainingType = "push" | "pull" | "legs" | "rest" | "custom";

/** 减脂计划的日常活动水平。专门有氧与手动活动消耗单独记录，避免重复计入。 */
export type BaselineActivity = "low" | "light" | "moderate" | "high";

/** 旧版手动主动热量字段：仅为兼容旧备份保留，新界面不再写入或用于预算。 */
export type ActivityEnergySource = "strength" | "steps" | "wearable" | "other";

export interface ActivityEnergyEntry {
  id: string;
  kcal: number;
  source: ActivityEnergySource;
  note?: string;
  at?: string;
}

/** 减脂目标与能量模型配置。数值均为估算工具参数，不是医疗处方。 */
export interface CutPlan {
  /** Whether the unified cut overlay is enabled across Today / Nutrition / Training. */
  enabled?: boolean;
  baselineActivity?: BaselineActivity;
  /** 每周目标体重下降百分比，例如 0.5 表示当前体重的 0.5% / 周。 */
  weeklyLossPct?: number;
  /** RFM 体脂目标。体重仅由当前去脂体重推导为参考值，不作为主目标。 */
  targetBodyFatPct?: number;
  /** 临时训练容量覆盖比例；0.8 = 模板计划组数约减少 20%。 */
  trainingVolumeScale?: number;
  /** 每周有氧执行目标（分钟）；只用于周度执行与复盘，不兑换当日热量。 */
  weeklyCardioMinutes?: number;
  /** v1.38 旧字段：仅为兼容旧备份保留，不再用于界面或目标计算。 */
  targetWeightKg?: number;
}

/** 用于基于腰围的 RFM 体脂估算；仅作为计算参数，不影响训练功能。 */
export type BiologicalSex = "male" | "female";

export interface SetRecord {
  weight: number; // kg
  reps: number;
  at?: string; // ISO 时间戳，记录组完成时刻；可选以兼容旧数据
}

export interface Exercise {
  id: string; // 固定 ID（非按名称），用于跨天关联"上次"记录
  name: string;
  isMain: boolean; // 主项 / 辅助项（仅做轻量视觉区分，不参与任何评分）
  sets: SetRecord[];
  /** 主肌群快照（加入动作时从预设拷入）——供按肌群统计容量；旧数据可空 */
  primaryMuscle?: MuscleGroup;
  /** 套用模板时拷入的计划目标（组数 + 次数区间 + RPE），仅展示参考，不存目标重量 */
  planned?: { sets: number; repsLow: number; repsHigh: number; rpe?: number };
}

/** 模板槽位：推/拉各两个方向，腿一个（一周练两次腿的人应该只练腿） */
/** 旧版固定槽位（仅用于迁移旧数据） */
export type TemplateSlot = "push1" | "push2" | "pull1" | "pull2" | "legs1";

/** 训练模板：自由命名 + 归属类型（推/拉/腿）+ 动作清单 */
export interface Template {
  id: string;
  name: string;
  type: TrainingType; // push / pull / legs
  items: TemplateItem[];
}

/** 模板里的一条动作：动作 + 计划组数 / 次数区间 / RPE。刻意不存目标重量 —— 重量每周在变，交给"沿用上次"。 */
export interface TemplateItem {
  exerciseId: string;
  name: string; // 名称快照（防自定义动作被删后显示空）
  sets: number;
  repsLow: number; // 起始次数 5–12
  repsHigh: number; // 力竭次数 6–20
  rpe?: number;
}

export interface WorkoutSession {
  type: TrainingType;
  exercises: Exercise[];
  /** 这天用的模板 ID（从「计划/今天」点模板进入时写入）。
      用于「上次」只在同一模板（同主导日）内跨天关联，避免重量日/次数日互相串数据。
      旧记录无此字段，查询时回退到按 type 关联。 */
  templateId?: string;
  /** 用户显式点了"结束训练"。仅布尔，不存时间戳（刻意避免滑向时长统计） */
  done?: boolean;
}

export interface NutritionLog {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** 心率区间 1–5（Z1 恢复 … Z5 最大） */
export type Zone = 1 | 2 | 3 | 4 | 5;

/**
 * 一条有氧记录。
 * 组织轴是强度（区间），单位是分钟；"方式"只是标签，不参与任何计算。
 * 刻意不存距离 / 配速 / 卡路里 —— 那是另一个产品。
 */
export interface CardioEntry {
  id: string;
  mode: string; // 走路 / 跑步 / 单车 … 自由文本，仅标签
  minutes: number;
  zone: Zone | null; // 强度区间；可只填平均心率由系统判定
  avgHR?: number; // 选填，填了可自动判定区间
  note?: string;
  at?: string; // ISO 时间戳
}

/** 身体数据 —— 全部可选，用于推算心率区间；不填则区间退化为谈话测试 */
export interface Profile {
  /** RFM 估算所需：生理性别 + 身高（cm）。 */
  sex?: BiologicalSex;
  heightCm?: number;
  birthYear?: number;
  restingHR?: number; // 静息心率 bpm
  maxHR?: number; // 实测最大心率（覆盖估算值）
  trainingLevel?: TrainingLevel; // 无氧训练水平 → 每周容量目标
}

/** 单日记录，按 YYYY-MM-DD 作为主键 */
export interface DayLog {
  date: string;
  workout?: WorkoutSession;
  nutrition?: NutritionLog;
  cardio?: CardioEntry[];
  /** 旧版手动活动热量，导入旧备份时保留但不再参与界面或能量预算。 */
  activityEnergy?: ActivityEnergyEntry[];
}

/** 体重条目（手动录入） */
export interface BodyWeightEntry {
  date: string; // YYYY-MM-DD
  weight: number; // kg
}

/** 腰围条目（cm）。与体重分开记录，允许同日分别补录。 */
export interface WaistEntry {
  date: string; // YYYY-MM-DD
  waist: number; // cm
}

/** 动作预设 / 自定义动作的持久定义（保证固定 ID） */
export interface ExercisePreset {
  id: string;
  name: string;
  isMain: boolean;
  type: TrainingType; // push/pull/legs 内置；custom 表示用户自建
  /** 结构化标签（A 层）：主肌群 / 器械 / 细分区域。旧的自定义动作可空 */
  primaryMuscle?: MuscleGroup;
  equipment?: Equipment;
  region?: string; // 如"上胸""中背"，仅作筛选/展示
}

/**
 * 每周训练计划
 * split 长度固定 7，索引 0=周一 ... 6=周日
 * 空串表示该日尚未规划
 */
export interface Schedule {
  split: (TrainingType | "")[];
}

/** JSON 全量备份格式 */
export interface BackupData {
  app: "fitlog";
  version: number;
  exportedAt: string;
  days: Record<string, DayLog>;
  bodyWeights: BodyWeightEntry[];
  waistEntries: WaistEntry[];
  cutPlan?: CutPlan;
  customExercises: ExercisePreset[];
  schedule?: Schedule;
  profile?: Profile;
  templates?: Template[];
}
