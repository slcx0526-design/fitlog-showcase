import type { Exercise, PerformanceMode, SetRecord, WorkoutSession } from "./types";
import {
  plannedWorkingSets,
  summarizeExerciseWork,
} from "./trainingMetrics";

export interface ExerciseExecutionState {
  exercise: Exercise;
  plannedSets: number;
  workingSets: number;
  completionCredits: number;
  creditedSets: number;
  remainingSets: number;
}

export interface SessionExecutionState {
  rows: ExerciseExecutionState[];
  plannedSets: number;
  workingSets: number;
  completionCredits: number;
  planCredits: number;
  remainingSets: number;
  completionPct: number | null;
  next: ExerciseExecutionState | null;
  needsFinishConfirmation: boolean;
}

export interface NextSetDraftInput {
  performanceMode: PerformanceMode;
  recordsWeight: boolean;
  carry?: SetRecord | null;
  plannedLoadKg?: number;
  blank?: boolean;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function formatSetCredit(value: number) {
  const rounded = round(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function summarizeSessionExecution(workout?: WorkoutSession): SessionExecutionState {
  if (!workout || workout.type === "rest") {
    return {
      rows: [],
      plannedSets: 0,
      workingSets: 0,
      completionCredits: 0,
      planCredits: 0,
      remainingSets: 0,
      completionPct: null,
      next: null,
      needsFinishConfirmation: false,
    };
  }

  const rows = workout.exercises.map((exercise) => {
    const summary = summarizeExerciseWork(exercise);
    const plannedSets = plannedWorkingSets(exercise);
    const completionCredits = summary.completionCredits;
    const creditedSets = plannedSets
      ? Math.min(plannedSets, completionCredits)
      : 0;
    return {
      exercise,
      plannedSets,
      workingSets: summary.workingSets,
      completionCredits,
      creditedSets: round(creditedSets),
      remainingSets: round(Math.max(0, plannedSets - creditedSets)),
    };
  });
  const plannedSets = rows.reduce((sum, row) => sum + row.plannedSets, 0);
  const completionCredits = round(rows.reduce((sum, row) => sum + row.completionCredits, 0));
  const planCredits = round(rows.reduce(
    (sum, row) => sum + (row.plannedSets > 0 ? row.creditedSets : 0),
    0
  ));
  const workingSetCount = rows.reduce((sum, row) => sum + row.workingSets, 0);
  const remainingSets = round(Math.max(0, plannedSets - planCredits));
  const next = rows.find((row) => row.remainingSets > 0)
    ?? rows.find((row) => row.workingSets === 0)
    ?? null;

  return {
    rows,
    plannedSets,
    workingSets: workingSetCount,
    completionCredits,
    planCredits,
    remainingSets,
    completionPct: plannedSets
      ? Math.round((Math.min(plannedSets, planCredits) / plannedSets) * 100)
      : null,
    next,
    needsFinishConfirmation: plannedSets > 0 && planCredits < plannedSets,
  };
}

/**
 * A newly added row is always a draft. Load may be carried forward as planning
 * context, but performed reps, duration, or distance must be entered again.
 */
export function createNextSetDraft({
  performanceMode,
  recordsWeight,
  carry,
  plannedLoadKg,
  blank = false,
}: NextSetDraftInput): SetRecord {
  const weight = !blank && recordsWeight
    ? Math.max(0, plannedLoadKg ?? carry?.weight ?? 0)
    : 0;
  const base: SetRecord = {
    weight,
    reps: 0,
    type: "working",
    completion: "completed",
    technique: "normal",
  };
  if (performanceMode === "duration") return { ...base, durationSeconds: 0 };
  if (performanceMode === "distance") return { ...base, distanceMeters: 0 };
  return base;
}
