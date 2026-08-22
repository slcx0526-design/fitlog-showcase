import { DEFAULT_EXERCISES } from "./exercises";
import { MUSCLE_LABELS, MUSCLE_ORDER, type Equipment, type MuscleGroup } from "./muscles";
import type { AppData, MovementPattern, Schedule, TemplateItem } from "./types";
import { emitPersistenceStatus } from "./persistence";

export const TRAINING_POLICY_STORAGE_KEY = "fitlog:training-policy:v4";
export const PREVIOUS_TRAINING_POLICY_STORAGE_KEY = "fitlog:training-policy:v3";
export const LEGACY_TRAINING_POLICY_STORAGE_KEY = "fitlog:training-policy:v2";
export const OLDEST_TRAINING_POLICY_STORAGE_KEY = "fitlog:training-policy:v1";
export const TRAINING_POLICY_VERSION = 4;

export type TrainingGoal = "hypertrophy" | "strength" | "fatLossRetention" | "generalFitness";
export type MusclePriority = "specialize" | "grow" | "maintain" | "deprioritize";
export type ExercisePreference = "prefer" | "neutral" | "avoid" | "exclude";
export type AdaptationMode = "suggestOnly" | "approvalRequired" | "safeAuto";
export type EvidenceAdaptationMode = "off" | "preview" | "automatic";
export type EvidenceMinimumConfidence = "building" | "ready";
export type OverrideScope = "session" | "week" | "microcycle";
export type ExerciseLockMode = "keep" | "freeze";
export type ScheduleAdaptationStyle = "preserve" | "balanced" | "priority";
export type PlanningAggressiveness = "conservative" | "balanced" | "progressive";
export type TrainingDecisionOutcome =
  | "accepted"
  | "partiallyAccepted"
  | "rejected"
  | "autoApplied"
  | "undone"
  | "learningAccepted"
  | "learningDismissed";
export type TrainingDecisionFeedbackReason =
  | "volumeTooHigh"
  | "recoveryConcern"
  | "tooManyChanges"
  | "exerciseMismatch"
  | "scheduleMismatch"
  | "other";

export interface TrainingRestriction {
  id: string;
  movementPattern?: MovementPattern;
  exerciseId?: string;
  level: "avoid" | "exclude";
  note?: string;
  expiresAt?: string;
}

export interface TemporaryTrainingOverride {
  id: string;
  scope: OverrideScope;
  effectiveFrom: string;
  expiresAt?: string;
  maxSessionMinutes?: number;
  unavailableEquipment?: Equipment[];
  excludedExerciseIds?: string[];
  restrictedPatterns?: MovementPattern[];
  reason?: string;
}

export interface TrainingDecisionEvent {
  id: string;
  at: string;
  proposalId: string;
  outcome: TrainingDecisionOutcome;
  summary: string;
  templateIds?: string[];
  scheduleApplied?: boolean;
  feedbackReason?: TrainingDecisionFeedbackReason;
}

export interface AdaptiveRollbackSnapshot {
  id: string;
  createdAt: string;
  proposalId: string;
  reason: string;
  templates: Array<{
    templateId: string;
    items: TemplateItem[];
  }>;
  schedule?: Schedule;
}

export interface MusclePlanTarget {
  id: string;
  label: string;
  muscles: MuscleGroup[];
  priority?: MusclePriority;
  cycleTarget?: { low: number; high: number };
  maxDirectSetsPerSession?: number;
}

export interface TrainingChangeBudget {
  maxSetDeltaPerExercise: number;
  maxAddedExercisesPerTemplate: number;
  maxRemovedExercisesPerTemplate: number;
}

export interface TrainingPolicy {
  version: typeof TRAINING_POLICY_VERSION;
  goal: TrainingGoal;
  musclePriorities: Partial<Record<MuscleGroup, MusclePriority>>;
  /** Ordered, structured targets compiled from natural language or manual controls. */
  planTargets: MusclePlanTarget[];
  exercisePreferences: Record<string, ExercisePreference>;
  exerciseLocks: Record<string, ExerciseLockMode>;
  preferredEquipment: Equipment[];
  unavailableEquipment: Equipment[];
  weeklyTrainingDays: { minimum: number; target: number; maximum: number };
  maxSessionMinutes: number;
  maxExercisesPerSession: number;
  maxWorkingSetsPerSession: number;
  planningAggressiveness: PlanningAggressiveness;
  scheduleAdaptation: ScheduleAdaptationStyle;
  minimumRecoveryDays: number;
  allowExerciseAdditions: boolean;
  preserveTotalWorkingSets: boolean;
  maintenanceFloorRatio: number;
  changeBudget: TrainingChangeBudget;
  restrictions: TrainingRestriction[];
  overrides: TemporaryTrainingOverride[];
  adaptationMode: AdaptationMode;
  evidenceMode: EvidenceAdaptationMode;
  evidenceMinimumConfidence: EvidenceMinimumConfidence;
  autoApply: {
    loadChanges: boolean;
    repChanges: boolean;
    setChanges: boolean;
    exerciseReplacement: boolean;
    scheduleChanges: boolean;
  };
  decisionEvents: TrainingDecisionEvent[];
  confirmedLearningSignalIds: string[];
  dismissedLearningSignalIds: string[];
  ignoredPlanRevisions: string[];
  lastAutoAppliedRevision?: string;
  rollbackSnapshot?: AdaptiveRollbackSnapshot;
  updatedAt: string;
}

export interface PolicyParseResult {
  policy: TrainingPolicy;
  recognized: string[];
  unresolved: string[];
  clauses: PolicyParseClause[];
}

export interface PolicyParseClause {
  source: string;
  status: "recognized" | "partial" | "unresolved";
  recognized: string[];
  unresolved?: string;
}

export interface PortableTrainingPolicyBackup {
  app: "fitlog-adaptive-training";
  version: typeof TRAINING_POLICY_VERSION;
  exportedAt: string;
  policy: TrainingPolicy;
}

const EQUIPMENT: Equipment[] = ["free", "machine", "cable", "bodyweight"];
const GOALS: TrainingGoal[] = ["hypertrophy", "strength", "fatLossRetention", "generalFitness"];
const PRIORITIES: MusclePriority[] = ["specialize", "grow", "maintain", "deprioritize"];
const PREFERENCES: ExercisePreference[] = ["prefer", "neutral", "avoid", "exclude"];
const ADAPTATION_MODES: AdaptationMode[] = ["suggestOnly", "approvalRequired", "safeAuto"];
const EVIDENCE_MODES: EvidenceAdaptationMode[] = ["off", "preview", "automatic"];
const EVIDENCE_CONFIDENCE: EvidenceMinimumConfidence[] = ["building", "ready"];
const EXERCISE_LOCK_MODES: ExerciseLockMode[] = ["keep", "freeze"];
const SCHEDULE_ADAPTATION_STYLES: ScheduleAdaptationStyle[] = ["preserve", "balanced", "priority"];
const PLANNING_AGGRESSIVENESS: PlanningAggressiveness[] = ["conservative", "balanced", "progressive"];
const DECISION_OUTCOMES: TrainingDecisionOutcome[] = [
  "accepted",
  "partiallyAccepted",
  "rejected",
  "autoApplied",
  "undone",
  "learningAccepted",
  "learningDismissed",
];
const DECISION_FEEDBACK_REASONS: TrainingDecisionFeedbackReason[] = [
  "volumeTooHigh",
  "recoveryConcern",
  "tooManyChanges",
  "exerciseMismatch",
  "scheduleMismatch",
  "other",
];

const MUSCLE_ALIASES: Partial<Record<MuscleGroup, string[]>> = {
  chest: ["胸部", "胸肌", "胸", "chest", "胸筋"],
  upperChest: ["上胸", "upper chest", "上部胸筋"],
  back: ["背部", "back", "背中"],
  lats: ["背阔", "背阔肌", "lats", "latissimus", "広背筋"],
  upperBack: ["上背", "upper back", "上背部"],
  lowerBack: ["下背", "竖脊肌", "lower back", "脊柱起立筋"],
  traps: ["斜方肌", "斜方", "traps", "trapezius"],
  serratus: ["前锯肌", "serratus", "前鋸筋"],
  frontDelt: ["肩前束", "前束", "front delt", "front delts", "anterior delt", "三角筋前部"],
  sideDelt: ["肩中束", "中束", "侧肩", "side delt", "side delts", "lateral delt", "lateral delts", "middle delt", "三角筋中部"],
  rearDelt: ["肩后束", "后束", "rear delt", "rear delts", "posterior delt", "三角筋後部"],
  biceps: ["二头", "肱二头", "biceps", "上腕二頭筋"],
  triceps: ["三头", "肱三头", "triceps", "上腕三頭筋"],
  forearms: ["前臂", "小臂", "forearms", "前腕"],
  quads: ["股四头", "股四", "大腿前侧", "腿", "quads", "quadriceps", "大腿四頭筋"],
  hamstrings: ["腘绳", "大腿后侧", "hamstrings", "ハムストリング"],
  glutes: ["臀", "臀部", "臀肌", "glutes", "glute", "臀筋"],
  adductors: ["内收肌", "adductors", "内転筋"],
  abductors: ["外展肌", "abductors", "外転筋"],
  calves: ["小腿", "calves", "calf", "ふくらはぎ"],
  neck: ["颈部", "脖子", "neck", "首"],
  abs: ["腹肌", "核心", "abs", "core", "腹筋"],
};

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value * 100) / 100))
    : fallback;
}

function uniqueStrings(input: unknown, limit = 100) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((value): value is string => typeof value === "string" && Boolean(value.trim())))]
    .slice(-limit);
}

function uniqueEquipment(input: unknown): Equipment[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((item): item is Equipment => EQUIPMENT.includes(item as Equipment)))];
}

function stringRecord<T extends string>(input: unknown, allowed: readonly T[]): Record<string, T> {
  if (!input || typeof input !== "object") return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([key, value]) => Boolean(key) && typeof value === "string" && allowed.includes(value as T))
      .map(([key, value]) => [key, value as T]),
  );
}

function cleanPlanTargets(input: unknown): MusclePlanTarget[] {
  if (!Array.isArray(input)) return [];
  const targets = new Map<string, MusclePlanTarget>();
  for (const [index, entry] of input.entries()) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    const muscles = Array.isArray(value.muscles)
      ? [...new Set(value.muscles.filter((muscle): muscle is MuscleGroup => (
          typeof muscle === "string" && MUSCLE_ORDER.includes(muscle as MuscleGroup)
        )))]
      : [];
    if (!muscles.length) continue;
    const priority = typeof value.priority === "string" && PRIORITIES.includes(value.priority as MusclePriority)
      ? value.priority as MusclePriority
      : undefined;
    const rawCycleTarget = value.cycleTarget && typeof value.cycleTarget === "object"
      ? value.cycleTarget as Record<string, unknown>
      : undefined;
    const cycleLow = rawCycleTarget
      ? clampInteger(rawCycleTarget.low, 1, 80, 1)
      : undefined;
    const cycleHigh = rawCycleTarget
      ? Math.max(cycleLow ?? 1, clampInteger(rawCycleTarget.high, 1, 100, cycleLow ?? 1))
      : undefined;
    const maxDirectSetsPerSession = typeof value.maxDirectSetsPerSession === "number"
      ? clampInteger(value.maxDirectSetsPerSession, 1, 20, 8)
      : undefined;
    if (!priority && cycleLow == null && maxDirectSetsPerSession == null) continue;
    const id = typeof value.id === "string" && value.id.trim()
      ? value.id.trim().slice(0, 120)
      : `target_${muscles.join("_")}_${index + 1}`;
    targets.set(id, {
      id,
      label: typeof value.label === "string" && value.label.trim()
        ? value.label.trim().slice(0, 80)
        : muscles.map((muscle) => MUSCLE_LABELS[muscle]).join("/"),
      muscles,
      ...(priority ? { priority } : {}),
      ...(cycleLow != null && cycleHigh != null ? { cycleTarget: { low: cycleLow, high: cycleHigh } } : {}),
      ...(maxDirectSetsPerSession != null ? { maxDirectSetsPerSession } : {}),
    });
  }
  return [...targets.values()].slice(-30);
}

function cleanChangeBudget(input: unknown, fallback: TrainingChangeBudget): TrainingChangeBudget {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    maxSetDeltaPerExercise: clampInteger(value.maxSetDeltaPerExercise, 1, 3, fallback.maxSetDeltaPerExercise),
    maxAddedExercisesPerTemplate: clampInteger(value.maxAddedExercisesPerTemplate, 0, 3, fallback.maxAddedExercisesPerTemplate),
    maxRemovedExercisesPerTemplate: clampInteger(value.maxRemovedExercisesPerTemplate, 0, 4, fallback.maxRemovedExercisesPerTemplate),
  };
}

function cloneTemplateItems(items: TemplateItem[]) {
  return items.map((item) => ({
    ...item,
    ...(item.secondaryMuscles ? { secondaryMuscles: [...item.secondaryMuscles] } : {}),
    ...(item.volumeContributions ? { volumeContributions: item.volumeContributions.map((entry) => ({ ...entry })) } : {}),
    ...(item.alternatives ? { alternatives: [...item.alternatives] } : {}),
    ...(item.recordModes ? { recordModes: [...item.recordModes] } : {}),
    ...(item.prescription ? { prescription: { ...item.prescription } } : {}),
  }));
}

function cloneSchedule(schedule: Schedule): Schedule {
  return {
    split: [...schedule.split],
    ...(schedule.microcycle ? {
      microcycle: schedule.microcycle.map((step) => {
        const { templateSnapshot: _snapshot, ...portable } = step;
        return { ...portable };
      }),
    } : {}),
  };
}

function cleanRestrictions(input: unknown): TrainingRestriction[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry, index): TrainingRestriction[] => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    if (value.level !== "avoid" && value.level !== "exclude") return [];
    const level = value.level as TrainingRestriction["level"];
    const movementPattern = typeof value.movementPattern === "string"
      ? value.movementPattern as MovementPattern
      : undefined;
    const exerciseId = typeof value.exerciseId === "string" && value.exerciseId
      ? value.exerciseId
      : undefined;
    if (!movementPattern && !exerciseId) return [];
    return [{
      id: typeof value.id === "string" && value.id ? value.id : `restriction_${index + 1}`,
      level,
      ...(movementPattern ? { movementPattern } : {}),
      ...(exerciseId ? { exerciseId } : {}),
      ...(typeof value.note === "string" && value.note.trim() ? { note: value.note.trim().slice(0, 120) } : {}),
      ...(typeof value.expiresAt === "string" && value.expiresAt ? { expiresAt: value.expiresAt } : {}),
    }];
  }).slice(0, 40);
}

function cleanOverrides(input: unknown): TemporaryTrainingOverride[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry, index): TemporaryTrainingOverride[] => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    if (value.scope !== "session" && value.scope !== "week" && value.scope !== "microcycle") return [];
    if (typeof value.effectiveFrom !== "string" || !value.effectiveFrom) return [];
    const scope = value.scope as OverrideScope;
    return [{
      id: typeof value.id === "string" && value.id ? value.id : `override_${index + 1}`,
      scope,
      effectiveFrom: value.effectiveFrom,
      ...(typeof value.expiresAt === "string" && value.expiresAt ? { expiresAt: value.expiresAt } : {}),
      ...(typeof value.maxSessionMinutes === "number" ? {
        maxSessionMinutes: clampInteger(value.maxSessionMinutes, 20, 240, 90),
      } : {}),
      unavailableEquipment: uniqueEquipment(value.unavailableEquipment),
      excludedExerciseIds: uniqueStrings(value.excludedExerciseIds, 80),
      restrictedPatterns: Array.isArray(value.restrictedPatterns)
        ? [...new Set(value.restrictedPatterns.filter((item): item is MovementPattern => typeof item === "string"))].slice(0, 30)
        : [],
      ...(typeof value.reason === "string" && value.reason.trim() ? { reason: value.reason.trim().slice(0, 160) } : {}),
    }];
  }).slice(0, 20);
}

function cleanDecisionEvents(input: unknown): TrainingDecisionEvent[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry, index): TrainingDecisionEvent[] => {
    if (!entry || typeof entry !== "object") return [];
    const value = entry as Record<string, unknown>;
    if (typeof value.proposalId !== "string" || !value.proposalId) return [];
    if (typeof value.outcome !== "string" || !DECISION_OUTCOMES.includes(value.outcome as TrainingDecisionOutcome)) return [];
    return [{
      id: typeof value.id === "string" && value.id ? value.id : `decision_${index + 1}`,
      at: typeof value.at === "string" && value.at ? value.at : new Date(0).toISOString(),
      proposalId: value.proposalId,
      outcome: value.outcome as TrainingDecisionOutcome,
      summary: typeof value.summary === "string" ? value.summary.slice(0, 240) : "训练计划决策",
      ...(Array.isArray(value.templateIds) ? { templateIds: uniqueStrings(value.templateIds, 30) } : {}),
      ...(typeof value.scheduleApplied === "boolean" ? { scheduleApplied: value.scheduleApplied } : {}),
      ...(typeof value.feedbackReason === "string" && DECISION_FEEDBACK_REASONS.includes(value.feedbackReason as TrainingDecisionFeedbackReason)
        ? { feedbackReason: value.feedbackReason as TrainingDecisionFeedbackReason }
        : {}),
    }];
  }).slice(-100);
}

function cleanRollbackSnapshot(input: unknown): AdaptiveRollbackSnapshot | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.createdAt !== "string" || typeof value.proposalId !== "string") return undefined;
  const templates = Array.isArray(value.templates)
    ? value.templates.flatMap((entry): AdaptiveRollbackSnapshot["templates"] => {
        if (!entry || typeof entry !== "object") return [];
        const template = entry as Record<string, unknown>;
        if (typeof template.templateId !== "string" || !Array.isArray(template.items)) return [];
        return [{ templateId: template.templateId, items: cloneTemplateItems(template.items as TemplateItem[]) }];
      }).slice(0, 20)
    : [];
  const schedule = value.schedule && typeof value.schedule === "object"
    ? cloneSchedule(value.schedule as Schedule)
    : undefined;
  if (!templates.length && !schedule) return undefined;
  return {
    id: value.id,
    createdAt: value.createdAt,
    proposalId: value.proposalId,
    reason: typeof value.reason === "string" ? value.reason.slice(0, 200) : "恢复上一次计划",
    templates,
    ...(schedule ? { schedule } : {}),
  };
}

export function defaultTrainingPolicy(now = new Date().toISOString()): TrainingPolicy {
  return {
    version: TRAINING_POLICY_VERSION,
    goal: "hypertrophy",
    musclePriorities: {},
    planTargets: [],
    exercisePreferences: {},
    exerciseLocks: {},
    preferredEquipment: [],
    unavailableEquipment: [],
    weeklyTrainingDays: { minimum: 3, target: 5, maximum: 6 },
    maxSessionMinutes: 90,
    maxExercisesPerSession: 9,
    maxWorkingSetsPerSession: 30,
    planningAggressiveness: "balanced",
    scheduleAdaptation: "balanced",
    minimumRecoveryDays: 1,
    allowExerciseAdditions: true,
    preserveTotalWorkingSets: false,
    maintenanceFloorRatio: 0.65,
    changeBudget: {
      maxSetDeltaPerExercise: 1,
      maxAddedExercisesPerTemplate: 1,
      maxRemovedExercisesPerTemplate: 2,
    },
    restrictions: [],
    overrides: [],
    adaptationMode: "approvalRequired",
    evidenceMode: "preview",
    evidenceMinimumConfidence: "building",
    autoApply: {
      loadChanges: false,
      repChanges: false,
      setChanges: false,
      exerciseReplacement: false,
      scheduleChanges: false,
    },
    decisionEvents: [],
    confirmedLearningSignalIds: [],
    dismissedLearningSignalIds: [],
    ignoredPlanRevisions: [],
    updatedAt: now,
  };
}

export function normalizeTrainingPolicy(input: unknown, now = new Date().toISOString()): TrainingPolicy {
  const fallback = defaultTrainingPolicy(now);
  if (!input || typeof input !== "object") return fallback;
  const value = input as Record<string, unknown>;
  const rawDays = value.weeklyTrainingDays && typeof value.weeklyTrainingDays === "object"
    ? value.weeklyTrainingDays as Record<string, unknown>
    : {};
  const minimum = clampInteger(rawDays.minimum, 1, 7, fallback.weeklyTrainingDays.minimum);
  const maximum = Math.max(minimum, clampInteger(rawDays.maximum, 1, 7, fallback.weeklyTrainingDays.maximum));
  const target = Math.min(maximum, Math.max(minimum, clampInteger(rawDays.target, 1, 7, fallback.weeklyTrainingDays.target)));
  const musclePriorities = stringRecord(value.musclePriorities, PRIORITIES) as Partial<Record<MuscleGroup, MusclePriority>>;
  for (const key of Object.keys(musclePriorities)) {
    if (!MUSCLE_ORDER.includes(key as MuscleGroup)) delete musclePriorities[key as MuscleGroup];
  }
  const rawAuto = value.autoApply && typeof value.autoApply === "object"
    ? value.autoApply as Record<string, unknown>
    : {};
  return {
    version: TRAINING_POLICY_VERSION,
    goal: typeof value.goal === "string" && GOALS.includes(value.goal as TrainingGoal)
      ? value.goal as TrainingGoal
      : fallback.goal,
    musclePriorities,
    planTargets: cleanPlanTargets(value.planTargets),
    exercisePreferences: stringRecord(value.exercisePreferences, PREFERENCES),
    exerciseLocks: stringRecord(value.exerciseLocks, EXERCISE_LOCK_MODES),
    preferredEquipment: uniqueEquipment(value.preferredEquipment),
    unavailableEquipment: uniqueEquipment(value.unavailableEquipment),
    weeklyTrainingDays: { minimum, target, maximum },
    maxSessionMinutes: clampInteger(value.maxSessionMinutes, 20, 240, fallback.maxSessionMinutes),
    maxExercisesPerSession: clampInteger(value.maxExercisesPerSession, 3, 15, fallback.maxExercisesPerSession),
    maxWorkingSetsPerSession: clampInteger(value.maxWorkingSetsPerSession, 6, 50, fallback.maxWorkingSetsPerSession),
    planningAggressiveness: typeof value.planningAggressiveness === "string" && PLANNING_AGGRESSIVENESS.includes(value.planningAggressiveness as PlanningAggressiveness)
      ? value.planningAggressiveness as PlanningAggressiveness
      : fallback.planningAggressiveness,
    scheduleAdaptation: typeof value.scheduleAdaptation === "string" && SCHEDULE_ADAPTATION_STYLES.includes(value.scheduleAdaptation as ScheduleAdaptationStyle)
      ? value.scheduleAdaptation as ScheduleAdaptationStyle
      : fallback.scheduleAdaptation,
    minimumRecoveryDays: clampInteger(value.minimumRecoveryDays, 0, 4, fallback.minimumRecoveryDays),
    allowExerciseAdditions: typeof value.allowExerciseAdditions === "boolean"
      ? value.allowExerciseAdditions
      : fallback.allowExerciseAdditions,
    preserveTotalWorkingSets: typeof value.preserveTotalWorkingSets === "boolean"
      ? value.preserveTotalWorkingSets
      : fallback.preserveTotalWorkingSets,
    maintenanceFloorRatio: clampNumber(value.maintenanceFloorRatio, 0.4, 1, fallback.maintenanceFloorRatio),
    changeBudget: cleanChangeBudget(value.changeBudget, fallback.changeBudget),
    restrictions: cleanRestrictions(value.restrictions),
    overrides: cleanOverrides(value.overrides),
    adaptationMode: typeof value.adaptationMode === "string" && ADAPTATION_MODES.includes(value.adaptationMode as AdaptationMode)
      ? value.adaptationMode as AdaptationMode
      : fallback.adaptationMode,
    evidenceMode: typeof value.evidenceMode === "string" && EVIDENCE_MODES.includes(value.evidenceMode as EvidenceAdaptationMode)
      ? value.evidenceMode as EvidenceAdaptationMode
      : fallback.evidenceMode,
    evidenceMinimumConfidence: typeof value.evidenceMinimumConfidence === "string" && EVIDENCE_CONFIDENCE.includes(value.evidenceMinimumConfidence as EvidenceMinimumConfidence)
      ? value.evidenceMinimumConfidence as EvidenceMinimumConfidence
      : fallback.evidenceMinimumConfidence,
    autoApply: {
      loadChanges: Boolean(rawAuto.loadChanges),
      repChanges: Boolean(rawAuto.repChanges),
      setChanges: Boolean(rawAuto.setChanges),
      exerciseReplacement: Boolean(rawAuto.exerciseReplacement),
      scheduleChanges: Boolean(rawAuto.scheduleChanges),
    },
    decisionEvents: cleanDecisionEvents(value.decisionEvents),
    confirmedLearningSignalIds: uniqueStrings(value.confirmedLearningSignalIds, 100),
    dismissedLearningSignalIds: uniqueStrings(value.dismissedLearningSignalIds, 100),
    ignoredPlanRevisions: uniqueStrings(value.ignoredPlanRevisions, 50),
    ...(typeof value.lastAutoAppliedRevision === "string" && value.lastAutoAppliedRevision
      ? { lastAutoAppliedRevision: value.lastAutoAppliedRevision }
      : {}),
    ...(cleanRollbackSnapshot(value.rollbackSnapshot)
      ? { rollbackSnapshot: cleanRollbackSnapshot(value.rollbackSnapshot) }
      : {}),
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt ? value.updatedAt : now,
  };
}

export function mergeTrainingPolicy(
  base: TrainingPolicy,
  patch: Partial<TrainingPolicy>,
  now = new Date().toISOString(),
) {
  return normalizeTrainingPolicy({
    ...base,
    ...patch,
    musclePriorities: { ...base.musclePriorities, ...(patch.musclePriorities ?? {}) },
    planTargets: patch.planTargets ?? base.planTargets,
    exercisePreferences: { ...base.exercisePreferences, ...(patch.exercisePreferences ?? {}) },
    exerciseLocks: { ...base.exerciseLocks, ...(patch.exerciseLocks ?? {}) },
    weeklyTrainingDays: { ...base.weeklyTrainingDays, ...(patch.weeklyTrainingDays ?? {}) },
    autoApply: { ...base.autoApply, ...(patch.autoApply ?? {}) },
    changeBudget: { ...base.changeBudget, ...(patch.changeBudget ?? {}) },
    decisionEvents: patch.decisionEvents ?? base.decisionEvents,
    confirmedLearningSignalIds: patch.confirmedLearningSignalIds ?? base.confirmedLearningSignalIds,
    dismissedLearningSignalIds: patch.dismissedLearningSignalIds ?? base.dismissedLearningSignalIds,
    ignoredPlanRevisions: patch.ignoredPlanRevisions ?? base.ignoredPlanRevisions,
    updatedAt: now,
  }, now);
}

export function loadTrainingPolicy(): TrainingPolicy {
  if (typeof window === "undefined") return defaultTrainingPolicy();
  try {
    const current = window.localStorage.getItem(TRAINING_POLICY_STORAGE_KEY);
    if (current) return normalizeTrainingPolicy(JSON.parse(current));
    const legacy = window.localStorage.getItem(PREVIOUS_TRAINING_POLICY_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_TRAINING_POLICY_STORAGE_KEY)
      ?? window.localStorage.getItem(OLDEST_TRAINING_POLICY_STORAGE_KEY);
    const migrated = legacy ? normalizeTrainingPolicy(JSON.parse(legacy)) : defaultTrainingPolicy();
    try {
      window.localStorage.setItem(TRAINING_POLICY_STORAGE_KEY, JSON.stringify(migrated));
      window.localStorage.removeItem(PREVIOUS_TRAINING_POLICY_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_TRAINING_POLICY_STORAGE_KEY);
      window.localStorage.removeItem(OLDEST_TRAINING_POLICY_STORAGE_KEY);
    } catch (error) {
      console.warn("训练倾向迁移暂未持久化，继续使用已读取的旧设置：", error);
      emitPersistenceStatus("error");
    }
    return migrated;
  } catch {
    return defaultTrainingPolicy();
  }
}

export function saveTrainingPolicy(policy: TrainingPolicy) {
  if (typeof window === "undefined") return false;
  try {
    const normalized = normalizeTrainingPolicy(policy);
    window.localStorage.setItem(TRAINING_POLICY_STORAGE_KEY, JSON.stringify(normalized));
    window.localStorage.removeItem(PREVIOUS_TRAINING_POLICY_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_TRAINING_POLICY_STORAGE_KEY);
    window.localStorage.removeItem(OLDEST_TRAINING_POLICY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("fitlog:training-policy", { detail: { updatedAt: normalized.updatedAt } }));
    emitPersistenceStatus("saved");
    return true;
  } catch (error) {
    console.warn("训练倾向保存失败：", error);
    emitPersistenceStatus("error");
    return false;
  }
}

export function exportTrainingPolicyBackup(policy: TrainingPolicy): PortableTrainingPolicyBackup {
  return {
    app: "fitlog-adaptive-training",
    version: TRAINING_POLICY_VERSION,
    exportedAt: new Date().toISOString(),
    policy: normalizeTrainingPolicy(policy),
  };
}

export function importTrainingPolicyBackup(input: unknown): TrainingPolicy {
  if (!input || typeof input !== "object") throw new Error("训练倾向备份格式不正确");
  const value = input as Record<string, unknown>;
  if (value.app !== "fitlog-adaptive-training" || !value.policy) throw new Error("训练倾向备份格式不正确");
  return normalizeTrainingPolicy(value.policy);
}

export function musclePriorityMultiplier(priority: MusclePriority | undefined) {
  if (priority === "specialize") return 1.25;
  if (priority === "maintain") return 0.65;
  if (priority === "deprioritize") return 0.45;
  return 1;
}

export function effectiveMusclePlanTargets(policy: TrainingPolicy): MusclePlanTarget[] {
  const targets = policy.planTargets.map((target) => ({
    ...target,
    muscles: [...target.muscles],
    ...(target.cycleTarget ? { cycleTarget: { ...target.cycleTarget } } : {}),
  }));
  for (const [muscle, priority] of Object.entries(policy.musclePriorities) as Array<[MuscleGroup, MusclePriority]>) {
    const matching = targets.find((target) => target.muscles.includes(muscle));
    if (matching?.priority === priority) continue;
    upsertPlanTarget(targets, {
      label: MUSCLE_LABELS[muscle],
      muscles: [muscle],
      priority,
    });
  }
  return targets;
}

export function setMusclePriority(
  policy: TrainingPolicy,
  muscle: MuscleGroup,
  priority: MusclePriority | undefined,
) {
  const musclePriorities = { ...policy.musclePriorities };
  if (priority) musclePriorities[muscle] = priority;
  else delete musclePriorities[muscle];
  const planTargets = policy.planTargets.flatMap((target): MusclePlanTarget[] => {
    if (!target.muscles.includes(muscle)) return [target];
    const muscles = target.muscles.filter((candidate) => candidate !== muscle);
    if (!muscles.length) return [];
    return [{
      ...target,
      id: targetIdFor(muscles),
      label: muscles.map((candidate) => MUSCLE_LABELS[candidate]).join("/"),
      muscles,
    }];
  });
  if (priority) {
    upsertPlanTarget(planTargets, {
      label: MUSCLE_LABELS[muscle],
      muscles: [muscle],
      priority,
    });
  }
  const now = new Date().toISOString();
  return normalizeTrainingPolicy({
    ...policy,
    musclePriorities,
    planTargets,
    updatedAt: now,
  }, now);
}

export function setExerciseLock(
  policy: TrainingPolicy,
  exerciseId: string,
  mode: ExerciseLockMode | undefined,
) {
  const exerciseLocks = { ...policy.exerciseLocks };
  if (mode) exerciseLocks[exerciseId] = mode;
  else delete exerciseLocks[exerciseId];
  const now = new Date().toISOString();
  return normalizeTrainingPolicy({
    ...policy,
    exerciseLocks,
    updatedAt: now,
  }, now);
}

export function removeMusclePlanTarget(
  policy: TrainingPolicy,
  targetId: string,
) {
  const target = policy.planTargets.find((item) => item.id === targetId);
  if (!target) return policy;
  const musclePriorities = { ...policy.musclePriorities };
  if (target.priority) {
    for (const muscle of target.muscles) {
      if (musclePriorities[muscle] === target.priority) delete musclePriorities[muscle];
    }
  }
  const now = new Date().toISOString();
  return normalizeTrainingPolicy({
    ...policy,
    musclePriorities,
    planTargets: policy.planTargets.filter((item) => item.id !== targetId),
    updatedAt: now,
  }, now);
}

export function activePolicyOverrides(policy: TrainingPolicy, date: string) {
  return policy.overrides.filter((override) => (
    override.effectiveFrom <= date && (!override.expiresAt || override.expiresAt >= date)
  ));
}

export function policyRevision(policy: TrainingPolicy) {
  const normalized = normalizeTrainingPolicy(policy, policy.updatedAt);
  const source = JSON.stringify({
    version: normalized.version,
    goal: normalized.goal,
    musclePriorities: normalized.musclePriorities,
    planTargets: normalized.planTargets,
    exercisePreferences: normalized.exercisePreferences,
    exerciseLocks: normalized.exerciseLocks,
    preferredEquipment: normalized.preferredEquipment,
    unavailableEquipment: normalized.unavailableEquipment,
    weeklyTrainingDays: normalized.weeklyTrainingDays,
    maxSessionMinutes: normalized.maxSessionMinutes,
    maxExercisesPerSession: normalized.maxExercisesPerSession,
    maxWorkingSetsPerSession: normalized.maxWorkingSetsPerSession,
    planningAggressiveness: normalized.planningAggressiveness,
    scheduleAdaptation: normalized.scheduleAdaptation,
    minimumRecoveryDays: normalized.minimumRecoveryDays,
    allowExerciseAdditions: normalized.allowExerciseAdditions,
    preserveTotalWorkingSets: normalized.preserveTotalWorkingSets,
    maintenanceFloorRatio: normalized.maintenanceFloorRatio,
    changeBudget: normalized.changeBudget,
    restrictions: normalized.restrictions,
    overrides: normalized.overrides,
    adaptationMode: normalized.adaptationMode,
    evidenceMode: normalized.evidenceMode,
    evidenceMinimumConfidence: normalized.evidenceMinimumConfidence,
    autoApply: normalized.autoApply,
  });
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash) ^ source.charCodeAt(index);
  }
  return `policy-${(hash >>> 0).toString(36)}`;
}

export function appendTrainingDecision(
  policy: TrainingPolicy,
  event: Omit<TrainingDecisionEvent, "id" | "at"> & { id?: string; at?: string },
  now = new Date().toISOString(),
) {
  return mergeTrainingPolicy(policy, {
    decisionEvents: [
      ...policy.decisionEvents,
      {
        id: event.id ?? `decision_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        at: event.at ?? now,
        proposalId: event.proposalId,
        outcome: event.outcome,
        summary: event.summary,
        ...(event.templateIds?.length ? { templateIds: [...new Set(event.templateIds)] } : {}),
        ...(typeof event.scheduleApplied === "boolean" ? { scheduleApplied: event.scheduleApplied } : {}),
        ...(event.feedbackReason ? { feedbackReason: event.feedbackReason } : {}),
      },
    ],
  }, now);
}

export function createRollbackSnapshot(
  data: AppData,
  proposalId: string,
  templateIds: string[],
  includeSchedule: boolean,
  reason: string,
  now = new Date().toISOString(),
): AdaptiveRollbackSnapshot {
  const selected = new Set(templateIds);
  return {
    id: `rollback_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    proposalId,
    reason,
    templates: (data.templates ?? [])
      .filter((template) => selected.has(template.id))
      .map((template) => ({ templateId: template.id, items: cloneTemplateItems(template.items) })),
    ...(includeSchedule ? { schedule: cloneSchedule(data.schedule) } : {}),
  };
}

export function isPlanRevisionIgnored(policy: TrainingPolicy, revision: string) {
  return policy.ignoredPlanRevisions.includes(revision);
}

function compact(text: string) {
  return text.toLowerCase().replace(/[\s，。；、,.!！?？:：()（）]/g, "");
}

type TextSpan = { start: number; end: number };

function spanFor(normalized: string, phrase: string): TextSpan | undefined {
  const value = compact(phrase);
  const start = normalized.indexOf(value);
  return start >= 0 ? { start, end: start + value.length } : undefined;
}

function pushSpan(spans: TextSpan[], span: TextSpan | undefined) {
  if (span) spans.push(span);
}

function parseExerciseSettings(data: AppData, text: string) {
  const normalized = compact(text);
  const preferences: Record<string, ExercisePreference> = {};
  const locks: Record<string, ExerciseLockMode> = {};
  const recognized: string[] = [];
  const consumed: TextSpan[] = [];
  for (const exercise of [...DEFAULT_EXERCISES, ...data.customExercises]) {
    const names = [exercise.name, exercise.englishName, ...(exercise.aliases ?? [])]
      .map((name) => compact(name ?? ""))
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
    let handled = false;
    for (const matched of names) {
      const modes: Array<{ phrases: string[]; apply: () => void; label: string }> = [
        {
          phrases: [`锁定${matched}`, `完全不改${matched}`, `不要修改${matched}`, `freeze${matched}`, `lock${matched}`],
          apply: () => { locks[exercise.id] = "freeze"; },
          label: `冻结动作：${exercise.name}`,
        },
        {
          phrases: [`保留${matched}`, `不要删除${matched}`, `别删${matched}`, `keep${matched}`, `retain${matched}`],
          apply: () => { locks[exercise.id] = "keep"; },
          label: `保留动作：${exercise.name}`,
        },
        {
          phrases: [`不做${matched}`, `不要做${matched}`, `排除${matched}`, `禁用${matched}`, `exclude${matched}`, `avoid${matched}`, `no${matched}`, `${matched}をしない`, `${matched}を除外`],
          apply: () => { preferences[exercise.id] = "exclude"; },
          label: `排除动作：${exercise.name}`,
        },
        {
          phrases: [`喜欢${matched}`, `优先做${matched}`, `多做${matched}`, `prefer${matched}`, `prioritize${matched}`, `${matched}を優先`],
          apply: () => { preferences[exercise.id] = "prefer"; },
          label: `偏好动作：${exercise.name}`,
        },
        {
          phrases: [`少做${matched}`, `避免${matched}`, `limit${matched}`, `${matched}を避ける`],
          apply: () => { preferences[exercise.id] = "avoid"; },
          label: `尽量避免：${exercise.name}`,
        },
      ];
      for (const mode of modes) {
        const phrase = mode.phrases.find((candidate) => normalized.includes(candidate));
        if (!phrase) continue;
        mode.apply();
        recognized.push(mode.label);
        pushSpan(consumed, spanFor(normalized, phrase));
        handled = true;
        break;
      }
      if (handled) break;
    }
  }
  return { preferences, locks, recognized, consumed };
}

type MuscleIntentCandidate = {
  muscles: MuscleGroup[];
  label: string;
  priority: MusclePriority;
  start: number;
  end: number;
  aliasLength: number;
  region: boolean;
};

const MUSCLE_REGIONS: Array<{ aliases: string[]; muscles: MuscleGroup[] }> = [
  { aliases: ["胸部", "胸肌", "胸", "chest", "胸筋"], muscles: ["chest", "upperChest"] },
  { aliases: ["背部", "背", "back", "背中"], muscles: ["lats", "upperBack"] },
  { aliases: ["肩部", "肩膀", "肩", "shoulder", "shoulders", "三角肌", "三角筋"], muscles: ["frontDelt", "sideDelt", "rearDelt"] },
  { aliases: ["手臂", "胳膊", "arm", "arms", "腕"], muscles: ["biceps", "triceps"] },
  { aliases: ["腿部", "腿", "下肢", "leg", "legs", "脚"], muscles: ["quads", "hamstrings", "glutes"] },
];

function phraseMatches(normalized: string, phrase: string) {
  const matches: Array<{ start: number; end: number }> = [];
  let offset = 0;
  while (offset < normalized.length) {
    const start = normalized.indexOf(phrase, offset);
    if (start < 0) break;
    matches.push({ start, end: start + phrase.length });
    offset = start + 1;
  }
  return matches;
}

function muscleIntentCandidates(normalized: string) {
  const candidates: MuscleIntentCandidate[] = [];
  const patterns = (key: string): Array<[MusclePriority, string[]]> => [
    ["specialize", [
      `以${key}为主`, `${key}为主`, `主攻${key}`, `${key}主攻`, `${key}优先`, `${key}重点`,
      `${key}是重点`, `${key}作为重点`, `${key}为重点`, `${key}重点练`, `重点练${key}`,
      `${key}主练`, `主练${key}`, `重点发展${key}`, `强化${key}`, `多练${key}`,
      `prioritize${key}`, `${key}priority`, `focus${key}`, `focuson${key}`,
      `${key}focus`, `${key}mainfocus`, `${key}を優先`, `${key}重点`,
    ]],
    ["grow", [
      `${key}增长`, `${key}生长`, `${key}增肌`, `增长${key}`, `加强${key}`,
      `${key}也要增长`, `${key}也想增长`, `${key}想增长`, `${key}也想加强`,
      `想加强${key}`, `让${key}增长`, `发展${key}`, `提升${key}`, `${key}提升`,
      `grow${key}`, `${key}growth`, `build${key}`, `develop${key}`, `${key}を伸ばす`, `${key}成長`,
    ]],
    ["maintain", [
      `${key}维持`, `${key}保留`, `${key}够用`, `maintain${key}`, `${key}maintenance`, `${key}を維持`,
    ]],
    ["deprioritize", [
      `${key}少练`, `降低${key}`, `${key}不重要`, `deprioritize${key}`, `reduce${key}`, `${key}を減らす`,
    ]],
  ];

  for (const muscle of MUSCLE_ORDER) {
    for (const alias of MUSCLE_ALIASES[muscle] ?? []) {
      const key = compact(alias);
      if (!key) continue;
      for (const [priority, phrases] of patterns(key)) {
        for (const phrase of new Set(phrases)) {
          for (const match of phraseMatches(normalized, phrase)) {
            candidates.push({
              muscles: [muscle],
              label: MUSCLE_LABELS[muscle],
              priority,
              ...match,
              aliasLength: key.length,
              region: false,
            });
          }
        }
      }
    }
  }

  for (const region of MUSCLE_REGIONS) {
    for (const alias of region.aliases) {
      const key = compact(alias);
      if (!key) continue;
      for (const [priority, phrases] of patterns(key)) {
        for (const phrase of new Set(phrases)) {
          for (const match of phraseMatches(normalized, phrase)) {
            candidates.push({
              muscles: region.muscles,
              label: region.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join("/"),
              priority,
              ...match,
              aliasLength: key.length,
              region: true,
            });
          }
        }
      }
    }
  }

  const accepted: MuscleIntentCandidate[] = [];
  for (const candidate of candidates.sort((left, right) => (
    (right.end - right.start) - (left.end - left.start)
    || right.aliasLength - left.aliasLength
    || Number(right.region) - Number(left.region)
    || left.start - right.start
  ))) {
    const overlaps = accepted.some((current) => candidate.start < current.end && candidate.end > current.start);
    if (!overlaps) accepted.push(candidate);
  }
  return accepted.sort((left, right) => left.start - right.start);
}

type MuscleConstraintCandidate = {
  muscles: MuscleGroup[];
  label: string;
  start: number;
  end: number;
  aliasLength: number;
  region: boolean;
  cycleTarget?: { low: number; high: number };
  maxDirectSetsPerSession?: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function muscleConstraintCandidates(normalized: string) {
  const descriptors = [
    ...MUSCLE_REGIONS.map((region) => ({ ...region, region: true })),
    ...MUSCLE_ORDER.flatMap((muscle) => (MUSCLE_ALIASES[muscle] ?? []).map((alias) => ({
      aliases: [alias],
      muscles: [muscle],
      region: false,
    }))),
  ];
  const candidates: MuscleConstraintCandidate[] = [];
  for (const descriptor of descriptors) {
    for (const rawAlias of descriptor.aliases) {
      const alias = compact(rawAlias);
      if (!alias) continue;
      const key = escapeRegExp(alias);
      const patterns: Array<{ expression: RegExp; kind: "session" | "cycle" }> = [
        { expression: new RegExp(`${key}(?:每次|单次|每节|persession)(?:直接)?(?:最多|不超过|上限|max(?:imum)?)?(\\d{1,2})(?:个)?(?:直接)?(?:工作)?组`), kind: "session" },
        { expression: new RegExp(`(?:每次|单次|每节|persession)${key}(?:直接)?(?:最多|不超过|上限|max(?:imum)?)?(\\d{1,2})(?:个)?(?:直接)?(?:工作)?组`), kind: "session" },
        { expression: new RegExp(`${key}(?:每个)?(?:微周期|周期|每轮|本轮|percycle)(?:目标|安排|控制在)?(\\d{1,2})(?:至|到|-|~|–|—)(\\d{1,2})(?:个)?组`), kind: "cycle" },
        { expression: new RegExp(`${key}(?:每个)?(?:微周期|周期|每轮|本轮|percycle)(?:目标|安排|控制在)?(\\d{1,2})(?:个)?组`), kind: "cycle" },
      ];
      for (const pattern of patterns) {
        const match = normalized.match(pattern.expression);
        if (!match || match.index == null) continue;
        const first = Number(match[1]);
        const second = Number(match[2] ?? match[1]);
        const low = Math.min(first, second);
        const high = Math.max(first, second);
        candidates.push({
          muscles: descriptor.muscles,
          label: descriptor.muscles.map((muscle) => MUSCLE_LABELS[muscle]).join("/"),
          start: match.index,
          end: match.index + match[0].length,
          aliasLength: alias.length,
          region: descriptor.region,
          ...(pattern.kind === "session"
            ? { maxDirectSetsPerSession: Math.min(20, Math.max(1, first)) }
            : { cycleTarget: { low: Math.min(80, Math.max(1, low)), high: Math.min(100, Math.max(1, high)) } }),
        });
      }
    }
  }
  const accepted: MuscleConstraintCandidate[] = [];
  for (const candidate of candidates.sort((left, right) => (
    (right.end - right.start) - (left.end - left.start)
    || right.aliasLength - left.aliasLength
    || Number(right.region) - Number(left.region)
  ))) {
    const duplicate = accepted.some((current) => (
      candidate.start === current.start
      && candidate.end === current.end
      && Boolean(candidate.cycleTarget) === Boolean(current.cycleTarget)
    ));
    if (!duplicate) accepted.push(candidate);
  }
  return accepted.sort((left, right) => left.start - right.start);
}

function targetIdFor(muscles: MuscleGroup[]) {
  const ordered = [...new Set(muscles)].sort((left, right) => MUSCLE_ORDER.indexOf(left) - MUSCLE_ORDER.indexOf(right));
  return `target:${ordered.join("+")}`;
}

function upsertPlanTarget(
  targets: MusclePlanTarget[],
  input: Omit<MusclePlanTarget, "id">,
) {
  const id = targetIdFor(input.muscles);
  const index = targets.findIndex((target) => target.id === id);
  const next: MusclePlanTarget = index >= 0
    ? { ...targets[index], ...input, id, muscles: [...input.muscles] }
    : { ...input, id, muscles: [...input.muscles] };
  if (index >= 0) targets[index] = next;
  else targets.push(next);
}

function addRegexSpan(spans: TextSpan[], match: RegExpMatchArray | null) {
  if (match?.index != null) spans.push({ start: match.index, end: match.index + match[0].length });
}

function consumePhrase(
  normalized: string,
  phrases: string[],
  spans: TextSpan[],
) {
  const matched = phrases.map(compact).find((phrase) => normalized.includes(phrase));
  if (matched) pushSpan(spans, spanFor(normalized, matched));
  return matched;
}

function unresolvedResidual(normalized: string, consumed: TextSpan[]) {
  const covered = Array.from({ length: normalized.length }, () => false);
  for (const span of consumed) {
    for (let index = Math.max(0, span.start); index < Math.min(normalized.length, span.end); index += 1) covered[index] = true;
  }
  let residual = [...normalized].filter((_, index) => !covered[index]).join("");
  const fillers = [
    "trainingplan", "workoutplan", "请帮我", "我希望", "我想要", "我想", "希望", "帮我", "同时", "另外",
    "然后", "并且", "以及", "还要", "而且", "但是", "please", "iwant", "wantto", "also", "and", "with",
    "训练计划", "训练", "计划", "安排", "一下", "可以", "需要", "想要", "的", "也", "和", "且", "但",
  ].sort((left, right) => right.length - left.length);
  let previous = "";
  while (previous !== residual) {
    previous = residual;
    for (const filler of fillers) residual = residual.split(filler).join("");
  }
  return residual.replace(/[-~–—/]/g, "");
}

function parsePolicyChunk(
  source: string,
  data: AppData,
  base: TrainingPolicy,
) {
  const normalized = compact(source);
  const recognized: string[] = [];
  const consumed: TextSpan[] = [];
  const patch: Partial<TrainingPolicy> = {};
  const planTargets = base.planTargets.map((target) => ({
    ...target,
    muscles: [...target.muscles],
    ...(target.cycleTarget ? { cycleTarget: { ...target.cycleTarget } } : {}),
  }));

  if (consumePhrase(normalized, ["减脂保肌", "减脂期保肌", "fatloss", "cutretention", "retainmuscle", "減量", "筋量維持"], consumed)) {
    patch.goal = "fatLossRetention";
    recognized.push("目标：减脂保肌");
  } else if (consumePhrase(normalized, ["提高力量", "力量", "strength", "筋力"], consumed)) {
    patch.goal = "strength";
    recognized.push("目标：力量");
  } else if (consumePhrase(normalized, ["增肌塑形", "增肌", "体型塑造", "hypertrophy", "musclegain", "筋肥大"], consumed)) {
    patch.goal = "hypertrophy";
    recognized.push("目标：增肌/体型塑造");
  }

  if (consumePhrase(normalized, ["安全自动", "自动调整计划", "safeauto", "automaticadaptation", "安全自動"], consumed)) {
    patch.adaptationMode = "safeAuto";
    recognized.push("计划调整：安全自动");
  } else if (consumePhrase(normalized, ["只给建议", "仅建议", "suggestonly", "recommendonly", "提案のみ"], consumed)) {
    patch.adaptationMode = "suggestOnly";
    recognized.push("计划调整：仅建议");
  }

  const minuteMatch = normalized.match(/(?:每次|单次)?(?:最多|不超过|控制在|上限|max|maximum|まで)?(\d{2,3})(?:分钟|分|minutes?|mins?)/);
  if (minuteMatch) {
    const minutes = Math.min(240, Math.max(20, Number(minuteMatch[1])));
    patch.maxSessionMinutes = minutes;
    recognized.push(`单次训练上限：${minutes} 分钟`);
    addRegexSpan(consumed, minuteMatch);
  }
  const setMatch = normalized.match(/(?:每次|单次)?(?:总共|总计|最多|不超过|上限|max(?:imum)?)?(\d{1,2})(?:个)?工作组/);
  if (setMatch) {
    const sets = Math.min(50, Math.max(6, Number(setMatch[1])));
    patch.maxWorkingSetsPerSession = sets;
    recognized.push(`单次工作组上限：${sets} 组`);
    addRegexSpan(consumed, setMatch);
  }
  const exerciseCountMatch = normalized.match(/(?:每次|单次)?(?:最多|不超过|上限|max(?:imum)?)?(\d{1,2})(?:个)?动作/);
  if (exerciseCountMatch) {
    const exercises = Math.min(15, Math.max(3, Number(exerciseCountMatch[1])));
    patch.maxExercisesPerSession = exercises;
    recognized.push(`单次动作上限：${exercises} 个`);
    addRegexSpan(consumed, exerciseCountMatch);
  }
  const dayMatch = normalized.match(/(?:每周|一周|每7天|每七天|weekly|perweek|週)(?:训练|练|安排)?(\d)(?:天|练|次|days?|times?|sessions?|日|回)/)
    ?? normalized.match(/(?:train|training|workout|workouts)?(\d)(?:days?|times?|sessions?)(?:perweek|weekly)/);
  if (dayMatch) {
    const days = Math.min(7, Math.max(1, Number(dayMatch[1])));
    patch.weeklyTrainingDays = {
      minimum: Math.max(1, days - 1),
      target: days,
      maximum: Math.min(7, days + 1),
    };
    recognized.push(`每 7 天训练目标：${days} 次`);
    addRegexSpan(consumed, dayMatch);
  }

  if (consumePhrase(normalized, ["保持三分化", "三分化不变", "不改三分化", "不改分化", "保持当前分化", "保持当前日程", "preservethesplit", "keepsplit"], consumed)) {
    patch.scheduleAdaptation = "preserve";
    recognized.push("分化策略：保持当前结构");
  } else if (consumePhrase(normalized, ["优先肌群增加频率", "按优先级排", "priorityschedule", "prioritizefrequency"], consumed)) {
    patch.scheduleAdaptation = "priority";
    recognized.push("分化策略：优先肌群可增加频率");
  } else if (consumePhrase(normalized, ["可以重排", "允许重排", "平衡分化", "balanceschedule", "reschedule"], consumed)) {
    patch.scheduleAdaptation = "balanced";
    recognized.push("分化策略：允许平衡重排");
  }

  if (consumePhrase(normalized, ["恢复优先", "不要太累", "保守调整", "conservative", "recoveryfirst"], consumed)) {
    patch.planningAggressiveness = "conservative";
    recognized.push("调整幅度：恢复优先");
  } else if (consumePhrase(normalized, ["积极进阶", "积极调整", "progressive", "pushprogression"], consumed)) {
    patch.planningAggressiveness = "progressive";
    recognized.push("调整幅度：积极进阶");
  }

  if (consumePhrase(normalized, ["不要加动作", "不新增动作", "只调整组数", "noexercises", "donotaddexercises"], consumed)) {
    patch.allowExerciseAdditions = false;
    recognized.push("动作结构：不新增动作");
  } else if (consumePhrase(normalized, ["允许新增动作", "可以补动作", "可以加动作", "allownewexercises", "addexercises"], consumed)) {
    patch.allowExerciseAdditions = true;
    recognized.push("动作结构：允许补齐动作");
  }
  if (consumePhrase(normalized, ["保持总组数", "总组数不变", "不增加总组数", "preservetotalsets", "keepsetstotal"], consumed)) {
    patch.preserveTotalWorkingSets = true;
    recognized.push("容量预算：保持总工作组数");
  } else if (consumePhrase(normalized, ["允许改变总组数", "总组数可以变", "allowsetchanges"], consumed)) {
    patch.preserveTotalWorkingSets = false;
    recognized.push("容量预算：允许改变总工作组数");
  }
  const recoveryMatch = normalized.match(/(?:同肌群|相同肌群|samemuscle)(?:至少)?(?:休息|间隔|rest)?(\d)(?:天|days?)/);
  if (recoveryMatch) {
    const days = Math.min(4, Math.max(0, Number(recoveryMatch[1])));
    patch.minimumRecoveryDays = days;
    recognized.push(`同肌群恢复间隔：${days} 天`);
    addRegexSpan(consumed, recoveryMatch);
  }

  const musclePriorities: Partial<Record<MuscleGroup, MusclePriority>> = {};
  for (const match of muscleIntentCandidates(normalized)) {
    for (const muscle of match.muscles) musclePriorities[muscle] = match.priority;
    upsertPlanTarget(planTargets, {
      label: match.label,
      muscles: match.muscles,
      priority: match.priority,
    });
    const priority = match.priority === "specialize"
      ? "专项强化"
      : match.priority === "grow"
        ? "增长"
        : match.priority === "maintain"
          ? "维持"
          : "降低优先级";
    recognized.push(`${match.label}：${priority}`);
    consumed.push({ start: match.start, end: match.end });
  }
  if (Object.keys(musclePriorities).length) patch.musclePriorities = musclePriorities;

  for (const constraint of muscleConstraintCandidates(normalized)) {
    upsertPlanTarget(planTargets, {
      label: constraint.label,
      muscles: constraint.muscles,
      ...(constraint.cycleTarget ? { cycleTarget: constraint.cycleTarget } : {}),
      ...(constraint.maxDirectSetsPerSession != null ? { maxDirectSetsPerSession: constraint.maxDirectSetsPerSession } : {}),
    });
    if (constraint.cycleTarget) recognized.push(`${constraint.label}周期目标：${constraint.cycleTarget.low}–${constraint.cycleTarget.high} 组`);
    if (constraint.maxDirectSetsPerSession != null) recognized.push(`${constraint.label}单次直接组上限：${constraint.maxDirectSetsPerSession} 组`);
    consumed.push({ start: constraint.start, end: constraint.end });
  }
  if (JSON.stringify(planTargets) !== JSON.stringify(base.planTargets)) patch.planTargets = planTargets;

  const unavailableEquipment = new Set(base.unavailableEquipment);
  const equipmentTerms: Array<[Equipment, string[]]> = [
    ["free", ["没有自由重量", "不用自由重量", "不做自由重量", "no free weights", "no barbell", "フリーウェイトなし"]],
    ["machine", ["没有器械", "不用器械", "no machines", "マシンなし"]],
    ["cable", ["没有绳索", "没有龙门架", "不用绳索", "no cables", "ケーブルなし"]],
    ["bodyweight", ["不做自重", "不用自重", "no bodyweight", "自重なし"]],
  ];
  for (const [equipment, phrases] of equipmentTerms) {
    const matched = consumePhrase(normalized, phrases, consumed);
    if (!matched) continue;
    unavailableEquipment.add(equipment);
    recognized.push(`不可用器械：${equipment}`);
  }
  if (unavailableEquipment.size !== base.unavailableEquipment.length) patch.unavailableEquipment = [...unavailableEquipment];

  const exercise = parseExerciseSettings(data, source);
  if (Object.keys(exercise.preferences).length) patch.exercisePreferences = exercise.preferences;
  if (Object.keys(exercise.locks).length) patch.exerciseLocks = exercise.locks;
  recognized.push(...exercise.recognized);
  consumed.push(...exercise.consumed);

  const uniqueRecognized = [...new Set(recognized)];
  const residual = unresolvedResidual(normalized, consumed);
  return {
    policy: mergeTrainingPolicy(base, patch),
    recognized: uniqueRecognized,
    residual,
  };
}

function splitPolicyClauses(text: string) {
  return text
    .split(/[，,。；;！!\n]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

export function parseTrainingPolicyText(
  text: string,
  data: AppData,
  base: TrainingPolicy,
): PolicyParseResult {
  const sources = splitPolicyClauses(text);
  let policy = normalizeTrainingPolicy(base, base.updatedAt);
  const clauses: PolicyParseClause[] = [];
  const recognized: string[] = [];
  for (const source of sources) {
    const result = parsePolicyChunk(source, data, policy);
    policy = result.policy;
    recognized.push(...result.recognized);
    const status: PolicyParseClause["status"] = result.recognized.length
      ? result.residual
        ? "partial"
        : "recognized"
      : "unresolved";
    clauses.push({
      source,
      status,
      recognized: result.recognized,
      ...(status !== "recognized" ? { unresolved: result.residual || source } : {}),
    });
  }
  const unresolved = clauses
    .filter((clause) => clause.status !== "recognized")
    .map((clause) => clause.source);
  return {
    policy,
    recognized: [...new Set(recognized)],
    unresolved,
    clauses,
  };
}
