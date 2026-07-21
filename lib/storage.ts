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
  Template,
  TemplateItem,
  TemplateSlot,
  TrainingType,
  WaistEntry,
  Zone,
} from "./types";
import { fromKey, todayKey, toKey } from "./date";
import { assignHistoricalMicrocycles, defaultMesocycle, defaultMicrocycle, ensureMicrocycle, templateForCyclePhase } from "./microcycle";
import { MUSCLE_ORDER, type MuscleGroup } from "./muscles";
import type { Equipment } from "./muscles";
import { DEFAULT_EXERCISES } from "./exercises";
import { normalizeExercisePrescription, normalizeTemplateItemPrescription } from "./prescription";
import { hasSetPerformance } from "./trainingMetrics";

export type { AppData } from "./types";

const KEY = "fitlog:v1";
const LEGACY_FAVORITES_KEY = "fitlog:favoriteExercises";
export const SCHEMA_VERSION = 14;

const VALID_TYPES: TrainingType[] = ["push", "pull", "legs", "rest", "custom"];
const VALID_MUSCLES = new Set<string>(MUSCLE_ORDER);
const VALID_TECHNIQUES = new Set(["normal", "dropSet", "restPause", "myoReps", "cluster", "technique", "rehab"]);
const VALID_COMPLETIONS = new Set(["completed", "partial", "skipped"]);
const VALID_RECORD_MODES = new Set<RecordMode>(["weight", "reps", "rir", "duration", "distance"]);
const VALID_EQUIPMENT = new Set<Equipment>(["free", "machine", "cable", "bodyweight"]);
const VALID_PATTERNS = new Set<MovementPattern>([
  "horizontalPush", "inclinePush", "verticalPush", "fly", "verticalPull", "horizontalPull",
  "hipHinge", "squat", "lunge", "kneeExtension", "kneeFlexion", "armCurl", "armExtension",
  "lateralRaise", "rearDelt", "calfRaise", "core", "carry", "custom",
]);
const VALID_SUGGESTION_STATUSES = new Set([
  "addWeight", "addReps", "stabilize", "effortCheck", "finishSets", "noHistory",
  "modeReference", "manualProgression", "mixedLoads", "missingLoad", "unconfirmedHistory",
]);

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
  if (typeof value.progressionTrackId !== "string" || !value.progressionTrackId) return undefined;
  if (value.trainingIntent !== "strength" && value.trainingIntent !== "hypertrophy" && value.trainingIntent !== "endurance" && value.trainingIntent !== "custom") return undefined;
  const min = typeof value.targetRepMin === "number" ? Math.max(1, Math.round(value.targetRepMin)) : 8;
  const max = typeof value.targetRepMax === "number" ? Math.max(min, Math.round(value.targetRepMax)) : 12;
  return {
    progressionTrackId: value.progressionTrackId,
    progressionTrackLabel: typeof value.progressionTrackLabel === "string" ? value.progressionTrackLabel : "训练轨道",
    trainingIntent: value.trainingIntent,
    targetRepMin: min,
    targetRepMax: max,
    ...(typeof value.targetRirMin === "number" ? { targetRirMin: value.targetRirMin } : {}),
    ...(typeof value.targetRirMax === "number" ? { targetRirMax: value.targetRirMax } : {}),
    workingSets: typeof value.workingSets === "number" ? Math.max(1, Math.round(value.workingSets)) : 3,
    loadIncrementKg: typeof value.loadIncrementKg === "number" ? Math.max(0, value.loadIncrementKg) : 2.5,
    progressionRule: value.progressionRule === "repsFirst" || value.progressionRule === "custom" ? value.progressionRule : "doubleProgression",
    ...(value.performanceMode === "duration" || value.performanceMode === "distance" || value.performanceMode === "reps" ? { performanceMode: value.performanceMode } : {}),
  };
}

function parseProgressionPlan(input: unknown, plannedLoadKg?: number): ProgressionPlanSnapshot | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (value.origin !== "suggestion" && value.origin !== "reference" && value.origin !== "manual") return undefined;
  if (typeof value.progressionTrackId !== "string" || !value.progressionTrackId) return undefined;
  if (typeof value.acceptedAt !== "string" || !value.acceptedAt) return undefined;
  if (typeof value.plannedLoadKg !== "number" || !Number.isFinite(value.plannedLoadKg) || value.plannedLoadKg <= 0) return undefined;
  const load = Math.round(value.plannedLoadKg * 100) / 100;
  if (plannedLoadKg != null && Math.abs(plannedLoadKg - load) > 0.05) return undefined;
  return {
    origin: value.origin,
    acceptedAt: value.acceptedAt,
    progressionTrackId: value.progressionTrackId,
    plannedLoadKg: load,
    ...(isDateKey(value.sourceDate) ? { sourceDate: value.sourceDate } : {}),
    ...(typeof value.suggestedLoadKg === "number" && Number.isFinite(value.suggestedLoadKg) && value.suggestedLoadKg > 0
      ? { suggestedLoadKg: Math.round(value.suggestedLoadKg * 100) / 100 }
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
  const durationSeconds = typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds) && value.durationSeconds >= 0 ? Math.round(value.durationSeconds) : undefined;
  const distanceMeters = typeof value.distanceMeters === "number" && Number.isFinite(value.distanceMeters) && value.distanceMeters >= 0 ? Math.round(value.distanceMeters * 100) / 100 : undefined;
  if ((!validWeight || !validReps) && durationSeconds == null && distanceMeters == null) return null;
  const set: SetRecord = {
    weight: validWeight ? Math.max(0, Math.round((value.weight as number) * 100) / 100) : 0,
    reps: validReps ? Math.max(0, Math.round(value.reps as number)) : 0,
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
  const value = input as ExercisePreset;
  if (typeof value.id !== "string" || typeof value.name !== "string" || !value.name.trim()) return null;
  const primaryMuscle = VALID_MUSCLES.has(value.primaryMuscle ?? "") ? value.primaryMuscle as MuscleGroup : undefined;
  const configuredContributions = value.volumeContributions?.length
    ? value.volumeContributions
    : (value.secondaryMuscles ?? []).map((muscle) => ({ muscle, weight: 0.5, direct: false }));
  const secondary = configuredContributions
    .filter((item) => item && VALID_MUSCLES.has(item.muscle) && item.muscle !== primaryMuscle && typeof item.weight === "number" && Number.isFinite(item.weight))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.muscle === item.muscle) === index)
    .map((item) => ({ muscle: item.muscle, weight: Math.min(1, Math.max(0.1, Math.round(item.weight * 100) / 100)), direct: Boolean(item.direct) }));
  const volumeContributions = primaryMuscle
    ? [{ muscle: primaryMuscle, weight: 1, direct: true }, ...secondary]
    : secondary;
  const recordModes = parseRecordModes(value.recordModes);
  return {
    ...value,
    id: value.id,
    name: value.name.trim(),
    isMain: Boolean(value.isMain),
    type: "custom",
    custom: true,
    ...(primaryMuscle ? { primaryMuscle } : { primaryMuscle: undefined }),
    secondaryMuscles: secondary.map((item) => item.muscle),
    volumeContributions,
    recordModes,
  };
}

export function defaultSchedule(): Schedule { return { split: ["push", "pull", "legs", "rest", "push", "pull", "rest"] }; }
export function emptyData(): AppData { return { days: {}, bodyWeights: [], waistEntries: [], customExercises: [], schedule: defaultSchedule() }; }

export function loadData(): AppData {
  if (typeof window === "undefined") return emptyData();
  try {
    const raw = window.localStorage.getItem(KEY);
    const data = raw ? normalizeData(JSON.parse(raw)) : emptyData();
    let legacyFavorites: string[] = [];
    try {
      legacyFavorites = parseStringList(JSON.parse(window.localStorage.getItem(LEGACY_FAVORITES_KEY) ?? "[]")) ?? [];
    } catch {
      legacyFavorites = [];
    }
    if (legacyFavorites.length) data.favoriteExerciseIds = [...new Set([...(data.favoriteExerciseIds ?? []), ...legacyFavorites])];
    return data;
  } catch { return emptyData(); }
}

export function saveData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    window.localStorage.removeItem(LEGACY_FAVORITES_KEY);
  }
  catch (error) { console.warn("保存失败：", error); }
}

export function normalizeData(input: unknown): AppData {
  const out = emptyData();
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;

  const favoriteExerciseIds = parseStringList(obj.favoriteExerciseIds);
  if (favoriteExerciseIds?.length) out.favoriteExerciseIds = favoriteExerciseIds;

  if (obj.days && typeof obj.days === "object") {
    for (const [date, rawDay] of Object.entries(obj.days as Record<string, unknown>)) {
      if (!isDateKey(date) || !rawDay || typeof rawDay !== "object") continue;
      const day = rawDay as DayLog;
      const next: DayLog = { date };
      if (day.workout && typeof day.workout === "object") {
        const workout = day.workout;
        const exercises = Array.isArray(workout.exercises)
          ? workout.exercises.map((rawExercise) => {
              const exercise = rawExercise as Exercise;
              const sets = Array.isArray(exercise.sets) ? exercise.sets.map(parseSet).filter((set): set is SetRecord => !!set) : [];
              const recordModes = parseRecordModes(exercise.recordModes);
              const prescription = parsePrescription(exercise.prescription);
              const plannedLoadKg = typeof exercise.plannedLoadKg === "number" && Number.isFinite(exercise.plannedLoadKg) && exercise.plannedLoadKg > 0
                ? Math.round(exercise.plannedLoadKg * 100) / 100
                : undefined;
              const progressionPlan = parseProgressionPlan(exercise.progressionPlan, plannedLoadKg);
              return normalizeExercisePrescription({ ...exercise, sets, recordModes, prescription, plannedLoadKg, progressionPlan });
            })
          : [];
        const parsedType = VALID_TYPES.includes(workout.type) ? workout.type : "custom";
        const type = parsedType === "rest" && exercises.some((exercise) => exercise.sets.some(hasSetPerformance))
          ? "custom"
          : parsedType;
        next.workout = {
          type,
          ...(typeof workout.templateId === "string" ? { templateId: workout.templateId } : {}),
          ...(typeof workout.microcycleId === "string" ? { microcycleId: workout.microcycleId } : {}),
          ...(typeof workout.microcycleStepId === "string" ? { microcycleStepId: workout.microcycleStepId } : {}),
          ...(typeof workout.done === "boolean" ? { done: workout.done } : {}),
          ...(workout.difficulty === "easy" || workout.difficulty === "onTarget" || workout.difficulty === "hard" ? { difficulty: workout.difficulty } : {}),
          ...(workout.done !== false && typeof workout.completedAt === "string" ? { completedAt: workout.completedAt } : {}),
          ...(typeof workout.mesocycleId === "string" && workout.mesocycleId ? { mesocycleId: workout.mesocycleId } : {}),
          ...(typeof workout.mesocycleCycleNumber === "number" && Number.isFinite(workout.mesocycleCycleNumber) ? { mesocycleCycleNumber: Math.max(1, Math.round(workout.mesocycleCycleNumber)) } : {}),
          ...(workout.cyclePhase === "build" || workout.cyclePhase === "deload" ? { cyclePhase: workout.cyclePhase } : {}),
          exercises,
        };
      }
      const nutrition = parseNutrition(day.nutrition);
      if (nutrition) next.nutrition = nutrition;
      const recovery = parseRecovery(day.recovery);
      if (recovery) next.recovery = recovery;
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
    out.bodyWeights = uniqueByDate((obj.bodyWeights as BodyWeightEntry[]).filter((entry) => entry && isDateKey(entry.date) && typeof entry.weight === "number" && Number.isFinite(entry.weight) && entry.weight >= 30 && entry.weight <= 300));
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

  if (Array.isArray(obj.customExercises)) {
    const usedExerciseIds = new Set(DEFAULT_EXERCISES.map((exercise) => exercise.id));
    out.customExercises = obj.customExercises
      .map(parseCustomExercise)
      .filter((entry): entry is ExercisePreset => Boolean(entry))
      .map((entry) => ({ ...entry, id: uniqueId(entry.id, "cx_imported", usedExerciseIds) }));
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

  const presetById = new Map(
    [...DEFAULT_EXERCISES, ...out.customExercises].map((preset) => [preset.id, preset])
  );
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
        recordModes: exercise.recordModes,
      });
    }
  }
  const parseItem = (input: unknown): TemplateItem | null => {
    if (!input || typeof input !== "object") return null;
    const value = input as Record<string, unknown>;
    if (typeof value.exerciseId !== "string" || !value.exerciseId) return null;
    const recordModes = parseRecordModes(value.recordModes);
    const primaryMuscle = parseMuscle(value.primaryMuscle);
    const secondaryMuscles = parseMuscleList(value.secondaryMuscles, primaryMuscle);
    const volumeContributions = parseVolumeContributions(value.volumeContributions);
    const equipment = typeof value.equipment === "string" && VALID_EQUIPMENT.has(value.equipment as Equipment) ? value.equipment as Equipment : undefined;
    const movementPattern = typeof value.movementPattern === "string" && VALID_PATTERNS.has(value.movementPattern as MovementPattern) ? value.movementPattern as MovementPattern : undefined;
    const alternatives = parseStringList(value.alternatives);
    const prescription = parsePrescription(value.prescription);
    const performanceMode = prescription?.performanceMode ?? (recordModes?.includes("duration") ? "duration" : recordModes?.includes("distance") ? "distance" : "reps");
    let low = 8;
    let high = 12;
    if (typeof value.repsLow === "number" && typeof value.repsHigh === "number") { low = value.repsLow; high = value.repsHigh; }
    else if (typeof value.reps === "string") {
      const range = value.reps.match(/(\d+)\s*[-–~]\s*(\d+)/);
      const single = parseInt(value.reps, 10);
      low = range ? Number(range[1]) : Number.isFinite(single) ? single : 8;
      high = range ? Number(range[2]) : Number.isFinite(single) ? single : 12;
    }
    const targetMax = performanceMode === "duration" ? 3_600 : performanceMode === "distance" ? 100_000 : 40;
    low = Math.min(targetMax, Math.max(1, Math.round(low)));
    high = Math.min(targetMax, Math.max(low, Math.round(high)));
    const item: TemplateItem = {
      exerciseId: value.exerciseId,
      name: typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : presetById.get(value.exerciseId)?.name ?? "动作",
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
      ...(prescription ? { prescription } : {}),
      ...(typeof value.progressionTrackId === "string" ? { progressionTrackId: value.progressionTrackId } : {}),
      ...(typeof value.progressionTrackLabel === "string" ? { progressionTrackLabel: value.progressionTrackLabel } : {}),
      ...(value.trainingIntent === "strength" || value.trainingIntent === "hypertrophy" || value.trainingIntent === "endurance" || value.trainingIntent === "custom" ? { trainingIntent: value.trainingIntent } : {}),
      ...(typeof value.targetRirMin === "number" ? { targetRirMin: value.targetRirMin } : {}),
      ...(typeof value.targetRirMax === "number" ? { targetRirMax: value.targetRirMax } : {}),
      ...(typeof value.loadIncrementKg === "number" ? { loadIncrementKg: Math.max(0, value.loadIncrementKg) } : {}),
      ...(value.progressionRule === "doubleProgression" || value.progressionRule === "repsFirst" || value.progressionRule === "custom" ? { progressionRule: value.progressionRule } : {}),
      ...(recordModes ? { recordModes } : {}),
    };
    return normalizeTemplateItemPrescription(item, presetById.get(item.exerciseId));
  };

  const parseTemplateSnapshot = (input: unknown): Template | undefined => {
    if (!input || typeof input !== "object") return undefined;
    const value = input as Record<string, unknown>;
    if (value.type !== "push" && value.type !== "pull" && value.type !== "legs") return undefined;
    if (typeof value.id !== "string" || !value.id) return undefined;
    return {
      id: value.id,
      name: typeof value.name === "string" ? value.name : "",
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
      const candidate = typeof value.id === "string" && value.id
        ? value.id
        : `tpl_imported_${templates.length + 1}`;
      templates.push({ id: uniqueId(candidate, "tpl_imported", usedTemplateIds), name: typeof value.name === "string" ? value.name : "", type: value.type, items: Array.isArray(value.items) ? value.items.map(parseItem).filter((item): item is TemplateItem => !!item) : [] });
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
      if (typeof target.low !== "number" || typeof target.high !== "number") continue;
      targets[muscle as keyof typeof targets] = { low: Math.max(0, Math.round(target.low)), high: Math.max(Math.round(target.low), Math.round(target.high)) };
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
        index: typeof value.index === "number" ? Math.max(1, Math.round(value.index)) : 1,
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
          return [{
            templateId: change.templateId,
            exerciseId: change.exerciseId,
            fromSets: Math.max(1, Math.round(change.fromSets)),
            toSets: Math.max(1, Math.round(change.toSets)),
          }];
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

export function toBackup(data: AppData): BackupData {
  const normalized = normalizeData(data);
  return { app: "fitlog", version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), days: normalized.days, bodyWeights: normalized.bodyWeights, waistEntries: normalized.waistEntries, cutPlan: normalized.cutPlan, customExercises: normalized.customExercises, favoriteExerciseIds: normalized.favoriteExerciseIds, schedule: normalized.schedule, profile: normalized.profile, templates: normalized.templates, muscleTargets: normalized.muscleTargets, microcycle: normalized.microcycle, mesocycle: normalized.mesocycle, lastCycleReview: normalized.lastCycleReview };
}

export function downloadBackup(data: AppData): void {
  const blob = new Blob([JSON.stringify(toBackup(data), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fitlog-backup-${todayKey()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseBackup(text: string): AppData {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.app !== "fitlog") throw new Error("文件格式不正确：不是 fitlog 备份");
  return normalizeData(parsed);
}

export function parseBackupWithMeta(text: string): { data: AppData; exportedAt?: string; version?: number } {
  const parsed = JSON.parse(text) as { app?: unknown; exportedAt?: unknown; version?: unknown };
  if (!parsed || parsed.app !== "fitlog") throw new Error("文件格式不正确：不是 fitlog 备份");
  return { data: normalizeData(parsed), exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined, version: typeof parsed.version === "number" ? parsed.version : undefined };
}
