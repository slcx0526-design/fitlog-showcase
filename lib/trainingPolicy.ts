import { DEFAULT_EXERCISES } from "./exercises";
import { MUSCLE_ORDER, type Equipment, type MuscleGroup } from "./muscles";
import type { AppData, MovementPattern, Schedule, TemplateItem } from "./types";

export const TRAINING_POLICY_STORAGE_KEY = "fitlog:training-policy:v3";
export const LEGACY_TRAINING_POLICY_STORAGE_KEY = "fitlog:training-policy:v2";
export const OLDEST_TRAINING_POLICY_STORAGE_KEY = "fitlog:training-policy:v1";
export const TRAINING_POLICY_VERSION = 3;

export type TrainingGoal = "hypertrophy" | "strength" | "fatLossRetention" | "generalFitness";
export type MusclePriority = "specialize" | "grow" | "maintain" | "deprioritize";
export type ExercisePreference = "prefer" | "neutral" | "avoid" | "exclude";
export type AdaptationMode = "suggestOnly" | "approvalRequired" | "safeAuto";
export type EvidenceAdaptationMode = "off" | "preview" | "automatic";
export type EvidenceMinimumConfidence = "building" | "ready";
export type OverrideScope = "session" | "week" | "microcycle";
export type TrainingDecisionOutcome =
  | "accepted"
  | "partiallyAccepted"
  | "rejected"
  | "autoApplied"
  | "undone"
  | "learningAccepted"
  | "learningDismissed";

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

export interface TrainingPolicy {
  version: typeof TRAINING_POLICY_VERSION;
  goal: TrainingGoal;
  musclePriorities: Partial<Record<MuscleGroup, MusclePriority>>;
  exercisePreferences: Record<string, ExercisePreference>;
  preferredEquipment: Equipment[];
  unavailableEquipment: Equipment[];
  weeklyTrainingDays: { minimum: number; target: number; maximum: number };
  maxSessionMinutes: number;
  maxExercisesPerSession: number;
  maxWorkingSetsPerSession: number;
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
const DECISION_OUTCOMES: TrainingDecisionOutcome[] = [
  "accepted",
  "partiallyAccepted",
  "rejected",
  "autoApplied",
  "undone",
  "learningAccepted",
  "learningDismissed",
];

const MUSCLE_ALIASES: Partial<Record<MuscleGroup, string[]>> = {
  chest: ["胸", "胸肌"],
  upperChest: ["上胸"],
  back: ["背部"],
  lats: ["背阔", "背阔肌"],
  upperBack: ["上背"],
  lowerBack: ["下背", "竖脊肌"],
  traps: ["斜方肌", "斜方"],
  frontDelt: ["肩前束", "前束"],
  sideDelt: ["肩中束", "中束", "侧肩"],
  rearDelt: ["肩后束", "后束"],
  biceps: ["二头", "肱二头"],
  triceps: ["三头", "肱三头"],
  forearms: ["前臂", "小臂"],
  quads: ["股四头", "股四", "大腿前侧", "腿"],
  hamstrings: ["腘绳", "大腿后侧"],
  glutes: ["臀", "臀部", "臀肌"],
  calves: ["小腿"],
  neck: ["颈部", "脖子"],
  abs: ["腹肌", "核心"],
};

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
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
    exercisePreferences: {},
    preferredEquipment: [],
    unavailableEquipment: [],
    weeklyTrainingDays: { minimum: 3, target: 5, maximum: 6 },
    maxSessionMinutes: 90,
    maxExercisesPerSession: 9,
    maxWorkingSetsPerSession: 30,
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
    exercisePreferences: stringRecord(value.exercisePreferences, PREFERENCES),
    preferredEquipment: uniqueEquipment(value.preferredEquipment),
    unavailableEquipment: uniqueEquipment(value.unavailableEquipment),
    weeklyTrainingDays: { minimum, target, maximum },
    maxSessionMinutes: clampInteger(value.maxSessionMinutes, 20, 240, fallback.maxSessionMinutes),
    maxExercisesPerSession: clampInteger(value.maxExercisesPerSession, 3, 15, fallback.maxExercisesPerSession),
    maxWorkingSetsPerSession: clampInteger(value.maxWorkingSetsPerSession, 6, 50, fallback.maxWorkingSetsPerSession),
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
    exercisePreferences: { ...base.exercisePreferences, ...(patch.exercisePreferences ?? {}) },
    weeklyTrainingDays: { ...base.weeklyTrainingDays, ...(patch.weeklyTrainingDays ?? {}) },
    autoApply: { ...base.autoApply, ...(patch.autoApply ?? {}) },
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
    const legacy = window.localStorage.getItem(LEGACY_TRAINING_POLICY_STORAGE_KEY)
      ?? window.localStorage.getItem(OLDEST_TRAINING_POLICY_STORAGE_KEY);
    const migrated = legacy ? normalizeTrainingPolicy(JSON.parse(legacy)) : defaultTrainingPolicy();
    window.localStorage.setItem(TRAINING_POLICY_STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.removeItem(LEGACY_TRAINING_POLICY_STORAGE_KEY);
    window.localStorage.removeItem(OLDEST_TRAINING_POLICY_STORAGE_KEY);
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
    window.localStorage.removeItem(LEGACY_TRAINING_POLICY_STORAGE_KEY);
    window.localStorage.removeItem(OLDEST_TRAINING_POLICY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("fitlog:training-policy", { detail: { updatedAt: normalized.updatedAt } }));
    return true;
  } catch {
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
    exercisePreferences: normalized.exercisePreferences,
    preferredEquipment: normalized.preferredEquipment,
    unavailableEquipment: normalized.unavailableEquipment,
    weeklyTrainingDays: normalized.weeklyTrainingDays,
    maxSessionMinutes: normalized.maxSessionMinutes,
    maxExercisesPerSession: normalized.maxExercisesPerSession,
    maxWorkingSetsPerSession: normalized.maxWorkingSetsPerSession,
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
  return text.toLowerCase().replace(/[\s，。；、,.!！?？]/g, "");
}

function parseExercisePreferences(data: AppData, text: string) {
  const normalized = compact(text);
  const preferences: Record<string, ExercisePreference> = {};
  const recognized: string[] = [];
  for (const exercise of [...DEFAULT_EXERCISES, ...data.customExercises]) {
    const names = [exercise.name, ...(exercise.aliases ?? [])].map(compact).filter(Boolean);
    const matched = names.find((name) => normalized.includes(name));
    if (!matched) continue;
    if ([`不做${matched}`, `不要做${matched}`, `排除${matched}`, `禁用${matched}`].some((phrase) => normalized.includes(phrase))) {
      preferences[exercise.id] = "exclude";
      recognized.push(`排除动作：${exercise.name}`);
    } else if ([`喜欢${matched}`, `优先做${matched}`, `多做${matched}`].some((phrase) => normalized.includes(phrase))) {
      preferences[exercise.id] = "prefer";
      recognized.push(`偏好动作：${exercise.name}`);
    } else if ([`少做${matched}`, `避免${matched}`].some((phrase) => normalized.includes(phrase))) {
      preferences[exercise.id] = "avoid";
      recognized.push(`尽量避免：${exercise.name}`);
    }
  }
  return { preferences, recognized };
}

export function parseTrainingPolicyText(
  text: string,
  data: AppData,
  base: TrainingPolicy,
): PolicyParseResult {
  const normalized = compact(text);
  const recognized: string[] = [];
  const patch: Partial<TrainingPolicy> = {};

  if (normalized.includes("减脂保肌") || normalized.includes("减脂期保肌")) {
    patch.goal = "fatLossRetention";
    recognized.push("目标：减脂保肌");
  } else if (normalized.includes("力量") || normalized.includes("提高力量")) {
    patch.goal = "strength";
    recognized.push("目标：力量");
  } else if (normalized.includes("增肌") || normalized.includes("体型塑造")) {
    patch.goal = "hypertrophy";
    recognized.push("目标：增肌/体型塑造");
  }

  if (normalized.includes("安全自动") || normalized.includes("自动调整计划")) {
    patch.adaptationMode = "safeAuto";
    recognized.push("计划调整：安全自动");
  } else if (normalized.includes("只给建议") || normalized.includes("仅建议")) {
    patch.adaptationMode = "suggestOnly";
    recognized.push("计划调整：仅建议");
  }

  const minuteMatch = normalized.match(/(?:最多|不超过|控制在|上限)?(\d{2,3})分钟/);
  if (minuteMatch) {
    const minutes = Math.min(240, Math.max(20, Number(minuteMatch[1])));
    patch.maxSessionMinutes = minutes;
    recognized.push(`单次训练上限：${minutes} 分钟`);
  }
  const dayMatch = normalized.match(/(?:每周|一周)(\d)(?:天|练)/);
  if (dayMatch) {
    const days = Math.min(7, Math.max(1, Number(dayMatch[1])));
    patch.weeklyTrainingDays = {
      minimum: Math.max(1, days - 1),
      target: days,
      maximum: Math.min(7, days + 1),
    };
    recognized.push(`每周训练目标：${days} 天`);
  }

  const musclePriorities: Partial<Record<MuscleGroup, MusclePriority>> = {};
  for (const muscle of MUSCLE_ORDER) {
    for (const alias of MUSCLE_ALIASES[muscle] ?? []) {
      const key = compact(alias);
      if (!normalized.includes(key)) continue;
      if ([`${key}优先`, `${key}重点`, `强化${key}`, `多练${key}`].some((phrase) => normalized.includes(phrase))) {
        musclePriorities[muscle] = "specialize";
        recognized.push(`${alias}：专项强化`);
      } else if ([`${key}维持`, `${key}保留`, `${key}够用`].some((phrase) => normalized.includes(phrase))) {
        musclePriorities[muscle] = "maintain";
        recognized.push(`${alias}：维持`);
      } else if ([`${key}少练`, `降低${key}`, `${key}不重要`].some((phrase) => normalized.includes(phrase))) {
        musclePriorities[muscle] = "deprioritize";
        recognized.push(`${alias}：降低优先级`);
      }
      break;
    }
  }
  if (Object.keys(musclePriorities).length) patch.musclePriorities = musclePriorities;

  const unavailableEquipment = new Set(base.unavailableEquipment);
  const equipmentTerms: Array<[Equipment, string[]]> = [
    ["free", ["没有自由重量", "不用自由重量", "不做自由重量"]],
    ["machine", ["没有器械", "不用器械"]],
    ["cable", ["没有绳索", "没有龙门架", "不用绳索"]],
    ["bodyweight", ["不做自重", "不用自重"]],
  ];
  for (const [equipment, phrases] of equipmentTerms) {
    if (phrases.some((phrase) => normalized.includes(compact(phrase)))) {
      unavailableEquipment.add(equipment);
      recognized.push(`不可用器械：${equipment}`);
    }
  }
  if (unavailableEquipment.size !== base.unavailableEquipment.length) {
    patch.unavailableEquipment = [...unavailableEquipment];
  }

  const exercise = parseExercisePreferences(data, text);
  if (Object.keys(exercise.preferences).length) patch.exercisePreferences = exercise.preferences;
  recognized.push(...exercise.recognized);

  return {
    policy: mergeTrainingPolicy(base, patch),
    recognized: [...new Set(recognized)],
    unresolved: recognized.length ? [] : [text.trim()].filter(Boolean),
  };
}
