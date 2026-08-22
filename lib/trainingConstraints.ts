import type { Equipment, MuscleGroup } from "./muscles";
import type { ExercisePreset, MovementPattern } from "./types";
import {
  activePolicyOverrides,
  type ExercisePreference,
  type ExerciseLockMode,
  type MusclePlanTarget,
  type MusclePriority,
  type PlanningAggressiveness,
  type ScheduleAdaptationStyle,
  type TrainingChangeBudget,
  type TrainingPolicy,
} from "./trainingPolicy";

export type HardConstraintKind =
  | "exerciseExcluded"
  | "equipmentUnavailable"
  | "movementRestricted"
  | "sessionMinutes"
  | "sessionExercises"
  | "sessionSets";

export interface HardTrainingConstraint {
  kind: HardConstraintKind;
  value: string | number;
  source: "policy" | "temporaryOverride";
  detail: string;
}

export interface SoftTrainingConstraint {
  kind: "exercisePreference" | "musclePriority" | "equipmentPreference" | "weeklyFrequency";
  key: string;
  weight: number;
  detail: string;
}

export interface CompiledTrainingConstraints {
  date: string;
  maxSessionMinutes: number;
  maxExercisesPerSession: number;
  maxWorkingSetsPerSession: number;
  weeklyTrainingDays: TrainingPolicy["weeklyTrainingDays"];
  excludedExerciseIds: Set<string>;
  avoidedExerciseIds: Set<string>;
  preferredExerciseIds: Set<string>;
  exerciseLocks: Map<string, ExerciseLockMode>;
  unavailableEquipment: Set<Equipment>;
  preferredEquipment: Set<Equipment>;
  restrictedPatterns: Set<MovementPattern>;
  musclePriorities: Partial<Record<MuscleGroup, MusclePriority>>;
  planTargets: MusclePlanTarget[];
  scheduleAdaptation: ScheduleAdaptationStyle;
  planningAggressiveness: PlanningAggressiveness;
  minimumRecoveryDays: number;
  allowExerciseAdditions: boolean;
  preserveTotalWorkingSets: boolean;
  maintenanceFloorRatio: number;
  changeBudget: TrainingChangeBudget;
  hard: HardTrainingConstraint[];
  soft: SoftTrainingConstraint[];
}

function preferenceWeight(preference: ExercisePreference) {
  if (preference === "prefer") return 20;
  if (preference === "avoid") return -20;
  if (preference === "exclude") return -100;
  return 0;
}

export function compileTrainingConstraints(policy: TrainingPolicy, date: string): CompiledTrainingConstraints {
  const activeOverrides = activePolicyOverrides(policy, date);
  const unavailableEquipment = new Set<Equipment>(policy.unavailableEquipment);
  const excludedExerciseIds = new Set<string>();
  const avoidedExerciseIds = new Set<string>();
  const preferredExerciseIds = new Set<string>();
  const restrictedPatterns = new Set<MovementPattern>();
  const hard: HardTrainingConstraint[] = [];
  const soft: SoftTrainingConstraint[] = [];

  for (const [exerciseId, preference] of Object.entries(policy.exercisePreferences)) {
    if (preference === "exclude") {
      excludedExerciseIds.add(exerciseId);
      hard.push({ kind: "exerciseExcluded", value: exerciseId, source: "policy", detail: `动作 ${exerciseId} 已被明确排除` });
    } else if (preference === "avoid") {
      avoidedExerciseIds.add(exerciseId);
      soft.push({ kind: "exercisePreference", key: exerciseId, weight: preferenceWeight(preference), detail: `尽量避免动作 ${exerciseId}` });
    } else if (preference === "prefer") {
      preferredExerciseIds.add(exerciseId);
      soft.push({ kind: "exercisePreference", key: exerciseId, weight: preferenceWeight(preference), detail: `优先保留动作 ${exerciseId}` });
    }
  }

  for (const restriction of policy.restrictions) {
    if (restriction.expiresAt && restriction.expiresAt < date) continue;
    if (restriction.exerciseId) {
      if (restriction.level === "exclude") {
        excludedExerciseIds.add(restriction.exerciseId);
        hard.push({ kind: "exerciseExcluded", value: restriction.exerciseId, source: "policy", detail: restriction.note ?? `动作 ${restriction.exerciseId} 被限制` });
      } else {
        avoidedExerciseIds.add(restriction.exerciseId);
      }
    }
    if (restriction.movementPattern) {
      if (restriction.level === "exclude") {
        restrictedPatterns.add(restriction.movementPattern);
        hard.push({ kind: "movementRestricted", value: restriction.movementPattern, source: "policy", detail: restriction.note ?? `动作模式 ${restriction.movementPattern} 被限制` });
      }
    }
  }

  let maxSessionMinutes = policy.maxSessionMinutes;
  for (const override of activeOverrides) {
    if (override.maxSessionMinutes != null) maxSessionMinutes = Math.min(maxSessionMinutes, override.maxSessionMinutes);
    for (const equipment of override.unavailableEquipment ?? []) unavailableEquipment.add(equipment);
    for (const exerciseId of override.excludedExerciseIds ?? []) excludedExerciseIds.add(exerciseId);
    for (const pattern of override.restrictedPatterns ?? []) restrictedPatterns.add(pattern);
  }

  for (const equipment of unavailableEquipment) {
    hard.push({ kind: "equipmentUnavailable", value: equipment, source: "policy", detail: `器械 ${equipment} 当前不可用` });
  }
  hard.push({ kind: "sessionMinutes", value: maxSessionMinutes, source: activeOverrides.length ? "temporaryOverride" : "policy", detail: `单次训练不超过 ${maxSessionMinutes} 分钟` });
  hard.push({ kind: "sessionExercises", value: policy.maxExercisesPerSession, source: "policy", detail: `单次最多 ${policy.maxExercisesPerSession} 个动作` });
  hard.push({ kind: "sessionSets", value: policy.maxWorkingSetsPerSession, source: "policy", detail: `单次最多 ${policy.maxWorkingSetsPerSession} 个工作组` });

  for (const [muscle, priority] of Object.entries(policy.musclePriorities) as Array<[MuscleGroup, MusclePriority]>) {
    const weight = priority === "specialize" ? 30 : priority === "grow" ? 15 : priority === "maintain" ? -5 : -15;
    soft.push({ kind: "musclePriority", key: muscle, weight, detail: `${muscle} 优先级：${priority}` });
  }
  for (const equipment of policy.preferredEquipment) {
    soft.push({ kind: "equipmentPreference", key: equipment, weight: 8, detail: `偏好使用 ${equipment}` });
  }
  soft.push({ kind: "weeklyFrequency", key: "target", weight: 10, detail: `每周目标 ${policy.weeklyTrainingDays.target} 天` });

  return {
    date,
    maxSessionMinutes,
    maxExercisesPerSession: policy.maxExercisesPerSession,
    maxWorkingSetsPerSession: policy.maxWorkingSetsPerSession,
    weeklyTrainingDays: policy.weeklyTrainingDays,
    excludedExerciseIds,
    avoidedExerciseIds,
    preferredExerciseIds,
    exerciseLocks: new Map(Object.entries(policy.exerciseLocks)),
    unavailableEquipment,
    preferredEquipment: new Set(policy.preferredEquipment),
    restrictedPatterns,
    musclePriorities: policy.musclePriorities,
    planTargets: policy.planTargets,
    scheduleAdaptation: policy.scheduleAdaptation,
    planningAggressiveness: policy.planningAggressiveness,
    minimumRecoveryDays: policy.minimumRecoveryDays,
    allowExerciseAdditions: policy.allowExerciseAdditions,
    preserveTotalWorkingSets: policy.preserveTotalWorkingSets,
    maintenanceFloorRatio: policy.maintenanceFloorRatio,
    changeBudget: policy.changeBudget,
    hard,
    soft,
  };
}

export function exerciseConstraintViolations(
  exercise: Pick<ExercisePreset, "id" | "equipment" | "movementPattern">,
  constraints: CompiledTrainingConstraints,
) {
  const reasons: string[] = [];
  if (constraints.excludedExerciseIds.has(exercise.id)) reasons.push("动作已排除");
  if (exercise.equipment && constraints.unavailableEquipment.has(exercise.equipment)) reasons.push("器械不可用");
  if (exercise.movementPattern && constraints.restrictedPatterns.has(exercise.movementPattern)) reasons.push("动作模式受限");
  return reasons;
}

export function exercisePreferenceScore(
  exercise: Pick<ExercisePreset, "id" | "equipment">,
  constraints: CompiledTrainingConstraints,
) {
  let score = 0;
  const lock = constraints.exerciseLocks.get(exercise.id);
  if (lock === "freeze") score += 100;
  else if (lock === "keep") score += 60;
  if (constraints.preferredExerciseIds.has(exercise.id)) score += 20;
  if (constraints.avoidedExerciseIds.has(exercise.id)) score -= 20;
  if (exercise.equipment && constraints.preferredEquipment.has(exercise.equipment)) score += 8;
  return score;
}
