import type { DayLog, Exercise, SetRecord, TrainingType, WorkoutSession } from "./types";
import {
  analyzeTrackTrend,
  exercisePrescription,
  exerciseTrackId,
  exerciseTrackLabel,
  normalizeExercisePrescription,
  trackPerformanceMetric,
  type TrackHistoryResult,
  type TrackPerformanceMetric,
  type TrackTrend,
} from "./prescription";
import {
  isHistoryEligibleWorkout,
  isPastUnclosedWorkout,
  summarizeExerciseWork,
  summarizeWorkoutWork,
  workingSets,
} from "./trainingMetrics";
import { summarizeSessionExecution } from "./trainingExecution";

export type WorkoutLogState = "completed" | "legacy" | "inProgress" | "unclosed" | "draft" | "rest";

export interface ExerciseTrackArchiveSession {
  date: string;
  type: TrainingType;
  exercise: Exercise;
  sets: SetRecord[];
  workingSetCount: number;
  completionCredits: number;
  mechanicalVolume: number;
  metric: TrackPerformanceMetric | null;
  history: TrackHistoryResult;
}

export interface ExerciseTrackArchiveRow {
  key: string;
  exerciseId: string;
  exerciseName: string;
  trackId: string;
  trackLabel: string;
  legacy: boolean;
  latestDate: string;
  sessions: ExerciseTrackArchiveSession[];
  sessionCount: number;
  implicitSessionCount: number;
  workingSetCount: number;
  completionCredits: number;
  bestMetric: TrackPerformanceMetric | null;
  trend: TrackTrend;
}

export interface TrainingWindowSummary {
  completedSessions: number;
  implicitSessions: number;
  legacySessions: number;
  workingSets: number;
  completionCredits: number;
  planCredits: number;
  plannedSets: number;
  completionPct: number | null;
  mechanicalVolume: number;
  trackedExercises: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function workoutLogState(
  workout: WorkoutSession | undefined,
  workoutDate?: string,
  referenceDate?: string
): WorkoutLogState | null {
  if (!workout) return null;
  const hasWork = workout.exercises.some((exercise) => workingSets(exercise.sets).length > 0);
  if (workout.type === "rest" && !hasWork) return "rest";
  if (workout.done === true && hasWork) return "completed";
  if (workout.done === false) {
    if (!hasWork) return "draft";
    return isPastUnclosedWorkout(workout, workoutDate, referenceDate) ? "unclosed" : "inProgress";
  }
  return hasWork ? "legacy" : "draft";
}

export function dayHasLogContent(day: DayLog | undefined) {
  if (!day) return false;
  const workout = day.workout;
  const hasWorkout = Boolean(workout);
  const hasNutrition = Boolean(day.nutrition && (
    day.nutrition.calories > 0 || day.nutrition.protein > 0 || day.nutrition.carbs > 0 || day.nutrition.fat > 0
  ));
  const hasCardio = Boolean(day.cardio?.some((entry) => entry.minutes > 0));
  const hasRecovery = Boolean(day.recovery);
  return hasWorkout || hasNutrition || hasCardio || hasRecovery;
}

export function daySearchText(day: DayLog | undefined) {
  if (!day) return "";
  const workout = day.workout;
  const workoutText = workout ? [
    workout.type,
    workout.difficulty,
    workout.done === true ? "completed 完成 已完成" : workout.done === false ? "in progress 进行中 草稿" : "legacy 旧记录",
    ...workout.exercises.flatMap((exercise) => [
      exercise.name,
      exerciseTrackLabel(exercise),
      exercisePrescription(exercise).trainingIntent,
      ...exercise.sets.flatMap((set) => [
        set.weight,
        set.reps,
        set.durationSeconds,
        set.distanceMeters,
        set.completion,
        set.technique,
      ]),
    ]),
  ] : [];
  const cardioText = (day.cardio ?? []).flatMap((entry) => [entry.mode, entry.note, entry.minutes, entry.zone]);
  const nutritionText = day.nutrition
    ? [day.nutrition.calories, day.nutrition.protein, day.nutrition.carbs, day.nutrition.fat]
    : [];
  const recoveryText = day.recovery
    ? ["recovery 状态 恢复", day.recovery.sleepHours, day.recovery.sleepQuality, day.recovery.energy, day.recovery.soreness, day.recovery.stress]
    : [];
  return [day.date, ...workoutText, ...cardioText, ...nutritionText, ...recoveryText]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
}

export function buildExerciseTrackArchive(
  days: Record<string, DayLog>,
  beforeDate = "9999-12-31",
  referenceDate = beforeDate.slice(0, 10),
): ExerciseTrackArchiveRow[] {
  const groups = new Map<string, ExerciseTrackArchiveRow>();
  const dates = Object.keys(days).filter((date) => date < beforeDate).sort().reverse();

  for (const date of dates) {
    const workout = days[date].workout;
    if (!isHistoryEligibleWorkout(workout, date, referenceDate) || !workout || workout.type === "rest") continue;
    const implicitCompletion = workout.done === false;
    for (const rawExercise of workout.exercises) {
      const sets = workingSets(rawExercise.sets);
      if (!sets.length) continue;
      const exercise = normalizeExercisePrescription(rawExercise);
      const trackId = exerciseTrackId(exercise);
      const key = `${exercise.id}::${trackId}`;
      const history: TrackHistoryResult = {
        date,
        exercise,
        sets,
        kind: trackId.startsWith("legacy:") ? "legacy" : "same",
        sessionDifficulty: workout.difficulty,
        implicitCompletion: implicitCompletion || undefined,
      };
      const summary = summarizeExerciseWork(exercise);
      const session: ExerciseTrackArchiveSession = {
        date,
        type: workout.type,
        exercise,
        sets,
        workingSetCount: summary.workingSets,
        completionCredits: summary.completionCredits,
        mechanicalVolume: summary.mechanicalVolume,
        metric: trackPerformanceMetric(history),
        history,
      };
      const current = groups.get(key) ?? {
        key,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        trackId,
        trackLabel: exerciseTrackLabel(exercise),
        legacy: trackId.startsWith("legacy:"),
        latestDate: date,
        sessions: [],
        sessionCount: 0,
        implicitSessionCount: 0,
        workingSetCount: 0,
        completionCredits: 0,
        bestMetric: null,
        trend: analyzeTrackTrend([]),
      };
      current.sessions.push(session);
      current.sessionCount += 1;
      if (implicitCompletion) current.implicitSessionCount += 1;
      current.workingSetCount += session.workingSetCount;
      current.completionCredits = round(current.completionCredits + session.completionCredits);
      const metric = session.metric;
      if (!implicitCompletion && metric && (!current.bestMetric || (metric.kind === current.bestMetric.kind && metric.value > current.bestMetric.value))) {
        current.bestMetric = metric;
      }
      groups.set(key, current);
    }
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      trend: analyzeTrackTrend(row.sessions.map((session) => session.history)),
    }))
    .sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.exerciseName.localeCompare(b.exerciseName));
}

export function filterExerciseTrackArchive(rows: ExerciseTrackArchiveRow[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => `${row.exerciseName} ${row.trackLabel} ${row.legacy ? "legacy 旧记录" : ""}`.toLowerCase().includes(needle));
}

export function summarizeTrainingWindow(days: Record<string, DayLog>, startDate: string, endDate: string): TrainingWindowSummary {
  const eligible = Object.entries(days)
    .filter(([date, day]) => date >= startDate && date <= endDate && isHistoryEligibleWorkout(day.workout, date, endDate));
  let implicitSessions = 0;
  let legacySessions = 0;
  let workingSetCount = 0;
  let completionCredits = 0;
  let planCredits = 0;
  let plannedSets = 0;
  let mechanicalVolume = 0;
  const tracks = new Set<string>();
  for (const [, day] of eligible) {
    const workout = day.workout!;
    if (workout.done === false) implicitSessions += 1;
    if (workout.done == null) legacySessions += 1;
    const execution = summarizeSessionExecution(workout);
    const work = summarizeWorkoutWork(workout);
    workingSetCount += execution.workingSets;
    completionCredits += execution.completionCredits;
    planCredits += execution.planCredits;
    plannedSets += execution.plannedSets;
    mechanicalVolume += work.mechanicalVolume;
    for (const exercise of workout.exercises) {
      if (workingSets(exercise.sets).length) tracks.add(`${exercise.id}::${exerciseTrackId(exercise)}`);
    }
  }
  return {
    completedSessions: eligible.length - implicitSessions,
    implicitSessions,
    legacySessions,
    workingSets: workingSetCount,
    completionCredits: round(completionCredits),
    planCredits: round(planCredits),
    plannedSets,
    completionPct: plannedSets ? Math.round((Math.min(plannedSets, planCredits) / plannedSets) * 100) : null,
    mechanicalVolume: Math.round(mechanicalVolume),
    trackedExercises: tracks.size,
  };
}
