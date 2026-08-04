import type { AppData, DayLog, HealthDailySummary, RecoveryCheckIn } from "./types";
import { defaultSchedule, normalizeData, toBackup } from "./storage";
import { dayHasLogContent } from "./trainingHistory";

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
  status: "normal" | "attention" | "high";
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

export function mergeAppData(currentInput: AppData, incomingInput: AppData) {
  const currentWasEmpty = isEmptyWorkspace(currentInput);
  const current = normalizeData(currentInput);
  const incoming = normalizeData(incomingInput);
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

export function estimateDataFootprint(data: AppData): DataFootprint {
  const json = JSON.stringify(toBackup(data));
  const bytes = typeof TextEncoder === "undefined" ? json.length * 2 : new TextEncoder().encode(json).length;
  const megabytes = bytes / (1024 * 1024);
  return {
    bytes,
    kilobytes: Math.round(bytes / 1024),
    megabytes: Math.round(megabytes * 100) / 100,
    status: megabytes >= 4 ? "high" : megabytes >= 2.5 ? "attention" : "normal",
  };
}
