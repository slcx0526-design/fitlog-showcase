import {
  exerciseTrackId,
  normalizeExercisePrescription,
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

export function buildTrainingHistoryIndex(days: Record<string, DayLog>): TrainingHistoryIndex {
  const descendingDates = Object.keys(days).sort().reverse();
  const byExercise = new Map<string, IndexedExerciseHistory[]>();

  for (const date of descendingDates) {
    const workout = days[date].workout;
    if (!workout || workout.type === "rest") continue;
    const indexedExerciseIds = new Set<string>();
    for (const [exerciseIndex, rawExercise] of workout.exercises.entries()) {
      const sets = workingSets(rawExercise.sets);
      if (!sets.length || indexedExerciseIds.has(rawExercise.id)) continue;
      indexedExerciseIds.add(rawExercise.id);
      const exercise = normalizeExercisePrescription(rawExercise);
      const rows = byExercise.get(exercise.id) ?? [];
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
      byExercise.set(exercise.id, rows);
    }
  }

  return { days, descendingDates, byExercise };
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
    if (progressionTrackId && row.trackId === progressionTrackId) {
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
