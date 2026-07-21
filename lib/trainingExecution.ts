import type {
  Exercise,
  PerformanceMode,
  PlannedLoadOrigin,
  ProgressionPlanSnapshot,
  ProgressionSuggestionStatus,
  SetRecord,
  WorkoutSession,
} from "./types";
import { exercisePrescription, performanceValue } from "./prescription";
import {
  hasSetPerformance,
  plannedWorkingSets,
  progressionSets,
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

export interface PlannedLoadContext {
  origin: PlannedLoadOrigin;
  progressionTrackId?: string;
  acceptedAt?: string;
  sourceDate?: string;
  suggestedLoadKg?: number;
  suggestionStatus?: ProgressionSuggestionStatus;
}

export type ProgressionOutcomeStatus = "achieved" | "partial" | "missed" | "unassessable";
export type ProgressionOutcomeReason =
  | "achieved"
  | "partial"
  | "missed"
  | "noAcceptedSuggestion"
  | "manualPlan"
  | "referencePlan"
  | "workoutOpen"
  | "trackChanged"
  | "unsupportedMode"
  | "noComparableSets";

export interface ProgressionOutcome {
  status: ProgressionOutcomeStatus;
  reason: ProgressionOutcomeReason;
  requiredSets: number;
  completedSets: number;
  setsAtPlannedLoad: number;
  setsAtTargetFloor: number;
  allAtTargetTop: boolean;
  plannedLoadKg: number | null;
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

/**
 * Applying a planned load is an explicit user action. It may fill untouched
 * draft rows, but it never rewrites performed, skipped, warm-up, or technique
 * work and never overwrites a manually chosen draft load.
 */
export function applyExercisePlannedLoad(
  exercise: Exercise,
  weight?: number,
  context?: PlannedLoadContext,
): Exercise {
  const normalized = weight != null && Number.isFinite(weight) && weight > 0
    ? Math.round(weight * 100) / 100
    : undefined;
  if (normalized == null) {
    const { progressionPlan: _plan, ...rest } = exercise;
    return { ...rest, plannedLoadKg: undefined };
  }
  const previous = exercise.plannedLoadKg;
  const prescription = exercisePrescription(exercise);
  const progressionPlan: ProgressionPlanSnapshot = {
    origin: context?.origin ?? "manual",
    acceptedAt: context?.acceptedAt ?? new Date().toISOString(),
    progressionTrackId: context?.progressionTrackId ?? prescription.progressionTrackId,
    plannedLoadKg: normalized,
    ...(context?.sourceDate ? { sourceDate: context.sourceDate } : {}),
    ...(context?.suggestedLoadKg != null && context.suggestedLoadKg > 0
      ? { suggestedLoadKg: Math.round(context.suggestedLoadKg * 100) / 100 }
      : {}),
    ...(context?.suggestionStatus ? { suggestionStatus: context.suggestionStatus } : {}),
  };
  return {
    ...exercise,
    plannedLoadKg: normalized,
    progressionPlan,
    sets: exercise.sets.map((set) => {
      const standardDraft = !hasSetPerformance(set)
        && set.type !== "warmup"
        && set.completion !== "skipped"
        && (set.technique == null || set.technique === "normal");
      const followsPreviousPlan = previous != null && Math.abs(set.weight - previous) < 0.001;
      if (!standardDraft || (set.weight > 0 && !followsPreviousPlan)) return set;
      return { ...set, weight: normalized };
    }),
  };
}

/**
 * Evaluates an explicitly accepted load against confirmed, comparable work.
 * This never changes the recorded sets and never treats a manual load as a
 * system recommendation outcome.
 */
export function evaluateProgressionOutcome(
  exercise: Exercise,
  workout?: Pick<WorkoutSession, "done" | "difficulty" | "cyclePhase">,
): ProgressionOutcome {
  const prescription = exercisePrescription(exercise);
  const requiredSets = Math.max(1, prescription.workingSets);
  const plan = exercise.progressionPlan;
  const empty = (
    reason: ProgressionOutcomeReason,
    plannedLoadKg: number | null = plan?.plannedLoadKg ?? exercise.plannedLoadKg ?? null,
  ): ProgressionOutcome => ({
    status: "unassessable",
    reason,
    requiredSets,
    completedSets: 0,
    setsAtPlannedLoad: 0,
    setsAtTargetFloor: 0,
    allAtTargetTop: false,
    plannedLoadKg,
  });

  if (!plan) return empty("noAcceptedSuggestion");
  if (plan.origin === "manual") return empty("manualPlan");
  if (plan.origin === "reference") return empty("referencePlan");
  if (workout?.done !== true) return empty("workoutOpen");
  if (plan.progressionTrackId !== prescription.progressionTrackId) return empty("trackChanged");
  if ((prescription.performanceMode ?? "reps") !== "reps" || workout.cyclePhase === "deload") {
    return empty("unsupportedMode");
  }

  const completed = progressionSets(exercise.sets);
  if (!completed.length) return empty("noComparableSets");
  const atLoad = completed.filter((set) => Math.abs(set.weight - plan.plannedLoadKg) <= 0.05);
  const counted = atLoad.slice(0, requiredSets);
  const values = counted.map((set) => performanceValue(set, "reps"));
  const setsAtTargetFloor = values.filter((value) => value >= prescription.targetRepMin).length;
  const achieved = counted.length >= requiredSets && setsAtTargetFloor >= requiredSets;
  const allAtTargetTop = achieved && values.every((value) => value >= prescription.targetRepMax);
  const status: ProgressionOutcomeStatus = achieved
    ? "achieved"
    : setsAtTargetFloor > 0 || counted.length >= Math.ceil(requiredSets / 2)
      ? "partial"
      : "missed";
  return {
    status,
    reason: status,
    requiredSets,
    completedSets: completed.length,
    setsAtPlannedLoad: atLoad.length,
    setsAtTargetFloor,
    allAtTargetTop,
    plannedLoadKg: plan.plannedLoadKg,
  };
}
