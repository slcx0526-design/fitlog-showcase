import type {
  ActivityEnergyEntry,
  AppData,
  BackupData,
  BodyWeightEntry,
  CardioEntry,
  CutPlan,
  DayLog,
  Exercise,
  ExercisePreset,
  HealthDailySummary,
  MovementPattern,
  NutritionLog,
  Profile,
  RecordMode,
  ProgressionPlanSnapshot,
  ProgressionPrescription,
  RecoveryCheckIn,
  RecoveryRating,
  Schedule,
  SetRecord,
  StarterPlanPreset,
  SupersetGroup,
  Template,
  TemplateItem,
  TemplateSlot,
  TrainingType,
  WaistEntry,
  WorkoutAdaptiveSnapshot,
  Zone,
} from "./types";
import { fromKey, todayKey, toKey } from "./date";
import { assignHistoricalMicrocycles, defaultMesocycle, defaultMicrocycle, ensureMicrocycle, templateForCyclePhase } from "./microcycle";
import { MUSCLE_ORDER, type MuscleGroup } from "./muscles";
import type { Equipment } from "./muscles";
import { DEFAULT_EXERCISES } from "./exercises";
import { normalizeExercisePrescription, normalizeTemplateItemPrescription } from "./prescription";
import { hasSetPerformance } from "./trainingMetrics";
import {
  exportTrainingPolicyBackup,
  importTrainingPolicyBackup,
  loadTrainingPolicy,
  type TrainingPolicy,
  type PortableTrainingPolicyBackup,
} from "./trainingPolicy";
import {
  emitPersistenceStatus,
  PERSISTENCE_EVENT,
  type PersistenceEventDetail,
} from "./persistence";
import {
  COMPRESSED_STORAGE_PREFIX,
  decodeStorageValue,
  encodeStorageValue,
} from "./storageCodec";

export type { AppData } from "./types";

export const STORAGE_KEY = "fitlog:v1";
export const STORAGE_RECOVERY_KEY = "fitlog:v1:recovery";
const STORAGE_RECOVERY_META_KEY = "fitlog:v1:recovery-meta";
export { PERSISTENCE_EVENT, type PersistenceEventDetail };
const LEGACY_FAVORITES_KEY = "fitlog:favoriteExercises";
export const SCHEMA_VERSION = 18;

export type FitLogBackupData = BackupData & {
  adaptiveTraining?: PortableTrainingPolicyBackup;
};

const VALID_TYPES: TrainingType[] = ["push", "pull", "legs", "rest", "custom"];
const VALID_MUSCLES = new Set<string>(MUSCLE_ORDER);
const VALID_TECHNIQUES = new Set(["normal", "dropSet", "restPause", "myoReps", "cluster", "technique", "rehab"]);
const VALID_COMPLETIONS = new Set(["completed", "partial", "skipped"]);
const VALID_RECORD_MODES = new Set<RecordMode>(["weight", "reps", "rir", "duration", "distance"]);
const VALID_EQUIPMENT = new Set<Equipment>(["free", "machine", "cable", "bodyweight"]);
const VALID_SUPERSET_GROUPS = new Set<SupersetGroup>(["A", "B", "C", "D"]);
const VALID_STARTER_PLANS = new Set<StarterPlanPreset>(["compact3", "balanced5", "highFrequency6"]);
const VALID_PATTERNS = new Set<MovementPattern>([
  "horizontalPush", "inclinePush", "verticalPush", "fly", "verticalPull", "horizontalPull",
  "hipHinge", "squat", "lunge", "kneeExtension", "kneeFlexion", "armCurl", "armExtension",
  "lateralRaise", "rearDelt", "calfRaise", "core", "carry", "custom",
]);
const VALID_SUGGESTION_STATUSES = new Set([
  "addWeight", "addReps", "stabilize", "effortCheck", "finishSets", "noHistory",
  "modeReference", "manualProgression", "mixedLoads", "missingLoad", "unconfirmedHistory",
]);
const DEFAULT_EXERCISE_BY_ID = new Map(DEFAULT_EXERCISES.map((exercise) => [exercise.id, exercise]));

function parseRecordModes(input: unknown): RecordMode[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const modes = input.filter((mode): mode is RecordMode => typeof mode === "string" && VALID_RECORD_MODES.has(mode as RecordMode));
  return modes.length ? [...new Set(modes)] : undefined;
}

function parseStringList(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim())
    .filter((value, index, items) => items.indexOf(value) === index);
  return values.length ? values : undefined;
}

function parseMuscle(input: unknown): MuscleGroup | undefined {
  return typeof input === "string" && VALID_MUSCLES.has(input) ? input as MuscleGroup : undefined;
}

function parseMuscleList(input: unknown, primary?: MuscleGroup): MuscleGroup[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input
    .map(parseMuscle)
    .filter((value): value is MuscleGroup => Boolean(value) && value !== primary)
    .filter((value, index, items) => items.indexOf(value) === index);
  return values.length ? values : undefined;
}

function parseVolumeContributions(input: unknown) {
  if (!Array.isArray(input)) return undefined;
  const byMuscle = new Map<MuscleGroup, { muscle: MuscleGroup; weight: number; direct: boolean }>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as Record<string, unknown>;
    const muscle = parseMuscle(value.muscle);
    if (!muscle || typeof value.weight !== "number" || !Number.isFinite(value.weight)) continue;
    const candidate = { muscle, weight: Math.min(1, Math.max(0.1, Math.round(value.weight * 100) / 100)), direct: Boolean(value.direct) };
    const current = byMuscle.get(muscle);
    if (!current || candidate.direct || candidate.weight > current.weight) byMuscle.set(muscle, candidate);
  }
  const values = [...byMuscle.values()];
  return values.length ? values : undefined;
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = fromKey(value);
  return !Number.isNaN(parsed.getTime()) && toKey(parsed) === value;
}

function parseNutrition(input: unknown): NutritionLog | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (typeof value.calories !== "number" || !Number.isFinite(value.calories) || value.calories < 0 || value.calories > 20_000) return undefined;
  const macro = (field: "protein" | "carbs" | "fat") => typeof value[field] === "number" && Number.isFinite(value[field]) && value[field] >= 0 && value[field] <= 2_000 ? value[field] : 0;
  return { calories: value.calories, protein: macro("protein"), carbs: macro("carbs"), fat: macro("fat") };
}

function parseRecoveryRating(input: unknown): RecoveryRating | undefined {
  return typeof input === "number" && Number.isInteger(input) && input >= 1 && input <= 5
    ? input as RecoveryRating
    : undefined;
}

function parseRecovery(input: unknown): RecoveryCheckIn | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const sleepHours = typeof value.sleepHours === "number" && Number.isFinite(value.sleepHours) && value.sleepHours >= 0.5 && value.sleepHours <= 16
    ? Math.round(value.sleepHours * 10) / 10
    : undefined;
  const sleepQuality = parseRecoveryRating(value.sleepQuality);
  const energy = parseRecoveryRating(value.energy);
  const soreness = parseRecoveryRating(value.soreness);
  const stress = parseRecoveryRating(value.stress);
  if (sleepHours == null && sleepQuality == null && energy == null && soreness == null && stress == null) return undefined;
  return {
    ...(sleepHours != null ? { sleepHours } : {}),
    ...(sleepQuality != null ? { sleepQuality } : {}),
    ...(energy != null ? { energy } : {}),
    ...(soreness != null ? { soreness } : {}),
    ...(stress != null ? { stress } : {}),
    ...(typeof value.at === "string" && value.at ? { at: value.at } : {}),
  };
}

function parseWorkoutAdaptiveSnapshot(input: unknown): WorkoutAdaptiveSnapshot | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (value.version !== 1) return undefined;
  if (typeof value.createdAt !== "string" || typeof value.sourceDate !== "string" || typeof value.evidenceRevision !== "string") return undefined;
  if (value.state !== "collect" && value.state !== "normal" && value.state !== "conservative" && value.state !== "recovery") return undefined;
  if (value.confidence !== "low" && value.confidence !== "building" && value.confidence !== "ready") return undefined;
  if (value.mode !== "none" && value.mode !== "cut" && value.mode !== "evidence" && value.mode !== "cut+evidence") return undefined;
  const volumeScale = typeof value.volumeScale === "number" && Number.isFinite(value.volumeScale)
    ? Math.min(1, Math.max(0.5, Math.round(value.volumeScale * 100) / 100))
    : 1;
  const normalWorkingSets = typeof value.normalWorkingSets === "number" && Number.isFinite(value.normalWorkingSets)
    ? Math.max(0, Math.round(value.normalWorkingSets))
    : 0;
  const prescribedWorkingSets = typeof value.prescribedWorkingSets === "number" && Number.isFinite(value.prescribedWorkingSets)
    ? Math.max(0, Math.round(value.prescribedWorkingSets))
    : normalWorkingSets;
  const maxSessionMinutes = typeof value.maxSessionMinutes === "number" && Number.isFinite(value.maxSessionMinutes)
    ? Math.min(240, Math.max(20, Math.round(value.maxSessionMinutes)))
    : 90;
  return {
    version: 1,
    createdAt: value.createdAt,
    sourceDate: value.sourceDate,
    evidenceRevision: value.evidenceRevision,
    state: value.state,
    confidence: value.confidence,
    mode: value.mode,
    volumeScale,
    normalWorkingSets,
    prescribedWorkingSets,
    maxSessionMinutes,
    reasons: parseStringList(value.reasons)?.slice(0, 12) ?? [],
  };
}

function parseHealthSummary(input: unknown): HealthDailySummary | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (value.source !== "appleHealth") return undefined;
  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt))) return undefined;
  const metric = (field: string, min: number, max: number) =>
    typeof value[field] === "number" && Number.isFinite(value[field]) && value[field] >= min && value[field] <= max
      ? Math.round(value[field] * 10) / 10
      : undefined;
  const summary: HealthDailySummary = {
    source: "appleHealth",
    updatedAt: value.updatedAt,
  };
  const steps = metric("steps", 0, 200_000);
  const activeEnergyKcal = metric("activeEnergyKcal", 0, 20_000);
  const exerciseMinutes = metric("exerciseMinutes", 0, 1_440);
  const restingHeartRate = metric("restingHeartRate", 20, 250);
  const heartRateVariabilityMs = metric("heartRateVariabilityMs", 0, 1_000);
  const sleepMinutes = metric("sleepMinutes", 0, 1_440);
  if (steps != null) summary.steps = Math.round(steps);
  if (activeEnergyKcal != null) summary.activeEnergyKcal = activeEnergyKcal;
  if (exerciseMinutes != null) summary.exerciseMinutes = exerciseMinutes;
  if (restingHeartRate != null) summary.restingHeartRate = restingHeartRate;
  if (heartRateVariabilityMs != null) summary.heartRateVariabilityMs = heartRateVariabilityMs;
  if (sleepMinutes != null) summary.sleepMinutes = sleepMinutes;
  return Object.keys(summary).length > 2 ? summary : undefined;
}

function parseCardio(input: unknown, date: string, index: number): CardioEntry | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.minutes !== "number" || !Number.isFinite(value.minutes) || value.minutes <= 0 || value.minutes > 1_440) return null;
  const zone = value.zone === null || value.zone === undefined
    ? null
    : typeof value.zone === "number" && [1, 2, 3, 4, 5].includes(value.zone) ? value.zone as Zone : null;
  const entry: CardioEntry = {
    id: typeof value.id === "string" && value.id ? value.id : `legacy_cardio_${date.replace(/-/g, "")}_${index + 1}`,
    mode: typeof value.mode === "string" && value.mode.trim() ? value.mode.trim().slice(0, 40) : "有氧",
    minutes: Math.round(value.minutes),
    zone,
  };
  if (typeof value.avgHR === "number" && Number.isFinite(value.avgHR) && value.avgHR >= 20 && value.avgHR <= 250) entry.avgHR = Math.round(value.avgHR);
  if (typeof value.note === "string" && value.note.trim()) entry.note = value.note.trim().slice(0, 200);
  if (typeof value.at === "string") entry.at = value.at;
  return entry;
}

function uniqueByDate<T extends { date: string }>(entries: T[]) {
  const map = new Map<string, T>();
  for (const entry of entries) map.set(entry.date, entry);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function uniqueId(candidate: string, prefix: string, used: Set<string>) {
  const base = candidate.trim() || prefix;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  const id = `${base}_${index}`;
  used.add(id);
  return id;
}

function parsePrescription(input: unknown): ProgressionPrescription | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const progressionTrackId = typeof value.progressionTrackId === "string" ? value.progressionTrackId.trim() : "";
  if (!progressionTrackId) return undefined;
  if (value.trainingIntent !== "strength" && value.trainingIntent !== "hypertrophy" && value.trainingIntent !== "endurance" && value.trainingIntent !== "custom") return undefined;
  const performanceMode = value.performanceMode === "duration" || value.performanceMode === "distance" || value.performanceMode === "reps"
    ? value.performanceMode
    : undefined;
  const targetLimit = performanceMode === "duration" ? 3_600 : performanceMode === "distance" ? 100_000 : 40;
  const fallback = performanceMode === "duration" ? [30, 60] : performanceMode === "distance" ? [20, 50] : [8, 12];
  const min = typeof value.targetRepMin === "number" && Number.isFinite(value.targetRepMin)
    ? Math.min(targetLimit, Math.max(1, Math.round(value.targetRepMin)))
    : fallback[0];
  const max = typeof value.targetRepMax === "number" && Number.isFinite(value.targetRepMax)
    ? Math.min(targetLimit, Math.max(min, Math.round(value.targetRepMax)))
    : Math.max(min, fallback[1]);
  const targetRirMin = typeof value.targetRirMin === "number" && Number.isFinite(value.targetRirMin) && value.targetRirMin >= 0 && value.targetRirMin <= 10
    ? Math.round(value.targetRirMin * 10) / 10
    : undefined;
  const targetRirMax = typeof value.targetRirMax === "number" && Number.isFinite(value.targetRirMax) && value.targetRirMax >= 0 && value.targetRirMax <= 10
    ? Math.max(targetRirMin ?? 0, Math.round(value.targetRirMax * 10) / 10)
    : undefined;
  return {
    progressionTrackId,
    progressionTrackLabel: typeof value.progressionTrackLabel === "string" && value.progressionTrackLabel.trim() ? value.progressionTrackLabel.trim() : "训练轨道",
    trainingIntent: value.trainingIntent,
    targetRepMin: min,
    targetRepMax: max,
    ...(targetRirMin != null ? { targetRirMin } : {}),
    ...(targetRirMax != null ? { targetRirMax } : {}),
    workingSets: typeof value.workingSets === "number" && Number.isFinite(value.workingSets)
      ? Math.min(12, Math.max(1, Math.round(value.workingSets)))
      : 3,
    loadIncrementKg: typeof value.loadIncrementKg === "number" && Number.isFinite(value.loadIncrementKg)
      ? Math.min(100, Math.max(0, Math.round(value.loadIncrementKg * 100) / 100))
      : 2.5,
    progressionRule: value.progressionRule === "repsFirst" || value.progressionRule === "custom" ? value.progressionRule : "doubleProgression",
    ...(performanceMode ? { performanceMode } : {}),
  };
}

function parseProgressionPlan(input: unknown, plannedLoadKg?: number, expectedTrackId?: string): ProgressionPlanSnapshot | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (value.origin !== "suggestion" && value.origin !== "reference" && value.origin !== "manual") return undefined;
  const progressionTrackId = typeof value.progressionTrackId === "string" ? value.progressionTrackId.trim() : "";
  if (!progressionTrackId || (expectedTrackId && progressionTrackId !== expectedTrackId)) return undefined;
  if (typeof value.acceptedAt !== "string" || !value.acceptedAt) return undefined;
  if (typeof value.plannedLoadKg !== "number" || !Number.isFinite(value.plannedLoadKg) || value.plannedLoadKg <= 0 || value.plannedLoadKg > 5_000) return undefined;
  const load = Math.min(5_000, Math.round(value.plannedLoadKg * 100) / 100);
  if (plannedLoadKg != null && Math.abs(plannedLoadKg - load) > 0.05) return undefined;
  return {
    origin: value.origin,
    acceptedAt: value.acceptedAt,
    progressionTrackId,
    plannedLoadKg: load,
    ...(isDateKey(value.sourceDate) ? { sourceDate: value.sourceDate } : {}),
    ...(typeof value.suggestedLoadKg === "number" && Number.isFinite(value.suggestedLoadKg) && value.suggestedLoadKg > 0 && value.suggestedLoadKg <= 5_000
      ? { suggestedLoadKg: Math.min(5_000, Math.round(value.suggestedLoadKg * 100) / 100) }
      : {}),
    ...(typeof value.suggestionStatus === "string" && VALID_SUGGESTION_STATUSES.has(value.suggestionStatus)
      ? { suggestionStatus: value.suggestionStatus as ProgressionPlanSnapshot["suggestionStatus"] }
      : {}),
  };
}

function parseSet(input: unknown): SetRecord | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const validWeight = typeof value.weight === "number" && Number.isFinite(value.weight);
  const validReps = typeof value.reps === "number" && Number.isFinite(value.reps);
  const durationSeconds = typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds) && value.durationSeconds >= 0 ? Math.min(604_800, Math.round(value.durationSeconds)) : undefined;
  const distanceMeters = typeof value.distanceMeters === "number" && Number.isFinite(value.distanceMeters) && value.distanceMeters >= 0 ? Math.min(10_000_000, Math.round(value.distanceMeters * 100) / 100) : undefined;
  if ((!validWeight || !validReps) && durationSeconds == null && distanceMeters == null) return null;
  const set: SetRecord = {
    weight: validWeight ? Math.min(5_000, Math.max(0, Math.round((value.weight as number) * 100) / 100)) : 0,
    reps: validReps ? Math.min(100_000, Math.max(0, Math.round(value.reps as number))) : 0,
  };
  if (durationSeconds != null) set.durationSeconds = durationSeconds;
  if (distanceMeters != null) set.distanceMeters = distanceMeters;
  if (typeof value.rir === "number" && value.rir >= 0 && value.rir <= 10) set.rir = value.rir;
  if (value.type === "warmup" || value.type === "working") set.type = value.type;
  if (typeof value.completion === "string" && VALID_COMPLETIONS.has(value.completion)) set.completion = value.completion as SetRecord["completion"];
  if (typeof value.technique === "string" && VALID_TECHNIQUES.has(value.technique)) set.technique = value.technique as SetRecord["technique"];
  if (typeof value.at === "string") set.at = value.at;
  return set;
}

function parseCustomExercise(input: unknown): ExercisePreset | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id.trim() || typeof value.name !== "string" || !value.name.trim()) return null;
  const primaryMuscle = parseMuscle(value.primaryMuscle);
  const configuredContributions = parseVolumeContributions(value.volumeContributions)
    ?? (parseMuscleList(value.secondaryMuscles, primaryMuscle) ?? []).map((muscle) => ({ muscle, weight: 0.5, direct: false }));
  const secondary = configuredContributions
    .filter((item) => item && VALID_MUSCLES.has(item.muscle) && item.muscle !== primaryMuscle && typeof item.weight === "number" && Number.isFinite(item.weight))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.muscle === item.muscle) === index)
    .map((item) => ({ muscle: item.muscle, weight: Math.min(1, Math.max(0.1, Math.round(item.weight * 100) / 100)), direct: Boolean(item.direct) }));
  const volumeContributions = primaryMuscle
    ? [{ muscle: primaryMuscle, weight: 1, direct: true }, ...secondary]
    : secondary;
  const recordModes = parseRecordModes(value.recordModes);
  const aliases = parseStringList(value.aliases);
  const alternatives = parseStringList(value.alternatives);
  const equipment = typeof value.equipment === "string" && VALID_EQUIPMENT.has(value.equipment as Equipment)
    ? value.equipment as Equipment
    : undefined;
  const movementPattern = typeof value.movementPattern === "string" && VALID_PATTERNS.has(value.movementPattern as MovementPattern)
    ? value.movementPattern as MovementPattern
    : undefined;
  const defaultLoadIncrementKg = typeof value.defaultLoadIncrementKg === "number" && Number.isFinite(value.defaultLoadIncrementKg)
    ? Math.min(100, Math.max(0, Math.round(value.defaultLoadIncrementKg * 100) / 100))
    : undefined;
  return {
    id: value.id.trim(),
    name: value.name.trim(),
    ...(typeof value.englishName === "string" && value.englishName.trim() ? { englishName: value.englishName.trim() } : {}),
    ...(aliases ? { aliases } : {}),
    isMain: Boolean(value.isMain),
    type: "custom",
    custom: true,
    ...(primaryMuscle ? { primaryMuscle } : { primaryMuscle: undefined }),
    secondaryMuscles: secondary.map((item) => item.muscle),
    volumeContributions,
    ...(equipment ? { equipment } : {}),
    ...(movementPattern ? { movementPattern } : {}),
    ...(typeof value.compound === "boolean" ? { compound: value.compound } : {}),
    ...(defaultLoadIncrementKg != null ? { defaultLoadIncrementKg } : {}),
    ...(recordModes ? { recordModes } : {}),
    ...(typeof value.category === "string" && value.category.trim() ? { category: value.category.trim() } : {}),
    ...(alternatives ? { alternatives } : {}),
    ...(typeof value.region === "string" && value.region.trim() ? { region: value.region.trim() } : {}),
  };
}

interface ExerciseIdentityCandidate {
  assignedId: string;
  nameKeys: Set<string>;
}

interface ExerciseIdentityContext {
  customExercises: ExercisePreset[];
  resolveReference: (id: unknown, name?: unknown) => string | undefined;
  expandReferenceIds: (ids: string[] | undefined) => string[] | undefined;
}

function exerciseNameKey(input: unknown) {
  return typeof input === "string"
    ? input.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
    : "";
}

function exerciseNameKeys(exercise: Pick<ExercisePreset, "name" | "englishName" | "aliases">) {
  return new Set(
    [exercise.name, exercise.englishName, ...(exercise.aliases ?? [])]
      .map(exerciseNameKey)
      .filter(Boolean),
  );
}

function createExerciseIdentityContext(input: unknown): ExerciseIdentityContext {
  const parsed = Array.isArray(input)
    ? input.map(parseCustomExercise).filter((entry): entry is ExercisePreset => Boolean(entry))
    : [];
  const usedExerciseIds = new Set(DEFAULT_EXERCISES.map((exercise) => exercise.id));
  const candidatesByOriginalId = new Map<string, ExerciseIdentityCandidate[]>();
  const assigned = parsed.map((entry) => {
    const originalId = entry.id;
    const assignedId = uniqueId(originalId, "cx_imported", usedExerciseIds);
    const candidates = candidatesByOriginalId.get(originalId) ?? [];
    candidates.push({ assignedId, nameKeys: exerciseNameKeys(entry) });
    candidatesByOriginalId.set(originalId, candidates);
    return { ...entry, id: assignedId };
  });

  const resolveReference = (id: unknown, name?: unknown) => {
    if (typeof id !== "string" || !id.trim()) return undefined;
    const originalId = id.trim();
    const candidates = candidatesByOriginalId.get(originalId);
    if (!candidates?.length) return originalId;

    const builtIn = DEFAULT_EXERCISE_BY_ID.get(originalId);
    const nameKey = exerciseNameKey(name);
    if (nameKey) {
      const builtInMatches = Boolean(builtIn && exerciseNameKeys(builtIn).has(nameKey));
      const customMatches = candidates.filter((candidate) => candidate.nameKeys.has(nameKey));
      if (builtInMatches) return originalId;
      if (customMatches.length === 1) return customMatches[0].assignedId;
    }

    // A nameless collision with an in-box exercise cannot be safely attributed
    // to the custom movement. Snapshot names still recover custom references.
    if (builtIn) return originalId;
    return candidates[0].assignedId;
  };

  const expandReferenceIds = (ids: string[] | undefined) => {
    if (!ids?.length) return undefined;
    const expanded: string[] = [];
    const add = (id: string) => {
      if (!expanded.includes(id)) expanded.push(id);
    };
    for (const rawId of ids) {
      const id = rawId.trim();
      const candidates = candidatesByOriginalId.get(id);
      if (DEFAULT_EXERCISE_BY_ID.has(id)) add(id);
      for (const candidate of candidates ?? []) add(candidate.assignedId);
      if (!candidates?.length && !DEFAULT_EXERCISE_BY_ID.has(id)) add(id);
    }
    return expanded.length ? expanded : undefined;
  };

  const customExercises = assigned.map((entry) => {
    const { alternatives: rawAlternatives, ...rest } = entry;
    const alternatives = expandReferenceIds(rawAlternatives);
    return { ...rest, ...(alternatives ? { alternatives } : {}) };
  });
  return { customExercises, resolveReference, expandReferenceIds };
}

export function defaultSchedule(): Schedule { return { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] }; }
export function emptyData(): AppData { return { days: {}, bodyWeights: [], waistEntries: [], customExercises: [], schedule: defaultSchedule() }; }

export function parseStoredData(value: string): AppData {
  return normalizeData(decodeStorageValue(value));
}

function compactStoredValue(value: string) {
  const encoded = encodeStorageValue(parseStoredData(value));
  return encoded.compressed ? encoded.value : value;
}

function writeRecoveryCheckpoint(reason: "import" | "repair") {
  const current = window.localStorage.getItem(STORAGE_KEY);
  if (!current) return;
  const compact = compactStoredValue(current);
  // Compact the current value first so a large legacy JSON dataset does not
  // consume the quota while its recovery copy is created.
  if (compact !== current) window.localStorage.setItem(STORAGE_KEY, compact);
  window.localStorage.setItem(STORAGE_RECOVERY_KEY, compact);
  window.localStorage.setItem(STORAGE_RECOVERY_META_KEY, JSON.stringify({
    version: 1,
    reason,
    createdAt: new Date().toISOString(),
  }));
}

export function clearDataRecoveryCheckpoint() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_RECOVERY_KEY);
  window.localStorage.removeItem(STORAGE_RECOVERY_META_KEY);
}

export function loadData(): AppData {
  if (typeof window === "undefined") return emptyData();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const recovery = window.localStorage.getItem(STORAGE_RECOVERY_KEY);
    let data: AppData;
    let recovered = false;
    try {
      if (raw) data = parseStoredData(raw);
      else if (recovery) {
        data = parseStoredData(recovery);
        recovered = true;
      } else data = emptyData();
    } catch (primaryError) {
      if (!recovery) throw primaryError;
      data = parseStoredData(recovery);
      recovered = true;
      console.warn("主存储无法读取，已恢复最近的数据检查点：", primaryError);
    }
    const alreadyCompressed = Boolean(raw?.startsWith(COMPRESSED_STORAGE_PREFIX) && !recovered);
    const compact = alreadyCompressed ? null : encodeStorageValue(data);
    const repairedValue = compact?.compressed ? compact.value : recovered ? recovery : null;
    let repairCommitted = !recovered;
    if (repairedValue && repairedValue !== raw) {
      try {
        if (recovered && recovery !== repairedValue) {
          window.localStorage.setItem(STORAGE_RECOVERY_KEY, repairedValue);
        }
        window.localStorage.setItem(STORAGE_KEY, repairedValue);
        repairCommitted = true;
      } catch (repairError) {
        // Keep the in-memory workspace usable even when the browser temporarily
        // refuses a recovery repair or legacy-data compaction write.
        console.warn("数据已载入，但暂时无法完成本地存储整理：", repairError);
        emitPersistenceStatus("error");
      }
    }
    if (recovery && repairCommitted) {
      try {
        clearDataRecoveryCheckpoint();
      } catch (cleanupError) {
        console.warn("临时恢复点暂未清理：", cleanupError);
      }
    }
    let legacyFavorites: string[] = [];
    try {
      legacyFavorites = parseStringList(JSON.parse(window.localStorage.getItem(LEGACY_FAVORITES_KEY) ?? "[]")) ?? [];
    } catch {
      legacyFavorites = [];
    }
    if (legacyFavorites.length) data.favoriteExerciseIds = [...new Set([...(data.favoriteExerciseIds ?? []), ...legacyFavorites])];
    return data;
  } catch (error) {
    console.warn("本地数据读取失败：", error);
    emitPersistenceStatus("error");
    return emptyData();
  }
}

export function saveData(
  data: AppData,
  options: { checkpoint?: "import" | "repair" } = {},
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const encoded = encodeStorageValue(data);
    if (options.checkpoint) writeRecoveryCheckpoint(options.checkpoint);
    window.localStorage.setItem(STORAGE_KEY, encoded.value);
    try {
      clearDataRecoveryCheckpoint();
      window.localStorage.removeItem(LEGACY_FAVORITES_KEY);
    } catch (cleanupError) {
      // The main value is already committed. Cleanup is best-effort and must
      // not make a completed data transaction look rolled back.
      console.warn("主数据已保存，临时存储清理稍后重试：", cleanupError);
    }
    emitPersistenceStatus("saved");
    return true;
  } catch (error) {
    console.warn("保存失败：", error);
    emitPersistenceStatus("error");
    return false;
  }
}

export function normalizeData(input: unknown): AppData {
  const out = emptyData();
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;
  const exerciseIdentity = createExerciseIdentityContext(obj.customExercises);
  out.customExercises = exerciseIdentity.customExercises;
  const knownPresetById = new Map(
    [...DEFAULT_EXERCISES, ...out.customExercises].map((preset) => [preset.id, preset]),
  );

  const favoriteExerciseIds = exerciseIdentity.expandReferenceIds(parseStringList(obj.favoriteExerciseIds));
  if (favoriteExerciseIds?.length) out.favoriteExerciseIds = favoriteExerciseIds;

  if (obj.days && typeof obj.days === "object") {
    for (const [date, rawDay] of Object.entries(obj.days as Record<string, unknown>)) {
      if (!isDateKey(date) || !rawDay || typeof rawDay !== "object") continue;
      const day = rawDay as DayLog;
      const next: DayLog = { date };
      if (day.workout && typeof day.workout === "object") {
        const workout = day.workout;
        const exercises = Array.isArray(workout.exercises)
          ? workout.exercises.flatMap((rawExercise) => {
              if (!rawExercise || typeof rawExercise !== "object") return [];
              const exercise = rawExercise as Exercise;
              if (typeof exercise.id !== "string" || !exercise.id.trim()) return [];
              const exerciseId = exerciseIdentity.resolveReference(exercise.id, exercise.name);
              if (!exerciseId) return [];
              const sets = Array.isArray(exercise.sets) ? exercise.sets.map(parseSet).filter((set): set is SetRecord => !!set) : [];
              const recordModes = parseRecordModes(exercise.recordModes);
              const primaryMuscle = parseMuscle(exercise.primaryMuscle);
              const secondaryMuscles = parseMuscleList(exercise.secondaryMuscles, primaryMuscle);
              const volumeContributions = parseVolumeContributions(exercise.volumeContributions);
              const equipment = typeof exercise.equipment === "string" && VALID_EQUIPMENT.has(exercise.equipment as Equipment)
                ? exercise.equipment as Equipment
                : undefined;
              const movementPattern = typeof exercise.movementPattern === "string" && VALID_PATTERNS.has(exercise.movementPattern as MovementPattern)
                ? exercise.movementPattern as MovementPattern
                : undefined;
              const alternatives = exerciseIdentity.expandReferenceIds(parseStringList(exercise.alternatives));
              const supersetGroup = typeof exercise.supersetGroup === "string" && VALID_SUPERSET_GROUPS.has(exercise.supersetGroup as SupersetGroup)
                ? exercise.supersetGroup as SupersetGroup
                : undefined;
              const prescription = parsePrescription(exercise.prescription);
              const performanceMode = prescription?.performanceMode ?? (recordModes?.includes("duration") ? "duration" : recordModes?.includes("distance") ? "distance" : "reps");
              const targetLimit = performanceMode === "duration" ? 3_600 : performanceMode === "distance" ? 100_000 : 40;
              const legacyTargetRepMin = typeof exercise.targetRepMin === "number" && Number.isFinite(exercise.targetRepMin)
                ? Math.min(targetLimit, Math.max(1, Math.round(exercise.targetRepMin)))
                : undefined;
              const legacyTargetRepMax = typeof exercise.targetRepMax === "number" && Number.isFinite(exercise.targetRepMax)
                ? Math.min(targetLimit, Math.max(legacyTargetRepMin ?? 1, Math.round(exercise.targetRepMax)))
                : undefined;
              const legacyTargetRirMin = typeof exercise.targetRirMin === "number" && Number.isFinite(exercise.targetRirMin) && exercise.targetRirMin >= 0 && exercise.targetRirMin <= 10
                ? Math.round(exercise.targetRirMin * 10) / 10
                : undefined;
              const legacyTargetRirMax = typeof exercise.targetRirMax === "number" && Number.isFinite(exercise.targetRirMax) && exercise.targetRirMax >= 0 && exercise.targetRirMax <= 10
                ? Math.max(legacyTargetRirMin ?? 0, Math.round(exercise.targetRirMax * 10) / 10)
                : undefined;
              const rawPlanned = exercise.planned;
              const planned = rawPlanned && typeof rawPlanned === "object"
                && typeof rawPlanned.sets === "number" && Number.isFinite(rawPlanned.sets)
                && typeof rawPlanned.repsLow === "number" && Number.isFinite(rawPlanned.repsLow)
                && typeof rawPlanned.repsHigh === "number" && Number.isFinite(rawPlanned.repsHigh)
                ? {
                    sets: Math.min(12, Math.max(1, Math.round(rawPlanned.sets))),
                    repsLow: Math.min(targetLimit, Math.max(1, Math.round(rawPlanned.repsLow))),
                    repsHigh: Math.min(targetLimit, Math.max(1, Math.round(rawPlanned.repsHigh))),
                    ...(typeof rawPlanned.rpe === "number" && Number.isFinite(rawPlanned.rpe) && rawPlanned.rpe >= 5 && rawPlanned.rpe <= 10
                      ? { rpe: Math.round(rawPlanned.rpe * 10) / 10 }
                      : {}),
                  }
                : undefined;
              if (planned && planned.repsHigh < planned.repsLow) planned.repsHigh = planned.repsLow;
              const plannedLoadKg = typeof exercise.plannedLoadKg === "number" && Number.isFinite(exercise.plannedLoadKg) && exercise.plannedLoadKg > 0 && exercise.plannedLoadKg <= 5_000
                ? Math.min(5_000, Math.round(exercise.plannedLoadKg * 100) / 100)
                : undefined;
              const candidate: Exercise = {
                id: exerciseId,
                name: typeof exercise.name === "string" && exercise.name.trim()
                  ? exercise.name.trim()
                  : knownPresetById.get(exerciseId)?.name ?? "动作",
                isMain: Boolean(exercise.isMain),
                sets,
                ...(recordModes ? { recordModes } : {}),
                ...(primaryMuscle ? { primaryMuscle } : {}),
                ...(secondaryMuscles ? { secondaryMuscles } : {}),
                ...(volumeContributions ? { volumeContributions } : {}),
                ...(equipment ? { equipment } : {}),
                ...(movementPattern ? { movementPattern } : {}),
                ...(alternatives ? { alternatives } : {}),
                ...(supersetGroup ? { supersetGroup } : {}),
                ...(planned ? { planned } : {}),
                ...(prescription ? { prescription } : {}),
                ...(typeof exercise.progressionTrackId === "string" && exercise.progressionTrackId.trim() ? { progressionTrackId: exercise.progressionTrackId.trim() } : {}),
                ...(typeof exercise.progressionTrackLabel === "string" && exercise.progressionTrackLabel.trim() ? { progressionTrackLabel: exercise.progressionTrackLabel.trim() } : {}),
                ...(exercise.trainingIntent === "strength" || exercise.trainingIntent === "hypertrophy" || exercise.trainingIntent === "endurance" || exercise.trainingIntent === "custom" ? { trainingIntent: exercise.trainingIntent } : {}),
                ...(legacyTargetRepMin != null ? { targetRepMin: legacyTargetRepMin } : {}),
                ...(legacyTargetRepMax != null ? { targetRepMax: legacyTargetRepMax } : {}),
                ...(legacyTargetRirMin != null ? { targetRirMin: legacyTargetRirMin } : {}),
                ...(legacyTargetRirMax != null ? { targetRirMax: legacyTargetRirMax } : {}),
                ...(typeof exercise.workingSets === "number" && Number.isFinite(exercise.workingSets) ? { workingSets: Math.min(12, Math.max(1, Math.round(exercise.workingSets))) } : {}),
                ...(typeof exercise.loadIncrementKg === "number" && Number.isFinite(exercise.loadIncrementKg) ? { loadIncrementKg: Math.min(100, Math.max(0, Math.round(exercise.loadIncrementKg * 100) / 100)) } : {}),
                ...(exercise.progressionRule === "doubleProgression" || exercise.progressionRule === "repsFirst" || exercise.progressionRule === "custom" ? { progressionRule: exercise.progressionRule } : {}),
                ...(plannedLoadKg != null ? { plannedLoadKg } : {}),
              };
              const normalized = normalizeExercisePrescription(candidate);
              const progressionPlan = parseProgressionPlan(exercise.progressionPlan, plannedLoadKg, normalized.prescription?.progressionTrackId);
              return [{ ...normalized, ...(progressionPlan ? { progressionPlan } : {}) }];
            })
          : [];
        const parsedType = VALID_TYPES.includes(workout.type) ? workout.type : "custom";
        const type = parsedType === "rest" && exercises.some((exercise) => exercise.sets.some(hasSetPerformance))
          ? "custom"
          : parsedType;
        const adaptiveSnapshot = parseWorkoutAdaptiveSnapshot(workout.adaptiveSnapshot);
        next.workout = {
          type,
          ...(typeof workout.templateId === "string" ? { templateId: workout.templateId } : {}),
          ...(typeof workout.microcycleId === "string" ? { microcycleId: workout.microcycleId } : {}),
          ...(typeof workout.microcycleStepId === "string" ? { microcycleStepId: workout.microcycleStepId } : {}),
          ...(type === "rest"
            ? { done: true }
            : typeof workout.done === "boolean"
              ? { done: workout.done }
              : {}),
          ...(workout.difficulty === "easy" || workout.difficulty === "onTarget" || workout.difficulty === "hard" ? { difficulty: workout.difficulty } : {}),
          ...((type === "rest" || workout.done !== false) && typeof workout.completedAt === "string" ? { completedAt: workout.completedAt } : {}),
          ...(typeof workout.mesocycleId === "string" && workout.mesocycleId ? { mesocycleId: workout.mesocycleId } : {}),
          ...(typeof workout.mesocycleCycleNumber === "number" && Number.isFinite(workout.mesocycleCycleNumber) ? { mesocycleCycleNumber: Math.max(1, Math.round(workout.mesocycleCycleNumber)) } : {}),
          ...(workout.cyclePhase === "build" || workout.cyclePhase === "deload" ? { cyclePhase: workout.cyclePhase } : {}),
          ...(adaptiveSnapshot ? { adaptiveSnapshot } : {}),
          exercises,
        };
      }
      const nutrition = parseNutrition(day.nutrition);
      if (nutrition) next.nutrition = nutrition;
      const recovery = parseRecovery(day.recovery);
      if (recovery) next.recovery = recovery;
      const health = parseHealthSummary(day.health);
      if (health) next.health = health;
      if (Array.isArray(day.cardio)) {
        const cardio = day.cardio.map((entry, index) => parseCardio(entry, date, index)).filter((entry): entry is CardioEntry => Boolean(entry));
        if (cardio.length) next.cardio = cardio;
      }
      if (Array.isArray(day.activityEnergy)) {
        const allowed = new Set(["strength", "steps", "wearable", "other"]);
        const entries = (day.activityEnergy as ActivityEnergyEntry[]).filter((entry) => entry && typeof entry.id === "string" && typeof entry.kcal === "number" && Number.isFinite(entry.kcal) && entry.kcal > 0 && entry.kcal <= 3000 && allowed.has(entry.source));
        if (entries.length) next.activityEnergy = entries;
        else delete next.activityEnergy;
      } else delete next.activityEnergy;
      out.days[date] = next;
    }
  }

  if (Array.isArray(obj.bodyWeights)) {
    out.bodyWeights = uniqueByDate((obj.bodyWeights as BodyWeightEntry[]).flatMap((entry) => {
      if (!entry || !isDateKey(entry.date) || typeof entry.weight !== "number" || !Number.isFinite(entry.weight) || entry.weight < 30 || entry.weight > 300) return [];
      return [{
        date: entry.date,
        weight: Math.round(entry.weight * 100) / 100,
        ...(entry.source === "appleHealth" ? { source: "appleHealth" as const } : {}),
      }];
    }));
  }
  if (Array.isArray(obj.waistEntries)) {
    out.waistEntries = uniqueByDate((obj.waistEntries as WaistEntry[]).filter((entry) => entry && isDateKey(entry.date) && typeof entry.waist === "number" && Number.isFinite(entry.waist) && entry.waist >= 30 && entry.waist <= 200));
  }

  if (obj.cutPlan && typeof obj.cutPlan === "object") {
    const value = obj.cutPlan as Record<string, unknown>;
    const plan: CutPlan = {};
    if (value.baselineActivity === "low" || value.baselineActivity === "light" || value.baselineActivity === "moderate" || value.baselineActivity === "high") plan.baselineActivity = value.baselineActivity;
    if (typeof value.weeklyLossPct === "number" && Number.isFinite(value.weeklyLossPct) && value.weeklyLossPct >= 0.1 && value.weeklyLossPct <= 1.5) plan.weeklyLossPct = Math.round(value.weeklyLossPct * 100) / 100;
    if (typeof value.enabled === "boolean") plan.enabled = value.enabled;
    if (typeof value.targetBodyFatPct === "number" && Number.isFinite(value.targetBodyFatPct) && value.targetBodyFatPct >= 5 && value.targetBodyFatPct <= 45) plan.targetBodyFatPct = Math.round(value.targetBodyFatPct * 10) / 10;
    if (typeof value.trainingVolumeScale === "number" && Number.isFinite(value.trainingVolumeScale) && value.trainingVolumeScale >= 0.5 && value.trainingVolumeScale <= 1) plan.trainingVolumeScale = Math.round(value.trainingVolumeScale * 100) / 100;
    if (typeof value.weeklyCardioMinutes === "number" && Number.isFinite(value.weeklyCardioMinutes) && value.weeklyCardioMinutes >= 30 && value.weeklyCardioMinutes <= 420) plan.weeklyCardioMinutes = Math.round(value.weeklyCardioMinutes);
    if (typeof value.routineCardioMinutesPerSession === "number" && Number.isFinite(value.routineCardioMinutesPerSession) && value.routineCardioMinutesPerSession > 0 && value.routineCardioMinutesPerSession <= 240) plan.routineCardioMinutesPerSession = Math.round(value.routineCardioMinutesPerSession);
    if (typeof value.routineCardioSessionsPerWeek === "number" && Number.isFinite(value.routineCardioSessionsPerWeek) && value.routineCardioSessionsPerWeek > 0 && value.routineCardioSessionsPerWeek <= 7) plan.routineCardioSessionsPerWeek = Math.round(value.routineCardioSessionsPerWeek);
    if (typeof value.routineCardioZone === "number" && [1, 2, 3, 4, 5].includes(value.routineCardioZone)) plan.routineCardioZone = value.routineCardioZone as Zone;
    if (value.trainingTemplateIds && typeof value.trainingTemplateIds === "object") {
      const rawIds = value.trainingTemplateIds as Record<string, unknown>;
      const ids: NonNullable<CutPlan["trainingTemplateIds"]> = {};
      for (const type of ["push", "pull", "legs"] as const) if (typeof rawIds[type] === "string" && rawIds[type]) ids[type] = rawIds[type];
      if (Object.keys(ids).length) plan.trainingTemplateIds = ids;
    }
    if (typeof value.targetWeightKg === "number" && Number.isFinite(value.targetWeightKg) && value.targetWeightKg >= 30 && value.targetWeightKg <= 300) plan.targetWeightKg = Math.round(value.targetWeightKg * 10) / 10;
    if (Object.keys(plan).length) out.cutPlan = plan;
  }

  if (obj.schedule && typeof obj.schedule === "object" && Array.isArray((obj.schedule as Schedule).split) && (obj.schedule as Schedule).split.length === 7) {
    const rawSchedule = obj.schedule as Schedule;
    const split = rawSchedule.split.map((type) => VALID_TYPES.includes(type as TrainingType) ? type as TrainingType : "") as (TrainingType | "")[];
    const microcycle = Array.isArray(rawSchedule.microcycle)
      ? rawSchedule.microcycle.flatMap((step, index) => {
          if (!step || !VALID_TYPES.includes(step.type) || step.type === "custom") return [];
          return [{ id: typeof step.id === "string" && step.id ? step.id : `cycle_step_${index + 1}`, type: step.type, label: typeof step.label === "string" && step.label.trim() ? step.label.trim().slice(0, 24) : step.type, ...(step.type !== "rest" && typeof step.templateId === "string" && step.templateId ? { templateId: step.templateId } : {}) }];
        }).slice(0, 14)
      : [];
    out.schedule = { split, ...(microcycle.length ? { microcycle } : {}) };
  }
  if (typeof obj.lastBackupAt === "string") out.lastBackupAt = obj.lastBackupAt;

  if (obj.profile && typeof obj.profile === "object") {
    const value = obj.profile as Record<string, unknown>;
    const profile: Profile = {};
    if (value.sex === "male" || value.sex === "female") profile.sex = value.sex;
    if (typeof value.heightCm === "number" && value.heightCm >= 120 && value.heightCm <= 230) profile.heightCm = value.heightCm;
    if (typeof value.birthYear === "number" && value.birthYear > 1900 && value.birthYear < 2100) profile.birthYear = value.birthYear;
    if (typeof value.restingHR === "number" && value.restingHR >= 20 && value.restingHR < 150) profile.restingHR = value.restingHR;
    if (typeof value.maxHR === "number" && value.maxHR > 100 && value.maxHR < 230) profile.maxHR = value.maxHR;
    if (value.trainingLevel === "beginner" || value.trainingLevel === "intermediate" || value.trainingLevel === "advanced") profile.trainingLevel = value.trainingLevel;
    if (Object.keys(profile).length) out.profile = profile;
  }

  const presetById = new Map(knownPresetById);
  for (const [, day] of Object.entries(out.days).sort(([a], [b]) => b.localeCompare(a))) {
    for (const exercise of day.workout?.exercises ?? []) {
      if (presetById.has(exercise.id)) continue;
      presetById.set(exercise.id, {
        id: exercise.id,
        name: exercise.name,
        isMain: exercise.isMain,
        type: day.workout?.type ?? "custom",
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        volumeContributions: exercise.volumeContributions,
        equipment: exercise.equipment,
        movementPattern: exercise.movementPattern,
        alternatives: exercise.alternatives,
        recordModes: exercise.recordModes,
      });
    }
  }
  const parseItem = (input: unknown): TemplateItem | null => {
    if (!input || typeof input !== "object") return null;
    const value = input as Record<string, unknown>;
    const exerciseId = exerciseIdentity.resolveReference(value.exerciseId, value.name) ?? "";
    if (!exerciseId) return null;
    const recordModes = parseRecordModes(value.recordModes);
    const primaryMuscle = parseMuscle(value.primaryMuscle);
    const secondaryMuscles = parseMuscleList(value.secondaryMuscles, primaryMuscle);
    const volumeContributions = parseVolumeContributions(value.volumeContributions);
    const equipment = typeof value.equipment === "string" && VALID_EQUIPMENT.has(value.equipment as Equipment) ? value.equipment as Equipment : undefined;
    const movementPattern = typeof value.movementPattern === "string" && VALID_PATTERNS.has(value.movementPattern as MovementPattern) ? value.movementPattern as MovementPattern : undefined;
    const alternatives = exerciseIdentity.expandReferenceIds(parseStringList(value.alternatives));
    const supersetGroup = typeof value.supersetGroup === "string" && VALID_SUPERSET_GROUPS.has(value.supersetGroup as SupersetGroup)
      ? value.supersetGroup as SupersetGroup
      : undefined;
    const prescription = parsePrescription(value.prescription);
    const performanceMode = prescription?.performanceMode ?? (recordModes?.includes("duration") ? "duration" : recordModes?.includes("distance") ? "distance" : "reps");
    let low = 8;
    let high = 12;
    if (typeof value.repsLow === "number" && Number.isFinite(value.repsLow) && typeof value.repsHigh === "number" && Number.isFinite(value.repsHigh)) { low = value.repsLow; high = value.repsHigh; }
    else if (typeof value.reps === "string") {
      const range = value.reps.match(/(\d+)\s*[-–~]\s*(\d+)/);
      const single = parseInt(value.reps, 10);
      low = range ? Number(range[1]) : Number.isFinite(single) ? single : 8;
      high = range ? Number(range[2]) : Number.isFinite(single) ? single : 12;
    }
    const targetMax = performanceMode === "duration" ? 3_600 : performanceMode === "distance" ? 100_000 : 40;
    low = Math.min(targetMax, Math.max(1, Math.round(low)));
    high = Math.min(targetMax, Math.max(low, Math.round(high)));
    const targetRirMin = typeof value.targetRirMin === "number" && Number.isFinite(value.targetRirMin) && value.targetRirMin >= 0 && value.targetRirMin <= 10
      ? Math.round(value.targetRirMin * 10) / 10
      : undefined;
    const targetRirMax = typeof value.targetRirMax === "number" && Number.isFinite(value.targetRirMax) && value.targetRirMax >= 0 && value.targetRirMax <= 10
      ? Math.max(targetRirMin ?? 0, Math.round(value.targetRirMax * 10) / 10)
      : undefined;
    const item: TemplateItem = {
      exerciseId,
      name: typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : presetById.get(exerciseId)?.name ?? "动作",
      sets: typeof value.sets === "number" && value.sets >= 1 && value.sets <= 12 ? Math.round(value.sets) : 3,
      repsLow: low,
      repsHigh: high,
      ...(typeof value.rpe === "number" && value.rpe >= 5 && value.rpe <= 10 ? { rpe: value.rpe } : {}),
      ...(typeof value.isMain === "boolean" ? { isMain: value.isMain } : {}),
      ...(primaryMuscle ? { primaryMuscle } : {}),
      ...(secondaryMuscles ? { secondaryMuscles } : {}),
      ...(volumeContributions ? { volumeContributions } : {}),
      ...(equipment ? { equipment } : {}),
      ...(movementPattern ? { movementPattern } : {}),
      ...(alternatives ? { alternatives } : {}),
      ...(supersetGroup ? { supersetGroup } : {}),
      ...(prescription ? { prescription } : {}),
      ...(typeof value.progressionTrackId === "string" && value.progressionTrackId.trim() ? { progressionTrackId: value.progressionTrackId.trim() } : {}),
      ...(typeof value.progressionTrackLabel === "string" && value.progressionTrackLabel.trim() ? { progressionTrackLabel: value.progressionTrackLabel.trim() } : {}),
      ...(value.trainingIntent === "strength" || value.trainingIntent === "hypertrophy" || value.trainingIntent === "endurance" || value.trainingIntent === "custom" ? { trainingIntent: value.trainingIntent } : {}),
      ...(targetRirMin != null ? { targetRirMin } : {}),
      ...(targetRirMax != null ? { targetRirMax } : {}),
      ...(typeof value.loadIncrementKg === "number" && Number.isFinite(value.loadIncrementKg) ? { loadIncrementKg: Math.min(100, Math.max(0, Math.round(value.loadIncrementKg * 100) / 100)) } : {}),
      ...(value.progressionRule === "doubleProgression" || value.progressionRule === "repsFirst" || value.progressionRule === "custom" ? { progressionRule: value.progressionRule } : {}),
      ...(recordModes ? { recordModes } : {}),
    };
    return normalizeTemplateItemPrescription(item, presetById.get(exerciseId));
  };

  const parseTemplateSnapshot = (input: unknown): Template | undefined => {
    if (!input || typeof input !== "object") return undefined;
    const value = input as Record<string, unknown>;
    if (value.type !== "push" && value.type !== "pull" && value.type !== "legs") return undefined;
    if (typeof value.id !== "string" || !value.id.trim()) return undefined;
    return {
      id: value.id.trim(),
      name: typeof value.name === "string" ? value.name.trim() : "",
      type: value.type,
      items: Array.isArray(value.items) ? value.items.map(parseItem).filter((item): item is TemplateItem => Boolean(item)) : [],
    };
  };

  if (Array.isArray(obj.templates)) {
    const templates: Template[] = [];
    const usedTemplateIds = new Set<string>();
    for (const rawTemplate of obj.templates) {
      if (!rawTemplate || typeof rawTemplate !== "object") continue;
      const value = rawTemplate as Record<string, unknown>;
      if (value.type !== "push" && value.type !== "pull" && value.type !== "legs") continue;
      const candidate = typeof value.id === "string" && value.id.trim()
        ? value.id.trim()
        : `tpl_imported_${templates.length + 1}`;
      templates.push({ id: uniqueId(candidate, "tpl_imported", usedTemplateIds), name: typeof value.name === "string" ? value.name.trim() : "", type: value.type, items: Array.isArray(value.items) ? value.items.map(parseItem).filter((item): item is TemplateItem => !!item) : [] });
    }
    if (templates.length) out.templates = templates;
  } else if (obj.templates && typeof obj.templates === "object") {
    const meta: Record<TemplateSlot, { type: TrainingType; name: string }> = { push1: { type: "push", name: "推 1" }, push2: { type: "push", name: "推 2" }, pull1: { type: "pull", name: "拉 1" }, pull2: { type: "pull", name: "拉 2" }, legs1: { type: "legs", name: "腿" } };
    const rawTemplates = obj.templates as Record<string, unknown>;
    const templates = (Object.keys(meta) as TemplateSlot[]).flatMap((slot) => {
      const source = rawTemplates[slot];
      const items = Array.isArray(source) ? source.map(parseItem).filter((item): item is TemplateItem => !!item) : [];
      return items.length ? [{ id: `tpl_legacy_${slot}`, name: meta[slot].name, type: meta[slot].type, items }] : [];
    });
    if (templates.length) out.templates = templates;
  }

  if (obj.days && typeof obj.days === "object") {
    for (const [date, rawDay] of Object.entries(obj.days as Record<string, unknown>)) {
      if (!out.days[date]?.workout || !rawDay || typeof rawDay !== "object") continue;
      const rawWorkout = (rawDay as Record<string, unknown>).workout;
      if (!rawWorkout || typeof rawWorkout !== "object") continue;
      const snapshot = parseTemplateSnapshot((rawWorkout as Record<string, unknown>).templateSnapshot);
      const workout = out.days[date].workout!;
      if (snapshot && snapshot.type === workout.type && (!workout.templateId || workout.templateId === snapshot.id)) {
        out.days[date].workout = { ...workout, templateId: workout.templateId ?? snapshot.id, templateSnapshot: snapshot };
      }
    }
  }

  if (obj.muscleTargets && typeof obj.muscleTargets === "object") {
    const targets: NonNullable<AppData["muscleTargets"]> = {};
    for (const [muscle, rawTarget] of Object.entries(obj.muscleTargets as Record<string, unknown>)) {
      if (!VALID_MUSCLES.has(muscle)) continue;
      if (!rawTarget || typeof rawTarget !== "object") continue;
      const target = rawTarget as Record<string, unknown>;
      if (typeof target.low !== "number" || !Number.isFinite(target.low) || typeof target.high !== "number" || !Number.isFinite(target.high)) continue;
      const low = Math.min(100, Math.max(0, Math.round(target.low)));
      targets[muscle as keyof typeof targets] = { low, high: Math.min(100, Math.max(low, Math.round(target.high))) };
    }
    if (Object.keys(targets).length) out.muscleTargets = targets;
  }
  if (obj.microcycle && typeof obj.microcycle === "object") {
    const value = obj.microcycle as Record<string, unknown>;
    if (typeof value.currentId === "string" && value.currentId && isDateKey(value.startedAt)) {
      const steps = Array.isArray(value.steps)
        ? value.steps.flatMap((step, index) => {
            if (!step || typeof step !== "object") return [];
            const item = step as Record<string, unknown>;
            if (!VALID_TYPES.includes(item.type as TrainingType) || item.type === "custom") return [];
            const templateId = item.type !== "rest" && typeof item.templateId === "string" && item.templateId ? item.templateId : undefined;
            const templateSnapshot = parseTemplateSnapshot(item.templateSnapshot);
            return [{
              id: typeof item.id === "string" && item.id ? item.id : `cycle_step_${index + 1}`,
              type: item.type as TrainingType,
              label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 24) : String(item.type),
              ...(templateId ? { templateId } : {}),
              ...(templateId && templateSnapshot?.id === templateId && templateSnapshot.type === item.type ? { templateSnapshot } : {}),
            }];
          }).slice(0, 14)
        : [];
      out.microcycle = {
        currentId: value.currentId,
        startedAt: value.startedAt,
        index: typeof value.index === "number" && Number.isFinite(value.index) ? Math.min(1_000_000, Math.max(1, Math.round(value.index))) : 1,
        ...(steps.length ? { steps } : {}),
        ...(value.phase === "build" || value.phase === "deload" ? { phase: value.phase } : {}),
        ...(typeof value.mesocycleId === "string" && value.mesocycleId ? { mesocycleId: value.mesocycleId } : {}),
        ...(typeof value.mesocycleCycleNumber === "number" && Number.isFinite(value.mesocycleCycleNumber) ? { mesocycleCycleNumber: Math.max(1, Math.round(value.mesocycleCycleNumber)) } : {}),
        ...(typeof value.sourceReviewId === "string" && value.sourceReviewId ? { sourceReviewId: value.sourceReviewId } : {}),
      };
    }
  }

  if (obj.mesocycle && typeof obj.mesocycle === "object") {
    const value = obj.mesocycle as Record<string, unknown>;
    if (typeof value.currentId === "string" && value.currentId && isDateKey(value.startedAt)) {
      const targetBuildCycles = typeof value.targetBuildCycles === "number" && Number.isFinite(value.targetBuildCycles)
        ? Math.min(8, Math.max(2, Math.round(value.targetBuildCycles)))
        : 4;
      out.mesocycle = {
        currentId: value.currentId,
        startedAt: value.startedAt,
        index: typeof value.index === "number" && Number.isFinite(value.index) ? Math.max(1, Math.round(value.index)) : 1,
        targetBuildCycles,
        currentBuildCycle: typeof value.currentBuildCycle === "number" && Number.isFinite(value.currentBuildCycle)
          ? Math.min(targetBuildCycles, Math.max(1, Math.round(value.currentBuildCycle)))
          : 1,
      };
    }
  }

  if (obj.lastCycleReview && typeof obj.lastCycleReview === "object") {
    const value = obj.lastCycleReview as Record<string, unknown>;
    const changes = Array.isArray(value.changes)
      ? value.changes.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const change = entry as Record<string, unknown>;
          if (typeof change.templateId !== "string" || !change.templateId || typeof change.exerciseId !== "string" || !change.exerciseId) return [];
          if (typeof change.fromSets !== "number" || typeof change.toSets !== "number" || !Number.isFinite(change.fromSets) || !Number.isFinite(change.toSets)) return [];
          const templateId = change.templateId;
          const fromSets = Math.max(1, Math.round(change.fromSets));
          const toSets = Math.max(1, Math.round(change.toSets));
          return (exerciseIdentity.expandReferenceIds([change.exerciseId]) ?? []).map((exerciseId) => ({
            templateId,
            exerciseId,
            fromSets,
            toSets,
          }));
        })
      : [];
    if (
      typeof value.id === "string" && value.id
      && typeof value.sourceMicrocycleId === "string" && value.sourceMicrocycleId
      && typeof value.appliedAt === "string" && value.appliedAt
      && (value.nextPhase === "build" || value.nextPhase === "deload")
    ) {
      out.lastCycleReview = {
        id: value.id,
        sourceMicrocycleId: value.sourceMicrocycleId,
        appliedAt: value.appliedAt,
        nextPhase: value.nextPhase,
        changes,
      };
    }
  }

  if (obj.onboarding && typeof obj.onboarding === "object") {
    const value = obj.onboarding as Record<string, unknown>;
    const starterPlan = typeof value.starterPlan === "string" && VALID_STARTER_PLANS.has(value.starterPlan as StarterPlanPreset)
      ? value.starterPlan as StarterPlanPreset
      : undefined;
    const completedAt = typeof value.completedAt === "string" && value.completedAt ? value.completedAt : undefined;
    const dismissedAt = typeof value.dismissedAt === "string" && value.dismissedAt ? value.dismissedAt : undefined;
    if (completedAt || dismissedAt || starterPlan) {
      out.onboarding = {
        ...(completedAt ? { completedAt } : {}),
        ...(dismissedAt ? { dismissedAt } : {}),
        ...(starterPlan ? { starterPlan } : {}),
      };
    }
  }

  if (obj.trainingPreferences && typeof obj.trainingPreferences === "object") {
    const value = obj.trainingPreferences as Record<string, unknown>;
    const barbellWeightKg = typeof value.barbellWeightKg === "number" && Number.isFinite(value.barbellWeightKg)
      ? Math.min(50, Math.max(1, Math.round(value.barbellWeightKg * 4) / 4))
      : undefined;
    const plateSizesKg = Array.isArray(value.plateSizesKg)
      ? [...new Set(value.plateSizesKg
          .filter((plate): plate is number => typeof plate === "number" && Number.isFinite(plate) && plate >= 0.25 && plate <= 50)
          .map((plate) => Math.round(plate * 4) / 4))]
          .sort((a, b) => b - a)
          .slice(0, 16)
      : undefined;
    if (barbellWeightKg || plateSizesKg?.length) {
      out.trainingPreferences = {
        ...(barbellWeightKg ? { barbellWeightKg } : {}),
        ...(plateSizesKg?.length ? { plateSizesKg } : {}),
      };
    }
  }
  if (obj.healthSync && typeof obj.healthSync === "object") {
    const value = obj.healthSync as Record<string, unknown>;
    if (value.provider === "appleHealth" && typeof value.lastSyncedAt === "string" && !Number.isNaN(Date.parse(value.lastSyncedAt))) {
      out.healthSync = {
        provider: "appleHealth",
        lastSyncedAt: value.lastSyncedAt,
        ...(isDateKey(value.rangeStart) ? { rangeStart: value.rangeStart } : {}),
        ...(isDateKey(value.rangeEnd) ? { rangeEnd: value.rangeEnd } : {}),
        importedDays: typeof value.importedDays === "number" && Number.isFinite(value.importedDays)
          ? Math.max(0, Math.round(value.importedDays))
          : 0,
        importedWeights: typeof value.importedWeights === "number" && Number.isFinite(value.importedWeights)
          ? Math.max(0, Math.round(value.importedWeights))
          : 0,
      };
    }
  }

  const today = todayKey();
  const workouts = Object.entries(out.days).filter(([, day]) => !!day.workout).sort(([a], [b]) => a.localeCompare(b));
  if (!out.microcycle && workouts.length) {
    const assigned = assignHistoricalMicrocycles(out.days, out.schedule, today, out.templates);
    out.days = assigned.days;
    out.microcycle = assigned.microcycle;
  }
  if (!out.microcycle) out.microcycle = defaultMicrocycle(today, out.schedule, out.templates);
  if (!out.microcycle.steps?.length) {
    out.microcycle = {
      ...out.microcycle,
      steps: defaultMicrocycle(out.microcycle.startedAt, out.schedule, out.templates).steps,
    };
  }
  const templatesById = new Map((out.templates ?? []).map((template) => [template.id, template]));
  const cleanScheduleStep = (step: import("./types").MicrocycleStep) => {
    const template = step.templateId ? templatesById.get(step.templateId) : undefined;
    const { templateSnapshot: _snapshot, ...withoutSnapshot } = step;
    if (!step.templateId || (template && template.type === step.type)) return withoutSnapshot;
    const { templateId: _templateId, ...rest } = withoutSnapshot;
    return rest;
  };
  const cleanActiveStep = (step: import("./types").MicrocycleStep) => {
    if (!step.templateId) {
      const { templateSnapshot: _snapshot, ...rest } = step;
      return rest;
    }
    if (step.templateSnapshot?.id === step.templateId && step.templateSnapshot.type === step.type) return step;
    const template = templatesById.get(step.templateId);
    if (template?.type === step.type) return { ...step, templateSnapshot: parseTemplateSnapshot(templateForCyclePhase(template, out.microcycle?.phase ?? "build")) };
    const { templateId: _templateId, templateSnapshot: _snapshot, ...rest } = step;
    return rest;
  };
  if (out.schedule.microcycle) out.schedule = { ...out.schedule, microcycle: out.schedule.microcycle.map(cleanScheduleStep) };
  if (out.microcycle.steps) out.microcycle = { ...out.microcycle, steps: out.microcycle.steps.map(cleanActiveStep) };
  if (!out.mesocycle) out.mesocycle = defaultMesocycle(out.microcycle.startedAt);
  out.microcycle = ensureMicrocycle(out, today);
  for (const [date, day] of Object.entries(out.days)) {
    if (!day.workout) continue;
    const assignedToCurrentBeforeStart = day.workout.microcycleId === out.microcycle.currentId && date < out.microcycle.startedAt;
    if (!day.workout.microcycleId || assignedToCurrentBeforeStart) {
      const microcycleId = date >= out.microcycle.startedAt ? out.microcycle.currentId : `legacy_mc_${date.replace(/-/g, "")}`;
      day.workout = { ...day.workout, microcycleId };
    }
    if (day.workout.microcycleId === out.microcycle.currentId && date >= out.microcycle.startedAt) {
      day.workout = {
        ...day.workout,
        mesocycleId: day.workout.mesocycleId ?? out.microcycle.mesocycleId,
        mesocycleCycleNumber: day.workout.mesocycleCycleNumber ?? out.microcycle.mesocycleCycleNumber,
        cyclePhase: day.workout.cyclePhase ?? out.microcycle.phase ?? "build",
      };
    }
  }
  return out;
}

export function toBackup(data: AppData): FitLogBackupData {
  const normalized = normalizeData(data);
  return {
    app: "fitlog",
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    days: normalized.days,
    bodyWeights: normalized.bodyWeights,
    waistEntries: normalized.waistEntries,
    cutPlan: normalized.cutPlan,
    customExercises: normalized.customExercises,
    favoriteExerciseIds: normalized.favoriteExerciseIds,
    schedule: normalized.schedule,
    profile: normalized.profile,
    templates: normalized.templates,
    muscleTargets: normalized.muscleTargets,
    microcycle: normalized.microcycle,
    mesocycle: normalized.mesocycle,
    lastCycleReview: normalized.lastCycleReview,
    onboarding: normalized.onboarding,
    trainingPreferences: normalized.trainingPreferences,
    healthSync: normalized.healthSync,
    adaptiveTraining: exportTrainingPolicyBackup(loadTrainingPolicy()),
  };
}

export function serializeBackup(data: AppData): string {
  return JSON.stringify(toBackup(data), null, 2);
}

export function downloadBackup(data: AppData): void {
  const blob = new Blob([serializeBackup(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fitlog-backup-${todayKey()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function remapTrainingPolicyExerciseReferences(
  policy: TrainingPolicy,
  identity: ExerciseIdentityContext,
): TrainingPolicy {
  const preferenceReferences = Object.entries(policy.exercisePreferences)
    .map(([exerciseId, preference]) => ({
      exerciseIds: identity.expandReferenceIds([exerciseId]) ?? [exerciseId],
      preference,
    }))
    .sort((a, b) => b.exerciseIds.length - a.exerciseIds.length);
  const exercisePreferences: TrainingPolicy["exercisePreferences"] = {};
  for (const reference of preferenceReferences) {
    for (const exerciseId of reference.exerciseIds) exercisePreferences[exerciseId] = reference.preference;
  }

  const usedRestrictionIds = new Set<string>();
  const restrictions = policy.restrictions.flatMap((restriction) => {
    if (!restriction.exerciseId) {
      return [{ ...restriction, id: uniqueId(restriction.id, "restriction", usedRestrictionIds) }];
    }
    const exerciseIds = identity.expandReferenceIds([restriction.exerciseId]) ?? [restriction.exerciseId];
    return exerciseIds.map((exerciseId, index) => ({
      ...restriction,
      id: uniqueId(index === 0 ? restriction.id : `${restriction.id}_${index + 1}`, "restriction", usedRestrictionIds),
      exerciseId,
    }));
  }).slice(0, 80);

  const overrides = policy.overrides.map((override) => ({
    ...override,
    ...(override.excludedExerciseIds?.length
      ? { excludedExerciseIds: identity.expandReferenceIds(override.excludedExerciseIds) }
      : {}),
  }));

  const rollbackSnapshot = policy.rollbackSnapshot
    ? {
        ...policy.rollbackSnapshot,
        templates: policy.rollbackSnapshot.templates.map((template) => ({
          ...template,
          items: template.items.map((item) => {
            const exerciseId = identity.resolveReference(item.exerciseId, item.name) ?? item.exerciseId;
            const alternatives = identity.expandReferenceIds(item.alternatives);
            return {
              ...item,
              exerciseId,
              ...(alternatives ? { alternatives } : {}),
            };
          }),
        })),
      }
    : undefined;

  return {
    ...policy,
    exercisePreferences,
    restrictions,
    overrides,
    ...(rollbackSnapshot ? { rollbackSnapshot } : {}),
  };
}

function adaptiveTrainingFromBackup(parsed: Record<string, unknown>): TrainingPolicy | undefined {
  if (!parsed.adaptiveTraining) return undefined;
  const identity = createExerciseIdentityContext(parsed.customExercises);
  return remapTrainingPolicyExerciseReferences(importTrainingPolicyBackup(parsed.adaptiveTraining), identity);
}

export function parseBackup(text: string): AppData {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!parsed || parsed.app !== "fitlog") throw new Error("文件格式不正确：不是 fitlog 备份");
  adaptiveTrainingFromBackup(parsed);
  return normalizeData(parsed);
}

export function parseBackupWithMeta(text: string): {
  data: AppData;
  exportedAt?: string;
  version?: number;
  adaptiveTraining?: TrainingPolicy;
} {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!parsed || parsed.app !== "fitlog") throw new Error("文件格式不正确：不是 fitlog 备份");
  const adaptiveTraining = adaptiveTrainingFromBackup(parsed);
  return {
    data: normalizeData(parsed),
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined,
    version: typeof parsed.version === "number" ? parsed.version : undefined,
    ...(adaptiveTraining ? { adaptiveTraining } : {}),
  };
}
