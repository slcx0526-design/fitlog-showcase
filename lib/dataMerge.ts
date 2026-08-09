import type {
  AppData,
  DayLog,
  Exercise,
  ExercisePreset,
  HealthDailySummary,
  MicrocycleStep,
  RecoveryCheckIn,
  Template,
  TemplateItem,
} from "./types";
import { defaultSchedule, normalizeData, toBackup } from "./storage";
import { dayHasLogContent } from "./trainingHistory";
import { encodeStorageValue } from "./storageCodec";

export interface DataMergeSummary {
  importedDays: number;
  updatedDays: number;
  importedWorkouts: number;
  importedCardio: number;
  importedBodyWeights: number;
  importedWaistEntries: number;
  importedTemplates: number;
  importedCustomExercises: number;
  importedSettings: number;
  conflicts: number;
}

export interface DataFootprint {
  bytes: number;
  kilobytes: number;
  megabytes: number;
  storedBytes: number;
  storedKilobytes: number;
  storedMegabytes: number;
  compressed: boolean;
  status: "normal" | "attention" | "high";
}

export interface StorageReconciliation {
  data: AppData;
  shouldPersist: boolean;
  source: "incoming" | "merged";
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function emptySummary(): DataMergeSummary {
  return {
    importedDays: 0,
    updatedDays: 0,
    importedWorkouts: 0,
    importedCardio: 0,
    importedBodyWeights: 0,
    importedWaistEntries: 0,
    importedTemplates: 0,
    importedCustomExercises: 0,
    importedSettings: 0,
    conflicts: 0,
  };
}

function hasMeaningfulCycleState(data: AppData) {
  const microcycle = data.microcycle;
  const mesocycle = data.mesocycle;
  return Boolean(
    data.lastCycleReview
      || (microcycle && (
        microcycle.index > 1
        || microcycle.phase === "deload"
        || Boolean(microcycle.sourceReviewId)
        || (microcycle.mesocycleCycleNumber ?? 1) > 1
      ))
      || (mesocycle && (
        mesocycle.index > 1
        || mesocycle.currentBuildCycle > 1
        || mesocycle.targetBuildCycles !== 4
      ))
  );
}

function isEmptyWorkspace(data: AppData) {
  return Object.keys(data.days).length === 0
    && !data.bodyWeights.length
    && !data.waistEntries.length
    && !(data.templates?.length)
    && !data.customExercises.length
    && !(data.favoriteExerciseIds?.length)
    && !data.profile
    && !data.cutPlan
    && !data.muscleTargets
    && !data.onboarding
    && !data.trainingPreferences
    && !data.healthSync
    && !hasMeaningfulCycleState(data)
    && same(data.schedule, defaultSchedule());
}

function mergeOptionalField<K extends keyof DayLog>(
  current: DayLog,
  incoming: DayLog,
  key: K,
  summary: DataMergeSummary,
) {
  const currentValue = current[key];
  const incomingValue = incoming[key];
  if (currentValue == null && incomingValue != null) {
    return { ...current, [key]: incomingValue };
  }
  if (currentValue != null && incomingValue != null && !same(currentValue, incomingValue)) {
    summary.conflicts += 1;
  }
  return current;
}

function mergeEntriesById<T extends { id: string }>(
  current: T[] | undefined,
  incoming: T[] | undefined,
  summary: DataMergeSummary,
) {
  const result = [...(current ?? [])];
  const byId = new Map(result.map((entry) => [entry.id, entry]));
  let imported = 0;
  for (const entry of incoming ?? []) {
    const existing = byId.get(entry.id);
    if (!existing) {
      result.push(entry);
      byId.set(entry.id, entry);
      imported += 1;
    } else if (!same(existing, entry)) {
      summary.conflicts += 1;
    }
  }
  return { entries: result, imported };
}

function mergeRecovery(
  current: RecoveryCheckIn | undefined,
  incoming: RecoveryCheckIn | undefined,
  summary: DataMergeSummary,
) {
  if (!incoming) return current;
  if (!current) return incoming;
  const next = { ...current };
  const fields: (keyof Omit<RecoveryCheckIn, "at">)[] = [
    "sleepHours",
    "sleepQuality",
    "energy",
    "soreness",
    "stress",
  ];
  for (const field of fields) {
    if (next[field] == null && incoming[field] != null) {
      (next as Record<string, unknown>)[field] = incoming[field];
    }
    else if (incoming[field] != null && !same(next[field], incoming[field])) summary.conflicts += 1;
  }
  if (!next.at && incoming.at) next.at = incoming.at;
  return next;
}

function mergeHealth(
  current: HealthDailySummary | undefined,
  incoming: HealthDailySummary | undefined,
  summary: DataMergeSummary,
) {
  if (!incoming) return current;
  if (!current) return incoming;
  const next = { ...current };
  const fields: (keyof Omit<HealthDailySummary, "source" | "updatedAt">)[] = [
    "steps",
    "activeEnergyKcal",
    "exerciseMinutes",
    "restingHeartRate",
    "heartRateVariabilityMs",
    "sleepMinutes",
  ];
  for (const field of fields) {
    if (next[field] == null && incoming[field] != null) next[field] = incoming[field];
    else if (incoming[field] != null && !same(next[field], incoming[field])) summary.conflicts += 1;
  }
  if (Date.parse(incoming.updatedAt) > Date.parse(next.updatedAt)) next.updatedAt = incoming.updatedAt;
  return next;
}

function mergeDay(current: DayLog, incoming: DayLog, summary: DataMergeSummary) {
  let next = current;
  const workoutMissing = !current.workout && Boolean(incoming.workout);
  next = mergeOptionalField(next, incoming, "workout", summary);
  if (workoutMissing) summary.importedWorkouts += 1;
  next = mergeOptionalField(next, incoming, "nutrition", summary);
  const recovery = mergeRecovery(current.recovery, incoming.recovery, summary);
  if (!same(recovery, current.recovery)) next = { ...next, recovery };
  const health = mergeHealth(current.health, incoming.health, summary);
  if (!same(health, current.health)) next = { ...next, health };
  const cardio = mergeEntriesById(current.cardio, incoming.cardio, summary);
  if (cardio.imported) {
    summary.importedCardio += cardio.imported;
    next = { ...next, cardio: cardio.entries };
  }
  const energy = mergeEntriesById(current.activityEnergy, incoming.activityEnergy, summary);
  if (energy.imported) next = { ...next, activityEnergy: energy.entries };
  return next;
}

function mergeDateEntries<T extends { date: string }>(
  current: T[],
  incoming: T[],
  summary: DataMergeSummary,
  counter: "importedBodyWeights" | "importedWaistEntries",
) {
  const result = [...current];
  const byDate = new Map(result.map((entry) => [entry.date, entry]));
  for (const entry of incoming) {
    const existing = byDate.get(entry.date);
    if (!existing) {
      result.push(entry);
      byDate.set(entry.date, entry);
      summary[counter] += 1;
    } else if (!same(existing, entry)) {
      summary.conflicts += 1;
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

function mergeById<T extends { id: string }>(
  current: T[],
  incoming: T[],
  summary: DataMergeSummary,
  counter: "importedTemplates" | "importedCustomExercises",
) {
  const result = [...current];
  const byId = new Map(result.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    if (!existing) {
      result.push(entry);
      byId.set(entry.id, entry);
      summary[counter] += 1;
    } else if (!same(existing, entry)) {
      summary.conflicts += 1;
    }
  }
  return result;
}

function mergeObject<T extends object>(
  current: T | undefined,
  incoming: T | undefined,
  summary: DataMergeSummary,
) {
  if (!incoming) return current;
  if (!current) {
    summary.importedSettings += Object.keys(incoming).length;
    return incoming;
  }
  const result = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(incoming)) {
    if (result[key] == null) {
      result[key] = value;
      summary.importedSettings += 1;
    } else if (!same(result[key], value)) {
      summary.conflicts += 1;
    }
  }
  return result as T;
}

function identityText(value: string | undefined) {
  return value?.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function customIdentityKey(exercise: ExercisePreset) {
  return JSON.stringify({
    name: identityText(exercise.name),
    englishName: identityText(exercise.englishName),
    primaryMuscle: exercise.primaryMuscle,
    equipment: exercise.equipment,
    movementPattern: exercise.movementPattern,
  });
}

function templateIdentityKey(template: Template) {
  return `${template.type}:${identityText(template.name)}`;
}

function uniqueMergedId(base: string, used: Set<string>) {
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  const id = `${base}_${index}`;
  used.add(id);
  return id;
}

function remappedId(id: string | undefined, renames: Map<string, string>) {
  return id ? renames.get(id) ?? id : undefined;
}

function remapTemplateItem(item: TemplateItem, exerciseRenames: Map<string, string>): TemplateItem {
  return {
    ...item,
    exerciseId: remappedId(item.exerciseId, exerciseRenames) ?? item.exerciseId,
    ...(item.alternatives
      ? { alternatives: item.alternatives.map((id) => remappedId(id, exerciseRenames) ?? id) }
      : {}),
  };
}

function remapTemplate(
  template: Template,
  exerciseRenames: Map<string, string>,
  templateRenames: Map<string, string>,
): Template {
  return {
    ...template,
    id: remappedId(template.id, templateRenames) ?? template.id,
    items: template.items.map((item) => remapTemplateItem(item, exerciseRenames)),
  };
}

function remapExercise(exercise: Exercise, exerciseRenames: Map<string, string>): Exercise {
  return {
    ...exercise,
    id: remappedId(exercise.id, exerciseRenames) ?? exercise.id,
    ...(exercise.alternatives
      ? { alternatives: exercise.alternatives.map((id) => remappedId(id, exerciseRenames) ?? id) }
      : {}),
  };
}

function remapMicrocycleStep(
  step: MicrocycleStep,
  exerciseRenames: Map<string, string>,
  templateRenames: Map<string, string>,
): MicrocycleStep {
  return {
    ...step,
    ...(step.templateId
      ? { templateId: remappedId(step.templateId, templateRenames) ?? step.templateId }
      : {}),
    ...(step.templateSnapshot
      ? { templateSnapshot: remapTemplate(step.templateSnapshot, exerciseRenames, templateRenames) }
      : {}),
  };
}

function remapIncomingIdentityCollisions(current: AppData, incoming: AppData) {
  const exerciseRenames = new Map<string, string>();
  const usedExerciseIds = new Set([
    ...current.customExercises.map((exercise) => exercise.id),
    ...incoming.customExercises.map((exercise) => exercise.id),
  ]);
  const currentCustomById = new Map(current.customExercises.map((exercise) => [exercise.id, exercise]));
  for (const exercise of incoming.customExercises) {
    const sameId = currentCustomById.get(exercise.id);
    if (!sameId || customIdentityKey(sameId) === customIdentityKey(exercise)) continue;
    const semanticMatches = current.customExercises.filter((candidate) => customIdentityKey(candidate) === customIdentityKey(exercise));
    exerciseRenames.set(
      exercise.id,
      semanticMatches.length === 1 ? semanticMatches[0].id : uniqueMergedId(exercise.id, usedExerciseIds),
    );
  }

  const templateRenames = new Map<string, string>();
  const currentTemplates = current.templates ?? [];
  const incomingTemplates = incoming.templates ?? [];
  const usedTemplateIds = new Set([
    ...currentTemplates.map((template) => template.id),
    ...incomingTemplates.map((template) => template.id),
  ]);
  const currentTemplateById = new Map(currentTemplates.map((template) => [template.id, template]));
  for (const template of incomingTemplates) {
    const sameId = currentTemplateById.get(template.id);
    if (!sameId || templateIdentityKey(sameId) === templateIdentityKey(template)) continue;
    const semanticMatches = currentTemplates.filter((candidate) => templateIdentityKey(candidate) === templateIdentityKey(template));
    templateRenames.set(
      template.id,
      semanticMatches.length === 1 ? semanticMatches[0].id : uniqueMergedId(template.id, usedTemplateIds),
    );
  }

  if (!exerciseRenames.size && !templateRenames.size) return incoming;
  const templates = incomingTemplates.map((template) => remapTemplate(template, exerciseRenames, templateRenames));
  const customExercises = incoming.customExercises.map((exercise) => ({
    ...exercise,
    id: remappedId(exercise.id, exerciseRenames) ?? exercise.id,
    ...(exercise.alternatives
      ? { alternatives: exercise.alternatives.map((id) => remappedId(id, exerciseRenames) ?? id) }
      : {}),
  }));
  const days = Object.fromEntries(Object.entries(incoming.days).map(([date, day]) => {
    if (!day.workout) return [date, day];
    const workout = day.workout;
    return [date, {
      ...day,
      workout: {
        ...workout,
        ...(workout.templateId
          ? { templateId: remappedId(workout.templateId, templateRenames) ?? workout.templateId }
          : {}),
        ...(workout.templateSnapshot
          ? { templateSnapshot: remapTemplate(workout.templateSnapshot, exerciseRenames, templateRenames) }
          : {}),
        exercises: workout.exercises.map((exercise) => remapExercise(exercise, exerciseRenames)),
      },
    }];
  }));
  const trainingTemplateIds = incoming.cutPlan?.trainingTemplateIds
    ? Object.fromEntries(Object.entries(incoming.cutPlan.trainingTemplateIds).map(([type, id]) => [
        type,
        remappedId(id, templateRenames) ?? id,
      ])) as NonNullable<NonNullable<AppData["cutPlan"]>["trainingTemplateIds"]>
    : undefined;
  return normalizeData({
    ...incoming,
    days,
    customExercises,
    favoriteExerciseIds: incoming.favoriteExerciseIds?.map((id) => remappedId(id, exerciseRenames) ?? id),
    templates: templates.length ? templates : undefined,
    schedule: incoming.schedule.microcycle
      ? {
          ...incoming.schedule,
          microcycle: incoming.schedule.microcycle.map((step) => remapMicrocycleStep(step, exerciseRenames, templateRenames)),
        }
      : incoming.schedule,
    cutPlan: incoming.cutPlan
      ? { ...incoming.cutPlan, ...(trainingTemplateIds ? { trainingTemplateIds } : {}) }
      : undefined,
    microcycle: incoming.microcycle?.steps
      ? {
          ...incoming.microcycle,
          steps: incoming.microcycle.steps.map((step) => remapMicrocycleStep(step, exerciseRenames, templateRenames)),
        }
      : incoming.microcycle,
    lastCycleReview: incoming.lastCycleReview
      ? {
          ...incoming.lastCycleReview,
          changes: incoming.lastCycleReview.changes.map((change) => ({
            ...change,
            templateId: remappedId(change.templateId, templateRenames) ?? change.templateId,
            exerciseId: remappedId(change.exerciseId, exerciseRenames) ?? change.exerciseId,
          })),
        }
      : undefined,
  });
}

export function mergeAppData(currentInput: AppData, incomingInput: AppData) {
  const currentWasEmpty = isEmptyWorkspace(currentInput);
  const current = normalizeData(currentInput);
  const incoming = remapIncomingIdentityCollisions(current, normalizeData(incomingInput));
  const summary = emptySummary();

  if (currentWasEmpty) {
    const imported = normalizeData({ ...incoming, lastBackupAt: currentInput.lastBackupAt });
    summary.importedDays = Object.values(imported.days).filter((day) => dayHasLogContent(day) || Boolean(day.health)).length;
    summary.importedWorkouts = Object.values(imported.days).filter((day) => Boolean(day.workout)).length;
    summary.importedCardio = Object.values(imported.days).reduce((sum, day) => sum + (day.cardio?.length ?? 0), 0);
    summary.importedBodyWeights = imported.bodyWeights.length;
    summary.importedWaistEntries = imported.waistEntries.length;
    summary.importedTemplates = imported.templates?.length ?? 0;
    summary.importedCustomExercises = imported.customExercises.length;
    summary.importedSettings = (imported.favoriteExerciseIds?.length ?? 0)
      + Object.keys(imported.profile ?? {}).length
      + Object.keys(imported.cutPlan ?? {}).length
      + Object.keys(imported.muscleTargets ?? {}).length
      + Object.keys(imported.trainingPreferences ?? {}).length
      + Object.keys(imported.onboarding ?? {}).length
      + Object.keys(imported.healthSync ?? {}).length
      + (same(imported.schedule, defaultSchedule()) ? 0 : 1)
      + (imported.microcycle ? 1 : 0)
      + (imported.mesocycle ? 1 : 0)
      + (imported.lastCycleReview ? 1 : 0);
    return { data: imported, summary };
  }

  const days: Record<string, DayLog> = { ...current.days };
  for (const [date, incomingDay] of Object.entries(incoming.days)) {
    const currentDay = days[date];
    if (!currentDay) {
      days[date] = incomingDay;
      summary.importedDays += 1;
      if (incomingDay.workout) summary.importedWorkouts += 1;
      summary.importedCardio += incomingDay.cardio?.length ?? 0;
      continue;
    }
    const merged = mergeDay(currentDay, incomingDay, summary);
    if (!same(merged, currentDay)) {
      days[date] = merged;
      summary.updatedDays += 1;
    }
  }

  const templates = mergeById(current.templates ?? [], incoming.templates ?? [], summary, "importedTemplates");
  const customExercises = mergeById(current.customExercises, incoming.customExercises, summary, "importedCustomExercises");
  const currentFavorites = new Set(current.favoriteExerciseIds ?? []);
  const favoriteExerciseIds = [...new Set([...(current.favoriteExerciseIds ?? []), ...(incoming.favoriteExerciseIds ?? [])])];
  summary.importedSettings += favoriteExerciseIds.filter((id) => !currentFavorites.has(id)).length;
  if (!same(current.schedule, incoming.schedule)) summary.conflicts += 1;
  if (current.microcycle && incoming.microcycle && !same(current.microcycle, incoming.microcycle)) summary.conflicts += 1;
  if (current.mesocycle && incoming.mesocycle && !same(current.mesocycle, incoming.mesocycle)) summary.conflicts += 1;
  if (current.lastCycleReview && incoming.lastCycleReview && !same(current.lastCycleReview, incoming.lastCycleReview)) summary.conflicts += 1;

  const data = normalizeData({
    ...current,
    days,
    bodyWeights: mergeDateEntries(current.bodyWeights, incoming.bodyWeights, summary, "importedBodyWeights"),
    waistEntries: mergeDateEntries(current.waistEntries, incoming.waistEntries, summary, "importedWaistEntries"),
    templates: templates.length ? templates : undefined,
    customExercises,
    favoriteExerciseIds,
    profile: mergeObject(current.profile, incoming.profile, summary),
    cutPlan: mergeObject(current.cutPlan, incoming.cutPlan, summary),
    muscleTargets: mergeObject(current.muscleTargets, incoming.muscleTargets, summary),
    trainingPreferences: mergeObject(current.trainingPreferences, incoming.trainingPreferences, summary),
    onboarding: mergeObject(current.onboarding, incoming.onboarding, summary),
    healthSync: mergeObject(current.healthSync, incoming.healthSync, summary),
    schedule: current.schedule,
    microcycle: current.microcycle ?? incoming.microcycle,
    mesocycle: current.mesocycle ?? incoming.mesocycle,
    lastCycleReview: current.lastCycleReview ?? incoming.lastCycleReview,
  });
  return { data, summary };
}

/**
 * Reconciles a storage event against the value it replaced. Incoming storage
 * wins true conflicts, while independent local edits are retained and written
 * back so all open tabs converge on the same dataset.
 */
export function reconcileStorageEvent(
  currentInput: AppData,
  previousStoredInput: AppData,
  incomingStoredInput: AppData,
): StorageReconciliation {
  const current = normalizeData(currentInput);
  const previousStored = normalizeData(previousStoredInput);
  const incomingStored = normalizeData(incomingStoredInput);
  if (same(current, previousStored)) {
    return { data: incomingStored, shouldPersist: false, source: "incoming" };
  }

  const merged = mergeAppData(incomingStored, current).data;
  const localBackupAt = current.lastBackupAt;
  if (localBackupAt && (!merged.lastBackupAt || Date.parse(localBackupAt) > Date.parse(merged.lastBackupAt))) {
    merged.lastBackupAt = localBackupAt;
  }
  return {
    data: merged,
    shouldPersist: !same(merged, incomingStored),
    source: "merged",
  };
}

export function estimateDataFootprint(data: AppData): DataFootprint {
  const json = JSON.stringify(toBackup(data), null, 2);
  const bytes = typeof TextEncoder === "undefined" ? json.length * 2 : new TextEncoder().encode(json).length;
  const megabytes = bytes / (1024 * 1024);
  const stored = encodeStorageValue(data);
  const storedMegabytes = stored.storedBytes / (1024 * 1024);
  return {
    bytes,
    kilobytes: Math.round(bytes / 1024),
    megabytes: Math.round(megabytes * 100) / 100,
    storedBytes: stored.storedBytes,
    storedKilobytes: Math.round(stored.storedBytes / 1024),
    storedMegabytes: Math.round(storedMegabytes * 100) / 100,
    compressed: stored.compressed,
    status: storedMegabytes >= 4 ? "high" : storedMegabytes >= 2.5 ? "attention" : "normal",
  };
}
