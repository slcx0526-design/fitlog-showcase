import type { Exercise, SetRecord, WorkoutSession } from "./types";

export interface ExerciseWorkSummary {
  recordedSets: number;
  workingSets: number;
  completionCredits: number;
  plannedSets: number;
  rehabSets: number;
  draftSets: number;
  mechanicalVolume: number;
}

export interface WorkoutWorkSummary extends ExerciseWorkSummary {
  exercisesWithWork: number;
  completionPct: number | null;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function hasSetPerformance(set: SetRecord) {
  return (
    Math.max(0, set.reps ?? 0) > 0 ||
    Math.max(0, set.durationSeconds ?? 0) > 0 ||
    Math.max(0, set.distanceMeters ?? 0) > 0
  );
}

export function isRehabSet(set: SetRecord) {
  return (
    set.type !== "warmup" &&
    set.completion !== "skipped" &&
    set.technique === "rehab" &&
    hasSetPerformance(set)
  );
}

export function isValidWorkingSet(set: SetRecord) {
  return (
    set.type !== "warmup" &&
    set.completion !== "skipped" &&
    set.technique !== "rehab" &&
    hasSetPerformance(set)
  );
}

export function workingSets(sets: SetRecord[]) {
  return sets.filter(isValidWorkingSet);
}

/** Comparable standard sets only. Partial or intensity-technique sets cannot trigger progression. */
export function isProgressionEligibleSet(set: SetRecord) {
  return (
    isValidWorkingSet(set) &&
    set.completion !== "partial" &&
    (set.technique === undefined || set.technique === "normal")
  );
}

export function progressionSets(sets: SetRecord[]) {
  return sets.filter(isProgressionEligibleSet);
}

/** Credit used for plan completion. A partial set is half complete; techniques do not change adherence. */
export function setCompletionCredit(set: SetRecord) {
  if (!isValidWorkingSet(set)) return 0;
  return set.completion === "partial" ? 0.5 : 1;
}

/** Estimated recovery/stimulus cost used by muscle-volume calculations. */
export function setStimulusFactor(set: SetRecord) {
  const completion = setCompletionCredit(set);
  if (!completion) return 0;
  let factor = completion;
  if (set.technique === "technique") factor = Math.min(factor, 0.25);
  if (set.technique === "dropSet" || set.technique === "restPause" || set.technique === "myoReps") {
    factor *= 1.25;
  }
  return round(Math.min(1.5, Math.max(0, factor)));
}

export function mechanicalVolumeForSet(set: SetRecord) {
  return isValidWorkingSet(set)
    ? Math.max(0, set.weight) * Math.max(0, set.reps)
    : 0;
}

export function plannedWorkingSets(exercise: Exercise) {
  return Math.max(
    0,
    Math.round(
      exercise.prescription?.workingSets ??
        exercise.planned?.sets ??
        exercise.workingSets ??
        0
    )
  );
}

export function summarizeExerciseWork(exercise: Exercise): ExerciseWorkSummary {
  const valid = workingSets(exercise.sets);
  return {
    recordedSets: exercise.sets.filter(hasSetPerformance).length,
    workingSets: valid.length,
    completionCredits: round(valid.reduce((sum, set) => sum + setCompletionCredit(set), 0)),
    plannedSets: plannedWorkingSets(exercise),
    rehabSets: exercise.sets.filter(isRehabSet).length,
    draftSets: exercise.sets.filter((set) => !hasSetPerformance(set)).length,
    mechanicalVolume: Math.round(exercise.sets.reduce((sum, set) => sum + mechanicalVolumeForSet(set), 0)),
  };
}

export function summarizeWorkoutWork(workout?: WorkoutSession): WorkoutWorkSummary {
  if (!workout || workout.type === "rest") {
    return {
      recordedSets: 0,
      workingSets: 0,
      completionCredits: 0,
      plannedSets: 0,
      rehabSets: 0,
      draftSets: 0,
      mechanicalVolume: 0,
      exercisesWithWork: 0,
      completionPct: null,
    };
  }
  const rows = workout.exercises.map(summarizeExerciseWork);
  const plannedSets = rows.reduce((sum, row) => sum + row.plannedSets, 0);
  const completionCredits = round(
    rows.reduce(
      (sum, row) => sum + (row.plannedSets ? Math.min(row.plannedSets, row.completionCredits) : 0),
      0
    )
  );
  return {
    recordedSets: rows.reduce((sum, row) => sum + row.recordedSets, 0),
    workingSets: rows.reduce((sum, row) => sum + row.workingSets, 0),
    completionCredits,
    plannedSets,
    rehabSets: rows.reduce((sum, row) => sum + row.rehabSets, 0),
    draftSets: rows.reduce((sum, row) => sum + row.draftSets, 0),
    mechanicalVolume: rows.reduce((sum, row) => sum + row.mechanicalVolume, 0),
    exercisesWithWork: rows.filter((row) => row.workingSets > 0).length,
    completionPct: plannedSets
      ? Math.round((Math.min(plannedSets, completionCredits) / plannedSets) * 100)
      : null,
  };
}

export function hasRecordedTrainingWork(workout?: WorkoutSession) {
  return Boolean(workout && workout.type !== "rest" && summarizeWorkoutWork(workout).workingSets > 0);
}

export function isPastUnclosedWorkout(
  workout?: WorkoutSession,
  workoutDate?: string,
  referenceDate?: string
) {
  return Boolean(
    workout &&
      workout.done === false &&
      workoutDate &&
      referenceDate &&
      workoutDate < referenceDate &&
      hasRecordedTrainingWork(workout)
  );
}

export function isHistoryEligibleWorkout(
  workout?: WorkoutSession,
  workoutDate?: string,
  referenceDate?: string
) {
  return Boolean(
    workout &&
      hasRecordedTrainingWork(workout) &&
      (workout.done !== false || isPastUnclosedWorkout(workout, workoutDate, referenceDate))
  );
}
