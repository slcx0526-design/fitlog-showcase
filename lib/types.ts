// ============================================================
// 数据模型（严格对应需求文档）
// ============================================================

import type { Equipment, MuscleGroup, TrainingLevel } from "./muscles";

export type TrainingType = "push" | "pull" | "legs" | "rest" | "custom";
export type TrainingIntent = "strength" | "hypertrophy" | "endurance" | "custom";
export type RecordMode = "weight" | "reps" | "rir" | "duration" | "distance";
export type PerformanceMode = Extract<RecordMode, "reps" | "duration" | "distance">;
export type SessionDifficulty = "easy" | "onTarget" | "hard";
export type ProgressionRule = "doubleProgression" | "repsFirst" | "custom";
export type MovementPattern =
  | "horizontalPush"
  | "inclinePush"
  | "verticalPush"
  | "fly"
  | "verticalPull"
  | "horizontalPull"
  | "hipHinge"
  | "squat"
  | "lunge"
  | "kneeExtension"
  | "kneeFlexion"
  | "armCurl"
  | "armExtension"
  | "lateralRaise"
  | "rearDelt"
  | "calfRaise"
  | "core"
  | "carry"
  | "custom";

export interface VolumeContribution {
  muscle: MuscleGroup;
  /** 1 = every working set counts as one direct set for this muscle. */
  weight: number;
  direct?: boolean;
}

export interface ProgressionPrescription {
  progressionTrackId: string;
  progressionTrackLabel: string;
  trainingIntent: TrainingIntent;
  targetRepMin: number;
  targetRepMax: number;
  targetRirMin?: number;
  targetRirMax?: number;
  workingSets: number;
  loadIncrementKg: number;
  progressionRule: ProgressionRule;
  /** Reps is the legacy default. Duration and distance use the same target range fields as display targets. */
  performanceMode?: PerformanceMode;
}

/** 减脂计划的日常活动水平。专门有氧与手动活动消耗单独记录，避免重复计入。 */
export type BaselineActivity = "low" | "light" | "moderate" | "high";
export type CutTrainingTemplateType = "push" | "pull" | "legs";

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
  /** 近 4 周大多数日子的非运动活动量，按步数/距离判断。 */
  baselineActivity?: BaselineActivity;
  /** 已长期稳定的专门有氧：单次时长。只在趋势校准前用于公式起点。 */
  routineCardioMinutesPerSession?: number;
  /** 已长期稳定的专门有氧：每周次数。 */
  routineCardioSessionsPerWeek?: number;
  /** 已长期稳定的专门有氧：典型强度区间。 */
  routineCardioZone?: Zone;
  /** 每周目标体重下降百分比，例如 0.5 表示当前体重的 0.5% / 周。 */
  weeklyLossPct?: number;
  /** RFM 体脂目标。体重仅由当前去脂体重推导为参考值，不作为主目标。 */
  targetBodyFatPct?: number;
  /** 临时训练容量覆盖比例；0.8 = 模板计划工作组数约减少 20%。 */
  trainingVolumeScale?: number;
  /** 每个训练类型在当前周计划中实际使用的模板。未设置时使用该类型的第一个非空模板。 */
  trainingTemplateIds?: Partial<Record<CutTrainingTemplateType, string>>;
  /** 每周有氧执行目标（分钟）；只用于周度执行与复盘，不兑换当日热量。 */
  weeklyCardioMinutes?: number;
  /** v1.38 旧字段：仅为兼容旧备份保留，不再用于界面或目标计算。 */
  targetWeightKg?: number;
}

/** 用于基于腰围的 RFM 体脂估算；仅作为计算参数，不影响训练功能。 */
export type BiologicalSex = "male" | "female";

/** 单组的训练方法；只有掉重、Rest-pause、Myo-reps 获得有限额外容量。 */
export type SetTechnique = "normal" | "dropSet" | "restPause" | "myoReps" | "cluster" | "technique" | "rehab";
/** 完成质量：partial 只按半组，skipped 不进入容量或吨位。 */
export type SetCompletion = "completed" | "partial" | "skipped";

export interface SetRecord {
  weight: number;
  reps: number;
  durationSeconds?: number;
  distanceMeters?: number;
  /** Legacy import field. Current UI, volume, and progression logic do not depend on per-set RIR. */
  rir?: number;
  type?: "warmup" | "working";
  technique?: SetTechnique;
  completion?: SetCompletion;
  at?: string;
}

export interface Exercise {
  id: string;
  name: string;
  isMain: boolean;
  sets: SetRecord[];
  primaryMuscle?: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  volumeContributions?: VolumeContribution[];
  recordModes?: RecordMode[];
  planned?: { sets: number; repsLow: number; repsHigh: number; rpe?: number };
  /** Original template working sets before a temporary cut overlay. */
  basePlannedSets?: number;
  prescription?: ProgressionPrescription;
  progressionTrackId?: string;
  progressionTrackLabel?: string;
  trainingIntent?: TrainingIntent;
  targetRepMin?: number;
  targetRepMax?: number;
  targetRirMin?: number;
  targetRirMax?: number;
  workingSets?: number;
  loadIncrementKg?: number;
  progressionRule?: ProgressionRule;
  /** Accepted recommendation for this session. It is planning context, not a completed set. */
  plannedLoadKg?: number;
}

export type TemplateSlot = "push1" | "push2" | "pull1" | "pull2" | "legs1";

export interface Template {
  id: string;
  name: string;
  type: TrainingType;
  items: TemplateItem[];
}

export interface TemplateItem {
  exerciseId: string;
  name: string;
  sets: number;
  repsLow: number;
  repsHigh: number;
  rpe?: number;
  prescription?: ProgressionPrescription;
  progressionTrackId?: string;
  progressionTrackLabel?: string;
  trainingIntent?: TrainingIntent;
  targetRirMin?: number;
  targetRirMax?: number;
  loadIncrementKg?: number;
  progressionRule?: ProgressionRule;
  recordModes?: RecordMode[];
}

export interface WorkoutSession {
  type: TrainingType;
  exercises: Exercise[];
  templateId?: string;
  microcycleId?: string;
  done?: boolean;
  /** Optional session-level effort signal; replaces repetitive per-set RIR entry. */
  difficulty?: SessionDifficulty;
}

export interface NutritionLog {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** 心率区间 1–5（Z1 恢复 … Z5 最大） */
export type Zone = 1 | 2 | 3 | 4 | 5;

export interface CardioEntry {
  id: string;
  mode: string;
  minutes: number;
  zone: Zone | null;
  avgHR?: number;
  note?: string;
  at?: string;
}

export interface Profile {
  sex?: BiologicalSex;
  heightCm?: number;
  birthYear?: number;
  restingHR?: number;
  maxHR?: number;
  trainingLevel?: TrainingLevel;
}

export interface DayLog {
  date: string;
  workout?: WorkoutSession;
  nutrition?: NutritionLog;
  cardio?: CardioEntry[];
  activityEnergy?: ActivityEnergyEntry[];
}

export interface BodyWeightEntry {
  date: string;
  weight: number;
}

export interface WaistEntry {
  date: string;
  waist: number;
}

export interface ExercisePreset {
  id: string;
  name: string;
  englishName?: string;
  aliases?: string[];
  isMain: boolean;
  type: TrainingType;
  primaryMuscle?: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  volumeContributions?: VolumeContribution[];
  equipment?: Equipment;
  movementPattern?: MovementPattern;
  compound?: boolean;
  defaultLoadIncrementKg?: number;
  recordModes?: RecordMode[];
  category?: string;
  alternatives?: string[];
  region?: string;
}

export type MuscleTargetMap = Partial<Record<MuscleGroup, { low: number; high: number }>>;

export interface MicrocycleState {
  currentId: string;
  startedAt: string;
  index: number;
  /** Ordered loop captured when this cycle started. Schedule edits apply to the next cycle. */
  steps?: MicrocycleStep[];
}

export interface MicrocycleStep {
  id: string;
  type: TrainingType;
  label: string;
  /** Optional concrete prescription for this step. The active cycle snapshots this binding. */
  templateId?: string;
}

export interface Schedule {
  split: (TrainingType | "")[];
  /** Ordered training loop; independent from Monday-Sunday planning. */
  microcycle?: MicrocycleStep[];
}

export interface AppData {
  profile?: Profile;
  cutPlan?: CutPlan;
  days: Record<string, DayLog>;
  bodyWeights: BodyWeightEntry[];
  waistEntries: WaistEntry[];
  templates?: Template[];
  customExercises: ExercisePreset[];
  schedule?: Schedule;
  muscleTargets?: MuscleTargetMap;
  microcycle?: MicrocycleState;
}

/** JSON 全量备份格式：与 AppData 同级，避免导出再嵌套一层 data。 */
export interface BackupData extends AppData {
  app: "fitlog";
  version: number;
  exportedAt: string;
}
