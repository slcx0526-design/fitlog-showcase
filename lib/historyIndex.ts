import {
  exerciseTrackId,
  normalizeExercisePrescription,
  progressionTrackIdsMatch,
  type TrackHistoryCollection,
  type TrackHistoryResult,
} from "./prescription";
import { workingSets } from "./trainingMetrics";
import type { DayLog, Exercise, NutritionLog, TrainingType } from "./types";

interface IndexedExerciseHistory extends TrackHistoryResult {
  trackId: string;
  confirmed: boolean;
}

export interface TrainingHistoryIndex {
  days: Record<string, DayLog>;
  descendingDates: string[];
  byExercise: ReadonlyMap<string, IndexedExerciseHistory[]>;
  byDate: ReadonlyMap<string, IndexedExerciseHistory[]>;
}

function historyResult(row: IndexedExerciseHistory, kind: TrackHistoryResult["kind"]): TrackHistoryResult {
  return {
    date: row.date,
    exercise: row.exercise,
    sets: row.sets,
    kind,
    sessionDifficulty: row.sessionDifficulty,
    exercisePosition: row.exercisePosition,
    exerciseCount: row.exerciseCount,
    implicitCompletion: row.implicitCompletion,
  };
}

function indexTrainingDay(date: string, day: DayLog): IndexedExerciseHistory[] {
  const workout = day.workout;
  if (!workout || workout.type === "rest") return [];
  const indexedExerciseIds = new Set<string>();
  const rows: IndexedExerciseHistory[] = [];
  for (const [exerciseIndex, rawExercise] of workout.exercises.entries()) {
    const sets = workingSets(rawExercise.sets);
    if (!sets.length || indexedExerciseIds.has(rawExercise.id)) continue;
    indexedExerciseIds.add(rawExercise.id);
    const exercise = normalizeExercisePrescription(rawExercise);
    rows.push({
      date,
      exercise,
      sets,
      trackId: exerciseTrackId(exercise),
      kind: "other",
      confirmed: workout.done !== false,
      sessionDifficulty: workout.difficulty,
      exercisePosition: exerciseIndex + 1,
      exerciseCount: workout.exercises.length,
      implicitCompletion: workout.done === false ? true : undefined,
    });
  }
  return rows;
}

export function buildTrainingHistoryIndex(days: Record<string, DayLog>): TrainingHistoryIndex {
  const descendingDates = Object.keys(days).sort().reverse();
  const byExercise = new Map<string, IndexedExerciseHistory[]>();
  const byDate = new Map<string, IndexedExerciseHistory[]>();

  for (const date of descendingDates) {
    const rows = indexTrainingDay(date, days[date]);
    byDate.set(date, rows);
    for (const row of rows) {
      const exerciseRows = byExercise.get(row.exercise.id) ?? [];
      exerciseRows.push(row);
      byExercise.set(row.exercise.id, exerciseRows);
    }
  }

  return { days, descendingDates, byExercise, byDate };
}

export function updateTrainingHistoryIndex(
  previous: TrainingHistoryIndex,
  days: Record<string, DayLog>,
): TrainingHistoryIndex {
  if (previous.days === days) return previous;

  const previousDates = Object.keys(previous.days);
  const nextDates = Object.keys(days);
  const allDates = new Set([...previousDates, ...nextDates]);
  const changedDates = [...allDates].filter((date) => previous.days[date] !== days[date]);
  if (!changedDates.length) return { ...previous, days };

  const totalDates = Math.max(previousDates.length, nextDates.length, 1);
  if (changedDates.length > 64 && changedDates.length / totalDates > 0.2) {
    return buildTrainingHistoryIndex(days);
  }

  const changed = new Set(changedDates);
  const byDate = new Map(previous.byDate);
  const affectedExerciseIds = new Set<string>();
  for (const date of changedDates) {
    for (const row of previous.byDate.get(date) ?? []) affectedExerciseIds.add(row.exercise.id);
    const day = days[date];
    if (!day) {
      byDate.delete(date);
      continue;
    }
    const rows = indexTrainingDay(date, day);
    byDate.set(date, rows);
    for (const row of rows) affectedExerciseIds.add(row.exercise.id);
  }

  const byExercise = new Map(previous.byExercise);
  for (const exerciseId of affectedExerciseIds) {
    const rows = [
      ...(previous.byExercise.get(exerciseId) ?? []).filter((row) => !changed.has(row.date)),
      ...changedDates.flatMap((date) => (byDate.get(date) ?? []).filter((row) => row.exercise.id === exerciseId)),
    ].sort((left, right) => right.date.localeCompare(left.date));
    if (rows.length) byExercise.set(exerciseId, rows);
    else byExercise.delete(exerciseId);
  }

  const dateKeysChanged = previousDates.length !== nextDates.length
    || previousDates.some((date) => !Object.prototype.hasOwnProperty.call(days, date));
  return {
    days,
    descendingDates: dateKeysChanged ? nextDates.sort().reverse() : previous.descendingDates,
    byExercise,
    byDate,
  };
}

export function createTrainingHistoryIndexCache() {
  let current: TrainingHistoryIndex | null = null;
  return (days: Record<string, DayLog>) => {
    current = current
      ? updateTrainingHistoryIndex(current, days)
      : buildTrainingHistoryIndex(days);
    return current;
  };
}

export function findIndexedTrackHistories(
  index: TrainingHistoryIndex,
  exerciseId: string,
  beforeDate: string,
  progressionTrackId?: string,
  limit = 8,
): TrackHistoryCollection {
  const confirmed: TrackHistoryCollection = { same: [], other: [], legacy: [] };
  const fallback: TrackHistoryCollection = { same: [], other: [], legacy: [] };

  for (const row of index.byExercise.get(exerciseId) ?? []) {
    if (row.date >= beforeDate) continue;
    const target = row.confirmed ? confirmed : fallback;
    if (progressionTrackId && progressionTrackIdsMatch(row.trackId, progressionTrackId, exerciseId)) {
      if (target.same.length < limit) target.same.push(historyResult(row, "same"));
    } else if (row.trackId.startsWith("legacy:")) {
      if (target.legacy.length < limit) target.legacy.push(historyResult(row, "legacy"));
    } else if (row.trackId !== progressionTrackId) {
      if (target.other.length < limit) target.other.push(historyResult(row, "other"));
    }
  }

  return {
    same: [...confirmed.same, ...fallback.same].slice(0, limit),
    other: [...confirmed.other, ...fallback.other].slice(0, limit),
    legacy: [...confirmed.legacy, ...fallback.legacy].slice(0, limit),
  };
}

export function findIndexedLastNutrition(index: TrainingHistoryIndex, beforeDate: string): NutritionLog | null {
  for (const date of index.descendingDates) {
    if (date >= beforeDate) continue;
    const nutrition = index.days[date].nutrition;
    if (nutrition && (nutrition.calories || nutrition.protein || nutrition.carbs || nutrition.fat)) return nutrition;
  }
  return null;
}

export function findIndexedLastWorkoutByType(
  index: TrainingHistoryIndex,
  type: TrainingType,
  beforeDate: string,
): { date: string; exercises: Exercise[] } | null {
  for (const date of index.descendingDates) {
    if (date >= beforeDate) continue;
    const workout = index.days[date].workout;
    if (!workout || workout.type !== type || workout.done === false) continue;
    const exercises = workout.exercises.filter((exercise) => workingSets(exercise.sets).length > 0);
    if (exercises.length) return { date, exercises };
  }
  return null;
}
